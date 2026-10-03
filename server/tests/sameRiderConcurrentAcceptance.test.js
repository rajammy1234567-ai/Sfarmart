// server/tests/sameRiderConcurrentAcceptance.test.js
// Focused E2E integration test: Simultaneous acceptance of an active delivery offer
// by the SAME eligible rider through the real authenticated API.
//
// Key Assertions:
// 1. Two concurrent authenticated HTTP requests from the same rider.
// 2. Exact API contract verified: at least one HTTP 200, any secondary response is idempotent 200 or clean 400, 0 HTTP 500s.
// 3. Database invariants: exactly ONE assignment event in statusHistory, rider assigned correctly, rider status ON_DELIVERY.
// 4. Staging guards: host/db pinning, autoIndex:false, autoCreate:false.
// 5. Strict teardown: tracking clientOrderId before checkout, ID-specific deletion only, 0 data pollution.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { io as client } from 'socket.io-client';

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

// Dedicated isolated tracker for this test suite
const fixtureIds = createFixtureTracker();

let customerToken, vendorToken, riderToken;
let fixtureCustomer, fixtureVendor, fixtureRider, fixtureCategory, fixtureProduct;

const isLiveStagingOptIn = process.env.ALLOW_LIVE_STAGING_TEST === 'true' || process.env.ALLOW_STAGING_ATLAS_TEST === 'true';

