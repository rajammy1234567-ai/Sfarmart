import express from 'express';
import { getPublicHomeSections } from '../controllers/homeSectionController.js';

const router = express.Router();

// Public: Get active promotional & product sections for Customer Home
router.get('/home-sections', getPublicHomeSections);

export default router;
