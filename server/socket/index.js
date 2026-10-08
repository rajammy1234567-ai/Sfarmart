import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import Rider from '../models/Rider.js';
import Admin from '../models/Admin.js';
import { createEventBudget, boundedInteger } from '../utils/requestPolicy.js';
import { canAccessOrder, idOf } from '../utils/deliveryPolicy.js';
import { scheduleLongTimeout } from '../utils/timerUtils.js';
let ioInstance;
export function initSocket(httpServer) {
 const allowedOrigins = (process.env.CLIENT_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
 const originAllowed = origin => !origin || allowedOrigins.includes(origin) ||
   ((process.env.NODE_ENV !== 'production' || process.env.STAGING_MODE === 'true') && /^http:\/\/(localhost|127\.0\.0\.1):(517[3-9]|808[1-5])$/.test(origin));
 const io = new Server(httpServer, {
   cors: { origin: (origin, cb) => cb(null, originAllowed(origin)) },
   allowRequest: (req, cb) => cb(null, originAllowed(req.headers.origin) && io.engine.clientsCount < boundedInteger(process.env.SOCKET_MAX_CONNECTIONS, 6000, 50, 10000)),
   maxHttpBufferSize: 16384, pingInterval: 25000, pingTimeout: 20000
 });
 const accountConnections = new Map();
 io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    socket.user = { role: 'GUEST' };
    return next();
  }
  try {
   const jwtSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
   if (!jwtSecret) return next(new Error('AUTH_CONFIGURATION_ERROR'));
   const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
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
   if (decoded.role === 'VENDOR') {
     const vendor = await Vendor.findById(decoded.vendorId || decoded.sub || decoded.id).select('isActive isApproved');
     if (!vendor?.isActive || !vendor?.isApproved) return next(new Error('ACCOUNT_INACTIVE'));
   } else if (decoded.role === 'RIDER') {
     if (!await Rider.exists({ _id: decoded.sub || decoded.id })) return next(new Error('USER_NOT_FOUND'));
   }
   if (['ADMIN', 'superadmin', 'subadmin'].includes(decoded.role)) {
     const adminId = decoded.sub || decoded.id;
     const admin = /^[a-f0-9]{24}$/i.test(String(adminId)) ? await Admin.findById(adminId) : await Admin.findOne({ id: adminId });
     if (!admin) return next(new Error('USER_NOT_FOUND'));
     // Normalize legacy admin role claims only after checking the authoritative record.
     socket.user = { ...decoded, role: 'ADMIN' };
   }
   if (!['CUSTOMER', 'VENDOR', 'RIDER', 'ADMIN', 'superadmin', 'subadmin'].includes(decoded.role)) return next(new Error('AUTH_REQUIRED'));
   const key = `${decoded.role}:${decoded.role === 'VENDOR' ? decoded.vendorId || decoded.sub || decoded.id : decoded.sub || decoded.id}`;
   const count = accountConnections.get(key) || 0;
   if (count >= 4) return next(new Error('TOO_MANY_CONNECTIONS'));
   accountConnections.set(key, count + 1);
   let released = false;
   const release = () => {
     if (released) return;
     released = true;
     const remaining = (accountConnections.get(key) || 1) - 1;
     if (remaining <= 0) accountConnections.delete(key); else accountConnections.set(key, remaining);
   };
   socket.once('disconnect', release);
   socket.conn.once('close', release);
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
  const budget = createEventBudget();
  // Runs before room handlers, including unknown events; limits database amplification.
  socket.use((_packet, next) => budget() ? next() : (socket.disconnect(true), undefined));
  const prefix = { CUSTOMER: 'customer', VENDOR: 'vendor', RIDER: 'rider' }[user.role];
  if (prefix && id) socket.join(prefix + ':' + (user.role === 'VENDOR' ? idOf(user.vendorId || id) : id));
  const expiresIn = user.exp ? (user.exp * 1000 - Date.now()) : 0;
  const expiry = Number.isFinite(expiresIn) && expiresIn > 0
    ? scheduleLongTimeout(() => socket.disconnect(true), Math.max(0, expiresIn))
    : null;
  socket.on('join:vendor', (vendorId, reply) => {
   const ack = typeof reply === 'function' ? reply : () => {};
   if (user.role !== 'VENDOR' || idOf(user.vendorId || id) !== String(vendorId)) return ack({ ok: false });
   socket.join('vendor:' + vendorId); ack({ ok: true });
  });
  // Public stock updates contain only data already exposed by the vendor catalog API.
  socket.on('join:catalog', async (vendorId, reply) => {
   const ack = typeof reply === 'function' ? reply : () => {};
   if (typeof vendorId !== 'string' || !/^[a-f0-9]{24}$/i.test(vendorId)) return ack({ ok: false });
   const room = 'catalog:' + vendorId.toLowerCase();
   if (!socket.rooms.has(room) && socket.rooms.size >= 10) return ack({ ok: false, error: 'TOO_MANY_ROOMS' });
   try { await socket.join(room); ack({ ok: true }); } catch { ack({ ok: false }); }
  });
  socket.on('leave:catalog', vendorId => {
   if (typeof vendorId === 'string' && /^[a-f0-9]{24}$/i.test(vendorId)) socket.leave('catalog:' + vendorId.toLowerCase());
  });
  let joiningOrder = false;
  socket.on('join:order', async (orderId, reply) => {
   const ack = typeof reply === 'function' ? reply : () => {};
   if (!['CUSTOMER', 'VENDOR', 'RIDER', 'ADMIN', 'superadmin', 'subadmin'].includes(user.role)) return ack({ ok: false });
   if (joiningOrder || socket.rooms.size >= 10) return ack({ ok: false, error: 'TOO_MANY_REQUESTS' });
   joiningOrder = true;
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
    if (!socket.connected) return;
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
   } catch { ack({ ok: false }); } finally { joiningOrder = false; }
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
