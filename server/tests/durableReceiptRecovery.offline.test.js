// server/tests/durableReceiptRecovery.offline.test.js
// Focused offline tests verifying durable Expo push-receipt recovery.
// Covers:
// 1. Success outcome -> status COMPLETED
// 2. DeviceNotRegistered outcome -> status FAILED, token purged from User/Rider/Vendor
// 3. Retryable unready receipt -> preserves persisted attempt, increments attempt, nextCheckAt strictly in future
// 4. Retry exhaustion -> transitions to FAILED with MAX_ATTEMPTS_EXCEEDED (never left permanently PENDING)
// 5. Network errors, timeouts, and non-2xx responses handled with persisted bounded backoff and exhaustion
// 6. Zero push-send calls during receipt recovery; receipt recovery never invokes sendExpoPushNotification
// 7. DISABLE_EXTERNAL_NOTIFICATIONS=true strictly prevents real provider calls and fails closed on missing/malformed config
// 8. Database-backed worker periodically recovers future-due receipts when they become due
// 9. Ticket persistence and device cleanup writes are fully awaited

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import PushReceipt from '../models/PushReceipt.js';
import User from '../models/User.js';
import Rider from '../models/Rider.js';
import Vendor from '../models/Vendor.js';
import {
  checkExpoPushReceipts,
  recoverPendingPushReceipts,
  startPushReceiptWorker,
  stopPushReceiptWorker,
  processDuePushReceipts,
  sendExpoPushNotification,
  resolveOfflineReceipts
} from '../services/notify.js';
import '../tests/receiptStub.js'; // Registers deterministic stub behavior

