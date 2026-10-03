import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import Rider from '../models/Rider.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import RefreshToken from '../models/RefreshToken.js';
import { checkExpoPushReceipts } from '../services/notify.js';
import { _clearOffersForTest } from '../services/riderAssignmentService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const API_BASE = 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
const FIXTURE_PREFIX = `CONCURRENCY_STAGE_${Date.now()}`;

const createdFixtureIds = {
  users: new Set(),
  vendors: new Set(),
  riders: new Set(),
  products: new Set(),
  orders: new Set(),
  refreshTokens: new Set()
};

const signToken = (payload, expiresIn = '30m') => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

const apiCall = async (method, endpoint, body = null, token = null) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
};

test('Live Staging Real Concurrency, Persisted Offers & Auth Lifecycle Suite', async (t) => {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  let custA, custB, vendor1, rider1, rider2, productLastStock, productMultiStock;
  let tokenCustA, tokenCustB, tokenVendor1, tokenRider1, tokenRider2;

  // Step 0: Setup disposable fixtures
  await t.test('Step 0: Setup disposable staging accounts and inventory', async () => {
    const s1 = Math.floor(1000000 + Math.random() * 9000000);
    const s2 = Math.floor(1000000 + Math.random() * 9000000);
    const s3 = Math.floor(1000000 + Math.random() * 9000000);
    const s4 = Math.floor(1000000 + Math.random() * 9000000);
    const s5 = Math.floor(1000000 + Math.random() * 9000000);

    custA = await User.create({
      name: `${FIXTURE_PREFIX}_CustA`,
      phone: `971${s1}`,
      role: 'CUSTOMER',
      status: 'ACTIVE'
    });
    createdFixtureIds.users.add(custA._id.toString());
    tokenCustA = signToken({ sub: custA._id.toString(), id: custA._id.toString(), role: 'CUSTOMER', phone: custA.phone });

    custB = await User.create({
      name: `${FIXTURE_PREFIX}_CustB`,
      phone: `972${s2}`,
      role: 'CUSTOMER',
      status: 'ACTIVE'
    });
    createdFixtureIds.users.add(custB._id.toString());
    tokenCustB = signToken({ sub: custB._id.toString(), id: custB._id.toString(), role: 'CUSTOMER', phone: custB.phone });

    vendor1 = await Vendor.create({
      storeName: `${FIXTURE_PREFIX}_Store`,
      ownerName: `${FIXTURE_PREFIX}_Owner`,
      phone: `973${s3}`,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhash',
      isOpen: true,
      minOrderValue: 20,
      storeType: 'KIRANA',
      address: {
        line1: 'Mall Road',
        city: 'Ludhiana',
        location: { type: 'Point', coordinates: [75.857276, 30.900965] }
      }
    });
    createdFixtureIds.vendors.add(vendor1._id.toString());
    tokenVendor1 = signToken({ sub: vendor1._id.toString(), id: vendor1._id.toString(), vendorId: vendor1._id.toString(), role: 'VENDOR', phone: vendor1.phone });

    rider1 = await Rider.create({
      name: `${FIXTURE_PREFIX}_Rider1`,
      phone: `974${s4}`,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhash',
      status: 'ONLINE_IDLE',
      currentLocation: { type: 'Point', coordinates: [75.858000, 30.901500] },
      locationUpdatedAt: new Date()
    });
    createdFixtureIds.riders.add(rider1._id.toString());
    tokenRider1 = signToken({ sub: rider1._id.toString(), id: rider1._id.toString(), riderId: rider1._id.toString(), role: 'RIDER', phone: rider1.phone });

    rider2 = await Rider.create({
      name: `${FIXTURE_PREFIX}_Rider2`,
      phone: `975${s5}`,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhash',
      status: 'ONLINE_IDLE',
      currentLocation: { type: 'Point', coordinates: [75.858500, 30.902000] },
      locationUpdatedAt: new Date()
    });
    createdFixtureIds.riders.add(rider2._id.toString());
    tokenRider2 = signToken({ sub: rider2._id.toString(), id: rider2._id.toString(), riderId: rider2._id.toString(), role: 'RIDER', phone: rider2.phone });

    productLastStock = await Product.create({
      name: `${FIXTURE_PREFIX}_LastStockItem`,
      vendor: vendor1._id,
      category: new mongoose.Types.ObjectId('6aaa44d4bba7479a91ad1755'),
      subCategory: 'fresh-fruits',
      price: 100,
      mrp: 120,
      unit: '1 kg',
      stockQty: 1, // EXACTLY 1 IN STOCK
      inStock: true
    });
    createdFixtureIds.products.add(productLastStock._id.toString());

    productMultiStock = await Product.create({
      name: `${FIXTURE_PREFIX}_MultiStockItem`,
      vendor: vendor1._id,
      category: new mongoose.Types.ObjectId('6aaa44d4bba7479a91ad1755'),
      subCategory: 'fresh-fruits',
      price: 50,
      mrp: 60,
      unit: '1 kg',
      stockQty: 20,
      inStock: true
    });
    createdFixtureIds.products.add(productMultiStock._id.toString());

    assert.ok(custA && custB && vendor1 && rider1 && rider2);
  });

  // 1. Two Customers Buy Last Available Stock
  await t.test('1. Concurrency: Two customers compete for last available stock', async () => {
    const makeCheckoutPayload = (cust) => ({
      clientOrderId: `${FIXTURE_PREFIX}_RACE_${cust._id}_${Date.now()}`,
      vendorId: vendor1._id.toString(),
      items: [{ productId: productLastStock._id.toString(), qty: 1 }],
      address: {
        name: cust.name,
        phone: cust.phone,
        line1: 'Race Road 1',
        city: 'Ludhiana',
        lat: 30.9050,
        lng: 75.8600
      },
      paymentMethod: 'COD'
    });

    // Fire concurrent checkout requests simultaneously
    const [resA, resB] = await Promise.all([
      apiCall('POST', '/orders', makeCheckoutPayload(custA), tokenCustA),
      apiCall('POST', '/orders', makeCheckoutPayload(custB), tokenCustB)
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [201, 400], 'Exactly one customer must receive 201 Created and the other 400 Bad Request');

    const winnerRes = resA.status === 201 ? resA : resB;
    const loserRes = resA.status === 400 ? resA : resB;

    assert.equal(winnerRes.data.success, true);
    assert.equal(loserRes.data.code, 'INSUFFICIENT_STOCK');
    createdFixtureIds.orders.add(winnerRes.data.order._id.toString());

    // Assert Database State: Stock is 0, inStock is false, exactly 1 order in DB
    const finalProduct = await Product.findById(productLastStock._id);
    assert.equal(finalProduct.stockQty, 0, 'Final stock must be exactly 0 (no overselling)');
    assert.equal(finalProduct.inStock, false, 'Product must be marked out of stock');

    const ordersCreated = await Order.countDocuments({
      'items.product': productLastStock._id
    });
    assert.equal(ordersCreated, 1, 'Exactly one order must exist in database');
  });

  // 2. Concurrent Retries with Same clientOrderId
  await t.test('2. Concurrency: 5 parallel submissions of the same clientOrderId', async () => {
    const sharedClientOrderId = `${FIXTURE_PREFIX}_PARALLEL_RETRY_1`;
    const payload = {
      clientOrderId: sharedClientOrderId,
      vendorId: vendor1._id.toString(),
      items: [{ productId: productMultiStock._id.toString(), qty: 2 }],
      address: {
        name: custA.name,
        phone: custA.phone,
        line1: 'Parallel St',
        city: 'Ludhiana',
        lat: 30.9050,
        lng: 75.8600
      },
      paymentMethod: 'COD'
    };

    const initialStock = (await Product.findById(productMultiStock._id)).stockQty; // 20

    // Fire 5 identical requests in parallel
    const responses = await Promise.all([
      apiCall('POST', '/orders', payload, tokenCustA),
      apiCall('POST', '/orders', payload, tokenCustA),
      apiCall('POST', '/orders', payload, tokenCustA),
      apiCall('POST', '/orders', payload, tokenCustA),
      apiCall('POST', '/orders', payload, tokenCustA)
    ]);

    // All must be successful (either 201 Created or 200 OK idempotent replay)
    for (const r of responses) {
      assert.ok([200, 201].includes(r.status), `Unexpected status: ${r.status}`);
      assert.equal(r.data.success, true);
    }

    // All must return the exact same order ID
    const returnedOrderIds = new Set(responses.map((r) => r.data.order._id.toString()));
    assert.equal(returnedOrderIds.size, 1, 'All parallel retries must resolve to the identical order ID');
    const orderId = Array.from(returnedOrderIds)[0];
    createdFixtureIds.orders.add(orderId);

    // Database verification: Exactly 1 order doc, stock deducted exactly once (20 - 2 = 18)
    const orderCount = await Order.countDocuments({ clientOrderId: sharedClientOrderId });
    assert.equal(orderCount, 1, 'Database must have strictly 1 order record');

    const updatedStock = (await Product.findById(productMultiStock._id)).stockQty;
    assert.equal(updatedStock, initialStock - 2, 'Stock must only be deducted once despite parallel retries');
  });

  // 3. Two Riders Accept Same Offer Concurrently
  await t.test('3. Concurrency: Two riders concurrently accept the same offer', async () => {
    // Create an order in READY_FOR_RIDER
    const raceOrder = await Order.create({
      orderNumber: `ORD-RACE-${Date.now().toString().slice(-6)}`,
      customer: custA._id,
      vendor: vendor1._id,
      items: [{ product: productMultiStock._id, name: 'Item', price: 50, qty: 1, lineTotal: 50 }],
      pricing: { itemsTotal: 50, deliveryFee: 0, taxes: 0, discount: 0, grandTotal: 50 },
      payment: { method: 'COD', status: 'PENDING' },
      address: { name: 'Recipient', phone: custA.phone, line1: 'Street 1', lat: 30.9050, lng: 75.8600 },
      status: 'READY_FOR_RIDER',
      currentOffer: {
        rider: rider1._id,
        expiresAt: new Date(Date.now() + 20000),
        offerId: `OFFER_${Date.now()}`
      }
    });
    createdFixtureIds.orders.add(raceOrder._id.toString());

    // Both rider 1 and rider 2 try to accept at the exact same instant
    const [resRider1, resRider2] = await Promise.all([
      apiCall('POST', `/rider/orders/${raceOrder._id}/accept`, {}, tokenRider1),
      apiCall('POST', `/rider/orders/${raceOrder._id}/accept`, {}, tokenRider2)
    ]);

    // Rider 1 matches the offer; Rider 2 is not the assigned offer recipient
    assert.equal(resRider1.status, 200, 'Assigned rider must succeed');
    assert.equal(resRider1.data.order.status, 'RIDER_ASSIGNED');

    assert.equal(resRider2.status, 400, 'Unassigned rider must be rejected');
    assert.equal(resRider2.data.code, 'OFFER_REASSIGNED');

    // Database verification: Only rider 1 is assigned, rider 1 is ON_DELIVERY, rider 2 is ONLINE_IDLE
    const finalOrder = await Order.findById(raceOrder._id);
    assert.equal(finalOrder.rider.toString(), rider1._id.toString());

    const r1 = await Rider.findById(rider1._id);
    const r2 = await Rider.findById(rider2._id);
    assert.equal(r1.status, 'ON_DELIVERY');
    assert.equal(r1.activeOrderId.toString(), raceOrder._id.toString());
    assert.equal(r2.status, 'ONLINE_IDLE');
    assert.equal(r2.activeOrderId, null);

    // Reset rider 1 to ONLINE_IDLE
    await Rider.findByIdAndUpdate(rider1._id, { status: 'ONLINE_IDLE', activeOrderId: null });
  });

  // 4. Persisted Authoritative Offer Expiry Across Server Restarts
  await t.test('4. Offer Expiry: Persisted expired offers rejected across restart recovery', async () => {
    // Create an order in READY_FOR_RIDER whose offer expired in DB 5 seconds ago
    const expiredOrder = await Order.create({
      orderNumber: `ORD-EXP-${Date.now().toString().slice(-6)}`,
      customer: custA._id,
      vendor: vendor1._id,
      items: [{ product: productMultiStock._id, name: 'Item', price: 50, qty: 1, lineTotal: 50 }],
      pricing: { itemsTotal: 50, deliveryFee: 0, taxes: 0, discount: 0, grandTotal: 50 },
      payment: { method: 'COD', status: 'PENDING' },
      address: { name: 'Recipient', phone: custA.phone, line1: 'Street 1', lat: 30.9050, lng: 75.8600 },
      status: 'READY_FOR_RIDER',
      currentOffer: {
        rider: rider1._id,
        expiresAt: new Date(Date.now() - 5000), // EXPIRED 5 SECONDS AGO
        offerId: `OFFER_STALE_${Date.now()}`
      }
    });
    createdFixtureIds.orders.add(expiredOrder._id.toString());

    // Clear in-memory maps to simulate fresh process restart
    _clearOffersForTest();

    // Rider 1 tries to accept
    const res = await apiCall('POST', `/rider/orders/${expiredOrder._id}/accept`, {}, tokenRider1);
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'OFFER_EXPIRED');

    // Order must remain unassigned
    const orderInDb = await Order.findById(expiredOrder._id);
    assert.equal(orderInDb.rider, null);
    assert.equal(orderInDb.status, 'READY_FOR_RIDER');
  });

  // 5. Repeated / Concurrent Cancellation Restores Stock Exactly Once
  await t.test('5. Concurrency: Parallel cancellation restores stock only once', async () => {
    const stockBefore = (await Product.findById(productMultiStock._id)).stockQty;

    const cancelOrder = await Order.create({
      orderNumber: `ORD-CNC-${Date.now().toString().slice(-6)}`,
      customer: custA._id,
      vendor: vendor1._id,
      items: [{ product: productMultiStock._id, name: 'Item', price: 50, qty: 3, lineTotal: 150 }],
      pricing: { itemsTotal: 150, deliveryFee: 0, taxes: 0, discount: 0, grandTotal: 150 },
      payment: { method: 'COD', status: 'PENDING' },
      address: { name: 'Recipient', phone: custA.phone, line1: 'Street 1', lat: 30.9050, lng: 75.8600 },
      status: 'NEW_ORDER'
    });
    createdFixtureIds.orders.add(cancelOrder._id.toString());

    // Deduct stock for placement (stockBefore - 3)
    await Product.findByIdAndUpdate(productMultiStock._id, { $inc: { stockQty: -3 } });
    const stockAfterPlaced = (await Product.findById(productMultiStock._id)).stockQty;
    assert.equal(stockAfterPlaced, stockBefore - 3);

    // Fire 3 simultaneous cancellation requests
    const [c1, c2, c3] = await Promise.all([
      apiCall('PATCH', `/orders/${cancelOrder._id}/status`, { status: 'CANCELLED' }, tokenCustA),
      apiCall('PATCH', `/orders/${cancelOrder._id}/status`, { status: 'CANCELLED' }, tokenCustA),
      apiCall('PATCH', `/orders/${cancelOrder._id}/status`, { status: 'CANCELLED' }, tokenCustA)
    ]);

    const cancelStatuses = [c1.status, c2.status, c3.status].sort();
    assert.equal(cancelStatuses[0], 200, 'First cancellation must succeed');
    assert.ok([403, 409].includes(cancelStatuses[1]), `Subsequent cancellation must fail with 403 or 409, got ${cancelStatuses[1]}`);
    assert.ok([403, 409].includes(cancelStatuses[2]), `Subsequent cancellation must fail with 403 or 409, got ${cancelStatuses[2]}`);

    // Database verification: Stock restored by exactly 3 (back to stockBefore)
    const stockAfterCancel = (await Product.findById(productMultiStock._id)).stockQty;
    assert.equal(stockAfterCancel, stockBefore, 'Stock must only be restored once (no double refund/double restock)');
  });

  // 6. Auth Lifecycle: Device Switching & Token Unregistration Races
  await t.test('6. Auth Lifecycle: Device switching, token registration races and authenticated unregister', async () => {
    const testDeviceId = `dev_race_${Date.now()}`;
    const tokenStrA = 'ExponentPushToken[device_token_user_A]';
    const tokenStrB = 'ExponentPushToken[device_token_user_B]';

    // 6a. User A registers device
    const resRegA = await apiCall('POST', '/auth/push-token', {
      token: tokenStrA,
      platform: 'android',
      deviceId: testDeviceId
    }, tokenCustA);
    assert.equal(resRegA.status, 200);

    const userADoc = await User.findById(custA._id);
    assert.ok(userADoc.expoPushTokens.some((t) => t.deviceId === testDeviceId && t.token === tokenStrA));

    // 6b. User B logs in on same device -> User A device association must be revoked
    const resRegB = await apiCall('POST', '/auth/push-token', {
      token: tokenStrB,
      platform: 'android',
      deviceId: testDeviceId
    }, tokenCustB);
    assert.equal(resRegB.status, 200);

    const userADocAfter = await User.findById(custA._id);
    const userBDocAfter = await User.findById(custB._id);
    assert.equal(userADocAfter.expoPushTokens.some((t) => t.deviceId === testDeviceId), false, 'User A must no longer hold this device token');
    assert.equal(userBDocAfter.expoPushTokens.some((t) => t.deviceId === testDeviceId && t.token === tokenStrB), true, 'User B must own the device token');

    // 6c. Authenticated unregister on logout
    const resUnreg = await apiCall('POST', '/auth/push-token/unregister', {
      token: tokenStrB,
      deviceId: testDeviceId
    }, tokenCustB);
    assert.equal(resUnreg.status, 200);

    const userBDocFinal = await User.findById(custB._id);
    assert.equal(userBDocFinal.expoPushTokens.some((t) => t.deviceId === testDeviceId), false, 'Device token must be cleanly pulled upon logout');
  });

  // 7. Session Expiry & Token Refresh
  await t.test('7. Auth Lifecycle: Session expiry and rotating refresh tokens', async () => {
    // 7a. Expired access token rejected
    const expiredToken = signToken({ sub: custA._id.toString(), id: custA._id.toString(), role: 'CUSTOMER' }, '-1s');
    const resExpired = await apiCall('GET', '/orders/customer/my', null, expiredToken);
    assert.equal(resExpired.status, 401);
    assert.equal(resExpired.data.code, 'TOKEN_EXPIRED');

    // 7b. Refresh token rotation
    const rawRefreshToken = 'test_raw_refresh_token_' + Date.now();
    const tokenHash = (await import('crypto')).default.createHash('sha256').update(rawRefreshToken).digest('hex');
    const rtDoc = await RefreshToken.create({
      user: custA._id,
      tokenHash,
      deviceId: 'dev_test',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    createdFixtureIds.refreshTokens.add(rtDoc._id.toString());

    const resRefresh = await apiCall('POST', '/auth/refresh', { refreshToken: rawRefreshToken });
    assert.equal(resRefresh.status, 200);
    assert.ok(resRefresh.data.accessToken, 'Must issue fresh access token');
    assert.ok(resRefresh.data.refreshToken, 'Must issue new rotating refresh token');

    // Old refresh token must be revoked and recorded
    const oldRt = await RefreshToken.findById(rtDoc._id);
    assert.ok(oldRt.revokedAt, 'Old refresh token must be revoked during rotation');
    assert.ok(oldRt.replacedBy, 'Old refresh token must point to replacedBy hash');

    // Attempting to reuse old rotated refresh token must fail with 401 TOKEN_THEFT_DETECTED
    const resReuse = await apiCall('POST', '/auth/refresh', { refreshToken: rawRefreshToken });
    assert.equal(resReuse.status, 401);
    assert.equal(resReuse.data.code, 'TOKEN_THEFT_DETECTED');
  });

  // 8. Push Receipt Handling with Bounded Retries
  await t.test('8. Push Receipt Handling: Bounded retry and missing receipt handling', async () => {
    const originalFetch = global.fetch;
    let pollCount = 0;

    // Simulate Expo push receipt endpoint where receipt is not ready on poll 1, but arrives on poll 2
    global.fetch = async (url) => {
      pollCount++;
      return {
        json: async () => ({
          data: pollCount === 1 ? {} : { 'ticket_pending_1': { status: 'ok' } }
        })
      };
    };

    try {
      const tickets = [{ ticketId: 'ticket_pending_1', token: 'ExponentPushToken[pending_token]' }];
      const result1 = await checkExpoPushReceipts(tickets, { attempt: 1, maxAttempts: 2, retryDelayMs: 100 });
      assert.equal(result1.pendingCount, 1, 'First attempt must record pending receipt');

      const result2 = await checkExpoPushReceipts(tickets, { attempt: 2, maxAttempts: 2, retryDelayMs: 100 });
      assert.equal(result2.pendingCount, 0, 'Second attempt receives completed receipt');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // 9. Surgical Teardown
  await t.test('Step 9: Strict teardown of all concurrency fixtures', async () => {
    const deletedOrders = await Order.deleteMany({ _id: { $in: Array.from(createdFixtureIds.orders) } });
    const deletedProducts = await Product.deleteMany({ _id: { $in: Array.from(createdFixtureIds.products) } });
    const deletedRiders = await Rider.deleteMany({ _id: { $in: Array.from(createdFixtureIds.riders) } });
    const deletedVendors = await Vendor.deleteMany({ _id: { $in: Array.from(createdFixtureIds.vendors) } });
    const deletedUsers = await User.deleteMany({ _id: { $in: Array.from(createdFixtureIds.users) } });
    const deletedTokens = await RefreshToken.deleteMany({ _id: { $in: Array.from(createdFixtureIds.refreshTokens) } });

    console.log(`🧹 [Teardown] Cleanup summary for prefix ${FIXTURE_PREFIX}:`);
    console.log(`   - Orders deleted: ${deletedOrders.deletedCount}`);
    console.log(`   - Products deleted: ${deletedProducts.deletedCount}`);
    console.log(`   - Riders deleted: ${deletedRiders.deletedCount}`);
    console.log(`   - Vendors deleted: ${deletedVendors.deletedCount}`);
    console.log(`   - Users deleted: ${deletedUsers.deletedCount}`);
    console.log(`   - RefreshTokens deleted: ${deletedTokens.deletedCount}`);

    assert.equal(deletedOrders.deletedCount, createdFixtureIds.orders.size);
    assert.equal(deletedProducts.deletedCount, createdFixtureIds.products.size);
    assert.equal(deletedRiders.deletedCount, createdFixtureIds.riders.size);
    assert.equal(deletedVendors.deletedCount, createdFixtureIds.vendors.size);
    assert.equal(deletedUsers.deletedCount, createdFixtureIds.users.size);

    await mongoose.disconnect();
  });
});
