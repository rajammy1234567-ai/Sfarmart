const getAdminApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return `http://${window.location.hostname}:5000/api`;
  }
  const envApiUrl =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
    (typeof process !== 'undefined' && process.env?.VITE_API_URL);
  return envApiUrl || 'http://localhost:5000/api';
};

export const API_BASE_URL = getAdminApiBaseUrl();