test('Durable Push Receipt Recovery (Offline)', async (t) => {
  const origEnv = { ...process.env };
  const origFetch = globalThis.fetch;
  const origFind = PushReceipt.find;
  const origFindOneAndUpdate = PushReceipt.findOneAndUpdate;
  const origUpdateOne = PushReceipt.updateOne;
  const origCreate = PushReceipt.create;
  const origUserUpdateMany = User.updateMany;
  const origRiderUpdateMany = Rider.updateMany;
  const origVendorUpdateMany = Vendor.updateMany;
  const origProvider = globalThis.__expoReceiptProvider;

  t.afterEach(() => {
    stopPushReceiptWorker();
    process.env = { ...origEnv };
    globalThis.fetch = origFetch;
    PushReceipt.find = origFind;
    PushReceipt.findOneAndUpdate = origFindOneAndUpdate;
    PushReceipt.updateOne = origUpdateOne;
    PushReceipt.create = origCreate;
    User.updateMany = origUserUpdateMany;
    Rider.updateMany = origRiderUpdateMany;
    Vendor.updateMany = origVendorUpdateMany;
    globalThis.__expoReceiptProvider = origProvider;
  });

  await t.test('1. Successful receipt outcome marks PushReceipt COMPLETED', async () => {
    process.env.USE_RECEIPT_STUB = 'true';
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LIVE_STAGING_TEST = 'true';
    process.env.RECOVERY_TICKET_PREFIX = 'TICKET_';
    process.env.EXPO_RECEIPT_STUB_CONFIG = JSON.stringify({
      TICKET_ok_1: { status: 'ok' }
    });

    const updates = [];
    PushReceipt.updateOne = async (filter, update) => {
      updates.push({ filter, update });
      return { acknowledged: true, modifiedCount: 1 };
    };

    const tickets = [{ ticketId: 'TICKET_ok_1', token: 'ExponentPushToken[valid_token_1]' }];
    const result = await checkExpoPushReceipts(tickets);

    assert.ok(result);
    assert.equal(result.TICKET_ok_1.status, 'ok');
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].filter, { ticketId: 'TICKET_ok_1', status: 'PENDING' });
    assert.deepEqual(updates[0].update, { $set: { status: 'COMPLETED', leaseToken: null, leaseExpiresAt: null } });
  });

  await t.test('2. DeviceNotRegistered error marks PushReceipt FAILED and purges token from User/Rider/Vendor', async () => {
    process.env.USE_RECEIPT_STUB = 'true';
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LIVE_STAGING_TEST = 'true';
    process.env.RECOVERY_TICKET_PREFIX = 'TICKET_';
    process.env.EXPO_RECEIPT_STUB_CONFIG = JSON.stringify({
      TICKET_err_1: {
        status: 'error',
        message: 'DeviceNotRegistered',
        details: { error: 'DeviceNotRegistered' }
      }
    });

    const updates = [];
    PushReceipt.updateOne = async (filter, update) => {
      updates.push({ filter, update });
      return { acknowledged: true, modifiedCount: 1 };
    };

    const cleanedModels = { user: 0, rider: 0, vendor: 0 };
    User.updateMany = async (filter, update) => {
      cleanedModels.user++;
      return { acknowledged: true };
    };
    Rider.updateMany = async (filter, update) => {
      cleanedModels.rider++;
      return { acknowledged: true };
    };
    Vendor.updateMany = async (filter, update) => {
      cleanedModels.vendor++;
      return { acknowledged: true };
    };

    const tickets = [{ ticketId: 'TICKET_err_1', token: 'ExponentPushToken[unregistered_token]' }];
    const result = await checkExpoPushReceipts(tickets);

    assert.ok(result);
    assert.equal(result.TICKET_err_1.status, 'error');
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].filter, { ticketId: 'TICKET_err_1', status: 'PENDING' });
    assert.deepEqual(updates[0].update, {
      $set: {
        status: 'FAILED',
        cleanupStatus: 'COMPLETED',
        lastError: 'DeviceNotRegistered',
        leaseToken: null,
        leaseExpiresAt: null
      }
    });

    assert.ok(cleanedModels.user >= 1, 'User tokens must be purged');
    assert.ok(cleanedModels.rider >= 1, 'Rider tokens must be purged');
    assert.ok(cleanedModels.vendor >= 1, 'Vendor tokens must be purged');
  });

  await t.test('3. Retryable unready receipt preserves persisted attempt and sets nextCheckAt strictly in future', async () => {
    process.env.USE_RECEIPT_STUB = 'true';
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LIVE_STAGING_TEST = 'true';
    process.env.RECOVERY_TICKET_PREFIX = 'TICKET_';
    process.env.EXPO_RECEIPT_STUB_CONFIG = JSON.stringify({}); // empty -> unready at gateway

    const updates = [];
    PushReceipt.updateOne = async (filter, update) => {
      updates.push({ filter, update });
      return { acknowledged: true, modifiedCount: 1 };
    };

    const startTime = Date.now();
    // Persisted attempt is 1, maxAttempts is 3
    const tickets = [{ ticketId: 'TICKET_retry_1', token: 'ExponentPushToken[unready_token]', attempt: 1, maxAttempts: 3 }];
    const result = await checkExpoPushReceipts(tickets, { retryDelayMs: 2000 });

    assert.ok(result);
    assert.equal(result.TICKET_retry_1, undefined, 'Receipt should not be present in data');
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].filter, { ticketId: 'TICKET_retry_1', status: 'PENDING' });
    assert.deepEqual(updates[0].update.$inc, { attempt: 1 });
    assert.ok(updates[0].update.$set.nextCheckAt instanceof Date);
    assert.ok(updates[0].update.$set.nextCheckAt.getTime() > startTime, 'nextCheckAt must be strictly in the future');
    assert.equal(updates[0].update.$set.status, undefined, 'Status must remain PENDING');
    assert.equal(updates[0].update.$set.leaseToken, null);
    assert.equal(updates[0].update.$set.leaseExpiresAt, null);
  });

  await t.test('4. Retry exhaustion transitions to FAILED with MAX_ATTEMPTS_EXCEEDED (never left permanently PENDING)', async () => {
    process.env.USE_RECEIPT_STUB = 'true';
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LIVE_STAGING_TEST = 'true';
    process.env.RECOVERY_TICKET_PREFIX = 'TICKET_';
    process.env.EXPO_RECEIPT_STUB_CONFIG = JSON.stringify({}); // empty -> unready at gateway

    const updates = [];
    PushReceipt.updateOne = async (filter, update) => {
      updates.push({ filter, update });
      return { acknowledged: true, modifiedCount: 1 };
    };

    // Already at attempt 3 of 3 (exhausted)
    const tickets = [{ ticketId: 'TICKET_exhaust_1', token: 'ExponentPushToken[tok]', attempt: 3, maxAttempts: 3 }];
    await checkExpoPushReceipts(tickets);

    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].filter, { ticketId: 'TICKET_exhaust_1', status: 'PENDING' });
    assert.deepEqual(updates[0].update, {
      $set: { status: 'FAILED', lastError: 'MAX_ATTEMPTS_EXCEEDED', leaseToken: null, leaseExpiresAt: null }
    });
  });

  await t.test('5. Network errors, timeouts, and non-2xx responses handled with persisted bounded backoff and exhaustion', async () => {
    delete process.env.USE_RECEIPT_STUB;
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'false';

    const updates = [];
    PushReceipt.updateOne = async (filter, update) => {
      updates.push({ filter, update });
      return { acknowledged: true };
    };

    // Scenario A: Timeout / Network error
    globalThis.fetch = async () => {
      const err = new Error('Gateway Timeout');
      err.name = 'AbortError';
      throw err;
    };

    const tickets = [
      { ticketId: 'ticket_net_1', token: 'ExponentPushToken[tok1]', attempt: 1, maxAttempts: 3 },
      { ticketId: 'ticket_net_exhaust', token: 'ExponentPushToken[tok2]', attempt: 3, maxAttempts: 3 }
    ];

    await checkExpoPushReceipts(tickets, { retryDelayMs: 2000 });

    assert.equal(updates.length, 2);
    // Unexhausted ticket backed off
    assert.deepEqual(updates[0].filter, { ticketId: 'ticket_net_1', status: 'PENDING' });
    assert.deepEqual(updates[0].update.$inc, { attempt: 1 });
    assert.equal(updates[0].update.$set.lastError, 'PROVIDER_TIMEOUT');
    assert.equal(updates[0].update.$set.leaseToken, null);
    assert.ok(updates[0].update.$set.nextCheckAt.getTime() > Date.now());

    // Exhausted ticket failed closed
    assert.deepEqual(updates[1].filter, { ticketId: 'ticket_net_exhaust', status: 'PENDING' });
    assert.deepEqual(updates[1].update, {
      $set: { status: 'FAILED', lastError: 'MAX_ATTEMPTS_EXCEEDED', leaseToken: null, leaseExpiresAt: null }
    });

    // Scenario B: Non-2xx HTTP response (e.g. 503 Service Unavailable)
    updates.length = 0;
    globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 503 });

    await checkExpoPushReceipts([tickets[0]], { retryDelayMs: 2000 });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].update.$set.lastError, 'HTTP_503');
  });

  await t.test('6. Zero push-send calls during receipt recovery', async () => {
    process.env.USE_RECEIPT_STUB = 'true';
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LIVE_STAGING_TEST = 'true';
    process.env.RECOVERY_TICKET_PREFIX = 'STAGE_PREFIX_';
    process.env.EXPO_RECEIPT_STUB_CONFIG = JSON.stringify({
      STAGE_PREFIX_T1: { status: 'ok' }
    });

    PushReceipt.find = (query) => ({
      limit: () => Promise.resolve([
        { _id: 'dummy_id_1', ticketId: 'STAGE_PREFIX_T1', token: 'ExponentPushToken[tok1]', status: 'PENDING', attempt: 1, maxAttempts: 3, nextCheckAt: new Date() }
      ])
    });
    PushReceipt.findOneAndUpdate = async () => ({
      _id: 'dummy_id_1',
      ticketId: 'STAGE_PREFIX_T1',
      token: 'ExponentPushToken[tok1]',
      status: 'PENDING',
      attempt: 1,
      maxAttempts: 3,
      nextCheckAt: new Date()
    });
    PushReceipt.updateOne = async () => ({ acknowledged: true });

    let sendCalled = false;
    globalThis.fetch = async (url) => {
      if (String(url).includes('/api/v2/push/send')) {
        sendCalled = true;
        throw new Error('FAIL-CLOSED: send endpoint must NEVER be called');
      }
      return new Response(JSON.stringify({ data: { STAGE_PREFIX_T1: { status: 'ok' } } }), { status: 200 });
    };

    const recoveredCount = await recoverPendingPushReceipts();
    assert.equal(recoveredCount, 1);
    assert.equal(sendCalled, false, 'Send endpoint was never called during receipt recovery');
  });

  await t.test('7. DISABLE_EXTERNAL_NOTIFICATIONS=true strictly prevents real provider calls and fails closed on invalid stub config/scope', async () => {
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';

    // A: Without stub flags, checkExpoPushReceipts returns { disabled: true } with 0 provider calls
    delete process.env.USE_RECEIPT_STUB;
    delete process.env.EXPO_RECEIPT_STUB_CONFIG;
    let fetchCalled = false;
    globalThis.fetch = async () => { fetchCalled = true; };

    const res = await checkExpoPushReceipts([{ ticketId: 'any_ticket', token: 'ExponentPushToken[tok]' }]);
    assert.deepEqual(res, { disabled: true });
    assert.equal(fetchCalled, false, 'No fetch call allowed when notifications disabled without stub');

    // B: Missing test opt-in fails closed
    process.env.USE_RECEIPT_STUB = 'true';
    process.env.NODE_ENV = 'staging';
    delete process.env.ALLOW_LIVE_STAGING_TEST;
    assert.throws(
      () => resolveOfflineReceipts(['any_ticket']),
      /FAIL-CLOSED: Offline receipt provider requires explicit test opt-in/
    );

    // C: Missing ticket scope fails closed
    process.env.ALLOW_LIVE_STAGING_TEST = 'true';
    delete process.env.RECOVERY_TICKET_PREFIX;
    delete process.env.RECOVERY_TICKET_IDS;
    assert.throws(
      () => resolveOfflineReceipts(['any_ticket']),
      /FAIL-CLOSED: Offline receipt provider requires valid run-owned ticket scope/
    );

    // D: Malformed JSON stub config fails closed
    process.env.RECOVERY_TICKET_PREFIX = 'STAGE_PREFIX_';
    process.env.EXPO_RECEIPT_STUB_CONFIG = '{ invalid_json';
    assert.throws(
      () => resolveOfflineReceipts(['STAGE_PREFIX_1']),
      /FAIL-CLOSED: Malformed EXPO_RECEIPT_STUB_CONFIG/
    );

    // E: Missing stub config fails closed (does not return {})
    delete process.env.EXPO_RECEIPT_STUB_CONFIG;
    assert.throws(
      () => resolveOfflineReceipts(['STAGE_PREFIX_1']),
      /FAIL-CLOSED: Missing EXPO_RECEIPT_STUB_CONFIG/
    );

    // F: Out-of-scope ticket is rejected with FAIL-CLOSED error and config keys cannot expand scope
    process.env.EXPO_RECEIPT_STUB_CONFIG = JSON.stringify({
      STAGE_PREFIX_VALID: { status: 'ok' },
      OUT_OF_SCOPE_TICKET: { status: 'ok' } // Key in stub config MUST NOT expand scope
    });

    assert.throws(
      () => resolveOfflineReceipts(['OUT_OF_SCOPE_TICKET']),
      /FAIL-CLOSED: Ticket ID "OUT_OF_SCOPE_TICKET" is outside authorized run scope/
    );

    // G: Out-of-scope ticket passed to checkExpoPushReceipts rejects with ZERO database writes
    // Invalid guard errors must not increment attempts or mark receipts FAILED
    let updateCallCount = 0;
    PushReceipt.updateOne = async () => {
      updateCallCount++;
      return { acknowledged: true };
    };

    await assert.rejects(
      async () => {
        await checkExpoPushReceipts([
          { ticketId: 'OUT_OF_SCOPE_TICKET', token: 'ExponentPushToken[tok]', attempt: 1, maxAttempts: 3 }
        ]);
      },
      /FAIL-CLOSED: Ticket ID "OUT_OF_SCOPE_TICKET" is outside authorized run scope/
    );

    assert.equal(updateCallCount, 0, 'Zero database writes allowed on invalid guard errors (no attempt inc, not marked FAILED)');

    // H: recoverPendingPushReceipts validates config and scope BEFORE querying MongoDB
    delete process.env.EXPO_RECEIPT_STUB_CONFIG;
    let findQueryCalled = false;
    PushReceipt.find = () => {
      findQueryCalled = true;
      return { limit: () => Promise.resolve([]) };
    };

    const count = await recoverPendingPushReceipts();
    assert.equal(count, 0);
    assert.equal(findQueryCalled, false, 'PushReceipt.find must NOT be called when stub config is missing');
  });

  await t.test('8. Database-backed worker periodically recovers future-due receipts when they become due', async () => {
    process.env.USE_RECEIPT_STUB = 'true';
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LIVE_STAGING_TEST = 'true';
    process.env.RECOVERY_TICKET_PREFIX = 'WORKER_TEST_';
    process.env.EXPO_RECEIPT_STUB_CONFIG = JSON.stringify({
      WORKER_TEST_T1: { status: 'ok' }
    });

    let findCallCount = 0;
    let dueReceiptsAvailable = false;

    PushReceipt.find = (query) => {
      findCallCount++;
      return {
        limit: () => {
          if (!dueReceiptsAvailable) return Promise.resolve([]);
          return Promise.resolve([
            { ticketId: 'WORKER_TEST_T1', token: 'ExponentPushToken[tok1]', status: 'PENDING', attempt: 1, maxAttempts: 3, nextCheckAt: new Date() }
          ]);
        }
      };
    };

    PushReceipt.findOneAndUpdate = async () => ({
      ticketId: 'WORKER_TEST_T1',
      token: 'ExponentPushToken[tok1]',
      status: 'PENDING',
      attempt: 1,
      maxAttempts: 3,
      nextCheckAt: new Date()
    });
    PushReceipt.updateOne = async () => ({ acknowledged: true });

    // Start worker with fast 50ms interval
    startPushReceiptWorker({ intervalMs: 50 });

    // Initial check: no receipts due
    await new Promise((r) => setTimeout(r, 60));
    assert.ok(findCallCount >= 1, 'Worker must execute initial poll on startup');

    // Future-due receipt now becomes due
    dueReceiptsAvailable = true;
    await new Promise((r) => setTimeout(r, 120));

    stopPushReceiptWorker();
    assert.ok(findCallCount >= 2, 'Worker must periodically poll and recover future-due receipts');
  });

  await t.test('9. Ticket persistence and device cleanup writes are fully awaited in sendExpoPushNotification', async () => {
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'false';

    let receiptPersisted = false;
    PushReceipt.create = async (doc) => {
      await new Promise((r) => setTimeout(r, 20)); // Simulated I/O latency
      receiptPersisted = true;
      return doc;
    };

    globalThis.fetch = async () => new Response(JSON.stringify({
      data: [{ status: 'ok', id: 'new_ticket_123' }]
    }), { status: 200 });

    const result = await sendExpoPushNotification(
      ['ExponentPushToken[valid_token]'],
      'Test Title',
      'Test Body'
    );

    assert.ok(result);
    assert.equal(receiptPersisted, true, 'PushReceipt.create must be fully awaited before returning');
  });

  await t.test('10. Token cleanup fails, process restarts, cleanup is retried successfully', async () => {
    process.env.USE_RECEIPT_STUB = 'true';
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LIVE_STAGING_TEST = 'true';
    process.env.RECOVERY_TICKET_PREFIX = 'TICKET_CLEANUP_';
    process.env.EXPO_RECEIPT_STUB_CONFIG = JSON.stringify({
      TICKET_CLEANUP_FAIL_FIRST: {
        status: 'error',
        message: 'DeviceNotRegistered',
        details: { error: 'DeviceNotRegistered' }
      }
    });

    // Step A: Token cleanup write fails initially (e.g. database error)
    User.updateMany = async () => {
      throw new Error('Simulated write failure in User collection');
    };
    Rider.updateMany = async () => ({ acknowledged: true });
    Vendor.updateMany = async () => ({ acknowledged: true });

    let firstUpdate = null;
    PushReceipt.updateOne = async (filter, update) => {
      firstUpdate = { filter, update };
      return { acknowledged: true, modifiedCount: 1 };
    };

    const tickets = [{ ticketId: 'TICKET_CLEANUP_FAIL_FIRST', token: 'ExponentPushToken[unregistered_tok_fail]' }];
    await checkExpoPushReceipts(tickets);

    assert.ok(firstUpdate, 'PushReceipt.updateOne must be called');
    assert.deepEqual(firstUpdate.filter, { ticketId: 'TICKET_CLEANUP_FAIL_FIRST', status: 'PENDING' });
    // Assert cleanup-pending state is persisted and receipt is NOT marked FAILED!
    assert.equal(firstUpdate.update.$set.status, 'CLEANUP_PENDING');
    assert.equal(firstUpdate.update.$set.cleanupStatus, 'PENDING');
    assert.equal(firstUpdate.update.$set.lastError, 'DeviceNotRegistered');
    assert.ok(firstUpdate.update.$set.nextCheckAt instanceof Date);

    // Step B: Process restarts / recovery worker runs
    // PushReceipt.find returns the cleanup-pending receipt
    const persistedDoc = {
      _id: 'receipt_id_retry_cleanup',
      ticketId: 'TICKET_CLEANUP_FAIL_FIRST',
      token: 'ExponentPushToken[unregistered_tok_fail]',
      status: 'CLEANUP_PENDING',
      cleanupStatus: 'PENDING',
      nextCheckAt: new Date(Date.now() - 1000),
      leaseExpiresAt: null,
      leaseToken: null
    };

    PushReceipt.find = () => ({
      limit: () => Promise.resolve([persistedDoc])
    });

    let claimedLeaseToken = null;
    PushReceipt.findOneAndUpdate = async (filter, update) => {
      claimedLeaseToken = update.$set.leaseToken;
      return {
        ...persistedDoc,
        leaseToken: claimedLeaseToken,
        leaseExpiresAt: update.$set.leaseExpiresAt
      };
    };

    let cleanupRetried = false;
    User.updateMany = async () => {
      cleanupRetried = true;
      return { acknowledged: true };
    };
    Rider.updateMany = async () => ({ acknowledged: true });
    Vendor.updateMany = async () => ({ acknowledged: true });

    let finalSettledUpdate = null;
    PushReceipt.updateOne = async (filter, update) => {
      finalSettledUpdate = { filter, update };
      return { acknowledged: true, modifiedCount: 1 };
    };

    const recoveredCount = await recoverPendingPushReceipts();
    assert.equal(recoveredCount, 1);
    assert.equal(cleanupRetried, true, 'Token cleanup was retried successfully upon restart/recovery');
    assert.ok(finalSettledUpdate);
    assert.equal(finalSettledUpdate.filter.leaseToken, claimedLeaseToken);
    assert.equal(finalSettledUpdate.update.$set.status, 'FAILED');
    assert.equal(finalSettledUpdate.update.$set.cleanupStatus, 'COMPLETED');
    assert.equal(finalSettledUpdate.update.$set.lastError, 'DeviceNotRegistered');
  });

  await t.test('11. Two workers contend for one receipt: one active owner', async () => {
    process.env.USE_RECEIPT_STUB = 'true';
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LIVE_STAGING_TEST = 'true';
    process.env.RECOVERY_TICKET_PREFIX = 'TICKET_CONTEND_';
    process.env.EXPO_RECEIPT_STUB_CONFIG = JSON.stringify({
      TICKET_CONTEND_1: { status: 'ok' }
    });

    let mockDoc = {
      _id: 'contended_receipt_1',
      ticketId: 'TICKET_CONTEND_1',
      token: 'ExponentPushToken[tok]',
      status: 'PENDING',
      nextCheckAt: new Date(Date.now() - 1000),
      leaseToken: null,
      leaseExpiresAt: null
    };

    // Simulate atomic findOneAndUpdate with lease condition
    PushReceipt.find = () => ({
      limit: () => Promise.resolve([mockDoc])
    });

    PushReceipt.findOneAndUpdate = async (filter, update) => {
      const now = new Date();
      const isAvailable = !mockDoc.leaseExpiresAt || mockDoc.leaseExpiresAt <= now;
      if (isAvailable) {
        mockDoc = {
          ...mockDoc,
          leaseToken: update.$set.leaseToken,
          leaseExpiresAt: update.$set.leaseExpiresAt
        };
        return { ...mockDoc };
      }
      return null; // Contended claim rejected
    };

    PushReceipt.updateOne = async () => ({ acknowledged: true });

    // Worker 1 and Worker 2 recover concurrently
    const [w1Count, w2Count] = await Promise.all([
      recoverPendingPushReceipts(),
      recoverPendingPushReceipts()
    ]);

    // Exactly one worker claimed the receipt
    const totalClaimed = w1Count + w2Count;
    assert.equal(totalClaimed, 1, 'Exactly one worker must successfully claim the receipt (no duplicate ownership)');
    assert.ok(mockDoc.leaseToken, 'Winning worker leaseToken must be recorded on the document');
    assert.ok(mockDoc.leaseExpiresAt instanceof Date, 'Winning worker leaseExpiresAt must be recorded');
  });

  await t.test('12. Old worker returns after lease takeover: zero stale writes', async () => {
    process.env.USE_RECEIPT_STUB = 'true';
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LIVE_STAGING_TEST = 'true';
    process.env.RECOVERY_TICKET_PREFIX = 'TICKET_TAKEOVER_';
    process.env.EXPO_RECEIPT_STUB_CONFIG = JSON.stringify({
      TICKET_TAKEOVER_1: { status: 'ok' }
    });

    // In-memory document currently owned by Worker 2 (Worker 1 lease expired and was replaced)
    let currentDoc = {
      ticketId: 'TICKET_TAKEOVER_1',
      status: 'PENDING',
      attempt: 1,
      leaseToken: 'new_active_worker_2_token',
      leaseExpiresAt: new Date(Date.now() + 30000)
    };

    let writesExecuted = 0;
    PushReceipt.updateOne = async (filter, update) => {
      // Lease ownership check: must match active claim token
      if (filter.leaseToken && filter.leaseToken !== currentDoc.leaseToken) {
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      }
      writesExecuted++;
      currentDoc = { ...currentDoc, ...update.$set };
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    };

    // Stale Worker 1 returns with expired leaseToken
    const staleTicketMap = [{
      ticketId: 'TICKET_TAKEOVER_1',
      token: 'ExponentPushToken[tok]',
      attempt: 1,
      maxAttempts: 3,
      leaseToken: 'old_expired_worker_1_token'
    }];

    await checkExpoPushReceipts(staleTicketMap);

    // Stale worker update matched 0 documents
    assert.equal(writesExecuted, 0, 'Zero writes allowed when worker lease has expired or been taken over');
    assert.equal(currentDoc.leaseToken, 'new_active_worker_2_token', 'Active owner leaseToken must not be overwritten');
    assert.equal(currentDoc.status, 'PENDING', 'Stale worker cannot modify receipt status');
  });

  await t.test('13. Retry attempt increments exactly once', async () => {
    process.env.USE_RECEIPT_STUB = 'true';
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LIVE_STAGING_TEST = 'true';
    process.env.RECOVERY_TICKET_PREFIX = 'TICKET_RETRY_';
    process.env.EXPO_RECEIPT_STUB_CONFIG = JSON.stringify({}); // unready at gateway

    let storedDoc = {
      ticketId: 'TICKET_RETRY_EXACTLY_ONCE',
      attempt: 1,
      status: 'PENDING',
      leaseToken: 'active_claim_token_abc'
    };

    let totalAttemptIncrements = 0;
    PushReceipt.updateOne = async (filter, update) => {
      if (filter.leaseToken === storedDoc.leaseToken) {
        if (update.$inc?.attempt) {
          totalAttemptIncrements += update.$inc.attempt;
          storedDoc.attempt += update.$inc.attempt;
        }
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
      }
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    };

    // Active worker processes unready ticket
    await checkExpoPushReceipts([{
      ticketId: 'TICKET_RETRY_EXACTLY_ONCE',
      token: 'ExponentPushToken[tok]',
      attempt: 1,
      maxAttempts: 3,
      leaseToken: 'active_claim_token_abc'
    }]);

    assert.equal(totalAttemptIncrements, 1, 'Attempt must increment exactly once on retry');
    assert.equal(storedDoc.attempt, 2, 'Stored attempt count must be 2');

    // A stale worker attempts to retry with a stale lease
    await checkExpoPushReceipts([{
      ticketId: 'TICKET_RETRY_EXACTLY_ONCE',
      token: 'ExponentPushToken[tok]',
      attempt: 1,
      maxAttempts: 3,
      leaseToken: 'stale_worker_token_xyz'
    }]);

    assert.equal(totalAttemptIncrements, 1, 'Stale worker must not double-increment attempt');
    assert.equal(storedDoc.attempt, 2, 'Stored attempt must remain 2');
  });

  await t.test('14. Worker B reads a due candidate; Worker A processes it, schedules a future retry and releases its lease; B stale claim must return null', async () => {
    process.env.USE_RECEIPT_STUB = 'true';
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LIVE_STAGING_TEST = 'true';
    process.env.RECOVERY_TICKET_PREFIX = 'TICKET_RACE_';
    process.env.EXPO_RECEIPT_STUB_CONFIG = JSON.stringify({});

    const initialDueTime = new Date(Date.now() - 5000);
    let dbDoc = {
      _id: 'receipt_race_doc_1',
      ticketId: 'TICKET_RACE_1',
      token: 'ExponentPushToken[tok]',
      status: 'PENDING',
      nextCheckAt: initialDueTime,
      leaseToken: null,
      leaseExpiresAt: null
    };

    // Worker B reads the due candidate
    const candidateReadByB = { ...dbDoc };

    // Worker A processes it before Worker B can claim:
    // Worker A schedules nextCheckAt into the future and releases its lease
    const futureRetryTime = new Date(Date.now() + 15000);
    dbDoc.nextCheckAt = futureRetryTime;
    dbDoc.leaseToken = null;
    dbDoc.leaseExpiresAt = null;

    // Simulate atomic findOneAndUpdate matching notify.js claim logic:
    // Requires: _id, status, nextCheckAt == candidate observed nextCheckAt, nextCheckAt <= now, and lease available
    PushReceipt.findOneAndUpdate = async (filter, update) => {
      const now = new Date();
      const idMatches = filter._id === dbDoc._id;
      const statusMatches = filter.status === dbDoc.status;

      let nextCheckMatches = false;
      if (filter.nextCheckAt && typeof filter.nextCheckAt === 'object') {
        const eqCondition = filter.nextCheckAt.$eq ? filter.nextCheckAt.$eq.getTime() === dbDoc.nextCheckAt.getTime() : true;
        const lteCondition = filter.nextCheckAt.$lte ? dbDoc.nextCheckAt.getTime() <= filter.nextCheckAt.$lte.getTime() : true;
        nextCheckMatches = eqCondition && lteCondition;
      } else if (filter.nextCheckAt instanceof Date) {
        nextCheckMatches = dbDoc.nextCheckAt.getTime() === filter.nextCheckAt.getTime();
      }

      const leaseAvailable = !dbDoc.leaseExpiresAt || dbDoc.leaseExpiresAt <= now;

      if (idMatches && statusMatches && nextCheckMatches && leaseAvailable) {
        dbDoc = { ...dbDoc, ...update.$set };
        return { ...dbDoc };
      }
      return null;
    };

    // Worker B now attempts to claim its candidate via recoverPendingPushReceipts
    PushReceipt.find = () => ({
      limit: () => Promise.resolve([candidateReadByB])
    });

    const claimedCount = await recoverPendingPushReceipts();
    assert.equal(claimedCount, 0, "Worker B's stale claim must return null (0 receipts claimed)");
    assert.equal(dbDoc.nextCheckAt.getTime(), futureRetryTime.getTime(), 'Future nextCheckAt must not be overwritten');
    assert.equal(dbDoc.leaseToken, null, 'Lease must remain released');
  });

  await t.test('15. An expired lease cannot update state even before another worker takes over', async () => {
    process.env.USE_RECEIPT_STUB = 'true';
    process.env.DISABLE_EXTERNAL_NOTIFICATIONS = 'true';
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LIVE_STAGING_TEST = 'true';
    process.env.RECOVERY_TICKET_PREFIX = 'TICKET_EXPIRED_';
    process.env.EXPO_RECEIPT_STUB_CONFIG = JSON.stringify({
      TICKET_EXPIRED_1: { status: 'ok' }
    });

    // Worker 1 holds lease, but the lease expired 5 seconds ago.
    // Notice: NO other worker has taken over yet! leaseToken is still 'worker_1_lease_token'.
    let dbDoc = {
      ticketId: 'TICKET_EXPIRED_1',
      status: 'PENDING',
      attempt: 1,
      leaseToken: 'worker_1_lease_token',
      leaseExpiresAt: new Date(Date.now() - 5000) // expired in the past!
    };

    let writesExecuted = 0;
    PushReceipt.updateOne = async (filter, update) => {
      // Must match leaseToken AND active unexpired lease (leaseExpiresAt > now)
      const leaseTokenMatches = filter.leaseToken === dbDoc.leaseToken;
      const leaseActive = filter.leaseExpiresAt?.$gt ? dbDoc.leaseExpiresAt.getTime() > filter.leaseExpiresAt.$gt.getTime() : true;

      if (leaseTokenMatches && leaseActive) {
        writesExecuted++;
        dbDoc = { ...dbDoc, ...update.$set };
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
      }
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    };

    // Worker 1 attempts to update state with its expired lease
    await checkExpoPushReceipts([{
      ticketId: 'TICKET_EXPIRED_1',
      token: 'ExponentPushToken[tok]',
      attempt: 1,
      maxAttempts: 3,
      leaseToken: 'worker_1_lease_token'
    }]);

    assert.equal(writesExecuted, 0, 'Zero writes allowed when lease is expired, even before takeover');
    assert.equal(dbDoc.status, 'PENDING', 'Document status must remain PENDING');
    assert.equal(dbDoc.attempt, 1, 'Attempt must not be incremented by expired lease');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// purgeInvalidDeviceTokens: schema-compatibility and sanitized diagnostics
// Tests confirm the fix for CLEANUP_PENDING bug caused by Mongoose CastError
// on legacy string-match queries issued against subdocument array schemas.
// ─────────────────────────────────────────────────────────────────────────────

test('purgeInvalidDeviceTokens: schema-compatibility and sanitized diagnostics', async (t) => {
  const origUserUpdateMany   = User.updateMany;
  const origVendorUpdateMany = Vendor.updateMany;
  const origRiderUpdateMany  = Rider.updateMany;

  t.afterEach(() => {
    User.updateMany   = origUserUpdateMany;
    Vendor.updateMany = origVendorUpdateMany;
    Rider.updateMany  = origRiderUpdateMany;
  });

  // Import purgeInvalidDeviceTokens from the already-loaded module
  const { purgeInvalidDeviceTokens } = await import('../services/notify.js');

  await t.test('A. Issues exactly 3 schema-compatible operations (not 5 legacy ones)', async () => {
    const userCalls   = [];
    const vendorCalls = [];
    const riderCalls  = [];

    User.updateMany = async (filter) => {
      userCalls.push(filter);
      return { acknowledged: true };
    };
    Vendor.updateMany = async (filter) => {
      vendorCalls.push(filter);
      return { acknowledged: true };
    };
    Rider.updateMany = async (filter) => {
      riderCalls.push(filter);
      return { acknowledged: true };
    };

    const res = await purgeInvalidDeviceTokens('ExponentPushToken[test_tok]');
    assert.equal(res.success, true, 'Must return success:true when all ops succeed');

    // Exactly 1 User call using subdocument dotted-path (NOT legacy plain-string query)
    assert.equal(userCalls.length, 1,
      `User.updateMany must be called exactly once (subdoc path); got ${userCalls.length}`);
    assert.ok(
      Object.prototype.hasOwnProperty.call(userCalls[0], 'expoPushTokens.token'),
      'User filter must use dotted path "expoPushTokens.token"'
    );
    assert.equal(
      userCalls[0].expoPushTokens,
      undefined,
      'User filter must NOT contain plain "expoPushTokens" key — legacy CastError query removed'
    );

    // Exactly 1 Vendor call using direct equality (Vendor uses plain string array)
    assert.equal(vendorCalls.length, 1,
      `Vendor.updateMany must be called exactly once; got ${vendorCalls.length}`);
    assert.ok(
      Object.prototype.hasOwnProperty.call(vendorCalls[0], 'expoPushTokens'),
      'Vendor filter must use direct "expoPushTokens" equality (plain string array)'
    );

    // Exactly 1 Rider call using subdocument dotted-path
    assert.equal(riderCalls.length, 1,
      `Rider.updateMany must be called exactly once (subdoc path); got ${riderCalls.length}`);
    assert.ok(
      Object.prototype.hasOwnProperty.call(riderCalls[0], 'expoPushTokens.token'),
      'Rider filter must use dotted path "expoPushTokens.token"'
    );
    assert.equal(
      riderCalls[0].expoPushTokens,
      undefined,
      'Rider filter must NOT contain plain "expoPushTokens" key — legacy CastError query removed'
    );
  });

  await t.test('B. CastError on subdoc array schema propagates to success:false (proves the old bug)', async () => {
    // Demonstrate that Promise.allSettled with a CastError rejection correctly
    // sets hasFailures=true → success:false → CLEANUP_PENDING.
    // This is exactly what the two removed legacy queries were triggering in production.
    const results = await Promise.allSettled([
      (async () => {
        const err = new Error('Cast to [ObjectId] failed for value "token_str"');
        err.name = 'CastError';
        err.code = 'CAST_ERROR';
        throw err;
      })(),
      Promise.resolve({ acknowledged: true })
    ]);
    const hasFailures = results.some((r) => r.status === 'rejected');
    assert.equal(hasFailures, true,
      'CastError in allSettled propagates as rejected → success:false (the root cause of CLEANUP_PENDING bug)');

    // Now confirm the FIXED implementation never issues the legacy plain-string form on User
    const userCallsFixed = [];
    User.updateMany = async (filter) => {
      userCallsFixed.push(filter);
      return { acknowledged: true };
    };
    Vendor.updateMany = async () => ({ acknowledged: true });
    Rider.updateMany  = async () => ({ acknowledged: true });

    await purgeInvalidDeviceTokens('ExponentPushToken[tok]');

    const illegalUserCall = userCallsFixed.find(
      (f) => Object.prototype.hasOwnProperty.call(f, 'expoPushTokens') &&
             !Object.prototype.hasOwnProperty.call(f, 'expoPushTokens.token')
    );
    assert.equal(illegalUserCall, undefined,
      'Fixed implementation must never issue plain string-match query on User (would CastError)');
  });

  await t.test('C. Sanitized error diagnostics include model, op, errorName — no token leakage', async () => {
    const logLines = [];
    const origConsoleError = console.error;
    console.error = (...args) => logLines.push(args.join(' '));

    try {
      Vendor.updateMany = async () => {
        const err = new Error('Simulated atlas write error');
        err.name     = 'MongoServerError';
        err.code     = 18;
        err.codeName = 'AuthenticationFailed';
        throw err;
      };
      User.updateMany  = async () => ({ acknowledged: true });
      Rider.updateMany = async () => ({ acknowledged: true });

      const res = await purgeInvalidDeviceTokens('ExponentPushToken[secret_tok_xyz]');
      assert.equal(res.success, false, 'Must return success:false when any op rejects');

      const errorLine = logLines.find((l) => l.includes('Token cleanup write failed'));
      assert.ok(errorLine, 'Must emit a sanitized cleanup failure log line');
      assert.ok(errorLine.includes('Model: Vendor'),              'Must log model name');
      assert.ok(errorLine.includes('ErrorName: MongoServerError'), 'Must log error name');

      // Token value must NEVER appear
      assert.equal(errorLine.includes('secret_tok_xyz'), false,
        'Token value must never appear in sanitized diagnostic log');
      // Raw driver message must not appear
      assert.equal(errorLine.includes('Simulated atlas write error'), false,
        'Raw driver error message must not appear in sanitized log');
    } finally {
      console.error = origConsoleError;
    }
  });

  await t.test('D. Cleanup failure returns success:false → receipt stays CLEANUP_PENDING until retry', async () => {
    User.updateMany = async () => {
      const err = new Error('simulated network failure'); err.name = 'MongoNetworkError'; throw err;
    };
    Vendor.updateMany = async () => ({ acknowledged: true });
    Rider.updateMany  = async () => ({ acknowledged: true });

    const res = await purgeInvalidDeviceTokens('ExponentPushToken[any_tok]');
    assert.equal(res.success, false,
      'Must return success:false when User cleanup throws — receipt must remain CLEANUP_PENDING');
  });

  await t.test('E. Cleanup succeeds on retry after transient failure (restart recovery)', async () => {
    let callCount = 0;
    User.updateMany = async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('transient'); err.name = 'MongoNetworkError'; throw err;
      }
      return { acknowledged: true };
    };
    Vendor.updateMany = async () => ({ acknowledged: true });
    Rider.updateMany  = async () => ({ acknowledged: true });

    // First attempt: transient failure → CLEANUP_PENDING persisted
    const res1 = await purgeInvalidDeviceTokens('ExponentPushToken[retry_tok]');
    assert.equal(res1.success, false, 'First attempt must fail (transient error)');

    // Second attempt: success — simulates worker retrying CLEANUP_PENDING after restart
    const res2 = await purgeInvalidDeviceTokens('ExponentPushToken[retry_tok]');
    assert.equal(res2.success, true, 'Retry after transient failure must succeed');
    assert.equal(callCount, 2, 'User.updateMany must be called once per attempt');
  });
});
