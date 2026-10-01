import mongoose from 'mongoose';
import { validCoordinates, activeDeliveryStates, idOf } from '../utils/deliveryPolicy.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Rider from '../models/Rider.js';
import Order from '../models/Order.js';
import { handleRiderAccept, handleRiderDecline } from '../services/riderAssignmentService.js';
import { notifyOrderStatus } from '../services/notify.js';
import { getIO } from '../socket/index.js';

const getJwtAccessSecret = () => process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

// In-memory rate limiting and breadcrumb throttling per rider:
// Map<riderId, { lastPingAt: number, lastBreadcrumbAt: number }>
const locationRateLimiter = new Map();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate Access & Refresh Tokens for Rider
 */
function generateTokens(rider) {
  const payload = {
    id: rider._id,
    sub: rider._id,
    role: 'RIDER',
    phone: rider.phone,
    name: rider.name
  };

  const secret = getJwtAccessSecret();
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is required to sign rider tokens');
  }

  const accessToken = jwt.sign(payload, secret, { expiresIn: '15m' });
  const rawRefreshToken = crypto.randomBytes(32).toString('hex');
  const refreshTokenHash = hashToken(rawRefreshToken);

  return { accessToken, rawRefreshToken, refreshTokenHash };
}

// @desc    Rider Login (Dual-Token)
// @route   POST /api/rider/auth/login
export const riderLogin = async (req, res) => {
  try {
    const { phone, password, deviceId } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Phone and password are required.' });
    }

    const rider = await Rider.findOne({ phone: phone.trim() });
    if (!rider) {
      return res.status(401).json({ success: false, message: 'Invalid rider phone or password.' });
    }

    const isMatch = await rider.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid rider phone or password.' });
    }

    const { accessToken, rawRefreshToken, refreshTokenHash } = generateTokens(rider);

    rider.refreshTokenHash = refreshTokenHash;
    if (deviceId) rider.deviceId = deviceId;
    await rider.save();

    res.json({
      success: true,
      token: accessToken,
      refreshToken: rawRefreshToken,
      rider: rider.toJSON()
    });
  } catch (error) {
    console.error('Rider login error:', error);
    res.status(500).json({ success: false, message: 'Server error during rider login', error: error.message });
  }
};

// @desc    Rider Refresh Token Rotation
// @route   POST /api/rider/auth/refresh
export const riderRefresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token is required.' });
    }

    const providedHash = hashToken(refreshToken);
    const rider = await Rider.findOne({ refreshTokenHash: providedHash });

    if (!rider) {
      return res.status(403).json({ success: false, code: 'TOKEN_INVALID', message: 'Invalid or expired session.' });
    }

    const { accessToken, rawRefreshToken, refreshTokenHash } = generateTokens(rider);
    rider.refreshTokenHash = refreshTokenHash;
    await rider.save();

    res.json({
      success: true,
      token: accessToken,
      refreshToken: rawRefreshToken
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Refresh token error', error: error.message });
  }
};

// @desc    Rider Logout
// @route   POST /api/rider/auth/logout
export const riderLogout = async (req, res) => {
  try {
    const riderId = req.user?.id;
    if (riderId) {
      await Rider.findByIdAndUpdate(riderId, {
        status: 'OFFLINE',
        refreshTokenHash: ''
      });
    }
    res.json({ success: true, message: 'Rider logged out successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Logout error', error: error.message });
  }
};

