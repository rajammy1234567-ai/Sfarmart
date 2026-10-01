import express from 'express';
import {
  getAllCategories,
  getCategoryBySlug,
  getVendorsByCategory
} from '../controllers/categoryController.js';

const router = express.Router();

router.get('/categories', getAllCategories);
router.get('/categories/:slug', getCategoryBySlug);
router.get('/categories/:slug/vendors', getVendorsByCategory);

export default router;
