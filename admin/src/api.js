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
 *
 * Supports timeout (default: 15s) and optional caller AbortSignal to
 * cancel in-flight requests on route transition or component unmount.
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

  // Setup timeout & cancellation
  const timeoutMs = options.timeout ?? 15000;
  const controller = new AbortController();
  const callerSignal = options.signal;

  let callerAbortListener = null;
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerAbortListener = () => controller.abort(callerSignal.reason);
      callerSignal.addEventListener('abort', callerAbortListener);
    }
  }

  const timeoutId = timeoutMs > 0 ? setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs) : null;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (response.status === 401) {
      handleAuthFailure();
    }

    return response;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (callerSignal && callerAbortListener) {
      callerSignal.removeEventListener('abort', callerAbortListener);
    }
  }
};
