import { pagination } from '../utils/requestPolicy.js';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Vendor from '../models/Vendor.js';
import { notifyProductStock } from '../services/notify.js';

// Synchronizes a vendor's categories array with the active products they currently sell
export const syncVendorCategories = async (vendorId) => {
  if (!vendorId || !mongoose.isValidObjectId(vendorId)) return;
  try {
    const activeCatIds = await Product.distinct('category', {
      vendor: vendorId,
      isActive: true
    });
    const validActiveCats = await Category.find({
      _id: { $in: activeCatIds },
      isActive: true
    }).distinct('_id');

    await Vendor.findByIdAndUpdate(vendorId, {
      $set: { categories: validActiveCats }
    });
  } catch (err) {
    console.error(`Error syncing vendor categories for ${vendorId}:`, err);
  }
};

// @desc    Get all active products with filters and search
// @route   GET /api/products
export const getAllProducts = async (req, res) => {
  try {
    const paging = pagination(req.query);
    const { category, vendor, search, isVeg, inStockOnly } = req.query;
    const filter = { isActive: true };

    // Search query
    if (search && search.trim()) {
      filter.$text = { $search: search.trim() };
    }

    // Category filter (support ObjectId or slug)
    // Empty/unknown category filters must return 0 results and never show unrelated data
    if (category && category !== 'all') {
      if (mongoose.isValidObjectId(category)) {
        const catDoc = await Category.findOne({ _id: category, isActive: true });
        if (catDoc) {
          filter.category = catDoc._id;
        } else {
          return res.json({ success: true, count: 0, products: [] });
        }
      } else {
        const catDoc = await Category.findOne({ slug: category.toLowerCase().trim(), isActive: true });
        if (catDoc) {
          filter.category = catDoc._id;
        } else {
          return res.json({ success: true, count: 0, products: [] });
        }
      }
    }

    // Vendor filter
    if (vendor && vendor !== 'all') {
      if (mongoose.isValidObjectId(vendor)) {
        filter.vendor = vendor;
      } else {
        return res.json({ success: true, count: 0, products: [] });
      }
    }

    if (isVeg !== undefined) {
      filter.isVeg = isVeg === 'true';
    }

    if (inStockOnly === 'true') {
      filter.inStock = true;
      filter.stockQty = { $gt: 0 };
    }

    const products = await Product.find(filter)
      .populate('category', 'name slug icon type')
      .populate('vendor', 'storeName ownerName phone storeType isOpen rating minOrderValue avgPrepTimeMins')
      .sort({ inStock: -1, createdAt: -1, _id: 1 }).skip(paging.skip).limit(paging.limit);

    res.json({
      success: true,
      page: paging.page, limit: paging.limit, count: products.length,
      products
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: 'Server error fetching products' });
  }
};

// @desc    Get single product by ID
// @route   GET /api/products/:id
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid product ID format' });
    }
    const product = await Product.findById(id)
      .populate('category', 'name slug icon type')
      .populate('vendor', 'storeName ownerName phone storeType isOpen rating avgPrepTimeMins minOrderValue');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, product });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid product ID format' });
    }
    res.status(500).json({ success: false, message: 'Error fetching product' });
  }
};

// @desc    Get products by vendor ID
// @route   GET /api/products/vendor/:vendorId
export const getVendorProducts = async (req, res) => {
  try {
    const paging = pagination(req.query);
    let { vendorId } = req.params;

    // If 'default_vendor' or empty, find first active vendor
    if (!vendorId || vendorId === 'default_vendor' || !mongoose.isValidObjectId(vendorId)) {
      const firstVendor = await Vendor.findOne({ isActive: true });
      if (firstVendor) vendorId = firstVendor._id;
    }

    if (!vendorId || !mongoose.isValidObjectId(vendorId)) {
      return res.json({ success: true, count: 0, products: [] });
    }

    const products = await Product.find({ vendor: vendorId, isActive: true })
      .populate('category', 'name slug icon type')
      .sort({ inStock: -1, createdAt: -1, _id: 1 }).skip(paging.skip).limit(paging.limit);

    res.json({
      success: true,
      page: paging.page, limit: paging.limit, count: products.length,
      products
    });
  } catch (error) {
    console.error('Error fetching vendor products:', error);
    res.status(500).json({ success: false, message: 'Server error fetching vendor products' });
  }
};

