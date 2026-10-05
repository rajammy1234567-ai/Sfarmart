import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
  razorpayWebhook,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  setRazorpayInstance
} from '../controllers/paymentController.js';
import Order from '../models/Order.js';

test('Razorpay Payment Comprehensive Offline Suite: Claims, Validations, Webhooks, Idempotency & Edge Cases', async (t) => {
  const customerId = new mongoose.Types.ObjectId().toString();
  const otherCustomerId = new mongoose.Types.ObjectId().toString();

  const mockSecret = 'test_key_secret_123456';
  const mockWebhookSecret = 'test_webhook_secret_abcdef';
  process.env.RAZORPAY_KEY_SECRET = mockSecret;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_123456';
  process.env.RAZORPAY_WEBHOOK_SECRET = mockWebhookSecret;

  // In-memory mock database of orders with rigorous query evaluation
  const ordersDb = new Map();
  let dbUpdateCount = 0;

  const createMockOrderDoc = (data) => {
    const doc = {
      _id: data._id || new mongoose.Types.ObjectId().toString(),
      orderNumber: data.orderNumber || 'ORD-TEST-1',
      customer: data.customer || customerId,
      status: data.status || 'NEW_ORDER',
      pricing: {
        itemsTotal: data.pricing?.itemsTotal ?? 100,
        deliveryFee: data.pricing?.deliveryFee ?? 25,
        taxes: data.pricing?.taxes ?? 0,
        discount: data.pricing?.discount ?? 0,
        grandTotal: data.pricing?.grandTotal ?? 125 // in Rupees
      },
      payment: {
        method: data.payment?.method || 'RAZORPAY',
        status: data.payment?.status || 'PENDING',
        razorpayOrderId: data.payment?.razorpayOrderId,
        razorpayPaymentId: data.payment?.razorpayPaymentId,
        razorpaySignature: data.payment?.razorpaySignature,
        verified: data.payment?.verified || false,
        paymentId: data.payment?.paymentId,
        capturedAt: data.payment?.capturedAt,
        errorDescription: data.payment?.errorDescription,
        creationClaimId: data.payment?.creationClaimId,
        creationClaimExpiresAt: data.payment?.creationClaimExpiresAt,
        creationState: data.payment?.creationState || 'IDLE',
        unconfirmedRazorpayOrderId: data.payment?.unconfirmedRazorpayOrderId
      }
    };
    ordersDb.set(String(doc._id), doc);
    return doc;
  };

  // Evaluates every single MongoDB condition against doc
  const evaluateQuery = (doc, query) => {
    if (!doc || !query) return false;

    // _id check
    if (query._id && String(doc._id) !== String(query._id)) {
      return false;
    }

    // customer check
    if (query.customer && String(doc.customer) !== String(query.customer)) {
      return false;
    }

    // payment.razorpayOrderId
    if ('payment.razorpayOrderId' in query) {
      const val = query['payment.razorpayOrderId'];
      if (val === null) {
        if (doc.payment?.razorpayOrderId) return false;
      } else if (typeof val === 'object' && val.$exists === false) {
        if (doc.payment?.razorpayOrderId) return false;
      } else if (doc.payment?.razorpayOrderId !== val) {
        return false;
      }
    }

    // payment.creationClaimId
    if ('payment.creationClaimId' in query) {
      const val = query['payment.creationClaimId'];
      if (val === null) {
        if (doc.payment?.creationClaimId) return false;
      } else if (typeof val === 'object' && val.$exists === false) {
        if (doc.payment?.creationClaimId) return false;
      } else if (doc.payment?.creationClaimId !== val) {
        return false;
      }
    }

    // payment.creationClaimExpiresAt
    if ('payment.creationClaimExpiresAt' in query) {
      const val = query['payment.creationClaimExpiresAt'];
      if (val && val.$lt) {
        if (!doc.payment?.creationClaimExpiresAt) return true;
        if (new Date(doc.payment.creationClaimExpiresAt).getTime() >= new Date(val.$lt).getTime()) {
          return false;
        }
      }
      if (val && val.$lte) {
        if (!doc.payment?.creationClaimExpiresAt) return false;
        if (new Date(doc.payment.creationClaimExpiresAt).getTime() > new Date(val.$lte).getTime()) {
          return false;
        }
      }
    }

    // payment.creationState
    if ('payment.creationState' in query) {
      const qState = query['payment.creationState'];
      if (typeof qState === 'string' && doc.payment?.creationState !== qState) return false;
      if (qState && typeof qState === 'object') {
        if (qState.$ne && doc.payment?.creationState === qState.$ne) return false;
        if (qState.$in && Array.isArray(qState.$in)) {
          const match = qState.$in.some((item) => {
            if (item === null) return !doc.payment?.creationState;
            return doc.payment?.creationState === item;
          });
          if (!match) return false;
        }
        if (qState.$exists === false && doc.payment?.creationState) return false;
      }
    }

    // payment.status checks ($nin, $ne, or exact string)
    if (query['payment.status']) {
      const qStatus = query['payment.status'];
      if (typeof qStatus === 'string' && doc.payment?.status !== qStatus) {
        return false;
      }
      if (qStatus.$ne && doc.payment?.status === qStatus.$ne) {
        return false;
      }
      if (qStatus.$nin && Array.isArray(qStatus.$nin) && qStatus.$nin.includes(doc.payment?.status)) {
        return false;
      }
    }

    // $and clauses
    if (query.$and && Array.isArray(query.$and)) {
      for (const subAnd of query.$and) {
        if (!evaluateQuery(doc, subAnd)) {
          return false;
        }
      }
    }

    // $or clauses
    if (query.$or && Array.isArray(query.$or)) {
      const anyMatch = query.$or.some((subQ) => evaluateQuery(doc, subQ));
      if (!anyMatch) {
        return false;
      }
    }

    return true;
  };

  // Mock Mongoose Order methods
  const origFindOne = Order.findOne;
  const origFindById = Order.findById;
  const origFindByIdAndUpdate = Order.findByIdAndUpdate;
  const origFindOneAndUpdate = Order.findOneAndUpdate;

  Order.findOne = async (query) => {
    for (const doc of ordersDb.values()) {
      if (evaluateQuery(doc, query)) {
        return JSON.parse(JSON.stringify(doc));
      }
    }
    return null;
  };

  Order.findById = async (id) => {
    const doc = ordersDb.get(String(id));
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  };

  Order.findByIdAndUpdate = async (id, update) => {
    const doc = ordersDb.get(String(id));
    if (!doc) return null;
    dbUpdateCount++;
    if (update.$set) {
      if (update.$set['payment.razorpayOrderId']) doc.payment.razorpayOrderId = update.$set['payment.razorpayOrderId'];
      if (update.$set['payment.creationState']) doc.payment.creationState = update.$set['payment.creationState'];
    }
    return JSON.parse(JSON.stringify(doc));
  };

  Order.findOneAndUpdate = async (query, update) => {
    for (const doc of ordersDb.values()) {
      if (evaluateQuery(doc, query)) {
        dbUpdateCount++;
        if (update.$set) {
          if (update.$set['payment.status']) doc.payment.status = update.$set['payment.status'];
          if (update.$set['payment.paymentId']) doc.payment.paymentId = update.$set['payment.paymentId'];
          if (update.$set['payment.razorpayPaymentId']) doc.payment.razorpayPaymentId = update.$set['payment.razorpayPaymentId'];
          if (update.$set['payment.razorpayOrderId']) doc.payment.razorpayOrderId = update.$set['payment.razorpayOrderId'];
          if (update.$set['payment.razorpaySignature']) doc.payment.razorpaySignature = update.$set['payment.razorpaySignature'];
          if (update.$set['payment.verified'] !== undefined) doc.payment.verified = update.$set['payment.verified'];
          if (update.$set['payment.capturedAt']) doc.payment.capturedAt = update.$set['payment.capturedAt'];
          if (update.$set['payment.errorDescription']) doc.payment.errorDescription = update.$set['payment.errorDescription'];
          if ('payment.creationClaimId' in update.$set) doc.payment.creationClaimId = update.$set['payment.creationClaimId'];
          if ('payment.creationClaimExpiresAt' in update.$set) doc.payment.creationClaimExpiresAt = update.$set['payment.creationClaimExpiresAt'];
          if ('payment.creationState' in update.$set) doc.payment.creationState = update.$set['payment.creationState'];
          if ('payment.unconfirmedRazorpayOrderId' in update.$set) doc.payment.unconfirmedRazorpayOrderId = update.$set['payment.unconfirmedRazorpayOrderId'];
        }
        return JSON.parse(JSON.stringify(doc));
      }
    }
    return null;
  };

  const createMockRes = () => {
    return {
      statusCode: 200,
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      }
    };
  };

  t.after(() => {
    Order.findOne = origFindOne;
    Order.findById = origFindById;
    Order.findByIdAndUpdate = origFindByIdAndUpdate;
    Order.findOneAndUpdate = origFindOneAndUpdate;
    setRazorpayInstance(null);
  });

  await t.test('1. Money units: correctly converts rupees to paise (e.g. ₹125.50 -> 12550 paise)', async () => {
    const testDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 125.50 }
    });

    let createdAmount = 0;
    setRazorpayInstance({
      orders: {
        create: async (params) => {
          createdAmount = params.amount;
          return { id: 'order_rzp_mock_1', amount: params.amount, currency: 'INR' };
        }
      }
    });

    const res = createMockRes();
    await createRazorpayOrder({ body: { orderId: testDoc._id }, user: { id: customerId } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(createdAmount, 12550, '₹125.50 must convert exactly to 12550 paise');
    assert.equal(res.jsonData.amount, 12550);
    assert.equal(res.jsonData.razorpay_order_id, 'order_rzp_mock_1');
  });

  await t.test('2. Negative test: rejects zero, negative, NaN, non-finite, and unsafe amounts with INVALID_AMOUNT', async () => {
    // 2a. Zero
    const docZero = createMockOrderDoc({ pricing: { grandTotal: 0 } });
    const resZero = createMockRes();
    await createRazorpayOrder({ body: { orderId: docZero._id }, user: { id: customerId } }, resZero);
    assert.equal(resZero.statusCode, 400);
    assert.equal(resZero.jsonData.code, 'INVALID_AMOUNT');

    // 2b. Negative
    const docNeg = createMockOrderDoc({ pricing: { grandTotal: -75 } });
    const resNeg = createMockRes();
    await createRazorpayOrder({ body: { orderId: docNeg._id }, user: { id: customerId } }, resNeg);
    assert.equal(resNeg.statusCode, 400);
    assert.equal(resNeg.jsonData.code, 'INVALID_AMOUNT');

    // 2c. NaN
    const docNan = createMockOrderDoc({ pricing: { grandTotal: NaN } });
    const resNan = createMockRes();
    await createRazorpayOrder({ body: { orderId: docNan._id }, user: { id: customerId } }, resNan);
    assert.equal(resNan.statusCode, 400);
    assert.equal(resNan.jsonData.code, 'INVALID_AMOUNT');

    // 2d. String / non-finite
    const docStr = createMockOrderDoc({ pricing: { grandTotal: Infinity } });
    const resStr = createMockRes();
    await createRazorpayOrder({ body: { orderId: docStr._id }, user: { id: customerId } }, resStr);
    assert.equal(resStr.statusCode, 400);
    assert.equal(resStr.jsonData.code, 'INVALID_AMOUNT');
  });

  await t.test('3. Checkout signature verification: valid signature succeeds against DB-stored order ID', async () => {
    const testDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 150 },
      payment: { razorpayOrderId: 'order_db_stored_valid_1' }
    });

    const paymentId = 'pay_valid_1';
    const validSig = crypto.createHmac('sha256', mockSecret).update('order_db_stored_valid_1|' + paymentId).digest('hex');

    setRazorpayInstance({
      payments: {
        fetch: async (id) => ({
          id,
          order_id: 'order_db_stored_valid_1',
          amount: 15000,
          currency: 'INR',
          status: 'captured'
        })
      }
    });

    const res = createMockRes();
    await verifyRazorpayPayment({
      body: {
        orderId: testDoc._id,
        razorpay_order_id: 'order_db_stored_valid_1',
        razorpay_payment_id: paymentId,
        razorpay_signature: validSig
      },
      user: { id: customerId }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonData.success, true);
    assert.equal(ordersDb.get(String(testDoc._id)).payment.status, 'PAID');
    assert.equal(ordersDb.get(String(testDoc._id)).payment.verified, true);
  });

  await t.test('4. Negative test: signature mismatch rejects invalid or tampered signature', async () => {
    const testDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 150 },
      payment: { razorpayOrderId: 'order_db_stored_valid_2' }
    });

    const paymentId = 'pay_valid_2';
    const res = createMockRes();
    await verifyRazorpayPayment({
      body: {
        orderId: testDoc._id,
        razorpay_order_id: 'order_db_stored_valid_2',
        razorpay_payment_id: paymentId,
        razorpay_signature: 'tampered_signature_hex_0000000000000000000000000000000000000000000000000000000000000000'
      },
      user: { id: customerId }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonData.message, 'Invalid signature, payment failed');
    assert.equal(ordersDb.get(String(testDoc._id)).payment.status, 'PENDING');
  });

  await t.test('5. Negative test: order-ID mismatch rejects client razorpay_order_id differing from DB record', async () => {
    const testDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 100 },
      payment: { razorpayOrderId: 'order_real_in_db' }
    });

    const paymentId = 'pay_mismatch_1';
    const fakeSig = crypto.createHmac('sha256', mockSecret).update('order_fake_from_client|' + paymentId).digest('hex');

    const res = createMockRes();
    await verifyRazorpayPayment({
      body: {
        orderId: testDoc._id,
        razorpay_order_id: 'order_fake_from_client',
        razorpay_payment_id: paymentId,
        razorpay_signature: fakeSig
      },
      user: { id: customerId }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonData.code, 'ORDER_ID_MISMATCH');
    assert.equal(ordersDb.get(String(testDoc._id)).payment.status, 'PENDING');
  });

  await t.test('6. Negative test: customer ownership gate prevents customer B from verifying customer A payment', async () => {
    const testDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 100 },
      payment: { razorpayOrderId: 'order_cust_a' }
    });

    const paymentId = 'pay_cust_a';
    const sig = crypto.createHmac('sha256', mockSecret).update('order_cust_a|' + paymentId).digest('hex');

    const res = createMockRes();
    await verifyRazorpayPayment({
      body: {
        orderId: testDoc._id,
        razorpay_order_id: 'order_cust_a',
        razorpay_payment_id: paymentId,
        razorpay_signature: sig
      },
      user: { id: otherCustomerId } // Different customer!
    }, res);

    assert.equal(res.statusCode, 404);
    assert.equal(ordersDb.get(String(testDoc._id)).payment.status, 'PENDING');
  });

  await t.test('7. Negative test: uncaptured payment (status: authorized) is rejected with PAYMENT_NOT_CAPTURED', async () => {
    const testDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 120 },
      payment: { razorpayOrderId: 'order_auth_only_99' }
    });

    const paymentId = 'pay_auth_only_99';
    const sig = crypto.createHmac('sha256', mockSecret).update('order_auth_only_99|' + paymentId).digest('hex');

    setRazorpayInstance({
      payments: {
        fetch: async (id) => ({
          id,
          order_id: 'order_auth_only_99',
          amount: 12000,
          currency: 'INR',
          status: 'authorized' // NOT captured!
        })
      }
    });

    const res = createMockRes();
    await verifyRazorpayPayment({
      body: {
        orderId: testDoc._id,
        razorpay_order_id: 'order_auth_only_99',
        razorpay_payment_id: paymentId,
        razorpay_signature: sig
      },
      user: { id: customerId }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonData.code, 'PAYMENT_NOT_CAPTURED');
    assert.equal(ordersDb.get(String(testDoc._id)).payment.status, 'PENDING');
  });

  await t.test('8. Negative test: gateway amount mismatch is rejected with AMOUNT_MISMATCH', async () => {
    const testDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 200 }, // 20000 paise
      payment: { razorpayOrderId: 'order_amt_mismatch' }
    });

    const paymentId = 'pay_amt_mismatch';
    const sig = crypto.createHmac('sha256', mockSecret).update('order_amt_mismatch|' + paymentId).digest('hex');

    setRazorpayInstance({
      payments: {
        fetch: async (id) => ({
          id,
          order_id: 'order_amt_mismatch',
          amount: 10000, // Gateway returns 10000 paise (₹100) instead of ₹200!
          currency: 'INR',
          status: 'captured'
        })
      }
    });

    const res = createMockRes();
    await verifyRazorpayPayment({
      body: {
        orderId: testDoc._id,
        razorpay_order_id: 'order_amt_mismatch',
        razorpay_payment_id: paymentId,
        razorpay_signature: sig
      },
      user: { id: customerId }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonData.code, 'AMOUNT_MISMATCH');
    assert.equal(ordersDb.get(String(testDoc._id)).payment.status, 'PENDING');
  });

  await t.test('9. Negative test: gateway currency mismatch is rejected with CURRENCY_MISMATCH', async () => {
    const testDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 100 },
      payment: { razorpayOrderId: 'order_curr_mismatch' }
    });

    const paymentId = 'pay_curr_mismatch';
    const sig = crypto.createHmac('sha256', mockSecret).update('order_curr_mismatch|' + paymentId).digest('hex');

    setRazorpayInstance({
      payments: {
        fetch: async (id) => ({
          id,
          order_id: 'order_curr_mismatch',
          amount: 10000,
          currency: 'USD', // Not INR!
          status: 'captured'
        })
      }
    });

    const res = createMockRes();
    await verifyRazorpayPayment({
      body: {
        orderId: testDoc._id,
        razorpay_order_id: 'order_curr_mismatch',
        razorpay_payment_id: paymentId,
        razorpay_signature: sig
      },
      user: { id: customerId }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonData.code, 'CURRENCY_MISMATCH');
    assert.equal(ordersDb.get(String(testDoc._id)).payment.status, 'PENDING');
  });

  await t.test('10. Negative test: gateway order ID mismatch on fetched payment rejected with ORDER_ID_MISMATCH', async () => {
    const testDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 100 },
      payment: { razorpayOrderId: 'order_exp_1' }
    });

    const paymentId = 'pay_mismatch_gateway';
    const sig = crypto.createHmac('sha256', mockSecret).update('order_exp_1|' + paymentId).digest('hex');

    setRazorpayInstance({
      payments: {
        fetch: async (id) => ({
          id,
          order_id: 'order_different_gateway_id', // Gateway payment was attached to another order!
          amount: 10000,
          currency: 'INR',
          status: 'captured'
        })
      }
    });

    const res = createMockRes();
    await verifyRazorpayPayment({
      body: {
        orderId: testDoc._id,
        razorpay_order_id: 'order_exp_1',
        razorpay_payment_id: paymentId,
        razorpay_signature: sig
      },
      user: { id: customerId }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonData.code, 'ORDER_ID_MISMATCH');
    assert.equal(ordersDb.get(String(testDoc._id)).payment.status, 'PENDING');
  });

  await t.test('11. Regression: Prevent REFUNDED payments from transitioning back to PAID via verifyRazorpayPayment', async () => {
    const refundedDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 200 },
      payment: {
        status: 'REFUNDED',
        razorpayOrderId: 'order_ref_guard_1',
        paymentId: 'pay_orig_ref'
      }
    });

    const paymentId = 'pay_replay_attempt_ref';
    const sig = crypto.createHmac('sha256', mockSecret).update('order_ref_guard_1|' + paymentId).digest('hex');

    setRazorpayInstance({
      payments: {
        fetch: async () => ({
          id: paymentId,
          order_id: 'order_ref_guard_1',
          amount: 20000,
          currency: 'INR',
          status: 'captured'
        })
      }
    });

    const res = createMockRes();
    await verifyRazorpayPayment({
      body: {
        orderId: refundedDoc._id,
        razorpay_order_id: 'order_ref_guard_1',
        razorpay_payment_id: paymentId,
        razorpay_signature: sig
      },
      user: { id: customerId }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonData.code, 'PAYMENT_ALREADY_REFUNDED');
    assert.equal(ordersDb.get(String(refundedDoc._id)).payment.status, 'REFUNDED');
  });

  await t.test('12. Regression: Prevent REFUNDED payments from transitioning back to PAID via webhook payment.captured', async () => {
    const refundedDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      pricing: { grandTotal: 150 },
      payment: {
        status: 'REFUNDED',
        razorpayOrderId: 'order_ref_guard_wh',
        paymentId: 'pay_ref_wh_orig'
      }
    });

    const rawPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_ref_wh_replay',
            order_id: 'order_ref_guard_wh',
            amount: 15000,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    });
    const sig = crypto.createHmac('sha256', mockWebhookSecret).update(Buffer.from(rawPayload)).digest('hex');

    const res = createMockRes();
    await razorpayWebhook({
      headers: { 'x-razorpay-signature': sig },
      rawBody: Buffer.from(rawPayload)
    }, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.jsonData.message.includes('REFUNDED'));
    assert.equal(ordersDb.get(String(refundedDoc._id)).payment.status, 'REFUNDED');
  });

  await t.test('13. Regression: payment.failed event must NEVER overwrite an already PAID or REFUNDED order', async () => {
    // 13a. PAID order
    const paidDoc = createMockOrderDoc({
      pricing: { grandTotal: 100 },
      payment: {
        status: 'PAID',
        verified: true,
        razorpayOrderId: 'order_paid_fail_ignore',
        paymentId: 'pay_paid_ok'
      }
    });

    const failPayloadPaid = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_late_fail_1',
            order_id: 'order_paid_fail_ignore',
            error_description: 'Card declined'
          }
        }
      }
    });
    const sigPaid = crypto.createHmac('sha256', mockWebhookSecret).update(Buffer.from(failPayloadPaid)).digest('hex');

    const resPaid = createMockRes();
    await razorpayWebhook({
      headers: { 'x-razorpay-signature': sigPaid },
      rawBody: Buffer.from(failPayloadPaid)
    }, resPaid);

    assert.equal(resPaid.statusCode, 200);
    assert.equal(ordersDb.get(String(paidDoc._id)).payment.status, 'PAID', 'Must remain PAID');

    // 13b. REFUNDED order
    const refDoc = createMockOrderDoc({
      pricing: { grandTotal: 100 },
      payment: {
        status: 'REFUNDED',
        razorpayOrderId: 'order_ref_fail_ignore',
        paymentId: 'pay_ref_ok'
      }
    });

    const failPayloadRef = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_late_fail_2',
            order_id: 'order_ref_fail_ignore',
            error_description: 'Refunded card notification'
          }
        }
      }
    });
    const sigRef = crypto.createHmac('sha256', mockWebhookSecret).update(Buffer.from(failPayloadRef)).digest('hex');

    const resRef = createMockRes();
    await razorpayWebhook({
      headers: { 'x-razorpay-signature': sigRef },
      rawBody: Buffer.from(failPayloadRef)
    }, resRef);

    assert.equal(resRef.statusCode, 200);
    assert.equal(ordersDb.get(String(refDoc._id)).payment.status, 'REFUNDED', 'Must remain REFUNDED');
  });

  await t.test('14. Concurrent order creation with durable claim: exactly ONE provider call, convergent order ID', async () => {
    const unlinkedDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 250 },
      payment: { status: 'PENDING' }
    });

    let providerCalls = 0;
    let providerResolve;
    const providerBarrier = new Promise((resolve) => {
      providerResolve = resolve;
    });

    setRazorpayInstance({
      orders: {
        create: async (params) => {
          providerCalls++;
          // Delay to simulate provider latency while holding claim
          await providerBarrier;
          return {
            id: 'order_concurrent_winner_999',
            amount: params.amount,
            currency: 'INR'
          };
        }
      }
    });

    const res1 = createMockRes();
    const res2 = createMockRes();

    // Fire two concurrent creation requests
    const p1 = createRazorpayOrder({ body: { orderId: unlinkedDoc._id }, user: { id: customerId } }, res1);
    const p2 = createRazorpayOrder({ body: { orderId: unlinkedDoc._id }, user: { id: customerId } }, res2);

    // Release provider barrier after a brief delay
    setTimeout(() => providerResolve(), 30);

    await Promise.all([p1, p2]);

    assert.equal(res1.statusCode, 200);
    assert.equal(res2.statusCode, 200);

    // EXACTLY ONE call to Razorpay orders.create across concurrent requests!
    assert.equal(providerCalls, 1, 'Durable atomic creation claim must guarantee exactly ONE provider call');

    // Both callers must converge on the exact same linked gateway order ID
    assert.equal(res1.jsonData.razorpay_order_id, 'order_concurrent_winner_999');
    assert.equal(res2.jsonData.razorpay_order_id, 'order_concurrent_winner_999');

    const inDb = ordersDb.get(String(unlinkedDoc._id));
    assert.equal(inDb.payment.razorpayOrderId, 'order_concurrent_winner_999');
    assert.equal(inDb.payment.creationState, 'LINKED');
  });

  await t.test('15. Order creation reuse: zero provider calls when order already has linked gateway order', async () => {
    const alreadyLinkedDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 250 },
      payment: { status: 'PENDING', razorpayOrderId: 'order_already_linked_123' }
    });

    let providerCalls = 0;
    setRazorpayInstance({
      orders: {
        create: async () => {
          providerCalls++;
          return { id: 'order_should_not_be_created' };
        }
      }
    });

    const res = createMockRes();
    await createRazorpayOrder({ body: { orderId: alreadyLinkedDoc._id }, user: { id: customerId } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonData.razorpay_order_id, 'order_already_linked_123');
    assert.equal(providerCalls, 0, 'Must make zero provider calls for already linked order');
  });

  await t.test('16. Failed persistence handling: returns GATEWAY_RECONCILIATION_REQUIRED and avoids duplicate order spawning', async () => {
    const failDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 300 },
      payment: { status: 'PENDING' }
    });

    setRazorpayInstance({
      orders: {
        create: async () => ({
          id: 'order_orphaned_gateway_456',
          amount: 30000,
          currency: 'INR'
        })
      }
    });

    // Temporarily simulate DB error during gateway order ID persistence
    const origFindOneAndUpdateHook = Order.findOneAndUpdate;
    Order.findOneAndUpdate = async (query, update) => {
      // Fail the persistence step where razorpayOrderId is saved
      if (update.$set && update.$set['payment.razorpayOrderId']) {
        return null;
      }
      return origFindOneAndUpdateHook(query, update);
    };

    const res = createMockRes();
    await createRazorpayOrder({ body: { orderId: failDoc._id }, user: { id: customerId } }, res);

    Order.findOneAndUpdate = origFindOneAndUpdateHook;

    assert.equal(res.statusCode, 500);
    assert.equal(res.jsonData.code, 'GATEWAY_RECONCILIATION_REQUIRED');
    assert.equal(res.jsonData.unconfirmed_order_id, 'order_orphaned_gateway_456');

    // Subsequent request must NOT blindly spawn another gateway order!
    const resBlocked = createMockRes();
    await createRazorpayOrder({ body: { orderId: failDoc._id }, user: { id: customerId } }, resBlocked);
    assert.equal(resBlocked.statusCode, 409);
    assert.equal(resBlocked.jsonData.code, 'GATEWAY_RECONCILIATION_REQUIRED');
  });

  await t.test('16b. Late response handling: order marked PAID while provider call was in flight does not overwrite PAID state', async () => {
    const lateDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 200 },
      payment: { status: 'PENDING' }
    });

    setRazorpayInstance({
      orders: {
        create: async () => {
          // Simulate that during provider creation latency, the order was marked PAID externally (e.g. COD / cash / admin)
          const inDb = ordersDb.get(String(lateDoc._id));
          inDb.payment.status = 'PAID';
          inDb.payment.verified = true;
          inDb.payment.creationState = 'IDLE';
          inDb.payment.creationClaimId = null; // claim cleared on settlement
          return { id: 'order_late_arrived_111', amount: 20000, currency: 'INR' };
        }
      }
    });

    const res = createMockRes();
    await createRazorpayOrder({ body: { orderId: lateDoc._id }, user: { id: customerId } }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonData.code, 'ORDER_ALREADY_PAID');

    // Confirm DB doc remains PAID and did NOT get overwritten by late gateway order
    const finalDoc = ordersDb.get(String(lateDoc._id));
    assert.equal(finalDoc.payment.status, 'PAID');
    assert.equal(finalDoc.payment.creationState, 'IDLE');
    assert.notEqual(finalDoc.payment.razorpayOrderId, 'order_late_arrived_111');
  });

  await t.test('16c. Late response handling: claim lost and another request already linked order ID converges safely', async () => {
    const lateDoc2 = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 220 },
      payment: { status: 'PENDING' }
    });

    setRazorpayInstance({
      orders: {
        create: async () => {
          // Simulate that claim expired and another concurrent request already linked the order
          const inDb = ordersDb.get(String(lateDoc2._id));
          inDb.payment.razorpayOrderId = 'order_already_linked_by_winner';
          inDb.payment.creationClaimId = 'different_claim_id';
          inDb.payment.creationState = 'LINKED';
          return { id: 'order_stale_loser_222', amount: 22000, currency: 'INR' };
        }
      }
    });

    const res = createMockRes();
    await createRazorpayOrder({ body: { orderId: lateDoc2._id }, user: { id: customerId } }, res);

    assert.equal(res.statusCode, 200);
    // Converges safely on the winner's linked gateway order ID
    assert.equal(res.jsonData.razorpay_order_id, 'order_already_linked_by_winner');

    const finalDoc = ordersDb.get(String(lateDoc2._id));
    assert.equal(finalDoc.payment.razorpayOrderId, 'order_already_linked_by_winner');
  });

  await t.test('17. Checkout verification / Webhook race with controlled barrier: exactly ONE transition to PAID', async () => {
    const raceDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 175 },
      payment: {
        status: 'PENDING',
        razorpayOrderId: 'order_race_777'
      }
    });

    const paymentId = 'pay_race_888';
    const clientSig = crypto.createHmac('sha256', mockSecret).update('order_race_777|' + paymentId).digest('hex');

    setRazorpayInstance({
      payments: {
        fetch: async () => ({
          id: paymentId,
          order_id: 'order_race_777',
          amount: 17500,
          currency: 'INR',
          status: 'captured'
        })
      }
    });

    const rawPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: 'order_race_777',
            amount: 17500,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    });
    const webhookSig = crypto.createHmac('sha256', mockWebhookSecret).update(Buffer.from(rawPayload)).digest('hex');

    const resClient = createMockRes();
    const resWebhook = createMockRes();

    const updatesBefore = dbUpdateCount;

    await Promise.all([
      verifyRazorpayPayment({
        body: {
          orderId: raceDoc._id,
          razorpay_order_id: 'order_race_777',
          razorpay_payment_id: paymentId,
          razorpay_signature: clientSig
        },
        user: { id: customerId }
      }, resClient),
      razorpayWebhook({
        headers: { 'x-razorpay-signature': webhookSig },
        rawBody: Buffer.from(rawPayload)
      }, resWebhook)
    ]);

    assert.equal(resClient.statusCode, 200);
    assert.equal(resWebhook.statusCode, 200);

    const finalRaceDoc = ordersDb.get(String(raceDoc._id));
    assert.equal(finalRaceDoc.payment.status, 'PAID');
    assert.equal(finalRaceDoc.payment.verified, true);
    assert.equal(finalRaceDoc.payment.paymentId, paymentId);
    assert.equal(dbUpdateCount - updatesBefore, 1, 'Exactly one atomic transition to PAID must occur');
  });

  await t.test('18. Webhook raw-body versus parsed-body mismatch attack protection', async () => {
    const legitDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      pricing: { grandTotal: 100 },
      payment: { status: 'PENDING', razorpayOrderId: 'order_legit_202' }
    });
    const attackDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      pricing: { grandTotal: 1000 },
      payment: { status: 'PENDING', razorpayOrderId: 'order_attack_202' }
    });

    const legitPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_legit_202',
            order_id: 'order_legit_202',
            amount: 10000,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    });
    const legitSig = crypto.createHmac('sha256', mockWebhookSecret).update(Buffer.from(legitPayload)).digest('hex');

    const tamperedBody = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_attack_202',
            order_id: 'order_attack_202',
            amount: 10000,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    };

    const res = createMockRes();
    await razorpayWebhook({
      headers: { 'x-razorpay-signature': legitSig },
      rawBody: Buffer.from(legitPayload),
      body: tamperedBody
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(ordersDb.get(String(legitDoc._id)).payment.status, 'PAID');
    assert.equal(ordersDb.get(String(attackDoc._id)).payment.status, 'PENDING');
  });

  await t.test('19. Webhook missing or non-Buffer raw body strictly rejected without stringify fallback', async () => {
    // 19a. Missing rawBody completely
    const resNoRaw = createMockRes();
    await razorpayWebhook({
      headers: { 'x-razorpay-signature': 'some_sig' },
      body: { event: 'payment.captured' }
    }, resNoRaw);
    assert.equal(resNoRaw.statusCode, 400);
    assert.equal(resNoRaw.jsonData.code, 'MISSING_RAW_BODY');

    // 19b. rawBody is a plain string instead of Buffer
    const resStringRaw = createMockRes();
    await razorpayWebhook({
      headers: { 'x-razorpay-signature': 'some_sig' },
      rawBody: '{"event":"payment.captured"}',
      body: { event: 'payment.captured' }
    }, resStringRaw);
    assert.equal(resStringRaw.statusCode, 400);
    assert.equal(resStringRaw.jsonData.code, 'MISSING_RAW_BODY');
  });

  await t.test('20. Webhook invalid x-razorpay-signature rejected with 400', async () => {
    const rawPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_bad_sig',
            order_id: 'order_bad_sig',
            amount: 10000,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    });

    const res = createMockRes();
    await razorpayWebhook({
      headers: { 'x-razorpay-signature': 'invalid_signature_hex_0000000000000000000000000000000000000000000000000000000000000000' },
      rawBody: Buffer.from(rawPayload)
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonData.message, 'Invalid webhook signature');
  });

  await t.test('21. Regression: expired DISPATCHING claim after process crash results in zero new provider calls', async () => {
    const expiredDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 350 },
      payment: {
        status: 'PENDING',
        creationState: 'DISPATCHING',
        creationClaimId: 'crashed_worker_claim_111',
        creationClaimExpiresAt: new Date(Date.now() - 60000) // expired 1 minute ago
      }
    });

    let providerCalls = 0;
    setRazorpayInstance({
      orders: {
        create: async () => {
          providerCalls++;
          return { id: 'should_never_be_called' };
        }
      }
    });

    const res = createMockRes();
    await createRazorpayOrder({ body: { orderId: expiredDoc._id }, user: { id: customerId } }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.jsonData.code, 'GATEWAY_RECONCILIATION_REQUIRED');
    assert.equal(providerCalls, 0, 'Must make zero provider calls for expired DISPATCHING claim');

    const inDb = ordersDb.get(String(expiredDoc._id));
    assert.equal(inDb.payment.creationState, 'RECONCILIATION_REQUIRED');
  });

  await t.test('22. Regression: provider timeout after possible creation blocks retries with GATEWAY_RECONCILIATION_REQUIRED', async () => {
    const timeoutDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 400 },
      payment: { status: 'PENDING' }
    });

    let providerCalls = 0;
    setRazorpayInstance({
      orders: {
        create: async () => {
          providerCalls++;
          const err = new Error('ESOCKETTIMEDOUT: connect timed out after sending payload');
          err.code = 'ESOCKETTIMEDOUT';
          throw err;
        }
      }
    });

    const res1 = createMockRes();
    await createRazorpayOrder({ body: { orderId: timeoutDoc._id }, user: { id: customerId } }, res1);

    assert.equal(res1.statusCode, 500);
    assert.equal(res1.jsonData.code, 'GATEWAY_RECONCILIATION_REQUIRED');
    assert.equal(providerCalls, 1);

    const inDb = ordersDb.get(String(timeoutDoc._id));
    assert.equal(inDb.payment.creationState, 'RECONCILIATION_REQUIRED');

    // Immediate retry by user must be rejected without calling provider again
    const res2 = createMockRes();
    await createRazorpayOrder({ body: { orderId: timeoutDoc._id }, user: { id: customerId } }, res2);

    assert.equal(res2.statusCode, 409);
    assert.equal(res2.jsonData.code, 'GATEWAY_RECONCILIATION_REQUIRED');
    assert.equal(providerCalls, 1, 'Provider calls must remain 1 — retries strictly blocked');
  });

  await t.test('23. Regression: quarantine database write failure still blocks retries from creating another order', async () => {
    const qFailDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 450 },
      payment: { status: 'PENDING' }
    });

    let providerCalls = 0;
    setRazorpayInstance({
      orders: {
        create: async () => {
          providerCalls++;
          const err = new Error('ECONNRESET: Connection reset by peer');
          err.code = 'ECONNRESET';
          throw err;
        }
      }
    });

    // Simulate DB failure specifically during quarantine update
    const origFindOneAndUpdateHook = Order.findOneAndUpdate;
    Order.findOneAndUpdate = async (query, update) => {
      if (update.$set && update.$set['payment.creationState'] === 'RECONCILIATION_REQUIRED') {
        throw new Error('MongoNetworkError: DB socket connection dropped');
      }
      return origFindOneAndUpdateHook(query, update);
    };

    const res1 = createMockRes();
    await createRazorpayOrder({ body: { orderId: qFailDoc._id }, user: { id: customerId } }, res1);

    Order.findOneAndUpdate = origFindOneAndUpdateHook;

    assert.equal(res1.statusCode, 500);
    assert.equal(res1.jsonData.code, 'GATEWAY_RECONCILIATION_REQUIRED');
    assert.equal(res1.jsonData.quarantine_persisted, false);
    assert.equal(providerCalls, 1);

    // Document in DB is still in DISPATCHING (quarantine write failed)
    const inDb = ordersDb.get(String(qFailDoc._id));
    assert.equal(inDb.payment.creationState, 'DISPATCHING');

    // Fast-forward lease expiration to simulate time passing after failure
    inDb.payment.creationClaimExpiresAt = new Date(Date.now() - 10000);

    // Subsequent retry: even though quarantine write failed, DISPATCHING state cannot be claimed!
    const res2 = createMockRes();
    await createRazorpayOrder({ body: { orderId: qFailDoc._id }, user: { id: customerId } }, res2);

    assert.equal(res2.statusCode, 409);
    assert.equal(res2.jsonData.code, 'GATEWAY_RECONCILIATION_REQUIRED');
    assert.equal(providerCalls, 1, 'Provider calls must remain 1 — retries cannot create another order');
  });

  await t.test('24. Controller-level stale owner guard: paused request cannot overwrite newer claim or linked gateway order', async () => {
    const pauseDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 500 },
      payment: { status: 'PENDING' }
    });

    let pauseResolve;
    const pauseBarrier = new Promise((resolve) => {
      pauseResolve = resolve;
    });

    setRazorpayInstance({
      orders: {
        create: async () => {
          // Pause this first request while it is in the middle of provider call
          await pauseBarrier;
          return {
            id: 'order_stale_loser_id_777',
            amount: 50000,
            currency: 'INR'
          };
        }
      }
    });

    const res1 = createMockRes();
    const p1 = createRazorpayOrder({ body: { orderId: pauseDoc._id }, user: { id: customerId } }, res1);

    // Wait until Request 1 has acquired claim and entered DISPATCHING
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 10));
      const inDb = ordersDb.get(String(pauseDoc._id));
      if (inDb.payment.creationState === 'DISPATCHING') break;
    }

    const inDbMid = ordersDb.get(String(pauseDoc._id));
    assert.equal(inDbMid.payment.creationState, 'DISPATCHING');
    const req1ClaimId = inDbMid.payment.creationClaimId;
    assert.ok(req1ClaimId);

    // While Request 1 is paused in provider call, simulate that another worker took over or renewed the claim
    // and successfully linked its own gateway order:
    inDbMid.payment.creationClaimId = 'newer_active_claim_999';
    inDbMid.payment.creationState = 'LINKED';
    inDbMid.payment.razorpayOrderId = 'order_newer_linked_gateway_888';

    // Now resume Request 1
    pauseResolve();
    await p1;

    // Assert that Request 1 could NOT overwrite the newer linked gateway order!
    const finalDb = ordersDb.get(String(pauseDoc._id));
    assert.equal(finalDb.payment.razorpayOrderId, 'order_newer_linked_gateway_888', 'Newer linked gateway order must remain untouched');
    assert.notEqual(finalDb.payment.razorpayOrderId, 'order_stale_loser_id_777');
    assert.equal(finalDb.payment.creationState, 'LINKED');

    // And Request 1 cleanly converged and returned the newer linked order ID
    assert.equal(res1.statusCode, 200);
    assert.equal(res1.jsonData.razorpay_order_id, 'order_newer_linked_gateway_888');
  });

  await t.test('24b. Controller-level: renewed claim between expiry inspection and quarantine is not quarantined', async () => {
    const expiredDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 300 },
      payment: {
        status: 'PENDING',
        creationState: 'DISPATCHING',
        creationClaimId: 'old_observed_claim_111',
        creationClaimExpiresAt: new Date(Date.now() - 5000) // expired 5 seconds ago
      }
    });

    // Hook Order.findOne to simulate that right after Order.findOne reads the expired claim,
    // another active worker renews the claim with a future expiration before quarantine update runs
    const origFindOne = Order.findOne;
    let findOneCount = 0;
    Order.findOne = async (query) => {
      const doc = await origFindOne(query);
      findOneCount++;
      if (findOneCount === 1 && doc && doc.payment?.creationClaimId === 'old_observed_claim_111') {
        // Concurrently renew the claim in DB before quarantine update runs
        const inDb = ordersDb.get(String(expiredDoc._id));
        inDb.payment.creationClaimId = 'renewed_future_claim_222';
        inDb.payment.creationClaimExpiresAt = new Date(Date.now() + 30000); // 30s in future
      }
      return doc;
    };

    const res = createMockRes();
    await createRazorpayOrder({ body: { orderId: expiredDoc._id }, user: { id: customerId } }, res);

    Order.findOne = origFindOne;

    // Assert that the renewed claim was NOT quarantined to RECONCILIATION_REQUIRED
    const finalDoc = ordersDb.get(String(expiredDoc._id));
    assert.equal(finalDoc.payment.creationState, 'DISPATCHING', 'Must remain DISPATCHING under the renewed claim');
    assert.equal(finalDoc.payment.creationClaimId, 'renewed_future_claim_222', 'Renewed claim must remain untouched');
    assert.notEqual(finalDoc.payment.creationState, 'RECONCILIATION_REQUIRED');
    assert.equal(res.statusCode, 409);
    assert.equal(res.jsonData.code, 'CONCURRENT_CREATION_IN_PROGRESS');
  });

  await t.test('25. Definitive rejection: 400 Bad Request from gateway safely releases claim to IDLE for retry', async () => {
    const rejectDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 100 },
      payment: { status: 'PENDING' }
    });

    setRazorpayInstance({
      orders: {
        create: async () => {
          const err = new Error('Invalid order receipt length');
          err.statusCode = 400;
          err.error = { description: 'receipt must not exceed 40 characters' };
          throw err;
        }
      }
    });

    const res = createMockRes();
    await createRazorpayOrder({ body: { orderId: rejectDoc._id }, user: { id: customerId } }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonData.code, 'GATEWAY_CREATION_FAILED');

    const inDb = ordersDb.get(String(rejectDoc._id));
    assert.equal(inDb.payment.creationState, 'IDLE');
    assert.equal(inDb.payment.creationClaimId, null);
  });

  await t.test('26. Regression: initial read sees expired DISPATCHING, but another worker links before quarantine -> returns HTTP 200 with correct amount and linked ID, zero provider calls, no ReferenceError', async () => {
    const expiredDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 275.50 }, // 27550 paise
      payment: {
        status: 'PENDING',
        creationState: 'DISPATCHING',
        creationClaimId: 'expired_claim_abc_123',
        creationClaimExpiresAt: new Date(Date.now() - 10000) // expired 10s ago
      }
    });

    let providerCalls = 0;
    setRazorpayInstance({
      orders: {
        create: async () => {
          providerCalls++;
          return { id: 'should_not_call_provider' };
        }
      }
    });

    // Hook Order.findOne: on initial read, returns the expired DISPATCHING doc.
    // Right after that read (before quarantine update runs), another worker links the order!
    const origFindOne = Order.findOne;
    let findOneCall = 0;
    Order.findOne = async (query) => {
      const doc = await origFindOne(query);
      findOneCall++;
      if (findOneCall === 1 && doc && doc.payment?.creationClaimId === 'expired_claim_abc_123') {
        const inDb = ordersDb.get(String(expiredDoc._id));
        inDb.payment.creationState = 'LINKED';
        inDb.payment.creationClaimId = null;
        inDb.payment.razorpayOrderId = 'order_linked_by_fast_worker_777';
      }
      return doc;
    };

    const res = createMockRes();
    // This MUST NOT throw ReferenceError (TDZ on amountInPaise)
    await createRazorpayOrder({ body: { orderId: expiredDoc._id }, user: { id: customerId } }, res);

    Order.findOne = origFindOne;

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonData.success, true);
    assert.equal(res.jsonData.razorpay_order_id, 'order_linked_by_fast_worker_777');
    assert.equal(res.jsonData.amount, 27550, 'Must return correct amount in paise without ReferenceError');
    assert.equal(providerCalls, 0, 'Zero provider calls must occur');
  });

  await t.test('27. Regression: recheck branch and wait loop verify PAID/REFUNDED records do not return a new checkout response', async () => {
    // 27a. Recheck branch: order transitioned to PAID while expired quarantine was being attempted
    const recheckPaidDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 150 },
      payment: {
        status: 'PENDING',
        creationState: 'DISPATCHING',
        creationClaimId: 'expired_claim_recheck_paid',
        creationClaimExpiresAt: new Date(Date.now() - 5000)
      }
    });

    const origFindOne = Order.findOne;
    let recheckCall = 0;
    Order.findOne = async (query) => {
      const doc = await origFindOne(query);
      recheckCall++;
      if (recheckCall === 1 && doc && doc.payment?.creationClaimId === 'expired_claim_recheck_paid') {
        // Concurrently mark order PAID with a linked order ID before quarantine
        const inDb = ordersDb.get(String(recheckPaidDoc._id));
        inDb.payment.status = 'PAID';
        inDb.payment.verified = true;
        inDb.payment.creationState = 'IDLE';
        inDb.payment.creationClaimId = null;
        inDb.payment.razorpayOrderId = 'order_already_settled_paid';
      }
      return doc;
    };

    const resRecheckPaid = createMockRes();
    await createRazorpayOrder({ body: { orderId: recheckPaidDoc._id }, user: { id: customerId } }, resRecheckPaid);
    Order.findOne = origFindOne;

    // Must return ORDER_ALREADY_PAID, NOT a new checkout response with razorpay_order_id!
    assert.equal(resRecheckPaid.statusCode, 400);
    assert.equal(resRecheckPaid.jsonData.code, 'ORDER_ALREADY_PAID');
    assert.equal(resRecheckPaid.jsonData.razorpay_order_id, undefined);

    // 27b. Recheck branch: order transitioned to REFUNDED while expired quarantine was being attempted
    const recheckRefundDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 180 },
      payment: {
        status: 'PENDING',
        creationState: 'DISPATCHING',
        creationClaimId: 'expired_claim_recheck_refund',
        creationClaimExpiresAt: new Date(Date.now() - 5000)
      }
    });

    let recheckRefundCall = 0;
    Order.findOne = async (query) => {
      const doc = await origFindOne(query);
      recheckRefundCall++;
      if (recheckRefundCall === 1 && doc && doc.payment?.creationClaimId === 'expired_claim_recheck_refund') {
        const inDb = ordersDb.get(String(recheckRefundDoc._id));
        inDb.payment.status = 'REFUNDED';
        inDb.payment.creationState = 'IDLE';
        inDb.payment.creationClaimId = null;
        inDb.payment.razorpayOrderId = 'order_already_refunded_123';
      }
      return doc;
    };

    const resRecheckRefund = createMockRes();
    await createRazorpayOrder({ body: { orderId: recheckRefundDoc._id }, user: { id: customerId } }, resRecheckRefund);
    Order.findOne = origFindOne;

    // Must return PAYMENT_ALREADY_REFUNDED, NOT a new checkout response!
    assert.equal(resRecheckRefund.statusCode, 400);
    assert.equal(resRecheckRefund.jsonData.code, 'PAYMENT_ALREADY_REFUNDED');
    assert.equal(resRecheckRefund.jsonData.razorpay_order_id, undefined);

    // 27c. Wait loop: order settles as PAID while request is waiting in loop
    const waitLoopPaidDoc = createMockOrderDoc({
      _id: new mongoose.Types.ObjectId().toString(),
      customer: customerId,
      pricing: { grandTotal: 220 },
      payment: {
        status: 'PENDING',
        creationState: 'DISPATCHING',
        creationClaimId: 'active_other_worker_claim',
        creationClaimExpiresAt: new Date(Date.now() + 20000)
      }
    });

    let waitLoopCall = 0;
    Order.findOne = async (query) => {
      const doc = await origFindOne(query);
      waitLoopCall++;
      // On loop inspection, order has linked razorpayOrderId BUT is also marked PAID
      if (waitLoopCall >= 2 && doc && String(doc._id) === String(waitLoopPaidDoc._id)) {
        const inDb = ordersDb.get(String(waitLoopPaidDoc._id));
        inDb.payment.status = 'PAID';
        inDb.payment.verified = true;
        inDb.payment.razorpayOrderId = 'order_paid_in_wait_loop';
        return JSON.parse(JSON.stringify(inDb));
      }
      return doc;
    };

    const resWaitPaid = createMockRes();
    await createRazorpayOrder({ body: { orderId: waitLoopPaidDoc._id }, user: { id: customerId } }, resWaitPaid);
    Order.findOne = origFindOne;

    // Must return ORDER_ALREADY_PAID, NOT checkout response
    assert.equal(resWaitPaid.statusCode, 400);
    assert.equal(resWaitPaid.jsonData.code, 'ORDER_ALREADY_PAID');
    assert.equal(resWaitPaid.jsonData.razorpay_order_id, undefined);
  });
});
