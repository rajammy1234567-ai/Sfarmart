import express from 'express';
import { adminLogin, createSubAdmin, getAdminData, updateApplicationStatus } from '../controllers/adminController.js';
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

export default router;

