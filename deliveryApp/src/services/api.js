import axios from 'axios';
import { Platform } from 'react-native';
import storage from './storage';

export const getBaseUrl = () => {
  if(process.env.EXPO_PUBLIC_API_URL)return process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'web') {
    if (
      typeof window !== 'undefined' &&
      window.location &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ) {
      return `http://${window.location.hostname}:5000/api`;
    }
    return process.env.EXPO_PUBLIC_API_URL || 'https://farm-mart-api.onrender.com/api';
  }

  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Standalone production fallback
  if (!__DEV__) {
    return 'https://farm-mart-api.onrender.com/api';
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api';
  }

  return 'http://localhost:5000/api';
};

export const API_BASE_URL = getBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Single-flight refresh token queue
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request Interceptor: Attach Bearer Token
api.interceptors.request.use(
  async (config) => {
    const token = await storage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Single-flight Refresh Mutex for Rider Auth
let inFlightRiderRefreshPromise = null;

export const refreshRiderAuthToken = async () => {
  if (inFlightRiderRefreshPromise) {
    return inFlightRiderRefreshPromise;
  }

  inFlightRiderRefreshPromise = (async () => {
    try {
      const refreshToken = await storage.getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const res = await axios.post(`${API_BASE_URL}/rider/auth/refresh`, { refreshToken }, { timeout: 15000 });
      const { token: newAccessToken, refreshToken: newRefreshToken } = res.data;

      if (!newAccessToken) {
        throw new Error('Refresh response missing access token');
      }

      await storage.setToken(newAccessToken);
      if (newRefreshToken) {
        await storage.setRefreshToken(newRefreshToken);
      }

      api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
      return newAccessToken;
    } catch (refreshErr) {
      await storage.clearAuth();
      throw refreshErr;
    } finally {
      inFlightRiderRefreshPromise = null;
    }
  })();

  return inFlightRiderRefreshPromise;
};

// Response Interceptor: Single-flight 401 Refresh Mutex
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes('/rider/auth/login') || originalRequest.url?.includes('/rider/auth/refresh')) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      try {
        const freshAccessToken = await refreshRiderAuthToken();
        originalRequest.headers.Authorization = `Bearer ${freshAccessToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

export const riderApi = {
  // Auth
  login: (phone, password) => api.post('/rider/auth/login', { phone, password }),
  logout: () => api.post('/rider/auth/logout'),
  getProfile: () => api.get('/rider/profile'),

  // Duty Status & Location
  toggleDuty: (status) => api.patch('/rider/status', { status }),
  sendLocation: (fix) => api.post('/rider/location', fix),

  // Order Lifecycle
  getActiveOrder: () => api.get('/rider/active-order'),
  acceptOffer: (orderId) => api.post(`/rider/orders/${orderId}/accept`),
  declineOffer: (orderId) => api.post(`/rider/orders/${orderId}/decline`),
  arrivedAtStore: (orderId) => api.post(`/rider/orders/${orderId}/arrived-store`),
  verifyPickup: (orderId, pickupOtp) => api.post(`/rider/orders/${orderId}/pickup-verify`, { pickupOtp }),
  verifyDelivery: (orderId, deliveryOtp) => api.post(`/rider/orders/${orderId}/delivery-verify`, { deliveryOtp }),

  // Earnings
  getEarnings: () => api.get('/rider/earnings'),

  // Pool
  getPendingDeliveryOrders: () => api.get('/orders/delivery/pending')
};

export default api;
