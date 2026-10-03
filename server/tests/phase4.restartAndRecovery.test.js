// phase4.restartAndRecovery.test.js
// ------------------------------------------------------------
// Phase 4 focused tests (run with `node --test`)
//   1️⃣ Backend restart – offer expiry & redispatch recovery
//   2️⃣ Simultaneous duplicate acceptance by the SAME rider
//   3️⃣ Durable push‑receipt survival across restart
// ------------------------------------------------------------

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createFixtureIds } from '../tests/fixtureIdsHelper.js'; // helper for disposable fixtures
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { handleRiderAccept } from '../services/riderAccept.js';
import { recoverPendingPushReceipts } from '../services/notify.js';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Rider from '../models/Rider.js';
import PushReceipt from '../models/PushReceipt.js';

const t = test; // alias for Node test runner global

// Global container for tracking IDs of disposable fixtures created during the Phase 4 tests
const globalCreatedIds = {
  orders: new Set(),
  riders: new Set(),
  products: new Set(),
  vendors: new Set(),
  users: new Set()
};

await t('1. Backend restart: offer expiry & redispatch recovery', async () => {
  // --- Setup fixtures (order with expiring offer) ---
  const { cust, vendor, product, rider, createdFixtureIds } = await createFixtureIds();

  const expiringOrder = await Order.create({
    orderNumber: `ORD-EXP-${Date.now()}`,
    customer: cust._id,
    vendor: vendor._id,
    items: [{ product: product._id, name: 'Apple', price: 80, qty: 1, lineTotal: 80 }],
    pricing: { itemsTotal: 80, deliveryFee: 0, taxes: 0, discount: 0, grandTotal: 80 },
    payment: { method: 'COD', status: 'PENDING' },
    address: { name: 'Recipient', phone: cust.phone, line1: 'Street 1', lat: 30.9050, lng: 75.8600 },
    status: 'READY_FOR_RIDER',
    currentOffer: {
      rider: rider._id,
      expiresAt: new Date(Date.now() + 2000), // expires quickly
      offerId: `OFFER_EXP_${Date.now()}`
    }
  });
  createdFixtureIds.orders.add(expiringOrder._id.toString());
// Merge newly created fixture IDs into the global tracker
Object.entries(createdFixtureIds).forEach(([key, set]) => {
  if (globalCreatedIds[key]) {
    for (const id of set) globalCreatedIds[key].add(id);
  }
});

  // --- Spawn isolated backend on a dedicated port ---
  const testPort = 5099;
  const testEnv = { ...process.env, PORT: String(testPort), DISABLE_EXTERNAL_NOTIFICATIONS: 'true' };
  const child = spawn('node', ['server/server.js'], { cwd: path.resolve(__dirname, '../../'), env: testEnv, stdio: 'ignore' });
  const childPid = child.pid;

  // Wait for health endpoint
  const waitForHealth = async () => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      try {
        const resp = await fetch(`http://localhost:${testPort}/api/health`);
        if (resp.ok) return true;
      } catch { }
      await new Promise(r => setTimeout(r, 250));
    }
    return false;
  };
  assert.ok(await waitForHealth(), 'Backend must become healthy before restart test');

  // Simulate crash by killing the process
  process.kill(childPid, 'SIGTERM');
  await new Promise(r => setTimeout(r, 500));

  // Restart backend on same port
  const child2 = spawn('node', ['server/server.js'], { cwd: path.resolve(__dirname, '../../'), env: testEnv, stdio: 'ignore' });
  const child2Pid = child2.pid;
  assert.notEqual(childPid, child2Pid, 'PID must change after restart');
  assert.ok(await waitForHealth(), 'Restarted backend must become healthy');

  // Verify order state after restart – expired offer should be cleared
  const refreshedOrder = await Order.findById(expiringOrder._id);
  assert.ok(!refreshedOrder.currentOffer, 'Expired offer should be cleared after restart');
  assert.equal(refreshedOrder.status, 'READY_FOR_RIDER', 'Order should remain ready for rider after expiry');

  // ------------------------------------------------------------
  // Redispatch verification (optional)
  // The system may create a new offer after the previous one expires.
  // Poll for a new currentOffer for up to 5 seconds.
  let newOffer = null;
  const pollEnd = Date.now() + 5000;
  while (Date.now() < pollEnd && !newOffer) {
    const refreshed = await Order.findById(expiringOrder._id);
    if (refreshed.currentOffer) newOffer = refreshed.currentOffer;
    else await new Promise(r => setTimeout(r, 250));
  }
  // If a new offer exists, it should be assigned to a different rider.
  if (newOffer) {
    assert.notDeepStrictEqual(newOffer.rider.toString(), rider._id.toString(),
      'Redispatched offer should be assigned to a different rider');
  }


  // Cleanup
  child2.kill('SIGTERM');
});

