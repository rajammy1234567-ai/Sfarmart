import { API_BASE_URL } from '../config/env';

export const resolveMediaUrl = (uri, customApiBase = null) => {
  if (!uri || typeof uri !== 'string') return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;

  const effectiveBase = customApiBase || API_BASE_URL || (typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_URL : '') || '';
  const hostBase = effectiveBase.replace(/\/api\/?$/, '');

  // Rewrite loopback/localhost/emulator URLs stored in backend DB to active backend host
  const localMatch = trimmed.match(/^https?:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?::\d+)?(\/.*)$/i);
  if (localMatch) {
    return hostBase ? `${hostBase}${localMatch[1]}` : localMatch[1];
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return hostBase ? `${hostBase}${trimmed}` : trimmed;
  }
  return trimmed;
};

export const isValidImageUri = (uri) => {
  return typeof uri === 'string' && uri.trim().length > 0;
};
