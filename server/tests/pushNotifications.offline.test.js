import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import Rider from '../models/Rider.js';
import { maskPushToken, sendExpoPushNotification, checkExpoPushReceipts, notifyRiderDeliveryOffer } from '../services/notify.js';
import { registerPushToken, unregisterPushToken } from '../controllers/authController.js';

const makeMockRes = () => {
  let statusCode = 200;
  let responseBody = null;
  return {
    status(c) { statusCode = c; return this; },
    json(b) { responseBody = b; return this; },
    get statusCode() { return statusCode; },
    get body() { return responseBody; }
  };
};

test('Push Notification Unit & Offline Test Suite', async (t) => {
  await t.test('1. maskPushToken securely masks tokens for logging', () => {
    assert.equal(maskPushToken('ExponentPushToken[AbCdEf123456]'), '...23456]');
    assert.equal(maskPushToken('ExpoPushToken[xyz987]'), '...yz987]');
    assert.equal(maskPushToken('short'), '***');
    assert.equal(maskPushToken(null), 'invalid');
    assert.equal(maskPushToken(12345), 'invalid');
  });

  await t.test('2. sendExpoPushNotification respects DISABLE_EXTERNAL_NOTIFICATIONS=true', async () => {
    const originalEnv = process.env.DISABLE_EXTERNAL_NOTIFICATIONS;
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';
    try {
      let fetchCalled = false;
      const originalFetch = global.fetch;
      global.fetch = async () => {
        fetchCalled = true;
        return { json: async () => ({ data: [] }) };
      };

      const result = await sendExpoPushNotification(
        ['ExponentPushToken[valid123]'],
        'Order Placed',
        'Your order has been received',
        { orderId: 'ord_100', screen: 'OrderTracking' }
      );

      assert.deepEqual(result, []);
      assert.equal(fetchCalled, false, 'fetch should not be called when DISABLE_EXTERNAL_NOTIFICATIONS is true');
      global.fetch = originalFetch;
    } finally {
      process.env.DISABLE_EXTERNAL_NOTIFICATIONS = originalEnv;
    }
  });

  await t.test('3. sendExpoPushNotification filters out native FCM tokens and dispatches valid Expo tokens with orders channel', async () => {
    const originalEnv = process.env.DISABLE_EXTERNAL_NOTIFICATIONS;
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'false';
    const originalFetch = global.fetch;

    try {
      let sentBody = null;
      global.fetch = async (url, options) => {
        sentBody = JSON.parse(options.body);
        return {
          json: async () => ({
            data: [{ status: 'ok', id: 'ticket_1' }]
          })
        };
      };

      // Pass a mix of Expo token, native FCM token (without prefix), and nulls
      const mixedTokens = [
        'ExponentPushToken[real-expo-token-1]',
        'fcm_native_alphanumeric_token_not_expo',
        { token: 'ExpoPushToken[real-expo-token-2]' },
        null
      ];

      const result = await sendExpoPushNotification(
        mixedTokens,
        'Order Accepted',
        'Chef started cooking',
        { orderId: 'ord_200', status: 'ACCEPTED' }
      );

      assert.equal(result.length, 1);
      assert.equal(sentBody.length, 2, 'Only 2 Expo tokens should be dispatched; native FCM token must be excluded');
      assert.equal(sentBody[0].to, 'ExponentPushToken[real-expo-token-1]');
      assert.equal(sentBody[0].channelId, 'orders', 'Notification must use orders channel');
      assert.equal(sentBody[0].priority, 'high');
      assert.equal(sentBody[0].data.orderId, 'ord_200');
      assert.equal(sentBody[0].data.screen, 'OrderTracking');
      assert.equal(sentBody[1].to, 'ExpoPushToken[real-expo-token-2]');
    } finally {
      process.env.DISABLE_EXTERNAL_NOTIFICATIONS = originalEnv;
      global.fetch = originalFetch;
    }
  });

  await t.test('4. sendExpoPushNotification handles DeviceNotRegistered error tickets gracefully', async () => {
    const originalEnv = process.env.DISABLE_EXTERNAL_NOTIFICATIONS;
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'false';
    const originalFetch = global.fetch;

    // Spy on User.updateMany to ensure invalid token cleanup is triggered
    let cleanupCalled = false;
    const origUserUpdateMany = User.updateMany;
    User.updateMany = async () => {
      cleanupCalled = true;
      return { acknowledged: true };
    };

    try {
      global.fetch = async () => ({
        json: async () => ({
          data: [
            {
              status: 'error',
              message: 'DeviceNotRegistered',
              details: { error: 'DeviceNotRegistered' }
            }
          ]
        })
      });

      const result = await sendExpoPushNotification(
        ['ExponentPushToken[stale_token_abc]'],
        'Order Out',
        'Driver on way',
        { orderId: 'ord_300' }
      );

      assert.equal(result.length, 1);
      assert.equal(result[0].status, 'error');
      assert.equal(cleanupCalled, true, 'DeviceNotRegistered ticket must trigger cleanup of stale token');
    } finally {
      process.env.DISABLE_EXTERNAL_NOTIFICATIONS = originalEnv;
      global.fetch = originalFetch;
      User.updateMany = origUserUpdateMany;
    }
  });

  await t.test('5. registerPushToken enforces token requirement and isolates device across accounts', async () => {
    const testUserId1 = new mongoose.Types.ObjectId().toString();
    const testUserId2 = new mongoose.Types.ObjectId().toString();
    const vendorId = new mongoose.Types.ObjectId().toString();

    let userUpdateManyCalls = [];
    let userFindByIdAndUpdateCalls = [];
    let vendorUpdateManyCalls = [];
    let vendorFindByIdAndUpdateCalls = [];

    const origUserUpdateMany = User.updateMany;
    const origUserFindByIdAndUpdate = User.findByIdAndUpdate;
    const origVendorUpdateMany = Vendor.updateMany;
    const origVendorFindByIdAndUpdate = Vendor.findByIdAndUpdate;

    User.updateMany = async (filter, update) => {
      userUpdateManyCalls.push({ filter, update });
      return { acknowledged: true };
    };
    User.findByIdAndUpdate = async (id, update) => {
      userFindByIdAndUpdateCalls.push({ id, update });
      return { _id: id };
    };
    Vendor.updateMany = async (filter, update) => {
      vendorUpdateManyCalls.push({ filter, update });
      return { acknowledged: true };
    };
    Vendor.findByIdAndUpdate = async (id, update) => {
      vendorFindByIdAndUpdateCalls.push({ id, update });
      return { _id: id };
    };

    try {
      // 5a. Missing token -> 400
      const res1 = makeMockRes();
      await registerPushToken({ body: {}, user: { id: testUserId1, role: 'CUSTOMER' } }, res1);
      assert.equal(res1.statusCode, 400);
      assert.equal(res1.body.success, false);

      // 5b. Valid customer Expo token registration with device isolation
      const res2 = makeMockRes();
      await registerPushToken({
        body: {
          token: 'ExponentPushToken[cust_token_1]',
          platform: 'android',
          deviceId: 'device_serial_100',
          tokenType: 'expo'
        },
        user: { id: testUserId2, role: 'CUSTOMER' }
      }, res2);

      assert.equal(res2.statusCode, 200);
      assert.equal(res2.body.success, true);

      // Check cross-account pull was invoked on other users
      assert.equal(userUpdateManyCalls.length, 1);
      assert.deepEqual(userUpdateManyCalls[0].filter._id, { $ne: testUserId2 });

      // Check pull (deduplication) and push on current user
      assert.equal(userFindByIdAndUpdateCalls.length, 2);
      assert.equal(userFindByIdAndUpdateCalls[0].id, testUserId2);
      assert.ok(userFindByIdAndUpdateCalls[0].update.$pull);
      assert.ok(userFindByIdAndUpdateCalls[1].update.$push);
      assert.equal(userFindByIdAndUpdateCalls[1].update.$push.expoPushTokens.token, 'ExponentPushToken[cust_token_1]');
      assert.equal(userFindByIdAndUpdateCalls[1].update.$push.expoPushTokens.deviceId, 'device_serial_100');

      // 5c. Vendor Expo token registration
      const res3 = makeMockRes();
      await registerPushToken({
        body: {
          token: 'ExponentPushToken[vendor_token_1]',
          platform: 'android'
        },
        user: { id: vendorId, vendorId: vendorId, role: 'VENDOR' }
      }, res3);

      assert.equal(res3.statusCode, 200);
      assert.equal(vendorUpdateManyCalls.length, 1);
      assert.equal(vendorFindByIdAndUpdateCalls.length, 1);
      assert.ok(vendorFindByIdAndUpdateCalls[0].update.$addToSet);

      // 5d. Native FCM token routing
      userFindByIdAndUpdateCalls = [];
      const res4 = makeMockRes();
      await registerPushToken({
        body: {
          token: 'fcm_native_base64_string_9999',
          platform: 'android',
          tokenType: 'fcm'
        },
        user: { id: testUserId1, role: 'CUSTOMER' }
      }, res4);

      assert.equal(res4.statusCode, 200);
      assert.equal(userFindByIdAndUpdateCalls.length, 2);
      assert.ok(userFindByIdAndUpdateCalls[1].update.$push.fcmTokens);
      assert.equal(userFindByIdAndUpdateCalls[1].update.$push.fcmTokens.token, 'fcm_native_base64_string_9999');
    } finally {
      User.updateMany = origUserUpdateMany;
      User.findByIdAndUpdate = origUserFindByIdAndUpdate;
      Vendor.updateMany = origVendorUpdateMany;
      Vendor.findByIdAndUpdate = origVendorFindByIdAndUpdate;
    }
  });

  await t.test('6. unregisterPushToken removes token/deviceId association on logout', async () => {
    const testUserId = new mongoose.Types.ObjectId().toString();
    const vendorId = new mongoose.Types.ObjectId().toString();

    let userPullUpdate = null;
    let vendorPullUpdate = null;

    const origUserFindByIdAndUpdate = User.findByIdAndUpdate;
    const origVendorFindByIdAndUpdate = Vendor.findByIdAndUpdate;

    User.findByIdAndUpdate = async (id, update) => {
      userPullUpdate = { id, update };
      return { _id: id };
    };
    Vendor.findByIdAndUpdate = async (id, update) => {
      vendorPullUpdate = { id, update };
      return { _id: id };
    };

    try {
      // 6a. Missing both token and deviceId -> 400
      const res1 = makeMockRes();
      await unregisterPushToken({ body: {}, user: { id: testUserId, role: 'CUSTOMER' } }, res1);
      assert.equal(res1.statusCode, 400);

      // 6b. Customer unregister by token and deviceId
      const res2 = makeMockRes();
      await unregisterPushToken({
        body: { token: 'ExponentPushToken[cust_token_1]', deviceId: 'dev_100' },
        user: { id: testUserId, role: 'CUSTOMER' }
      }, res2);

      assert.equal(res2.statusCode, 200);
      assert.equal(res2.body.success, true);
      assert.equal(userPullUpdate.id, testUserId);
      assert.ok(userPullUpdate.update.$pull);
      assert.ok(userPullUpdate.update.$pull.expoPushTokens);

      // 6c. Vendor unregister
      const res3 = makeMockRes();
      await unregisterPushToken({
        body: { token: 'ExponentPushToken[vendor_token_1]' },
        user: { id: vendorId, vendorId, role: 'VENDOR' }
      }, res3);

      assert.equal(res3.statusCode, 200);
      assert.equal(vendorPullUpdate.id, vendorId);
      assert.deepEqual(vendorPullUpdate.update.$pull, { expoPushTokens: 'ExponentPushToken[vendor_token_1]' });
    } finally {
      User.findByIdAndUpdate = origUserFindByIdAndUpdate;
      Vendor.findByIdAndUpdate = origVendorFindByIdAndUpdate;
    }
  });

  await t.test('7. registerPushToken and unregisterPushToken manage RIDER tokens with device isolation', async () => {
    const riderId1 = new mongoose.Types.ObjectId().toString();
    const riderId2 = new mongoose.Types.ObjectId().toString();

    let riderUpdateManyCalls = [];
    let riderFindByIdAndUpdateCalls = [];

    const origRiderUpdateMany = Rider.updateMany;
    const origRiderFindByIdAndUpdate = Rider.findByIdAndUpdate;

    Rider.updateMany = async (filter, update) => {
      riderUpdateManyCalls.push({ filter, update });
      return { acknowledged: true };
    };
    Rider.findByIdAndUpdate = async (id, update) => {
      riderFindByIdAndUpdateCalls.push({ id, update });
      return { _id: id };
    };

    try {
      // 7a. Register rider push token
      const res1 = makeMockRes();
      await registerPushToken({
        body: {
          token: 'ExponentPushToken[rider_token_abc]',
          platform: 'android',
          deviceId: 'device_rider_999'
        },
        user: { id: riderId1, role: 'RIDER' }
      }, res1);

      assert.equal(res1.statusCode, 200);
      assert.equal(res1.body.success, true);

      // Check device isolation across other riders
      assert.equal(riderUpdateManyCalls.length, 1);
      assert.deepEqual(riderUpdateManyCalls[0].filter._id, { $ne: riderId1 });

      // Check deduplication pull and push
      assert.equal(riderFindByIdAndUpdateCalls.length, 2);
      assert.ok(riderFindByIdAndUpdateCalls[0].update.$pull);
      assert.ok(riderFindByIdAndUpdateCalls[1].update.$push);
      assert.equal(riderFindByIdAndUpdateCalls[1].update.$push.expoPushTokens.token, 'ExponentPushToken[rider_token_abc]');

      // 7b. Unregister rider push token
      const res2 = makeMockRes();
      await unregisterPushToken({
        body: { token: 'ExponentPushToken[rider_token_abc]', deviceId: 'device_rider_999' },
        user: { id: riderId1, role: 'RIDER' }
      }, res2);

      assert.equal(res2.statusCode, 200);
      assert.equal(res2.body.success, true);
      assert.equal(riderFindByIdAndUpdateCalls.length, 3);
      assert.ok(riderFindByIdAndUpdateCalls[2].update.$pull);
    } finally {
      Rider.updateMany = origRiderUpdateMany;
      Rider.findByIdAndUpdate = origRiderFindByIdAndUpdate;
    }
  });

  await t.test('8. notifyRiderDeliveryOffer dispatches high-priority notification on delivery_offers channel', async () => {
    const originalEnv = process.env.DISABLE_EXTERNAL_NOTIFICATIONS;
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'false';
    const originalFetch = global.fetch;

    let sentPayload = null;
    global.fetch = async (url, options) => {
      sentPayload = JSON.parse(options.body);
      return {
        json: async () => ({
          data: [{ status: 'ok', id: 'offer_ticket_1' }]
        })
      };
    };

    try {
      const fakeRider = {
        _id: 'rider_123',
        expoPushTokens: [{ token: 'ExponentPushToken[rider_offer_token]' }]
      };
      const fakeOrder = {
        _id: 'order_offer_777',
        orderNumber: 'ORD-777',
        estimatedEarnings: 65,
        totalDistanceKm: 3.2
      };

      const result = await notifyRiderDeliveryOffer(fakeRider, fakeOrder);
      assert.ok(result);
      assert.ok(sentPayload);
      assert.equal(sentPayload[0].to, 'ExponentPushToken[rider_offer_token]');
      assert.equal(sentPayload[0].channelId, 'delivery_offers');
      assert.equal(sentPayload[0].priority, 'high');
      assert.equal(sentPayload[0].data.type, 'DELIVERY_OFFER');
      assert.equal(sentPayload[0].data.orderId, 'order_offer_777');
    } finally {
      process.env.DISABLE_EXTERNAL_NOTIFICATIONS = originalEnv;
      global.fetch = originalFetch;
    }
  });

  await t.test('9. checkExpoPushReceipts polls receipts and cleans up DeviceNotRegistered tokens', async () => {
    const originalFetch = global.fetch;
    let userCleaned = false;
    let vendorCleaned = false;
    let riderCleaned = false;

    const origUserUpdateMany = User.updateMany;
    const origVendorUpdateMany = Vendor.updateMany;
    const origRiderUpdateMany = Rider.updateMany;

    User.updateMany = async () => { userCleaned = true; return { acknowledged: true }; };
    Vendor.updateMany = async () => { vendorCleaned = true; return { acknowledged: true }; };
    Rider.updateMany = async () => { riderCleaned = true; return { acknowledged: true }; };

    global.fetch = async () => ({
      json: async () => ({
        data: {
          'ticket_rec_1': { status: 'ok' },
          'ticket_rec_2': {
            status: 'error',
            message: 'DeviceNotRegistered',
            details: { error: 'DeviceNotRegistered' }
          }
        }
      })
    });

    try {
      const tickets = [
        { id: 'ticket_rec_1', token: 'ExponentPushToken[valid_tok]' },
        { id: 'ticket_rec_2', token: 'ExponentPushToken[dead_tok]' }
      ];

      const receipts = await checkExpoPushReceipts(tickets);
      assert.ok(receipts);
      assert.equal(userCleaned, true, 'User models must be purged of dead token from receipt');
      assert.equal(vendorCleaned, true, 'Vendor models must be purged of dead token from receipt');
      assert.equal(riderCleaned, true, 'Rider models must be purged of dead token from receipt');
    } finally {
      global.fetch = originalFetch;
      User.updateMany = origUserUpdateMany;
      Vendor.updateMany = origVendorUpdateMany;
      Rider.updateMany = origRiderUpdateMany;
    }
  });
});
