export const API_BASE_URL =
  typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? `http://${window.location.hostname}:5000/api`
    : (process.env.VITE_API_URL || 'http://localhost:5000/api');
