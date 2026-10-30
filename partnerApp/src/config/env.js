import Constants from 'expo-constants';
import { Platform } from 'react-native';

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return `http://${window.location.hostname}:5000/api`;
    }
    return 'http://localhost:5000/api';
  }

  const isDev = typeof __DEV__ !== 'undefined'
    ? __DEV__
    : (process.env.NODE_ENV === 'test' || process.env.NODE_ENV !== 'production');

  // Prevent release builds from silently falling back to staging or legacy endpoints
  if (!isDev) {
    throw new Error('[Configuration Error] Missing EXPO_PUBLIC_API_URL for release build. Ensure an explicit API endpoint is configured.');
  }

  // Real phone over Wi-Fi: Constants.expoConfig?.hostUri gives dev PC's IP (e.g. 192.168.1.x)
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.debuggerHost;

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:5000/api`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api';
  }

  return 'http://localhost:5000/api';
};

export const API_BASE_URL = getBaseUrl();
export const SOCKET_SERVER_URL = API_BASE_URL ? API_BASE_URL.replace(/\/api\/?$/, '') : 'http://localhost:5000';

export default {
  API_BASE_URL,
  SOCKET_SERVER_URL
};
