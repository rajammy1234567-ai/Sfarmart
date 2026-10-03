import mongoose from 'mongoose';
import { storePoint, validCoordinates, distanceKm } from '../utils/deliveryPolicy.js';
import Rider from '../models/Rider.js';
import Order from '../models/Order.js';
import { getIO } from '../socket/index.js';
import { notifyOrderStatus, notifyRiderDeliveryOffer } from './notify.js';

// In-memory tracking of pending active offers to prevent duplicate dispatches
// Map<orderId, { riderId, timeoutHandle, attempts, attemptedRiderIds: Set, expiresAt: number }>
const activeOffers = new Map();
const expiredOffers = new Map(); // `${orderId}:${riderId}` -> expiresAt timestamp

/**
 * Dispatch an order that has reached READY_FOR_RIDER to the nearest available rider
 * @param {Object} orderDoc Populated or unpopulated Mongoose order document
 */
export async function dispatchOrderToRiders(orderDoc) {
  const orderId = orderDoc._id.toString();

  // If already being offered or already assigned, avoid duplicate dispatch
  if (activeOffers.has(orderId)) {
    return;
  }

  const order = await Order.findById(orderId).populate('vendor customer');
  if (!order || order.status !== 'READY_FOR_RIDER' || order.rider) {
    return;
  }

  const attemptedRiderIds = new Set();
  await offerToNextRider(order, attemptedRiderIds);
}

/**
 * Resolves optional staging-test-only recovery scope.
 * Ordinary production recovery ignores test scoping and performs normal unscoped recovery.
 */
export function getStagingRecoveryScope() {
  const isStaging =
    process.env.STAGING_MODE === 'true' ||
    process.env.NODE_ENV === 'staging';

  // Ordinary production recovery: test-only scopes are ignored, standard unscoped recovery
  if (!isStaging) {
    return null;
  }

  const fixturePrefix = (process.env.RECOVERY_FIXTURE_PREFIX || '').trim();
  const orderPrefix = (process.env.RECOVERY_ORDER_SCOPE_PREFIX || fixturePrefix).trim();
  const riderPrefix = (process.env.RECOVERY_RIDER_SCOPE_PREFIX || fixturePrefix).trim();
  const orderIdsRaw = (process.env.RECOVERY_ORDER_IDS || '').trim();
  const riderIdsRaw = (process.env.RECOVERY_RIDER_IDS || '').trim();

  // If no test scoping variables are configured, normal staging recovery behavior
  if (!orderPrefix && !riderPrefix && !orderIdsRaw && !riderIdsRaw) {
    return null;
  }

  // Validate the test scope
  const scope = {};
  if (orderIdsRaw) {
    const ids = orderIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    for (const id of ids) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`FAIL-CLOSED: Invalid ObjectId in RECOVERY_ORDER_IDS: ${id}`);
      }
    }
    scope.orderIds = ids;
  } else if (orderPrefix) {
    if (orderPrefix.length < 5) {
      throw new Error(`FAIL-CLOSED: RECOVERY_ORDER_SCOPE_PREFIX is too short: "${orderPrefix}". Minimum 5 chars required.`);
    }
    scope.orderPrefix = orderPrefix;
  }

  if (riderIdsRaw) {
    const ids = riderIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    for (const id of ids) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`FAIL-CLOSED: Invalid ObjectId in RECOVERY_RIDER_IDS: ${id}`);
      }
    }
    scope.riderIds = ids;
  } else if (riderPrefix) {
    if (riderPrefix.length < 5) {
      throw new Error(`FAIL-CLOSED: RECOVERY_RIDER_SCOPE_PREFIX is too short: "${riderPrefix}". Minimum 5 chars required.`);
    }
    scope.riderPrefix = riderPrefix;
  }

  return scope;
}

/**
 * Find and offer to the next nearest ONLINE_IDLE rider
 */
