import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { io as clientIO } from 'socket.io-client';
import { pagination, createAdmissionGate, validateRequestShape, createEventBudget } from '../utils/requestPolicy.js';
import { accountLimiter } from '../middleware/accountLimiter.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyProductStock } from '../services/notify.js';
import { initSocket } from '../socket/index.js';
import Vendor from '../models/Vendor.js';
import Rider from '../models/Rider.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { toggleProductStock } from '../controllers/productController.js';
import { getCustomerOrders } from '../controllers/orderController.js';
import { updateRiderLocation } from '../controllers/riderController.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const customerId = '6abe1c6f51a948ed6b0236ee';
const vendorId = '6abe1c6f51a948ed6b0236eb';

test('pagination bounds malformed, zero, negative and huge page sizes', () => {
  assert.deepEqual(pagination({ limit: '0', page: '-1' }), { page: 1, limit: 1, skip: 0 });
  assert.equal(pagination({ limit: '999999999' }).limit, 200);
  assert.equal(pagination({ limit: 'NaN' }).limit, 100);
  assert.ok(pagination({ page: '999999' }).skip <= 10000);
});

test('admission does not queue unbounded work and releases a slot exactly once', () => {
  const gate = createAdmissionGate({ maxInFlight: 1 });
  let accepted = 0;
  const first = new EventEmitter();
  gate({}, first, () => accepted++);
  const busy = Object.assign(response(), { setHeader() {} });
  gate({}, busy, () => accepted++);
  assert.equal(busy.statusCode, 503);
  first.emit('finish'); first.emit('close');
  gate({}, new EventEmitter(), () => accepted++);
  gate({}, busy, () => accepted++);
  assert.equal(accepted, 2);
});

test('disconnected/readiness state rejects work before route execution', () => {
  const res = Object.assign(response(), { setHeader() {} });
  createAdmissionGate({ ready: () => false })({}, res, () => assert.fail('must not execute'));
  assert.equal(res.statusCode, 503);
});

test('object query injection, duplicate query parameters and nested operators are rejected', () => {
  for (const req of [{ query: { vendor: { $ne: '' } } }, { query: { limit: ['1', '200'] } }, { body: { phone: { $ne: null } } }, { body: { items: Array(501).fill(1) } }]) {
    const res = response();
    validateRequestShape(req, res, () => assert.fail('invalid request accepted'));
    assert.equal(res.statusCode, 400);
  }
  let passed = false;
  validateRequestShape({ query: { page: '1' }, body: { items: [{ qty: 2 }] } }, response(), () => passed = true);
  assert.equal(passed, true);
});

test('event flood budget resets only after its window', () => {
  let now = 0;
  const allowed = createEventBudget({ max: 2, windowMs: 100, now: () => now });
  assert.equal(allowed(), true); assert.equal(allowed(), true); assert.equal(allowed(), false);
  now = 100; assert.equal(allowed(), true);
});

