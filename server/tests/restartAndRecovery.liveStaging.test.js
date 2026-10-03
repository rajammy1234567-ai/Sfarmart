// server/tests/restartAndRecovery.liveStaging.test.js
// Focused E2E integration test: Real backend process restart and rider-offer recovery.
//
// Key Assertions & Sequence:
// 1. Create disposable order and two eligible disposable riders (Rider 1 closer, Rider 2 candidate #2).
// 2. Obtain real automatically dispatched offer; record persisted offerId, rider, and expiresAt.
// 3. Stop only the isolated backend process (Child 1) and await its actual exit.
// 4. Let the persisted offer expire while the backend is stopped (natural real-time expiration).
// 5. Restart backend (Child 2) with the same staging configuration; record distinct old/new PIDs (pid1 !== pid2).
// 6. Assert automatic startup recovery produces a NEW, unexpired offer for Rider 2 without manually calling dispatch.
// 7. Verify the expired offer cannot be accepted by Rider 1 (HTTP 400 OFFER_EXPIRED / OFFER_REASSIGNED).
// 8. Verify Rider 2 can accept the new offer (HTTP 200, RIDER_ASSIGNED).
// 9. Clean up all run-owned fixtures and spawned processes on every path.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { spawn } from 'node:child_process';
import net from 'node:net';

import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import Rider from '../models/Rider.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Category from '../models/Category.js';
import {
  validateStagingUri,
  APPROVED_STAGING_HOST,
  APPROVED_DATABASE,
  sanitizeErrorMessage
} from '../config/db.js';

import {
  API_BASE,
  JWT_SECRET,
  FIXTURE_PREFIX,
  createFixtureTracker,
  signToken,
  apiCall,
  validateLiveStagingGuards,
  verifyTargetApiStagingEnvironment,
  waitForAutoDispatchedOffer,
  performTeardown
} from './helpers/liveStagingHelpers.js';

import {
  waitForPortClosed,
  isProcessTerminated,
  stopBackend,
  spawnBackend
} from './helpers/processManagementHelper.js';

// Dedicated isolated tracker for this test suite
const fixtureIds = createFixtureTracker();

let customerToken, vendorToken, rider1Token, rider2Token;
let fixtureCustomer, fixtureVendor, fixtureRider1, fixtureRider2, fixtureCategory, fixtureProduct;
let child1Proc = null;
let child2Proc = null;

const targetPort = Number(process.env.PORT) || 6001;

const isLiveStagingOptIn = process.env.ALLOW_LIVE_STAGING_TEST === 'true' || process.env.ALLOW_STAGING_ATLAS_TEST === 'true';