async function offerToNextRider(order, attemptedRiderIds) {
  const orderId = order._id.toString();
  const io = getIO();

  try {
    const point = storePoint(order.vendor);
    if (!validCoordinates(point.lat, point.lng)) {
      activeOffers.delete(orderId);
      return;
    }

    const riderQuery = {
      status: 'ONLINE_IDLE',
      activeOrderId: null,
      locationUpdatedAt: { $gte: new Date(Date.now() - 120000) },
      currentLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
          $maxDistance: 8000
        }
      },
      _id: { $nin: Array.from(attemptedRiderIds) }
    };

    const scope = getStagingRecoveryScope();
    if (scope?.riderIds?.length) {
      riderQuery._id.$in = scope.riderIds.map((id) => new mongoose.Types.ObjectId(id));
    } else if (scope?.riderPrefix) {
      riderQuery.name = { $regex: `^${scope.riderPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` };
    }

    const candidateRiders = await Rider.find(riderQuery).limit(5);
    if (!candidateRiders || candidateRiders.length === 0) {
      console.log(`🛵 [RiderAssignment] No idle riders available for Order #${order.orderNumber}. Left in pool.`);
      activeOffers.delete(orderId);
      return;
    }

    const candidate = candidateRiders[0];
    const riderId = candidate._id.toString();
    attemptedRiderIds.add(riderId);
    if (mongoose.Types.ObjectId.isValid(riderId)) {
      attemptedRiderIds.add(new mongoose.Types.ObjectId(riderId));
    }

    console.log(`🎯 [RiderAssignment] Offering Order #${order.orderNumber} to Rider ${candidate.name} (${candidate.phone})`);

    const offerPayload = {
      orderId: order._id,
      orderNumber: order.orderNumber,
      storeName: order.vendor?.storeName || 'Merchant Partner',
      storeAddress: order.vendor?.address || 'Store Location',
      storePhone: order.vendor?.phone || '',
      customerName: order.customer?.name || order.address?.name || 'Customer',
      customerAddress: `${order.address?.line1 || ''}, ${order.address?.city || ''}`,
      itemsCount: order.items?.length || 1,
      totalAmount: order.pricing?.grandTotal || 0,
      paymentMethod: order.payment?.method || 'COD',
      estEarnings: 65, // ₹65 per delivery
      distanceKm: Number(distanceKm({lat:candidate.currentLocation.coordinates[1],lng:candidate.currentLocation.coordinates[0]},point).toFixed(2)),
      expiresInSeconds: 20
    };

    // Emit offer to the rider's private socket room
    if (io) {
      io.to(`rider:${riderId}`).emit('order:offer', offerPayload);
    }

    // Send push notification to rider device
    notifyRiderDeliveryOffer(riderId, offerPayload).catch(() => {});

    // Set 20-second timeout for acceptance
    const expiresAtDate = new Date(Date.now() + 20000);
    const offerId = `OFFER_${order._id}_${candidate._id}_${Date.now()}`;

    // Authoritative persisted offer record in MongoDB for cluster and restart safety
    await Order.findByIdAndUpdate(orderId, {
      $set: {
        'currentOffer.rider': candidate._id,
        'currentOffer.expiresAt': expiresAtDate,
        'currentOffer.offerId': offerId,
        'currentOffer.offeredAt': new Date()
      }
    }).catch((err) => console.warn('[RiderAssignment] Failed to persist offer details to order:', err.message));

    const timeoutHandle = setTimeout(async () => {
      console.log(`⏱️ [RiderAssignment] 20s timeout expired for Rider ${candidate.name} on Order #${order.orderNumber}`);
      activeOffers.delete(orderId);
      expiredOffers.set(`${orderId}:${riderId}`, Date.now() + 300000);

      // Invalidate persisted offer in DB
      await Order.findByIdAndUpdate(orderId, {
        $set: { 'currentOffer.expiresAt': new Date(0) }
      }).catch(() => {});

      // Re-verify order wasn't accepted in the race window
      const freshOrder = await Order.findById(orderId).populate('vendor customer');
      if (freshOrder && freshOrder.status === 'READY_FOR_RIDER' && !freshOrder.rider) {
        // Offer to next candidate if attempts < 5
        if (attemptedRiderIds.size < 5) {
          await offerToNextRider(freshOrder, attemptedRiderIds);
        } else {
          console.log(`⚠️ [RiderAssignment] Max assignment attempts reached for Order #${order.orderNumber}.`);
        }
      }
    }, 20000);
    if (typeof timeoutHandle?.unref === 'function') timeoutHandle.unref();

    activeOffers.set(orderId, {
      riderId,
      timeoutHandle,
      attemptedRiderIds,
      expiresAt: expiresAtDate.getTime()
    });
  } catch (err) {
    console.error(`🚨 [RiderAssignment] Error offering order:`, err);
    activeOffers.delete(orderId);
  }
}

