import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'sfarmart_access_token';
const REFRESH_TOKEN_KEY = 'sfarmart_refresh_token';
const DEVICE_ID_KEY = 'sfarmart_device_id';

let SecureStore = null;
if (Platform.OS !== 'web') {
  try {
    SecureStore = require('expo-secure-store');
  } catch (e) {
    console.warn('SecureStore not available, falling back to memory/storage');
  }
}

// In-memory fallback
const memoryStore = new Map();

export const storage = {
  async setItem(key, value) {
    if (!value) {
      await this.removeItem(key);
      return;
    }
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
      } else if (SecureStore) {
        await SecureStore.setItemAsync(key, value);
      }
      memoryStore.set(key, value);
    } catch (err) {
      console.warn(`storage.setItem error for key ${key}:`, err);
      memoryStore.set(key, value);
    }
  },

  async getItem(key) {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
      } else if (SecureStore) {
        return await SecureStore.getItemAsync(key);
      }
      return memoryStore.get(key) || null;
    } catch (err) {
      console.warn(`storage.getItem error for key ${key}:`, err);
      return memoryStore.get(key) || null;
    }
  },

  async removeItem(key) {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
      } else if (SecureStore) {
        await SecureStore.deleteItemAsync(key);
      }
      memoryStore.delete(key);
    } catch (err) {
      console.warn(`storage.removeItem error for key ${key}:`, err);
      memoryStore.delete(key);
    }
  },

  // Auth token specific helpers
  async getAccessToken() {
    return await this.getItem(ACCESS_TOKEN_KEY);
  },

  async setAccessToken(token) {
    await this.setItem(ACCESS_TOKEN_KEY, token);
  },

  async getRefreshToken() {
    return await this.getItem(REFRESH_TOKEN_KEY);
  },

  async setRefreshToken(token) {
    await this.setItem(REFRESH_TOKEN_KEY, token);
  },

  async clearTokens() {
    await this.removeItem(ACCESS_TOKEN_KEY);
    await this.removeItem(REFRESH_TOKEN_KEY);
  },

  async getDeviceId() {
    let devId = await this.getItem(DEVICE_ID_KEY);
    if (!devId) {
      devId = `dev_${Platform.OS}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await this.setItem(DEVICE_ID_KEY, devId);
    }
    return devId;
  }
};

export default storage;
