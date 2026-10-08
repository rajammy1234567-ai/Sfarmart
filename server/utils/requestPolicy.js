// Bounds are per backend process; these are not a distributed quota or a DDoS shield.
export function boundedInteger(value, fallback, min, max) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function pagination(query = {}, defaultLimit = 100) {
  const limit = boundedInteger(query.limit, defaultLimit, 1, 200);
  const page = boundedInteger(query.page, 1, 1, Math.floor(10000 / limit) + 1);
  return { page, limit, skip: Math.min((page - 1) * limit, 10000) };
}

export function validateRequestShape(req, res, next) {
  const invalid = () => res.status(400).json({ success: false, code: 'INVALID_INPUT', message: 'Unsupported or oversized request fields.' });
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key.length > 100 || key.startsWith('$') || typeof value !== 'string' || value.length > 256) return invalid();
  }
  const stack = [{ value: req.body, depth: 0 }];
  let visited = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    if (++visited > 5000 || depth > 12) return invalid();
    if (typeof value === 'string' && value.length > 8192) return invalid();
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value) && value.length > 500) return invalid();
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.') || ['__proto__', 'prototype', 'constructor'].includes(key)) return invalid();
      stack.push({ value: child, depth: depth + 1 });
    }
  }
  return next();
}

export function createAdmissionGate({ maxInFlight = 200, ready = () => true } = {}) {
  let inFlight = 0;
  return (req, res, next) => {
    if (!ready() || inFlight >= maxInFlight) {
      res.setHeader('Retry-After', '2');
      return res.status(503).json({ success: false, code: 'SERVICE_BUSY', message: 'Service temporarily busy. Please retry shortly.' });
    }
    inFlight += 1;
    let released = false;
    const release = () => { if (!released) { released = true; inFlight -= 1; } };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}

export function createEventBudget({ max = 30, windowMs = 10000, now = Date.now } = {}) {
  let started = now();
  let count = 0;
  return () => {
    const at = now();
    if (at - started >= windowMs) { started = at; count = 0; }
    return ++count <= max;
  };
}
