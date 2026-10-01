import { getIO } from '../socket/index.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';

/**
 * Send push notification using Expo Push API
 */
async function sendExpoPushNotification(tokens, title, body, data = {}) {
  if (process.env.DISABLE_EXTERNAL_NOTIFICATIONS === 'true') return;
  if (!tokens || !tokens.length) return;

  const validTokens = tokens.filter(
    (t) => typeof t === 'string' && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['))
  );

  if (!validTokens.length) return;

  const messages = validTokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
    channelId: 'orders'
  }));

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messages)
    });
    const result = await response.json();
    console.log('📱 Expo push sent:', result);
  } catch (err) {
    console.warn('⚠️ Expo push send failed:', err.message);
  }
}

/**
 * Notify vendor about a brand new order in real-time
 */
export async function notifyNewOrder(order) {
  try {
    const io = getIO();
    const vendorId = (order.vendor?._id || order.vendor).toString();

    const payload = {
      orderId: order._id,
      vendorId: vendorId,
      orderNumber: order.orderNumber,
      clientOrderId: order.clientOrderId,
      customer: {
        name: order.address?.name || order.customer?.name || 'Customer',
        phone: order.address?.phone || order.customer?.phone || ''
      },
      items: order.items,
      pricing: order.pricing,
      placedAt: order.placedAt || new Date(),
      status: order.status
    };

    if (io) {
      console.log(`🚀 Emitting 'order:new' to room: vendor:${vendorId}`);
      io.to(`vendor:${vendorId}`).emit('order:new', payload);
    }

    // Push notification to vendor device
    const vendorDoc = await Vendor.findById(vendorId).select('expoPushTokens storeName');
    if (vendorDoc?.expoPushTokens?.length) {
      sendExpoPushNotification(
        vendorDoc.expoPushTokens,
        `🔔 NEW ORDER #${order.orderNumber}!`,
        `${order.items.length} item(s) • ₹${order.pricing?.grandTotal || 0}. Tap to accept.`,
        { orderId: order._id, type: 'NEW_ORDER' }
      );
    }
  } catch (err) {
    console.error('Error notifying new order:', err);
  }
}

/**
 * Notify customer and order room when order status changes
 */
export async function notifyOrderStatus(order) {
  try {
    const io = getIO();
    const customerId = (order.customer?._id || order.customer)?.toString();
    const vendorId = (order.vendor?._id || order.vendor)?.toString();
    const orderId = order._id.toString();

    const payload = {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      statusHistory: order.statusHistory,
      rejectionReason: order.rejectionReason,
      updatedAt: new Date()
    };

    if (io) {
      console.log(`📢 Emitting 'order:status' (${order.status}) for order: ${orderId}`);
      io.to(`order:${orderId}`).emit('order:status', payload);
      if (customerId) {
        io.to(`customer:${customerId}`).emit('order:status', payload);
      }
      const riderId=(order.rider?._id || order.rider)?.toString();
      if(riderId) io.to('rider:'+riderId).emit('order:status',payload);
      if (vendorId) {
        io.to(`vendor:${vendorId}`).emit('order:status', payload);
      }
    }

    // Push notification to customer
    if (customerId) {
      const userDoc = await User.findById(customerId).select('expoPushTokens');
      if (userDoc?.expoPushTokens?.length) {
        let statusTitle = `Order #${order.orderNumber} Update`;
        let statusBody = `Current status: ${order.status}`;

        if (order.status === 'ACCEPTED') {
          statusTitle = '👨‍🍳 Order Accepted!';
          statusBody = 'The store has accepted your order and will start preparation.';
        } else if (order.status === 'PREPARING') {
          statusTitle = '🍳 Being Prepared';
          statusBody = 'Your delicious food is being freshly prepared.';
        } else if (order.status === 'READY_FOR_RIDER') {
          statusTitle = '📦 Order Ready';
          statusBody = 'Your order is packed and ready for delivery partner pickup.';
        } else if (order.status === 'OUT_FOR_DELIVERY') {
          statusTitle = '🛵 Out for Delivery';
          statusBody = 'Our delivery partner is on the way to your address!';
        } else if (order.status === 'DELIVERED') {
          statusTitle = '✅ Order Delivered!';
          statusBody = 'Enjoy your fresh meal/groceries. Thank you for choosing Farmart!';
        } else if (order.status === 'REJECTED') {
          statusTitle = '❌ Order Not Accepted';
          statusBody = order.rejectionReason || 'The store is unable to accept your order right now.';
        }

        sendExpoPushNotification(userDoc.expoPushTokens, statusTitle, statusBody, {
          orderId: order._id,
          type: 'STATUS_UPDATE',
          status: order.status
        });
      }
    }
  } catch (err) {
    console.error('Error notifying order status:', err);
  }
}

/**
 * Broadcast real-time stock and availability changes to all connected users & vendors
 */
export function notifyProductStock(product) {
  try {
    const io = getIO();
    if (!io) return;

    const payload = {
      productId: (product._id || product.id).toString(),
      vendorId: (product.vendor?._id || product.vendor)?.toString(),
      stockQty: product.stockQty,
      inStock: product.inStock,
      updatedAt: new Date()
    };

    console.log(`📦 Broadcasting 'product:stock' update for ${product.name || payload.productId}: stock=${payload.stockQty}, inStock=${payload.inStock}`);
    io.emit('product:stock', payload);
  } catch (err) {
    console.warn('Failed to broadcast product:stock:', err);
  }
}
