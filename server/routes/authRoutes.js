import express from 'express';
import {
  requestOtp,
  verifyOtp,
  refreshToken,
  logout,
  logoutAll,
  getMe,
  updateProfile,
  deleteAccount,
  customerLogin,
  vendorLogin,
  registerPushToken
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Primary Auth Endpoints
router.post('/otp/request', requestOtp);
router.post('/otp/verify', verifyOtp);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.post('/logout-all', requireAuth, logoutAll);
router.get('/me', requireAuth, getMe);
router.patch('/me', requireAuth, updateProfile);
router.post('/account/delete', requireAuth, deleteAccount);

// Backward Compatibility Endpoints
router.post('/customer/login', customerLogin);
router.post('/vendor/login', vendorLogin);
router.post('/push-token', requireAuth, registerPushToken);

export default router;
