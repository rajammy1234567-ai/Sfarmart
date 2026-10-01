import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { io as client } from 'socket.io-client';
import Order from '../models/Order.js';
import Rider from '../models/Rider.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import orderRoutes from '../routes/orderRoutes.js';
import riderRoutes from '../routes/riderRoutes.js';
import productRoutes from '../routes/productRoutes.js';
import { initSocket } from '../socket/index.js';
import { handleRiderAccept } from '../services/riderAssignmentService.js';
import { validCoordinates, distanceKm, canAccessOrder, orderForRole } from '../utils/deliveryPolicy.js';
import { parseNumericField } from '../controllers/productController.js';
import { executeTeardown } from '../utils/testTeardownHelper.js';
process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';

// Independently reviewed, code-pinned trusted configuration for staging hosts.
// To run staging integration tests, the system owner/DBA must explicitly review and pin
// the exact authorized staging cluster hostname here.
// When empty, staging mode fails closed immediately without guessing or accepting arbitrary hosts.
const APPROVED_STAGING_HOSTS = Object.freeze([
  'farmart-staging.gxn3bfw.mongodb.net'
]);

const isStagingMode = process.env.ALLOW_STAGING_ATLAS_TEST === 'true';
const localUri = process.env.TEST_MONGO_URI;
const stagingUri = process.env.STAGING_MONGO_URI;
const expectedStagingUser = process.env.EXPECTED_STAGING_DB_USER;
const expectedStagingAuthDb = process.env.EXPECTED_STAGING_AUTH_DB;
const jwtSecret = process.env.JWT_ACCESS_SECRET;
const uri = isStagingMode ? stagingUri : localUri;
const skipDbTests = !isStagingMode && !localUri;

let server, io, url, customer, other, vendor, riderA, riderB, testProduct;
let handshakePassed = false;
let phoneSeq = 0;
const runId = isStagingMode ? `t_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}` : 'test';
const getTestPhone = () => isStagingMode ? `987${Math.floor(1000000 + Math.random() * 9000000)}` : ('987650000' + (phoneSeq++ % 10));

const trackedIds = {
  orders: new Set(),
  users: new Set(),
  vendors: new Set(),
  riders: new Set(),
  products: new Set()
};

const trackDoc = (type, doc) => {
  const id = doc?._id || doc?.id;
  if (id) trackedIds[type].add(String(id));
  return doc;
};

const token = (account, role) => {
  if (!jwtSecret) throw new Error('JWT_ACCESS_SECRET is required for test token generation');
  const payload = { id: String(account._id), sub: String(account._id), role };
  if (role === 'VENDOR') payload.vendorId = String(account._id);
  return jwt.sign(payload, jwtSecret, { expiresIn: '1h' });
};

