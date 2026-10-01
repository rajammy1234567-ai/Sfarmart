import express from 'express';
import {
  getAllVendors,
  getVendorById,
  getVendorProducts,
  toggleStoreStatus,
  getVendorOrders,
  getVendorStats,
  updateVendorProfile
} from '../controllers/vendorController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/vendors', getAllVendors);
router.get('/vendors/:id', getVendorById);
router.get('/vendors/:id/products', getVendorProducts);

// Vendor-protected routes
router.patch('/vendors/toggle-store', verifyToken, requireRole('VENDOR'), toggleStoreStatus);
router.get('/vendors/me/orders', verifyToken, requireRole('VENDOR'), getVendorOrders);
router.get('/vendors/me/stats', verifyToken, requireRole('VENDOR'), getVendorStats);
router.patch('/vendors/me/profile', verifyToken, requireRole('VENDOR'), updateVendorProfile);

export default router;