test('account quotas isolate two authenticated users on the same IP (real HTTP)', async t => {
  const app = express();
  app.use((req, _res, next) => { req.user = { id: req.headers['x-test-user'] }; next(); });
  app.use(accountLimiter);
  app.post('/write', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/write`;
  for (let i = 0; i < 120; i++) assert.equal((await fetch(url, { method: 'POST', headers: { 'x-test-user': 'account-a' } })).status, 200);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'x-test-user': 'account-a' } })).status, 429);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'x-test-user': 'account-b' } })).status, 200);
});

test('disabled vendor and deleted rider cannot use a still-valid JWT', async t => {
  const oldSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = 'offline-test-only-secret';
  const originalVendor = Vendor.findById, originalRider = Rider.exists;
  t.after(() => { Vendor.findById = originalVendor; Rider.exists = originalRider; if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = oldSecret; });
  Vendor.findById = () => ({ select: async () => ({ isActive: false, isApproved: true }) });
  Rider.exists = async () => null;
  for (const role of ['VENDOR', 'RIDER']) {
    const token = jwt.sign({ sub: vendorId, role }, process.env.JWT_ACCESS_SECRET);
    const res = response();
    await requireAuth({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail('inactive identity accepted'));
    assert.ok([401, 403].includes(res.statusCode));
  }
});

test('customer order query has enforced scope, limit and stable ordering', async t => {
  const original = Order.find;
  t.after(() => Order.find = original);
  const seen = {};
  const query = { populate() { return this; }, sort(v) { seen.sort = v; return this; }, skip(v) { seen.skip = v; return this; }, async limit(v) { seen.limit = v; return []; } };
  Order.find = filter => { seen.filter = filter; return query; };
  const res = response();
  await getCustomerOrders({ user: { _id: customerId }, query: { limit: '100000', page: '2' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(seen.filter, { customer: customerId });
  assert.equal(seen.limit, 200); assert.equal(seen.skip, 200); assert.equal(seen.sort._id, 1);
});

test('stock increment uses current stock after a concurrent checkout, not stale snapshot', async t => {
  const originals = { byId: Product.findById, atomic: Product.findOneAndUpdate, distinct: Product.distinct };
  t.after(() => { Product.findById = originals.byId; Product.findOneAndUpdate = originals.atomic; Product.distinct = originals.distinct; });
  Product.findById = async () => ({ vendor: vendorId, stockQty: 10, save() { assert.fail('stale save'); } });
  // Checkout has deducted 3 since the preceding read. Evaluate the actual expression over stock=7.
  Product.findOneAndUpdate = async (filter, update, options) => {
    assert.equal(filter.vendor, vendorId); assert.equal(options.updatePipeline, true);
    const expression = update[0].$set.stockQty;
    assert.deepEqual(expression.$max[1].$add[0], { $ifNull: ['$stockQty', 0] });
    return { vendor: vendorId, stockQty: Math.max(0, 7 + expression.$max[1].$add[1]), inStock: true };
  };
  Product.distinct = async () => { throw new Error('skip offline category sync'); };
  const res = response();
  await toggleProductStock({ params: { id: customerId }, user: { role: 'VENDOR', vendorId }, body: { addStock: 5 } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.product.stockQty, 12);
});

test('invalid stock amount produces no database update', async t => {
  const oldRead = Product.findById, oldWrite = Product.findOneAndUpdate;
  t.after(() => { Product.findById = oldRead; Product.findOneAndUpdate = oldWrite; });
  Product.findById = async () => ({ vendor: vendorId });
  Product.findOneAndUpdate = () => assert.fail('must not write');
  const res = response();
  await toggleProductStock({ params: { id: customerId }, user: { role: 'VENDOR', vendorId }, body: { addStock: 'NaN' } }, res);
  assert.equal(res.statusCode, 400);
});

test('guest socket cannot amplify database joins and malformed ack never crashes handlers', { timeout: 5000 }, async t => {
  const server = http.createServer();
  const io = initSocket(server);
  const oldFind = Order.findById;
  Order.findById = () => assert.fail('guest should not query order');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = clientIO(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], reconnection: false });
  t.after(async () => { client.close(); Order.findById = oldFind; await new Promise(resolve => io.close(resolve)); });
  await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
  const result = await new Promise(resolve => client.emit('join:order', customerId, resolve));
  assert.equal(result.ok, false);
  client.emit('join:vendor', vendorId, 'invalid-ack');
  const disconnected = new Promise(resolve => client.once('disconnect', resolve));
  for (let i = 0; i < 35; i++) client.emit('unknown-event');
  await disconnected;
});

test('socket connection limit is per authenticated account and releases on disconnect', { timeout: 5000 }, async t => {
  const secret = process.env.JWT_ACCESS_SECRET, oldFind = User.findById;
  process.env.JWT_ACCESS_SECRET = 'offline-socket-test-secret';
  User.findById = () => ({ select: async () => ({ status: 'ACTIVE', role: 'CUSTOMER' }) });
  const server = http.createServer(), io = initSocket(server), clients = [];
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    clients.forEach(client => client.close());
    await new Promise(resolve => io.close(resolve));
    User.findById = oldFind;
    if (secret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = secret;
  });
  const token = jwt.sign({ sub: customerId, role: 'CUSTOMER' }, process.env.JWT_ACCESS_SECRET, { expiresIn: '1h' });
  const connect = () => new Promise(resolve => {
    const client = clientIO(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], reconnection: false, auth: { token } });
    clients.push(client);
    client.once('connect', () => resolve(null));
    client.once('connect_error', error => resolve(error.message));
  });
  for (let i = 0; i < 4; i++) assert.equal(await connect(), null);
  assert.equal(await connect(), 'TOO_MANY_CONNECTIONS');
  clients[0].close();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(await connect(), null);
});

test('GPS stale read cannot overwrite a newer position or changed rider assignment', async t => {
  const oldRead = Rider.findById, oldWrite = Rider.findOneAndUpdate;
  t.after(() => { Rider.findById = oldRead; Rider.findOneAndUpdate = oldWrite; });
  const before = new Date(Date.now() - 10000);
  Rider.findById = async () => ({ locationUpdatedAt: before, activeOrderId: null, currentLocation: { coordinates: [76.81, 30.63] } });
  Rider.findOneAndUpdate = async filter => {
    assert.equal(filter.locationUpdatedAt, before);
    assert.equal(filter.activeOrderId, null);
    return null; // A competing update committed after the initial read.
  };
  const res = response();
  await updateRiderLocation({ user: { id: customerId }, body: { lat: 30.63, lng: 76.81, accuracy: 10, capturedAt: Date.now(), speed: 0, heading: 0 } }, res);
  assert.equal(res.statusCode, 409); assert.equal(res.body.code, 'GPS_STATE_CONFLICT');
});

test('scoped stock events reach only the subscribed catalog and vendor room', { timeout: 5000 }, async t => {
  const old = process.env.SCOPED_STOCK_EVENTS;
  process.env.SCOPED_STOCK_EVENTS = 'true';
  const server = http.createServer(), io = initSocket(server), clients = [];
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    clients.forEach(client => client.close());
    await new Promise(resolve => io.close(resolve));
    if (old === undefined) delete process.env.SCOPED_STOCK_EVENTS; else process.env.SCOPED_STOCK_EVENTS = old;
  });
  const connect = async () => {
    const client = clientIO(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], reconnection: false });
    clients.push(client);
    await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    return client;
  };
  const subscriber = await connect(), unrelated = await connect();
  assert.equal((await new Promise(resolve => subscriber.emit('join:catalog', vendorId, resolve))).ok, true);
  assert.equal((await new Promise(resolve => unrelated.emit('join:catalog', customerId, resolve))).ok, true);
  const vendorSocket = await connect();
  await io.sockets.sockets.get(vendorSocket.id).join('vendor:' + vendorId); // room setup without authentication mocking
  let unrelatedEvents = 0, subscriberEvents = 0, vendorEvents = 0;
  unrelated.on('product:stock', () => unrelatedEvents++);
  subscriber.on('product:stock', () => subscriberEvents++);
  vendorSocket.on('product:stock', () => vendorEvents++);
  const received = new Promise(resolve => subscriber.once('product:stock', resolve));
  notifyProductStock({ _id: customerId, vendor: vendorId, stockQty: 7, inStock: true });
  assert.equal((await received).stockQty, 7);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(subscriberEvents, 1); assert.equal(vendorEvents, 1); assert.equal(unrelatedEvents, 0);
  assert.equal((await new Promise(resolve => subscriber.emit('join:catalog', { $ne: null }, resolve))).ok, false);
  // leave has no ack; ping with a join to establish ordering over this socket connection.
  subscriber.emit('leave:catalog', vendorId);
  await new Promise(resolve => subscriber.emit('join:catalog', customerId, resolve));
  notifyProductStock({ _id: customerId, vendor: vendorId, stockQty: 6, inStock: true });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(subscriberEvents, 1);
});
