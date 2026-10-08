// A client timeout does not prove that checkout failed. Reuse the same server idempotency key.
export function createOrderRecovery(storage, makeId = () =>
  `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`) {
  const running = new Map();
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
  };
  return (customerId, payload, operation) => {
    if (!customerId || !/^[a-zA-Z0-9_-]{1,128}$/.test(String(customerId))) {
      return Promise.reject(new Error('Please sign in before checkout.'));
    }
    const fingerprint = JSON.stringify(canonical(payload));
    const key = `farmart_pending_order_${customerId}`;
    const conflict = () => Object.assign(new Error('An earlier checkout is unconfirmed. Check My Orders before changing this checkout.'), { code: 'PENDING_ORDER_CHECK' });
    const active = running.get(key);
    if (active) return fingerprint === active.fingerprint ? active.promise : Promise.reject(conflict());
    const promise = Promise.resolve().then(async () => {
      const stored = await storage.getItem(key);
      let attempt;
      if (stored) {
        try { attempt = JSON.parse(stored); } catch { throw conflict(); }
        if (attempt.fingerprint !== fingerprint || typeof attempt.id !== 'string') throw conflict();
      } else {
        attempt = { id: makeId(), fingerprint };
        const persist = storage.setItemStrict || storage.setItem;
        await persist.call(storage, key, JSON.stringify(attempt));
        // Do not dispatch if even the local storage abstraction cannot preserve the claim.
        if (await storage.getItem(key) !== JSON.stringify(attempt)) throw new Error('Checkout could not be saved. Please retry.');
      }
      let result;
      try { result = await operation({ ...payload, clientOrderId: attempt.id }); }
      catch (error) {
        const rejectedBeforeWrite = new Set(['EMPTY_CART', 'INVALID_ORDER_SIZE', 'PAYMENT_NOT_CONFIGURED',
          'INVALID_QUANTITY', 'INVALID_PRODUCT_ID', 'PRODUCT_NOT_FOUND', 'MULTI_VENDOR_CART', 'VENDOR_CLOSED', 'DELIVERY_ADDRESS_REQUIRED',
          'OUT_OF_STOCK', 'INSUFFICIENT_STOCK', 'MIN_ORDER_NOT_MET', 'STORE_UNSERVICEABLE']);
        if ((error.status ?? error.response?.status) === 400 && rejectedBeforeWrite.has(error.code)) {
          await storage.removeItem(key);
        }
        throw error;
      }
      // Caller returns only after confirmed order + local cart cleanup. Errors keep the claim.
      await storage.removeItem(key);
      return result;
    }).finally(() => { if (running.get(key)?.promise === promise) running.delete(key); });
    running.set(key, { fingerprint, promise });
    return promise;
  };
}
