import express from 'express';
import { getPublicBanners } from '../controllers/bannerController.js';

const router = express.Router();

// Public: Get active banners for Customer Home
router.get('/banners', getPublicBanners);

export default router;
