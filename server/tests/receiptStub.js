// server/tests/receiptStub.js
// Deterministic provider stub for Expo Push Receipts during isolated backend testing.
// Intercepts fetch calls to https://exp.host/--/api/v2/push/getReceipts.
// Guarantees zero external network sends and restricts responses to authorized test ticket IDs.
// Measures provider calls using child-process IPC.

globalThis.__expoReceiptStubActive = true;

const origFetch = globalThis.fetch;

export function getStubConfig() {
  const raw = process.env.EXPO_RECEIPT_STUB_CONFIG;
  if (!raw) {
    throw new Error('FAIL-CLOSED: Missing EXPO_RECEIPT_STUB_CONFIG for offline receipt provider.');
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Stub config must be an object');
    }
    return parsed;
  } catch (err) {
    throw new Error(`FAIL-CLOSED: Malformed EXPO_RECEIPT_STUB_CONFIG: ${err.message}`);
  }
}

/**
 * Deterministic offline receipt provider implementation.
 */
export function offlineReceiptProvider(requestedIds) {
  const stubConfig = getStubConfig();
  const allowedPrefix = process.env.RECOVERY_TICKET_PREFIX || process.env.RECOVERY_FIXTURE_PREFIX || '';
  const scopedTicketIdsRaw = (process.env.RECOVERY_TICKET_IDS || '').trim();
  const scopedIdsList = scopedTicketIdsRaw ? scopedTicketIdsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const receiptsData = {};

  if (!allowedPrefix && !scopedIdsList.length) {
    throw new Error('FAIL-CLOSED: Missing explicit run-owned ticket scope (RECOVERY_TICKET_PREFIX or RECOVERY_TICKET_IDS).');
  }

  for (const id of requestedIds) {
    const isAllowed =
      (allowedPrefix && id.startsWith(allowedPrefix)) ||
      (scopedIdsList.includes(id));

    if (!isAllowed) {
      throw new Error(`FAIL-CLOSED: Ticket ID "${id}" is outside authorized run scope (${allowedPrefix || scopedTicketIdsRaw}).`);
    }

    if (stubConfig[id]) {
      receiptsData[id] = stubConfig[id];
    }
  }

  if (typeof process.send === 'function') {
    process.send({
      type: 'PROVIDER_STUB_EVENT',
      action: 'getReceipts',
      ids: requestedIds,
      matched: Object.keys(receiptsData)
    });
  }

  return receiptsData;
}

globalThis.__expoReceiptProvider = offlineReceiptProvider;

globalThis.fetch = async (url, options = {}) => {
  const urlStr = String(url);

  // Strictly block any attempt to send push notifications
  if (urlStr.includes('/api/v2/push/send')) {
    if (typeof process.send === 'function') {
      process.send({ type: 'PROVIDER_STUB_EVENT', action: 'sendPush' });
    }
    throw new Error('FAIL-CLOSED: Attempted to call /api/v2/push/send while external notifications are disabled.');
  }

  // Intercept Expo Push Receipts API
  if (urlStr.includes('/api/v2/push/getReceipts')) {
    let body = {};
    try {
      body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
    } catch {}

    const requestedIds = body.ids || [];
    const receiptsData = offlineReceiptProvider(requestedIds);

    return new Response(JSON.stringify({ data: receiptsData }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Pass-through for any other requests (e.g. localhost health checks)
  return origFetch(url, options);
};

console.log('🔌 [ReceiptStub] Deterministic Expo Push Receipt Stub loaded into process.');
