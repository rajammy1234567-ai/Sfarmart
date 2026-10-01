import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VENDOR_DATA_KEY = 'sfarmart_partner_vendor';
const VENDOR_TOKEN_KEY = 'sfarmart_partner_token';

const memoryStore = new Map();

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
        await AsyncStorage.setItem(key, strVal);
      }
    } catch (e) {
      console.warn(`[storage] setItem error for ${key}:`, e);
    }
  },

  async getItem(key) {
    try {
      let val = null;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        val = window.localStorage.getItem(key);
      } else {
        val = await AsyncStorage.getItem(key);
      }
      if (val) {
        memoryStore.set(key, val);
        return val;
      }
    } catch (e) {
      console.warn(`[storage] getItem error for ${key}:`, e);
    }
    return memoryStore.get(key) || null;
  },

  async removeItem(key) {
    memoryStore.delete(key);
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      } else {
        await AsyncStorage.removeItem(key);
      }
    } catch (e) {
      console.warn(`[storage] removeItem error for ${key}:`, e);
    }
  },

  async getVendor() {
    const raw = await this.getItem(VENDOR_DATA_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async setVendor(vendor) {
    if (!vendor) {
      await this.removeItem(VENDOR_DATA_KEY);
    } else {
      await this.setItem(VENDOR_DATA_KEY, JSON.stringify(vendor));
    }
  },

  async getToken() {
    return await this.getItem(VENDOR_TOKEN_KEY);
  },

  async setToken(token) {
    if (!token) {
      await this.removeItem(VENDOR_TOKEN_KEY);
    } else {
      await this.setItem(VENDOR_TOKEN_KEY, token);
    }
  },

  async clearAuth() {
    await this.removeItem(VENDOR_DATA_KEY);
    await this.removeItem(VENDOR_TOKEN_KEY);
  }
};

export default storage;