/**
 * Handle rider accepting an offer
 */
export async function handleRiderAccept(orderId, riderId) {
  const orderIdStr = String(orderId);
  const riderIdStr = String(riderId);

  // Prune expired offer tombstones older than 5 minutes
  const now = Date.now();
  for (const [key, exp] of expiredOffers.entries()) {
    if (now > exp) expiredOffers.delete(key);
  }

  // 1. In-memory fast-rejection: expired or reassigned offer
  if (expiredOffers.has(`${orderIdStr}:${riderIdStr}`)) {
    return { success: false, code: 'OFFER_EXPIRED', message: 'This delivery offer has expired or was declined.' };
  }

  const activeOffer = activeOffers.get(orderIdStr);
  if (activeOffer) {
    if (activeOffer.riderId !== riderIdStr) {
      // Authoritative DB check: if DB assigned this offer to this rider, synchronize in-memory map
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        const dbOrder = await Order.findById(orderId).select('currentOffer rider status');
        if (String(dbOrder?.currentOffer?.rider) === riderIdStr) {
          activeOffers.set(orderIdStr, {
            riderId: riderIdStr,
            expiresAt: dbOrder.currentOffer.expiresAt ? new Date(dbOrder.currentOffer.expiresAt).getTime() : now + 20000
          });
        } else {
          return { success: false, code: 'OFFER_REASSIGNED', message: 'This delivery offer was reassigned to another rider.' };
        }
      } else {
        return { success: false, code: 'OFFER_REASSIGNED', message: 'This delivery offer was reassigned to another rider.' };
      }
    }
    if (activeOffer.expiresAt && now > activeOffer.expiresAt) {
      activeOffers.delete(orderIdStr);
      expiredOffers.set(`${orderIdStr}:${riderIdStr}`, now + 300000);
      return { success: false, code: 'OFFER_EXPIRED', message: 'This delivery offer has expired.' };
    }
  }

  const session = await mongoose.startSession();
  let order;
  let isNewAssignment = false;
  try {
    await session.withTransaction(async () => {
      isNewAssignment = false; // Reset on every transaction callback attempt (e.g. transient retry)
      const candidate = await Order.findOne({ _id: orderId, status: 'READY_FOR_RIDER', rider: null }).populate('vendor').session(session);
      if (!candidate) {
        // Idempotency: Check if THIS SAME rider already accepted and is assigned to this order
        const alreadyAssigned = await Order.findOne({ _id: orderId, rider: riderId }).populate('vendor customer rider').session(session);
        if (alreadyAssigned) {
          order = alreadyAssigned;
          isNewAssignment = false;
          return;
        }
        throw Object.assign(new Error('This order is no longer available for assignment.'), { code: 'ORDER_UNAVAILABLE' });
      }

      // 2. Authoritative Database Validation: Check persisted offer state
      if (candidate.currentOffer?.rider) {
        if (String(candidate.currentOffer.rider) !== riderIdStr) {
          throw Object.assign(new Error('This delivery offer was reassigned to another rider.'), { code: 'OFFER_REASSIGNED' });
        }
        if (candidate.currentOffer.expiresAt && new Date() > candidate.currentOffer.expiresAt) {
          throw Object.assign(new Error('This delivery offer has expired.'), { code: 'OFFER_EXPIRED' });
        }
      }

      const rider = await Rider.findOne({
        _id: riderId,
        status: 'ONLINE_IDLE',
        activeOrderId: null,
        locationUpdatedAt: { $gte: new Date(Date.now() - 120000) }
      }).session(session);

      if (!rider || distanceKm({ lat: rider.currentLocation?.coordinates?.[1], lng: rider.currentLocation?.coordinates?.[0] }, storePoint(candidate.vendor)) > 8) {
        throw Object.assign(new Error('Order unavailable or rider must be online with fresh GPS within 8 km of store.'), { code: 'RIDER_INELIGIBLE' });
      }

      order = await Order.findOneAndUpdate(
        {
          _id: orderId,
          status: 'READY_FOR_RIDER',
          rider: null,
          $or: [
            { 'currentOffer.rider': riderId },
            { 'currentOffer.rider': null },
            { currentOffer: { $exists: false } }
          ]
        },
        {
          $set: {
            rider: riderId,
            riderId,
            status: 'RIDER_ASSIGNED',
            riderAssignedAt: new Date(),
            riderAcceptedAt: new Date(),
            'currentOffer.expiresAt': null // Clear active window
          },
          $push: { statusHistory: { status: 'RIDER_ASSIGNED', at: new Date(), by: 'RIDER' } }
        },
        { new: true, session }
      ).populate('vendor customer rider');

      const assigned = await Rider.findOneAndUpdate(
        { _id: riderId, status: 'ONLINE_IDLE', activeOrderId: null },
        { $set: { status: 'ON_DELIVERY', activeOrderId: orderId } },
        { new: true, session }
      );
      if (!order || !assigned) throw Object.assign(new Error('Another delivery was accepted. Refresh and retry.'), { code: 'ORDER_RACE_LOST' });
      isNewAssignment = true;
    });
  } catch (error) {
    return { success: false, code: error.code || 'ACCEPT_FAILED', message: error.message };
  } finally {
    await session.endSession();
  }

  const offer = activeOffers.get(orderIdStr);
  if (offer) {
    clearTimeout(offer.timeoutHandle);
    activeOffers.delete(orderIdStr);
  }
  expiredOffers.delete(`${orderIdStr}:${riderIdStr}`);

  // Only emit socket events and notify customer/vendor if this execution committed a NEW assignment
  if (isNewAssignment) {
    notifyOrderStatus(order);

    const io = getIO();
    if (io) {
      const riderPayload = {
        orderId: order._id,
        orderNumber: order.orderNumber,
        rider: {
          id: order.rider._id,
          name: order.rider.name,
          phone: order.rider.phone,
          vehicleType: order.rider.vehicleType,
          vehicleNumber: order.rider.vehicleNumber,
          rating: order.rider.rating
        }
      };
      io.to(`order:${order._id}`).emit('order:rider_assigned', riderPayload);
      if (order.customer?._id) {
        io.to(`customer:${order.customer._id}`).emit('order:rider_assigned', riderPayload);
      }
    }
  }

  return { success: true, order, isDuplicate: !isNewAssignment };
}

