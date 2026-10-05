import express from 'express';
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
  razorpayWebhook
} from '../controllers/paymentController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Webhook endpoint: raw-body signature verification with RAZORPAY_WEBHOOK_SECRET
// NOTE: Does NOT require customer JWT authentication
router.post('/payments/razorpay/webhook', razorpayWebhook);
router.post('/payment/razorpay/webhook', razorpayWebhook);

// Authenticated customer checkout endpoints (rate limited in server.js)
router.post('/create-order', verifyToken, createRazorpayOrder);
router.post('/verify-payment', verifyToken, verifyRazorpayPayment);

// Standard namespace alias (rate limited in server.js)
router.post('/payment/create-order', verifyToken, createRazorpayOrder);
router.post('/payment/verify-payment', verifyToken, verifyRazorpayPayment);

export default router;