// @desc    Create / upload a new product
// @route   POST /api/products
export const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      categoryId: bodyCategoryId,
      subCategory,
      price,
      mrp,
      unit,
      stockQty,
      stock,
      image,
      isVeg = true,
      tags = []
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ success: false, message: 'Name and price are required' });
    }

    // Determine vendor from authenticated user
    let vendorId;
    if (req.user?.role === 'ADMIN' && (req.body.vendor || req.body.partnerId)) {
      vendorId = req.body.vendor || req.body.partnerId;
    } else {
      vendorId = req.user?.vendorId || req.user?.id || req.user?._id;
    }
    if (!vendorId || !mongoose.isValidObjectId(vendorId)) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Vendor authentication required to add a product.' });
    }

    // Strict category validation: require existing active category by real database ID
    const rawCategory = bodyCategoryId || category;
    if (!rawCategory || !mongoose.isValidObjectId(rawCategory)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_CATEGORY',
        message: 'Valid category database ID is required.'
      });
    }

    const catDoc = await Category.findOne({ _id: rawCategory, isActive: true });
    if (!catDoc) {
      return res.status(400).json({
        success: false,
        code: 'CATEGORY_NOT_FOUND',
        message: 'Referenced category does not exist or is inactive.'
      });
    }
    const categoryId = catDoc._id;

    // Subcategory validation: if provided, must be a member of the active parent category
    let validatedSubCategory = '';
    const rawSubCategory = typeof subCategory === 'string' ? subCategory.trim() : (subCategory ? String(subCategory).trim() : '');
    if (rawSubCategory) {
      const matchedSub = (catDoc.subCategories || []).find((s) => {
        const sId = s._id ? s._id.toString() : '';
        const sName = (s.name || '').trim().toLowerCase();
        const sSlug = (s.slug || '').trim().toLowerCase();
        const target = rawSubCategory.toLowerCase();
        return sId === rawSubCategory || sName === target || sSlug === target;
      });

      if (!matchedSub) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_SUBCATEGORY',
          message: `Subcategory "${rawSubCategory}" does not belong to active category "${catDoc.name}".`
        });
      }
      validatedSubCategory = matchedSub.name;
    }

    const qty = stockQty !== undefined ? Number(stockQty) : stock !== undefined ? Number(stock) : 25;

    const newProduct = new Product({
      name: name.trim(),
      description: description || '',
      image: image || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=80',
      vendor: vendorId,
      category: categoryId,
      subCategory: validatedSubCategory,
      price: Number(price),
      mrp: mrp ? Number(mrp) : Number(price) * 1.2,
      unit: unit || '1 pc',
      stockQty: qty,
      inStock: qty > 0,
      isVeg: Boolean(isVeg),
      tags: Array.isArray(tags) ? tags : tags ? [tags] : [name.toLowerCase()]
    });

    const savedProduct = await (await newProduct.save()).populate('category vendor');

    // Maintain vendor's category membership
    await syncVendorCategories(vendorId);

    res.status(201).json({
      success: true,
      message: 'Product successfully added to MongoDB',
      product: savedProduct
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ success: false, message: error.message || 'Error saving product' });
  }
};

