import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { getIO } from '../socket/index.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Rider from '../models/Rider.js';
import PushReceipt from '../models/PushReceipt.js';

/**
 * Purge invalid push tokens across User, Rider, and Vendor collections.
 *
 * Schema compatibility notes:
 *   User.expoPushTokens    → subdocument array [{ token, platform, deviceId, updatedAt }]
 *                            Filter: 'expoPushTokens.token' (dotted path).
 *   Rider.expoPushTokens   → subdocument array [{ token, platform, deviceId, updatedAt }]
 *                            Filter: 'expoPushTokens.token' (dotted path).
 *   Vendor.expoPushTokens  → plain string array [String]
 *                            Filter: expoPushTokens: token (direct equality).
 *
 * WARNING: Passing a plain string as a filter/pull value against a subdocument array schema
 * causes a Mongoose CastError. Only use the dotted-path form for User and Rider.
 *
 * Returns { success: boolean }.
 */
export async function purgeInvalidDeviceTokens(token) {
  if (!token) return { success: true };

  // Each entry: [model name for diagnostics, promise]
  const ops = [
    // User: subdocument array — dotted-path filter only
    ['User', 'updateMany(expoPushTokens.token)',
      User.updateMany({ 'expoPushTokens.token': token }, { $pull: { expoPushTokens: { token } } })],
    // Vendor: plain string array — direct equality filter
    ['Vendor', 'updateMany(expoPushTokens)',
      Vendor.updateMany({ expoPushTokens: token }, { $pull: { expoPushTokens: token } })],
    // Rider: subdocument array — dotted-path filter only
    ['Rider', 'updateMany(expoPushTokens.token)',
      Rider.updateMany({ 'expoPushTokens.token': token }, { $pull: { expoPushTokens: { token } } })]
  ];

  const results = await Promise.allSettled(ops.map(([, , promise]) => promise));

  let hasFailures = false;
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status === 'rejected') {
      hasFailures = true;
      const [modelName, opName] = ops[i];
      const err = res.reason;
      // Sanitized: model + operation + error name + code only. No tokens, URIs, or raw documents.
      const safeName = err?.name || 'Error';
      const safeCode = err?.code || err?.codeName || 'UNKNOWN';
      console.error(
        `[PushReceipt] Token cleanup write failed — Model: ${modelName}, Op: ${opName}, ` +
        `ErrorName: ${safeName}, Code: ${safeCode}`
      );
    }
  }

  if (hasFailures) {
    return { success: false };
  }
  return { success: true };
}

/**
 * Helper to mask push token for secure logging
 */
export function maskPushToken(token) {
  if (typeof token !== 'string') return 'invalid';
  if (token.length <= 10) return '***';
  return `...${token.slice(-6)}`;
}

/**
 * Injected offline receipt provider with strict staging guards.
 * Restricts execution to validated staging, explicit test opt-in, and valid run-owned ticket scopes.
 * Missing or malformed stub configuration or scopes fail closed.
 */
