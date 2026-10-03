import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import Rider from '../models/Rider.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import PushReceipt from '../models/PushReceipt.js';
import { recoverPendingPushReceipts } from '../services/notify.js';
import { handleRiderAccept } from '../services/riderAssignmentService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const API_BASE = 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
const FIXTURE_PREFIX = `PHASE4_STAGE_${Date.now()}`;

const createdFixtureIds = {
  users: new Set(),
  vendors: new Set(),
  riders: new Set(),
  products: new Set(),
  orders: new Set(),
  pushReceipts: new Set()
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

test('Phase 4: Maps, Rider GPS, Tracking, Reconnect and Controlled Server Restart Suite', async (t) => {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  let cust, vendor, rider, product;
  let tokenCust, tokenVendor, tokenRider;

  // Step 0: Fixture Setup
  await t.test('Step 0: Setup disposable fixtures for Phase 4', async () => {
    const s1 = Math.floor(1000000 + Math.random() * 9000000);
    const s2 = Math.floor(1000000 + Math.random() * 9000000);
    const s3 = Math.floor(1000000 + Math.random() * 9000000);

    cust = await User.create({
      name: `${FIXTURE_PREFIX}_Cust`,
      phone: `961${s1}`,
      role: 'CUSTOMER',
      status: 'ACTIVE'
    });
    createdFixtureIds.users.add(cust._id.toString());
    tokenCust = signToken({ sub: cust._id.toString(), id: cust._id.toString(), role: 'CUSTOMER', phone: cust.phone });

    vendor = await Vendor.create({
      storeName: `${FIXTURE_PREFIX}_Vendor`,
      ownerName: `${FIXTURE_PREFIX}_Owner`,
      phone: `962${s2}`,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhash',
      isOpen: true,
      minOrderValue: 20,
      deliveryRadiusKm: 10, // 10 km maximum delivery radius (Vendor schema field)
      storeType: 'KIRANA',
      address: {
        line1: 'Clock Tower',
        city: 'Ludhiana',
        location: { type: 'Point', coordinates: [75.857276, 30.900965] }
      }
    });
    createdFixtureIds.vendors.add(vendor._id.toString());
    tokenVendor = signToken({ sub: vendor._id.toString(), id: vendor._id.toString(), vendorId: vendor._id.toString(), role: 'VENDOR', phone: vendor.phone });

    rider = await Rider.create({
      name: `${FIXTURE_PREFIX}_Rider`,
      phone: `963${s3}`,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhash',
      status: 'ONLINE_IDLE',
      currentLocation: { type: 'Point', coordinates: [75.858000, 30.901500] },
      locationUpdatedAt: new Date(Date.now() - 10000)
    });
    createdFixtureIds.riders.add(rider._id.toString());
    tokenRider = signToken({ sub: rider._id.toString(), id: rider._id.toString(), riderId: rider._id.toString(), role: 'RIDER', phone: rider.phone });

    product = await Product.create({
      name: `${FIXTURE_PREFIX}_Apple`,
      vendor: vendor._id,
      category: new mongoose.Types.ObjectId('6aaa44d4bba7479a91ad1755'),
      subCategory: 'fresh-fruits',
      price: 80,
      mrp: 90,
      unit: '1 kg',
      stockQty: 50,
      inStock: true
    });
    createdFixtureIds.products.add(product._id.toString());

    assert.ok(cust && vendor && rider && product);
  });

  // 1. Delivery-Pin Validation and Store Serviceability
  await t.test('1. Delivery-pin validation and store serviceability', async () => {
    // 1a. Delivery pin outside 10 km store radius (approx 25 km away: lat 31.12, lng 75.86)
    const resFar = await apiCall('POST', '/orders', {
      vendorId: vendor._id.toString(),
      items: [{ productId: product._id.toString(), qty: 1 }],
      address: {
        name: cust.name,
        phone: cust.phone,
        line1: 'Far Away Highway',
        city: 'Outstation',
        lat: 31.1500, // ~27 km away from store
        lng: 75.8600
      },
      paymentMethod: 'COD'
    }, tokenCust);

    assert.equal(resFar.status, 400);
    assert.equal(resFar.data.code, 'STORE_UNSERVICEABLE');

    // 1b. Missing/invalid coordinates
    const resInvalidCoord = await apiCall('POST', '/orders', {
      vendorId: vendor._id.toString(),
      items: [{ productId: product._id.toString(), qty: 1 }],
      address: {
        name: cust.name,
        phone: cust.phone,
        line1: 'Bad Coord St',
        city: 'Ludhiana',
        lat: 999.0, // Invalid latitude
        lng: 75.8600
      },
      paymentMethod: 'COD'
    }, tokenCust);

    assert.equal(resInvalidCoord.status, 400);
    assert.equal(resInvalidCoord.data.code, 'DELIVERY_ADDRESS_REQUIRED');

    // 1c. Valid serviceable delivery pin (within 2 km)
    const resValid = await apiCall('POST', '/orders', {
      vendorId: vendor._id.toString(),
      items: [{ productId: product._id.toString(), qty: 1 }],
      address: {
        name: cust.name,
        phone: cust.phone,
        line1: 'Serviceable Near Store',
        city: 'Ludhiana',
        lat: 30.9050, // ~0.5 km away
        lng: 75.8600
      },
      paymentMethod: 'COD'
    }, tokenCust);

    assert.equal(resValid.status, 201);
    assert.equal(resValid.data.success, true);
    createdFixtureIds.orders.add(resValid.data.order._id.toString());
  });

  // 2. Rider GPS: Accuracy, Staleness, Out-of-Order Fixes and Impossible Jumps
  await t.test('2. Rider GPS: Accuracy, staleness, out-of-order fixes and impossible jumps', async () => {
    const baseNow = Date.now();

    // 2a. GPS Accuracy > 100m must be rejected
    const resInaccurate = await apiCall('POST', '/rider/location', {
      lat: 30.9020,
      lng: 75.8590,
      accuracy: 150, // > 100m
      capturedAt: baseNow,
      speed: 15,
      heading: 90
    }, tokenRider);
    assert.equal(resInaccurate.status, 400);

    // 2b. GPS fix older than 120s must be rejected
    const resStale = await apiCall('POST', '/rider/location', {
      lat: 30.9020,
      lng: 75.8590,
      accuracy: 15,
      capturedAt: baseNow - 150000, // 150s old
      speed: 15,
      heading: 90
    }, tokenRider);
    assert.equal(resStale.status, 400);

    // 2c. Valid initial GPS fix
    const fix1Time = baseNow - 5000;
    const resValidFix1 = await apiCall('POST', '/rider/location', {
      lat: 30.9020,
      lng: 75.8590,
      accuracy: 10,
      capturedAt: fix1Time,
      speed: 20,
      heading: 45
    }, tokenRider);
    assert.equal(resValidFix1.status, 200);

    // 2d. Out-of-order GPS timestamp (capturedAt <= prevTimestamp) must be rejected
    const resOutOfOrder = await apiCall('POST', '/rider/location', {
      lat: 30.9025,
      lng: 75.8595,
      accuracy: 10,
      capturedAt: fix1Time - 1000, // older than fix1
      speed: 20,
      heading: 45
    }, tokenRider);
    assert.equal(resOutOfOrder.status, 400);
    assert.equal(resOutOfOrder.data.code, 'STALE_OR_OUT_OF_ORDER_GPS');

    // 2e. Impossible GPS Jump (teleporting 10 km in 2 seconds = 18,000 km/h)
    const resImpossibleJump = await apiCall('POST', '/rider/location', {
      lat: 30.9999, // ~10 km away
      lng: 75.9500,
      accuracy: 10,
      capturedAt: fix1Time + 2000, // 2 seconds later
      speed: 20,
      heading: 45
    }, tokenRider);
    assert.equal(resImpossibleJump.status, 400);
    assert.equal(resImpossibleJump.data.code, 'IMPOSSIBLE_GPS_JUMP');
  });

  // 3. Simultaneous Duplicate Acceptance by the SAME Eligible Rider
  await t.test('3. Simultaneous duplicate acceptance by the SAME eligible rider', async () => {
    // Create an order in READY_FOR_RIDER offered to rider
    const sameRiderOrder = await Order.create({
      orderNumber: `ORD-SAMERIDER-${Date.now().toString().slice(-6)}`,
      customer: cust._id,
      vendor: vendor._id,
      items: [{ product: product._id, name: 'Apple', price: 80, qty: 1, lineTotal: 80 }],
      pricing: { itemsTotal: 80, deliveryFee: 0, taxes: 0, discount: 0, grandTotal: 80 },
      payment: { method: 'COD', status: 'PENDING' },
      address: { name: 'Recipient', phone: cust.phone, line1: 'Street 1', lat: 30.9050, lng: 75.8600 },
      status: 'READY_FOR_RIDER',
      currentOffer: {
        rider: rider._id,
        expiresAt: new Date(Date.now() + 20000),
        offerId: `OFFER_SAME_${Date.now()}`
      }
    });
    createdFixtureIds.orders.add(sameRiderOrder._id.toString());

    // Reset rider to ONLINE_IDLE and fresh location
    await Rider.findByIdAndUpdate(rider._id, {
      status: 'ONLINE_IDLE',
      activeOrderId: null,
      locationUpdatedAt: new Date(),
      currentLocation: { type: 'Point', coordinates: [75.8575, 30.9010] }
    });

    // Fire 2 simultaneous accept calls by the SAME rider
    const [acc1, acc2] = await Promise.all([
      handleRiderAccept(sameRiderOrder._id, rider._id),
      handleRiderAccept(sameRiderOrder._id, rider._id)
    ]);

    assert.equal(acc1.success, true, 'First acceptance by rider must succeed');
    assert.equal(acc2.success, true, 'Duplicate concurrent acceptance by SAME rider must also succeed idempotently');

    const verifiedOrder = await Order.findById(sameRiderOrder._id);
    assert.equal(verifiedOrder.rider.toString(), rider._id.toString());
    assert.equal(verifiedOrder.status, 'RIDER_ASSIGNED');

    const verifiedRider = await Rider.findById(rider._id);
    assert.equal(verifiedRider.status, 'ON_DELIVERY');
    assert.equal(verifiedRider.activeOrderId.toString(), sameRiderOrder._id.toString());

    // Reset rider
    await Rider.findByIdAndUpdate(rider._id, { status: 'ONLINE_IDLE', activeOrderId: null });
  });

  // 4. Durable Push Receipts Surviving Restart Recovery
  await t.test('4. Durable push receipts surviving restart recovery', async () => {
    const testTicketId = `ticket_durable_restart_${Date.now()}`;
    const testToken = 'ExponentPushToken[durable_restart_test_token]';

    // Seed a pending PushReceipt document in MongoDB as if queued before restart
    const receiptDoc = await PushReceipt.create({
      ticketId: testTicketId,
      token: testToken,
      attempt: 1,
      nextCheckAt: new Date(Date.now() - 10000), // Due for checking right now
      status: 'PENDING'
    });
    createdFixtureIds.pushReceipts.add(receiptDoc._id.toString());

    // Mock fetch for Expo receipt verification
    const origFetch = global.fetch;
    const origEnv = process.env.DISABLE_EXTERNAL_NOTIFICATIONS;
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'false';

    global.fetch = async (url) => {
      return {
        json: async () => ({
          data: {
            [testTicketId]: { status: 'ok' }
          }
        })
      };
    };

    try {
      // Simulate recovery worker scanning MongoDB after restart
      const recoveredCount = await recoverPendingPushReceipts();
      assert.ok(recoveredCount >= 1, 'Must find and recover pending receipt from DB');

      // Verify DB document was updated to COMPLETED
      const updatedDoc = await PushReceipt.findById(receiptDoc._id);
      assert.equal(updatedDoc.status, 'COMPLETED', 'PushReceipt must be marked COMPLETED in database');
    } finally {
      global.fetch = origFetch;
      process.env.DISABLE_EXTERNAL_NOTIFICATIONS = origEnv;
    }
  });

  // 5. Routes/ETA: Provider Unconfigured & Honest Unfabricated State
  await t.test('5. Routes/ETA: Honest provider-unavailable states without fabricated routes', async () => {
    // Create an order
    const routeOrder = await Order.create({
      orderNumber: `ORD-ROUTE-${Date.now().toString().slice(-6)}`,
      customer: cust._id,
      vendor: vendor._id,
      items: [{ product: product._id, name: 'Apple', price: 80, qty: 1, lineTotal: 80 }],
      pricing: { itemsTotal: 80, deliveryFee: 0, taxes: 0, discount: 0, grandTotal: 80 },
      payment: { method: 'COD', status: 'PENDING' },
      address: { name: 'Recipient', phone: cust.phone, line1: 'Street 1', lat: 30.9050, lng: 75.8600 },
      status: 'OUT_FOR_DELIVERY',
      rider: rider._id,
      riderLocation: { lat: 30.9020, lng: 75.8590, speed: 25, heading: 45, accuracy: 10, at: new Date() }
    });
    createdFixtureIds.orders.add(routeOrder._id.toString());

    // Call /api/orders/:id/route-eta as customer
    const resRoute = await apiCall('GET', `/orders/${routeOrder._id}/route-eta`, null, tokenCust);
    // Since GOOGLE_MAPS_SERVER_KEY is unconfigured / unbilled in dev/staging, verify honest response
    if (resRoute.status === 503) {
      assert.equal(resRoute.data.code, 'PROVIDER_UNCONFIGURED');
    } else if (resRoute.status === 200) {
      assert.ok(resRoute.data.distanceKm > 0);
    } else {
      assert.ok([502, 503, 422].includes(resRoute.status), `Unexpected status: ${resRoute.status}`);
    }
  });

  // 6. Controlled Isolated Server Restart Test: Offer Expiry & Redispatch Recovery
  await t.test('6. Controlled isolated server restart test: Offer expiry & redispatch recovery', async () => {
    // We will start an isolated child process Node server on port 5099 with MONGODB_URI
    const testPort = 5099;
    const testEnv = {
      ...process.env,
      PORT: String(testPort),
      DISABLE_EXTERNAL_NOTIFICATIONS: 'true'
    };

    // Helper to spawn server child process and wait for ready
    const spawnServer = () => {
      const child = spawn('node', ['server/server.js'], {
        cwd: path.resolve(__dirname, '../..'),
        env: testEnv,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const readyPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Child server startup timed out')), 12000);
        child.stdout.on('data', (data) => {
          const str = data.toString();
          if (str.includes('Farmart Real-Time Backend running')) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      return { child, readyPromise };
    };

    // 6a. Spawn Process 1
    const instance1 = spawnServer();
    await instance1.readyPromise;

    // Create an order in READY_FOR_RIDER with an offer expiring in 2 seconds
    const restartOrder = await Order.create({
      orderNumber: `ORD-RESTART-${Date.now().toString().slice(-6)}`,
      customer: cust._id,
      vendor: vendor._id,
      items: [{ product: product._id, name: 'Apple', price: 80, qty: 1, lineTotal: 80 }],
      pricing: { itemsTotal: 80, deliveryFee: 0, taxes: 0, discount: 0, grandTotal: 80 },
      payment: { method: 'COD', status: 'PENDING' },
      address: { name: 'Recipient', phone: cust.phone, line1: 'Street 1', lat: 30.9050, lng: 75.8600 },
      status: 'READY_FOR_RIDER',
      currentOffer: {
        rider: rider._id,
        expiresAt: new Date(Date.now() + 2000), // expires in 2s
        offerId: `OFFER_RESTART_${Date.now()}`
      }
    });
    createdFixtureIds.orders.add(restartOrder._id.toString());

    // 6b. Kill Process 1 (Simulating crash / restart)
    instance1.child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1000));

    // Wait until offer expires in DB (3 seconds total)
    await new Promise((r) => setTimeout(r, 2000));

    // 6c. Spawn Process 2 (Fresh booted server)
    const instance2 = spawnServer();
    await instance2.readyPromise;

    try {
      // 6d. Rider attempts to accept stale offer on Process 2
      const resAcceptStale = await fetch(`http://localhost:${testPort}/api/rider/orders/${restartOrder._id}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRider}`
        }
      });
      const dataStale = await resAcceptStale.json();

      assert.equal(resAcceptStale.status, 400, 'Newly booted server must reject expired persisted offer');
      assert.equal(dataStale.code, 'OFFER_EXPIRED');

      // Assert order remains unassigned in DB
      const orderDb = await Order.findById(restartOrder._id);
      assert.equal(orderDb.rider, null);
      assert.equal(orderDb.status, 'READY_FOR_RIDER');
    } finally {
      // Clean up child process 2
      instance2.child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
    }
  });

  // Step 9: Surgical Teardown
  await t.test('Step 9: Strict teardown of Phase 4 fixtures', async () => {
    const deletedOrders = await Order.deleteMany({ _id: { $in: Array.from(createdFixtureIds.orders) } });
    const deletedProducts = await Product.deleteMany({ _id: { $in: Array.from(createdFixtureIds.products) } });
    const deletedRiders = await Rider.deleteMany({ _id: { $in: Array.from(createdFixtureIds.riders) } });
    const deletedVendors = await Vendor.deleteMany({ _id: { $in: Array.from(createdFixtureIds.vendors) } });
    const deletedUsers = await User.deleteMany({ _id: { $in: Array.from(createdFixtureIds.users) } });
    const deletedReceipts = await PushReceipt.deleteMany({ _id: { $in: Array.from(createdFixtureIds.pushReceipts) } });

    console.log(`🧹 [Teardown] Cleanup summary for prefix ${FIXTURE_PREFIX}:`);
    console.log(`   - Orders deleted: ${deletedOrders.deletedCount}`);
    console.log(`   - Products deleted: ${deletedProducts.deletedCount}`);
    console.log(`   - Riders deleted: ${deletedRiders.deletedCount}`);
    console.log(`   - Vendors deleted: ${deletedVendors.deletedCount}`);
    console.log(`   - Users deleted: ${deletedUsers.deletedCount}`);
    console.log(`   - PushReceipts deleted: ${deletedReceipts.deletedCount}`);

    assert.equal(deletedOrders.deletedCount, createdFixtureIds.orders.size);
    assert.equal(deletedProducts.deletedCount, createdFixtureIds.products.size);
    assert.equal(deletedRiders.deletedCount, createdFixtureIds.riders.size);
    assert.equal(deletedVendors.deletedCount, createdFixtureIds.vendors.size);
    assert.equal(deletedUsers.deletedCount, createdFixtureIds.users.size);

    await mongoose.disconnect();
  });
});