await t('2. Simultaneous duplicate acceptance by SAME rider', async () => {
  const { cust, vendor, product, rider, createdFixtureIds } = await createFixtureIds();
// Merge newly created fixture IDs into the global tracker
Object.entries(createdFixtureIds).forEach(([key, set]) => {
  if (globalCreatedIds[key]) {
    for (const id of set) globalCreatedIds[key].add(id);
  }
});

  const sameRiderOrder = await Order.create({
    orderNumber: `ORD-SAME-${Date.now()}`,
    customer: cust._id,
    vendor: vendor._id,
    items: [{ product: product._id, name: 'Apple', price: 80, qty: 1, lineTotal: 80 }],
    pricing: { itemsTotal: 80, deliveryFee: 0, taxes: 0, discount: 0, grandTotal: 80 },
    payment: { method: 'COD', status: 'PENDING' },
    address: { name: 'Recipient', phone: cust.phone, line1: 'Street 1', lat: 30.9050, lng: 75.8600 },
    status: 'READY_FOR_RIDER',
    currentOffer: { rider: rider._id, expiresAt: new Date(Date.now() + 20000), offerId: `OFFER_SAME_${Date.now()}` }
  });
  createdFixtureIds.orders.add(sameRiderOrder._id.toString());

  // Ensure rider is idle before acceptance
  await Rider.findByIdAndUpdate(rider._id, { status: 'ONLINE_IDLE', activeOrderId: null });

  // Fire two concurrent accept calls
  const [acc1, acc2] = await Promise.all([
    handleRiderAccept(sameRiderOrder._id, rider._id),
    handleRiderAccept(sameRiderOrder._id, rider._id)
  ]);

  assert.equal(acc1.success, true, 'First acceptance must succeed');
  assert.equal(acc2.success, true, 'Duplicate concurrent acceptance by SAME rider must be idempotent');

  const updatedOrder = await Order.findById(sameRiderOrder._id);
  assert.equal(updatedOrder.rider.toString(), rider._id.toString(), 'Rider assignment must be recorded');
  assert.equal(updatedOrder.status, 'RIDER_ASSIGNED', 'Order status must reflect assignment');

  const updatedRider = await Rider.findById(rider._id);
  assert.equal(updatedRider.status, 'ON_DELIVERY', 'Rider status must transition to ON_DELIVERY');
  assert.equal(updatedRider.activeOrderId.toString(), sameRiderOrder._id.toString(), 'Rider activeOrderId must be set');
});

await t('3. Durable push receipts surviving restart recovery', async () => {
  const testTicketId = `ticket_durable_restart_${Date.now()}`;
// No new disposable fixtures created in this test; no ID tracking needed here.
  const testToken = 'ExponentPushToken[durable_restart_test_token]';

  // Seed pending PushReceipt as if queued before restart
  const receiptDoc = await PushReceipt.create({
    ticketId: testTicketId,
    token: testToken,
    attempt: 1,
    nextCheckAt: new Date(Date.now() - 10000), // due now
    status: 'PENDING'
  });

  // Mock fetch for Expo receipt verification while keeping external notifications disabled globally
  const origFetch = global.fetch;
  const origDisable = process.env.DISABLE_EXTERNAL_NOTIFICATIONS;
  process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'false'; // temporarily enable for test
  global.fetch = async () => ({
    json: async () => ({ data: { [testTicketId]: { status: 'ok' } } })
  });

  try {
    const recoveredCount = await recoverPendingPushReceipts();
    assert.ok(recoveredCount >= 1, 'Should recover at least one pending receipt');
    const updated = await PushReceipt.findById(receiptDoc._id);
    assert.equal(updated.status, 'COMPLETED', 'PushReceipt must be marked COMPLETED after recovery');
  } finally {
    global.fetch = origFetch;
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = origDisable;
  }
});

import { executeTeardown } from '../utils/testTeardownHelper.js';
import mongoose from 'mongoose';

after(async () => {
  // Perform ID‑specific cleanup using the shared testTeardownHelper.
  await executeTeardown({
    io: null,
    server: null,
    handshakePassed: true,
    mongooseConnection: mongoose.connection,
    trackedIds: globalCreatedIds,
    isStagingMode: true,
    models: { Order, Product, Rider, Vendor, User }
  });
});
