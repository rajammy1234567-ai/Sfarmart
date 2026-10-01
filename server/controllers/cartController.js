import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';

// Helper to format cart response
const formatCartResponse = async (cart) => {
  await cart.populate('vendor', 'storeName address phone isOpen logo banner minOrderValue storeType');
  const cartObj = cart.toJSON();
  return {
    ...cartObj,
    subtotalRupees: (cart.subtotalPaise || 0) / 100,
    itemCount: cart.itemCount || 0
  };
};

// @desc    Get user's server-side cart
// @route   GET /api/cart
export const getCart = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = await Cart.create({ user: userId, vendor: null, items: [] });
    }
    const formatted = await formatCartResponse(cart);
    res.json({ ok: true, success: true, cart: formatted });
  } catch (error) {
    console.error('getCart error:', error);
    res.status(500).json({ ok: false, success: false, code: 'CART_FETCH_FAILED', message: error.message });
  }
};

// @desc    Add item to cart with strict single-vendor enforcement
// @route   POST /api/cart/items
export const addItem = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { productId, qty = 1 } = req.body;

    if (!productId || !mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_PRODUCT_ID',
        message: `Invalid product ID format: "${productId}".`
      });
    }

    const quantity = Math.max(1, Math.min(20, parseInt(qty, 10) || 1));
    const product = await Product.findById(productId).populate('vendor');

    if (!product || !product.isActive) {
      return res.status(404).json({
        ok: false,
        code: 'PRODUCT_NOT_FOUND',
        message: 'This product is no longer available in the marketplace.'
      });
    }

    if (!product.inStock || product.stockQty <= 0) {
      return res.status(400).json({
        ok: false,
        code: 'OUT_OF_STOCK',
        message: `"${product.name}" is currently out of stock.`
      });
    }

    const productVendorId = (product.vendor?._id || product.vendor).toString();
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = await Cart.create({ user: userId, vendor: null, items: [] });
    }

    // 🔴 SINGLE-STORE VENDOR CONFLICT CHECK
    if (cart.vendor && cart.items.length > 0 && cart.vendor.toString() !== productVendorId) {
      const currentVendor = await Vendor.findById(cart.vendor);
      return res.status(409).json({
        ok: false,
        code: 'VENDOR_CONFLICT',
        message: 'Cart already contains items from another store. S-farmart delivers from one store per order.',
        currentVendor: {
          _id: cart.vendor,
          name: currentVendor?.storeName || 'Previous Store',
          itemCount: cart.itemCount
        },
        newVendor: {
          _id: product.vendor?._id || product.vendor,
          name: product.vendor?.storeName || 'New Store'
        }
      });
    }

    // Unlocked or matching vendor: Lock cart to product vendor
    if (!cart.vendor || cart.items.length === 0) {
      cart.vendor = product.vendor?._id || product.vendor;
    }

    const existingIndex = cart.items.findIndex(
      (it) => it.product.toString() === productId.toString()
    );

    const pricePaise = Math.round((product.price || 0) * 100);

    if (existingIndex > -1) {
      const newQty = Math.min(cart.items[existingIndex].qty + quantity, Math.min(20, product.stockQty));
      cart.items[existingIndex].qty = newQty;
      cart.items[existingIndex].priceAtAdd = pricePaise; // refresh price snapshot
    } else {
      cart.items.push({
        product: product._id,
        name: product.name,
        image: product.image || '',
        unit: product.unit || '1 pc',
        priceAtAdd: pricePaise,
        qty: Math.min(quantity, Math.min(20, product.stockQty)),
        addedAt: new Date()
      });
    }

    await cart.save();
    const formatted = await formatCartResponse(cart);
    res.json({ ok: true, success: true, cart: formatted });
  } catch (error) {
    console.error('addItem error:', error);
    res.status(500).json({ ok: false, success: false, code: 'ADD_ITEM_FAILED', message: error.message });
  }
};

// @desc    Update item quantity in cart
// @route   PATCH /api/cart/items/:productId
export const updateItemQty = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { productId } = req.params;
    const { qty } = req.body;

    if (!productId || !mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ ok: false, code: 'INVALID_PRODUCT_ID', message: 'Invalid product ID' });
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ ok: false, code: 'CART_NOT_FOUND', message: 'Cart not found' });
    }

    const parsedQty = parseInt(qty, 10);
    if (parsedQty <= 0) {
      // Remove item
      cart.items = cart.items.filter((it) => it.product.toString() !== productId);
      if (cart.items.length === 0) {
        cart.vendor = null;
      }
    } else {
      const item = cart.items.find((it) => it.product.toString() === productId);
      if (!item) {
        return res.status(404).json({ ok: false, code: 'ITEM_NOT_IN_CART', message: 'Item not in cart' });
      }
      const product = await Product.findById(productId);
      const maxAllowed = product ? Math.min(20, product.stockQty) : 20;
      item.qty = Math.min(parsedQty, maxAllowed);
    }

    await cart.save();
    const formatted = await formatCartResponse(cart);
    res.json({ ok: true, success: true, cart: formatted });
  } catch (error) {
    console.error('updateItemQty error:', error);
    res.status(500).json({ ok: false, code: 'UPDATE_QTY_FAILED', message: error.message });
  }
};

