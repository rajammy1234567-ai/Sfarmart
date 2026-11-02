import { API_BASE_URL } from '../config/env';

export const resolveMediaUrl = (uri) => {
  if (!uri || typeof uri !== 'string') return null;
  const trimmed = uri.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    const hostBase = (API_BASE_URL || '').replace(/\/api\/?$/, '');
    return `${hostBase}${trimmed}`;
  }
  return trimmed;
};

export const isValidImageUri = (uri) => {
  return typeof uri === 'string' && uri.trim().length > 0;
};