if (!isLiveStagingOptIn) {
  test('Offline Guard: Same-rider concurrent acceptance test blocked without explicit opt-in (0 connects, 0 writes)', () => {
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
  // Guarantee teardown even if setup or assertion fails globally
  after(async () => {
    await performTeardown(FIXTURE_PREFIX, fixtureIds);
  });

  test('Live Staging: Same-Rider Concurrent Acceptance Test', async (t) => {
    // Guarantee teardown on suite termination
    t.after(async () => {
      await performTeardown(FIXTURE_PREFIX, fixtureIds);
    });

    // Guard check: strictly validated before any DB connection or write
    const guardConfig = validateLiveStagingGuards(process.env);

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

    // Pre-flight check on API server health
    await verifyTargetApiStagingEnvironment(API_BASE);

    // 1. Setup disposable staging fixtures
    await t.test('Step 0: Setup disposable staging fixtures with DB/API parity check', async () => {
      try {
        const randomSuffix1 = Math.floor(1000000 + Math.random() * 9000000);
        const randomSuffix2 = Math.floor(1000000 + Math.random() * 9000000);
        const randomSuffix3 = Math.floor(1000000 + Math.random() * 9000000);

        // Create Category fixture
        fixtureCategory = await Category.create({
          name: `${FIXTURE_PREFIX}_Conc_Category`,
          nameNormalized: `${FIXTURE_PREFIX}_conc_category`.toLowerCase(),
          slug: `${FIXTURE_PREFIX.toLowerCase()}-conc-cat`,
          type: 'GROCERY',
          icon: '🛵',
          sortOrder: 998,
          isActive: true,
          homeVisibility: false,
          isStagingFixture: true,
          fixtureRunId: FIXTURE_PREFIX,
          subCategories: [
            { name: 'Fresh Fruits', slug: 'fresh-fruits' }
          ]
        });
        fixtureIds.categories.add(fixtureCategory._id.toString());

        // Verify API/database parity before order creation
        await verifyTargetApiStagingEnvironment(API_BASE, {
          categorySlug: fixtureCategory.slug,
          categoryId: fixtureCategory._id.toString()
        });

        // Create Customer
        fixtureCustomer = await User.create({
          name: `${FIXTURE_PREFIX}_Conc_Customer`,
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

        // Create Vendor (Ludhiana Central)
        fixtureVendor = await Vendor.create({
          storeName: `${FIXTURE_PREFIX}_Conc_Store`,
          ownerName: `${FIXTURE_PREFIX}_Conc_Owner`,
          phone: `982${randomSuffix2}`,
          passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhash',
          isOpen: true,
          minOrderValue: 50,
          storeType: 'KIRANA',
          address: {
            line1: '123 Concurrency Way',
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

        // Create Eligible Rider (ONLINE_IDLE, 500m from store, fresh location)
        fixtureRider = await Rider.create({
          name: `${FIXTURE_PREFIX}_Conc_Rider`,
          phone: `983${randomSuffix3}`,
          passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhash',
          status: 'ONLINE_IDLE',
          activeOrderId: null,
          currentLocation: {
            type: 'Point',
            coordinates: [75.858000, 30.901500]
          },
          locationUpdatedAt: new Date()
        });
        fixtureIds.riders.add(fixtureRider._id.toString());
        riderToken = signToken({
          sub: fixtureRider._id.toString(),
          id: fixtureRider._id.toString(),
          riderId: fixtureRider._id.toString(),
          role: 'RIDER',
          phone: fixtureRider.phone
        });

        // Create Product
        fixtureProduct = await Product.create({
          name: `${FIXTURE_PREFIX}_Conc_Apples`,
          vendor: fixtureVendor._id,
          category: fixtureCategory._id,
          subCategory: 'fresh-fruits',
          price: 60,
          mrp: 80,
          unit: '1 kg',
          stockQty: 20,
          inStock: true
        });
        fixtureIds.products.add(fixtureProduct._id.toString());

        assert.ok(fixtureCustomer && fixtureVendor && fixtureRider && fixtureCategory && fixtureProduct);
      } catch (err) {
        console.error('❌ Step 0 failure:', sanitizeErrorMessage(err.message));
        throw err;
      }
    });

    let createdOrder = null;
    const clientOrderId = `${FIXTURE_PREFIX}_CONC_CID_${Date.now()}`;

    // 2. Pre-order tracking and Checkout
    await t.test('Step 1: Track clientOrderId and place order via customer checkout', async () => {
      // Track clientOrderId before checkout so cleanup recovers a lost response
      fixtureIds.clientOrderIds.add(clientOrderId);

      const payload = {
        clientOrderId,
        vendorId: fixtureVendor._id.toString(),
        items: [{ productId: fixtureProduct._id.toString(), qty: 1 }],
        address: {
          name: 'Recipient Concurrency',
          phone: fixtureCustomer.phone,
          line1: 'House 99, Civil Lines',
          city: 'Ludhiana',
          lat: 30.9050,
          lng: 75.8600
        },
        paymentMethod: 'COD'
      };

      const res = await apiCall('POST', '/orders', payload, customerToken);
      assert.equal(res.status, 201, `Order placement failed: HTTP ${res.status} (code: ${res.data?.code || 'N/A'}) - ${JSON.stringify(res.data)}`);
      assert.ok(res.data?.order?._id, `Order ID missing in response (HTTP ${res.status})`);
      createdOrder = res.data.order;
      fixtureIds.orders.add(createdOrder._id.toString());
      assert.equal(createdOrder.status, 'NEW_ORDER');
    });

    // 3. Preparation Transitions
    await t.test('Step 2: Partner acceptance and transition to READY_FOR_RIDER', async () => {
      const orderId = createdOrder._id.toString();

      // 2a. Vendor Accepts Order
      const resAccept = await apiCall('PATCH', `/orders/${orderId}/status`, { status: 'ACCEPTED' }, vendorToken);
      assert.equal(resAccept.status, 200, `Vendor accept failed: HTTP ${resAccept.status} - ${JSON.stringify(resAccept.data)}`);
      assert.ok(resAccept.data?.order, `Accept response missing order (HTTP ${resAccept.status})`);
      assert.equal(resAccept.data.order.status, 'ACCEPTED');

      // 2b. Vendor starts Kitchen Preparation
      const resPrep = await apiCall('PATCH', `/orders/${orderId}/status`, { status: 'PREPARING' }, vendorToken);
      assert.equal(resPrep.status, 200, `Vendor prep failed: HTTP ${resPrep.status} - ${JSON.stringify(resPrep.data)}`);
      assert.ok(resPrep.data?.order, `Prep response missing order (HTTP ${resPrep.status})`);
      assert.equal(resPrep.data.order.status, 'PREPARING');

      // Ensure fixture rider has fresh location so auto-dispatch targets this rider
      await Rider.findByIdAndUpdate(fixtureRider._id, {
        status: 'ONLINE_IDLE',
        activeOrderId: null,
        locationUpdatedAt: new Date(),
        currentLocation: { type: 'Point', coordinates: [75.8575, 30.9010] }
      });

      // 2c. Vendor marks Ready for Rider (triggers auto-dispatch)
      const resReady = await apiCall('PATCH', `/orders/${orderId}/status`, { status: 'READY_FOR_RIDER' }, vendorToken);
      assert.equal(resReady.status, 200, `Vendor ready failed: HTTP ${resReady.status} - ${JSON.stringify(resReady.data)}`);
      assert.ok(resReady.data?.order, `Ready response missing order (HTTP ${resReady.status})`);
      assert.equal(resReady.data.order.status, 'READY_FOR_RIDER');
    });

    // 4. Automatic Dispatch Offer Verification
    await t.test('Step 3: Verify auto-dispatched active offer targeted to eligible rider', async () => {
      const orderId = createdOrder._id.toString();

      const orderWithOffer = await waitForAutoDispatchedOffer(orderId, fixtureRider._id.toString(), 10000, 250);
      assert.ok(orderWithOffer.currentOffer?.rider, 'Auto-dispatched offer must carry candidate rider');
      assert.equal(
        orderWithOffer.currentOffer.rider.toString(),
        fixtureRider._id.toString(),
        'Auto-dispatched offer must target the eligible fixture rider'
      );
      assert.ok(orderWithOffer.currentOffer.offerId, 'Auto-dispatched offer must carry unique offerId');
      assert.ok(orderWithOffer.currentOffer.expiresAt, 'Auto-dispatched offer must carry expiration timestamp');
      assert.ok(
        new Date(orderWithOffer.currentOffer.expiresAt).getTime() > Date.now(),
        'Auto-dispatched offer must not be expired'
      );
    });

    // 5. Simultaneous Acceptance by the SAME Rider & DB Invariants
    // 5. Simultaneous Acceptance by the SAME Rider & DB Invariants
    await t.test('Step 4: Send simultaneous acceptance requests from SAME rider and verify response contract, socket suppression & DB invariants', async (stepContext) => {
      const orderId = createdOrder._id.toString();

      // Connect socket to monitor real-time event emissions during concurrent acceptance
      const socketUrl = API_BASE.replace(/\/api$/, '');
      const socketClient = client(socketUrl, {
        auth: { token: customerToken },
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000
      });

      // Register unconditional socket cleanup
      stepContext.after(() => {
        if (socketClient.connected) {
          socketClient.disconnect();
        }
      });

      // Bounded connection wait; fail closed on connect_error or timeout
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('FAIL-CLOSED: Socket connection timed out after 5000ms'));
        }, 5000);
        socketClient.on('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        socketClient.on('connect_error', (err) => {
          clearTimeout(timer);
          reject(new Error(`FAIL-CLOSED: Socket connect_error: ${err.message}`));
        });
      });

      // Verify authorized room readiness before sending acceptance
      const joinAck = await socketClient.timeout(5000).emitWithAck('join:order', orderId);
      assert.equal(joinAck.ok, true, 'Customer socket must successfully join authorized order room');

      // Register listeners before acceptance and filter both event types by exact fixture order ID
      const receivedStatusEvents = [];
      const receivedRiderAssignedEvents = [];

      socketClient.on('order:status', (payload) => {
        const eventOrderId = (payload?.orderId || payload?.order?._id || payload?.order)?.toString();
        if (eventOrderId === orderId && payload?.status === 'RIDER_ASSIGNED') {
          receivedStatusEvents.push(payload);
        }
      });

      socketClient.on('order:rider_assigned', (payload) => {
        const eventOrderId = (payload?.orderId || payload?.order?._id || payload?.order)?.toString();
        if (eventOrderId === orderId) {
          receivedRiderAssignedEvents.push(payload);
        }
      });

      // Fire two simultaneous authenticated accept requests from the exact same rider
      const [resA, resB] = await Promise.all([
        apiCall('POST', `/rider/orders/${orderId}/accept`, {}, riderToken),
        apiCall('POST', `/rider/orders/${orderId}/accept`, {}, riderToken)
      ]);

      // Allow bounded window (500ms) for socket broadcasts to be received
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Assert event counts unconditionally BEFORE disconnecting
      // Documented Room-Delivery Contract:
      // The customer socket is subscribed to both customer:${customerId} and order:${orderId}.
      // A single logical assignment invocation emits to both rooms, delivering exactly 2 events.
      // (If duplicate acceptance had executed its side effects, 4 events would have been received).
      assert.equal(
        receivedStatusEvents.length,
        2,
        `Documented room contract: expected exactly 2 order:status (RIDER_ASSIGNED) events across dual rooms (order + customer) for 1 logical assignment, received ${receivedStatusEvents.length}`
      );
      assert.equal(
        receivedRiderAssignedEvents.length,
        2,
        `Documented room contract: expected exactly 2 order:rider_assigned events across dual rooms (order + customer) for 1 logical assignment, received ${receivedRiderAssignedEvents.length}`
      );

      // Disconnect socket now that assertions have completed
      socketClient.disconnect();

      // Assert neither request experienced an internal server error
      assert.notEqual(resA.status, 500, `Request A failed with 500: ${JSON.stringify(resA.data)}`);
      assert.notEqual(resB.status, 500, `Request B failed with 500: ${JSON.stringify(resB.data)}`);

      // Both requests must return status in [200, 400]
      assert.ok([200, 400].includes(resA.status), `Request A returned unexpected status ${resA.status}`);
      assert.ok([200, 400].includes(resB.status), `Request B returned unexpected status ${resB.status}`);

      // At least one request must be the primary winner (isDuplicate === false)
      const responses = [resA, resB];
      const primaryResponse = responses.find((r) => r.status === 200 && r.data?.isDuplicate === false);
      assert.ok(primaryResponse, `Expected at least one primary acceptance response with isDuplicate: false (A=${resA.status}, B=${resB.status})`);
      assert.equal(primaryResponse.data.success, true);
      assert.equal(primaryResponse.data.message, 'Order accepted successfully! Proceed to store for pickup.');
      assert.ok(primaryResponse.data.order, 'Primary response must include order');
      assert.equal(primaryResponse.data.order.status, 'RIDER_ASSIGNED');
      assert.equal(
        (primaryResponse.data.order.rider?._id || primaryResponse.data.order.rider).toString(),
        fixtureRider._id.toString()
      );

      // Exact response contract for the secondary request
      const secondaryResponse = responses.find((r) => r !== primaryResponse);
      assert.ok(secondaryResponse, 'Expected secondary request response');
      if (secondaryResponse.status === 200) {
        assert.equal(secondaryResponse.data.success, true);
        assert.equal(secondaryResponse.data.isDuplicate, true, 'Secondary response must carry isDuplicate: true');
        assert.equal(secondaryResponse.data.message, 'Order already accepted.', 'Secondary response must carry idempotent message');
        assert.ok(secondaryResponse.data.order);
        assert.equal(secondaryResponse.data.order.status, 'RIDER_ASSIGNED');
      } else {
        assert.equal(secondaryResponse.status, 400);
        assert.equal(secondaryResponse.data.success, false);
      }

      // Database Invariants Verification
      const dbOrder = await Order.findById(orderId);
      assert.ok(dbOrder, 'Order must exist in database');
      assert.equal(dbOrder.status, 'RIDER_ASSIGNED', 'Order status must be RIDER_ASSIGNED in database');
      assert.equal(dbOrder.rider?.toString(), fixtureRider._id.toString(), 'Order rider must be assigned to fixture rider');
      assert.equal(dbOrder.riderId?.toString(), fixtureRider._id.toString(), 'Order riderId must match fixture rider');

      // Crucial: Assert EXACTLY ONE RIDER_ASSIGNED event in statusHistory (no duplicate assignment history)
      const assignedHistoryEntries = dbOrder.statusHistory.filter((h) => h.status === 'RIDER_ASSIGNED');
      assert.equal(
        assignedHistoryEntries.length,
        1,
        `Expected exactly 1 RIDER_ASSIGNED event in statusHistory, found ${assignedHistoryEntries.length}`
      );
      assert.equal(assignedHistoryEntries[0].by, 'RIDER', 'History entry author must be RIDER');

      // Rider State Invariants Verification
      const dbRider = await Rider.findById(fixtureRider._id);
      assert.ok(dbRider, 'Rider must exist in database');
      assert.equal(dbRider.status, 'ON_DELIVERY', 'Rider status must transition to ON_DELIVERY');
      assert.equal(
        dbRider.activeOrderId?.toString(),
        orderId,
        'Rider activeOrderId must point to the accepted order'
      );
    });
  });
}