// Helper to strictly parse numeric inputs; rejects null, booleans, empty/whitespace strings, arrays, objects
export const parseNumericField = (val) => {
  if (val === null || typeof val === 'boolean' || Array.isArray(val) || typeof val === 'object') {
    return null;
  }
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

// @desc    Update product details
// @route   PUT /api/products/:id
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid product ID format' });
    }

    const existing = await Product.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const callerVendorId = String(req.user?.vendorId || req.user?.id || req.user?._id || '');
    if (req.user?.role !== 'ADMIN' && String(existing.vendor) !== callerVendorId) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You can only update your own products.' });
    }

    const allowedFields = [
      'name', 'description', 'image', 'category', 'subCategory',
      'price', 'mrp', 'unit', 'stockQty', 'inStock', 'isVeg', 'tags', 'isActive'
    ];
    const updateData = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updateData[key] = req.body[key];
      }
    }

    if (updateData.name !== undefined) {
      if (typeof updateData.name !== 'string' || !updateData.name.trim()) {
        return res.status(400).json({ success: false, code: 'INVALID_NAME', message: 'Product name must be a non-empty string.' });
      }
      updateData.name = updateData.name.trim().slice(0, 120);
    }

    if (updateData.description !== undefined) {
      if (typeof updateData.description !== 'string') {
        return res.status(400).json({ success: false, code: 'INVALID_DESCRIPTION', message: 'Product description must be a string.' });
      }
      updateData.description = updateData.description.trim().slice(0, 1000);
    }

    if (updateData.unit !== undefined) {
      if (typeof updateData.unit !== 'string' || !updateData.unit.trim()) {
        return res.status(400).json({ success: false, code: 'INVALID_UNIT', message: 'Product unit must be a non-empty string.' });
      }
      updateData.unit = updateData.unit.trim().slice(0, 30);
    }

    if (updateData.image !== undefined) {
      if (typeof updateData.image !== 'string') {
        return res.status(400).json({ success: false, code: 'INVALID_IMAGE', message: 'Product image must be a string.' });
      }
      updateData.image = updateData.image.trim().slice(0, 500);
    }

    // Strict category validation: verify database ObjectId and active status
    let parentCatDoc = null;
    if (updateData.category !== undefined) {
      if (!mongoose.isValidObjectId(updateData.category)) {
        return res.status(400).json({ success: false, code: 'INVALID_CATEGORY', message: 'Category must be a valid ObjectId.' });
      }
      parentCatDoc = await Category.findOne({ _id: updateData.category, isActive: true });
      if (!parentCatDoc) {
        return res.status(400).json({ success: false, code: 'CATEGORY_NOT_FOUND', message: 'Referenced category does not exist or is inactive.' });
      }
      updateData.category = parentCatDoc._id;
    } else if (existing.category) {
      parentCatDoc = await Category.findOne({ _id: existing.category, isActive: true });
    }

    // Strict subcategory validation: verify membership in the active parent category
    if (updateData.subCategory !== undefined) {
      if (typeof updateData.subCategory !== 'string') {
        return res.status(400).json({ success: false, code: 'INVALID_SUBCATEGORY', message: 'Subcategory must be a string.' });
      }
      const rawSub = updateData.subCategory.trim();
      if (rawSub) {
        const matchedSub = (parentCatDoc?.subCategories || []).find((s) => {
          const sId = s._id ? s._id.toString() : '';
          const sName = (s.name || '').trim().toLowerCase();
          const sSlug = (s.slug || '').trim().toLowerCase();
          const target = rawSub.toLowerCase();
          return sId === rawSub || sName === target || sSlug === target;
        });

        if (!matchedSub) {
          return res.status(400).json({
            success: false,
            code: 'INVALID_SUBCATEGORY',
            message: `Subcategory "${rawSub}" does not belong to active category "${parentCatDoc?.name || 'selected'}".`
          });
        }
        updateData.subCategory = matchedSub.name;
      } else {
        updateData.subCategory = '';
      }
    } else if (updateData.category !== undefined && existing.subCategory) {
      // Parent category changed without explicit subcategory; clear if incompatible
      const isStillValid = (parentCatDoc?.subCategories || []).some((s) => {
        const sId = s._id ? s._id.toString() : '';
        const sName = (s.name || '').trim().toLowerCase();
        const sSlug = (s.slug || '').trim().toLowerCase();
        const target = existing.subCategory.toLowerCase();
        return sId === existing.subCategory || sName === target || sSlug === target;
      });
      if (!isStillValid) {
        updateData.subCategory = '';
      }
    }

    if (updateData.price !== undefined) {
      const numPrice = parseNumericField(updateData.price);
      if (numPrice === null || numPrice < 0) {
        return res.status(400).json({ success: false, code: 'INVALID_PRICE', message: 'Price must be a finite, non-negative number.' });
      }
      const roundedPrice = Math.round(numPrice * 100) / 100;
      if (!Number.isFinite(roundedPrice) || roundedPrice < 0) {
        return res.status(400).json({ success: false, code: 'INVALID_PRICE', message: 'Price must be a finite, non-negative number.' });
      }
      updateData.price = roundedPrice;
    }

    if (updateData.mrp !== undefined) {
      const numMrp = parseNumericField(updateData.mrp);
      if (numMrp === null || numMrp < 0) {
        return res.status(400).json({ success: false, code: 'INVALID_MRP', message: 'MRP must be a finite, non-negative number.' });
      }
      const roundedMrp = Math.round(numMrp * 100) / 100;
      if (!Number.isFinite(roundedMrp) || roundedMrp < 0) {
        return res.status(400).json({ success: false, code: 'INVALID_MRP', message: 'MRP must be a finite, non-negative number.' });
      }
      updateData.mrp = roundedMrp;
    }

    if (updateData.stockQty !== undefined) {
      const numStock = parseNumericField(updateData.stockQty);
      if (numStock === null || numStock < 0) {
        return res.status(400).json({ success: false, code: 'INVALID_STOCK', message: 'Stock must be a non-negative integer.' });
      }
      const intStock = Math.floor(numStock);
      updateData.stockQty = intStock;
      if (updateData.inStock === undefined) {
        updateData.inStock = intStock > 0;
      }
    }

    if (updateData.inStock !== undefined) {
      updateData.inStock = Boolean(updateData.inStock);
    }

    if (updateData.isVeg !== undefined) {
      updateData.isVeg = Boolean(updateData.isVeg);
    }

    if (updateData.isActive !== undefined) {
      updateData.isActive = Boolean(updateData.isActive);
    }

    if (updateData.tags !== undefined) {
      if (!Array.isArray(updateData.tags)) {
        return res.status(400).json({ success: false, code: 'INVALID_TAGS', message: 'Tags must be an array of strings.' });
      }
      updateData.tags = updateData.tags
        .filter((t) => typeof t === 'string' && t.trim())
        .map((t) => t.trim().slice(0, 40));
    }

    const updated = await Product.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('category vendor');

    // Maintain vendor's category membership after category/status changes
    await syncVendorCategories(existing.vendor);

    res.json({
      success: true,
      message: 'Product updated successfully',
      product: updated
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, message: 'Error updating product' });
  }
};

