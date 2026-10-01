import express from 'express';
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
router.patch('/status', verifyToken, toggleRiderStatus);
router.patch('/duty/status', verifyToken, toggleRiderStatus);
router.post('/location', verifyToken, updateRiderLocation);
router.get('/active-order', verifyToken, getActiveDeliveryOrder);
router.post('/orders/:id/accept', verifyToken, acceptOrderOffer);
router.post('/orders/:id/decline', verifyToken, declineOrderOffer);
router.post('/orders/:id/arrived-store', verifyToken, arrivedAtStore);
router.post('/orders/:id/pickup-verify', verifyToken, verifyPickup);
router.post('/orders/:id/delivery-verify', verifyToken, verifyDelivery);
router.get('/profile', verifyToken, getRiderProfile);
router.get('/earnings', verifyToken, getRiderEarnings);

export default router;
