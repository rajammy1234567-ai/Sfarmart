import express from 'express';
import { orderForRole } from '../utils/deliveryPolicy.js';
import {
  createOrder,
  getOrderById,
  getCustomerOrders,
  getVendorOrders,
  getDeliveryOrders,
  updateOrderStatus,
  getOrderLocation,
  getOrderRouteEta
} from '../controllers/orderController.js';
import { requireRole, verifyToken } from '../middleware/auth.js';

const router = express.Router();
router.use((req,res,next) => {
  const json = res.json.bind(res);
  res.json = body => {
    if (body?.order) body.order = orderForRole(body.order, req.user?.role);
    if (body?.orders) body.orders = body.orders.map(o => orderForRole(o, req.user?.role));
    return json(body);
  };
  next();
});

router.post('/orders', verifyToken, requireRole('CUSTOMER'), createOrder);
router.get('/orders/customer/my', verifyToken, requireRole('CUSTOMER'), getCustomerOrders);
router.get('/orders/delivery/pending', verifyToken, requireRole('RIDER'), getDeliveryOrders);
router.get('/orders/delivery', verifyToken, requireRole('RIDER'), getDeliveryOrders);
router.get('/orders/vendor/:vendorId', verifyToken, getVendorOrders);
router.get('/orders/:id/location', verifyToken, getOrderLocation);
router.get('/orders/:id/route-eta', verifyToken, getOrderRouteEta);
router.get('/orders/:id', verifyToken, getOrderById);
router.patch('/orders/:id/status', verifyToken, updateOrderStatus);
router.put('/orders/:id/status', verifyToken, updateOrderStatus);

export default router;
