import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';

let customRazorpayInstance = null;

/**
 * Dependency injection hook for testing offline without live network or secrets.
 */
export const setRazorpayInstance = (instance) => {
  customRazorpayInstance = instance;
};

export const getRazorpayInstance = () => {
  if (customRazorpayInstance) {
    return customRazorpayInstance;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

/**
 * Pure helper to verify checkout signature using timing-safe comparison.
 */
export const verifyCheckoutSignature = (razorpayOrderId, razorpayPaymentId, signature, secret) => {
  if (!razorpayOrderId || !razorpayPaymentId || !signature || !secret) {
    return false;
  }
  const payload = razorpayOrderId + '|' + razorpayPaymentId;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
};

/**
 * Pure helper to verify webhook raw-body signature using timing-safe comparison.
 * Requires rawBody to be a valid Buffer.
 */
export const verifyWebhookSignature = (rawBody, signature, secret) => {
  if (!rawBody || !signature || !secret) {
    return false;
  }
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(bodyBuf)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
};

/**
 * POST /api/create-order
 * Create a Razorpay order from an existing customer order.
 * - Money units: order.pricing.grandTotal is in Rupees.
 * - Correct conversion: amountInPaise = Math.round(grandTotal * 100).
 * - Strict rejection of invalid, non-positive, NaN, or unsafe amounts.
 * - Concurrency safety: Acquires a durable atomic creation claim BEFORE calling Razorpay orders.create.
 *   Concurrent requests do not both call the provider; they await and reuse the winner's linked order.
/**
 * Determines whether a provider error is a proven, definitive rejection.
 * Timeouts, connection resets, network drops, malformed responses, and 5xx errors
 * are ambiguous (the provider may have processed creation before dropping connection).
 * Only definitive 4xx rejections (excluding 408 Request Timeout and 429 Too Many Requests)
 * prove that no order could have been created.
 */
export const isDefinitiveProviderRejection = (err) => {
  if (!err) return false;
  const networkErrorCodes = [
    'ETIMEDOUT',
    'ESOCKETTIMEDOUT',
    'ECONNRESET',
    'ECONNABORTED',
    'ECONNREFUSED',
    'EPIPE',
    'EHOSTUNREACH',
    'EAI_AGAIN',
    'ENOTFOUND'
  ];
  if (err.code && networkErrorCodes.includes(err.code)) {
    return false;
  }
  const msg = (err.message || '').toLowerCase();
  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('connreset') ||
    msg.includes('connection reset') ||
    msg.includes('socket hang up') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  ) {
    return false;
  }

  const statusCode = err.statusCode || err.status;
  if (typeof statusCode === 'number') {
    if (statusCode >= 400 && statusCode < 500 && statusCode !== 408 && statusCode !== 429) {
      return true;
    }
  }

  return false;
};

/**
 * POST /api/create-order
 * Create a Razorpay order from an existing customer order.
 * - Money units: order.pricing.grandTotal is in Rupees.
 * - Correct conversion: amountInPaise = Math.round(grandTotal * 100).
 * - Strict rejection of invalid, non-positive, NaN, or unsafe amounts.
 * - Durable 2-phase state machine:
 *     1. Atomically acquire CLAIMED state.
 *     2. Persist explicit DISPATCHING state BEFORE calling provider orders.create.
 *        Only the owner whose guarded DISPATCHING update succeeds may call the provider.
 * - An expired DISPATCHING claim NEVER automatically allows another orders.create call.
 *   Returns GATEWAY_RECONCILIATION_REQUIRED until reconciled.
 * - An expired CLAIMED state may be retried only if provider dispatch could not have started.
 * - Ambiguous outcomes (timeouts, connection resets, 5xx, malformed responses, unknown errors)
 *   are quarantined to RECONCILIATION_REQUIRED. Released to IDLE only for proven definitive rejections.
 * - All linking, cleanup, and quarantine updates are strictly guarded by claim ownership and state.
 */
export const createRazorpayOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.user?.id || req.user?._id;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    const order = await Order.findOne({ _id: orderId, customer: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const grandTotalRupees = order.pricing?.grandTotal;
    if (
      typeof grandTotalRupees !== 'number' ||
      !Number.isFinite(grandTotalRupees) ||
      grandTotalRupees <= 0
    ) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_AMOUNT',
        message: 'Order grandTotal must be a positive valid number'
      });
    }

    const amountInPaise = Math.round(grandTotalRupees * 100);
    // Sanity check: must be a safe positive integer and not exceed ₹1 crore
    if (
      !Number.isSafeInteger(amountInPaise) ||
      amountInPaise <= 0 ||
      amountInPaise > 1000000000
    ) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_AMOUNT',
        message: 'Calculated payment amount in paise is invalid or unsafe'
      });
    }

    if (order.payment?.status === 'PAID' || order.payment?.verified === true) {
      return res.status(400).json({
        success: false,
        code: 'ORDER_ALREADY_PAID',
        message: 'Order is already paid'
      });
    }

    if (order.payment?.status === 'REFUNDED') {
      return res.status(400).json({
        success: false,
        code: 'PAYMENT_ALREADY_REFUNDED',
        message: 'Order has already been refunded. Cannot create payment order.'
      });
    }

    // 1. Check if order is flagged as requiring reconciliation from an ambiguous previous outcome
    if (order.payment?.creationState === 'RECONCILIATION_REQUIRED') {
      return res.status(409).json({
        success: false,
        code: 'GATEWAY_RECONCILIATION_REQUIRED',
        message: 'Payment gateway reconciliation required for this order. Automatic duplicate creation is blocked.'
      });
    }

    // 2. An expired DISPATCHING claim must NEVER automatically allow another orders.create call.
    // Return GATEWAY_RECONCILIATION_REQUIRED until reconciled.
    const now = new Date();
    if (order.payment?.creationState === 'DISPATCHING') {
      const observedClaimId = order.payment.creationClaimId;
      const isExpired = order.payment.creationClaimExpiresAt && new Date(order.payment.creationClaimExpiresAt) <= now;
      if (isExpired) {
        let qResult = null;
        try {
          qResult = await Order.findOneAndUpdate(
            {
              _id: order._id,
              'payment.creationClaimId': observedClaimId,
              'payment.creationState': 'DISPATCHING',
              'payment.creationClaimExpiresAt': { $lte: now }
            },
            {
              $set: {
                'payment.creationState': 'RECONCILIATION_REQUIRED',
                'payment.creationClaimId': null,
                'payment.creationClaimExpiresAt': null
              }
            },
            { new: true }
          );
        } catch (quarantineErr) {
          console.error('[CreateRazorpayOrder] Failed to persist quarantine for expired DISPATCHING:', quarantineErr.message);
        }
        if (qResult) {
          return res.status(409).json({
            success: false,
            code: 'GATEWAY_RECONCILIATION_REQUIRED',
            message: 'Previous payment creation attempt expired during dispatch. Manual or gateway reconciliation required.'
          });
        }
        // If qResult is null, the observed claim was renewed or modified concurrently.
        // Re-read fresh order to avoid acting on a stale read.
        const recheck = await Order.findOne({ _id: orderId, customer: userId });
        if (!recheck) {
          return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Check PAID, REFUNDED and RECONCILIATION_REQUIRED BEFORE returning a linked gateway order!
        if (recheck.payment?.status === 'PAID' || recheck.payment?.verified === true) {
          return res.status(400).json({
            success: false,
            code: 'ORDER_ALREADY_PAID',
            message: 'Order is already paid'
          });
        }
        if (recheck.payment?.status === 'REFUNDED') {
          return res.status(400).json({
            success: false,
            code: 'PAYMENT_ALREADY_REFUNDED',
            message: 'Order has already been refunded'
          });
        }
        if (recheck.payment?.creationState === 'RECONCILIATION_REQUIRED') {
          return res.status(409).json({
            success: false,
            code: 'GATEWAY_RECONCILIATION_REQUIRED',
            message: 'Payment gateway reconciliation required for this order.'
          });
        }

        const freshTotalRupees = recheck.pricing?.grandTotal ?? grandTotalRupees;
        const freshAmountInPaise = Math.round(freshTotalRupees * 100);

        if (recheck.payment?.razorpayOrderId) {
          return res.json({
            success: true,
            razorpay_order_id: recheck.payment.razorpayOrderId,
            amount: freshAmountInPaise,
            key_id: process.env.RAZORPAY_KEY_ID,
          });
        }
        if (recheck.payment?.creationState === 'DISPATCHING') {
          return res.status(409).json({
            success: false,
            code: 'CONCURRENT_CREATION_IN_PROGRESS',
            message: 'A payment order creation is actively in progress with a renewed lease.'
          });
        }
      }
    }

    // Reuse existing linked gateway order if already present (0 provider calls)
    if (order.payment?.razorpayOrderId) {
      return res.json({
        success: true,
        razorpay_order_id: order.payment.razorpayOrderId,
        amount: amountInPaise,
        key_id: process.env.RAZORPAY_KEY_ID,
      });
    }

    // Phase 1: Acquire durable atomic creation claim in CLAIMED state.
    // An expired CLAIMED state may be retried only if provider dispatch could not have started.
    // Expired DISPATCHING state must NEVER be matched here!
    const claimId = crypto.randomUUID();
    const claimDurationMs = 30000; // 30-second claim lease
    const claimExpiresAt = new Date(now.getTime() + claimDurationMs);

    const claimedDoc = await Order.findOneAndUpdate(
      {
        _id: order._id,
        customer: userId,
        'payment.status': { $nin: ['PAID', 'REFUNDED'] },
        $or: [
          { 'payment.razorpayOrderId': { $exists: false } },
          { 'payment.razorpayOrderId': null },
          { 'payment.razorpayOrderId': '' }
        ],
        $and: [
          {
            $or: [
              { 'payment.creationState': { $in: ['IDLE', null] } },
              { 'payment.creationState': { $exists: false } },
              {
                'payment.creationState': 'CLAIMED',
                'payment.creationClaimExpiresAt': { $lt: now }
              }
            ]
          }
        ]
      },
      {
        $set: {
          'payment.creationClaimId': claimId,
          'payment.creationClaimExpiresAt': claimExpiresAt,
          'payment.creationState': 'CLAIMED'
        }
      },
      { new: true }
    );

    // If claim could not be acquired, another request is either actively creating or just finished
    if (!claimedDoc) {
      // Bounded wait loop to allow the active claim winner to link the order
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        const fresh = await Order.findOne({ _id: order._id, customer: userId });
        if (!fresh) {
          return res.status(404).json({ success: false, message: 'Order not found' });
        }
        // Check PAID, REFUNDED and RECONCILIATION_REQUIRED BEFORE returning a linked gateway order!
        if (fresh.payment?.status === 'PAID' || fresh.payment?.verified === true) {
          return res.status(400).json({ success: false, code: 'ORDER_ALREADY_PAID', message: 'Order is already paid' });
        }
        if (fresh.payment?.status === 'REFUNDED') {
          return res.status(400).json({ success: false, code: 'PAYMENT_ALREADY_REFUNDED', message: 'Order has already been refunded' });
        }
        if (fresh.payment?.creationState === 'RECONCILIATION_REQUIRED') {
          return res.status(409).json({
            success: false,
            code: 'GATEWAY_RECONCILIATION_REQUIRED',
            message: 'Payment gateway reconciliation required for this order.'
          });
        }
        if (fresh.payment?.razorpayOrderId) {
          const freshAmount = fresh.pricing?.grandTotal ? Math.round(fresh.pricing.grandTotal * 100) : amountInPaise;
          return res.json({
            success: true,
            razorpay_order_id: fresh.payment.razorpayOrderId,
            amount: freshAmount,
            key_id: process.env.RAZORPAY_KEY_ID,
          });
        }
        if (fresh.payment?.creationState === 'DISPATCHING') {
          const freshClaimId = fresh.payment.creationClaimId;
          const freshExpiresAt = fresh.payment.creationClaimExpiresAt;
          const freshExpired = freshExpiresAt && new Date(freshExpiresAt) <= new Date();
          if (freshExpired) {
            const quarantineNow = new Date();
            let qResult = null;
            try {
              qResult = await Order.findOneAndUpdate(
                {
                  _id: order._id,
                  'payment.creationClaimId': freshClaimId,
                  'payment.creationState': 'DISPATCHING',
                  'payment.creationClaimExpiresAt': { $lte: quarantineNow }
                },
                {
                  $set: {
                    'payment.creationState': 'RECONCILIATION_REQUIRED',
                    'payment.creationClaimId': null,
                    'payment.creationClaimExpiresAt': null
                  }
                },
                { new: true }
              );
            } catch (qErr) {
              console.error('[CreateRazorpayOrder] Failed to persist quarantine for expired DISPATCHING during wait:', qErr.message);
            }
            if (qResult) {
              return res.status(409).json({
                success: false,
                code: 'GATEWAY_RECONCILIATION_REQUIRED',
                message: 'A previous payment provider request expired during dispatch. Reconciliation is required before retry.'
              });
            }
            // If qResult is null, the observed claim was renewed between check and update.
            // Continue the wait loop to observe the renewed claim.
            continue;
          }
        }
      }

      return res.status(409).json({
        success: false,
        code: 'CONCURRENT_CREATION_IN_PROGRESS',
        message: 'A payment order creation is already in progress. Please retry momentarily.'
      });
    }

    // Phase 2: Persist explicit durable DISPATCHING state BEFORE calling orders.create.
    // ONLY the owner whose guarded DISPATCHING update succeeds may call the provider.
    const dispatchingDoc = await Order.findOneAndUpdate(
      {
        _id: order._id,
        customer: userId,
        'payment.creationClaimId': claimId,
        'payment.creationState': 'CLAIMED',
        'payment.status': { $nin: ['PAID', 'REFUNDED'] }
      },
      {
        $set: {
          'payment.creationState': 'DISPATCHING'
        }
      },
      { new: true }
    );

    if (!dispatchingDoc) {
      // Guarded DISPATCHING transition failed (e.g. claim lost, expired, or state modified)
      // DO NOT CALL THE PROVIDER!
      return res.status(409).json({
        success: false,
        code: 'CREATION_CLAIM_LOST',
        message: 'Order creation lease was lost before provider dispatch could begin.'
      });
    }

    // Phase 3: We hold the confirmed DISPATCHING lease. Invoke provider.
    const razorpayInstance = getRazorpayInstance();
    let razorpayOrder;
    try {
      razorpayOrder = await razorpayInstance.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `order_${order._id}`,
      });
    } catch (providerErr) {
      console.error('[CreateRazorpayOrder] Gateway error:', providerErr.message);

      // Check whether this error is a proven definitive rejection
      if (isDefinitiveProviderRejection(providerErr)) {
        // Definitive refusal from gateway without creating an order.
        // Release claim back to IDLE guarded by claim ownership and DISPATCHING state.
        try {
          await Order.findOneAndUpdate(
            {
              _id: order._id,
              'payment.creationClaimId': claimId,
              'payment.creationState': 'DISPATCHING'
            },
            {
              $set: {
                'payment.creationClaimId': null,
                'payment.creationClaimExpiresAt': null,
                'payment.creationState': 'IDLE'
              }
            }
          );
        } catch (releaseErr) {
          console.error('[CreateRazorpayOrder] Failed to release claim to IDLE on definitive rejection:', releaseErr.message);
        }

        return res.status(providerErr.statusCode || 400).json({
          success: false,
          code: 'GATEWAY_CREATION_FAILED',
          message: providerErr.error?.description || providerErr.message || 'Payment gateway rejected order creation'
        });
      }

      // Ambiguous provider error: timeout, connection reset, network error, 5xx, or unknown error.
      // Must NOT reset to IDLE or permit blind retries. Transition to RECONCILIATION_REQUIRED.
      let quarantinePersisted = false;
      try {
        const qDoc = await Order.findOneAndUpdate(
          {
            _id: order._id,
            'payment.creationClaimId': claimId,
            'payment.creationState': 'DISPATCHING'
          },
          {
            $set: {
              'payment.creationState': 'RECONCILIATION_REQUIRED',
              'payment.unconfirmedRazorpayOrderId': null,
              'payment.creationClaimId': null,
              'payment.creationClaimExpiresAt': null
            }
          },
          { new: true }
        );
        quarantinePersisted = !!qDoc;
        if (!qDoc) {
          console.warn('[CreateRazorpayOrder] Quarantine update did not match active DISPATCHING claim on provider error:', {
            orderId: order._id,
            claimId
          });
        }
      } catch (qErr) {
        console.error('[CreateRazorpayOrder] DB error persisting quarantine on ambiguous provider error:', qErr.message);
      }

      return res.status(500).json({
        success: false,
        code: 'GATEWAY_RECONCILIATION_REQUIRED',
        message: 'Payment gateway request outcome was ambiguous. Reconciliation is required before retry.',
        quarantine_persisted: quarantinePersisted
      });
    }

    if (!razorpayOrder?.id) {
      console.error('[CreateRazorpayOrder] Malformed response from gateway (missing order ID)');
      let quarantinePersisted = false;
      try {
        const qDoc = await Order.findOneAndUpdate(
          {
            _id: order._id,
            'payment.creationClaimId': claimId,
            'payment.creationState': 'DISPATCHING'
          },
          {
            $set: {
              'payment.creationState': 'RECONCILIATION_REQUIRED',
              'payment.unconfirmedRazorpayOrderId': null,
              'payment.creationClaimId': null,
              'payment.creationClaimExpiresAt': null
            }
          },
          { new: true }
        );
        quarantinePersisted = !!qDoc;
      } catch (qErr) {
        console.error('[CreateRazorpayOrder] DB error persisting quarantine on malformed gateway response:', qErr.message);
      }

      return res.status(502).json({
        success: false,
        code: 'GATEWAY_RECONCILIATION_REQUIRED',
        message: 'Invalid or malformed response from payment gateway. Reconciliation is required.',
        quarantine_persisted: quarantinePersisted
      });
    }

    // Phase 4: Persist gateway order ID using claim ownership guard and state guard
    let persisted;
    try {
      persisted = await Order.findOneAndUpdate(
        {
          _id: order._id,
          customer: userId,
          'payment.creationClaimId': claimId, // Claim ownership guard
          'payment.creationState': 'DISPATCHING', // State guard
          'payment.status': { $nin: ['PAID', 'REFUNDED'] }
        },
        {
          $set: {
            'payment.razorpayOrderId': razorpayOrder.id,
            'payment.creationClaimId': null,
            'payment.creationClaimExpiresAt': null,
            'payment.creationState': 'LINKED'
          }
        },
        { new: true }
      );
    } catch (dbErr) {
      console.error('[CreateRazorpayOrder] DB error persisting gateway order:', dbErr.message);
      persisted = null;
    }

    if (!persisted) {
      // Provider-success / DB-failure / Late-response case:
      // Gateway order was created, but local persistence with claim ownership guard did not succeed.
      const fresh = await Order.findById(order._id);
      if (fresh?.payment?.status === 'PAID') {
        try {
          await Order.findOneAndUpdate(
            {
              _id: order._id,
              'payment.creationClaimId': claimId,
              'payment.creationState': 'DISPATCHING'
            },
            {
              $set: {
                'payment.creationClaimId': null,
                'payment.creationClaimExpiresAt': null,
                'payment.creationState': 'IDLE'
              }
            }
          );
        } catch (cleanupErr) {
          console.error('[CreateRazorpayOrder] Failed to clean up claim on late PAID order:', cleanupErr.message);
        }
        return res.status(400).json({
          success: false,
          code: 'ORDER_ALREADY_PAID',
          message: 'Order was already marked paid'
        });
      }
      if (fresh?.payment?.status === 'REFUNDED') {
        try {
          await Order.findOneAndUpdate(
            {
              _id: order._id,
              'payment.creationClaimId': claimId,
              'payment.creationState': 'DISPATCHING'
            },
            {
              $set: {
                'payment.creationClaimId': null,
                'payment.creationClaimExpiresAt': null,
                'payment.creationState': 'IDLE'
              }
            }
          );
        } catch (cleanupErr) {
          console.error('[CreateRazorpayOrder] Failed to clean up claim on late REFUNDED order:', cleanupErr.message);
        }
        return res.status(400).json({
          success: false,
          code: 'PAYMENT_ALREADY_REFUNDED',
          message: 'Order has already been refunded'
        });
      }
      if (fresh?.payment?.razorpayOrderId) {
        // A concurrent attempt already successfully linked a gateway order. Reuse it.
        return res.json({
          success: true,
          razorpay_order_id: fresh.payment.razorpayOrderId,
          amount: amountInPaise,
          key_id: process.env.RAZORPAY_KEY_ID,
        });
      }

      // Do not silently swallow quarantine persistence failures!
      let quarantinePersisted = false;
      try {
        const qDoc = await Order.findOneAndUpdate(
          {
            _id: order._id,
            'payment.creationClaimId': claimId,
            'payment.creationState': 'DISPATCHING',
            'payment.status': { $nin: ['PAID', 'REFUNDED'] }
          },
          {
            $set: {
              'payment.creationState': 'RECONCILIATION_REQUIRED',
              'payment.unconfirmedRazorpayOrderId': razorpayOrder.id,
              'payment.creationClaimId': null,
              'payment.creationClaimExpiresAt': null
            }
          },
          { new: true }
        );
        quarantinePersisted = !!qDoc;
      } catch (qErr) {
        console.error('[CreateRazorpayOrder] DB error persisting quarantine on persistence failure:', qErr.message);
      }

      return res.status(500).json({
        success: false,
        code: 'GATEWAY_RECONCILIATION_REQUIRED',
        message: 'Payment gateway order was created but database linking failed. Manual or reconciliation review required.',
        quarantine_persisted: quarantinePersisted,
        unconfirmed_order_id: razorpayOrder.id
      });
    }

    return res.json({
      success: true,
      razorpay_order_id: razorpayOrder.id,
      amount: amountInPaise,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('[CreateRazorpayOrder] Unexpected error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create order' });
  }
};

