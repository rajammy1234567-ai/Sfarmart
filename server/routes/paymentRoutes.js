import express from 'express';
import { createRazorpayOrder, verifyRazorpayPayment } from '../controllers/paymentController.js';
import { verifyToken } from '../middleware/auth.js';
const router = express.Router();

router.post('/create-order', verifyToken, createRazorpayOrder);
router.post('/verify-payment', verifyToken, verifyRazorpayPayment);

export default router;