if (!isLiveStagingOptIn) {
  test('Offline Guard: Restart & recovery test blocked without explicit opt-in (0 connects, 0 writes)', () => {
    assert.throws(
      () => validateLiveStagingGuards(process.env),
      /FAIL-CLOSED: Live staging test requires explicit opt-in via ALLOW_LIVE_STAGING_TEST=true\./
    );
  });

  test('Offline Guard: Rejects invalid staging host before connection', () => {
    const invalidHostEnv = {
      ...process.env,
      ALLOW_LIVE_STAGING_TEST: 'true',
      MONGODB_URI: 'mongodb+srv://user:pass@evil-host.mongodb.net/farmart_test_disposable?retryWrites=true&w=majority',
      JWT_ACCESS_SECRET: 'dummy_secret_for_offline_guard_testing_12345678'
    };
    assert.throws(
      () => validateLiveStagingGuards(invalidHostEnv),
      /FAIL-CLOSED: Staging host mismatch/
    );
  });

  test('Offline Guard: Rejects invalid staging database before connection', () => {
    const invalidDbEnv = {
      ...process.env,
      ALLOW_LIVE_STAGING_TEST: 'true',
      MONGODB_URI: `mongodb+srv://user:pass@${APPROVED_STAGING_HOST}/production_db?retryWrites=true&w=majority`,
      JWT_ACCESS_SECRET: 'dummy_secret_for_offline_guard_testing_12345678'
    };
    assert.throws(
      () => validateLiveStagingGuards(invalidDbEnv),
      /FAIL-CLOSED: Staging database mismatch/
    );
  });
} else {
  // Guarantee teardown on global exit
  after(async () => {
    if (child2Proc) {
      try { await stopBackend(child2Proc, targetPort); } catch (e) { console.error('Error stopping child2 in after:', e.message); }
      child2Proc = null;
    }
    if (child1Proc) {
      try { await stopBackend(child1Proc, targetPort); } catch (e) { console.error('Error stopping child1 in after:', e.message); }
      child1Proc = null;
    }
    await performTeardown(FIXTURE_PREFIX, fixtureIds);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test('Live Staging: Backend Restart and Rider-Offer Recovery Test', async (t) => {
    t.after(async () => {
      if (child2Proc) {
        try { await stopBackend(child2Proc, targetPort); } catch (e) { console.error('Error stopping child2 in t.after:', e.message); }
        child2Proc = null;
      }
      if (child1Proc) {
        try { await stopBackend(child1Proc, targetPort); } catch (e) { console.error('Error stopping child1 in t.after:', e.message); }
        child1Proc = null;
      }
      await performTeardown(FIXTURE_PREFIX, fixtureIds);
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    });

    // Guard check: strictly validated before any DB connection or write
    const guardConfig = validateLiveStagingGuards(process.env);
    console.log(`\n📌 [LiveTest] Run-scoped Fixture Prefix: ${FIXTURE_PREFIX}`);

    // Connect to DB with autoIndex: false and autoCreate: false (zero DDL operations)
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(guardConfig.uri, {
        autoIndex: false,
        autoCreate: false,
        dbName: APPROVED_DATABASE
      });
    }

    if (mongoose.connection.name !== APPROVED_DATABASE) {
      await mongoose.disconnect();
      throw new Error(`FAIL-CLOSED: Active database "${mongoose.connection.name}" does not match "${APPROVED_DATABASE}".`);
    }

    // Step 0: Spawn Child Backend 1 with staging-test-only recovery scope
    let pid1 = null;
    await t.test('Step 0: Spawn Child 1 backend on isolated port with recovery scope', async () => {
      child1Proc = await spawnBackend(targetPort, {
        fixturePrefix: FIXTURE_PREFIX,
        orderPrefix: FIXTURE_PREFIX,
        riderPrefix: FIXTURE_PREFIX
      });
      pid1 = child1Proc.pid;
      assert.ok(Number.isInteger(pid1) && pid1 > 0, 'Child 1 PID must be a valid positive integer');
    });

    // Pre-flight check on API server health
    await verifyTargetApiStagingEnvironment(API_BASE);

    // Step 1: Setup disposable staging fixtures (Vendor, Customer, Product, Two Riders)
    await t.test('Step 1: Setup disposable staging fixtures with two eligible riders', async () => {
      const randomSuffix1 = Math.floor(1000000 + Math.random() * 9000000);
      const randomSuffix2 = Math.floor(1000000 + Math.random() * 9000000);
      const randomSuffix3 = Math.floor(1000000 + Math.random() * 9000000);
      const randomSuffix4 = Math.floor(1000000 + Math.random() * 9000000);

      // Create Category fixture
      fixtureCategory = await Category.create({
        name: `${FIXTURE_PREFIX}_Restart_Category`,
        nameNormalized: `${FIXTURE_PREFIX}_restart_category`.toLowerCase(),
        slug: `${FIXTURE_PREFIX.toLowerCase()}-restart-cat`,
        type: 'GROCERY',
        icon: '🛵',
        sortOrder: 999,
        isActive: true,
        homeVisibility: false,
        isStagingFixture: true,
        fixtureRunId: FIXTURE_PREFIX,
        subCategories: [{ name: 'Fresh Fruits', slug: 'fresh-fruits' }]
      });
      fixtureIds.categories.add(fixtureCategory._id.toString());

      // Verify API/database parity before order creation
      await verifyTargetApiStagingEnvironment(API_BASE, {
        categorySlug: fixtureCategory.slug,
        categoryId: fixtureCategory._id.toString()
      });

      // Create Customer
      fixtureCustomer = await User.create({
        name: `${FIXTURE_PREFIX}_Cust`,
        phone: `981${randomSuffix1}`,
        role: 'CUSTOMER',
        status: 'ACTIVE'
      });
      fixtureIds.users.add(fixtureCustomer._id.toString());
      customerToken = signToken({
        sub: fixtureCustomer._id.toString(),
        id: fixtureCustomer._id.toString(),
        role: 'CUSTOMER',
        phone: fixtureCustomer.phone
      });

      // Create Vendor (Ludhiana Central: [75.857276, 30.900965])
      fixtureVendor = await Vendor.create({
        storeName: `${FIXTURE_PREFIX}_Store`,
        ownerName: `${FIXTURE_PREFIX}_Owner`,
        phone: `982${randomSuffix2}`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhash',
        isOpen: true,
        minOrderValue: 50,
        storeType: 'KIRANA',
        address: {
          line1: '123 Recovery Way',
          city: 'Ludhiana',
          location: {
            type: 'Point',
            coordinates: [75.857276, 30.900965]
          }
        }
      });
      fixtureIds.vendors.add(fixtureVendor._id.toString());
      vendorToken = signToken({
        sub: fixtureVendor._id.toString(),
        id: fixtureVendor._id.toString(),
        vendorId: fixtureVendor._id.toString(),
        role: 'VENDOR',
        phone: fixtureVendor.phone
      });

      // Create Rider 1 (Closest to store: ~40m away: [75.857600, 30.901100])
      fixtureRider1 = await Rider.create({
        name: `${FIXTURE_PREFIX}_Rider1`,
        phone: `983${randomSuffix3}`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhash',
        status: 'ONLINE_IDLE',
        activeOrderId: null,
        currentLocation: {
          type: 'Point',
          coordinates: [75.857600, 30.901100]
        },
        locationUpdatedAt: new Date()
      });
      fixtureIds.riders.add(fixtureRider1._id.toString());
      rider1Token = signToken({
        sub: fixtureRider1._id.toString(),
        id: fixtureRider1._id.toString(),
        riderId: fixtureRider1._id.toString(),
        role: 'RIDER',
        phone: fixtureRider1.phone
      });

      // Create Rider 2 (Second closest: ~300m away: [75.860000, 30.902000])
      fixtureRider2 = await Rider.create({
        name: `${FIXTURE_PREFIX}_Rider2`,
        phone: `984${randomSuffix4}`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhash',
        status: 'ONLINE_IDLE',
        activeOrderId: null,
        currentLocation: {
          type: 'Point',
          coordinates: [75.860000, 30.902000]
        },
        locationUpdatedAt: new Date()
      });
      fixtureIds.riders.add(fixtureRider2._id.toString());
      rider2Token = signToken({
        sub: fixtureRider2._id.toString(),
        id: fixtureRider2._id.toString(),
        riderId: fixtureRider2._id.toString(),
        role: 'RIDER',
        phone: fixtureRider2.phone
      });

      // Create Product
      fixtureProduct = await Product.create({
        name: `${FIXTURE_PREFIX}_Apples`,
        vendor: fixtureVendor._id,
        category: fixtureCategory._id,
        subCategory: 'fresh-fruits',
        price: 75,
        mrp: 90,
        unit: '1 kg',
        stockQty: 25,
        inStock: true
      });
      fixtureIds.products.add(fixtureProduct._id.toString());

      assert.ok(fixtureCustomer && fixtureVendor && fixtureRider1 && fixtureRider2 && fixtureProduct);
    });

    let createdOrder = null;
    const clientOrderId = `${FIXTURE_PREFIX}_REC_CID_${Date.now()}`;

    // Step 2: Place order and transition to READY_FOR_RIDER
    await t.test('Step 2: Place order and transition to READY_FOR_RIDER', async () => {
      fixtureIds.clientOrderIds.add(clientOrderId);

      const payload = {
        clientOrderId,
        vendorId: fixtureVendor._id.toString(),
        items: [{ productId: fixtureProduct._id.toString(), qty: 1 }],
        address: {
          name: 'Recipient Recovery',
          phone: fixtureCustomer.phone,
          line1: 'House 101, Civil Lines',
          city: 'Ludhiana',
          lat: 30.9050,
          lng: 75.8600
        },
        paymentMethod: 'COD'
      };

      const res = await apiCall('POST', '/orders', payload, customerToken);
      assert.equal(res.status, 201, `Order placement failed: HTTP ${res.status}`);
      assert.ok(res.data?.order?._id, 'Order ID missing in response');
      createdOrder = res.data.order;
      fixtureIds.orders.add(createdOrder._id.toString());

      const orderId = createdOrder._id.toString();

      // Vendor accepts
      const resAccept = await apiCall('PATCH', `/orders/${orderId}/status`, { status: 'ACCEPTED' }, vendorToken);
      assert.equal(resAccept.status, 200);

      // Vendor preps
      const resPrep = await apiCall('PATCH', `/orders/${orderId}/status`, { status: 'PREPARING' }, vendorToken);
      assert.equal(resPrep.status, 200);

      // Ensure both riders have fresh location updates
      await Rider.findByIdAndUpdate(fixtureRider1._id, {
        status: 'ONLINE_IDLE',
        activeOrderId: null,
        locationUpdatedAt: new Date()
      });
      await Rider.findByIdAndUpdate(fixtureRider2._id, {
        status: 'ONLINE_IDLE',
        activeOrderId: null,
        locationUpdatedAt: new Date()
      });

      // Vendor marks READY_FOR_RIDER (triggers automatic dispatch)
      const resReady = await apiCall('PATCH', `/orders/${orderId}/status`, { status: 'READY_FOR_RIDER' }, vendorToken);
      assert.equal(resReady.status, 200);
      assert.equal(resReady.data?.order?.status, 'READY_FOR_RIDER');
    });

    let originalOffer = null;

    // Step 3: Obtain real automatically dispatched offer for Rider 1
    await t.test('Step 3: Obtain automatically dispatched offer for Rider 1 and record persisted offerId/expiresAt', async () => {
      const orderId = createdOrder._id.toString();

      const orderWithOffer = await waitForAutoDispatchedOffer(orderId, fixtureRider1._id.toString(), 10000, 250);
      assert.ok(orderWithOffer.currentOffer?.rider, 'Offer must carry candidate rider');
      assert.equal(
        orderWithOffer.currentOffer.rider.toString(),
        fixtureRider1._id.toString(),
        'Offer must target the nearest eligible fixture rider (Rider 1)'
      );
      assert.ok(orderWithOffer.currentOffer.offerId, 'Offer must carry persisted offerId');
      assert.ok(orderWithOffer.currentOffer.expiresAt, 'Offer must carry persisted expiresAt');

      originalOffer = {
        offerId: orderWithOffer.currentOffer.offerId,
        rider: orderWithOffer.currentOffer.rider.toString(),
        expiresAt: new Date(orderWithOffer.currentOffer.expiresAt)
      };

      assert.ok(originalOffer.expiresAt.getTime() > Date.now(), 'Persisted offer must not be expired initially');
    });

    let child1ShutdownSuccess = false;

    // Step 4: Stop only the isolated backend process (Child 1) and await actual exit
    await t.test('Step 4: Stop isolated backend process (Child 1) and await actual exit', async () => {
      assert.ok(child1Proc && child1Proc.pid === pid1, 'Child 1 process reference must exist');
      await stopBackend(child1Proc, targetPort);

      // A signal-terminated child may have exitCode=null and signalCode set (e.g. 'SIGTERM').
      // Use observed exit/close plus exitCode OR signalCode to establish termination.
      const hasTerminated = isProcessTerminated(child1Proc);
      assert.ok(
        hasTerminated,
        `Child 1 must be terminated. exitCode: ${child1Proc.exitCode}, signalCode: ${child1Proc.signalCode}, _exited: ${child1Proc._exited}`
      );
      assert.ok(
        child1Proc.exitCode !== null || child1Proc.signalCode !== null,
        `Child 1 must have exitCode or signalCode set (got exitCode: ${child1Proc.exitCode}, signalCode: ${child1Proc.signalCode})`
      );

      child1ShutdownSuccess = true;
      child1Proc = null;
    });

    if (!child1ShutdownSuccess) {
      throw new Error('FAIL-CLOSED: Step 4 prerequisite failed: Child 1 did not stop cleanly. Aborting dependent steps.');
    }

    // Step 5: Let the persisted offer expire while backend is stopped
    await t.test('Step 5: Let persisted offer expire while backend is stopped', async () => {
      const remainingMs = originalOffer.expiresAt.getTime() - Date.now();
      if (remainingMs > 0) {
        // Wait until past the expiration timestamp plus buffer
        await new Promise((resolve) => setTimeout(resolve, remainingMs + 1000));
      }
      assert.ok(Date.now() > originalOffer.expiresAt.getTime(), 'Offer must be genuinely expired in real-time');
    });

    // Step 6: Restart backend (Child 2) with same staging configuration, exact order & rider scopes, and assert distinct PIDs
    let pid2 = null;
    await t.test('Step 6: Restart backend with same staging configuration, exact recovery scope and record distinct PIDs', async () => {
      child2Proc = await spawnBackend(targetPort, {
        fixturePrefix: FIXTURE_PREFIX,
        orderPrefix: FIXTURE_PREFIX,
        riderPrefix: FIXTURE_PREFIX,
        orderIds: [createdOrder._id.toString()],
        riderIds: [fixtureRider1._id.toString(), fixtureRider2._id.toString()]
      });
      pid2 = child2Proc.pid;
      assert.ok(Number.isInteger(pid2) && pid2 > 0, 'Child 2 PID must be a valid positive integer');
      assert.notEqual(pid1, pid2, `Child 1 PID (${pid1}) and Child 2 PID (${pid2}) must be distinct across restart`);
    });

    let recoveredOffer = null;

    // Step 7: Assert automatic recovery produces a NEW, unexpired offer for Rider 2 without manual dispatch
    await t.test('Step 7: Assert automatic recovery produces NEW, unexpired offer for Rider 2 without manual dispatch', async () => {
      const orderId = createdOrder._id.toString();

      // On startup, Child 2 runs recoverPendingDispatches(). Poll order to observe newly dispatched offer for Rider 2.
      const orderWithRecoveredOffer = await waitForAutoDispatchedOffer(orderId, fixtureRider2._id.toString(), 15000, 250);
      assert.ok(orderWithRecoveredOffer.currentOffer?.rider, 'Recovered order must carry candidate rider');
      assert.equal(
        orderWithRecoveredOffer.currentOffer.rider.toString(),
        fixtureRider2._id.toString(),
        'Recovered offer must automatically target the other eligible rider (Rider 2)'
      );
      assert.notEqual(
        orderWithRecoveredOffer.currentOffer.offerId,
        originalOffer.offerId,
        'Recovered offer must have a distinct NEW offerId'
      );
      assert.ok(
        new Date(orderWithRecoveredOffer.currentOffer.expiresAt).getTime() > Date.now(),
        'Recovered offer must carry a future unexpired expiration timestamp'
      );
      assert.equal(orderWithRecoveredOffer.status, 'READY_FOR_RIDER');
      assert.equal(orderWithRecoveredOffer.rider, null);

      recoveredOffer = {
        offerId: orderWithRecoveredOffer.currentOffer.offerId,
        rider: orderWithRecoveredOffer.currentOffer.rider.toString(),
        expiresAt: new Date(orderWithRecoveredOffer.currentOffer.expiresAt)
      };
    });

    // Step 8: Verify the expired offer cannot be accepted by Rider 1
    await t.test('Step 8: Verify expired offer cannot be accepted by Rider 1', async () => {
      const orderId = createdOrder._id.toString();

      const resAcceptRider1 = await apiCall('POST', `/rider/orders/${orderId}/accept`, {}, rider1Token);
      assert.equal(resAcceptRider1.status, 400, `Expired offer acceptance must be rejected with HTTP 400: ${JSON.stringify(resAcceptRider1.data)}`);
      assert.equal(resAcceptRider1.data?.success, false);
      assert.ok(
        ['OFFER_EXPIRED', 'OFFER_REASSIGNED'].includes(resAcceptRider1.data?.code),
        `Rejection code must be OFFER_EXPIRED or OFFER_REASSIGNED, received: ${resAcceptRider1.data?.code}`
      );

      // Verify DB state: order rider remains unassigned to Rider 1
      const dbOrder = await Order.findById(orderId);
      assert.notEqual(String(dbOrder.rider), fixtureRider1._id.toString(), 'Order rider must not be Rider 1');
    });

    // Step 9: Verify Rider 2 CAN accept the recovered offer
    await t.test('Step 9: Verify Rider 2 can accept the newly recovered active offer', async () => {
      const orderId = createdOrder._id.toString();

      const resAcceptRider2 = await apiCall('POST', `/rider/orders/${orderId}/accept`, {}, rider2Token);
      assert.equal(resAcceptRider2.status, 200, `Rider 2 acceptance failed: HTTP ${resAcceptRider2.status} - ${JSON.stringify(resAcceptRider2.data)}`);
      assert.equal(resAcceptRider2.data?.success, true);
      assert.equal(resAcceptRider2.data?.isDuplicate, false);

      // Verify DB invariants
      const finalOrder = await Order.findById(orderId);
      assert.equal(finalOrder.status, 'RIDER_ASSIGNED');
      assert.equal(finalOrder.rider.toString(), fixtureRider2._id.toString());

      const finalRider2 = await Rider.findById(fixtureRider2._id);
      assert.equal(finalRider2.status, 'ON_DELIVERY');
      assert.equal(finalRider2.activeOrderId.toString(), orderId);
    });

    // Step 10: Cleanly stop Child 2 backend process
    await t.test('Step 10: Cleanly stop Child 2 backend process', async () => {
      if (child2Proc) {
        await stopBackend(child2Proc, targetPort);
        assert.ok(isProcessTerminated(child2Proc), 'Child 2 must be terminated');
        child2Proc = null;
      }
    });
  });
}
