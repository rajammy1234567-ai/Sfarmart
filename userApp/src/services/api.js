import axios from 'axios';
import { API_BASE_URL } from '../config/env';
import storage from './storage';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
});

let tokenChangedHandler=null;
export const setTokenChangedHandler=handler=>{tokenChangedHandler=handler;};
let forceLogoutHandler = null;
export const setForceLogoutHandler = (handler) => {
  forceLogoutHandler = handler;
};

// Request Interceptor: Attach Access Token
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await storage.getAccessToken();
      if (token && (!config.headers.Authorization || config._forceFreshToken)) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.warn('Could not attach access token:', e);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Session lifecycle & termination guards
let sessionEpoch = 0;
let isSessionTerminated = false;
let isTeardownSuspended = false;

export const suspendSessionForTeardown = () => {
  isTeardownSuspended = true;
  sessionEpoch += 1;
  inFlightRefreshPromise = null;
  // NOTE: We intentionally PRESERVE apiClient.defaults.headers.common['Authorization']
  // and storage tokens so the in-flight delete-account or logout request includes the valid Bearer token!
};

export const resumeSession = () => {
  isTeardownSuspended = false;
  isSessionTerminated = false;
  sessionEpoch += 1;
};

export const finalizeSessionTermination = async () => {
  isSessionTerminated = true;
  isTeardownSuspended = false;
  sessionEpoch += 1;
  inFlightRefreshPromise = null;
  delete apiClient.defaults.headers.common['Authorization'];
  try {
    await storage.clearTokens();
  } catch (e) {
    console.warn('Storage token clear error during teardown:', e);
  }
};

export const terminateSession = async () => {
  await finalizeSessionTermination();
};

export const initializeSession = () => {
  isSessionTerminated = false;
  isTeardownSuspended = false;
  sessionEpoch += 1;
};

export const isCurrentSessionTerminated = () => isSessionTerminated;
export const isSessionTeardownSuspended = () => isTeardownSuspended;

// Single-Flight Refresh Mutex shared across REST and socket reconnection
let inFlightRefreshPromise = null;