export function resolveOfflineReceipts(ticketIds) {
  const isStaging = process.env.STAGING_MODE === 'true' || process.env.NODE_ENV === 'staging';
  const isTestOptIn =
    process.env.ALLOW_LIVE_STAGING_TEST === 'true' ||
    process.env.ALLOW_STAGING_ATLAS_TEST === 'true' ||
    process.env.NODE_ENV === 'test';
  const scopePrefix = (process.env.RECOVERY_TICKET_PREFIX || process.env.RECOVERY_FIXTURE_PREFIX || '').trim();
  const scopedTicketIdsRaw = (process.env.RECOVERY_TICKET_IDS || '').trim();
  const hasValidScope = scopePrefix.length >= 5 || scopedTicketIdsRaw.length > 0;

  if (!isStaging && process.env.NODE_ENV !== 'test') {
    throw new Error('FAIL-CLOSED: Offline receipt provider is restricted to validated staging or test environments.');
  }
  if (!isTestOptIn) {
    throw new Error('FAIL-CLOSED: Offline receipt provider requires explicit test opt-in (ALLOW_LIVE_STAGING_TEST=true).');
  }
  if (!hasValidScope) {
    throw new Error('FAIL-CLOSED: Offline receipt provider requires valid run-owned ticket scope.');
  }

  // Check injected custom provider function
  if (typeof globalThis.__expoReceiptProvider === 'function') {
    const res = globalThis.__expoReceiptProvider(ticketIds);
    if (typeof process.send === 'function') {
      process.send({
        type: 'PROVIDER_STUB_EVENT',
        action: 'getReceipts',
        ids: ticketIds,
        matched: Object.keys(res || {})
      });
    }
    return res;
  }

  const rawConfig = process.env.EXPO_RECEIPT_STUB_CONFIG;
  if (!rawConfig) {
    throw new Error('FAIL-CLOSED: Missing EXPO_RECEIPT_STUB_CONFIG for offline receipt provider.');
  }

  let stubConfig;
  try {
    stubConfig = JSON.parse(rawConfig);
    if (!stubConfig || typeof stubConfig !== 'object' || Array.isArray(stubConfig)) {
      throw new Error('Stub config must be an object');
    }
  } catch (err) {
    throw new Error(`FAIL-CLOSED: Malformed EXPO_RECEIPT_STUB_CONFIG: ${err.message}`);
  }

  const receiptsData = {};
  const scopedIdsList = scopedTicketIdsRaw ? scopedTicketIdsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

  for (const id of ticketIds) {
    const isAllowed =
      (scopePrefix && id.startsWith(scopePrefix)) ||
      (scopedIdsList.includes(id));

    if (!isAllowed) {
      throw new Error(`FAIL-CLOSED: Ticket ID "${id}" is outside authorized run scope (${scopePrefix || scopedTicketIdsRaw}). Out-of-scope tickets are strictly forbidden.`);
    }

    if (stubConfig[id]) {
      receiptsData[id] = stubConfig[id];
    }
  }

  if (typeof process.send === 'function') {
    process.send({
      type: 'PROVIDER_STUB_EVENT',
      action: 'getReceipts',
      ids: ticketIds,
      matched: Object.keys(receiptsData)
    });
  }

  return receiptsData;
}

/**
 * Check delivery receipts from Expo push servers or offline test provider.
 * Expo separates initial send tickets from delivery receipts.
 * @param {Array<{ ticketId: string, token: string, attempt?: number, maxAttempts?: number, nextCheckAt?: Date }>} receiptMap
 */
