// Shared policy kept dependency-free so it can run in React Native and offline tests.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isDefinitiveAuthFailure = (error) =>
  [401, 403].includes(error?.response?.status ?? error?.status) || error?.code === 'NO_REFRESH_TOKEN';

export async function withReadRetry(operation, { sleep = wait, random = Math.random, now = Date.now } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(); } catch (error) {
      const status = error?.response?.status ?? error?.status;
      const retryable = error?.isNetworkError || (!error?.response && !status &&
        ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'NETWORK_ERROR'].includes(error?.code)) ||
        [429, 502, 503, 504].includes(status);
      if (!retryable || attempt >= 1) throw error;
      const header = error?.response?.headers?.['retry-after'] ?? error?.retryAfter;
      const numeric = Number(header);
      const seconds = header == null ? 0 : Number.isFinite(numeric) ? Math.max(0, numeric) :
        Math.max(0, (Date.parse(header) - now()) / 1000);
      // Do not violate a long Retry-After by retrying before it expires.
      if (!Number.isFinite(seconds) || seconds > 30) throw error;
      await sleep(Math.max(seconds * 1000, 500 + Math.floor(random() * 1000)));
    }
  }
}

export function createSingleFlight() {
  const pending = new Map();
  return (key, operation) => {
    if (pending.has(key)) return pending.get(key);
    const promise = Promise.resolve().then(operation).finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
    });
    pending.set(key, promise);
    return promise;
  };
}

export async function collectPages(readPage, field, { maxPages = 20, limit = 200 } = {}) {
  const values = [];
  const seen = new Set();
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await readPage({ page, limit });
    if (data?.success !== true || !Array.isArray(data[field])) {
      throw Object.assign(new Error(data?.message || 'Invalid list response; try again.'), { code: 'INVALID_RESPONSE' });
    }
    if (data.page != null && Number(data.page) !== page) {
      throw Object.assign(new Error('List page changed; refresh the list.'), { code: 'PAGINATION_CONFLICT' });
    }
    let added = 0;
    for (const value of data[field]) {
      const id = value?._id ?? value?.id;
      if (id == null || !seen.has(String(id))) {
        values.push(value); added += 1;
        if (id != null) seen.add(String(id));
      }
    }
    // Older backend responses have no page field and already return the full list.
    if (data.page == null || data[field].length < limit) {
      return { ...data, [field]: values, count: values.length, page: 1, hasMore: false };
    }
    if (!added) throw Object.assign(new Error('Repeated list page; refresh the list.'), { code: 'PAGINATION_CONFLICT' });
  }
  // Never silently present a capped list as the complete inventory/history.
  throw Object.assign(new Error('List is too large for this view. Use a category or date filter.'), { code: 'PAGINATION_LIMIT' });
}

export function startPolling(operation, { intervalMs, active = () => true, random = Math.random,
  schedule = setTimeout, cancel = clearTimeout, onError = () => {} } = {}) {
  let stopped = false;
  let timer;
  const next = () => { if (!stopped) timer = schedule(tick, intervalMs + Math.floor(random() * intervalMs * 0.25)); };
  const tick = async () => {
    if (stopped) return;
    try { if (active()) await operation(); } catch (error) { onError(error); } finally { next(); }
  };
  next();
  return () => { stopped = true; cancel(timer); };
}

// All partner fetch callers expect a Response-like object with json(), ok and status.
// Read the body inside the deadline too, not just the response headers.
export async function fetchJsonResponse(url, options = {}, { transport = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const run = async () => {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' })); }, timeoutMs);
    });
    try {
      return await Promise.race([deadline, (async () => {
        let response;
        try { response = await transport(url, { ...options, signal: controller.signal }); }
        catch (error) { throw Object.assign(error, { code: error.code || 'NETWORK_ERROR' }); }
        const text = await response.text();
        let data;
        try { data = text ? JSON.parse(text) : {}; }
        catch { throw Object.assign(new Error('Invalid server response'), { code: 'INVALID_RESPONSE', status: response.status }); }
        const result = { ok: response.ok, status: response.status, headers: response.headers, json: async () => data };
        if ([429, 502, 503, 504].includes(response.status)) {
          throw Object.assign(new Error(data.message || `Server busy (${response.status})`), {
            status: response.status, retryAfter: response.headers?.get?.('retry-after') });
        }
        return result;
      })()]);
    } finally { clearTimeout(timer); }
  };
  // Mutations get a deadline but are NEVER automatically replayed here.
  return (options.method || 'GET').toUpperCase() === 'GET' ? withReadRetry(run) : run();
}
