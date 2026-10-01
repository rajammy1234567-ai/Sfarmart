import express from 'express';
import {
  getAllProducts,
  getProductById,
  getVendorProducts,
  createProduct,
  updateProduct,
  toggleProductStock,
  deleteProduct
} from '../controllers/productController.js';
import { optionalAuth, verifyToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/products', getAllProducts);
router.get('/products/:id', getProductById);
router.get('/products/vendor/:vendorId', getVendorProducts);

// Vendor-protected / authenticated routes
router.post('/products', verifyToken, requireRole('VENDOR', 'ADMIN'), createProduct);
router.put('/products/:id', verifyToken, requireRole('VENDOR', 'ADMIN'), updateProduct);
router.patch('/products/:id/stock', verifyToken, requireRole('VENDOR', 'ADMIN'), toggleProductStock);
router.delete('/products/:id', verifyToken, requireRole('VENDOR', 'ADMIN'), deleteProduct);

export default router;