export async function checkExpoPushReceipts(receiptMap, { attempt = 1, maxAttempts = 3, retryDelayMs = 2000 } = {}) {
  if (!Array.isArray(receiptMap) || !receiptMap.length) return {};

  const ticketIds = receiptMap.map((r) => r.ticketId || r.id).filter(Boolean);
  if (!ticketIds.length) return {};

  let receipts = null;
  let fetchError = null;

  if (process.env.DISABLE_EXTERNAL_NOTIFICATIONS === 'true') {
    const isStubbed = Boolean(
      process.env.USE_RECEIPT_STUB === 'true' ||
      (process.env.NODE_ENV === 'test' && (process.env.EXPO_RECEIPT_STUB_CONFIG || typeof globalThis.__expoReceiptProvider === 'function'))
    );
    if (!isStubbed) {
      return { disabled: true };
    }
    // Strict offline validation: any guard failure rejects immediately with zero database writes
    receipts = await resolveOfflineReceipts(ticketIds);
  } else {
    // Real external provider call in production
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: ticketIds }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        fetchError = new Error(`HTTP_${response.status}`);
      } else {
        const result = await response.json();
        receipts = result?.data || {};
      }
    } catch (err) {
      fetchError = err.name === 'AbortError' ? new Error('PROVIDER_TIMEOUT') : err;
    }
  }

  const statePromises = [];
  const pendingReceiptItems = [];

  // Handle provider error (network error, timeout, non-2xx response)
  if (fetchError || !receipts) {
    const errMessage = fetchError?.message || 'PROVIDER_ERROR';
    console.warn(`[PushReceipt] Receipt check error (${errMessage}) for ${receiptMap.length} ticket(s)`);

    for (const item of receiptMap) {
      const ticketId = item.ticketId || item.id;
      const itemAttempt = Number.isInteger(item.attempt) ? item.attempt : attempt;
      const itemMaxAttempts = Number.isInteger(item.maxAttempts) ? item.maxAttempts : maxAttempts;
      const backoffMs = Math.min(retryDelayMs * Math.pow(2, Math.max(itemAttempt - 1, 0)), 300000);
      const nextCheck = new Date(Date.now() + Math.max(backoffMs, 1000));

      const filter = { ticketId };
      if (item.leaseToken) {
        filter.leaseToken = item.leaseToken;
        filter.leaseExpiresAt = { $gt: new Date() };
      } else {
        filter.status = 'PENDING';
      }

      if (itemAttempt < itemMaxAttempts) {
        pendingReceiptItems.push({ ...item, attempt: itemAttempt + 1 });
        statePromises.push(
          PushReceipt.updateOne(
            filter,
            {
              $inc: { attempt: 1 },
              $set: { nextCheckAt: nextCheck, lastError: errMessage, leaseToken: null, leaseExpiresAt: null }
            }
          )
        );
      } else {
        // Retry exhausted: do not leave permanently PENDING!
        statePromises.push(
          PushReceipt.updateOne(
            filter,
            {
              $set: { status: 'FAILED', lastError: 'MAX_ATTEMPTS_EXCEEDED', leaseToken: null, leaseExpiresAt: null }
            }
          )
        );
      }
    }

    if (statePromises.length) {
      const settled = await Promise.allSettled(statePromises);
      for (const res of settled) {
        if (res.status === 'rejected') {
          console.error('[PushReceipt] Guarded state update failed on provider error:', res.reason?.message || res.reason);
        }
      }
    }

    return {};
  }

  // Provider response received successfully
  for (const item of receiptMap) {
    const ticketId = item.ticketId || item.id;
    const itemAttempt = Number.isInteger(item.attempt) ? item.attempt : attempt;
    const itemMaxAttempts = Number.isInteger(item.maxAttempts) ? item.maxAttempts : maxAttempts;
    const backoffMs = Math.min(retryDelayMs * Math.pow(2, Math.max(itemAttempt - 1, 0)), 300000);
    const nextCheck = new Date(Date.now() + Math.max(backoffMs, 1000));
    const receipt = receipts[ticketId];

    const filter = { ticketId };
    if (item.leaseToken) {
      filter.leaseToken = item.leaseToken;
      filter.leaseExpiresAt = { $gt: new Date() };
    } else {
      filter.status = 'PENDING';
    }

    if (!receipt) {
      // Receipt not yet ready from push gateway
      if (itemAttempt < itemMaxAttempts) {
        pendingReceiptItems.push({ ...item, attempt: itemAttempt + 1 });
        statePromises.push(
          PushReceipt.updateOne(
            filter,
            {
              $inc: { attempt: 1 },
              $set: { nextCheckAt: nextCheck, leaseToken: null, leaseExpiresAt: null }
            }
          )
        );
      } else {
        // Exhausted! Do not leave permanently PENDING!
        statePromises.push(
          PushReceipt.updateOne(
            filter,
            {
              $set: { status: 'FAILED', lastError: 'MAX_ATTEMPTS_EXCEEDED', leaseToken: null, leaseExpiresAt: null }
            }
          )
        );
      }
      continue;
    }

    if (receipt.status === 'ok') {
      statePromises.push(
        PushReceipt.updateOne(
          filter,
          {
            $set: { status: 'COMPLETED', leaseToken: null, leaseExpiresAt: null }
          }
        )
      );
    } else if (receipt.status === 'error') {
      const errorType = receipt.details?.error || receipt.message || 'UnknownReceiptError';
      console.warn(`[PushReceipt] Delivery receipt error (${errorType}) for token ending in ${maskPushToken(item.token)}`);

      if (receipt.details?.error === 'DeviceNotRegistered' && item.token) {
        const cleanupPromise = purgeInvalidDeviceTokens(item.token).then(async (cleanupRes) => {
          if (cleanupRes.success) {
            return PushReceipt.updateOne(
              filter,
              {
                $set: {
                  status: 'FAILED',
                  cleanupStatus: 'COMPLETED',
                  lastError: 'DeviceNotRegistered',
                  leaseToken: null,
                  leaseExpiresAt: null
                }
              }
            );
          } else {
            // Token cleanup failed: persist cleanup-pending state so it can be retried!
            return PushReceipt.updateOne(
              filter,
              {
                $set: {
                  status: 'CLEANUP_PENDING',
                  cleanupStatus: 'PENDING',
                  lastError: 'DeviceNotRegistered',
                  nextCheckAt: nextCheck,
                  leaseToken: null,
                  leaseExpiresAt: null
                }
              }
            );
          }
        });
        statePromises.push(cleanupPromise);
      } else {
        statePromises.push(
          PushReceipt.updateOne(
            filter,
            {
              $set: { status: 'FAILED', lastError: errorType, leaseToken: null, leaseExpiresAt: null }
            }
          )
        );
      }
    }
  }

  if (statePromises.length) {
    const settled = await Promise.allSettled(statePromises);
    for (const res of settled) {
      if (res.status === 'rejected') {
        console.error('[PushReceipt] Guarded update or token cleanup write failed:', res.reason?.message || res.reason);
      }
    }
  }

  return receipts;
}

