import { isAllowedClientOrigin } from '../utils/corsPolicy.js';

export const errorHandler = (err, req, res, _next) => {
  console.error('Server error:', err);

  // Preserve CORS headers even on error responses for allowed origins
  const origin = req.headers?.origin;
  if (origin && isAllowedClientOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      ok: false,
      success: false,
      code: 'CORS_REJECTED',
      message: 'Origin not allowed by CORS'
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      ok: false,
      success: false,
      code: 'INVALID_ID',
      message: `Invalid format for resource identifier: ${err.value}`
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      ok: false,
      success: false,
      code: 'VALIDATION_ERROR',
      message: err.message
    });
  }

  if (res.headersSent) return _next(err);
  const candidate = err.status || err.statusCode || res.statusCode;
  const statusCode = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
  const message = process.env.NODE_ENV === 'production' && statusCode >= 500 ? 'Internal Server Error' : (err.message || 'Request failed');
  const code = err.code || 'SERVER_ERROR';

  res.status(statusCode).json({
    ok: false,
    success: false,
    code,
    message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
};