// @desc    Remove single item from cart
// @route   DELETE /api/cart/items/:productId
export const removeItem = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { productId } = req.params;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ ok: false, code: 'CART_NOT_FOUND', message: 'Cart not found' });
    }

    cart.items = cart.items.filter((it) => it.product.toString() !== productId);
    if (cart.items.length === 0) {
      cart.vendor = null;
    }

    await cart.save();
    const formatted = await formatCartResponse(cart);
    res.json({ ok: true, success: true, cart: formatted });
  } catch (error) {
    console.error('removeItem error:', error);
    res.status(500).json({ ok: false, code: 'REMOVE_ITEM_FAILED', message: error.message });
  }
};

// @desc    Clear entire cart (unlocks vendor)
// @route   DELETE /api/cart
export const clearCart = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    let cart = await Cart.findOne({ user: userId });
    if (cart) {
      cart.items = [];
      cart.vendor = null;
      await cart.save();
    } else {
      cart = await Cart.create({ user: userId, vendor: null, items: [] });
    }
    const formatted = await formatCartResponse(cart);
    res.json({ ok: true, success: true, cart: formatted });
  } catch (error) {
    console.error('clearCart error:', error);
    res.status(500).json({ ok: false, code: 'CLEAR_CART_FAILED', message: error.message });
  }
};

// @desc    Switch vendor atomically: clear old cart & add new vendor item in one transaction
// @route   POST /api/cart/switch-vendor
export const switchVendor = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let responseCart;
    await session.withTransaction(async () => {
      const userId = req.user.id || req.user._id;
      const { productId, qty = 1 } = req.body;

      if (!productId || !mongoose.isValidObjectId(productId)) {
        throw new Error('INVALID_PRODUCT_ID');
      }

      const product = await Product.findById(productId).populate('vendor').session(session);
      if (!product || !product.isActive || !product.inStock) {
        throw new Error('PRODUCT_UNAVAILABLE');
      }

      const quantity = Math.max(1, Math.min(20, Math.min(parseInt(qty, 10) || 1, product.stockQty)));
      const pricePaise = Math.round((product.price || 0) * 100);

      let cart = await Cart.findOne({ user: userId }).session(session);
      if (!cart) {
        cart = new Cart({ user: userId });
      }

      // Reset cart and assign new vendor in one atomic step
      cart.vendor = product.vendor?._id || product.vendor;
      cart.items = [
        {
          product: product._id,
          name: product.name,
          image: product.image || '',
          unit: product.unit || '1 pc',
          priceAtAdd: pricePaise,
          qty: quantity,
          addedAt: new Date()
        }
      ];

      await cart.save({ session });
      responseCart = cart;
    });

    await session.endSession();
    const formatted = await formatCartResponse(responseCart);
    res.json({
      ok: true,
      success: true,
      message: 'Cart updated to new store successfully.',
      cart: formatted
    });
  } catch (error) {
    await session.endSession();
    console.error('switchVendor error:', error);
    const code = error.message === 'INVALID_PRODUCT_ID' ? 'INVALID_PRODUCT_ID' :
                 error.message === 'PRODUCT_UNAVAILABLE' ? 'PRODUCT_UNAVAILABLE' : 'SWITCH_VENDOR_FAILED';
    res.status(400).json({ ok: false, code, message: error.message });
  }
};

