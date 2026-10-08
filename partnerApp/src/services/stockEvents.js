// Bridge the socket and data providers without coupling their React nesting order.
const listeners = new Set();
export function subscribeStock(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function publishStock(payload) {
  if (!payload || typeof payload.productId !== 'string' || typeof payload.vendorId !== 'string' ||
      !Number.isSafeInteger(payload.stockQty) || payload.stockQty < 0 || typeof payload.inStock !== 'boolean') return;
  for (const listener of listeners) {
    try { listener(payload); } catch (error) { console.warn('Stock update listener failed:', error.message); }
  }
}
