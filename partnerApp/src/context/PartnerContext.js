import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { fetchJsonResponse as fetch, collectPages, createSingleFlight, startPolling } from '../services/requestPolicy';
import { API_BASE_URL } from '../config/env';
import storage from '../services/storage';
import { subscribeStock } from '../services/stockEvents';
import { registerForPushNotificationsAsync, setNotificationAuthReady } from '../services/notificationService';

const PartnerContext = createContext();

export const PartnerProvider = ({ children }) => {
  const readFlight = useRef(createSingleFlight());
  const sessionRef = useRef({ id: null, token: null });
  const isClearingSessionRef = useRef(false);
  const pushTokenRef = useRef(null);
  const storeToggleRef = useRef(false);
  const stockUpdatesRef = useRef(new Map());
  const authEpochRef = useRef(0);
  const [vendor, setVendor] = useState(null);
  const [token, setToken] = useState(null);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryRequests, setCategoryRequests] = useState([]);
  const [stats, setStats] = useState({
    todaySales: 0,
    todayOrdersCount: 0,
    activeOrdersCount: 0,
    allTimeDelivered: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isTogglingStore, setIsTogglingStore] = useState(false);

  useEffect(() => subscribeStock((update) => {
    if (String(update.vendorId) !== String(sessionRef.current.id)) return;
    const updates = stockUpdatesRef.current;
    if (!updates.has(update.productId) && updates.size >= 4000) updates.delete(updates.keys().next().value);
    updates.set(update.productId, update);
    setInventory((prev) => prev.map((product) => product.id === update.productId ? {
      ...product, stock: update.stockQty, stockQty: update.stockQty, isAvailable: update.inStock
    } : product));
  }), []);

  // Sync push token with backend after vendor login/restore
  const syncPushToken = useCallback(async (activeToken) => {
    const epoch = authEpochRef.current;
    if (!activeToken) return;
    try {
      const pushData = await registerForPushNotificationsAsync();
      if (authEpochRef.current !== epoch) return;
      if (pushData?.token) {
        const deviceId = await storage.getDeviceId();
        if (authEpochRef.current !== epoch) return;
        await fetch(`${API_BASE_URL}/auth/push-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeToken}`
          },
          body: JSON.stringify({
            token: pushData.token,
            platform: pushData.platform,
            deviceId
          })
        });
        if (authEpochRef.current === epoch) {
          pushTokenRef.current = pushData.token;
        }
      }
    } catch (err) {
      console.warn('[PartnerPush] Failed to sync push token:', err);
    }
  }, []);

  // Cleanup push token association on logout to prevent cross-account push leakage
  const cleanupPushToken = useCallback(async (activeToken) => {
    try {
      const deviceId = await storage.getDeviceId();
      if (activeToken) {
        await fetch(`${API_BASE_URL}/auth/push-token/unregister`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeToken}`
          },
          body: JSON.stringify({
            token: pushTokenRef.current,
            deviceId
          })
        }).catch(() => {});
      }
      pushTokenRef.current = null;
    } catch (err) {
      console.warn('[PartnerPush] Failed to unregister push token:', err);
    }
  }, []);

  // Centralized session invalidation for expired or unauthorized (401) states
  const handleSessionExpired = useCallback(async (reason = 'Session expired') => {
    if (isClearingSessionRef.current) return;
    isClearingSessionRef.current = true;
    console.warn(`[PartnerSession] ${reason}. Invalidating session and returning to login.`);

    const activeToken = sessionRef.current.token;
    const clearingEpoch = ++authEpochRef.current;
    setNotificationAuthReady(false);
    await cleanupPushToken(activeToken);
    if (authEpochRef.current !== clearingEpoch) { isClearingSessionRef.current = false; return; }

    sessionRef.current = { id: null, token: null };
    setVendor(null);
    setToken(null);
    setOrders([]);
    setInventory([]);
    setStats({
      todaySales: 0,
      todayOrdersCount: 0,
      activeOrdersCount: 0,
      allTimeDelivered: 0
    });

    try {
      await storage.clearAuth();
    } catch (e) {
      console.warn('Failed to clear partner storage auth:', e);
    } finally {
      isClearingSessionRef.current = false;
    }
  }, [cleanupPushToken]);

  // Fetch Categories for product creation (Public)
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/categories?partner=true`);
      const data = await res.json();
      if (data.success && Array.isArray(data.categories)) {
        setCategories(data.categories);
      }
    } catch (e) {
      console.warn('Failed to fetch categories:', e);
    }
  }, []);

  // Fetch Vendor Inventory Products (Public vendor catalog)
  const fetchInventory = useCallback(async (vId) => {
    const id = vId || sessionRef.current.id;
    if (!id) return;
    try {
      const epoch = authEpochRef.current;
      const data = await readFlight.current(`inventory:${epoch}:${id}`, () => collectPages(async ({ page, limit }) => {
        const res = await fetch(`${API_BASE_URL}/vendors/${id}/products?page=${page}&limit=${limit}`);
        return res.json();
      }, 'products'));
      if (sessionRef.current.id !== id || authEpochRef.current !== epoch) return;
      if (data.success && Array.isArray(data.products)) {
        const mapped = data.products.map((p) => {
          const update = stockUpdatesRef.current.get(p._id);
          const useLatest = new Date(update?.updatedAt || 0).getTime() > new Date(p.updatedAt || 0).getTime();
          return {
            id: p._id,
            productId: p._id,
            name: p.name,
            category: p.category?.name || 'General',
            categoryId: p.category?._id,
            subCategory: p.subCategory || '',
            price: p.price,
            mrp: p.mrp || p.price,
            unit: p.unit,
            stock: useLatest ? update.stockQty : p.stockQty,
            stockQty: useLatest ? update.stockQty : p.stockQty,
            isAvailable: useLatest ? update.inStock : p.inStock,
            image: p.image,
            description: p.description,
            isVeg: p.isVeg !== undefined ? p.isVeg : true
          };
        });
        setInventory(mapped);
      }
    } catch (e) {
      console.warn('Failed to fetch inventory (offline/network):', e);
    }
  }, []);

  // Fetch Vendor Orders Queue (Protected)
  const fetchOrders = useCallback(async (vId, authToken) => {
    const id = vId || sessionRef.current.id;
    const authHeader = authToken || sessionRef.current.token;
    if (!id || !authHeader) return;
    try {
      const epoch = authEpochRef.current;
      const data = await readFlight.current(`orders:${epoch}:${id}`, () => collectPages(async ({ page, limit }) => {
        const res = await fetch(`${API_BASE_URL}/orders/vendor/${id}?status=active&page=${page}&limit=${limit}`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authHeader}` }
        });
        if (res.status === 401) {
          if (authEpochRef.current === epoch && sessionRef.current.token === authHeader) {
            await handleSessionExpired('Protected orders request returned 401');
          }
          throw new Error('Session expired');
        }
        return res.json();
      }, 'orders'));
      if (sessionRef.current.id !== id || sessionRef.current.token !== authHeader || authEpochRef.current !== epoch) return;
      if (data.success && Array.isArray(data.orders)) {
        setOrders(data.orders);
      }
    } catch (e) {
      // Network error (offline mode) - preserve current state
      console.warn('Network error while fetching orders:', e);
    }
  }, [handleSessionExpired]);

  // Fetch Vendor Stats (Protected)
  const fetchStats = useCallback(async (authToken) => {
    const t = authToken || sessionRef.current.token;
    if (!t) return;
    try {
      const res = await fetch(`${API_BASE_URL}/vendors/me/stats`, {
        headers: { Authorization: `Bearer ${t}` }
      });
      if (res.status === 401 && sessionRef.current.token === t) {
        await handleSessionExpired('Protected stats request returned 401');
        return;
      }
      if (!res.ok) {
        console.warn(`Failed to fetch stats: HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      if (sessionRef.current.token !== t) return;
      if (data.success && data.stats) {
        setStats(data.stats);
      }
    } catch (e) {
      console.warn('Network error while fetching stats:', e);
    }
  }, [handleSessionExpired]);

  // Vendor login (Phone & Password) with persistent storage
  const loginVendor = useCallback(async (phone, password) => {
    if (isClearingSessionRef.current) return { success: false, message: 'Sign-out is finishing. Please wait.' };
    const loginEpoch = ++authEpochRef.current;
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE_URL}/auth/vendor/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });
      const data = await res.json();
      if (authEpochRef.current !== loginEpoch) return { success: false, message: 'Session changed while signing in.' };
      if (data.success && data.vendor && data.token) {
        stockUpdatesRef.current.clear();
        sessionRef.current = { id: data.vendor._id, token: data.token };
        setStats({ todaySales: 0, todayOrdersCount: 0, activeOrdersCount: 0, allTimeDelivered: 0 });
        setVendor(data.vendor);
        setToken(data.token);
        // Persist to storage
        await storage.setVendor(data.vendor);
        await storage.setToken(data.token);
        setNotificationAuthReady(true);
        syncPushToken(data.token);
        // Immediately clear previous vendor's orders and inventory
        setOrders([]);
        setInventory([]);
        fetchInventory(data.vendor._id);
        fetchOrders(data.vendor._id, data.token);
        fetchStats(data.token);
        return { success: true, vendor: data.vendor };
      }
      return { success: false, message: data.message || 'Login failed' };
    } catch (err) {
      console.warn('Vendor login failed:', err);
      return { success: false, message: 'Network connection failed' };
    } finally {
      if (authEpochRef.current === loginEpoch) setIsLoading(false);
    }
  }, [fetchInventory, fetchOrders, fetchStats, syncPushToken]);

  // Initial load: Restore persistent session from device storage
  useEffect(() => {
    let isMounted = true;
    const restoreEpoch = authEpochRef.current;
    const initPartnerSession = async () => {
      fetchCategories();
      try {
        const savedVendor = await storage.getVendor();
        const savedToken = await storage.getToken();
        if (!isMounted || authEpochRef.current !== restoreEpoch) return;

        // Check that a cached/demo profile is not treated as authenticated without a token
        if (!savedVendor || !savedToken) {
          if (savedVendor || savedToken) {
            await storage.clearAuth();
          }
          if (isMounted) {
            sessionRef.current = { id: null, token: null };
            setVendor(null);
            setToken(null);
          }
          return;
        }

        // Validate restored session against server to detect stale/expired session before rendering dashboard
        try {
          const verifyRes = await fetch(`${API_BASE_URL}/vendors/me/stats`, {
            headers: { Authorization: `Bearer ${savedToken}` }
          });

          if (!isMounted || authEpochRef.current !== restoreEpoch) return;
          if (verifyRes.status === 401) {
            console.warn('[PartnerSession] Restored session token is expired/invalid (401). Purging stale session.');
            await storage.clearAuth();
            if (isMounted) {
              sessionRef.current = { id: null, token: null };
              setVendor(null);
              setToken(null);
            }
            return;
          }

          if (verifyRes.ok) {
            const statsData = await verifyRes.json();
            if (statsData.success && statsData.stats && isMounted) {
              setStats(statsData.stats);
            }
          }
        } catch (netErr) {
          // Network error (offline mode) - preserve cached credentials, do NOT purge auth
          console.warn('[PartnerSession] Network error verifying session on restore (offline mode):', netErr);
        }

        if (isMounted && authEpochRef.current === restoreEpoch) {
          authEpochRef.current += 1;
          sessionRef.current = { id: savedVendor._id, token: savedToken };
          setVendor(savedVendor);
          setToken(savedToken);
          setNotificationAuthReady(true);
          syncPushToken(savedToken);
          fetchInventory(savedVendor._id);
          fetchOrders(savedVendor._id, savedToken);
          setIsLoading(false);
        }
      } catch (e) {
        console.warn('Could not restore partner session:', e);
      } finally {
        if (isMounted && authEpochRef.current === restoreEpoch) setIsLoading(false);
      }
    };
    initPartnerSession();
    return () => {
      isMounted = false;
    };
  }, [fetchCategories, fetchInventory, fetchOrders, syncPushToken]);

  // Socket events remain immediate; fallback polling is sequential, jittered and foreground-only.
  useEffect(() => {
    if (!vendor?._id || !token) return;
    let lastSlowRead = 0;
    return startPolling(async () => {
      if (sessionRef.current.token !== token) return;
      await fetchOrders(vendor._id, token);
      if (sessionRef.current.token !== token) return;
      if (Date.now() - lastSlowRead >= 60000) {
        lastSlowRead = Date.now();
        await fetchInventory(vendor._id);
        if (sessionRef.current.token === token) await fetchStats(token);
      }
    }, { intervalMs: 20000, active: () => AppState.currentState == null || AppState.currentState === 'active' });
  }, [vendor?._id, token, fetchOrders, fetchInventory, fetchStats]);

  // Logout Vendor and clear persisted credentials immediately
  const logoutVendor = useCallback(async () => {
    if (isClearingSessionRef.current) return;
    isClearingSessionRef.current = true;
    const activeToken = token || sessionRef.current.token;
    authEpochRef.current += 1;
    setNotificationAuthReady(false);
    await cleanupPushToken(activeToken);

    // 1. Immediately reset session ref to block any pending in-flight responses
    sessionRef.current = { id: null, token: null };

    // 2. Clear state so navigation immediately returns to login screen and polling halts
    setVendor(null);
    setToken(null);
    setOrders([]);
    setInventory([]);
    setStats({
      todaySales: 0,
      todayOrdersCount: 0,
      activeOrdersCount: 0,
      allTimeDelivered: 0
    });

    // 3. Clear partner storage auth
    try {
      await storage.clearAuth();
    } catch (e) {
      console.warn('Failed to clear partner storage auth:', e);
    }

    // 4. Server logout notification (failsafe: even if server fails or network errors, client logout is done)
    try {
      if (activeToken) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeToken}`
          }
        }).catch(() => {});
      }
    } catch {
      // Ignore server logout errors
    }
    isClearingSessionRef.current = false;
  }, [token]);

  // Toggle Store Online / Offline status with idempotency lock
  const toggleStoreStatus = async () => {
    if (!vendor || !token || storeToggleRef.current) return;
    storeToggleRef.current = true;
    const epoch = authEpochRef.current;
    const previousState = vendor.isOpen;
    setIsTogglingStore(true);
    const nextState = !vendor.isOpen;
    setVendor((prev) => (prev ? { ...prev, isOpen: nextState } : prev));

    try {
      const res = await fetch(`${API_BASE_URL}/vendors/toggle-store`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isOpen: nextState })
      });
      if (res.status === 401) {
        await handleSessionExpired('Store toggle returned 401');
        return;
      }
      const data = await res.json();
      if (authEpochRef.current !== epoch) return;
      if (res.ok && data.success && data.vendor) {
        setVendor(data.vendor);
      } else {
        setVendor((prev) => prev ? { ...prev, isOpen: previousState } : prev);
      }
    } catch (e) {
      console.warn('Store status toggle failed on server:', e);
      if (authEpochRef.current === epoch) setVendor((prev) => prev ? { ...prev, isOpen: previousState } : prev);
    } finally {
      storeToggleRef.current = false;
      setIsTogglingStore(false);
    }
  };

  // Update order status
  const updateOrderStatus = async (orderId, newStatus, reason = '') => {
    if (!token) return { success: false, message: 'Not authenticated' };
    try {
      const res = await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus, rejectionReason: reason })
      });
      if (res.status === 401) {
        await handleSessionExpired('Update order returned 401');
        return { success: false, message: 'Session expired' };
      }
      const data = await res.json();
      if (data.success) {
        setOrders((prev) =>
          prev.map((o) => (o._id === orderId ? data.order : o))
        );
        if (vendor?._id) {
          fetchStats(token);
        }
        return { success: true, order: data.order };
      }
      return { success: false, message: data.message };
    } catch (e) {
      console.warn('Failed to update status on server:', e);
      return { success: false, error: e };
    }
  };

  // Add Product permanently to MongoDB
  const addInventoryItem = async (item) => {
    if (!token) return { success: false, message: 'Not authenticated' };
    try {
      const res = await fetch(`${API_BASE_URL}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: item.name,
          category: item.categoryId || item.category,
          subCategory: item.subCategory || '',
          vendor: vendor?._id,
          price: Number(item.price),
          mrp: Number(item.mrp || item.price),
          unit: item.unit || '1 pc',
          stockQty: Number(item.stock ?? 25),
          description: item.description || '',
          image: item.image || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=80',
          isVeg: item.isVeg !== undefined ? item.isVeg : true
        })
      });
      if (res.status === 401) {
        await handleSessionExpired('Add product returned 401');
        return { success: false, message: 'Session expired' };
      }
      const data = await res.json();
      if (data.success && data.product) {
        await fetchInventory(vendor?._id);
        return { success: true, product: data.product };
      }
      return { success: false, code: data.code, message: data.message || 'Could not save product' };
    } catch (e) {
      console.warn('Failed to save product in MongoDB:', e);
      return { success: false, message: e.message || 'Network error' };
    }
  };

  // Update Product permanently in MongoDB
  const updateInventoryItem = async (itemId, item) => {
    if (!token) return { success: false, message: 'Not authenticated' };
    try {
      const res = await fetch(`${API_BASE_URL}/products/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: item.name,
          category: item.categoryId || item.category,
          subCategory: item.subCategory !== undefined ? item.subCategory : '',
          price: Number(item.price),
          mrp: Number(item.mrp || item.price),
          unit: item.unit || '1 pc',
          stockQty: Number(item.stock || item.stockQty || 25),
          description: item.description || '',
          image: item.image,
          isVeg: item.isVeg !== undefined ? item.isVeg : true
        })
      });
      if (res.status === 401) {
        await handleSessionExpired('Update product returned 401');
        return { success: false, message: 'Session expired' };
      }
      const data = await res.json();
      if (data.success && data.product) {
        await fetchInventory(vendor?._id);
        return { success: true, product: data.product };
      }
      return { success: false, code: data.code, message: data.message || 'Could not update product' };
    } catch (e) {
      console.warn('Failed to update product in MongoDB:', e);
      return { success: false, message: e.message || 'Network error' };
    }
  };

  // Request a new category for admin review (Moderated flow)
  const requestCategory = async (requestData) => {
    if (!token) return { success: false, message: 'Not authenticated' };
    try {
      const res = await fetch(`${API_BASE_URL}/categories/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(requestData)
      });
      if (res.status === 401) {
        await handleSessionExpired('Category request returned 401');
        return { success: false, message: 'Session expired' };
      }
      const data = await res.json();
      if (res.status === 201 && data.request) {
        setCategoryRequests((prev) => [data.request, ...prev]);
        return { success: true, request: data.request, message: data.message };
      }
      if (res.status === 409) {
        if (data.category) {
          await fetchCategories();
          return {
            success: true,
            exists: true,
            category: data.category,
            message: data.message
          };
        }
        return {
          success: false,
          pending: true,
          message: data.message
        };
      }
      return { success: false, message: data.message || 'Failed to submit category request' };
    } catch (e) {
      console.warn('Failed to submit category request:', e);
      return { success: false, message: e.message || 'Network error' };
    }
  };

  // Fetch Vendor's Category Requests
  const fetchMyCategoryRequests = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/categories/my-requests`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.status === 401) {
        await handleSessionExpired('Fetch my category requests returned 401');
        return;
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        setCategoryRequests(data.requests);
      }
    } catch (e) {
      console.warn('Failed to fetch category requests:', e);
    }
  }, [token, handleSessionExpired]);

  // Backward-compatibility alias: redirects to requestCategory
  const createCategory = requestCategory;


  // Toggle in-stock / out-of-stock
  const toggleItemAvailability = async (itemId) => {
    if (!token) return;
    const currentItem = inventory.find((i) => i.id === itemId || i._id === itemId || i.productId === itemId);
    const newStatus = currentItem ? !currentItem.isAvailable : true;

    setInventory((prev) =>
      prev.map((i) => (i.id === itemId || i._id === itemId || i.productId === itemId ? { ...i, isAvailable: newStatus } : i))
    );

    try {
      const res = await fetch(`${API_BASE_URL}/products/${itemId}/stock`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ inStock: newStatus })
      });
      if (res.status === 401) {
        await handleSessionExpired('Stock toggle returned 401');
      }
    } catch (e) {
      console.warn('Stock status update failed on server:', e);
    }
  };

  // Delete product
  const deleteInventoryItem = async (itemId) => {
    if (!token) return;
    setInventory((prev) => prev.filter((i) => i.id !== itemId && i._id !== itemId && i.productId !== itemId));
    try {
      const res = await fetch(`${API_BASE_URL}/products/${itemId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.status === 401) {
        await handleSessionExpired('Delete product returned 401');
      }
    } catch (e) {
      console.warn('Item delete failed on server:', e);
    }
  };

  // Replenish / Add stock to item in MongoDB
  const addStockToItem = async (itemId, amount = 10) => {
    if (!token) return { success: false, message: 'Not authenticated' };
    try {
      const res = await fetch(`${API_BASE_URL}/products/${itemId}/stock`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ addStock: amount })
      });
      if (res.status === 401) {
        await handleSessionExpired('Replenish stock returned 401');
        return { success: false, message: 'Session expired' };
      }
      const data = await res.json();
      if (data.success && data.product) {
        setInventory((prev) =>
          prev.map((i) =>
            i.id === itemId || i._id === itemId || i.productId === itemId
              ? {
                  ...i,
                  stock: data.product.stockQty,
                  stockQty: data.product.stockQty,
                  isAvailable: data.product.inStock
                }
              : i
          )
        );
        return { success: true, product: data.product };
      }
      return { success: false, message: data.message };
    } catch (e) {
      console.warn('Failed to replenish stock on server:', e);
      return { success: false, message: e.message };
    }
  };

  return (
    <PartnerContext.Provider
      value={{
        vendor,
        setVendor,
        token,
        isAuthenticated: Boolean(vendor && token),
        loginVendor,
        toggleStoreStatus,
        orders,
        fetchOrders,
        updateOrderStatus,
        inventory,
        fetchInventory,
        addInventoryItem,
        updateInventoryItem,
        toggleItemAvailability,
        deleteInventoryItem,
        addStockToItem,
        categories,
        fetchCategories,
        categoryRequests,
        fetchMyCategoryRequests,
        requestCategory,
        createCategory,
        stats,
        isLoading,
        logoutVendor,
        handleSessionExpired,
        isTogglingStore
      }}
    >
      {children}
    </PartnerContext.Provider>
  );
};

export const usePartner = () => useContext(PartnerContext);