// @desc    Validate cart against live stock, price changes, and store availability
// @route   POST /api/cart/validate
export const validateCart = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const cart = await Cart.findOne({ user: userId });

    if (!cart || cart.items.length === 0) {
      return res.json({ ok: true, isValid: true, changes: [], cart: cart || { items: [] } });
    }

    const changes = [];
    let cartModified = false;

    // Check Vendor status
    if (cart.vendor) {
      const vendorDoc = await Vendor.findById(cart.vendor);
      if (!vendorDoc || !vendorDoc.isOpen) {
        changes.push({
          type: 'VENDOR_OFFLINE',
          vendorName: vendorDoc?.storeName || 'Selected Store',
          message: `${vendorDoc?.storeName || 'This store'} is currently closed and not accepting new orders.`
        });
      }
    }

    // Check items
    const productIds = cart.items.map((it) => it.product);
    const liveProducts = await Product.find({ _id: { $in: productIds } });

    const survivingItems = [];
    for (const it of cart.items) {
      const live = liveProducts.find((p) => p._id.toString() === it.product.toString());

      if (!live || !live.isActive) {
        changes.push({
          type: 'ITEM_REMOVED',
          productId: it.product,
          name: it.name,
          message: `"${it.name}" is no longer available and was removed from your cart.`
        });
        cartModified = true;
        continue;
      }

      // Check price changes
      const livePricePaise = Math.round((live.price || 0) * 100);
      if (livePricePaise !== it.priceAtAdd) {
        changes.push({
          type: 'PRICE_CHANGED',
          productId: it.product,
          name: it.name,
          oldPricePaise: it.priceAtAdd,
          newPricePaise: livePricePaise,
          oldRupees: it.priceAtAdd / 100,
          newRupees: livePricePaise / 100,
          message: `Price for "${it.name}" updated from ₹${it.priceAtAdd / 100} to ₹${livePricePaise / 100}.`
        });
        it.priceAtAdd = livePricePaise;
        cartModified = true;
      }

      // Check stock reduction
      if (!live.inStock || live.stockQty <= 0) {
        changes.push({
          type: 'ITEM_REMOVED',
          productId: it.product,
          name: it.name,
          message: `"${it.name}" is now out of stock.`
        });
        cartModified = true;
        continue;
      } else if (live.stockQty < it.qty) {
        changes.push({
          type: 'QTY_REDUCED',
          productId: it.product,
          name: it.name,
          oldQty: it.qty,
          newQty: live.stockQty,
          message: `Only ${live.stockQty} unit(s) available for "${it.name}". Quantity adjusted.`
        });
        it.qty = live.stockQty;
        cartModified = true;
      }

      survivingItems.push(it);
    }

    cart.items = survivingItems;
    if (cart.items.length === 0) {
      cart.vendor = null;
      cartModified = true;
    }

    if (cartModified) {
      await cart.save();
    }

    const formatted = await formatCartResponse(cart);
    res.json({
      ok: true,
      isValid: changes.length === 0,
      changes,
      cart: formatted
    });
  } catch (error) {
    console.error('validateCart error:', error);
    res.status(500).json({ ok: false, code: 'VALIDATION_FAILED', message: error.message });
  }
};

// @desc    Merge guest cart into server cart upon user login
// @route   POST /api/cart/merge
export const mergeCart = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { items = [] } = req.body;

    if (!items || items.length === 0) {
      const cart = await Cart.findOne({ user: userId });
      const formatted = cart ? await formatCartResponse(cart) : { items: [] };
      return res.json({ ok: true, cart: formatted, message: 'No guest items to merge' });
    }

    // Validate guest items vendor consistency
    const guestProductIds = items.map((i) => i.productId || i.product || i._id).filter(id => mongoose.isValidObjectId(id));
    const dbProducts = await Product.find({ _id: { $in: guestProductIds } }).populate('vendor');

    if (dbProducts.length === 0) {
      const cart = await Cart.findOne({ user: userId });
      const formatted = cart ? await formatCartResponse(cart) : { items: [] };
      return res.json({ ok: true, cart: formatted });
    }

    const guestVendorId = dbProducts[0].vendor?._id?.toString() || dbProducts[0].vendor?.toString();

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = await Cart.create({ user: userId, vendor: null, items: [] });
    }

    // If server cart is not empty and vendors differ, return choice conflict unless overwrite is explicitly requested
    if (cart.vendor && cart.items.length > 0 && cart.vendor.toString() !== guestVendorId) {
      if (!req.body.overwrite) {
        const currentVendor = await Vendor.findById(cart.vendor);
        return res.status(409).json({
          ok: false,
          code: 'MERGE_VENDOR_CONFLICT',
          message: 'A different store cart already exists in your account.',
          currentVendor: {
            _id: cart.vendor,
            name: currentVendor?.storeName || 'Account Store Cart',
            itemCount: cart.itemCount
          },
          guestVendor: {
            _id: guestVendorId,
            name: dbProducts[0].vendor?.storeName || 'Guest Store Cart',
            itemCount: items.length
          }
        });
      }
      // Overwrite: User chose 'Keep this cart' -> reset server cart items to accept guest store items
      cart.items = [];
      cart.vendor = guestVendorId;
    }

    // Same vendor, empty server cart, or overwrite confirmed: Merge items
    cart.vendor = guestVendorId;
    for (const gItem of items) {
      const pId = (gItem.productId || gItem.product || gItem._id).toString();
      const dbProd = dbProducts.find((p) => p._id.toString() === pId);
      if (!dbProd || !dbProd.isActive || !dbProd.inStock) continue;

      const gQty = Math.max(1, parseInt(gItem.qty || 1, 10));
      const existing = cart.items.find((it) => it.product.toString() === pId);
      const pricePaise = Math.round((dbProd.price || 0) * 100);

      if (existing) {
        existing.qty = Math.min(20, Math.min(existing.qty + gQty, dbProd.stockQty));
        existing.priceAtAdd = pricePaise;
      } else {
        cart.items.push({
          product: dbProd._id,
          name: dbProd.name,
          image: dbProd.image || '',
          unit: dbProd.unit || '1 pc',
          priceAtAdd: pricePaise,
          qty: Math.min(20, Math.min(gQty, dbProd.stockQty)),
          addedAt: new Date()
        });
      }
    }

    await cart.save();
    const formatted = await formatCartResponse(cart);
    res.json({ ok: true, success: true, cart: formatted });
  } catch (error) {
    console.error('mergeCart error:', error);
    res.status(500).json({ ok: false, code: 'MERGE_FAILED', message: error.message });
  }
};