/**
 * Recover and check pending push receipts from MongoDB across server restarts.
 * Preserves each receipt's persisted attempt, maxAttempts, and nextCheckAt.
 */
export async function recoverPendingPushReceipts() {
  if (process.env.DISABLE_EXTERNAL_NOTIFICATIONS === 'true') {
    const isStubbed = Boolean(
      process.env.USE_RECEIPT_STUB === 'true' ||
      (process.env.NODE_ENV === 'test' && (process.env.EXPO_RECEIPT_STUB_CONFIG || typeof globalThis.__expoReceiptProvider === 'function'))
    );
    if (!isStubbed) return 0;

    // Validate offline configuration and scope BEFORE querying or modifying database
    const isStaging = process.env.STAGING_MODE === 'true' || process.env.NODE_ENV === 'staging';
    const isTestOptIn =
      process.env.ALLOW_LIVE_STAGING_TEST === 'true' ||
      process.env.ALLOW_STAGING_ATLAS_TEST === 'true' ||
      process.env.NODE_ENV === 'test';
    const scopePrefix = (process.env.RECOVERY_TICKET_PREFIX || process.env.RECOVERY_FIXTURE_PREFIX || '').trim();
    const scopedTicketIdsRaw = (process.env.RECOVERY_TICKET_IDS || '').trim();
    const hasValidScope = scopePrefix.length >= 5 || scopedTicketIdsRaw.length > 0;

    if ((!isStaging && process.env.NODE_ENV !== 'test') || !isTestOptIn || !hasValidScope) {
      return 0;
    }

    const rawConfig = process.env.EXPO_RECEIPT_STUB_CONFIG;
    if (!rawConfig) return 0;
    try {
      const parsed = JSON.parse(rawConfig);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 0;
    } catch {
      return 0;
    }
  }

  try {
    if (mongoose.connection.readyState === 2) {
      await new Promise((resolve) => {
        mongoose.connection.once('connected', resolve);
        setTimeout(resolve, 5000);
      });
    }

    const isStaging = process.env.STAGING_MODE === 'true' || process.env.NODE_ENV === 'staging';
    const query = {
      $and: [
        {
          $or: [
            { status: 'PENDING' },
            { status: 'CLEANUP_PENDING' },
            { cleanupStatus: 'PENDING' }
          ]
        },
        {
          nextCheckAt: { $lte: new Date() }
        },
        {
          $or: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { $lte: new Date() } }
          ]
        }
      ]
    };

    // Staging test scoping: if scoped ticket IDs or prefix is provided, restrict to this run
    if (isStaging) {
      const scopePrefix = (process.env.RECOVERY_TICKET_PREFIX || process.env.RECOVERY_FIXTURE_PREFIX || '').trim();
      const scopedTicketIdsRaw = (process.env.RECOVERY_TICKET_IDS || '').trim();

      if (scopedTicketIdsRaw) {
        const ids = scopedTicketIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);
        query.$and.push({ ticketId: { $in: ids } });
      } else if (scopePrefix && scopePrefix.length >= 5) {
        query.$and.push({ ticketId: { $regex: `^${scopePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } });
      }
    }

    const candidateDocs = await PushReceipt.find(query).limit(50);
    if (!candidateDocs || !candidateDocs.length) return 0;

    // Unique claim token and lease expiry (30s)
    const myClaimToken = crypto.randomUUID ? crypto.randomUUID() : `lease_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const leaseUntil = new Date(Date.now() + 30000);
    const claimedDocs = [];
    for (const doc of candidateDocs) {
      const claimed = await PushReceipt.findOneAndUpdate(
        {
          _id: doc._id,
          status: doc.status,
          nextCheckAt: { $eq: doc.nextCheckAt, $lte: new Date() },
          $or: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { $lte: new Date() } }
          ]
        },
        {
          $set: {
            leaseToken: myClaimToken,
            leaseExpiresAt: leaseUntil
          }
        },
        { new: true }
      );
      if (claimed) {
        claimedDocs.push(claimed);
      }
    }

    if (!claimedDocs.length) return 0;

    console.log(`[PushReceipt] Recovering ${claimedDocs.length} pending receipts from database...`);

    // Separate cleanup-pending receipts from provider check receipts
    const cleanupRetryDocs = claimedDocs.filter(
      (d) => d.status === 'CLEANUP_PENDING' || d.cleanupStatus === 'PENDING'
    );
    const providerCheckDocs = claimedDocs.filter(
      (d) => d.status === 'PENDING' && d.cleanupStatus !== 'PENDING'
    );

    // Process cleanup retries
    for (const doc of cleanupRetryDocs) {
      const cleanupRes = await purgeInvalidDeviceTokens(doc.token);
      if (cleanupRes.success) {
        await PushReceipt.updateOne(
          { _id: doc._id, leaseToken: myClaimToken, leaseExpiresAt: { $gt: new Date() } },
          {
            $set: {
              status: 'FAILED',
              cleanupStatus: 'COMPLETED',
              lastError: 'DeviceNotRegistered',
              leaseToken: null,
              leaseExpiresAt: null
            }
          }
        );
      } else {
        const nextCheck = new Date(Date.now() + 5000);
        await PushReceipt.updateOne(
          { _id: doc._id, leaseToken: myClaimToken, leaseExpiresAt: { $gt: new Date() } },
          {
            $set: {
              nextCheckAt: nextCheck,
              leaseToken: null,
              leaseExpiresAt: null
            }
          }
        );
      }
    }

    // Process provider check receipts
    if (providerCheckDocs.length) {
      const receiptMap = providerCheckDocs.map((p) => ({
        ticketId: p.ticketId,
        token: p.token,
        attempt: p.attempt,
        maxAttempts: p.maxAttempts,
        nextCheckAt: p.nextCheckAt,
        leaseToken: myClaimToken
      }));
      await checkExpoPushReceipts(receiptMap);
    }

    return claimedDocs.length;
  } catch (err) {
    console.warn('[PushReceipt] Recovery check failed:', err.message);
    return 0;
  }
}

