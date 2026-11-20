import { API_BASE_URL } from '../config/env';

export const resolveMediaUrl = (uri) => {
  if (!uri || typeof uri !== 'string') return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (trimmed.includes('localhost:5000') || trimmed.includes('127.0.0.1:5000')) {
      return trimmed.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1):5000/i, 'https://farmart-backend-staging.onrender.com');
    }
    return trimmed;
  }

  if (
    trimmed.startsWith('file:') ||
    trimmed.startsWith('content:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    const rawBase = (API_BASE_URL || (typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_URL : '') || 'https://farmart-backend-staging.onrender.com/api');
    let hostBase = rawBase.replace(/\/api\/?$/, '');
    if (hostBase.includes('localhost:5000') || hostBase.includes('127.0.0.1:5000') || !hostBase) {
      hostBase = 'https://farmart-backend-staging.onrender.com';
    }
    return `${hostBase}${trimmed}`;
  }

  return trimmed;
};

export const isValidImageUri = (uri) => {
  return typeof uri === 'string' && uri.trim().length > 0;
};
