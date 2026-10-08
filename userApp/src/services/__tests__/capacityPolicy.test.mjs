import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { withReadRetry, collectPages, createSingleFlight, startPolling, fetchJsonResponse } from '../requestPolicy.js';
import { createOrderRecovery } from '../orderRecovery.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const memoryStorage = () => {
  const values = new Map();
  return { getItem: async (key) => values.get(key), setItem: async (key, value) => { values.set(key, value); }, removeItem: async (key) => { values.delete(key); } };
};

test('all three apps ship the same tested request policy', () => {
  const original = fs.readFileSync(new URL('../requestPolicy.js', import.meta.url), 'utf8');
  for (const app of ['deliveryApp', 'partnerApp']) {
    assert.equal(fs.readFileSync(new URL(`../../../../${app}/src/services/requestPolicy.js`, import.meta.url), 'utf8'), original);
  }
});

test('read retry honors Retry-After, caps attempts and declines long waits', async () => {
  let calls = 0; const delays = [];
  const error = { status: 429, retryAfter: '2' };
  const result = await withReadRetry(async () => { if (++calls === 1) throw error; return 'ok'; }, { sleep: async (ms) => delays.push(ms), random: () => 0 });
  assert.equal(result, 'ok'); assert.equal(calls, 2); assert.deepEqual(delays, [2000]);
  calls = 0;
  await assert.rejects(withReadRetry(async () => { calls++; throw { status: 503, retryAfter: '60' }; }, { sleep: async () => assert.fail('must not retry early') }));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(withReadRetry(async () => { calls++; throw { status: 403 }; }));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(withReadRetry(async () => { calls++; throw { code: 'NETWORK_ERROR' }; }, { sleep: async () => {} }));
  assert.equal(calls, 2);
});

test('single flight shares requests and releases failed operations', async () => {
  const run = createSingleFlight(); const barrier = deferred(); let calls = 0;
  const first = run('a', () => { calls++; return barrier.promise; });
  const second = run('a', () => assert.fail('duplicate dispatch'));
  assert.equal(first, second); await flush(); assert.equal(calls, 1);
  barrier.reject(new Error('offline')); await assert.rejects(first);
  assert.equal(await run('a', async () => 'recovered'), 'recovered');
});

test('paged inventories preserve later pages and remove duplicate IDs', async () => {
  const requested = [];
  const rows = [[{ _id: '1' }, { _id: '2' }], [{ _id: '2' }, { _id: '3' }], []];
  const result = await collectPages(async ({ page, limit }) => {
    requested.push([page, limit]); return { success: true, page, products: rows[page - 1] };
  }, 'products', { limit: 2 });
  assert.deepEqual(result.products.map((p) => p._id), ['1', '2', '3']);
  assert.deepEqual(requested, [[1, 2], [2, 2], [3, 2]]);
});

test('pagination rejects clamped/repeated pages, invalid JSON shapes and list ceilings', async () => {
  await assert.rejects(collectPages(async () => ({ success: true, page: 1, products: [{ _id: '1' }] }), 'products', { limit: 1 }), { code: 'PAGINATION_CONFLICT' });
  await assert.rejects(collectPages(async () => 'compressed bytes', 'products'), { code: 'INVALID_RESPONSE' });
  await assert.rejects(collectPages(async ({ page }) => ({ success: true, page, products: [{ _id: `${page}` }] }), 'products', { limit: 1, maxPages: 2 }), { code: 'PAGINATION_LIMIT' });
});

test('polling waits for a slow operation and stops even during an in-flight request', async () => {
  const scheduled = []; const barrier = deferred(); let calls = 0;
  const stop = startPolling(async () => { calls++; await barrier.promise; }, {
    intervalMs: 20, random: () => 0, schedule: (fn) => { scheduled.push(fn); return scheduled.length; }, cancel: () => {}
  });
  assert.equal(scheduled.length, 1);
  const pending = scheduled[0](); await flush(); assert.equal(calls, 1); assert.equal(scheduled.length, 1);
  stop(); barrier.resolve(); await pending; assert.equal(scheduled.length, 1);
});

