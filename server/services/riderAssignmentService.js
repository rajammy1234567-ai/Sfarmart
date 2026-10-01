import mongoose from 'mongoose';
import { storePoint, validCoordinates, distanceKm } from '../utils/deliveryPolicy.js';
import Rider from '../models/Rider.js';
import Order from '../models/Order.js';
import { getIO } from '../socket/index.js';
import { notifyOrderStatus } from './notify.js';

// In-memory tracking of pending active offers to prevent duplicate dispatches
// Map<orderId, { riderId, timeoutHandle, attempts, attemptedRiderIds: Set }>
const activeOffers = new Map();

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
 * Find and offer to the next nearest ONLINE_IDLE rider
 */
async function offerToNextRider(order, attemptedRiderIds) {
  const orderId = order._id.toString();
  const io = getIO();

  try {
    const point=storePoint(order.vendor);
    if(!validCoordinates(point.lat,point.lng)) {activeOffers.delete(orderId);return;}
    const candidateRiders = await Rider.find({
      status:'ONLINE_IDLE', activeOrderId:null,
      locationUpdatedAt:{$gte:new Date(Date.now()-120000)},
      currentLocation:{$near:{$geometry:{type:'Point',coordinates:[point.lng,point.lat]},$maxDistance:8000}},
      _id:{$nin:Array.from(attemptedRiderIds)}
    }).limit(5);
    if (!candidateRiders || candidateRiders.length === 0) {
      console.log(`🛵 [RiderAssignment] No idle riders available for Order #${order.orderNumber}. Left in pool.`);
      activeOffers.delete(orderId);
      return;
    }

    const candidate = candidateRiders[0];
    const riderId = candidate._id.toString();
    attemptedRiderIds.add(riderId);

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

    // Set 20-second timeout for acceptance
    const timeoutHandle = setTimeout(async () => {
      console.log(`⏱️ [RiderAssignment] 20s timeout expired for Rider ${candidate.name} on Order #${order.orderNumber}`);
      activeOffers.delete(orderId);

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

    activeOffers.set(orderId, {
      riderId,
      timeoutHandle,
      attemptedRiderIds
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
  const session=await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async()=>{
      const candidate=await Order.findOne({_id:orderId,status:'READY_FOR_RIDER',rider:null}).populate('vendor').session(session);
      const rider=await Rider.findOne({_id:riderId,status:'ONLINE_IDLE',activeOrderId:null,locationUpdatedAt:{$gte:new Date(Date.now()-120000)}}).session(session);
      if(!candidate || !rider || distanceKm({lat:rider.currentLocation?.coordinates?.[1],lng:rider.currentLocation?.coordinates?.[0]},storePoint(candidate.vendor))>8) throw new Error('Order unavailable or rider must be online with fresh GPS within 8 km of store.');
      order=await Order.findOneAndUpdate({_id:orderId,status:'READY_FOR_RIDER',rider:null},{
        $set:{rider:riderId,riderId,status:'RIDER_ASSIGNED',riderAssignedAt:new Date(),riderAcceptedAt:new Date()},
        $push:{statusHistory:{status:'RIDER_ASSIGNED',at:new Date(),by:'RIDER'}}
      },{new:true,session}).populate('vendor customer rider');
      const assigned=await Rider.findOneAndUpdate({_id:riderId,status:'ONLINE_IDLE',activeOrderId:null},{$set:{status:'ON_DELIVERY',activeOrderId:orderId}},{new:true,session});
      if(!order || !assigned)throw new Error('Another delivery was accepted. Refresh and retry.');
    });
  }catch(error){return {success:false,message:error.message};}
  finally{await session.endSession();}
  const offer=activeOffers.get(String(orderId));
  if(offer){clearTimeout(offer.timeoutHandle);activeOffers.delete(String(orderId));}
  // Notify customer and vendor real-time
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

  return { success: true, order };
}

/**
 * Handle rider declining an offer
 */
export async function handleRiderDecline(orderId, riderId) {
  const offer = activeOffers.get(orderId.toString());
  if (!offer || offer.riderId !== String(riderId)) return {success:false,message:'This offer is not assigned to you.'};
  if (offer) {
    clearTimeout(offer.timeoutHandle);
    activeOffers.delete(orderId.toString());
  }

  const order = await Order.findById(orderId).populate('vendor customer');
  if (order && order.status === 'READY_FOR_RIDER' && !order.rider) {
    const attempted = offer?.attemptedRiderIds || new Set([riderId.toString()]);
    attempted.add(riderId.toString());
    await offerToNextRider(order, attempted);
  }

  return { success: true, message: 'Offer declined. Order reassigned.' };
}