// @desc    Toggle Duty Status (ONLINE_IDLE <-> OFFLINE)
// @route   PATCH /api/rider/status
export const toggleRiderStatus = async (req, res) => {
  try {
    const riderId = req.user?.id;
    const { status } = req.body;

    const rider = await Rider.findById(riderId);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Rider not found.' });
    }

    if (rider.activeOrderId || rider.status === 'ON_DELIVERY') {
      return res.status(400).json({
        success: false,
        code: 'ACTIVE_DELIVERY_IN_PROGRESS',
        message: 'Cannot go OFFLINE while an active delivery is in progress.'
      });
    }

    const targetStatus = status || (rider.status === 'OFFLINE' ? 'ONLINE_IDLE' : 'OFFLINE');
    if (!['OFFLINE','ONLINE_IDLE'].includes(targetStatus)) return res.status(400).json({success:false,message:'Invalid duty status.'});
    if (targetStatus === 'ONLINE_IDLE' && (!rider.locationUpdatedAt || Date.now()-new Date(rider.locationUpdatedAt).getTime()>120000)) return res.status(400).json({success:false,message:'Enable GPS and send a fresh location before going online.'});
    rider.status = targetStatus;
    await rider.save();

    res.json({
      success: true,
      status: rider.status,
      rider: rider.toJSON()
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error toggling duty status', error: error.message });
  }
};

// @desc    Rate-limited Live Location Ping
// @route   POST /api/rider/location
export const updateRiderLocation = async (req, res) => {
  try {
    const riderId = req.user?.id?.toString();
    const { lat, lng, heading = 0, speed = 0, orderId } = req.body;

    const { accuracy, capturedAt } = req.body;
    if (!validCoordinates(lat,lng) || !Number.isFinite(accuracy) || accuracy<0 || accuracy>100 || !Number.isFinite(capturedAt) || Math.abs(Date.now()-capturedAt)>120000 || !Number.isFinite(speed) || speed<0 || speed>250 || !Number.isFinite(heading) || heading<0 || heading>360) {
      return res.status(400).json({success:false,message:'A fresh GPS fix with accuracy within 100 metres is required.'});
    }
    const rider=await Rider.findById(riderId);
    if (!rider) return res.status(404).json({success:false,message:'Rider not found.'});
    if (orderId && idOf(rider.activeOrderId)!==String(orderId)) return res.status(403).json({success:false,message:'This delivery is not assigned to you.'});
    const activeOrder = rider.activeOrderId ? await Order.findOne({_id:rider.activeOrderId,rider:riderId,status:{$in:activeDeliveryStates}}) : null;
    const now = Date.now();
    const state = locationRateLimiter.get(riderId) || { lastPingAt: 0, lastBreadcrumbAt: 0 };

    // Rate-limit: drop pings faster than 2.8s
    if (now - state.lastPingAt < 2800) {
      return res.json({ success: true, throttled: true });
    }
    state.lastPingAt = now;

    // Ephemeral update on Rider model
    await Rider.findByIdAndUpdate(riderId, {
      currentLocation: { type: 'Point', coordinates: [lng, lat] },
      locationUpdatedAt: new Date(capturedAt),
      locationAccuracy: accuracy
    });

    const activeOrderId = activeOrder?._id;

    // If rider has an active order, emit live location to that order room
    if (activeOrderId) {
      const io = getIO();
      if (io) {
        io.to(`order:${activeOrderId}`).emit('order:rider_location', {
          orderId: activeOrderId,
          riderId,
          lat,
          lng,
          heading,
          speed,
          accuracy, at: new Date(capturedAt)
        });
      }

      // Sparse breadcrumbs: write to MongoDB order.deliveryRoute only every ~30s
      if (now - state.lastBreadcrumbAt >= 30000) {
        state.lastBreadcrumbAt = now;
        await Order.findByIdAndUpdate(activeOrderId, {
          $push: { deliveryRoute: { $each: [{lat,lng,at:new Date(capturedAt)}], $slice: -1000 } },
          $set: { riderLocation: {lat,lng,speed,heading,accuracy,at:new Date(capturedAt)} }
        });
      }
    }

    locationRateLimiter.set(riderId, state);
    res.json({ success: true, timestamp: now });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating rider location', error: error.message });
  }
};

// @desc    Get Current Active Delivery Order
// @route   GET /api/rider/active-order
export const getActiveDeliveryOrder = async (req, res) => {
  try {
    const riderId = req.user?.id;

    const order = await Order.findOne({
      rider: riderId,
      status: { $in: ['RIDER_ASSIGNED', 'RIDER_ARRIVED_STORE', 'OUT_FOR_DELIVERY'] }
    })
      .populate('vendor', 'storeName address phone location')
      .populate('customer', 'name phone');

    if (!order) {
      return res.json({ success: true, hasActiveOrder: false, order: null });
    }

    res.json({
      success: true,
      hasActiveOrder: true,
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        vendor: order.vendor,
        customer: order.customer,
        address: order.address,
        items: order.items,
        pricing: order.pricing,
        payment: order.payment,
        placedAt: order.placedAt,
        riderAssignedAt: order.riderAssignedAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching active order', error: error.message });
  }
};

// @desc    Accept Incoming Order Offer
// @route   POST /api/rider/orders/:id/accept
export const acceptOrderOffer = async (req, res) => {
  try {
    const riderId = req.user?.id;
    const { id } = req.params;

    const result = await handleRiderAccept(id, riderId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: 'Order accepted successfully! Proceed to store for pickup.',
      order: result.order
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error accepting order offer', error: error.message });
  }
};

// @desc    Decline Incoming Order Offer
// @route   POST /api/rider/orders/:id/decline
export const declineOrderOffer = async (req, res) => {
  try {
    const riderId = req.user?.id;
    const { id } = req.params;

    const result = await handleRiderDecline(id, riderId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error declining order offer', error: error.message });
  }
};

// @desc    Rider Arrived at Store
// @route   POST /api/rider/orders/:id/arrived-store
export const arrivedAtStore = async (req, res) => {
  try {
    const riderId = req.user?.id;
    const { id } = req.params;

    const order = await Order.findOneAndUpdate(
      { _id: id, rider: riderId, status: 'RIDER_ASSIGNED' },
      {
        $set: { status: 'RIDER_ARRIVED_STORE' },
        $push: {
          statusHistory: { status: 'RIDER_ARRIVED_STORE', at: new Date(), by: 'RIDER' }
        }
      },
      { new: true }
    ).populate('vendor customer');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found or status not eligible.' });
    }

    notifyOrderStatus(order);
    res.json({ success: true, message: 'Marked arrived at store', order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating arrival status', error: error.message });
  }
};

// @desc    Verify Pickup from Store
// @route   POST /api/rider/orders/:id/pickup-verify
export const verifyPickup = async (req,res) => {
  const otp=String(req.body.pickupOtp || '').trim();
  if(!/^\d{4}$/.test(otp)) return res.status(400).json({success:false,code:'OTP_REQUIRED',message:'Enter the 4-digit pickup OTP from the merchant.'});
  try {
    const order=await Order.findOneAndUpdate({_id:req.params.id,rider:req.user.id,status:'RIDER_ARRIVED_STORE',pickupOtp:otp},{
      $set:{status:'OUT_FOR_DELIVERY'},$push:{statusHistory:{status:'OUT_FOR_DELIVERY',at:new Date(),by:'RIDER'}}
    },{new:true}).populate('vendor customer');
    if(!order)return res.status(409).json({success:false,message:'Invalid OTP, wrong rider or pickup already completed.'});
    notifyOrderStatus(order);res.json({success:true,order});
  }catch{res.status(500).json({success:false,message:'Pickup verification failed.'});}
};
export const verifyDelivery = async (req,res) => {
  const otp=String(req.body.deliveryOtp || '').trim();
  if(!/^\d{4}$/.test(otp))return res.status(400).json({success:false,code:'OTP_REQUIRED',message:'Enter the customer delivery OTP.'});
  let session;
  try {
    session=await mongoose.startSession();
    let order;
    await session.withTransaction(async()=>{
      order=await Order.findOneAndUpdate({_id:req.params.id,rider:req.user.id,status:'OUT_FOR_DELIVERY',deliveryOtp:otp}, {
        $set:{status:'DELIVERED','payment.status':'PAID'},
        $push:{statusHistory:{status:'DELIVERED',at:new Date(),by:'RIDER'}}
      },{new:true,session});
      if(!order)throw Object.assign(new Error('Invalid OTP, wrong rider or delivery already completed.'),{status:409});
      const rider=await Rider.findOneAndUpdate({_id:req.user.id,activeOrderId:order._id}, {
        $set:{status:'ONLINE_IDLE',activeOrderId:null},
        $inc:{completedDeliveries:1,todayEarningsPaise:6500,totalEarningsPaise:6500}
      },{new:true,session});
      if(!rider)throw Object.assign(new Error('Active rider assignment changed. Refresh and retry.'),{status:409});
    });
    notifyOrderStatus(order);res.json({success:true,earnedAmount:65,order});
  }catch(error){res.status(error.status || 500).json({success:false,message:error.message});}
  finally{if(session)await session.endSession();}
};

// @desc    Get Rider Profile
// @route   GET /api/rider/profile
export const getRiderProfile = async (req, res) => {
  try {
    const rider = await Rider.findById(req.user?.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Rider not found.' });
    }
    res.json({ success: true, rider: rider.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching rider profile', error: error.message });
  }
};

// @desc    Get Rider Earnings & History
// @route   GET /api/rider/earnings
export const getRiderEarnings = async (req, res) => {
  try {
    const rider = await Rider.findById(req.user?.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Rider not found.' });
    }

    const completedOrders = await Order.find({
      rider: rider._id,
      status: 'DELIVERED'
    })
      .select('orderNumber pricing createdAt payment')
      .sort({ updatedAt: -1 })
      .limit(20);

    const todayEarnings = (rider.todayEarningsPaise || 0) / 100;
    const totalEarnings = (rider.totalEarningsPaise || 0) / 100;

    res.json({
      success: true,
      todayEarnings,
      totalEarnings,
      completedCount: rider.completedDeliveries || completedOrders.length,
      recentTrips: completedOrders.map((o) => ({
        id: o._id,
        orderNumber: o.orderNumber,
        earned: 65,
        paymentMethod: o.payment?.method || 'ONLINE',
        time: o.createdAt
      })),
      weeklyLedger: [
        { week: 'Current Week', trips: rider.completedDeliveries || 0, amount: todayEarnings, status: 'PENDING WEDNESDAY PAYOUT' },
        { week: 'Last Week', trips: 42, amount: 2730, status: 'PAID TO BANK' }
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching rider earnings', error: error.message });
  }
};
