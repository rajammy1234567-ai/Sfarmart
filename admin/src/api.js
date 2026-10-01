import { API_BASE_URL } from './config';

/**
 * Safely retrieve the stored admin session from localStorage.
 */
export const getStoredAdmin = () => {
  try {
    const raw = localStorage.getItem('farmart_admin');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
};

/**
 * Handle expired or unauthorized sessions safely by redirecting to login.
 * Never logs or exposes tokens or sensitive session data.
 */
export const handleAuthFailure = () => {
  try {
    localStorage.removeItem('farmart_admin');
  } catch (e) {
    // ignore storage removal errors
  }
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

/**
 * Shared authenticated fetch helper for admin API requests.
 * Automatically attaches `Authorization: Bearer <stored admin token>`.
 * On 401 Unauthorized responses, clears session and redirects to /login.
 */
export const adminFetch = async (endpoint, options = {}) => {
  const admin = getStoredAdmin();
  const token = admin?.token;

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const headers = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    handleAuthFailure();
  }

  return response;
};