/**
 * POST /api/verify-payment
 * Verify checkout signature using DB-stored Razorpay order ID and validate server-side payment state.
 * - Authenticated customer ownership enforced.
 * - Prevents REFUNDED payments from transitioning back to PAID.
 * - Checkout signature verified against DB-stored order.payment.razorpayOrderId (NOT unverified client param).
 * - Server-side fetch validates: status === 'captured', matching order_id, exact amount, INR currency.
 * - Guarded final database update protects against stale gateway order IDs and changed payment states.
 * - Does not report "already verified" unless current record confirms it.
 */
export const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    const userId = req.user?.id || req.user?._id;

    if (!razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment details' });
    }

    const query = { customer: userId };
    if (orderId) {
      query._id = orderId;
    } else if (razorpay_order_id) {
      query['payment.razorpayOrderId'] = razorpay_order_id;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either orderId or razorpay_order_id is required'
      });
    }

    const order = await Order.findOne(query);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found for this payment' });
    }

    // Guard: Prevent REFUNDED payments from transitioning back to PAID
    if (order.payment?.status === 'REFUNDED') {
      return res.status(400).json({
        success: false,
        code: 'PAYMENT_ALREADY_REFUNDED',
        message: 'Order has already been refunded. Cannot verify or mark as paid.'
      });
    }

    // Already verified check: only if payment ID and verified flag confirm it
    if (
      order.payment?.status === 'PAID' &&
      order.payment?.verified === true &&
      (order.payment?.paymentId === razorpay_payment_id || order.payment?.razorpayPaymentId === razorpay_payment_id)
    ) {
      return res.json({ success: true, message: 'Payment already verified' });
    }

    const dbRazorpayOrderId = order.payment?.razorpayOrderId;
    if (!dbRazorpayOrderId) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_GATEWAY_ORDER',
        message: 'Order does not have a linked Razorpay order ID'
      });
    }

    // Guard: Client provided order ID must match DB-stored order ID
    if (razorpay_order_id && razorpay_order_id !== dbRazorpayOrderId) {
      return res.status(400).json({
        success: false,
        code: 'ORDER_ID_MISMATCH',
        message: 'Provided Razorpay order ID does not match order record'
      });
    }

    // Verify checkout signature using the DB-stored Razorpay order ID
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      console.error('[VerifyPayment] RAZORPAY_KEY_SECRET is not configured');
      return res.status(500).json({ success: false, message: 'Payment gateway configuration error' });
    }

    const isSignatureValid = verifyCheckoutSignature(
      dbRazorpayOrderId,
      razorpay_payment_id,
      razorpay_signature,
      secret
    );

    if (!isSignatureValid) {
      return res.status(400).json({ success: false, message: 'Invalid signature, payment failed' });
    }

    // Server-side payment fetch and validation before marking PAID
    const razorpayInstance = getRazorpayInstance();
    let payment;
    try {
      payment = await razorpayInstance.payments.fetch(razorpay_payment_id);
    } catch (fetchErr) {
      console.error('[VerifyPayment] Gateway payment fetch failed:', fetchErr.message);
      return res.status(502).json({
        success: false,
        code: 'GATEWAY_FETCH_FAILED',
        message: 'Failed to verify payment with payment gateway'
      });
    }

    if (!payment) {
      return res.status(400).json({
        success: false,
        message: 'Payment record not found on payment gateway'
      });
    }

    // Requirement: validate captured status (authorised-only payments must NOT be marked PAID)
    if (payment.status !== 'captured') {
      return res.status(400).json({
        success: false,
        code: 'PAYMENT_NOT_CAPTURED',
        message: `Payment is not captured (status: ${payment.status}). Cannot mark as paid.`
      });
    }

    // Requirement: validate matching Razorpay order ID
    if (payment.order_id !== dbRazorpayOrderId) {
      return res.status(400).json({
        success: false,
        code: 'ORDER_ID_MISMATCH',
        message: 'Payment order ID does not match order record'
      });
    }

    // Requirement: validate exact amount (order.pricing.grandTotal converted to paise)
    const expectedAmountPaise = Math.round((order.pricing?.grandTotal || 0) * 100);
    if (payment.amount !== expectedAmountPaise) {
      return res.status(400).json({
        success: false,
        code: 'AMOUNT_MISMATCH',
        message: `Payment amount (${payment.amount}) does not match order grandTotal (${expectedAmountPaise})`
      });
    }

    // Requirement: validate INR currency
    if (payment.currency !== 'INR') {
      return res.status(400).json({
        success: false,
        code: 'CURRENCY_MISMATCH',
        message: 'Payment currency must be INR'
      });
    }

    // Atomic update: guarded against stale gateway order IDs and changed payment state
    const updated = await Order.findOneAndUpdate(
      {
        _id: order._id,
        'payment.razorpayOrderId': dbRazorpayOrderId,
        'payment.status': { $nin: ['PAID', 'REFUNDED'] }
      },
      {
        $set: {
          'payment.status': 'PAID',
          'payment.paymentId': razorpay_payment_id,
          'payment.razorpayPaymentId': razorpay_payment_id,
          'payment.razorpaySignature': razorpay_signature,
          'payment.verified': true,
          'payment.capturedAt': new Date(),
        },
      },
      { new: true }
    );

    if (!updated) {
      const freshOrder = await Order.findById(order._id);
      // Strictly do not report "already verified" unless current record confirms it
      if (
        freshOrder?.payment?.status === 'PAID' &&
        freshOrder?.payment?.verified === true &&
        (freshOrder?.payment?.paymentId === razorpay_payment_id ||
         freshOrder?.payment?.razorpayPaymentId === razorpay_payment_id)
      ) {
        return res.json({ success: true, message: 'Payment already verified' });
      }
      if (freshOrder?.payment?.status === 'REFUNDED') {
        return res.status(400).json({
          success: false,
          code: 'PAYMENT_ALREADY_REFUNDED',
          message: 'Order has already been refunded. Cannot mark as paid.'
        });
      }
      return res.status(409).json({
        success: false,
        code: 'PAYMENT_STATE_CONFLICT',
        message: 'Payment state conflict: order payment status or gateway ID has changed'
      });
    }

    res.json({ success: true, message: 'Payment verified successfully' });
  } catch (error) {
    console.error('[VerifyPayment] Error verifying payment:', error.message);
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
};