let pushReceiptWorkerTimer = null;
let isWorkerRunning = false;

export async function processDuePushReceipts() {
  if (isWorkerRunning) return 0;
  isWorkerRunning = true;
  try {
    return await recoverPendingPushReceipts();
  } finally {
    isWorkerRunning = false;
  }
}

/**
 * Start periodic database-backed worker to recover future-due pending push receipts across restarts.
 */
export function startPushReceiptWorker({ intervalMs = 2000 } = {}) {
  if (pushReceiptWorkerTimer) return;

  // Run once immediately on startup
  processDuePushReceipts().catch((err) => {
    console.warn('[PushReceiptWorker] Startup poll error:', err.message);
  });

  // Schedule recurring check for future-due receipts
  pushReceiptWorkerTimer = setInterval(() => {
    processDuePushReceipts().catch((err) => {
      console.warn('[PushReceiptWorker] Interval poll error:', err.message);
    });
  }, intervalMs);

  if (typeof pushReceiptWorkerTimer.unref === 'function') {
    pushReceiptWorkerTimer.unref();
  }
  console.log(`[PushReceiptWorker] Started periodic receipt recovery worker (interval: ${intervalMs}ms).`);
}

/**
 * Stop the background receipt recovery worker cleanly.
 */
export function stopPushReceiptWorker() {
  if (pushReceiptWorkerTimer) {
    clearInterval(pushReceiptWorkerTimer);
    pushReceiptWorkerTimer = null;
    console.log('[PushReceiptWorker] Stopped periodic receipt recovery worker.');
  }
}

/**
 * Send push notification using Expo Push API.
 * Guarantees:
 * - Strictly filters to Expo push tokens (never sends native FCM tokens to Expo API)
 * - Honors DISABLE_EXTERNAL_NOTIFICATIONS=true
 * - Sets channelId: 'orders' and high priority
 * - Detects DeviceNotRegistered ticket responses and cleans up invalid tokens
 * - Never logs raw tokens in logs
 * - Never throws or breaks committed order updates
 */