/**
 * Handle rider declining an offer
 */
export async function handleRiderDecline(orderId, riderId) {
  const orderIdStr = String(orderId);
  const riderIdStr = String(riderId);
  const offer = activeOffers.get(orderIdStr);
  if (!offer || offer.riderId !== riderIdStr) return { success: false, message: 'This offer is not assigned to you.' };
  if (offer) {
    clearTimeout(offer.timeoutHandle);
    activeOffers.delete(orderIdStr);
  }
  expiredOffers.set(`${orderIdStr}:${riderIdStr}`, Date.now() + 300000);

  // Invalidate persisted offer in DB
  await Order.findByIdAndUpdate(orderId, {
    $set: { 'currentOffer.expiresAt': new Date(0) }
  }).catch(() => {});

  const order = await Order.findById(orderId).populate('vendor customer');
  if (order && order.status === 'READY_FOR_RIDER' && !order.rider) {
    const attempted = offer?.attemptedRiderIds || new Set([riderIdStr]);
    attempted.add(riderIdStr);
    await offerToNextRider(order, attempted);
  }

  return { success: true, message: 'Offer declined. Order reassigned.' };
}

/**
 * Background recovery of pending rider offers and redispatches across server restarts
 */
export async function recoverPendingDispatches() {
  try {
    if (mongoose.connection.readyState === 2) {
      await new Promise((resolve) => {
        mongoose.connection.once('connected', resolve);
        setTimeout(resolve, 5000);
      });
    }

    const scope = getStagingRecoveryScope();
    const query = {
      status: 'READY_FOR_RIDER',
      rider: null
    };

    if (scope?.orderIds?.length) {
      query._id = { $in: scope.orderIds.map((id) => new mongoose.Types.ObjectId(id)) };
    } else if (scope?.orderPrefix) {
      query.clientOrderId = { $regex: `^${scope.orderPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` };
    }

    const pendingOrders = await Order.find(query).populate('vendor customer');

    if (!pendingOrders || pendingOrders.length === 0) {
      return;
    }

    console.log(`🔄 [RiderAssignment] Recovering ${pendingOrders.length} pending order(s) in READY_FOR_RIDER...`);

    const now = Date.now();
    for (const order of pendingOrders) {
      const orderId = order._id.toString();
      const currentOffer = order.currentOffer;
      const attemptedRiderIds = new Set();

      if (currentOffer?.rider) {
        const prevRiderId = currentOffer.rider.toString();
        const expiresAt = currentOffer.expiresAt ? new Date(currentOffer.expiresAt).getTime() : 0;

        if (expiresAt && now >= expiresAt) {
          // Offer expired while server was offline / restarting
          console.log(`⏱️ [RiderAssignment] Recovering expired offer on Order #${order.orderNumber} for previous Rider ${prevRiderId}`);
          attemptedRiderIds.add(prevRiderId);
          if (mongoose.Types.ObjectId.isValid(prevRiderId)) {
            attemptedRiderIds.add(new mongoose.Types.ObjectId(prevRiderId));
          }
          expiredOffers.set(`${orderId}:${prevRiderId}`, now + 300000);

          // Invalidate old offer in DB
          await Order.findByIdAndUpdate(orderId, {
            $set: { 'currentOffer.expiresAt': new Date(0) }
          }).catch(() => {});

          // Redispatch to the next eligible candidate rider
          await offerToNextRider(order, attemptedRiderIds);
        } else if (expiresAt && now < expiresAt) {
          // Offer still active; re-arm timeout for remaining duration
          const remainingMs = Math.max(1000, expiresAt - now);
          console.log(`⏳ [RiderAssignment] Re-arming active offer on Order #${order.orderNumber} (${remainingMs}ms remaining)`);

          const timeoutHandle = setTimeout(async () => {
            activeOffers.delete(orderId);
            expiredOffers.set(`${orderId}:${prevRiderId}`, Date.now() + 300000);
            await Order.findByIdAndUpdate(orderId, {
              $set: { 'currentOffer.expiresAt': new Date(0) }
            }).catch(() => {});

            const freshOrder = await Order.findById(orderId).populate('vendor customer');
            if (freshOrder && freshOrder.status === 'READY_FOR_RIDER' && !freshOrder.rider) {
              attemptedRiderIds.add(prevRiderId);
              if (attemptedRiderIds.size < 5) {
                await offerToNextRider(freshOrder, attemptedRiderIds);
              }
            }
          }, remainingMs);
          if (typeof timeoutHandle?.unref === 'function') timeoutHandle.unref();

          activeOffers.set(orderId, {
            riderId: prevRiderId,
            timeoutHandle,
            attemptedRiderIds,
            expiresAt
          });
        }
      } else {
        // No offer was placed yet; dispatch fresh
        await dispatchOrderToRiders(order);
      }
    }
  } catch (err) {
    console.error('🚨 [RiderAssignment] Error recovering pending dispatches:', err.message);
  }
}

// Test-only helpers for in-memory offer state inspection
export function _setOfferForTest(orderId, offer) {
  activeOffers.set(String(orderId), offer);
}
export function _expireOfferForTest(orderId, riderId) {
  expiredOffers.set(`${orderId}:${riderId}`, Date.now() + 300000);
}
export function _clearOffersForTest() {
  activeOffers.clear();
  expiredOffers.clear();
}
