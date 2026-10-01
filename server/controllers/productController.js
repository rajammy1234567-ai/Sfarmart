import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Vendor from '../models/Vendor.js';
import { notifyProductStock } from '../services/notify.js';

// @desc    Get all active products with filters and search
// @route   GET /api/products
export const getAllProducts = async (req, res) => {
  try {
    const { category, vendor, search, isVeg, inStockOnly } = req.query;
    const filter = { isActive: true };

    // Search query
    if (search && search.trim()) {
      filter.$text = { $search: search.trim() };
    }

    // Category filter (support ObjectId or slug)
    if (category && category !== 'all') {
      if (category.match(/^[0-9a-fA-F]{24}$/)) {
        filter.category = category;
      } else {
        const catDoc = await Category.findOne({ slug: category });
        if (catDoc) filter.category = catDoc._id;
      }
    }

    // Vendor filter
    if (vendor && vendor !== 'all') {
      if (vendor.match(/^[0-9a-fA-F]{24}$/)) {
        filter.vendor = vendor;
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
      .sort({ inStock: -1, createdAt: -1 });

    res.json({
      success: true,
      count: products.length,
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
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
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
    let { vendorId } = req.params;

    // If 'default_vendor' or empty, find first active vendor
    if (!vendorId || vendorId === 'default_vendor' || !vendorId.match(/^[0-9a-fA-F]{24}$/)) {
      const firstVendor = await Vendor.findOne({ isActive: true });
      if (firstVendor) vendorId = firstVendor._id;
    }

    const products = await Product.find({ vendor: vendorId, isActive: true })
      .populate('category', 'name slug icon type')
      .sort({ inStock: -1, createdAt: -1 });

    res.json({
      success: true,
      count: products.length,
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
    if (!vendorId || !vendorId.toString().match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(403).json({ success: false, message: 'Vendor authentication required to add a product.' });
    }

    // Determine category ObjectId
    let categoryId = category;
    if (!categoryId || !categoryId.toString().match(/^[0-9a-fA-F]{24}$/)) {
      let catDoc = null;
      if (category) {
        catDoc = await Category.findOne({
          $or: [{ slug: category.toString().toLowerCase() }, { name: new RegExp(category, 'i') }]
        });
      }
      if (!catDoc) {
        catDoc = await Category.findOne({ slug: 'home-thali' }) || await Category.findOne();
      }
      categoryId = catDoc?._id;
    }

    const qty = stockQty !== undefined ? Number(stockQty) : stock !== undefined ? Number(stock) : 25;

    const newProduct = new Product({
      name: name.trim(),
      description: description || '',
      image: image || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=80',
      vendor: vendorId,
      category: categoryId,
      price: Number(price),
      mrp: mrp ? Number(mrp) : Number(price) * 1.2,
      unit: unit || '1 pc',
      stockQty: qty,
      inStock: qty > 0,
      isVeg: Boolean(isVeg),
      tags: Array.isArray(tags) ? tags : tags ? [tags] : [name.toLowerCase()]
    });

    const savedProduct = await (await newProduct.save()).populate('category vendor');

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

    if (updateData.subCategory !== undefined) {
      if (typeof updateData.subCategory !== 'string') {
        return res.status(400).json({ success: false, code: 'INVALID_SUBCATEGORY', message: 'Subcategory must be a string.' });
      }
      updateData.subCategory = updateData.subCategory.trim().slice(0, 60);
    }

    if (updateData.image !== undefined) {
      if (typeof updateData.image !== 'string') {
        return res.status(400).json({ success: false, code: 'INVALID_IMAGE', message: 'Product image must be a string.' });
      }
      updateData.image = updateData.image.trim().slice(0, 500);
    }

    if (updateData.category !== undefined) {
      if (!mongoose.isValidObjectId(updateData.category)) {
        return res.status(400).json({ success: false, code: 'INVALID_CATEGORY', message: 'Category must be a valid ObjectId.' });
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
      if (numStock === null || !Number.isInteger(numStock) || numStock < 0) {
        return res.status(400).json({ success: false, code: 'INVALID_STOCK', message: 'Stock quantity must be a non-negative integer.' });
      }
      updateData.stockQty = numStock;
      if (updateData.inStock === undefined) {
        updateData.inStock = updateData.stockQty > 0;
      }
    }

    for (const boolField of ['inStock', 'isVeg', 'isActive']) {
      if (updateData[boolField] !== undefined) {
        if (typeof updateData[boolField] !== 'boolean') {
          return res.status(400).json({ success: false, code: 'INVALID_BOOLEAN', message: `${boolField} must be a boolean (true or false).` });
        }
      }
    }

    if (updateData.tags !== undefined) {
      if (!Array.isArray(updateData.tags) || updateData.tags.some(t => typeof t !== 'string')) {
        return res.status(400).json({ success: false, code: 'INVALID_TAGS', message: 'Tags must be an array of strings.' });
      }
      updateData.tags = updateData.tags.map(t => t.trim().toLowerCase().slice(0, 30)).filter(Boolean);
    }

    const product = await Product.findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .populate('category vendor');

    if (updateData.stockQty !== undefined || updateData.inStock !== undefined) {
      notifyProductStock(product);
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      product
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
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const callerVendorId = String(req.user?.vendorId || req.user?.id || req.user?._id || '');
    if (req.user?.role !== 'ADMIN' && String(product.vendor) !== callerVendorId) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You can only update stock for your own products.' });
    }

    if (req.body.addStock !== undefined) {
      const addAmt = Number(req.body.addStock);
      product.stockQty = Math.max(0, (product.stockQty || 0) + addAmt);
      if (product.stockQty > 0) product.inStock = true;
    } else if (req.body.stockQty !== undefined || req.body.stock !== undefined) {
      const newStock = Number(req.body.stockQty !== undefined ? req.body.stockQty : req.body.stock);
      product.stockQty = Math.max(0, newStock);
      product.inStock = product.stockQty > 0;
    } else if (typeof req.body.inStock === 'boolean') {
      product.inStock = req.body.inStock;
      if (product.inStock && product.stockQty <= 0) {
        product.stockQty = 25; // Default replenish on re-enabling
      }
    } else {
      product.inStock = !product.inStock;
      if (product.inStock && product.stockQty <= 0) {
        product.stockQty = 25;
      }
    }

    await product.save();

    // Broadcast stock change to all connected customers and vendor apps in real-time
    notifyProductStock(product);

    res.json({
      success: true,
      message: `Product stock updated to ${product.stockQty} units (${product.inStock ? 'In Stock' : 'Out of Stock'})`,
      product
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
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const callerVendorId = String(req.user?.vendorId || req.user?.id || req.user?._id || '');
    if (req.user?.role !== 'ADMIN' && String(product.vendor) !== callerVendorId) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You can only delete your own products.' });
    }

    await Product.findByIdAndDelete(id);

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