export async function sendExpoPushNotification(tokens, title, body, data = {}) {
  try {
    if (process.env.DISABLE_EXTERNAL_NOTIFICATIONS === 'true') {
      if (typeof process.send === 'function') {
        process.send({ type: 'NOTIFICATION_INVOCATION', function: 'sendExpoPushNotification', count: Array.isArray(tokens) ? tokens.length : 1 });
      }
      return [];
    }
    if (!tokens || !tokens.length) {
      return [];
    }

    const rawTokens = (Array.isArray(tokens) ? tokens : [tokens])
      .map((t) => (typeof t === 'string' ? t.trim() : (t?.token ? String(t.token).trim() : null)))
      .filter(Boolean);

    // Strictly keep only valid Expo push tokens
    const validTokens = rawTokens.filter(
      (t) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[')
    );

    if (!validTokens.length) {
      return [];
    }

    const orderIdStr = data.orderId ? String(data.orderId) : undefined;
    const channelId = data.channelId || (data.type === 'DELIVERY_OFFER' ? 'delivery_offers' : 'orders');
    const messages = validTokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: {
        ...data,
        ...(orderIdStr ? { orderId: orderIdStr } : {}),
        screen: data.screen || 'OrderTracking'
      },
      priority: 'high',
      channelId
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messages)
    });

    const result = await response.json();
    const successfulReceiptMap = [];
    const persistencePromises = [];
    const cleanupPromises = [];

    // Inspect provider tickets for delivery errors and cleanup invalid tokens
    if (Array.isArray(result?.data)) {
      for (let i = 0; i < result.data.length; i++) {
        const ticket = result.data[i];
        if (ticket.status === 'ok' && ticket.id) {
          successfulReceiptMap.push({ ticketId: ticket.id, token: validTokens[i] });
          persistencePromises.push(
            PushReceipt.create({
              ticketId: ticket.id,
              token: validTokens[i],
              nextCheckAt: new Date(Date.now() + 30000)
            })
          );
        } else if (ticket.status === 'error') {
          const invalidToken = validTokens[i];
          const errorType = ticket.details?.error || ticket.message || 'UnknownError';
          console.warn(`[Push] Ticket error (${errorType}) for token ending in ${maskPushToken(invalidToken)}`);

          if (ticket.details?.error === 'DeviceNotRegistered' && invalidToken) {
            // Clean up obsolete device registration across models
            cleanupPromises.push(
              User.updateMany({ 'expoPushTokens.token': invalidToken }, { $pull: { expoPushTokens: { token: invalidToken } } }),
              User.updateMany({ expoPushTokens: invalidToken }, { $pull: { expoPushTokens: invalidToken } }),
              Vendor.updateMany({ expoPushTokens: invalidToken }, { $pull: { expoPushTokens: invalidToken } }),
              Rider.updateMany({ 'expoPushTokens.token': invalidToken }, { $pull: { expoPushTokens: { token: invalidToken } } }),
              Rider.updateMany({ expoPushTokens: invalidToken }, { $pull: { expoPushTokens: invalidToken } })
            );
          }
        }
      }
    }

    if (persistencePromises.length || cleanupPromises.length) {
      const settled = await Promise.allSettled([...persistencePromises, ...cleanupPromises]);
      for (const res of settled) {
        if (res.status === 'rejected') {
          console.error('[PushReceipt] Ticket persistence or token cleanup failed in sendExpoPushNotification:', res.reason?.message || res.reason);
        }
      }
    }

    return result?.data || [];
  } catch (err) {
    console.warn('[Push] Notification dispatch failed (non-blocking):', err.message);
    return [];
  }
}

/**
 * Notify rider about a new delivery offer
 */
export async function notifyRiderDeliveryOffer(riderOrId, offerPayload) {
  try {
    if (!riderOrId) return null;
    let riderTokens = [];
    if (typeof riderOrId === 'object' && riderOrId !== null) {
      if (Array.isArray(riderOrId.expoPushTokens)) {
        riderTokens = riderOrId.expoPushTokens.map((t) => (typeof t === 'string' ? t : t?.token)).filter(Boolean);
      } else if (riderOrId._id) {
        const riderDoc = await Rider.findById(riderOrId._id).select('expoPushTokens name');
        riderTokens = (riderDoc?.expoPushTokens || []).map((t) => (typeof t === 'string' ? t : t?.token)).filter(Boolean);
      }
    } else {
      const riderDoc = await Rider.findById(riderOrId).select('expoPushTokens name');
      riderTokens = (riderDoc?.expoPushTokens || []).map((t) => (typeof t === 'string' ? t : t?.token)).filter(Boolean);
    }
    if (!riderTokens.length) return null;

    const earnings = offerPayload.estEarnings || offerPayload.estimatedEarnings || 65;
    const store = offerPayload.storeName || 'Merchant Store';
    const dist = (offerPayload.distanceKm || offerPayload.totalDistanceKm) ? ` (${offerPayload.distanceKm || offerPayload.totalDistanceKm} km)` : '';

    return await sendExpoPushNotification(
      riderTokens,
      `🛵 New Delivery Offer: ₹${earnings}!`,
      `Pickup: ${store}${dist}. Tap to view and accept in 20s.`,
      {
        orderId: offerPayload.orderId || offerPayload._id,
        type: 'DELIVERY_OFFER',
        screen: 'Duty',
        channelId: 'delivery_offers',
        expiresInSeconds: offerPayload.expiresInSeconds || 20
      }
    );
  } catch (err) {
    console.error('Error notifying rider delivery offer:', err);
    return null;
  }
}

