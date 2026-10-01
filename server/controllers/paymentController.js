import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';

const getRazorpayInstance = () => {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

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

    if (order.payment?.status === 'PAID' || order.payment?.verified === true) {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    // NOTE: confirm whether grandTotal is stored in rupees or paise
    // (check server/scripts/migrate-money-to-paise.js). This assumes rupees.
    const amountInPaise = Math.round(order.pricing.grandTotal * 100);

    const razorpayInstance = getRazorpayInstance();
    const razorpayOrder = await razorpayInstance.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `order_${order._id}`,
    });

    await Order.findByIdAndUpdate(order._id, {
      $set: { 'payment.razorpayOrderId': razorpayOrder.id },
    });

    res.json({
      success: true,
      razorpay_order_id: razorpayOrder.id,
      amount: amountInPaise,
      key_id: process.env.RAZORPAY_KEY_ID, // public, safe to expose
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
};

export const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = req.user?.id || req.user?._id;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment details' });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const actualBuf = Buffer.from(razorpay_signature || '', 'utf8');

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      return res.status(400).json({ success: false, message: 'Invalid signature, payment failed' });
    }

    const order = await Order.findOne({
      'payment.razorpayOrderId': razorpay_order_id,
      customer: userId,
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found for this payment' });
    }

    if (order.payment?.verified === true) {
      return res.json({ success: true, message: 'Payment already verified' });
    }

    const updated = await Order.findOneAndUpdate(
      { _id: order._id, 'payment.verified': { $ne: true } },
      {
        $set: {
          'payment.status': 'PAID',
          'payment.paymentId': razorpay_payment_id,
          'payment.verified': true,
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.json({ success: true, message: 'Payment already verified' });
    }

    res.json({ success: true, message: 'Payment verified successfully' });
  } catch (error) {
    console.error('Error verifying payment:', error.message);
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
};