const req = async (method, route, account, role, body) => {
  const r = await fetch(url + '/api' + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(account ? { Authorization: 'Bearer ' + token(account, role) } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (method === 'POST' && route === '/orders' && r.status === 201 && !data?.isExisting) {
    const orderId = data?.order?._id || data?.order?.id;
    if (orderId) trackedIds.orders.add(String(orderId));
  }
  if (method === 'POST' && route === '/products' && r.status === 201) {
    const prodId = data?.product?._id || data?.product?.id;
    if (prodId) trackedIds.products.add(String(prodId));
  }
  return { status: r.status, body: data };
};

let seq = 0;
const makeOrder = async (extra = {}) => {
  const ord = await Order.create({
    orderNumber: `TEST-${runId}-${++seq}`,
    customer: customer._id,
    vendor: vendor._id,
    items: [],
    pricing: { itemsTotal: 100, grandTotal: 125 },
    payment: { method: 'COD', status: 'PENDING' },
    address: { name: 'Customer', phone: customer.phone || '9876500000', line1: 'Gate 1', lat: 30.902, lng: 75.858 },
    status: 'READY_FOR_RIDER',
    ...extra
  });
  return trackDoc('orders', ord);
};

before(async () => {
  if (isStagingMode) {
    if (!stagingUri || !stagingUri.trim()) {
      throw new Error('FAIL-CLOSED: STAGING_MONGO_URI is required when ALLOW_STAGING_ATLAS_TEST=true.');
    }
  } else {
    // Local mode: if TEST_MONGO_URI is missing, skip the suite cleanly
    if (!localUri) return;
  }

  if (!jwtSecret) throw new Error('JWT_ACCESS_SECRET is required for test suite execution');

  if (!isStagingMode) {
    // ----------------------------------------------------
    // LOCAL MODE (Default)
    // ----------------------------------------------------
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(uri)) {
      throw new Error('FAIL-CLOSED [STAGE:LOCAL_CONFIG]: Tests require an isolated localhost MongoDB replica set.');
    }
    try {
      await mongoose.connect(uri, { dbName: 'farmart_delivery_test_' + Date.now() });
      await Promise.all([Order.init(), Rider.init(), User.init(), Vendor.init(), Product.init()]);
    } catch {
      throw new Error('FAIL-CLOSED [STAGE:LOCAL_CONNECT]: Local MongoDB connection failed.');
    }
  } else {
    // ----------------------------------------------------
    // STAGING MODE (Explicit Opt-In)
    // ----------------------------------------------------
    if (APPROVED_STAGING_HOSTS.length === 0) {
      throw new Error('FAIL-CLOSED: No approved staging hostname is configured in APPROVED_STAGING_HOSTS. Pinned configuration required.');
    }
    if (!expectedStagingUser || !expectedStagingUser.trim()) {
      throw new Error('FAIL-CLOSED: EXPECTED_STAGING_DB_USER must be configured in staging mode.');
    }
    if (!expectedStagingAuthDb || !expectedStagingAuthDb.trim()) {
      throw new Error('FAIL-CLOSED: EXPECTED_STAGING_AUTH_DB must be explicitly configured in staging mode. Do not silently default.');
    }

    let parsedUri;
    try {
      parsedUri = new URL(uri);
    } catch {
      throw new Error('FAIL-CLOSED [STAGE:URI_VALIDATION]: STAGING_MONGO_URI could not be parsed as a valid URL.');
    }

    const normalizedHost = parsedUri.hostname.toLowerCase();
    if (!APPROVED_STAGING_HOSTS.map(h => h.toLowerCase()).includes(normalizedHost)) {
      throw new Error(`FAIL-CLOSED: STAGING_MONGO_URI hostname "${parsedUri.hostname}" is not in the code-pinned APPROVED_STAGING_HOSTS allowlist.`);
    }

    const targetDb = parsedUri.pathname.replace(/^\//, '').split('?')[0];
    if (targetDb !== 'farmart_test_disposable') {
      throw new Error(`FAIL-CLOSED: STAGING_MONGO_URI must specify database "farmart_test_disposable", got "${targetDb}".`);
    }

    // Connect with autoIndex: false and autoCreate: false (no DDL)
    try {
      await mongoose.connect(uri, {
        autoIndex: false,
        autoCreate: false,
        dbName: 'farmart_test_disposable'
      });
    } catch {
      throw new Error('FAIL-CLOSED [STAGE:CONNECT]: Staging database connection failed. Credentials and connection string have been sanitized from this message.');
    }

    if (mongoose.connection.name !== 'farmart_test_disposable') {
      await mongoose.disconnect();
      throw new Error(`FAIL-CLOSED: Active database "${mongoose.connection.name}" does not match "farmart_test_disposable".`);
    }

    const status = await mongoose.connection.db.command({ connectionStatus: 1 });
    const authUsers = status.authInfo?.authenticatedUsers;
    if (!Array.isArray(authUsers) || authUsers.length !== 1) {
      await mongoose.disconnect();
      throw new Error(`FAIL-CLOSED: Expected exactly one authenticated user, got: ${JSON.stringify(authUsers || [])}`);
    }

    const authUser = authUsers[0];
    if (authUser.user !== expectedStagingUser.trim() || authUser.db !== expectedStagingAuthDb.trim()) {
      await mongoose.disconnect();
      throw new Error(`FAIL-CLOSED: Authenticated user (${authUser.user}@${authUser.db}) does not match expected (${expectedStagingUser.trim()}@${expectedStagingAuthDb.trim()}).`);
    }

    // Read-only exact index verification on Order collection
    const orderIndexes = await Order.collection.indexes();
    const compoundIdx = orderIndexes.find(idx => {
      const keyEntries = Object.entries(idx.key || {});
      const isExactKey = keyEntries.length === 2 &&
        keyEntries[0][0] === 'customer' && keyEntries[0][1] === 1 &&
        keyEntries[1][0] === 'clientOrderId' && keyEntries[1][1] === 1;

      const pfe = idx.partialFilterExpression;
      const isExactPfe = pfe && typeof pfe === 'object' &&
        Object.keys(pfe).length === 1 &&
        pfe.clientOrderId && typeof pfe.clientOrderId === 'object' &&
        Object.keys(pfe.clientOrderId).length === 1 &&
        pfe.clientOrderId.$type === 'string';

      return isExactKey && idx.unique === true && isExactPfe;
    });

    if (!compoundIdx) {
      await mongoose.disconnect();
      throw new Error('FAIL-CLOSED: Required compound index with exact keys [["customer", 1], ["clientOrderId", 1]], unique: true, and exact partialFilterExpression { clientOrderId: { $type: "string" } } is missing in farmart_test_disposable.');
    }

    const obsoleteGlobalIdx = orderIndexes.find(idx => {
      const keyEntries = Object.entries(idx.key || {});
      return keyEntries.length === 1 &&
        keyEntries[0][0] === 'clientOrderId' &&
        idx.unique === true;
    });
    if (obsoleteGlobalIdx) {
      await mongoose.disconnect();
      throw new Error('FAIL-CLOSED: Obsolete single-key unique index on clientOrderId is still present in farmart_test_disposable. DBA migration required.');
    }
  }

  // Mark database handshake successful immediately after connection, auth, and index checks pass,
  // BEFORE any fixture creation begins so partial fixture creation failures can still be cleaned up.
  handshakePassed = true;

  // Safe fixture creation with per-document tracking to handle partial batch failures cleanly
  const createAndTrackUser = async (phone, name) => {
    const doc = await User.create({ phone, name });
    return trackDoc('users', doc);
  };
  const createAndTrackRider = async (phone) => {
    const doc = await Rider.create({
      name: 'Rider ' + phone,
      phone,
      passwordHash: 'unused',
      status: 'ONLINE_IDLE',
      currentLocation: { type: 'Point', coordinates: [75.8573, 30.901] },
      locationUpdatedAt: new Date()
    });
    return trackDoc('riders', doc);
  };

  customer = await createAndTrackUser(getTestPhone(), 'Customer A ' + runId);
  other = await createAndTrackUser(getTestPhone(), 'Customer B ' + runId);

  vendor = trackDoc('vendors', await Vendor.create({
    storeName: 'Test store ' + runId,
    ownerName: 'Merchant ' + runId,
    phone: getTestPhone(),
    passwordHash: 'unused',
    storeType: 'KIRANA'
  }));

  testProduct = trackDoc('products', await Product.create({
    name: 'Test Apple ' + runId,
    price: 100,
    unit: '1 kg',
    stockQty: 100,
    inStock: true,
    vendor: vendor._id,
    category: new mongoose.Types.ObjectId()
  }));

  riderA = await createAndTrackRider(getTestPhone());
  riderB = await createAndTrackRider(getTestPhone());

  const app = express();
  app.use(express.json());
  app.use('/api/rider', riderRoutes);
  app.use('/api', orderRoutes);
  app.use('/api', productRoutes);

  server = http.createServer(app);
  io = initSocket(server);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  url = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  await executeTeardown({
    io,
    server,
    handshakePassed,
    mongooseConnection: {
      get readyState() { return mongoose.connection.readyState; },
      get name() { return mongoose.connection.name; },
      close: () => mongoose.disconnect()
    },
    trackedIds,
    isStagingMode,
    models: { Order, Product, Rider, Vendor, User }
  });
});

test('Coordinates reject absent/out-of-range data and support zero', () => { assert.equal(validCoordinates(0, 0), true); for (const v of [null, undefined, NaN, Infinity, '30']) assert.equal(validCoordinates(v, 75), false); assert.equal(validCoordinates(91, 75), false); assert.equal(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0); });
test('Order ownership and OTP redaction', () => { const order = { customer: 'c', vendor: 'v', rider: 'r', pickupOtp: '1111', deliveryOtp: '2222' }; assert.equal(canAccessOrder({ id: 'other', role: 'RIDER' }, order), false); assert.equal(canAccessOrder({ id: 'r', role: 'RIDER' }, order), true); assert.equal(orderForRole(order, 'RIDER').deliveryOtp, undefined); assert.equal(orderForRole(order, 'CUSTOMER').pickupOtp, undefined); assert.equal(orderForRole(order, 'VENDOR').pickupOtp, '1111'); });
test('Product update numeric validator rejects null, booleans, empty strings, and non-numeric types', () => {
  for (const bad of [null, undefined, true, false, '', '   ', [], [10], {}, NaN, Infinity, -Infinity, 'abc', '100px']) {
    assert.equal(parseNumericField(bad), null);
  }
  assert.equal(parseNumericField(0), 0);
  assert.equal(parseNumericField('0'), 0);
  assert.equal(parseNumericField(49.99), 49.99);
  assert.equal(parseNumericField('  120.5  '), 120.5);
  assert.equal(parseNumericField(-5), -5);
});
test('HTTP: guest queues/status writes and customer rider endpoints are denied', { skip: skipDbTests }, async () => {
  assert.equal((await req('GET', '/orders/delivery/pending')).status, 401);
  assert.equal((await req('PATCH', '/orders/' + new mongoose.Types.ObjectId() + '/status', null, null, { status: 'DELIVERED' })).status, 401);
  assert.equal((await req('GET', '/rider/profile', customer, 'CUSTOMER')).status, 403);
});
test('HTTP: unrelated customer and rider cannot read an order; vendor cannot skip OTP', { skip: skipDbTests }, async () => {
  const order = await makeOrder();
  assert.equal((await req('GET', '/orders/' + order.id, other, 'CUSTOMER')).status, 403);
  assert.equal((await req('GET', '/orders/' + order.id, riderB, 'RIDER')).status, 403);
  assert.equal((await req('PATCH', '/orders/' + order.id + '/status', vendor, 'VENDOR', { status: 'DELIVERED' })).status, 403);
});
test('Socket: foreign vendor/order rooms are denied, owner can subscribe', { skip: skipDbTests }, async () => {
  const order = await makeOrder(); const socket = client(url, { auth: { token: token(other, 'CUSTOMER') }, transports: ['websocket'] });
  await new Promise((resolve, reject) => { socket.on('connect', resolve); socket.on('connect_error', reject); });
  try { assert.equal((await socket.timeout(2000).emitWithAck('join:vendor', vendor.id)).ok, false); assert.equal((await socket.timeout(2000).emitWithAck('join:order', order.id)).ok, false); } finally { socket.disconnect(); }
  const owner = client(url, { auth: { token: token(customer, 'CUSTOMER') }, transports: ['websocket'] }); await new Promise((r, j) => { owner.on('connect', r); owner.on('connect_error', j); }); try { assert.equal((await owner.timeout(2000).emitWithAck('join:order', order.id)).ok, true); } finally { owner.disconnect(); }
});
test('Concurrent acceptance: only one rider wins an order and one rider cannot take two orders', { skip: skipDbTests }, async () => {
  await Rider.updateMany({ _id: { $in: [riderA._id, riderB._id] } }, { $set: { status: 'ONLINE_IDLE', activeOrderId: null } });
  const order = await makeOrder(); const results = await Promise.all([handleRiderAccept(order.id, riderA.id), handleRiderAccept(order.id, riderB.id)]);
  assert.equal(results.filter(r => r.success).length, 1);
  const assigned = await Order.findById(order.id); assert.equal((await Rider.findById(assigned.rider)).activeOrderId.toString(), order.id);
  await Rider.updateMany({ _id: { $in: [riderA._id, riderB._id] } }, { $set: { status: 'ONLINE_IDLE', activeOrderId: null } });
  const [a, b] = await Promise.all([makeOrder(), makeOrder()]); const both = await Promise.all([handleRiderAccept(a.id, riderA.id), handleRiderAccept(b.id, riderA.id)]); assert.equal(both.filter(r => r.success).length, 1);
});
test('OTP lifecycle: pickup required, delivery cannot skip pickup, concurrent completion credits once', { skip: skipDbTests }, async () => {
  const order = await makeOrder({ rider: riderA._id, status: 'RIDER_ARRIVED_STORE', pickupOtp: '1234', deliveryOtp: '5678' });
  await Rider.findByIdAndUpdate(riderA._id, { $set: { activeOrderId: order._id, status: 'ON_DELIVERY', totalEarningsPaise: 0, completedDeliveries: 0 } });
  assert.equal((await req('POST', '/rider/orders/' + order.id + '/pickup-verify', riderA, 'RIDER', {})).status, 400);
  assert.equal((await req('POST', '/rider/orders/' + order.id + '/delivery-verify', riderA, 'RIDER', { deliveryOtp: '5678' })).status, 409);
  const pickup = await req('POST', '/rider/orders/' + order.id + '/pickup-verify', riderA, 'RIDER', { pickupOtp: '1234' }); assert.equal(pickup.status, 200); assert.equal(pickup.body.order.pickupOtp, undefined); assert.equal(pickup.body.order.deliveryOtp, undefined);
  const done = await Promise.all([req('POST', '/rider/orders/' + order.id + '/delivery-verify', riderA, 'RIDER', { deliveryOtp: '5678' }), req('POST', '/rider/orders/' + order.id + '/delivery-verify', riderA, 'RIDER', { deliveryOtp: '5678' })]); assert.equal(done.filter(r => r.status === 200).length, 1); assert.equal((await Rider.findById(riderA.id)).totalEarningsPaise, 6500);
});
test('GPS rejects stale, inaccurate and foreign-order pings', { skip: skipDbTests }, async () => {
  const fix = { lat: 30.901, lng: 75.857, heading: 0, speed: 0, accuracy: 10, capturedAt: Date.now() };
  assert.equal((await req('POST', '/rider/location', riderA, 'RIDER', { ...fix, lat: 999 })).status, 400);
  assert.equal((await req('POST', '/rider/location', riderA, 'RIDER', { ...fix, capturedAt: 1 })).status, 400);
  assert.equal((await req('POST', '/rider/location', riderA, 'RIDER', { ...fix, accuracy: 500 })).status, 400);
  assert.equal((await req('POST', '/rider/location', riderA, 'RIDER', { ...fix, orderId: new mongoose.Types.ObjectId() })).status, 403);
  assert.equal((await req('POST', '/rider/location', riderA, 'RIDER', fix)).status, 200);
});
test('Checkout rejects missing pin and simulated prepaid payment', { skip: skipDbTests }, async () => {
  const body = { items: [{ productId: new mongoose.Types.ObjectId(), qty: 1 }], address: { name: 'User', phone: '9876500000', line1: 'Gate' } };
  assert.equal((await req('POST', '/orders', customer, 'CUSTOMER', body)).body.code, 'DELIVERY_ADDRESS_REQUIRED');
  assert.equal((await req('POST', '/orders', customer, 'CUSTOMER', { ...body, address: { ...body.address, lat: 0, lng: 0 }, paymentMethod: 'CARD' })).body.code, 'PAYMENT_NOT_CONFIGURED');
});
test('clientOrderId idempotency: same-customer retry returns existing order', { skip: skipDbTests }, async () => {
  const payload = { clientOrderId: 'retry-test-' + Date.now(), items: [{ productId: testProduct._id, qty: 1 }], address: { name: 'Customer A', phone: '9876500000', line1: 'Gate 1', lat: 30.902, lng: 75.858 }, paymentMethod: 'COD' };
  const first = await req('POST', '/orders', customer, 'CUSTOMER', payload);
  assert.equal(first.status, 201);
  assert.equal(first.body.success, true);
  const second = await req('POST', '/orders', customer, 'CUSTOMER', payload);
  assert.equal(second.status, 200);
  assert.equal(second.body.isExisting, true);
  assert.equal(second.body.order._id, first.body.order._id);
  assert.equal(await Order.countDocuments({ customer: customer._id, clientOrderId: payload.clientOrderId }), 1);
});
test('clientOrderId collision: same ID across two customers creates separate orders', { skip: skipDbTests }, async () => {
  const sharedClientId = 'shared-cross-customer-' + Date.now();
  const payloadA = { clientOrderId: sharedClientId, items: [{ productId: testProduct._id, qty: 1 }], address: { name: 'Customer A', phone: '9876500000', line1: 'Gate 1', lat: 30.902, lng: 75.858 }, paymentMethod: 'COD' };
  const payloadB = { clientOrderId: sharedClientId, items: [{ productId: testProduct._id, qty: 1 }], address: { name: 'Customer B', phone: '9876500001', line1: 'Gate 2', lat: 30.902, lng: 75.858 }, paymentMethod: 'COD' };
  const resA = await req('POST', '/orders', customer, 'CUSTOMER', payloadA);
  assert.equal(resA.status, 201);
  const resB = await req('POST', '/orders', other, 'CUSTOMER', payloadB);
  assert.equal(resB.status, 201);
  assert.notEqual(resA.body.order._id, resB.body.order._id);
  assert.equal(await Order.countDocuments({ clientOrderId: sharedClientId }), 2);
  assert.equal(await Order.countDocuments({ customer: customer._id, clientOrderId: sharedClientId }), 1);
  assert.equal(await Order.countDocuments({ customer: other._id, clientOrderId: sharedClientId }), 1);
});
test('clientOrderId concurrency: concurrent same-customer requests create exactly one order and deduct stock once', { skip: skipDbTests }, async () => {
  const stockBefore = (await Product.findById(testProduct._id)).stockQty;
  const payload = { clientOrderId: 'concurrent-race-' + Date.now(), items: [{ productId: testProduct._id, qty: 1 }], address: { name: 'Customer A', phone: '9876500000', line1: 'Gate 1', lat: 30.902, lng: 75.858 }, paymentMethod: 'COD' };
  const [res1, res2] = await Promise.all([
    req('POST', '/orders', customer, 'CUSTOMER', payload),
    req('POST', '/orders', customer, 'CUSTOMER', payload)
  ]);
  const success201 = [res1, res2].filter(r => r.status === 201);
  const existing200 = [res1, res2].filter(r => r.status === 200 && r.body?.isExisting);
  assert.equal(success201.length, 1, 'Exactly one request must create the order (201)');
  assert.equal(existing200.length, 1, 'The concurrent request must recover existing order (200)');
  assert.equal(existing200[0].body.order._id, success201[0].body.order._id);
  assert.equal(await Order.countDocuments({ customer: customer._id, clientOrderId: payload.clientOrderId }), 1);
  const stockAfter = (await Product.findById(testProduct._id)).stockQty;
  assert.equal(stockBefore - stockAfter, 1, 'Stock must be deducted exactly once for single created order');
});
test('clientOrderId isolation: no other customer order is ever returned', { skip: skipDbTests }, async () => {
  const privateClientId = 'cust-a-secret-' + Date.now();
  const payloadA = { clientOrderId: privateClientId, items: [{ productId: testProduct._id, qty: 1 }], address: { name: 'Customer A', phone: '9876500000', line1: 'Gate 1', lat: 30.902, lng: 75.858 }, paymentMethod: 'COD' };
  const resA = await req('POST', '/orders', customer, 'CUSTOMER', payloadA);
  assert.equal(resA.status, 201);
  const orderAId = resA.body.order._id;
  const spoofAttempt = await req('POST', '/orders', other, 'CUSTOMER', { ...payloadA, customerId: String(customer._id) });
  assert.equal(spoofAttempt.status, 403);
  const directRead = await req('GET', '/orders/' + orderAId, other, 'CUSTOMER');
  assert.equal(directRead.status, 403);
  const payloadB = { clientOrderId: privateClientId, items: [{ productId: testProduct._id, qty: 1 }], address: { name: 'Customer B', phone: '9876500001', line1: 'Gate 2', lat: 30.902, lng: 75.858 }, paymentMethod: 'COD' };
  const resB = await req('POST', '/orders', other, 'CUSTOMER', payloadB);
  assert.equal(resB.status, 201);
  assert.notEqual(resB.body.order._id, orderAId);
  const custB = resB.body.order.customer._id || resB.body.order.customer;
  assert.equal(String(custB), String(other._id));
});
test('Product update input validation: rejects negative or invalid price, negative stock, and wrong types', { skip: skipDbTests }, async () => {
  const invalidPriceNegative = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { price: -10 });
  assert.equal(invalidPriceNegative.status, 400);
  assert.equal(invalidPriceNegative.body.code, 'INVALID_PRICE');

  const invalidPriceNaN = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { price: 'not-a-number' });
  assert.equal(invalidPriceNaN.status, 400);
  assert.equal(invalidPriceNaN.body.code, 'INVALID_PRICE');

  const invalidPriceNull = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { price: null });
  assert.equal(invalidPriceNull.status, 400);
  assert.equal(invalidPriceNull.body.code, 'INVALID_PRICE');

  const invalidPriceBool = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { price: false });
  assert.equal(invalidPriceBool.status, 400);
  assert.equal(invalidPriceBool.body.code, 'INVALID_PRICE');

  const invalidPriceEmpty = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { price: '' });
  assert.equal(invalidPriceEmpty.status, 400);
  assert.equal(invalidPriceEmpty.body.code, 'INVALID_PRICE');

  const invalidPriceWhitespace = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { price: '   ' });
  assert.equal(invalidPriceWhitespace.status, 400);
  assert.equal(invalidPriceWhitespace.body.code, 'INVALID_PRICE');

  const invalidStockNegative = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { stockQty: -5 });
  assert.equal(invalidStockNegative.status, 400);
  assert.equal(invalidStockNegative.body.code, 'INVALID_STOCK');

  const invalidStockDecimal = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { stockQty: 4.5 });
  assert.equal(invalidStockDecimal.status, 400);
  assert.equal(invalidStockDecimal.body.code, 'INVALID_STOCK');

  const invalidStockNull = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { stockQty: null });
  assert.equal(invalidStockNull.status, 400);
  assert.equal(invalidStockNull.body.code, 'INVALID_STOCK');

  const invalidStockBool = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { stockQty: false });
  assert.equal(invalidStockBool.status, 400);
  assert.equal(invalidStockBool.body.code, 'INVALID_STOCK');

  const invalidStockEmpty = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { stockQty: '' });
  assert.equal(invalidStockEmpty.status, 400);
  assert.equal(invalidStockEmpty.body.code, 'INVALID_STOCK');

  const invalidMrpNegative = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { mrp: -1 });
  assert.equal(invalidMrpNegative.status, 400);
  assert.equal(invalidMrpNegative.body.code, 'INVALID_MRP');

  const invalidMrpNull = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { mrp: null });
  assert.equal(invalidMrpNull.status, 400);
  assert.equal(invalidMrpNull.body.code, 'INVALID_MRP');

  const invalidMrpBool = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { mrp: false });
  assert.equal(invalidMrpBool.status, 400);
  assert.equal(invalidMrpBool.body.code, 'INVALID_MRP');

  const invalidMrpEmpty = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { mrp: '' });
  assert.equal(invalidMrpEmpty.status, 400);
  assert.equal(invalidMrpEmpty.body.code, 'INVALID_MRP');

  const invalidImageNonString = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { image: 12345 });
  assert.equal(invalidImageNonString.status, 400);
  assert.equal(invalidImageNonString.body.code, 'INVALID_IMAGE');
  assert.equal(invalidImageNonString.body.message, 'Product image must be a string.');

  const invalidImageNull = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { image: null });
  assert.equal(invalidImageNull.status, 400);
  assert.equal(invalidImageNull.body.code, 'INVALID_IMAGE');

  const invalidImageBool = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { image: true });
  assert.equal(invalidImageBool.status, 400);
  assert.equal(invalidImageBool.body.code, 'INVALID_IMAGE');

  const invalidBoolean = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { inStock: 'yes' });
  assert.equal(invalidBoolean.status, 400);
  assert.equal(invalidBoolean.body.code, 'INVALID_BOOLEAN');

  const invalidTags = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', { tags: 'not-an-array' });
  assert.equal(invalidTags.status, 400);
  assert.equal(invalidTags.body.code, 'INVALID_TAGS');

  const validUpdate = await req('PUT', '/products/' + testProduct._id, vendor, 'VENDOR', {
    name: 'Updated Crisp Apple',
    image: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6',
    price: 120,
    mrp: 150,
    stockQty: 80,
    inStock: true,
    isVeg: true,
    tags: ['fresh', 'apple', 'local']
  });
  assert.equal(validUpdate.status, 200);
  assert.equal(validUpdate.body.product.name, 'Updated Crisp Apple');
  assert.equal(validUpdate.body.product.image, 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6');
  assert.equal(validUpdate.body.product.price, 120);
  assert.equal(validUpdate.body.product.mrp, 150);
  assert.equal(validUpdate.body.product.stockQty, 80);
  assert.equal(validUpdate.body.product.inStock, true);
});
