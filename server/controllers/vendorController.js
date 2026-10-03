import mongoose from 'mongoose';
import {validCoordinates,orderForRole} from '../utils/deliveryPolicy.js';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Category from '../models/Category.js';

export const getAllVendors = async (req, res) => {
  try {
    const { storeType, openOnly, category } = req.query;
    const query = { isActive: true };

    if (storeType) {
      query.storeType = storeType.toUpperCase();
    }
    if (openOnly === 'true') {
      query.isOpen = true;
    }
    if (category) {
      if (mongoose.isValidObjectId(category)) {
        const catDoc = await Category.findOne({ _id: category, isActive: true });
        if (catDoc) {
          query.categories = catDoc._id;
        } else {
          return res.json({ success: true, count: 0, vendors: [] });
        }
      } else {
        const catDoc = await Category.findOne({ slug: category.toLowerCase().trim(), isActive: true });
        if (catDoc) {
          query.categories = catDoc._id;
        } else {
          return res.json({ success: true, count: 0, vendors: [] });
        }
      }
    }

    const vendors = await Vendor.find(query)
      .populate('categories', 'name slug icon type')
      .sort({ isOpen: -1, rating: -1 });

    res.json({
      success: true,
      count: vendors.length,
      vendors
    });
  } catch (err) {
    console.error('Error fetching vendors:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch vendors' });
  }
};

export const getVendorById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid vendor ID format' });
    }
    const vendor = await Vendor.findById(id).populate('categories');

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    res.json({ success: true, vendor });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid vendor ID format' });
    }
    console.error('Error fetching vendor:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch vendor' });
  }
};

export const getVendorProducts = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid vendor ID format' });
    }
    const { category, subCategory } = req.query;

    const query = { vendor: id, isActive: true };
    if (category) query.category = category;
    if (subCategory) query.subCategory = subCategory;

    const products = await Product.find(query)
      .populate('category', 'name slug icon type')
      .sort({ inStock: -1, price: 1 });

    res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid vendor ID format' });
    }
    console.error('Error fetching vendor products:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch vendor products' });
  }
};

export const toggleStoreStatus = async (req, res) => {
  try {
    const vendorId = req.user.vendorId || req.user.id;
    const { isOpen } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    vendor.isOpen = typeof isOpen === 'boolean' ? isOpen : !vendor.isOpen;
    await vendor.save();

    console.log(`🏪 Vendor ${vendor.storeName} toggled store: ${vendor.isOpen ? 'OPEN' : 'CLOSED'}`);

    res.json({
      success: true,
      message: `Store is now ${vendor.isOpen ? 'ONLINE (Accepting Orders)' : 'OFFLINE (Closed)'}`,
      isOpen: vendor.isOpen,
      vendor
    });
  } catch (err) {
    console.error('Error toggling store status:', err);
    res.status(500).json({ success: false, message: 'Failed to update store status' });
  }
};

export const getVendorOrders = async (req, res) => {
  try {
    const vendorId = req.user.vendorId || req.user.id;
    const { status, limit = 50 } = req.query;

    const query = { vendor: vendorId };

    if (status === 'active') {
      query.status = { $in: ['NEW_ORDER', 'ACCEPTED', 'PREPARING', 'READY_FOR_RIDER', 'OUT_FOR_DELIVERY'] };
    } else if (status === 'completed') {
      query.status = 'DELIVERED';
    } else if (status && status !== 'all') {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('customer', 'name phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10));

    res.json({
      success: true,
      count: orders.length,
      orders: orders.map(o=>orderForRole(o,'VENDOR'))
    });
  } catch (err) {
    console.error('Error fetching vendor orders:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch vendor orders' });
  }
};

export const getVendorStats = async (req, res) => {
  try {
    const vendorId = req.user.vendorId || req.user.id;
    const vendorObjectId = mongoose.isValidObjectId(vendorId) ? new mongoose.Types.ObjectId(vendorId) : vendorId;

    // Start of today in UTC
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [todayDelivered, todayOrdersCount, activeCount, allTimeOrders] = await Promise.all([
      // Today's Delivered Revenue
      Order.aggregate([
        {
          $match: {
            $or: [
              { vendor: vendorObjectId },
              { vendor: String(vendorId) }
            ],
            status: 'DELIVERED',
            createdAt: { $gte: startOfToday }
          }
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: '$pricing.grandTotal' },
            count: { $sum: 1 }
          }
        }
      ]),
      // Today's total placed orders
      Order.countDocuments({
        $or: [{ vendor: vendorObjectId }, { vendor: String(vendorId) }],
        createdAt: { $gte: startOfToday }
      }),
      // Active orders in progress right now
      Order.countDocuments({
        $or: [{ vendor: vendorObjectId }, { vendor: String(vendorId) }],
        status: { $in: ['NEW_ORDER', 'ACCEPTED', 'PREPARING', 'READY_FOR_RIDER'] }
      }),
      // All-time completed orders
      Order.countDocuments({
        $or: [{ vendor: vendorObjectId }, { vendor: String(vendorId) }],
        status: 'DELIVERED'
      })
    ]);

    const todaySales = todayDelivered[0]?.totalSales || 0;
    const todayDeliveredCount = todayDelivered[0]?.count || 0;

    res.json({
      success: true,
      stats: {
        todaySales,
        todayOrdersCount,
        todayDeliveredCount,
        activeOrdersCount: activeCount,
        allTimeDelivered: allTimeOrders
      }
    });
  } catch (err) {
    console.error('Error fetching vendor stats:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch vendor stats' });
  }
};

export const updateVendorProfile = async (req, res) => {
  try {
    const vendorId = req.user.vendorId || req.user.id;
    const { storeName, description, avgPrepTimeMins, minOrderValue, deliveryRadiusKm } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    if(req.body.location) {
      const {lat,lng}=req.body.location;
      if(!validCoordinates(lat,lng))return res.status(400).json({success:false,message:'Valid store latitude and longitude are required.'});
      vendor.address.location={type:'Point',coordinates:[lng,lat]};
    }
    if (storeName) vendor.storeName = storeName.trim();
    if (description !== undefined) vendor.description = description.trim();
    if (avgPrepTimeMins) vendor.avgPrepTimeMins = Number(avgPrepTimeMins);
    if (minOrderValue) vendor.minOrderValue = Number(minOrderValue);
    if (deliveryRadiusKm) vendor.deliveryRadiusKm = Number(deliveryRadiusKm);

    await vendor.save();
    res.json({ success: true, vendor });
  } catch (err) {
    console.error('Error updating vendor profile:', err);
    res.status(500).json({ success: false, message: 'Failed to update vendor profile' });
  }
};
