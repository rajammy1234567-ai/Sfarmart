import { Platform } from 'react-native';

const RIDER_DATA_KEY = 'sfarmart_delivery_rider';
const RIDER_TOKEN_KEY = 'sfarmart_delivery_token';
const RIDER_REFRESH_KEY = 'sfarmart_delivery_refresh';

const memoryStore = new Map();

// Helper to safely obtain AsyncStorage dynamically
let asyncStorageModule = null;
const getAsyncStorage = () => {
  if (asyncStorageModule) return asyncStorageModule;
  try {
    asyncStorageModule = require('@react-native-async-storage/async-storage').default;
    return asyncStorageModule;
  } catch {
    return null;
  }
};

export const storage = {
  async setItem(key, value) {
    if (!value) {
      await this.removeItem(key);
      return;
    }
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    memoryStore.set(key, strVal);
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, strVal);
      } else {
        const storageLib = getAsyncStorage();
        if (storageLib) await storageLib.setItem(key, strVal);
      }
    } catch (e) {
      console.warn(`[delivery:storage] setItem error for ${key}:`, e);
    }
  },

  async getItem(key) {
    try {
      let val = null;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        val = window.localStorage.getItem(key);
      } else {
        const storageLib = getAsyncStorage();
        if (storageLib) val = await storageLib.getItem(key);
      }
      if (val) {
        memoryStore.set(key, val);
        return val;
      }
    } catch (e) {
      console.warn(`[delivery:storage] getItem error for ${key}:`, e);
    }
    return memoryStore.get(key) || null;
  },

  async removeItem(key) {
    memoryStore.delete(key);
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      } else {
        const storageLib = getAsyncStorage();
        if (storageLib) await storageLib.removeItem(key);
      }
    } catch (e) {
      console.warn(`[delivery:storage] removeItem error for ${key}:`, e);
    }
  },

  async getRider() {
    const raw = await this.getItem(RIDER_DATA_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async setRider(rider) {
    if (!rider) {
      await this.removeItem(RIDER_DATA_KEY);
    } else {
      await this.setItem(RIDER_DATA_KEY, JSON.stringify(rider));
    }
  },

  async getToken() {
    return await this.getItem(RIDER_TOKEN_KEY);
  },

  async setToken(token) {
    if (!token) {
      await this.removeItem(RIDER_TOKEN_KEY);
    } else {
      await this.setItem(RIDER_TOKEN_KEY, token);
    }
  },

  async getRefreshToken() {
    return await this.getItem(RIDER_REFRESH_KEY);
  },

  async setRefreshToken(token) {
    if (!token) {
      await this.removeItem(RIDER_REFRESH_KEY);
    } else {
      await this.setItem(RIDER_REFRESH_KEY, token);
    }
  },

  async clearAuth() {
    await this.removeItem(RIDER_DATA_KEY);
    await this.removeItem(RIDER_TOKEN_KEY);
    await this.removeItem(RIDER_REFRESH_KEY);
  }
};

export default storage;
