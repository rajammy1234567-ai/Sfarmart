// server/tests/durableReceiptRecovery.liveStaging.test.js
// Focused E2E integration test: Durable Push-Receipt Recovery Across Backend Process Restart.
//
// Key Assertions & Sequence:
// 1. Validate strict staging guards and connect to MongoDB Atlas (staging disposable database only).
// 2. Persist 4 future-due PushReceipt documents and disposable User fixture in MongoDB:
//    - okDoc: attempt: 1, maxAttempts: 3, nextCheckAt: future -> transitions to COMPLETED in Child 2
//    - errDoc: attempt: 1, maxAttempts: 3, nextCheckAt: future -> transitions to FAILED (DeviceNotRegistered) and invalid token pulled from User
//    - exhaustDoc: attempt: 3, maxAttempts: 3, nextCheckAt: future -> transitions to FAILED (MAX_ATTEMPTS_EXCEEDED) (persisted retry exhaustion)
//    - retryDoc: attempt: 1, maxAttempts: 3, nextCheckAt: future -> attempt incremented to 2, nextCheckAt pushed strictly in future, remains PENDING
// 3. Start Child 1 on port 6001 with test recovery scope (scoping receipts, orders, and riders).
//    Stop Child 1 BEFORE receipts become due. Confirm termination and port closure.
//    Assert Date.now() < nextCheckAt when Child 1 terminates.
// 4. Start Child 2 BEFORE nextCheckAt with distinct PID (pid2 !== pid1).
//    Child 2 startup check finds receipts still in future.
//    Child 2 periodic database worker processes receipts when nextCheckAt arrives.
// 5. Measure provider calls using child-process IPC:
//    - Assert exactly 0 push-send calls across BOTH Child 1 and Child 2.
//    - Assert offline provider getReceipts calls > 0 in Child 2.
//    - Assert nextCheckAt is strictly in the future for retried receipts.
// 6. Cleanly stop Child 2, confirm exit and port closure.
// 7. Surgical teardown: delete all run-owned fixtures and propagate cleanup failures.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import User from '../models/User.js';
import PushReceipt from '../models/PushReceipt.js';
import {
  APPROVED_STAGING_HOST,
  APPROVED_DATABASE
} from '../config/db.js';

import {
  API_BASE,
  FIXTURE_PREFIX,
  createFixtureTracker,
  validateLiveStagingGuards,
  verifyTargetApiStagingEnvironment,
  performTeardown
} from './helpers/liveStagingHelpers.js';

import {
  waitForPortClosed,
  isProcessTerminated,
  stopBackend,
  spawnBackend
} from './helpers/processManagementHelper.js';

const fixtureIds = createFixtureTracker();
let fixtureUser = null;
let child1Proc = null;
let child2Proc = null;
let child1IpcEvents = [];
let child2IpcEvents = [];

const targetPort = Number(process.env.PORT) || 6001;
const isLiveStagingOptIn =
  process.env.ALLOW_LIVE_STAGING_TEST === 'true' ||
  process.env.ALLOW_STAGING_ATLAS_TEST === 'true';

