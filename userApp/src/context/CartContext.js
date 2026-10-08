import React, { createContext, useState, useContext, useEffect, useMemo, useCallback, useRef } from 'react';
import storage from '../services/storage';
import { apiService } from '../services/api';
import { createOrderRecovery } from '../services/orderRecovery';
import { useApp } from './AppContext';
import { ClearCartModal } from '../components/ClearCartModal';
import { CartMergeModal } from '../components/CartMergeModal';
import { showAlert } from '../utils/alert';

const recoverOrder = createOrderRecovery(storage);

const CartContext = createContext();

const GUEST_CART_KEY = 'guestCart';
const GUEST_CART_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_GUEST_ITEMS = 20;

export const CartProvider = ({ children }) => {
  const { isAuthenticated, userProfile } = useApp();

  // Cart state: strictly 1 vendor at any time
  const [vendorId, setVendorId] = useState(null);
  const [vendorName, setVendorName] = useState(null);
  const [vendorStoreType, setVendorStoreType] = useState(null);
  const [vendorMinOrder, setVendorMinOrder] = useState(0);
  const [items, setItems] = useState([]); // [{ product, quantity }]
  const [validationChanges, setValidationChanges] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isGuestCartLoaded, setIsGuestCartLoaded] = useState(false);

  // Synchronize vendor details (minOrderValue, storeName, storeType) whenever vendorId changes
  useEffect(() => {
    if (!vendorId) {
      setVendorMinOrder(0);
      return;
    }
    let isMounted = true;
    apiService.getVendorById(vendorId).then((res) => {
      if (isMounted && res && res.success && res.vendor) {
        if (res.vendor.minOrderValue !== undefined) {
          setVendorMinOrder(Number(res.vendor.minOrderValue) || 0);
        }
        if (res.vendor.storeName && !vendorName) {
          setVendorName(res.vendor.storeName);
        }
        if (res.vendor.storeType && !vendorStoreType) {
          setVendorStoreType(res.vendor.storeType);
        }
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [vendorId, vendorName, vendorStoreType]);

  // Conflict modal state for Single-Vendor Cart Guard (within browsing)
  const [conflictModal, setConflictModal] = useState({
    visible: false,
    currentVendorName: '',
    newVendorName: '',
    itemCount: 1,
    pendingProduct: null
  });

  // Conflict modal state for Login Cart Merge (Account cart vs Guest cart)
  const [mergeConflictModal, setMergeConflictModal] = useState({
    visible: false,
    currentVendorName: '',
    currentVendorItemCount: 1,
    guestVendorName: '',
    guestVendorItemCount: 1,
    guestItems: []
  });

  // Helper to extract vendor id
  const getItemVendorId = (product) => {
    if (!product) return null;
    return (
      product.vendor?._id ||
      product.vendor?.id ||
      (typeof product.vendor === 'string' ? product.vendor : null) ||
      product.vendorId ||
      null
    );
  };

  // Helper to extract vendor name
  const getItemVendorName = (product) => {
    if (!product) return 'Store';
    return (
      product.vendor?.storeName ||
      product.vendorName ||
      product.farmer ||
      'Partner Store'
    );
  };

  // Synchronize with server cart on login or mount
  const syncServerCart = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await apiService.getCart();
      if (res && res.ok && res.cart) {
        const sCart = res.cart;
        if (sCart.vendor) {
          setVendorId(sCart.vendor._id || sCart.vendor);
          setVendorName(sCart.vendor.storeName || 'Partner Store');
          if (sCart.vendor.storeType) setVendorStoreType(sCart.vendor.storeType);
          if (sCart.vendor.minOrderValue !== undefined) {
            setVendorMinOrder(Number(sCart.vendor.minOrderValue) || 0);
          }
        } else {
          setVendorId(null);
          setVendorName(null);
          setVendorStoreType(null);
          setVendorMinOrder(0);
        }

        if (Array.isArray(sCart.items)) {
          setItems(
            sCart.items.map((it) => ({
              product: {
                _id: it.product,
                name: it.name,
                image: it.image,
                unit: it.unit,
                price: it.priceAtAdd ? it.priceAtAdd / 100 : 0
              },
              quantity: it.qty
            }))
          );
        }
      }
    } catch (err) {
      console.warn('Failed to sync server cart:', err);
    }
  }, [isAuthenticated]);

  // Load guest cart from local storage on startup if not authenticated
  useEffect(() => {
    const loadGuestCart = async () => {
      if (isAuthenticated) {
        setIsGuestCartLoaded(true);
        return;
      }
      try {
        const raw = await storage.getItem(GUEST_CART_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const age = Date.now() - (parsed.updatedAt || 0);
          if (age < GUEST_CART_TTL_MS && Array.isArray(parsed.items) && parsed.items.length > 0) {
            setVendorId(parsed.vendorId || null);
            setVendorName(parsed.vendorName || null);
            setVendorStoreType(parsed.vendorStoreType || null);
            setVendorMinOrder(Number(parsed.vendorMinOrder) || 0);
            setItems(parsed.items.slice(0, MAX_GUEST_ITEMS));
          } else {
            await storage.removeItem(GUEST_CART_KEY);
          }
        }
      } catch (err) {
        console.warn('Failed to load guest cart:', err);
      } finally {
        setIsGuestCartLoaded(true);
      }
    };

    loadGuestCart();
  }, [isAuthenticated]);

  // Persist guest cart to local storage whenever items change in guest mode
  useEffect(() => {
    if (!isAuthenticated && isGuestCartLoaded) {
      const persist = async () => {
        try {
          if (items.length > 0 && vendorId) {
            const payload = {
              vendorId,
              vendorName,
              vendorStoreType,
              vendorMinOrder,
              items: items.slice(0, MAX_GUEST_ITEMS),
              updatedAt: Date.now()
            };
            await storage.setItem(GUEST_CART_KEY, JSON.stringify(payload));
          } else {
            await storage.removeItem(GUEST_CART_KEY);
          }
        } catch (err) {
          console.warn('Failed to persist guest cart:', err);
        }
      };
      persist();
    }
  }, [items, vendorId, vendorName, vendorStoreType, vendorMinOrder, isAuthenticated, isGuestCartLoaded]);

  // Attempt merge when user logs in
  const prevAuthRef = useRef(isAuthenticated);
  useEffect(() => {
    const handleAuthTransition = async () => {
      if (!prevAuthRef.current && isAuthenticated) {
        // Just logged in! Check if we have guestCart to merge
        try {
          const raw = await storage.getItem(GUEST_CART_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.items) && parsed.items.length > 0) {
              const formattedItems = parsed.items.map((it) => ({
                productId: it.product?._id || it.product?.id,
                qty: it.quantity || 1
              }));

              try {
                const mergeRes = await apiService.mergeCart(formattedItems, false);
                if (mergeRes && mergeRes.ok) {
                  await storage.removeItem(GUEST_CART_KEY);
                  await syncServerCart();
                  await validateCart();
                  return;
                }
              } catch (mergeErr) {
                if (mergeErr?.code === 'MERGE_VENDOR_CONFLICT') {
                  setMergeConflictModal({
                    visible: true,
                    currentVendorName: mergeErr.currentVendor?.name || 'Account Store',
                    currentVendorItemCount: mergeErr.currentVendor?.itemCount || 1,
                    guestVendorName: mergeErr.guestVendor?.name || parsed.vendorName || 'Guest Store',
                    guestVendorItemCount: parsed.items.length,
                    guestItems: formattedItems
                  });
                  return;
                }
                console.warn('Cart merge error on login:', mergeErr);
              }
            }
          }
        } catch (e) {
          console.warn('Error checking guest cart on login:', e);
        }
        await syncServerCart();
      } else if (isAuthenticated) {
        await syncServerCart();
      } else {
        // User logged out: clear cart to prevent leakage between user accounts
        setItems([]);
        setVendorId(null);
        setVendorName(null);
        setVendorStoreType(null);
        setVendorMinOrder(0);
        setValidationChanges([]);
      }
      prevAuthRef.current = isAuthenticated;
    };

    handleAuthTransition();
  }, [isAuthenticated, syncServerCart]);

  // Keep Account Cart (discard guest items)
  const handleKeepAccountCart = async () => {
    try {
      await storage.removeItem(GUEST_CART_KEY);
    } catch (e) {}
    setMergeConflictModal({
      visible: false,
      currentVendorName: '',
      currentVendorItemCount: 1,
      guestVendorName: '',
      guestVendorItemCount: 1,
      guestItems: []
    });
    await syncServerCart();
  };

  // Keep Guest Cart (overwrite server cart)
  const handleKeepGuestCart = async () => {
    const { guestItems } = mergeConflictModal;
    try {
      const res = await apiService.mergeCart(guestItems, true);
      if (res && res.ok) {
        await storage.removeItem(GUEST_CART_KEY);
        await syncServerCart();
        await validateCart();
      }
    } catch (err) {
      console.warn('Failed to overwrite server cart with guest items:', err);
    } finally {
      setMergeConflictModal({
        visible: false,
        currentVendorName: '',
        currentVendorItemCount: 1,
        guestVendorName: '',
        guestVendorItemCount: 1,
        guestItems: []
      });
    }
  };

  // Validate cart on cart open or before checkout
  const validateCart = useCallback(async () => {
    if (!isAuthenticated || items.length === 0) return { isValid: true, changes: [] };
    try {
      setIsValidating(true);
      const res = await apiService.validateCart();
      if (res && res.ok) {
        if (res.changes && res.changes.length > 0) {
          setValidationChanges(res.changes);
        }
        await syncServerCart();
        return { isValid: res.isValid, changes: res.changes || [] };
      }
    } catch (err) {
      console.warn('Validate cart error:', err);
    } finally {
      setIsValidating(false);
    }
    return { isValid: true, changes: [] };
  }, [isAuthenticated, items.length, syncServerCart]);

  const acknowledgeChanges = () => {
    setValidationChanges([]);
  };

  const addToCart = async (product, qty = 1) => {
    // 🔴 STRICT STOCK GUARD: Prevent adding Out of Stock items
    if (product.inStock === false || (product.stockQty !== undefined && product.stockQty <= 0)) {
      showAlert('Out of Stock', `"${product.name || 'This item'}" is currently out of stock.`);
      return false;
    }

    const prodVendorId = getItemVendorId(product);
    const prodVendorName = getItemVendorName(product);
    const prodStoreType = product.vendor?.storeType || 'FARMER';
    const prodId = product._id || product.id;

    // Check 20-item cap for guest cart
    if (!isAuthenticated) {
      const existing = items.find((it) => (it.product?._id || it.product?.id) === prodId);
      if (!existing && items.length >= MAX_GUEST_ITEMS) {
        showAlert('Cart Limit', 'Guest cart is limited to 20 items. Please login to add more.');
        return false;
      }
    }

    // Client-side quick check for single-vendor cart rule
    if (items.length > 0 && vendorId && prodVendorId && vendorId.toString() !== prodVendorId.toString()) {
      setConflictModal({
        visible: true,
        currentVendorName: vendorName || 'Previous Store',
        newVendorName: prodVendorName,
        itemCount: items.reduce((sum, it) => sum + (it.quantity || 1), 0),
        pendingProduct: product
      });
      return false;
    }

    // Call server endpoint if authenticated
    if (isAuthenticated && prodId) {
      try {
        const res = await apiService.addCartItem(prodId, qty);
        if (res && res.ok) {
          await syncServerCart();
          return true;
        }
      } catch (err) {
        if (err?.code === 'VENDOR_CONFLICT') {
          setConflictModal({
            visible: true,
            currentVendorName: err.currentVendor?.name || vendorName || 'Previous Store',
            newVendorName: err.newVendor?.name || prodVendorName,
            itemCount: err.currentVendor?.itemCount || items.length,
            pendingProduct: product
          });
          return false;
        }
        console.warn('Server addCartItem error:', err);
      }
    }

    // Local / Guest state update
    if (!vendorId && prodVendorId) {
      setVendorId(prodVendorId);
      setVendorName(prodVendorName);
      setVendorStoreType(prodStoreType);
      const prodMinOrder = product.vendor?.minOrderValue ?? product.minOrderValue;
      if (prodMinOrder !== undefined) {
        setVendorMinOrder(Number(prodMinOrder) || 0);
      }
    }

    setItems((prevItems) => {
      const existing = prevItems.find(
        (it) => (it.product?._id || it.product?.id) === prodId
      );

      if (existing) {
        const nextQty = existing.quantity + qty;
        if (product.stockQty !== undefined && nextQty > product.stockQty) {
          showAlert('Stock Limit', `Only ${product.stockQty} unit(s) of "${product.name || 'this item'}" available in stock.`);
          return prevItems;
        }
        return prevItems.map((it) =>
          (it.product?._id || it.product?.id) === prodId
            ? { ...it, quantity: nextQty }
            : it
        );
      }
      return [...prevItems, { product, quantity: qty }];
    });

    return true;
  };

  const confirmReplaceCart = async () => {
    const { pendingProduct } = conflictModal;
    if (!pendingProduct) return;

    const newVId = getItemVendorId(pendingProduct);
    const newVName = getItemVendorName(pendingProduct);
    const newVType = pendingProduct.vendor?.storeType || 'FARMER';
    const newVMinOrder = pendingProduct.vendor?.minOrderValue ?? pendingProduct.minOrderValue ?? 0;
    const prodId = pendingProduct._id || pendingProduct.id;

    if (isAuthenticated && prodId) {
      try {
        await apiService.switchCartVendor(prodId, 1);
        await syncServerCart();
      } catch (err) {
        console.warn('switchCartVendor server error:', err);
      }
    }

    setVendorId(newVId);
    setVendorName(newVName);
    setVendorStoreType(newVType);
    setVendorMinOrder(Number(newVMinOrder) || 0);
    setItems([{ product: pendingProduct, quantity: 1 }]);

    setConflictModal({
      visible: false,
      currentVendorName: '',
      newVendorName: '',
      itemCount: 1,
      pendingProduct: null
    });
  };

  const cancelReplaceCart = () => {
    setConflictModal({
      visible: false,
      currentVendorName: '',
      newVendorName: '',
      itemCount: 1,
      pendingProduct: null
    });
  };

  const updateQuantity = async (productId, delta) => {
    const currentItem = items.find((it) => (it.product?._id || it.product?.id) === productId);
    if (!currentItem) return;

    const newQty = currentItem.quantity + delta;

    if (isAuthenticated) {
      try {
        if (newQty <= 0) {
          await apiService.removeCartItem(productId);
        } else {
          await apiService.updateCartItemQty(productId, newQty);
        }
        await syncServerCart();
        return;
      } catch (err) {
        console.warn('updateCartItemQty server error:', err);
      }
    }

    setItems((prevItems) => {
      if (newQty <= 0) {
        const remaining = prevItems.filter(
          (it) => (it.product?._id || it.product?.id) !== productId
        );
        if (remaining.length === 0) {
          setVendorId(null);
          setVendorName(null);
          setVendorStoreType(null);
          setVendorMinOrder(0);
        }
        return remaining;
      }
      return prevItems.map((it) =>
        (it.product?._id || it.product?.id) === productId
          ? { ...it, quantity: newQty }
          : it
      );
    });
  };

  const removeFromCart = async (productId) => {
    if (isAuthenticated) {
      try {
        await apiService.removeCartItem(productId);
        await syncServerCart();
        return;
      } catch (err) {
        console.warn('removeCartItem server error:', err);
      }
    }

    setItems((prevItems) => {
      const remaining = prevItems.filter(
        (it) => (it.product?._id || it.product?.id) !== productId
      );
      if (remaining.length === 0) {
        setVendorId(null);
        setVendorName(null);
        setVendorStoreType(null);
        setVendorMinOrder(0);
      }
      return remaining;
    });
  };

  const clearEntireCart = async (localOnly = false) => {
    if (!localOnly) {
      try {
        const token = await storage.getAccessToken();
        if (isAuthenticated && token) {
          await apiService.clearCart();
        }
      } catch (e) {
        // silent fallback
      }
    }
    try {
      await storage.removeItem(GUEST_CART_KEY);
    } catch (e) {}
    setItems([]);
    setVendorId(null);
    setVendorName(null);
    setVendorStoreType(null);
    setVendorMinOrder(0);
    setValidationChanges([]);
  };

  const placeOrder = async (deliveryAddress, paymentMethod = 'COD') => {
    if (items.length === 0) throw new Error('Cart is empty');
    const orderPayload = {
      vendorId,
      items: items.map((it) => ({
        productId: it.product?._id || it.product?.id,
        qty: it.quantity
      })),
      address: deliveryAddress,
      paymentMethod,
      customerName: deliveryAddress?.name,
      customerPhone: deliveryAddress?.phone
    };
    return recoverOrder(userProfile?._id || userProfile?.id, orderPayload, async (claimedPayload) => {
      const res = await apiService.placeOrder(claimedPayload);
      if (res && res.success && res.order) {
        await clearEntireCart();
        return res.order;
      }
      throw new Error(res?.message || 'Failed to place order');
    });
  };

  const billSummary = useMemo(() => {
    const subtotal = items.reduce((acc, it) => {
      const p = parseFloat(it.product?.price ?? it.price ?? 0) || 0;
      const q = parseInt(it.quantity ?? 1, 10) || 1;
      return acc + p * q;
    }, 0);

    const deliveryFee = subtotal === 0 ? 0 : subtotal >= 200 ? 0 : 25;
    const taxes = Math.round(subtotal * 0.05);
    const platformFee = subtotal === 0 ? 0 : 5;
    const total = subtotal + deliveryFee + taxes + platformFee;
    const totalCount = items.reduce((acc, it) => acc + (parseInt(it.quantity ?? 1, 10) || 1), 0);

    const minOrder = Number(vendorMinOrder) || 0;
    const isMinOrderMet = items.length === 0 || minOrder === 0 || subtotal >= minOrder;
    const minOrderShortfall = isMinOrderMet ? 0 : Math.max(0, minOrder - subtotal);

    return {
      subtotal,
      itemsTotal: subtotal,
      deliveryFee,
      taxes,
      platformFee,
      total,
      grandTotal: total,
      totalCount,
      minOrder,
      isMinOrderMet,
      minOrderShortfall
    };
  }, [items, vendorMinOrder]);

  return (
    <CartContext.Provider
      value={{
        vendorId,
        vendorName,
        vendorStoreType,
        vendorMinOrder,
        items,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearEntireCart,
        clearCart: clearEntireCart,
        placeOrder,
        billSummary,
        conflictModal,
        confirmReplaceCart,
        cancelReplaceCart,
        validationChanges,
        isValidating,
        validateCart,
        acknowledgeChanges
      }}
    >
      {children}

      {/* ClearCartModal for single-store switching */}
      <ClearCartModal
        visible={conflictModal.visible}
        currentVendorName={conflictModal.currentVendorName}
        newVendorName={conflictModal.newVendorName}
        itemCount={conflictModal.itemCount}
        onCancel={cancelReplaceCart}
        onConfirm={confirmReplaceCart}
      />

      {/* CartMergeModal for login conflict between account cart and guest cart */}
      <CartMergeModal
        visible={mergeConflictModal.visible}
        currentVendorName={mergeConflictModal.currentVendorName}
        currentVendorItemCount={mergeConflictModal.currentVendorItemCount}
        guestVendorName={mergeConflictModal.guestVendorName}
        guestVendorItemCount={mergeConflictModal.guestVendorItemCount}
        onKeepAccountCart={handleKeepAccountCart}
        onKeepGuestCart={handleKeepGuestCart}
        onClose={handleKeepAccountCart}
      />
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export default CartContext;
