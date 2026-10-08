import express from 'express';
import { deliveryVerificationLimiter } from '../middleware/accountLimiter.js';
import { orderForRole } from '../utils/deliveryPolicy.js';
import {
  riderLogin,
  riderRefresh,
  riderLogout,
  toggleRiderStatus,
  updateRiderLocation,
  getActiveDeliveryOrder,
  acceptOrderOffer,
  declineOrderOffer,
  arrivedAtStore,
  verifyPickup,
  verifyDelivery,
  getRiderProfile,
  getRiderEarnings
} from '../controllers/riderController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use((req,res,next) => {
  const json = res.json.bind(res);
  res.json = body => { if (body?.order) body.order = orderForRole(body.order, 'RIDER'); return json(body); };
  next();
});

// Public auth routes
router.post('/auth/login', riderLogin);
router.post('/auth/refresh', riderRefresh);
router.use(verifyToken, requireRole('RIDER'));
router.post('/auth/logout', riderLogout);

// Protected rider operational routes
router.patch('/status', toggleRiderStatus);
router.patch('/duty/status', toggleRiderStatus);
router.post('/location', updateRiderLocation);
router.get('/active-order', getActiveDeliveryOrder);
router.post('/orders/:id/accept', acceptOrderOffer);
router.post('/orders/:id/decline', declineOrderOffer);
router.post('/orders/:id/arrived-store', arrivedAtStore);
router.post('/orders/:id/pickup-verify', deliveryVerificationLimiter, verifyPickup);
router.post('/orders/:id/delivery-verify', deliveryVerificationLimiter, verifyDelivery);
router.get('/profile', getRiderProfile);
router.get('/earnings', getRiderEarnings);

export default router;