/**
 * Notify vendor about a brand new order in real-time
 */
export async function notifyNewOrder(order) {
  try {
    const io = getIO();
    const vendorId = (order.vendor?._id || order.vendor).toString();

    const payload = {
      orderId: order._id,
      vendorId: vendorId,
      orderNumber: order.orderNumber,
      clientOrderId: order.clientOrderId,
      customer: {
        name: order.address?.name || order.customer?.name || 'Customer',
        phone: order.address?.phone || order.customer?.phone || ''
      },
      items: order.items,
      pricing: order.pricing,
      placedAt: order.placedAt || new Date(),
      status: order.status
    };

    if (io) {
      console.log(`🚀 Emitting 'order:new' to room: vendor:${vendorId}`);
      io.to(`vendor:${vendorId}`).emit('order:new', payload);
    }

    // Push notification to vendor device
    const vendorDoc = await Vendor.findById(vendorId).select('expoPushTokens storeName');
    if (vendorDoc?.expoPushTokens?.length) {
      sendExpoPushNotification(
        vendorDoc.expoPushTokens,
        `🔔 NEW ORDER #${order.orderNumber}!`,
        `${order.items.length} item(s) • ₹${order.pricing?.grandTotal || 0}. Tap to accept.`,
        {
          orderId: order._id,
          orderNumber: order.orderNumber,
          type: 'NEW_ORDER',
          screen: 'Orders',
          channelId: 'partner_orders'
        }
      );
    }
  } catch (err) {
    console.error('Error notifying new order:', err);
  }
}

/**
 * Notify customer and order room when order status changes
 */
export async function notifyOrderStatus(order) {
  try {
    const io = getIO();
    const customerId = (order.customer?._id || order.customer)?.toString();
    const vendorId = (order.vendor?._id || order.vendor)?.toString();
    const orderId = order._id.toString();

    const payload = {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      statusHistory: order.statusHistory,
      rejectionReason: order.rejectionReason,
      updatedAt: new Date()
    };

    if (io) {
      console.log(`📢 Emitting 'order:status' (${order.status}) for order: ${orderId}`);
      io.to(`order:${orderId}`).emit('order:status', payload);
      if (customerId) {
        io.to(`customer:${customerId}`).emit('order:status', payload);
      }
      const riderId = (order.rider?._id || order.rider)?.toString();
      if (riderId) io.to('rider:' + riderId).emit('order:status', payload);
      if (vendorId) {
        io.to(`vendor:${vendorId}`).emit('order:status', payload);
      }
    }

    // Push notification to customer
    if (customerId) {
      const userDoc = await User.findById(customerId).select('expoPushTokens');
      const customerTokens = (userDoc?.expoPushTokens || []).map((t) => (typeof t === 'string' ? t : t?.token)).filter(Boolean);

      if (customerTokens.length) {
        let statusTitle = `Order #${order.orderNumber} Update`;
        let statusBody = `Current status: ${order.status}`;

        if (order.status === 'ACCEPTED') {
          statusTitle = '👨‍🍳 Order Accepted!';
          statusBody = 'The store has accepted your order and will start preparation.';
        } else if (order.status === 'PREPARING') {
          statusTitle = '🍳 Being Prepared';
          statusBody = 'Your delicious food is being freshly prepared.';
        } else if (order.status === 'READY_FOR_RIDER') {
          statusTitle = '📦 Order Ready';
          statusBody = 'Your order is packed and ready for delivery partner pickup.';
        } else if (order.status === 'OUT_FOR_DELIVERY') {
          statusTitle = '🛵 Out for Delivery';
          statusBody = 'Our delivery partner is on the way to your address!';
        } else if (order.status === 'DELIVERED') {
          statusTitle = '✅ Order Delivered!';
          statusBody = 'Enjoy your fresh meal/groceries. Thank you for choosing Farmart!';
        } else if (order.status === 'REJECTED') {
          statusTitle = '❌ Order Not Accepted';
          statusBody = order.rejectionReason || 'The store is unable to accept your order right now.';
        }

        sendExpoPushNotification(customerTokens, statusTitle, statusBody, {
          orderId: order._id,
          type: 'STATUS_UPDATE',
          status: order.status,
          screen: 'OrderTracking'
        });
      }
    }

    // Push notification to assigned rider
    const riderId = (order.rider?._id || order.rider)?.toString();
    if (riderId) {
      const riderDoc = await Rider.findById(riderId).select('expoPushTokens');
      const riderTokens = (riderDoc?.expoPushTokens || []).map((t) => (typeof t === 'string' ? t : t?.token)).filter(Boolean);

      if (riderTokens.length) {
        let riderTitle = `🛵 Order #${order.orderNumber} Update`;
        let riderBody = `Current status: ${order.status}`;

        if (order.status === 'READY_FOR_RIDER') {
          riderTitle = `📦 Order #${order.orderNumber} Ready!`;
          riderBody = 'Store has packed the order. Head over for pickup.';
        } else if (order.status === 'CANCELLED') {
          riderTitle = `⚠️ Order #${order.orderNumber} Cancelled`;
          riderBody = 'This order was cancelled by the customer or store.';
        }

        sendExpoPushNotification(riderTokens, riderTitle, riderBody, {
          orderId: order._id,
          type: 'RIDER_ORDER_UPDATE',
          status: order.status,
          screen: 'ActiveNavigation'
        });
      }
    }
  } catch (err) {
    console.error('Error notifying order status:', err);
  }
}