test('background polling skips network work', async () => {
  const scheduled = []; let calls = 0;
  const stop = startPolling(async () => { calls++; }, { intervalMs: 20, active: () => false,
    schedule: (fn) => { scheduled.push(fn); return 1; }, cancel: () => {} });
  await scheduled[0](); stop(); assert.equal(calls, 0);
});

test('POST timeout/busy response never causes an automatic replay', async () => {
  let calls = 0;
  const transport = async () => { calls++; return { ok: false, status: 503, headers: { get: () => '0' }, text: async () => '{"message":"busy"}' }; };
  await assert.rejects(fetchJsonResponse('/orders', { method: 'POST' }, { transport }));
  assert.equal(calls, 1);
});

test('fetch deadline covers a body that never completes', async () => {
  let aborted = false;
  const transport = async (_url, options) => {
    options.signal.addEventListener('abort', () => { aborted = true; });
    return { ok: true, status: 200, text: () => new Promise(() => {}) };
  };
  await assert.rejects(fetchJsonResponse('/orders', { method: 'POST' }, { transport, timeoutMs: 10 }), { code: 'ETIMEDOUT' });
  assert.equal(aborted, true);
});

test('checkout shares in-flight work, persists an ambiguous attempt and scopes it per customer', async () => {
  const storage = memoryStorage(); let sequence = 0;
  const checkout = createOrderRecovery(storage, () => `attempt_${++sequence}`);
  const payload = { vendorId: 'v', items: [{ productId: 'p', qty: 1 }], address: { lat: 1, lng: 2 }, paymentMethod: 'COD' };
  const barrier = deferred(); const sent = [];
  const first = checkout('customerA', payload, (body) => { sent.push(body); return barrier.promise; });
  assert.equal(checkout('customerA', payload, () => assert.fail('duplicate order')), first);
  await flush(); barrier.reject(new Error('response lost')); await assert.rejects(first);
  // Recreate the coordinator to model an app restart using the same persisted storage.
  const restarted = createOrderRecovery(storage, () => 'must_not_be_used');
  await assert.rejects(restarted('customerA', { ...payload, paymentMethod: 'CARD' }, () => assert.fail()), { code: 'PENDING_ORDER_CHECK' });
  assert.equal(await restarted('customerA', payload, async (body) => { assert.equal(body.clientOrderId, sent[0].clientOrderId); return 'original order'; }), 'original order');
  await checkout('customerB', payload, async (body) => { assert.notEqual(body.clientOrderId, sent[0].clientOrderId); return 'B order'; });
});

test('definitive pre-write validation rejection releases checkout claim', async () => {
  const checkout = createOrderRecovery(memoryStorage()); const payload = { items: [{ qty: 1 }] };
  await assert.rejects(checkout('customerA', payload, async () => { throw { status: 400, code: 'OUT_OF_STOCK' }; }));
  assert.equal(await checkout('customerA', { items: [{ qty: 2 }] }, async () => 'confirmed'), 'confirmed');
});

function loadApi(app, post) {
  const hooks = [];
  const client = { defaults: { headers: { common: {} } }, interceptors: { request: { use() {} }, response: { use(...args) { hooks.push(args); } } } };
  let access = 'old-access', refresh = 'old-refresh', cleared = 0;
  const storage = { getAccessToken: async () => access, getToken: async () => access, getRefreshToken: async () => refresh,
    getDeviceId: async () => 'device', setAccessToken: async (value) => { access = value; }, setToken: async (value) => { access = value; },
    setRefreshToken: async (value) => { refresh = value; }, clearTokens: async () => { cleared++; }, clearAuth: async () => { cleared++; } };
  const context = vm.createContext({ storage, axios: { create: () => client, post }, API_BASE_URL: 'https://staging/api', Platform: { OS: 'android' },
    process: { env: {} }, __DEV__: false, console: { log() {}, warn() {}, error() {} }, isDefinitiveAuthFailure: (e) => [401,403].includes(e.response?.status) || e.code === 'NO_REFRESH_TOKEN',
    collectPages, createSingleFlight, withReadRetry });
  let code = fs.readFileSync(new URL(`../../../../${app}/src/services/api.js`, import.meta.url), 'utf8');
  code = code.replace(/^import .*;\s*$/gm, '').replace(/export default .*;\s*$/gm, '').replace(/export /g, '');
  code += app === 'userApp' ? '\nglobalThis.apiTest = { refresh: refreshAuthToken, invalidate: suspendSessionForTeardown };' : '\nglobalThis.apiTest = { refresh: refreshRiderAuthToken, invalidate: suspendRiderSession };';
  vm.runInContext(code, context);
  return { ...context.apiTest, cleared: () => cleared, access: () => access };
}