/**
 * POST /api/payments/razorpay/webhook
 * Razorpay Webhook receiver with strict raw-body Buffer signature verification.
 * - No customer JWT required.
 * - Requires original rawBody Buffer. Rejects if missing or not a Buffer (no stringify fallback).
 * - Parses that same Buffer for event processing to prevent raw/parsed payload mismatch attacks.
 * - Validates required payment entity fields.
 * - Prevents REFUNDED payments from transitioning back to PAID.
 * - Supported events:
 *   - payment.captured: Validates captured status, order ID, exact amount, and INR currency; idempotently marks PAID.
 *   - payment.failed: Records failure on PENDING orders; NEVER overwrites an already PAID or REFUNDED state.
 *   - payment.authorized: Explicitly acknowledged; never marks PAID.
 *   - order.paid: Acknowledged safely.
 */
export const razorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[RazorpayWebhook] RAZORPAY_WEBHOOK_SECRET is not configured');
      return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).json({ success: false, message: 'Missing x-razorpay-signature header' });
    }

    // Requirement: Require original raw-body Buffer (no JSON.stringify fallback)
    if (!req.rawBody || !Buffer.isBuffer(req.rawBody)) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_RAW_BODY',
        message: 'Original raw request body Buffer is required for webhook signature verification'
      });
    }

    const isSignatureValid = verifyWebhookSignature(req.rawBody, signature, webhookSecret);
    if (!isSignatureValid) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    // Requirement: Parse that same verified raw-body Buffer for processing
    let eventPayload;
    try {
      eventPayload = JSON.parse(req.rawBody.toString('utf8'));
    } catch (parseErr) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_RAW_JSON',
        message: 'Raw body buffer is not valid JSON'
      });
    }

    const event = eventPayload?.event;
    if (!event || typeof event !== 'string') {
      return res.status(400).json({ success: false, message: 'Missing or invalid event field in payload' });
    }

    // 1. payment.captured
    if (event === 'payment.captured') {
      const paymentEntity = eventPayload?.payload?.payment?.entity;
      if (!paymentEntity) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_PAYMENT_ENTITY',
          message: 'Missing payment entity in payload'
        });
      }

      const razorpayOrderId = paymentEntity.order_id;
      const razorpayPaymentId = paymentEntity.id;
      const paymentAmount = paymentEntity.amount;
      const paymentCurrency = paymentEntity.currency;
      const paymentStatus = paymentEntity.status;

      // Validate required payment fields
      if (
        !razorpayOrderId || typeof razorpayOrderId !== 'string' ||
        !razorpayPaymentId || typeof razorpayPaymentId !== 'string' ||
        typeof paymentAmount !== 'number' || !Number.isFinite(paymentAmount) || paymentAmount <= 0 ||
        !paymentCurrency || typeof paymentCurrency !== 'string' ||
        !paymentStatus || typeof paymentStatus !== 'string'
      ) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_PAYMENT_FIELDS',
          message: 'Required payment entity fields are missing or malformed'
        });
      }

      // Do not mark authorised-only or non-captured payments as PAID
      if (paymentStatus !== 'captured') {
        return res.status(200).json({
          success: true,
          message: `Payment status is ${paymentStatus}, not captured. Ignored.`
        });
      }

      // Must locate order strictly by stored gateway order ID (never unverified receipt string)
      const order = await Order.findOne({ 'payment.razorpayOrderId': razorpayOrderId });
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found for razorpay order ID' });
      }

      // Requirement: Prevent REFUNDED payments from transitioning back to PAID
      if (order.payment?.status === 'REFUNDED') {
        return res.status(200).json({
          success: true,
          message: 'Order is already marked REFUNDED. Ignoring captured webhook.'
        });
      }

      // Validate exact amount in paise
      const expectedAmountPaise = Math.round((order.pricing?.grandTotal || 0) * 100);
      if (paymentAmount !== expectedAmountPaise) {
        console.error(
          `[RazorpayWebhook] Amount mismatch for order ${order._id}: expected ${expectedAmountPaise}, received ${paymentAmount}`
        );
        return res.status(400).json({
          success: false,
          code: 'AMOUNT_MISMATCH',
          message: 'Payment amount does not match order grandTotal'
        });
      }

      // Validate INR currency
      if (paymentCurrency !== 'INR') {
        console.error(
          `[RazorpayWebhook] Currency mismatch for order ${order._id}: expected INR, received ${paymentCurrency}`
        );
        return res.status(400).json({
          success: false,
          code: 'CURRENCY_MISMATCH',
          message: 'Payment currency must be INR'
        });
      }

      // Idempotency: If already PAID with matching payment ID, return success without duplicate effects
      if (
        order.payment?.status === 'PAID' &&
        order.payment?.verified === true &&
        (order.payment?.paymentId === razorpayPaymentId || order.payment?.razorpayPaymentId === razorpayPaymentId)
      ) {
        return res.status(200).json({
          success: true,
          message: 'Payment already processed and marked PAID'
        });
      }

      // Atomic transition: strictly update only if matching razorpayOrderId and not PAID/REFUNDED
      const updatedOrder = await Order.findOneAndUpdate(
        {
          _id: order._id,
          'payment.razorpayOrderId': razorpayOrderId,
          'payment.status': { $nin: ['PAID', 'REFUNDED'] }
        },
        {
          $set: {
            'payment.status': 'PAID',
            'payment.paymentId': razorpayPaymentId,
            'payment.razorpayPaymentId': razorpayPaymentId,
            'payment.verified': true,
            'payment.capturedAt': new Date()
          }
        },
        { new: true }
      );

      if (!updatedOrder) {
        const freshOrder = await Order.findById(order._id);
        // Do not report already verified unless record confirms it
        if (
          freshOrder?.payment?.status === 'PAID' &&
          freshOrder?.payment?.verified === true &&
          (freshOrder?.payment?.paymentId === razorpayPaymentId ||
           freshOrder?.payment?.razorpayPaymentId === razorpayPaymentId)
        ) {
          return res.status(200).json({
            success: true,
            message: 'Payment already processed and marked PAID'
          });
        }
        if (freshOrder?.payment?.status === 'REFUNDED') {
          return res.status(200).json({
            success: true,
            message: 'Order is already marked REFUNDED. Ignoring captured webhook.'
          });
        }
        return res.status(409).json({
          success: false,
          code: 'WEBHOOK_STATE_CONFLICT',
          message: 'Could not update order payment state due to concurrent state change'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Order payment successfully captured and marked PAID'
      });
    }

    // 2. payment.failed
    if (event === 'payment.failed') {
      const paymentEntity = eventPayload?.payload?.payment?.entity;
      const razorpayOrderId = paymentEntity?.order_id;
      const razorpayPaymentId = paymentEntity?.id;
      const errorDescription = paymentEntity?.error_description || 'Payment failed';

      if (!razorpayOrderId) {
        return res.status(200).json({
          success: true,
          message: 'No order_id associated with failed payment'
        });
      }

      const order = await Order.findOne({ 'payment.razorpayOrderId': razorpayOrderId });
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      // Critical Rule: Do NOT overwrite a PAID or REFUNDED state with a failure!
      if (order.payment?.status === 'PAID' || order.payment?.status === 'REFUNDED') {
        return res.status(200).json({
          success: true,
          message: `Order is already marked ${order.payment?.status}. Ignoring late failure notification.`
        });
      }

      await Order.findOneAndUpdate(
        {
          _id: order._id,
          'payment.razorpayOrderId': razorpayOrderId,
          'payment.status': 'PENDING'
        },
        {
          $set: {
            'payment.status': 'FAILED',
            'payment.paymentId': razorpayPaymentId,
            'payment.razorpayPaymentId': razorpayPaymentId,
            'payment.errorDescription': errorDescription
          }
        }
      );

      return res.status(200).json({
        success: true,
        message: 'Order marked as payment failed'
      });
    }

    // 3. payment.authorized
    if (event === 'payment.authorized') {
      return res.status(200).json({
        success: true,
        message: 'Payment authorization noted; awaiting capture before marking PAID'
      });
    }

    // 4. Other events (e.g. order.paid, refund.created)
    return res.status(200).json({
      success: true,
      message: `Webhook event ${event} acknowledged`
    });
  } catch (error) {
    console.error('[RazorpayWebhook] Webhook handling error:', error.message);
    res.status(500).json({ success: false, message: 'Internal webhook error' });
  }
};