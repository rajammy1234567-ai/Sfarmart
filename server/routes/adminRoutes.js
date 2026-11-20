import express from 'express';
import { adminLogin, createSubAdmin, getAdminData, updateApplicationStatus } from '../controllers/adminController.js';
import {
  getCategoryRequestsAdmin,
  approveCategoryRequestAdmin,
  rejectCategoryRequestAdmin,
  mapCategoryRequestAdmin,
  getAllCategoriesAdmin,
  updateCategoryAdmin
} from '../controllers/categoryController.js';
import {
  getAllBannersAdmin,
  createBannerAdmin,
  updateBannerAdmin,
  deleteBannerAdmin
} from '../controllers/bannerController.js';
import {
  getAllHomeSectionsAdmin,
  createHomeSectionAdmin,
  updateHomeSectionAdmin,
  deleteHomeSectionAdmin
} from '../controllers/homeSectionController.js';
import { verifyToken, requireRole, requireSuperAdmin, requireAdminModule } from '../middleware/auth.js';

const router = express.Router();

// Public admin login
router.post('/login', adminLogin);

// Protected admin management endpoints
// Superadmin only: creating subadmins or changing permissions
router.post('/create-subadmin', verifyToken, requireRole('ADMIN'), requireSuperAdmin, createSubAdmin);

// Data retrieval: filtered by authoritative DB module access for subadmins
router.get('/data', verifyToken, requireRole('ADMIN'), getAdminData);

// Application status update: requires respective module permissions ('partners' or 'jobs')
router.post(
  '/update-status',
  verifyToken,
  requireRole('ADMIN'),
  requireAdminModule((req) => {
    if (req.body?.type === 'partner') return 'partners';
    if (req.body?.type === 'job') return 'jobs';
    return null;
  }),
  updateApplicationStatus
);

// =========================================================================
// Category Moderation & Curation Endpoints (Admin Protected)
// =========================================================================
router.get('/category-requests', verifyToken, requireRole('ADMIN'), getCategoryRequestsAdmin);
router.post('/category-requests/:id/approve', verifyToken, requireRole('ADMIN'), approveCategoryRequestAdmin);
router.post('/category-requests/:id/reject', verifyToken, requireRole('ADMIN'), rejectCategoryRequestAdmin);
router.post('/category-requests/:id/map', verifyToken, requireRole('ADMIN'), mapCategoryRequestAdmin);

router.get('/categories', verifyToken, requireRole('ADMIN'), getAllCategoriesAdmin);
router.put('/categories/:id', verifyToken, requireRole('ADMIN'), updateCategoryAdmin);
router.patch('/categories/:id', verifyToken, requireRole('ADMIN'), updateCategoryAdmin);

// =========================================================================
// Banner Management Endpoints (Admin Protected)
// =========================================================================
router.get('/banners', verifyToken, requireRole('ADMIN'), getAllBannersAdmin);
router.post('/banners', verifyToken, requireRole('ADMIN'), createBannerAdmin);
router.put('/banners/:id', verifyToken, requireRole('ADMIN'), updateBannerAdmin);
router.patch('/banners/:id', verifyToken, requireRole('ADMIN'), updateBannerAdmin);
router.delete('/banners/:id', verifyToken, requireRole('ADMIN'), deleteBannerAdmin);

// =========================================================================
// Home Promotional & Product Sections Management (Admin Protected)
// =========================================================================
router.get('/home-sections', verifyToken, requireRole('ADMIN'), getAllHomeSectionsAdmin);
router.post('/home-sections', verifyToken, requireRole('ADMIN'), createHomeSectionAdmin);
router.put('/home-sections/:id', verifyToken, requireRole('ADMIN'), updateHomeSectionAdmin);
router.patch('/home-sections/:id', verifyToken, requireRole('ADMIN'), updateHomeSectionAdmin);
router.delete('/home-sections/:id', verifyToken, requireRole('ADMIN'), deleteHomeSectionAdmin);

export default router;
