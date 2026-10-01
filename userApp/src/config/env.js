import Constants from 'expo-constants';
import { Platform } from 'react-native';

const getBaseUrl = () => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return `http://${window.location.hostname}:5000/api`;
    }
    return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';
  }

  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Production standalone APK fallback
  if (!__DEV__) {
    return 'https://farm-mart-api.onrender.com/api';
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

export default {
  API_BASE_URL
};
