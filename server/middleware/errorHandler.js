export const errorHandler = (err, req, res, _next) => {
  console.error('Server error:', err);

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      code: 'INVALID_ID',
      message: `Invalid format for resource identifier: ${err.value}`
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: err.message
    });
  }

  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  const message = err.message || 'Internal Server Error';
  const code = err.code || 'SERVER_ERROR';

  res.status(statusCode).json({
    success: false,
    code,
    message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
};
