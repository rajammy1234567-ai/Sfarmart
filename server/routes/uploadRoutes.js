// uploadRoutes.js – Routes for authenticating and serving durable product & shop images
import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { verifyToken, requireRole } from '../middleware/auth.js';
import {
  uploadProductImage,
  serveProductImage,
  uploadShopPhoto,
  serveShopPhoto,
  deleteShopPhoto
} from '../controllers/uploadController.js';

const router = express.Router();

// Memory storage keeps buffer in RAM for magic byte inspection and streaming into GridFS
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max per photo
    files: 1
  }
});

// Dedicated upload rate limiter (prevents abuse / spamming binary uploads)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // 60 uploads per 15 minutes per vendor IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Upload limit reached. Please wait a few minutes before uploading more photos.'
  }
});

// Route-scoped Cross-Origin-Resource-Policy middleware
// Public product and shop images must be embeddable across origins (partner web on 8082, customer web, etc.)
// Helmet defaults to same-origin; this overrides CORP specifically for public image routes.
const publicImageCorpMiddleware = (_req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
};

// Authenticated vendor photo upload
router.post(
  '/uploads/product-image',
  uploadLimiter,
  verifyToken,
  requireRole('VENDOR', 'ADMIN'),
  upload.single('image'),
  uploadProductImage
);

// Public serving endpoint for persistent product images
router.get('/uploads/product-images/:id', publicImageCorpMiddleware, serveProductImage);

// Authenticated vendor shop cover photo upload
router.post(
  '/uploads/shop-photo',
  uploadLimiter,
  verifyToken,
  requireRole('VENDOR', 'ADMIN'),
  upload.single('image'),
  uploadShopPhoto
);

// Authenticated vendor shop cover photo deletion
router.delete(
  '/uploads/shop-photo',
  verifyToken,
  requireRole('VENDOR', 'ADMIN'),
  deleteShopPhoto
);

// Public serving endpoint for persistent shop cover photos
router.get('/uploads/shop-photos/:id', publicImageCorpMiddleware, serveShopPhoto);

export default router;
