// server/tests/restartRecovery.offline.test.js
// Focused offline test suite for restart recovery of pending rider offers:
// 1. Verifies recoverPendingDispatches identifies orders in READY_FOR_RIDER whose offer expired while offline.
// 2. Verifies old offer is invalidated in DB and offerToNextRider is called with the previous rider excluded.
// 3. Verifies expired offer cannot be accepted by the old candidate rider.

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import Order from '../models/Order.js';
import Rider from '../models/Rider.js';
import { recoverPendingDispatches, handleRiderAccept, getStagingRecoveryScope } from '../services/riderAssignmentService.js';

test('Restart Recovery Offline Suite: Offer Expiry & Redispatch Recovery', async (t) => {
  const origFind = Order.find;
  const origFindById = Order.findById;
  const origFindByIdAndUpdate = Order.findByIdAndUpdate;
  const origFindOne = Order.findOne;
  const origRiderFind = Rider.find;
  const origRiderFindOne = Rider.findOne;

  t.afterEach(() => {
    Order.find = origFind;
    Order.findById = origFindById;
    Order.findByIdAndUpdate = origFindByIdAndUpdate;
    Order.findOne = origFindOne;
    Rider.find = origRiderFind;
    Rider.findOne = origRiderFindOne;
  });

  await t.test('1. recoverPendingDispatches recovers expired offer and dispatches new offer to next eligible rider', async () => {
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';

    const orderId = new mongoose.Types.ObjectId().toString();
    const rider1Id = new mongoose.Types.ObjectId().toString();
    const rider2Id = new mongoose.Types.ObjectId().toString();
    const vendorId = new mongoose.Types.ObjectId().toString();

    // Stored order document with an offer that expired 5 seconds ago
    let orderDoc = {
      _id: orderId,
      orderNumber: 'ORD-RESTART-001',
      status: 'READY_FOR_RIDER',
      rider: null,
      vendor: {
        _id: vendorId,
        storeName: 'Fresh Mart',
        address: { location: { coordinates: [75.857, 30.901] } }
      },
      customer: { _id: new mongoose.Types.ObjectId().toString(), name: 'Cust' },
      currentOffer: {
        rider: rider1Id,
        expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
        offerId: `OFFER_OLD_${orderId}_${rider1Id}`
      }
    };

    // Database updates log
    const updateOps = [];

    Order.find = (query) => ({
      populate() {
        if (query.status === 'READY_FOR_RIDER' && query.rider === null) {
          return Promise.resolve([orderDoc]);
        }
        return Promise.resolve([]);
      }
    });

    Order.findById = (id) => ({
      populate() {
        return Promise.resolve(orderDoc);
      },
      select() {
        return Promise.resolve(orderDoc);
      }
    });

    Order.findByIdAndUpdate = (id, update) => {
      updateOps.push({ id, update });
      if (update.$set) {
        if (update.$set['currentOffer.rider']) {
          orderDoc.currentOffer.rider = update.$set['currentOffer.rider'];
          orderDoc.currentOffer.offerId = update.$set['currentOffer.offerId'];
          orderDoc.currentOffer.expiresAt = update.$set['currentOffer.expiresAt'];
        }
      }
      return Promise.resolve(orderDoc);
    };

    // Rider 2 is the next idle rider within 8km
    Rider.find = (query) => {
      const excludedIds = (query._id?.$nin || []).map(String);
      assert.ok(excludedIds.includes(rider1Id), 'Rider 1 must be excluded from candidate selection');

      return {
        limit(n) {
          return Promise.resolve([
            {
              _id: rider2Id,
              name: 'Rider Two',
              phone: '9876543212',
              status: 'ONLINE_IDLE',
              currentLocation: { coordinates: [75.858, 30.902] }
            }
          ]);
        }
      };
    };
    Rider.findOne = () => ({
      select() {
        return Promise.resolve({ expoPushTokens: [] });
      }
    });

    // Run recovery
    await recoverPendingDispatches();

    // Verify Rider 2 received a brand new offer
    assert.equal(orderDoc.currentOffer.rider.toString(), rider2Id, 'New offer must target Rider 2');
    assert.notEqual(orderDoc.currentOffer.offerId, `OFFER_OLD_${orderId}_${rider1Id}`, 'Offer ID must be new');
    assert.ok(
      new Date(orderDoc.currentOffer.expiresAt).getTime() > Date.now(),
      'New offer expiration must be in the future'
    );

    // Verify Rider 1 cannot accept the expired/reassigned offer
    const acceptResRider1 = await handleRiderAccept(orderId, rider1Id);
    assert.equal(acceptResRider1.success, false);
    assert.ok(['OFFER_EXPIRED', 'OFFER_REASSIGNED'].includes(acceptResRider1.code));
  });

  await t.test('2. recoverPendingDispatches re-arms active unexpired offer with remaining duration', async () => {
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';

    const orderId = new mongoose.Types.ObjectId().toString();
    const riderId = new mongoose.Types.ObjectId().toString();
    const vendorId = new mongoose.Types.ObjectId().toString();

    // Stored order document with an offer that expires in 15 seconds
    const futureExpires = new Date(Date.now() + 15000);
    let orderDoc = {
      _id: orderId,
      orderNumber: 'ORD-ACTIVE-002',
      status: 'READY_FOR_RIDER',
      rider: null,
      vendor: {
        _id: vendorId,
        storeName: 'Fresh Mart',
        address: { location: { coordinates: [75.857, 30.901] } }
      },
      customer: { _id: new mongoose.Types.ObjectId().toString(), name: 'Cust' },
      currentOffer: {
        rider: riderId,
        expiresAt: futureExpires,
        offerId: `OFFER_ACTIVE_${orderId}_${riderId}`
      }
    };

    let redispatchCalled = false;

    Order.find = (query) => ({
      populate() {
        return Promise.resolve([orderDoc]);
      }
    });

    Rider.find = () => {
      redispatchCalled = true;
      return { limit() { return Promise.resolve([]); } };
    };

    // Run recovery
    await recoverPendingDispatches();

    // Redispatch should NOT be called because offer is still active
    assert.equal(redispatchCalled, false, 'Active offer should not be redispatched prematurely');
    assert.equal(orderDoc.currentOffer.rider.toString(), riderId, 'Candidate rider remains preserved');
  });

  await t.test('3. getStagingRecoveryScope validates scopes and preserves normal production behavior', async () => {
    const origStaging = process.env.STAGING_MODE;
    const origNodeEnv = process.env.NODE_ENV;
    const origOrderPrefix = process.env.RECOVERY_ORDER_SCOPE_PREFIX;
    const origRiderPrefix = process.env.RECOVERY_RIDER_SCOPE_PREFIX;
    const origOrderIds = process.env.RECOVERY_ORDER_IDS;
    const origRiderIds = process.env.RECOVERY_RIDER_IDS;

    t.after(() => {
      process.env.STAGING_MODE = origStaging;
      process.env.NODE_ENV = origNodeEnv;
      process.env.RECOVERY_ORDER_SCOPE_PREFIX = origOrderPrefix;
      process.env.RECOVERY_RIDER_SCOPE_PREFIX = origRiderPrefix;
      process.env.RECOVERY_ORDER_IDS = origOrderIds;
      process.env.RECOVERY_RIDER_IDS = origRiderIds;
    });

    // 3a. In ordinary production, test scopes are ignored (returns null)
    process.env.STAGING_MODE = 'false';
    process.env.NODE_ENV = 'production';
    process.env.RECOVERY_ORDER_SCOPE_PREFIX = 'STG_PROD_TEST_PREFIX';
    assert.equal(getStagingRecoveryScope(), null, 'Production mode must ignore test scopes');

    // 3b. In staging mode with valid prefix, returns validated scope
    process.env.STAGING_MODE = 'true';
    process.env.NODE_ENV = 'staging';
    process.env.RECOVERY_ORDER_SCOPE_PREFIX = 'STG_STAGE_PREFIX';
    process.env.RECOVERY_RIDER_SCOPE_PREFIX = 'STG_STAGE_RIDER';
    const scope = getStagingRecoveryScope();
    assert.equal(scope?.orderPrefix, 'STG_STAGE_PREFIX');
    assert.equal(scope?.riderPrefix, 'STG_STAGE_RIDER');

    // 3c. Fails closed if prefix is too short (< 5 chars)
    process.env.RECOVERY_ORDER_SCOPE_PREFIX = 'ABC';
    assert.throws(
      () => getStagingRecoveryScope(),
      /FAIL-CLOSED: RECOVERY_ORDER_SCOPE_PREFIX is too short/
    );

    // 3d. Fails closed if ID scope has invalid ObjectId
    process.env.RECOVERY_ORDER_SCOPE_PREFIX = 'STG_VALID_PREFIX';
    process.env.RECOVERY_ORDER_IDS = 'not_a_valid_mongo_id';
    assert.throws(
      () => getStagingRecoveryScope(),
      /FAIL-CLOSED: Invalid ObjectId in RECOVERY_ORDER_IDS/
    );
  });

  await t.test('4. recoverPendingDispatches restricts Order query to test scope and excludes unrelated orders', async () => {
    const origStaging = process.env.STAGING_MODE;
    const origPrefix = process.env.RECOVERY_ORDER_SCOPE_PREFIX;
    const origIds = process.env.RECOVERY_ORDER_IDS;

    t.after(() => {
      process.env.STAGING_MODE = origStaging;
      process.env.RECOVERY_ORDER_SCOPE_PREFIX = origPrefix;
      process.env.RECOVERY_ORDER_IDS = origIds;
    });

    process.env.STAGING_MODE = 'true';
    process.env.RECOVERY_ORDER_SCOPE_PREFIX = 'STG_EXCL_TEST_PREFIX';
    delete process.env.RECOVERY_ORDER_IDS;

    let capturedOrderQuery = null;
    Order.find = (query) => {
      capturedOrderQuery = query;
      return { populate() { return Promise.resolve([]); } };
    };

    await recoverPendingDispatches();

    assert.ok(capturedOrderQuery, 'Order.find should be executed');
    assert.equal(capturedOrderQuery.status, 'READY_FOR_RIDER');
    assert.equal(capturedOrderQuery.rider, null);
    assert.ok(capturedOrderQuery.clientOrderId?.$regex, 'Query must enforce clientOrderId prefix filter');
    assert.equal(capturedOrderQuery.clientOrderId.$regex, '^STG_EXCL_TEST_PREFIX');

    // Test with exact order IDs scope
    const testOid1 = new mongoose.Types.ObjectId().toString();
    const testOid2 = new mongoose.Types.ObjectId().toString();
    process.env.RECOVERY_ORDER_IDS = `${testOid1},${testOid2}`;
    delete process.env.RECOVERY_ORDER_SCOPE_PREFIX;

    await recoverPendingDispatches();
    assert.ok(capturedOrderQuery._id?.$in, 'Query must enforce _id $in filter when IDs are specified');
    const matchedIds = capturedOrderQuery._id.$in.map(String);
    assert.ok(matchedIds.includes(testOid1) && matchedIds.includes(testOid2));
  });

  await t.test('5. offerToNextRider restricts candidate Rider query to test scope and excludes unrelated riders', async () => {
    const origStaging = process.env.STAGING_MODE;
    const origPrefix = process.env.RECOVERY_RIDER_SCOPE_PREFIX;
    const origIds = process.env.RECOVERY_RIDER_IDS;
    const origOrderPrefix = process.env.RECOVERY_ORDER_SCOPE_PREFIX;

    t.after(() => {
      process.env.STAGING_MODE = origStaging;
      process.env.RECOVERY_RIDER_SCOPE_PREFIX = origPrefix;
      process.env.RECOVERY_RIDER_IDS = origIds;
      process.env.RECOVERY_ORDER_SCOPE_PREFIX = origOrderPrefix;
    });

    process.env.STAGING_MODE = 'true';
    process.env.RECOVERY_ORDER_SCOPE_PREFIX = 'STG_RIDER_TEST';
    process.env.RECOVERY_RIDER_SCOPE_PREFIX = 'STG_RIDER_TEST';
    delete process.env.RECOVERY_RIDER_IDS;

    const orderId = new mongoose.Types.ObjectId().toString();
    const rider1Id = new mongoose.Types.ObjectId().toString();

    let capturedRiderQuery = null;
    Order.find = () => ({
      populate() {
        return Promise.resolve([
          {
            _id: orderId,
            orderNumber: 'ORD-SCOPE-001',
            clientOrderId: 'STG_RIDER_TEST_ORD_001',
            status: 'READY_FOR_RIDER',
            rider: null,
            vendor: {
              storeName: 'Vendor Store',
              address: { location: { coordinates: [75.857, 30.901] } }
            },
            currentOffer: {
              rider: rider1Id,
              expiresAt: new Date(Date.now() - 5000), // Expired
              offerId: `OFFER_${orderId}`
            }
          }
        ]);
      }
    });

    Order.findByIdAndUpdate = () => Promise.resolve({});

    Rider.find = (query) => {
      capturedRiderQuery = query;
      return { limit() { return Promise.resolve([]); } };
    };

    await recoverPendingDispatches();

    assert.ok(capturedRiderQuery, 'Rider.find should be executed');
    assert.equal(capturedRiderQuery.status, 'ONLINE_IDLE');
    assert.ok(capturedRiderQuery.name?.$regex, 'Rider query must enforce name prefix filter');
    assert.equal(capturedRiderQuery.name.$regex, '^STG_RIDER_TEST');
  });
});