/**
 * Broadcast real-time stock and availability changes to all connected users & vendors
 */
export function notifyProductStock(product) {
  try {
    const io = getIO();
    if (!io) return;

    const payload = {
      productId: (product._id || product.id).toString(),
      vendorId: (product.vendor?._id || product.vendor)?.toString(),
      stockQty: product.stockQty,
      inStock: product.inStock,
      updatedAt: new Date()
    };

    console.log(`📦 Broadcasting 'product:stock' update for ${product.name || payload.productId}: stock=${payload.stockQty}, inStock=${payload.inStock}`);
    if (process.env.SCOPED_STOCK_EVENTS === 'true') {
      if (!/^[a-f0-9]{24}$/i.test(payload.vendorId || '')) return;
      // Chained rooms are a union: a vendor/subscriber receives the event at most once.
      io.to('catalog:' + payload.vendorId.toLowerCase()).to('vendor:' + payload.vendorId).emit('product:stock', payload);
    } else {
      // Compatibility window for older mobile releases. Enable scoped delivery after rollout.
      io.emit('product:stock', payload);
    }
  } catch (err) {
    console.warn('Failed to broadcast product:stock:', err);
  }
}

/**
 * Notify partner about category request review outcome (approval, rejection, or mapping)
 */
export async function notifyCategoryRequestOutcome(request, outcome = {}) {
  try {
    const io = getIO();
    const vendorId = (request.vendor?._id || request.vendor)?.toString();
    if (!vendorId) return;

    const payload = {
      requestId: request._id,
      proposedName: request.proposedName,
      status: request.status,
      outcome: outcome.type, // 'APPROVED' | 'REJECTED' | 'MAPPED'
      message: outcome.message || 'Category request reviewed',
      category: outcome.category || null,
      adminNotes: request.adminNotes || '',
      reviewedAt: request.reviewedAt || new Date()
    };

    if (io) {
      console.log(`🔔 Emitting 'category:request_outcome' to vendor:${vendorId}`);
      io.to(`vendor:${vendorId}`).emit('category:request_outcome', payload);
    }

    let vendorQuery = Vendor.findById(vendorId);
    if (vendorQuery && typeof vendorQuery.select === 'function') {
      vendorQuery = vendorQuery.select('expoPushTokens storeName');
    }
    const vendorDoc = await vendorQuery;
    if (vendorDoc?.expoPushTokens?.length) {
      const isPositive = outcome.type === 'APPROVED' || outcome.type === 'MAPPED';
      sendExpoPushNotification(
        vendorDoc.expoPushTokens,
        isPositive ? '✅ Category Request Approved!' : 'ℹ️ Category Request Update',
        outcome.message || (isPositive ? `Your category "${request.proposedName}" is now ready to use.` : `Update on your category request.`),
        { requestId: request._id, type: 'CATEGORY_REQUEST_UPDATE' }
      );
    }
  } catch (err) {
    console.error('Error notifying category request outcome:', err);
  }
}
