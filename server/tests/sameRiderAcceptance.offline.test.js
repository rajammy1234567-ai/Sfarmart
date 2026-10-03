// server/tests/sameRiderAcceptance.offline.test.js
// Focused offline test suite for same-rider concurrent acceptance:
// 1. Genuinely concurrent simultaneous acceptance by SAME rider via Promise.all.
// 2. Exactly one assignment/history entry.
// 3. Exactly one logical assignment socket emission set (order:status and order:rider_assigned).
// 4. Exactly one notification invocation with external sends disabled.
// 5. Exact response contract for both primary (isDuplicate: false) and secondary (isDuplicate: true, 'Order already accepted.').
// 6. Transaction callback retry safety: aborted attempt setting isNewAssignment=true followed by retry into duplicate branch yields ZERO side effects.

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import Order from '../models/Order.js';
import Rider from '../models/Rider.js';
import User from '../models/User.js';
import { handleRiderAccept } from '../services/riderAssignmentService.js';
import { acceptOrderOffer } from '../controllers/riderController.js';
import * as socketModule from '../socket/index.js';

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
};

test('Same-Rider Acceptance Offline Suite: Concurrency, Side-Effect Suppression & Response Contract', async (t) => {
  const origStartSession = mongoose.startSession;
  const origFindOne = Order.findOne;
  const origFindOneAndUpdate = Order.findOneAndUpdate;
  const origRiderFindOne = Rider.findOne;
  const origRiderFindOneAndUpdate = Rider.findOneAndUpdate;
  const origRiderFindById = Rider.findById;
  const origUserFindById = User.findById;

  t.afterEach(() => {
    mongoose.startSession = origStartSession;
    Order.findOne = origFindOne;
    Order.findOneAndUpdate = origFindOneAndUpdate;
    Rider.findOne = origRiderFindOne;
    Rider.findOneAndUpdate = origRiderFindOneAndUpdate;
    Rider.findById = origRiderFindById;
    User.findById = origUserFindById;
  });

  await t.test('1. Genuinely concurrent acceptance by SAME rider triggers exactly one notification and one socket emission set', async () => {
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';

    const orderId = new mongoose.Types.ObjectId().toString();
    const riderId = new mongoose.Types.ObjectId().toString();
    const vendorId = new mongoose.Types.ObjectId().toString();
    const customerId = new mongoose.Types.ObjectId().toString();

    // Mock Order in database
    let orderDoc = {
      _id: orderId,
      orderNumber: 'ORD-123456-789',
      status: 'READY_FOR_RIDER',
      rider: null,
      vendor: { _id: vendorId, location: { coordinates: [75.857, 30.901] } },
      customer: { _id: customerId, name: 'Test Customer' },
      currentOffer: {
        rider: riderId,
        expiresAt: new Date(Date.now() + 20000),
        offerId: `OFFER_${orderId}_${riderId}`
      },
      statusHistory: [
        { status: 'NEW_ORDER', at: new Date(), by: 'CUSTOMER' },
        { status: 'ACCEPTED', at: new Date(), by: 'VENDOR' },
        { status: 'PREPARING', at: new Date(), by: 'VENDOR' },
        { status: 'READY_FOR_RIDER', at: new Date(), by: 'VENDOR' }
      ]
    };

    let riderDoc = {
      _id: riderId,
      name: 'Rider Ace',
      phone: '9876543210',
      status: 'ONLINE_IDLE',
      activeOrderId: null,
      vehicleType: 'BIKE',
      vehicleNumber: 'PB10AB1234',
      rating: 4.9,
      currentLocation: { coordinates: [75.858, 30.902] },
      locationUpdatedAt: new Date()
    };

    // Notification lookup counters
    let userLookupCount = 0;
    User.findById = (id) => ({
      select() {
        if (id.toString() === customerId) {
          userLookupCount++;
          return Promise.resolve({ _id: customerId, expoPushTokens: ['ExponentPushToken[mock_token_12345]'] });
        }
        return Promise.resolve(null);
      }
    });

    let riderLookupCount = 0;
    Rider.findById = (id) => ({
      select() {
        if (id.toString() === riderId) {
          riderLookupCount++;
          return Promise.resolve({ _id: riderId, expoPushTokens: ['ExponentPushToken[mock_rider_12345]'] });
        }
        return Promise.resolve(null);
      }
    });

    // Mock IO and capture emitted events
    const emittedSocketEvents = [];
    const mockIO = {
      to(room) {
        return {
          emit(event, payload) {
            emittedSocketEvents.push({ room, event, payload });
          }
        };
      }
    };
    socketModule.initSocket({ on() {} });
    const ioContainer = socketModule.getIO();
    if (ioContainer) {
      ioContainer.to = mockIO.to;
    }

    // Simulate MongoDB session with serial document-level write lock
    let txMutex = Promise.resolve();
    mongoose.startSession = async () => ({
      async withTransaction(cb) {
        const lock = txMutex;
        let release;
        txMutex = new Promise((resolve) => { release = resolve; });
        await lock;
        try {
          await cb();
        } finally {
          release();
        }
      },
      async endSession() {}
    });

    // Mock Order queries
    Order.findOne = (query) => {
      const q = {
        populate() { return q; },
        session() { return q; },
        then(resolve) {
          if (query._id === orderId && query.status === 'READY_FOR_RIDER' && query.rider === null) {
            return resolve(orderDoc.rider ? null : orderDoc);
          }
          if (query._id === orderId && query.rider === riderId) {
            return resolve(orderDoc.rider === riderId ? orderDoc : null);
          }
          return resolve(null);
        }
      };
      return q;
    };

    Order.findOneAndUpdate = (query, update) => {
      const q = {
        populate() { return q; },
        session() { return q; },
        then(resolve) {
          if (query._id === orderId && query.status === 'READY_FOR_RIDER') {
            orderDoc = {
              ...orderDoc,
              rider: update.$set.rider,
              riderId: update.$set.riderId,
              status: update.$set.status,
              riderAssignedAt: update.$set.riderAssignedAt,
              statusHistory: [
                ...orderDoc.statusHistory,
                ...(update.$push?.statusHistory ? [update.$push.statusHistory] : [])
              ]
            };
            return resolve(orderDoc);
          }
          return resolve(null);
        }
      };
      return q;
    };

    Rider.findOne = (query) => {
      const q = {
        session() { return q; },
        then(resolve) {
          if (query._id === riderId) {
            return resolve(riderDoc.status === 'ONLINE_IDLE' ? riderDoc : null);
          }
          return resolve(null);
        }
      };
      return q;
    };

    Rider.findOneAndUpdate = (query, update) => {
      const q = {
        session() { return q; },
        then(resolve) {
          if (query._id === riderId) {
            riderDoc = {
              ...riderDoc,
              status: update.$set.status,
              activeOrderId: update.$set.activeOrderId
            };
            return resolve(riderDoc);
          }
          return resolve(null);
        }
      };
      return q;
    };

    // Execute GENUINELY CONCURRENT accept requests simultaneously via Promise.all
    const req1 = { user: { id: riderId }, params: { id: orderId } };
    const res1 = createMockRes();
    const req2 = { user: { id: riderId }, params: { id: orderId } };
    const res2 = createMockRes();

    await Promise.all([
      acceptOrderOffer(req1, res1),
      acceptOrderOffer(req2, res2)
    ]);

    // Group responses into primary winner and secondary duplicate
    const responses = [res1, res2];
    const primary = responses.find((r) => r.statusCode === 200 && r.body.isDuplicate === false);
    const secondary = responses.find((r) => r.statusCode === 200 && r.body.isDuplicate === true);

    // 1. Assert exact response contracts
    assert.ok(primary, 'Exactly one response must be the primary winner (isDuplicate: false)');
    assert.equal(primary.body.success, true);
    assert.equal(primary.body.message, 'Order accepted successfully! Proceed to store for pickup.');
    assert.ok(primary.body.order);
    assert.equal(primary.body.order.status, 'RIDER_ASSIGNED');

    assert.ok(secondary, 'Exactly one response must be the secondary idempotent retry (isDuplicate: true)');
    assert.equal(secondary.body.success, true);
    assert.equal(secondary.body.message, 'Order already accepted.', 'Secondary request must carry idempotency message');
    assert.ok(secondary.body.order);
    assert.equal(secondary.body.order.status, 'RIDER_ASSIGNED');

    // 2. Assert exactly ONE assignment entry in statusHistory
    const riderAssignedEvents = orderDoc.statusHistory.filter((h) => h.status === 'RIDER_ASSIGNED');
    assert.equal(riderAssignedEvents.length, 1, 'statusHistory must contain exactly one RIDER_ASSIGNED entry');
    assert.equal(riderAssignedEvents[0].by, 'RIDER');

    // 3. Assert notification was invoked exactly ONCE across both concurrent requests
    assert.equal(userLookupCount, 1, 'Customer push token lookup in notifyOrderStatus must be invoked exactly once');

    // 4. Assert exactly ONE logical assignment socket emission for order:rider_assigned
    const riderAssignedSocketEvents = emittedSocketEvents.filter((e) => e.event === 'order:rider_assigned');
    assert.equal(riderAssignedSocketEvents.length, 2, 'order:rider_assigned emitted once to order room and once to customer room');

    // 5. Assert exactly ONE order:status (RIDER_ASSIGNED) emission to order room
    const orderStatusEvents = emittedSocketEvents.filter((e) => e.event === 'order:status' && e.room === `order:${orderId}`);
    assert.equal(orderStatusEvents.length, 1, 'order:status (RIDER_ASSIGNED) must be emitted to order room exactly once');
  });

  await t.test('2. Aborted attempt sets isNewAssignment=true, then retries into duplicate branch: yields ZERO side effects', async () => {
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';

    const orderId = new mongoose.Types.ObjectId().toString();
    const riderId = new mongoose.Types.ObjectId().toString();
    const vendorId = new mongoose.Types.ObjectId().toString();
    const customerId = new mongoose.Types.ObjectId().toString();

    let attemptCount = 0;
    let notifyCallCount = 0;
    User.findById = () => ({
      select() {
        notifyCallCount++;
        return Promise.resolve({ expoPushTokens: ['ExponentPushToken[mock_token_12345]'] });
      }
    });
    Rider.findById = () => ({
      select() {
        return Promise.resolve({ expoPushTokens: [] });
      }
    });

    const emittedEvents = [];
    const mockIO = {
      to(room) {
        return {
          emit(event, payload) {
            emittedEvents.push({ room, event, payload });
          }
        };
      }
    };
    socketModule.initSocket({ on() {} });
    const ioContainer = socketModule.getIO();
    if (ioContainer) {
      ioContainer.to = mockIO.to;
    }

    let orderDoc = {
      _id: orderId,
      orderNumber: 'ORD-ABORT-RETRY-001',
      status: 'READY_FOR_RIDER',
      rider: null,
      vendor: { _id: vendorId, location: { coordinates: [75.857, 30.901] } },
      customer: { _id: customerId },
      currentOffer: { rider: riderId, expiresAt: new Date(Date.now() + 20000) },
      statusHistory: []
    };

    mongoose.startSession = async () => ({
      async withTransaction(cb) {
        // Attempt 1: Proceeds through assignment logic (sets isNewAssignment = true), then transient commit error occurs
        attemptCount++;
        try {
          await cb();
          throw new Error('TransientCommitError: transaction was aborted');
        } catch {
          // Meanwhile, concurrent transaction committed the assignment to this rider in the background.
          // Order in DB is now assigned to riderId:
          orderDoc = {
            ...orderDoc,
            status: 'RIDER_ASSIGNED',
            rider: riderId,
            statusHistory: [{ status: 'RIDER_ASSIGNED', by: 'RIDER' }]
          };

          // Attempt 2 (the retry of the callback):
          attemptCount++;
          await cb();
        }
      },
      async endSession() {}
    });

    Order.findOne = (query) => ({
      populate() { return this; },
      session() { return this; },
      then(resolve) {
        if (attemptCount === 1) {
          // In Attempt 1: candidate is found, not yet assigned
          return resolve(orderDoc);
        }
        // In Attempt 2 (retry): candidate with rider: null is NOT found, but alreadyAssigned is found!
        if (query.rider === riderId) {
          return resolve(orderDoc);
        }
        return resolve(null);
      }
    });

    Order.findOneAndUpdate = () => ({
      populate() { return this; },
      session() { return this; },
      then(resolve) {
        // In attempt 1: update succeeds in memory, setting isNewAssignment = true
        return resolve(orderDoc);
      }
    });

    Rider.findOne = () => ({
      session() { return this; },
      then(resolve) {
        return resolve({
          _id: riderId,
          status: attemptCount === 1 ? 'ONLINE_IDLE' : 'ON_DELIVERY',
          activeOrderId: attemptCount === 1 ? null : orderId,
          currentLocation: { coordinates: [75.857, 30.901] },
          locationUpdatedAt: new Date()
        });
      }
    });

    Rider.findOneAndUpdate = () => ({
      session() { return this; },
      then(resolve) {
        return resolve({ _id: riderId, status: 'ON_DELIVERY' });
      }
    });

    const result = await handleRiderAccept(orderId, riderId);

    // Verify transaction callback executed twice
    assert.equal(attemptCount, 2, 'Callback should have executed attempt 1 (aborted) and attempt 2 (retry)');

    // Verify result contract reflects duplicate
    assert.equal(result.success, true);
    assert.equal(result.isDuplicate, true, 'Retry that committed in duplicate branch must return isDuplicate: true');

    // Crucial: Zero notifications and zero socket emissions must occur from this request!
    assert.equal(notifyCallCount, 0, 'Zero notification invocations must be triggered from aborted attempt that retried into duplicate branch');
    assert.equal(emittedEvents.length, 0, 'Zero socket emissions must be triggered from aborted attempt that retried into duplicate branch');
  });
});