// @desc    Toggle product in-stock availability or replenish stock
// @route   PATCH /api/products/:id/stock
export const toggleProductStock = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid product ID format' });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const callerVendorId = String(req.user?.vendorId || req.user?.id || req.user?._id || '');
    if (req.user?.role !== 'ADMIN' && String(product.vendor) !== callerVendorId) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You can only update stock for your own products.' });
    }

    // Aggregation expressions evaluate against the current document under the update lock.
    // Never save the earlier snapshot after checkout may have deducted stock.
    let stockExpr;
    let availabilityExpr;
    const parseStock = value => {
      if (typeof value !== 'number' && typeof value !== 'string') return null;
      if (typeof value === 'string' && !value.trim()) return null;
      const n = Number(value);
      return Number.isSafeInteger(n) && Math.abs(n) <= 1000000 ? n : null;
    };
    if (req.body.addStock !== undefined) {
      const amount = parseStock(req.body.addStock);
      if (amount === null) return res.status(400).json({ success: false, code: 'INVALID_STOCK' });
      stockExpr = { $max: [0, { $add: [{ $ifNull: ['$stockQty', 0] }, amount] }] };
      availabilityExpr = { $gt: [stockExpr, 0] };
    } else if (req.body.stockQty !== undefined || req.body.stock !== undefined) {
      const amount = parseStock(req.body.stockQty ?? req.body.stock);
      if (amount === null || amount < 0) return res.status(400).json({ success: false, code: 'INVALID_STOCK' });
      stockExpr = amount;
      availabilityExpr = amount > 0;
    } else {
      availabilityExpr = typeof req.body.inStock === 'boolean' ? req.body.inStock : { $not: ['$inStock'] };
      stockExpr = { $cond: [{ $and: [availabilityExpr, { $lte: ['$stockQty', 0] }] }, 25, '$stockQty'] };
    }
    const updateFilter = { _id: id };
    if (req.user?.role !== 'ADMIN') updateFilter.vendor = callerVendorId;
    const updated = await Product.findOneAndUpdate(updateFilter,
      [{ $set: { stockQty: stockExpr, inStock: availabilityExpr } }],
      { new: true, updatePipeline: true });
    if (!updated) return res.status(409).json({ success: false, code: 'PRODUCT_STATE_CONFLICT' });

    // Broadcast stock change to all connected customers and vendor apps in real-time
    notifyProductStock(updated);

    // Sync vendor categories
    await syncVendorCategories(updated.vendor);

    res.json({
      success: true,
      message: `Product stock updated to ${updated.stockQty} units (${updated.inStock ? 'In Stock' : 'Out of Stock'})`,
      product: updated
    });
  } catch (error) {
    console.error('Error toggling stock:', error);
    res.status(500).json({ success: false, message: 'Error updating stock' });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid product ID format' });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const callerVendorId = String(req.user?.vendorId || req.user?.id || req.user?._id || '');
    if (req.user?.role !== 'ADMIN' && String(product.vendor) !== callerVendorId) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You can only delete your own products.' });
    }

    await Product.findByIdAndDelete(id);

    // Maintain vendor's category membership after product deletion
    await syncVendorCategories(product.vendor);

    res.json({
      success: true,
      message: 'Product deleted from MongoDB',
      deletedProductId: id
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Error deleting product' });
  }
};