if (!isLiveStagingOptIn) {
  test('Offline Guard: Push receipt recovery test blocked without explicit opt-in (0 connects, 0 writes)', () => {
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
  after(async () => {
    if (child2Proc) {
      try { await stopBackend(child2Proc, targetPort); } catch (e) { console.error('Error stopping child2 in global after:', e.message); }
      child2Proc = null;
    }
    if (child1Proc) {
      try { await stopBackend(child1Proc, targetPort); } catch (e) { console.error('Error stopping child1 in global after:', e.message); }
      child1Proc = null;
    }
    await performTeardown(FIXTURE_PREFIX, fixtureIds);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test('Live Staging: Durable Push-Receipt Recovery Across Process Restart', async (t) => {
    let failedPrerequisite = false;

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

    // Guard check before connecting to MongoDB Atlas
    const guardConfig = validateLiveStagingGuards(process.env);
    console.log(`\n📌 [LiveReceiptRecovery] Fixture Prefix: ${FIXTURE_PREFIX}`);

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

    const okTicketId = `${FIXTURE_PREFIX}_TICKET_OK`;
    const errTicketId = `${FIXTURE_PREFIX}_TICKET_DEVICE_ERR`;
    const exhaustTicketId = `${FIXTURE_PREFIX}_TICKET_EXHAUST`;
    const retryTicketId = `${FIXTURE_PREFIX}_TICKET_RETRYABLE`;

    const deadToken = `ExponentPushToken[${FIXTURE_PREFIX}_dead_dev_token]`;
    const validToken = `ExponentPushToken[${FIXTURE_PREFIX}_valid_dev_token]`;
    const exhaustToken = `ExponentPushToken[${FIXTURE_PREFIX}_exhaust_dev_token]`;
    const retryToken = `ExponentPushToken[${FIXTURE_PREFIX}_retry_dev_token]`;

    let receiptOkDoc = null;
    let receiptErrDoc = null;
    let receiptExhaustDoc = null;
    let receiptRetryDoc = null;
    let futureCheckAt = null;

    const stubConfig = {
      [okTicketId]: { status: 'ok' },
      [errTicketId]: {
        status: 'error',
        message: 'DeviceNotRegistered',
        details: { error: 'DeviceNotRegistered' }
      }
      // exhaustTicketId and retryTicketId are intentionally omitted to simulate unready provider receipts
    };

    // Shared spawn options scoping both receipts and startup order/rider recovery to this run
    const spawnOptions = {
      fixturePrefix: FIXTURE_PREFIX,
      orderPrefix: FIXTURE_PREFIX,
      riderPrefix: FIXTURE_PREFIX,
      ticketPrefix: FIXTURE_PREFIX,
      ticketIds: [okTicketId, errTicketId, exhaustTicketId, retryTicketId],
      useReceiptStub: true,
      stubConfig,
      nodeOptions: '--import ./server/tests/receiptStub.js'
    };

    // Fail-closed preflight prerequisite check:
    // Verify collection existence, required indexes, and read/write privileges on pushreceipts
    // BEFORE creating any User or PushReceipt fixtures.
    let prerequisiteError = null;
    try {
      const collections = await mongoose.connection.db.listCollections({ name: 'pushreceipts' }).toArray();
      if (collections.length === 0) {
        throw new Error(`Collection "pushreceipts" does not exist in staging database "${APPROVED_DATABASE}". Run provisionStagingDb.js with admin credentials first.`);
      }

      const existingIndexes = await mongoose.connection.db.collection('pushreceipts').indexes();
      const indexNames = existingIndexes.map((idx) => idx.name);
      const REQUIRED_INDEXES = [
        'ticketId_1',
        'nextCheckAt_1',
        'status_1',
        'cleanupStatus_1',
        'leaseToken_1',
        'leaseExpiresAt_1'
      ];
      for (const reqIdx of REQUIRED_INDEXES) {
        if (!indexNames.includes(reqIdx)) {
          throw new Error(`Required index "${reqIdx}" is missing on "pushreceipts". Run provisionStagingDb.js first.`);
        }
      }

      // Probe find privilege
      try {
        await PushReceipt.findOne().select('_id').lean();
      } catch (findErr) {
        throw new Error(`Insufficient read privileges on "${APPROVED_DATABASE}.pushreceipts": ${findErr.message}. Ensure staging user has find privilege.`);
      }

      // Probe insert, update, and delete privileges using a disposable probe document
      const probeId = new mongoose.Types.ObjectId();
      const probeTicket = `${FIXTURE_PREFIX}_PREFLIGHT_PROBE`;
      try {
        await PushReceipt.create({
          _id: probeId,
          ticketId: probeTicket,
          token: 'ExponentPushToken[probe]',
          nextCheckAt: new Date(Date.now() + 60000),
          status: 'PENDING'
        });
      } catch (insertErr) {
        throw new Error(`Insufficient write (insert) privileges on "${APPROVED_DATABASE}.pushreceipts": ${insertErr.message}. Ensure staging user has insert privilege.`);
      }

      try {
        await PushReceipt.updateOne({ _id: probeId }, { $set: { status: 'COMPLETED' } });
      } catch (updateErr) {
        throw new Error(`Insufficient write (update) privileges on "${APPROVED_DATABASE}.pushreceipts": ${updateErr.message}. Ensure staging user has update privilege.`);
      }

      try {
        await PushReceipt.deleteOne({ _id: probeId });
      } catch (deleteErr) {
        throw new Error(`Insufficient write (delete) privileges on "${APPROVED_DATABASE}.pushreceipts": ${deleteErr.message}. Ensure staging user has delete privilege.`);
      }
    } catch (prereqErr) {
      prerequisiteError = prereqErr;
      failedPrerequisite = true;
      console.error(`\n❌ [LiveReceiptRecovery PREFLIGHT FAILURE] ${prereqErr.message}\n`);
    }

    // Step 1: Persist disposable user and future-due receipts in MongoDB
    await t.test('Step 1: Persist future-due push receipts and disposable user fixture', async (sub) => {
      if (failedPrerequisite) {
        throw new Error(`Prerequisite failed before creating fixtures: ${prerequisiteError?.message || 'unknown error'}`);
      }
      try {
        const randomPhone = Math.floor(1000000 + Math.random() * 9000000);
        fixtureUser = await User.create({
          name: `${FIXTURE_PREFIX}_User`,
          phone: `984${randomPhone}`,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          isStagingFixture: true,
          fixtureRunId: FIXTURE_PREFIX,
          expoPushTokens: [
            { token: deadToken, platform: 'android', deviceId: `${FIXTURE_PREFIX}_DEV1` }
          ]
        });
        fixtureIds.users.add(fixtureUser._id.toString());
        fixtureIds.tokens.add(deadToken);

        // Receipts are scheduled 16 seconds in the future for reliable timing margin
        futureCheckAt = new Date(Date.now() + 16000);

        receiptOkDoc = await PushReceipt.create({
          ticketId: okTicketId,
          token: validToken,
          recipientRole: 'CUSTOMER',
          recipientId: fixtureUser._id,
          attempt: 1,
          maxAttempts: 3,
          nextCheckAt: futureCheckAt,
          status: 'PENDING'
        });
        fixtureIds.receipts.add(receiptOkDoc._id.toString());

        receiptErrDoc = await PushReceipt.create({
          ticketId: errTicketId,
          token: deadToken,
          recipientRole: 'CUSTOMER',
          recipientId: fixtureUser._id,
          attempt: 1,
          maxAttempts: 3,
          nextCheckAt: futureCheckAt,
          status: 'PENDING'
        });
        fixtureIds.receipts.add(receiptErrDoc._id.toString());

        receiptExhaustDoc = await PushReceipt.create({
          ticketId: exhaustTicketId,
          token: exhaustToken,
          recipientRole: 'CUSTOMER',
          recipientId: fixtureUser._id,
          attempt: 3, // Already at maxAttempts to test retry exhaustion
          maxAttempts: 3,
          nextCheckAt: futureCheckAt,
          status: 'PENDING'
        });
        fixtureIds.receipts.add(receiptExhaustDoc._id.toString());

        receiptRetryDoc = await PushReceipt.create({
          ticketId: retryTicketId,
          token: retryToken,
          recipientRole: 'CUSTOMER',
          recipientId: fixtureUser._id,
          attempt: 1,
          maxAttempts: 3,
          nextCheckAt: futureCheckAt,
          status: 'PENDING'
        });
        fixtureIds.receipts.add(receiptRetryDoc._id.toString());

        assert.ok(receiptOkDoc._id && receiptErrDoc._id && receiptExhaustDoc._id && receiptRetryDoc._id, 'All 4 receipts must be persisted in database');
      } catch (err) {
        failedPrerequisite = true;
        prerequisiteError = err;
        throw err;
      }
    });

    let pid1 = null;

    // Step 2: Start Child 1, stop before receipts become due, confirm exit and port closure
    await t.test('Step 2: Start Child 1 before due time, stop process, and confirm port closed', async (sub) => {
      if (failedPrerequisite) return sub.skip(`Prerequisite failed: ${prerequisiteError?.message || 'unknown error'}`);
      try {
        child1Proc = await spawnBackend(targetPort, {
          ...spawnOptions,
          onMessage: (msg) => child1IpcEvents.push(msg)
        });
        pid1 = child1Proc.pid;
        assert.ok(Number.isInteger(pid1) && pid1 > 0, 'Child 1 PID must be a valid integer');

        // Allow Child 1 to run briefly (receipts are due in ~14 seconds, so not yet due)
        await new Promise((r) => setTimeout(r, 1500));

        // Verify in database that receipts have NOT been prematurely processed
        const okCheck = await PushReceipt.findById(receiptOkDoc._id);
        const retryCheck = await PushReceipt.findById(receiptRetryDoc._id);
        assert.equal(okCheck.status, 'PENDING', 'Receipts must remain PENDING while nextCheckAt is in the future');
        assert.equal(okCheck.attempt, 1, 'Attempt must remain unchanged before due time');
        assert.equal(retryCheck.attempt, 1, 'Retry attempt must remain unchanged before due time');

        // Stop Child 1 and confirm exit and port closure
        await stopBackend(child1Proc, targetPort);
        assert.equal(isProcessTerminated(child1Proc), true, `Child 1 (PID ${pid1}) must be terminated`);
        const closed = await waitForPortClosed(targetPort, 6000);
        assert.equal(closed, true, `Port ${targetPort} must be verified closed after Child 1 exit`);

        // Explicitly confirm Child 1 stopped strictly BEFORE nextCheckAt was reached
        assert.ok(
          Date.now() < futureCheckAt.getTime(),
          `Child 1 must have stopped before receipt due time (now: ${Date.now()}, due: ${futureCheckAt.getTime()})`
        );
        child1Proc = null;
      } catch (err) {
        failedPrerequisite = true;
        prerequisiteError = err;
        throw err;
      }
    });

    let pid2 = null;

    // Step 3: Start Child 2 BEFORE nextCheckAt to test periodic background worker processing
    await t.test('Step 3: Start Child 2 before nextCheckAt with distinct PID', async (sub) => {
      if (failedPrerequisite) return sub.skip(`Prerequisite failed: ${prerequisiteError?.message || 'unknown error'}`);
      try {
        // Confirm we are still before nextCheckAt
        const msRemaining = futureCheckAt.getTime() - Date.now();
        assert.ok(msRemaining > 1000, `Child 2 must be started before nextCheckAt to test periodic worker (${msRemaining}ms remaining)`);

        child2Proc = await spawnBackend(targetPort, {
          ...spawnOptions,
          onMessage: (msg) => child2IpcEvents.push(msg)
        });
        pid2 = child2Proc.pid;
        assert.ok(Number.isInteger(pid2) && pid2 > 0, 'Child 2 PID must be a valid integer');
        assert.notEqual(pid2, pid1, `Child 2 PID (${pid2}) must differ from Child 1 PID (${pid1})`);
      } catch (err) {
        failedPrerequisite = true;
        prerequisiteError = err;
        throw err;
      }
    });

    // Step 4: Keep Child 2 running across nextCheckAt and assert periodic worker recovery
    await t.test('Step 4: Keep Child 2 running across nextCheckAt and assert periodic worker recovery', async (sub) => {
      if (failedPrerequisite) return sub.skip(`Prerequisite failed: ${prerequisiteError?.message || 'unknown error'}`);
      try {
        // Poll MongoDB across nextCheckAt for receipt updates (up to 20s bounded deadline)
        const pollDeadline = Date.now() + 20000;
        let okSettled = false;
        let errSettled = false;
        let exhaustSettled = false;
        let retrySettled = false;

        let latestOk = null;
        let latestErr = null;
        let latestExhaust = null;
        let latestRetry = null;

        while (Date.now() < pollDeadline) {
          latestOk = await PushReceipt.findById(receiptOkDoc._id);
          latestErr = await PushReceipt.findById(receiptErrDoc._id);
          latestExhaust = await PushReceipt.findById(receiptExhaustDoc._id);
          latestRetry = await PushReceipt.findById(receiptRetryDoc._id);

          if (latestOk?.status === 'COMPLETED') okSettled = true;
          if (latestErr?.status === 'FAILED') errSettled = true;
          if (latestExhaust?.status === 'FAILED') exhaustSettled = true;
          if (latestRetry?.attempt >= 2) retrySettled = true;

          if (okSettled && errSettled && exhaustSettled && retrySettled) break;
          await new Promise((r) => setTimeout(r, 400));
        }

        // 1. Success outcome verification
        assert.ok(latestOk, 'Success receipt must exist');
        assert.equal(latestOk.status, 'COMPLETED', 'Ticket OK must transition to COMPLETED via periodic worker');

        // 2. DeviceNotRegistered outcome & token purge verification
        assert.ok(latestErr, 'Error receipt must exist');
        assert.equal(latestErr.status, 'FAILED', 'Ticket ERR must transition to FAILED');
        assert.equal(latestErr.lastError, 'DeviceNotRegistered', 'lastError must record DeviceNotRegistered');

        const updatedUser = await User.findById(fixtureUser._id);
        assert.ok(updatedUser, 'User fixture must exist');
        const hasDeadTokenAfter = (updatedUser.expoPushTokens || []).some(
          (t) => (t?.token || t) === deadToken
        );
        assert.equal(hasDeadTokenAfter, false, 'Invalid push token must be surgically purged from User document');

        // 3. Retry exhaustion verification (never left permanently PENDING)
        assert.ok(latestExhaust, 'Exhausted receipt must exist');
        assert.equal(latestExhaust.status, 'FAILED', 'Exhausted receipt must transition to FAILED');
        assert.equal(latestExhaust.lastError, 'MAX_ATTEMPTS_EXCEEDED', 'lastError must record MAX_ATTEMPTS_EXCEEDED');
        assert.equal(latestExhaust.attempt, 3, 'Persisted attempt count of 3 must be preserved');

        // 4. Retryable unready receipt verification
        assert.ok(latestRetry, 'Retryable receipt must exist');
        assert.equal(latestRetry.status, 'PENDING', 'Retryable receipt must remain PENDING');
        assert.equal(latestRetry.attempt, 2, 'Retryable receipt attempt must be incremented from 1 to 2');
        assert.ok(
          latestRetry.nextCheckAt.getTime() > Date.now(),
          'nextCheckAt must be strictly in the future when scheduling retries'
        );
      } catch (err) {
        failedPrerequisite = true;
        prerequisiteError = err;
        throw err;
      }
    });

    // Step 5: Verify IPC telemetry across BOTH children and assert zero push-send calls
    await t.test('Step 5: Verify buffered IPC telemetry and assert zero push-send calls across both children', async (sub) => {
      if (failedPrerequisite) return sub.skip(`Prerequisite failed: ${prerequisiteError?.message || 'unknown error'}`);
      try {
        const allChild1Events = child1Proc?.ipcEvents || child1IpcEvents;
        const allChild2Events = child2Proc?.ipcEvents || child2IpcEvents;

        const child1Sends = allChild1Events.filter((e) => e.action === 'sendPush' || e.type === 'NOTIFICATION_INVOCATION').length;
        const child2Sends = allChild2Events.filter((e) => e.action === 'sendPush' || e.type === 'NOTIFICATION_INVOCATION').length;

        assert.equal(child1Sends, 0, 'Child 1 must execute exactly zero push notification send calls');
        assert.equal(child2Sends, 0, 'Child 2 must execute exactly zero push notification send calls');

        const child2Receipts = allChild2Events.filter((e) => e.action === 'getReceipts').length;
        assert.ok(child2Receipts > 0, 'Child 2 must have invoked receipt check via IPC');
      } catch (err) {
        failedPrerequisite = true;
        prerequisiteError = err;
        throw err;
      }
    });

    // Step 6: Clean shutdown of Child 2
    await t.test('Step 6: Cleanly stop Child 2 and verify port closure', async (sub) => {
      if (failedPrerequisite) return sub.skip(`Prerequisite failed: ${prerequisiteError?.message || 'unknown error'}`);
      if (!child2Proc) return sub.skip('Child 2 was not spawned');
      const pid = child2Proc.pid;
      await stopBackend(child2Proc, targetPort);
      assert.equal(isProcessTerminated(child2Proc), true, `Child 2 (PID ${pid}) must be terminated`);
      const portClosed = await waitForPortClosed(targetPort, 6000);
      assert.equal(portClosed, true, `Port ${targetPort} must be verified closed`);
      child2Proc = null;
    });

    // Step 7: Surgical Teardown and failure propagation
    await t.test('Step 7: Surgical teardown of all run-owned receipts and fixtures', async (sub) => {
      if (failedPrerequisite && fixtureIds.users.size === 0 && fixtureIds.receipts.size === 0) {
        return sub.skip(`Prerequisite failed with zero fixtures created: ${prerequisiteError?.message || 'unknown error'}`);
      }
      await performTeardown(FIXTURE_PREFIX, fixtureIds);
      assert.equal(fixtureIds.receipts.size, 4, '4 receipts were tracked for surgical deletion');
      assert.equal(fixtureIds.users.size, 1, '1 user was tracked for surgical deletion');
    });
  });
}
