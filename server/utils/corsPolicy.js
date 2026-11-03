// corsPolicy.js - Authoritative CORS allowlist & preflight validator for S-farmart

export const getClientOrigins = () => {
  return (process.env.CLIENT_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
};

export const isAllowedClientOrigin = (origin) => {
  if (!origin) return true;

  const isDevOrStaging =
    process.env.NODE_ENV !== 'production' ||
    process.env.STAGING_MODE === 'true' ||
    process.env.NODE_ENV === 'staging';

  // In development / staging: allow local admin web (Vite on 5173-5179) and local apps (8081-8085)
  if (isDevOrStaging) {
    if (/^http:\/\/(localhost|127\.0\.0\.1):(517[3-9]|808[1-5])$/.test(origin)) {
      return true;
    }
  }

  // Deployed Admin, Customer, and Partner web hostnames on Render + dynamic CLIENT_ORIGINS
  const allowed = [
    'https://sfarmart-admin-staging.onrender.com',
    'https://sfarmart-admin.onrender.com',
    'https://farm-mart-admin.onrender.com',
    'https://farmart-admin.onrender.com',
    'https://farm-mart.onrender.com',
    'https://sfarmart.onrender.com',
    ...getClientOrigins()
  ];

  return allowed.includes(origin);
};
