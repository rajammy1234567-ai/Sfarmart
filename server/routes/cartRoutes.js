import express from 'express';
import {
  getCart,
  addItem,
  updateItemQty,
  removeItem,
  clearCart,
  switchVendor,
  validateCart,
  mergeCart
} from '../controllers/cartController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.use('/cart', verifyToken);

router.get('/cart', getCart);
router.post('/cart/items', addItem);
router.patch('/cart/items/:productId', updateItemQty);
router.delete('/cart/items/:productId', removeItem);
router.delete('/cart', clearCart);
router.post('/cart/switch-vendor', switchVendor);
router.post('/cart/validate', validateCart);
router.post('/cart/merge', mergeCart);

export default router;
