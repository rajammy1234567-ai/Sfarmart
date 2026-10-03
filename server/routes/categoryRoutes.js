import express from 'express';
import {
  getAllCategories,
  getCategoryBySlug,
  getVendorsByCategory,
  createCategory,
  requestCategory,
  getMyCategoryRequests
} from '../controllers/categoryController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Public discovery endpoints
router.get('/categories', getAllCategories);
router.get('/categories/:slug', getCategoryBySlug);
router.get('/categories/:slug/vendors', getVendorsByCategory);

// Moderated partner request endpoints
router.post('/categories/request', verifyToken, requireRole('VENDOR', 'ADMIN'), requestCategory);
router.get('/categories/my-requests', verifyToken, requireRole('VENDOR', 'ADMIN'), getMyCategoryRequests);

// Admin-only direct creation endpoint (strictly rejects non-admins with 403)
router.post('/categories', verifyToken, requireRole('ADMIN'), createCategory);

export default router;