export const refreshAuthToken = () => {
  if (isSessionTerminated || isTeardownSuspended) {
    const err = new Error('Session terminated or teardown in progress');
    err.code = isSessionTerminated ? 'SESSION_TERMINATED' : 'TEARDOWN_SUSPENDED';
    return Promise.reject(err);
  }

  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  const currentEpoch = sessionEpoch;

  inFlightRefreshPromise = (async () => {
    try {
      const storedRefreshToken = await storage.getRefreshToken();
      const deviceId = await storage.getDeviceId();

      if (!storedRefreshToken || isSessionTerminated || isTeardownSuspended || sessionEpoch !== currentEpoch) {
        const err = new Error('No refresh token available or session teardown initiated');
        err.code = isSessionTerminated ? 'SESSION_TERMINATED' : isTeardownSuspended ? 'TEARDOWN_SUSPENDED' : 'NO_REFRESH_TOKEN';
        throw err;
      }

      // Dedicated unintercepted call to refresh
      const refreshResponse = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken: storedRefreshToken, deviceId },
        { timeout: 15000 }
      );

      // Verify session was not terminated or replaced while request was in-flight
      if (isSessionTerminated || isTeardownSuspended || sessionEpoch !== currentEpoch) {
        console.log('⚡ [API] In-flight token refresh discarded: session terminated or teardown in progress');
        return null;
      }

      const newAccessToken = refreshResponse.data?.accessToken;
      const newRefreshToken = refreshResponse.data?.refreshToken;

      if (!newAccessToken) {
        throw new Error('Refresh response missing access token');
      }

      const latestRefreshToken = await storage.getRefreshToken();
      if (storedRefreshToken !== latestRefreshToken || isSessionTerminated || isTeardownSuspended || sessionEpoch !== currentEpoch) {
        console.log('⚡ [API] Account changed or terminated during refresh; aborting store');
        return null;
      }

      await storage.setAccessToken(newAccessToken);
      tokenChangedHandler?.(newAccessToken);
      if (newRefreshToken) {
        await storage.setRefreshToken(newRefreshToken);
      }

      apiClient.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
      return newAccessToken;
    } catch (refreshErr) {
      if (
        isSessionTerminated ||
        isTeardownSuspended ||
        sessionEpoch !== currentEpoch ||
        refreshErr.code === 'SESSION_TERMINATED' ||
        refreshErr.code === 'TEARDOWN_SUSPENDED'
      ) {
        throw refreshErr;
      }
      await storage.clearTokens();
      if (typeof forceLogoutHandler === 'function') {
        forceLogoutHandler('Session expired. Please login again.');
      }
      throw refreshErr;
    } finally {
      if (sessionEpoch === currentEpoch) {
        inFlightRefreshPromise = null;
      }
    }
  })();

  return inFlightRefreshPromise;
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Normalize network error
    if (!error.response) {
      const normalized = {
        ok: false,
        code: 'NETWORK_ERROR',
        message: 'Network connection error. Please check your internet connection.',
        isNetworkError: true
      };
      return Promise.reject(normalized);
    }

    const { status } = error.response;

    // Do not attempt refresh on auth endpoints themselves (e.g. login, verify, refresh)
    const isAuthRoute =
      originalRequest?.url?.includes('/auth/otp') ||
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/customer/login');

    if (status === 401 && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;
      try {
        const freshAccessToken = await refreshAuthToken();
        originalRequest.headers.Authorization = `Bearer ${freshAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error.response?.data || error);
  }
);

// Backward-compatibility token helper
export const setAuthToken = (token) => {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
};

export const apiService = {
  // Auth API
  requestOtp: async (phone) => {
    const res = await apiClient.post('/auth/otp/request', { phone });
    return res.data;
  },

  verifyOtp: async (phone, otp) => {
    const deviceId = await storage.getDeviceId();
    const res = await apiClient.post('/auth/otp/verify', { phone, otp, deviceId });
    if (res.data?.accessToken) {
      initializeSession();
      await storage.setAccessToken(res.data.accessToken);
    }
    if (res.data?.refreshToken) {
      await storage.setRefreshToken(res.data.refreshToken);
    }
    return res.data;
  },

  getMe: async () => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },

  updateProfile: async (data) => {
    const res = await apiClient.patch('/auth/me', data);
    return res.data;
  },

  logout: async () => {
    suspendSessionForTeardown();
    try {
      const refreshToken = await storage.getRefreshToken();
      await apiClient.post('/auth/logout', { refreshToken }, { timeout: 4000 });
    } catch (e) {
      // fire-and-forget logout
    } finally {
      await finalizeSessionTermination();
    }
    return { ok: true, success: true };
  },

  logoutAll: async () => {
    suspendSessionForTeardown();
    try {
      const res = await apiClient.post('/auth/logout-all', {}, { timeout: 4000 });
      return res.data;
    } finally {
      await finalizeSessionTermination();
    }
  },

  deleteAccount: async () => {
    suspendSessionForTeardown();
    try {
      const res = await apiClient.post('/auth/account/delete');
      await finalizeSessionTermination();
      return res.data;
    } catch (err) {
      resumeSession();
      const normalizedErr = new Error(
        err?.message || err?.response?.data?.message || 'Could not delete account. Please try again.'
      );
      normalizedErr.code =
        err?.code || err?.response?.data?.code || (err?.isNetworkError ? 'NETWORK_ERROR' : 'DELETION_FAILED');
      normalizedErr.isNetworkError = Boolean(err?.isNetworkError);
      throw normalizedErr;
    }
  },

  customerLogin: async (phone, password) => {
    try {
      const deviceId = await storage.getDeviceId();
      let response;
      try {
        response = await apiClient.post('/auth/customer/login', { phone, password, deviceId });
      } catch (postErr) {
        // Fallback to /login route on same API
        response = await apiClient.post('/login', { phone, password, deviceId });
      }
      const data = response?.data;
      if (data && (data.success || data.ok)) {
        initializeSession();
        const tok = data.accessToken || data.token;
        if (tok) {
          await storage.setAccessToken(tok);
          setAuthToken(tok);
        }
        if (data.refreshToken) {
          await storage.setRefreshToken(data.refreshToken);
        }
        return data;
      }
      return { success: false, ok: false, message: data?.message || 'Login failed' };
    } catch (error) {
      console.warn('Customer login failed:', error.message);
      return { success: false, ok: false, message: error.response?.data?.message || error.message || 'Login failed' };
    }
  },

  // Categories
  getHomeCategories: async (type) => {
    try {
      const url = type ? `/categories?home=true&type=${type}` : '/categories?home=true';
      const response = await apiClient.get(url);
      return response.data;
    } catch (error) {
      console.warn('Failed to fetch home categories:', error.message);
      return {
        success: false,
        categories: [],
        isNetworkError: Boolean(error?.isNetworkError || !error?.response),
        message: error?.message || 'Failed to fetch categories'
      };
    }
  },

  getCategories: async (params = {}) => {
    try {
      let url = '/categories';
      if (typeof params === 'string') {
        url = `/categories?type=${params}`;
      } else if (params && typeof params === 'object') {
        const q = new URLSearchParams();
        if (params.type) q.append('type', params.type);
        if (params.home) q.append('home', 'true');
        if (params.partner) q.append('partner', 'true');
        const qs = q.toString();
        if (qs) url = `/categories?${qs}`;
      }
      const response = await apiClient.get(url);
      return response.data;
    } catch (error) {
      console.warn('Failed to fetch categories:', error.message);
      return {
        success: false,
        categories: [],
        isNetworkError: Boolean(error?.isNetworkError || !error?.response),
        message: error?.message || 'Failed to fetch categories'
      };
    }
  },

  getCategoryVendors: async (slug) => {
    try {
      const response = await apiClient.get(`/categories/${slug}/vendors`);
      return response.data;
    } catch (error) {
      console.warn('Failed to fetch category vendors:', error.message || error);
      return {
        success: false,
        vendors: [],
        isNetworkError: Boolean(error?.isNetworkError || !error?.response),
        notFound: error?.response?.status === 404,
        message: error?.message || 'Could not load stores for this category.'
      };
    }
  },

  // Vendors
  getVendors: async (params = {}) => {
    try {
      const response = await apiClient.get('/vendors', { params });
      return response.data;
    } catch (error) {
      console.warn('Failed to fetch vendors:', error.message);
      return { success: false, vendors: [] };
    }
  },

  getVendorById: async (id) => {
    try {
      const response = await apiClient.get(`/vendors/${id}`);
      return response.data;
    } catch (error) {
      console.warn('Failed to fetch vendor:', error.message);
      return { success: false, vendor: null };
    }
  },

  getVendorProducts: async (vendorId, params = {}) => {
    try {
      const response = await apiClient.get(
  `/vendors/${vendorId}/products`,
  {
    params: {
  ...params,
  _diagnostic: Date.now(),
},
  }
);
	console.log('[VendorProducts]', {
  vendorId,
  baseURL: apiClient.defaults.baseURL,
  status: response.status,
  success: response.data?.success,
  count: response.data?.products?.length,
});
console.log(
  '[VendorProducts body]',
  JSON.stringify(response.data)?.slice(0, 1500)
);
console.log('[VendorProducts headers]', {
  contentType: response.headers?.['content-type'],
  contentEncoding: response.headers?.['content-encoding'],
  dataType: typeof response.data,
});
      return response.data;
    } catch (error) {
      console.warn('[VendorProducts failed]', {
  vendorId,
  status: error.response?.status,
  code: error.code,
  message: error.message,
});
      return { success: false, products: [] };
    }
  },

  // Products
  getProducts: async (params = {}) => {
    try {
      const response = await apiClient.get('/products', { params });
      return response.data;
    } catch (error) {
      console.warn('Backend products fetch failed:', error.message);
      return { success: false, products: [] };
    }
  },

  getProductById: async (id) => {
    try {
      const response = await apiClient.get(`/products/${id}`);
      return response.data;
    } catch (error) {
      return { success: false, product: null };
    }
  },

  // Cart API Endpoints
  getCart: async () => {
    try {
      const response = await apiClient.get('/cart');
      return response.data;
    } catch (error) {
      return { ok: false, error: error.response?.data || error };
    }
  },

  addCartItem: async (productId, qty = 1) => {
    try {
      const response = await apiClient.post('/cart/items', { productId, qty });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  updateCartItemQty: async (productId, qty) => {
    try {
      const response = await apiClient.patch(`/cart/items/${productId}`, { qty });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  removeCartItem: async (productId) => {
    try {
      const response = await apiClient.delete(`/cart/items/${productId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  clearCart: async () => {
    try {
      const response = await apiClient.delete('/cart');
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  switchCartVendor: async (productId, qty = 1) => {
    try {
      const response = await apiClient.post('/cart/switch-vendor', { productId, qty });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  validateCart: async () => {
    try {
      const response = await apiClient.post('/cart/validate');
      return response.data;
    } catch (error) {
      return { ok: false, isValid: true, changes: [] };
    }
  },

  mergeCart: async (items, overwrite = false) => {
    try {
      const response = await apiClient.post('/cart/merge', { items, overwrite });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Orders
  placeOrder: async (orderData) => {
    try {
      const response = await apiClient.post('/orders', orderData);
      return response.data;
    } catch (error) {
      console.error('Failed to place order:', error.response?.data || error);
      throw error.response?.data || error;
    }
  },

  createPaymentOrder: async (orderId) => {
    try {
      const res = await apiClient.post('/create-order', { orderId });
      return res.data;
    } catch (err) {
      console.error('Failed to create Razorpay order:', err.response?.data || err);
      throw err.response?.data || err;
    }
  },

  verifyPayment: async ({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  }) => {
    try {
      const res = await apiClient.post('/verify-payment', {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      });
      return res.data;
    } catch (err) {
      console.error('Payment verification failed:', err.response?.data || err);
      throw err.response?.data || err;
    }
  },

  getCustomerOrders: async () => {
    try {
      const response = await apiClient.get('/orders/customer/my');
      return response.data;
    } catch (error) {
      return { success: false, orders: [] };
    }
  },

  getOrderById: async (id) => {
    try {
      const response = await apiClient.get(`/orders/${id}`);
      return response.data;
    } catch (error) {
      return { success: false, order: null };
    }
  },

  getOrderLocation: async (id) => {
    try {
      const response = await apiClient.get(`/orders/${id}/location`);
      return response.data;
    } catch (error) {
      return { success: false, riderLocation: null, deliveryRoute: [] };
    }
  },

  getOrderRouteEta: async (id) => {
    try {
      const response = await apiClient.get(`/orders/${id}/route-eta`);
      return response.data;
    } catch (error) {
      return error.response?.data || { success: false, message: error.message };
    }
  },

  registerPushToken: async ({ token, platform = 'android', deviceId = null }) => {
    try {
      const response = await apiClient.post('/auth/push-token', {
        token,
        platform,
        deviceId,
        tokenType: 'expo'
      });
      return response.data;
    } catch (error) {
      console.warn('Failed to register push token:', error.response?.data || error.message);
      return { success: false, message: error.message };
    }
  },

  unregisterPushToken: async ({ token = null, deviceId = null } = {}) => {
    try {
      const response = await apiClient.post('/auth/push-token/unregister', {
        token,
        deviceId
      });
      return response.data;
    } catch (error) {
      console.warn('Failed to unregister push token:', error.response?.data || error.message);
      return { success: false, message: error.message };
    }
  }
};

export default apiClient;
