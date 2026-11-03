const getAdminApiBaseUrl = () => {
  const envApiUrl =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
    (typeof process !== 'undefined' && process.env?.VITE_API_URL);
  if (envApiUrl) {
    return envApiUrl.replace(/\/+$/, '');
  }
  return 'https://farmart-backend-staging.onrender.com/api';
};

export const API_BASE_URL = getAdminApiBaseUrl();