for (const app of ['userApp', 'deliveryApp']) {
  test(`${app}: refresh timeout/503 keeps credentials; definitive 401 clears them`, async () => {
    const transient = loadApi(app, async () => { throw { response: { status: 503 } }; });
    await assert.rejects(transient.refresh()); assert.equal(transient.cleared(), 0);
    const rejected = loadApi(app, async () => { throw { response: { status: 401 } }; });
    await assert.rejects(rejected.refresh()); assert.equal(rejected.cleared(), 1);
  });
  test(`${app}: late refresh after logout cannot store credentials`, async () => {
    const barrier = deferred(); const api = loadApi(app, () => barrier.promise);
    const pending = api.refresh(); await flush(); api.invalidate();
    barrier.resolve({ data: { token: 'late-access', accessToken: 'late-access', refreshToken: 'late-refresh' } });
    await pending.catch(() => {}); assert.equal(api.access(), 'old-access'); assert.equal(api.cleared(), 0);
  });
}

test('checkout never dispatches after persistent storage refuses the recovery claim', async () => {
  const storage = memoryStorage(); storage.setItemStrict = async () => { throw new Error('disk full'); };
  const checkout = createOrderRecovery(storage);
  await assert.rejects(checkout('customerA', { items: [] }, () => assert.fail('must not dispatch')), /disk full/);
});

function loadRiderSocket(tokenLookup) {
  let created = 0;
  const context = vm.createContext({ Platform: { OS: 'android' }, storage: { getToken: tokenLookup },
    process: { env: { EXPO_PUBLIC_API_URL: 'https://staging/api' } }, __DEV__: false, console: { log() {}, warn() {} },
    require: (name) => { assert.equal(name, 'socket.io-client'); return () => { created++; return { on() {}, disconnect() {} }; }; }, setTimeout });
  let code = fs.readFileSync(new URL('../../../../deliveryApp/src/services/socket.js', import.meta.url), 'utf8');
  code = code.replace(/^import .*;\s*$/gm, '').replace(/export default \{[\s\S]*?\};/, '').replace(/export /g, '');
  vm.runInContext(code + '\nglobalThis.socketTest={connectSocket,disconnectSocket};', context);
  return { ...context.socketTest, created: () => created };
}

test('rider concurrent connect calls create exactly one socket', async () => {
  const barrier = deferred(); const socket = loadRiderSocket(() => barrier.promise);
  const first = socket.connectSocket(); const second = socket.connectSocket();
  assert.equal(first, second); barrier.resolve('token');
  assert.equal(await first, await second); assert.equal(socket.created(), 1);
});

test('logout while rider token lookup is pending cancels socket creation', async () => {
  const barrier = deferred(); const socket = loadRiderSocket(() => barrier.promise);
  const first = socket.connectSocket(); socket.disconnectSocket(); barrier.resolve('old-token');
  assert.equal(await first, null); assert.equal(socket.created(), 0);
});

test('partner stock bridge rejects malformed payloads and unsubscribes listeners', async () => {
  const { subscribeStock, publishStock } = await import('../../../../partnerApp/src/services/stockEvents.js');
  let count = 0; const unsubscribe = subscribeStock(() => count++);
  publishStock({ vendorId: 'v', productId: 'p', stockQty: NaN, inStock: true });
  assert.equal(count, 0);
  publishStock({ vendorId: 'v', productId: 'p', stockQty: 3, inStock: true });
  assert.equal(count, 1); unsubscribe();
  publishStock({ vendorId: 'v', productId: 'p', stockQty: 2, inStock: true });
  assert.equal(count, 1);
});
