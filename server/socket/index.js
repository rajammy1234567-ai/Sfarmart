import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { canAccessOrder, idOf } from '../utils/deliveryPolicy.js';
import { scheduleLongTimeout } from '../utils/timerUtils.js';
let ioInstance;
export function initSocket(httpServer) {
 const io = new Server(httpServer, {cors:{origin:'*'},pingInterval:25000,pingTimeout:20000});
 io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    socket.user = { role: 'GUEST' };
    return next();
  }
  try {
   const jwtSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
   if (!jwtSecret) return next(new Error('AUTH_CONFIGURATION_ERROR'));
   const decoded = jwt.verify(token, jwtSecret);
   socket.user = decoded;

   // Authoritative database check during customer connection/reconnection
   if (decoded.role === 'CUSTOMER') {
     const customerId = decoded.sub || decoded.id;
     if (!customerId) return next(new Error('AUTH_REQUIRED'));
     const customerDoc = await User.findById(customerId).select('status role');
     if (!customerDoc) {
       return next(new Error('USER_NOT_FOUND'));
     }
     if (customerDoc.status !== 'ACTIVE') {
       return next(new Error('ACCOUNT_INACTIVE'));
     }
   }
   next();
  } catch (err) {
   if (err.message === 'USER_NOT_FOUND' || err.message === 'ACCOUNT_INACTIVE' || err.message === 'AUTH_CONFIGURATION_ERROR') {
     return next(err);
   }
   next(new Error('AUTH_REQUIRED'));
  }
 });
 io.on('connection', socket => {
  const user = socket.user, id = idOf(user.sub || user.id);
  const prefix = { CUSTOMER: 'customer', VENDOR: 'vendor', RIDER: 'rider' }[user.role];
  if (prefix && id) socket.join(prefix + ':' + (user.role === 'VENDOR' ? idOf(user.vendorId || id) : id));
  const expiresIn = user.exp ? (user.exp * 1000 - Date.now()) : 0;
  const expiry = Number.isFinite(expiresIn) && expiresIn > 0
    ? scheduleLongTimeout(() => socket.disconnect(true), Math.max(0, expiresIn))
    : null;
  socket.on('join:vendor', (vendorId, ack = () => {}) => {
   if (user.role !== 'VENDOR' || idOf(user.vendorId || id) !== String(vendorId)) return ack({ ok: false });
   socket.join('vendor:' + vendorId); ack({ ok: true });
  });
  socket.on('join:order', async (orderId, ack = () => {}) => {
   try {
    if (!/^[a-f0-9]{24}$/i.test(String(orderId))) return ack({ ok: false });

    // Race mitigation: re-verify customer is still ACTIVE before granting access to order room/data
    if (user.role === 'CUSTOMER') {
      const customerId = idOf(user.sub || user.id);
      const freshUser = await User.findById(customerId).select('status');
      if (!freshUser || freshUser.status !== 'ACTIVE') {
        socket.leave(`customer:${customerId}`);
        socket.disconnect(true);
        return ack({ ok: false, error: 'ACCOUNT_INACTIVE' });
      }
    }

    const order = await Order.findById(orderId)
      .select('customer vendor rider status riderLocation deliveryRoute')
      .populate('rider', 'name phone vehicleType vehicleNumber rating');
    if (!order || !canAccessOrder(user, order)) return ack({ ok: false });
    socket.join('order:' + orderId);
    const isActiveDelivery = ['READY_FOR_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status);
    ack({
      ok: true,
      snapshot: {
        orderId: order._id,
        status: order.status,
        rider: order.rider ? {
          _id: order.rider._id,
          name: order.rider.name,
          phone: order.rider.phone,
          vehicleType: order.rider.vehicleType,
          vehicleNumber: order.rider.vehicleNumber
        } : null,
        riderLocation: isActiveDelivery ? (order.riderLocation || null) : null,
        deliveryRoute: isActiveDelivery ? (order.deliveryRoute || []) : []
      }
    });
   } catch { ack({ ok: false }); }
  });
  socket.on('leave:order', id => socket.leave('order:' + id));
  socket.on('leave:vendor', id => socket.leave('vendor:' + id));
  // GPS writes go through the authenticated HTTP endpoint, never an unchecked socket payload.
  socket.on('disconnect', () => {
    if (expiry) {
      if (typeof expiry.clear === 'function') {
        expiry.clear();
      } else {
        clearTimeout(expiry);
      }
    }
  });
 });
 ioInstance=io;return io;
}
export function getIO(){return ioInstance;}
export function setIO(instance){ioInstance=instance;}
