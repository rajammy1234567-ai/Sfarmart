import rateLimit from 'express-rate-limit';

// Mounted only AFTER authoritative authentication. Never use unverified JWT claims as quota keys.
const makeLimiter = (limit) => rateLimit({
  windowMs: 60000,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id || req.user?.id),
  skip: (req) => !req.user,
  message: { success: false, code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please retry shortly.' }
});
const readLimiter = makeLimiter(300);
const writeLimiter = makeLimiter(120);
export const accountLimiter = (req, res, next) =>
  (['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? readLimiter : writeLimiter)(req, res, next);

export const deliveryVerificationLimiter = rateLimit({
  windowMs: 10 * 60000, limit: 10,
  standardHeaders: 'draft-8', legacyHeaders: false,
  keyGenerator: req => String(req.user?._id || req.user?.id),
  message: { success: false, code: 'TOO_MANY_VERIFICATION_ATTEMPTS', message: 'Too many delivery code attempts. Please retry later.' }
});
