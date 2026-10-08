import mongoose from 'mongoose';

/**
 * Narrowly scoped, fail-closed provisioning script for farmart_test_disposable.
 *
 * Preconditions:
 * - Environment variable STAGING_SETUP_MONGO_URI must be provided.
 * - Protocol must be mongodb+srv: explicitly.
 * - Host must match APPROVED_STAGING_HOST exactly.
 * - Database must match APPROVED_DATABASE exactly.
 * - Never drops or overwrites conflicting indexes.
 * - Never prints credentials or connection strings.
 */

export const APPROVED_STAGING_HOST = 'farmart-staging.gxn3bfw.mongodb.net';
export const APPROVED_DATABASE = 'farmart_test_disposable';

export const REQUIRED_SCHEMA = Object.freeze({
  orders: Object.freeze({
    indexes: Object.freeze([
      { keys: { vendor: 1, createdAt: -1, _id: 1 }, options: { name: 'vendor_1_createdAt_-1__id_1' } },
      { keys: { status: 1, rider: 1, createdAt: 1 }, options: { name: 'status_1_rider_1_createdAt_1' } },
      { keys: { 'payment.razorpayOrderId': 1 }, options: { sparse: true, name: 'payment.razorpayOrderId_1' } },
      {
        keys: { orderNumber: 1 },
        options: { unique: true, name: 'orderNumber_1' }
      },
      {
        keys: { customer: 1 },
        options: { name: 'customer_1' }
      },
      {
        keys: { vendor: 1 },
        options: { name: 'vendor_1' }
      },
      {
        keys: { status: 1 },
        options: { name: 'status_1' }
      },
      {
        keys: { rider: 1 },
        options: { name: 'rider_1' }
      },
      {
        keys: { vendor: 1, status: 1 },
        options: { name: 'vendor_1_status_1' }
      },
      {
        keys: { customer: 1, createdAt: -1 },
        options: { name: 'customer_1_createdAt_-1' }
      },
      {
        keys: { customer: 1, clientOrderId: 1 },
        options: {
          unique: true,
          partialFilterExpression: { clientOrderId: { $type: 'string' } },
          name: 'customer_1_clientOrderId_1'
        }
      }
    ])
  }),
  riders: Object.freeze({
    indexes: Object.freeze([
      {
        keys: { phone: 1 },
        options: { unique: true, name: 'phone_1' }
      },
      {
        keys: { status: 1 },
        options: { name: 'status_1' }
      },
      {
        keys: { currentLocation: '2dsphere' },
        options: { name: 'currentLocation_2dsphere' }
      },
      {
        keys: { status: 1, locationUpdatedAt: -1 },
        options: { name: 'status_1_locationUpdatedAt_-1' }
      }
    ])
  }),
  users: Object.freeze({
    indexes: Object.freeze([
      {
        keys: { phone: 1 },
        options: { unique: true, name: 'phone_1' }
      },
      {
        keys: { email: 1 },
        options: { unique: true, sparse: true, name: 'email_1' }
      },
      {
        keys: { role: 1 },
        options: { name: 'role_1' }
      },
      {
        keys: { status: 1 },
        options: { name: 'status_1' }
      }
    ])
  }),
  vendors: Object.freeze({
    indexes: Object.freeze([
      {
        keys: { phone: 1 },
        options: { unique: true, name: 'phone_1' }
      },
      {
        keys: { 'address.location': '2dsphere' },
        options: { name: 'address.location_2dsphere' }
      },
      {
        keys: { isOpen: 1, rating: -1 },
        options: { name: 'isOpen_1_rating_-1' }
      }
    ])
  }),
  products: Object.freeze({
    indexes: Object.freeze([
      { keys: { vendor: 1, isActive: 1, inStock: -1, price: 1, _id: 1 }, options: { name: 'vendor_1_isActive_1_inStock_-1_price_1__id_1' } },
      { keys: { isActive: 1, inStock: -1, createdAt: -1, _id: 1 }, options: { name: 'isActive_1_inStock_-1_createdAt_-1__id_1' } },
      {
        keys: { vendor: 1 },
        options: { name: 'vendor_1' }
      },
      {
        keys: { category: 1 },
        options: { name: 'category_1' }
      },
      {
        keys: { vendor: 1, category: 1 },
        options: { name: 'vendor_1_category_1' }
      },
      {
        keys: { name: 'text', tags: 'text' },
        options: { name: 'name_text_tags_text' }
      },
      {
        keys: { isActive: 1, inStock: 1 },
        options: { name: 'isActive_1_inStock_1' }
      }
    ])
  }),
  refreshtokens: Object.freeze({
    indexes: Object.freeze([
      {
        keys: { user: 1 },
        options: { name: 'user_1' }
      },
      {
        keys: { tokenHash: 1 },
        options: { unique: true, name: 'tokenHash_1' }
      },
      {
        keys: { expiresAt: 1 },
        options: { expireAfterSeconds: 0, name: 'expiresAt_1' }
      }
    ])
  }),
  categories: Object.freeze({
    indexes: Object.freeze([
      {
        keys: { slug: 1 },
        options: { unique: true, name: 'slug_1' }
      },
      {
        keys: { nameNormalized: 1 },
        options: { unique: true, sparse: true, name: 'nameNormalized_1' }
      },
      {
        keys: { type: 1, sortOrder: 1 },
        options: { name: 'type_1_sortOrder_1' }
      }
    ])
  }),
  categoryrequests: Object.freeze({
    indexes: Object.freeze([
      {
        keys: { vendor: 1, nameNormalized: 1 },
        options: {
          unique: true,
          partialFilterExpression: { status: 'PENDING' },
          name: 'vendor_1_nameNormalized_1'
        }
      },
      {
        keys: { status: 1, createdAt: -1 },
        options: { name: 'status_1_createdAt_-1' }
      },
      {
        keys: { vendor: 1, status: 1 },
        options: { name: 'vendor_1_status_1' }
      }
    ])
  }),
  admins: Object.freeze({
    indexes: Object.freeze([
      {
        keys: { username: 1 },
        options: { unique: true, name: 'username_1' }
      }
    ])
  }),
  pushreceipts: Object.freeze({
    indexes: Object.freeze([
      {
        keys: { ticketId: 1 },
        options: { unique: true, name: 'ticketId_1' }
      },
      {
        keys: { nextCheckAt: 1 },
        options: { name: 'nextCheckAt_1' }
      },
      {
        keys: { status: 1 },
        options: { name: 'status_1' }
      },
      {
        keys: { cleanupStatus: 1 },
        options: { name: 'cleanupStatus_1' }
      },
      {
        keys: { leaseToken: 1 },
        options: { name: 'leaseToken_1' }
      },
      {
        keys: { leaseExpiresAt: 1 },
        options: { name: 'leaseExpiresAt_1' }
      },
      {
        keys: { createdAt: 1 },
        options: { expireAfterSeconds: 7 * 24 * 60 * 60, name: 'createdAt_1' }
      }
    ])
  })
});

export function deepEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

export function areKeysEqual(keyA, keyB) {
  const entriesA = Object.entries(keyA || {});
  const entriesB = Object.entries(keyB || {});
  if (entriesA.length !== entriesB.length) return false;
  for (let i = 0; i < entriesA.length; i++) {
    if (entriesA[i][0] !== entriesB[i][0] || entriesA[i][1] !== entriesB[i][1]) {
      return false;
    }
  }
  return true;
}

export function isTextIndex(keys) {
  return Boolean(keys && Object.values(keys).some(v => v === 'text'));
}

export function getExpectedWeights(keys) {
  const weights = {};
  for (const [field, val] of Object.entries(keys || {})) {
    if (val === 'text') {
      weights[field] = 1;
    }
  }
  return weights;
}

export function areWeightsEqual(weightsA, weightsB) {
  if (!weightsA || !weightsB) return false;
  const entriesA = Object.entries(weightsA);
  const entriesB = Object.entries(weightsB);
  if (entriesA.length !== entriesB.length) return false;
  for (const [k, v] of entriesA) {
    if (weightsB[k] !== v) return false;
  }
  return true;
}

export function getExpectedNormalizedKey(keys) {
  const norm = {};
  let textSeen = false;
  for (const [field, val] of Object.entries(keys || {})) {
    if (val === 'text') {
      if (!textSeen) {
        norm._fts = 'text';
        norm._ftsx = 1;
        textSeen = true;
      }
    } else {
      norm[field] = val;
    }
  }
  return norm;
}

/**
 * Validates whether an existing index satisfies a required schema index,
 * correctly handling MongoDB's normalized text-index representation (_fts/_ftsx and weights),
 * rejecting extra compound keys, mismatched weights, and mismatched options.
 */
export function findMatchingIndex(existingIndexes, required) {
  if (!Array.isArray(existingIndexes)) {
    return { status: 'MISSING' };
  }

  if (isTextIndex(required.keys)) {
    const expectedKey = getExpectedNormalizedKey(required.keys);
    const expectedWeights = getExpectedWeights(required.keys);
    const expectedDefaultLang = required.options.default_language || 'english';
    const expectedLangOverride = required.options.language_override || 'language';

    const existingTextIdx = existingIndexes.find(idx => idx.key && (idx.key._fts === 'text' || idx.key._ftsx !== undefined));

    if (existingTextIdx) {
      // 1. Exact normalized key structure match (rejects extra compound prefix/suffix keys)
      if (!areKeysEqual(existingTextIdx.key, expectedKey)) {
        return {
          status: 'CONFLICT',
          reason: `Text index key structure mismatch: expected ${JSON.stringify(expectedKey)}, got ${JSON.stringify(existingTextIdx.key)}`
        };
      }

      // 2. Weights match
      if (!areWeightsEqual(existingTextIdx.weights, expectedWeights)) {
        return {
          status: 'CONFLICT',
          reason: `Text index weights mismatch: expected ${JSON.stringify(expectedWeights)}, got ${JSON.stringify(existingTextIdx.weights || {})}`
        };
      }

      // 3. Effective default_language match
      const actualDefaultLang = existingTextIdx.default_language || 'english';
      if (actualDefaultLang !== expectedDefaultLang) {
        return {
          status: 'CONFLICT',
          reason: `Text index default_language mismatch: expected "${expectedDefaultLang}", got "${actualDefaultLang}"`
        };
      }

      // 4. Effective language_override match
      const actualLangOverride = existingTextIdx.language_override || 'language';
      if (actualLangOverride !== expectedLangOverride) {
        return {
          status: 'CONFLICT',
          reason: `Text index language_override mismatch: expected "${expectedLangOverride}", got "${actualLangOverride}"`
        };
      }

      // 5. Unique, sparse, and partialFilterExpression matches
      const uniqueMatches = Boolean(existingTextIdx.unique) === Boolean(required.options.unique);
      const sparseMatches = Boolean(existingTextIdx.sparse) === Boolean(required.options.sparse);
      const pfeMatches = deepEqual(existingTextIdx.partialFilterExpression, required.options.partialFilterExpression);

      if (!uniqueMatches || !sparseMatches || !pfeMatches) {
        return {
          status: 'CONFLICT',
          reason: `Text index options mismatch. Expected unique=${Boolean(required.options.unique)}, sparse=${Boolean(required.options.sparse)}, got unique=${Boolean(existingTextIdx.unique)}, sparse=${Boolean(existingTextIdx.sparse)}`
        };
      }

      return { status: 'MATCH', index: existingTextIdx };
    }

    const existingByName = existingIndexes.find(idx => idx.name === required.options.name);
    if (existingByName) {
      return {
        status: 'CONFLICT',
        reason: `Index name "${required.options.name}" is already used by non-text index: ${JSON.stringify(existingByName.key)}`
      };
    }

    return { status: 'MISSING' };
  }

  // Standard non-text index comparison
  const existingWithSameKeys = existingIndexes.find(idx => areKeysEqual(idx.key, required.keys));
  const existingWithSameName = existingIndexes.find(idx => idx.name === required.options.name);

  if (existingWithSameKeys) {
    const uniqueMatches = Boolean(existingWithSameKeys.unique) === Boolean(required.options.unique);
    const sparseMatches = Boolean(existingWithSameKeys.sparse) === Boolean(required.options.sparse);
    const pfeMatches = deepEqual(existingWithSameKeys.partialFilterExpression, required.options.partialFilterExpression);

    const ttlMatches = required.options.expireAfterSeconds === undefined
      ? existingWithSameKeys.expireAfterSeconds === undefined
      : existingWithSameKeys.expireAfterSeconds === required.options.expireAfterSeconds;

    if (!uniqueMatches || !sparseMatches || !pfeMatches || !ttlMatches) {
      return {
        status: 'CONFLICT',
        reason: `Conflicting options on keys ${JSON.stringify(required.keys)}. Existing: unique=${existingWithSameKeys.unique}, ttl=${existingWithSameKeys.expireAfterSeconds}, pfe=${JSON.stringify(existingWithSameKeys.partialFilterExpression)}. Required: unique=${required.options.unique}, ttl=${required.options.expireAfterSeconds}, pfe=${JSON.stringify(required.options.partialFilterExpression)}`
      };
    }

    return { status: 'MATCH', index: existingWithSameKeys };
  }

  if (existingWithSameName) {
    return {
      status: 'CONFLICT',
      reason: `Index name "${required.options.name}" is already used by different keys: ${JSON.stringify(existingWithSameName.key)}`
    };
  }

  return { status: 'MISSING' };
}

/**
 * Executes safe, idempotent staging provisioning across 4 discrete stages:
 * A: Read-only inspection of all existing target collections/indexes
 * B: Conflict & obsolete index validation across all collections
 * C: Creation of only missing collections and indexes
 * D: Full re-read verification
 */
export async function executeProvisioningPlan(db) {
  // --- Stage A: Read-only inspection ---
  const existingCollections = await db.listCollections().toArray();
  const existingColNames = new Set(existingCollections.map(c => c.name));

  const state = {};
  for (const colName of Object.keys(REQUIRED_SCHEMA)) {
    if (existingColNames.has(colName)) {
      const col = db.collection(colName);
      state[colName] = await col.indexes();
    } else {
      state[colName] = null;
    }
  }

  // --- Stage B: Validate conflicts and obsolete indexes before any writes ---
  if (state.orders) {
    const obsoleteGlobalIdx = state.orders.find(idx => {
      const keyEntries = Object.entries(idx.key || {});
      return keyEntries.length === 1 && keyEntries[0][0] === 'clientOrderId' && idx.unique === true;
    });
    if (obsoleteGlobalIdx) {
      throw new Error('FAIL-CLOSED [STAGE:CONFLICT_CHECK]: Obsolete single-key unique index on clientOrderId is present in orders collection. Manual DBA cleanup required before tests.');
    }
  }

  const plannedCreations = []; // Array of { colName, required }
  for (const [colName, { indexes }] of Object.entries(REQUIRED_SCHEMA)) {
    const existingIndexes = state[colName];

    if (!existingIndexes) {
      for (const required of indexes) {
        plannedCreations.push({ colName, required });
      }
      continue;
    }

    for (const required of indexes) {
      const result = findMatchingIndex(existingIndexes, required);
      if (result.status === 'MATCH') {
        continue;
      }
      if (result.status === 'CONFLICT') {
        throw new Error(`FAIL-CLOSED [STAGE:CONFLICT_CHECK]: Conflicting index detected on "${colName}": ${result.reason}. Will not overwrite or delete existing index.`);
      }
      if (result.status === 'MISSING') {
        plannedCreations.push({ colName, required });
      }
    }
  }

  // --- Stage C: Create missing collections & missing indexes ---
  for (const colName of Object.keys(REQUIRED_SCHEMA)) {
    if (!existingColNames.has(colName)) {
      console.log(`[STAGING PROVISION] Creating empty collection: ${colName}`);
      await db.createCollection(colName);
    }
  }

  for (const { colName, required } of plannedCreations) {
    console.log(`[STAGING PROVISION] Creating index on ${colName}: ${required.options.name} ...`);
    const col = db.collection(colName);
    await col.createIndex(required.keys, required.options);
  }

  // --- Stage D: Re-read and verify final index state ---
  for (const [colName, { indexes }] of Object.entries(REQUIRED_SCHEMA)) {
    const col = db.collection(colName);
    const finalIndexes = await col.indexes();
    for (const required of indexes) {
      const result = findMatchingIndex(finalIndexes, required);
      if (result.status !== 'MATCH') {
        throw new Error(`FAIL-CLOSED [STAGE:VERIFY]: Verification failed on "${colName}" for index "${required.options.name}". Expected MATCH, got ${result.status}.`);
      }
    }
  }

  return {
    success: true,
    createdCount: plannedCreations.length
  };
}

export function classifyConnectionError(err) {
  if (!err) {
    return {
      name: 'UnknownError',
      code: 'N/A',
      codeName: 'N/A',
      classification: 'UNKNOWN',
      hint: 'No error details provided.'
    };
  }

  const name = err.name || (err.constructor && err.constructor.name) || 'Error';
  const code = err.code !== undefined && err.code !== null ? String(err.code) : 'N/A';
  const codeName = err.codeName || 'N/A';
  const rawMsg = typeof err.message === 'string' ? err.message : '';

  // 1. Authentication classification
  // MongoDB Atlas auth errors: code 8000 (AtlasError) or code 18 (AuthenticationFailed)
  if (
    code === '18' ||
    code === '8000' ||
    codeName === 'AuthenticationFailed' ||
    /auth.*failed|bad auth|AuthenticationFailed/i.test(rawMsg)
  ) {
    return {
      name,
      code,
      codeName,
      classification: 'AUTHENTICATION',
      hint: 'Authentication failed for staging setup user. Ensure the username and password are correct in Atlas Database Users.'
    };
  }

  // 2. DNS classification
  if (
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    err.syscall === 'querySrv' ||
    err.syscall === 'getaddrinfo' ||
    /ENOTFOUND|EAI_AGAIN|querySrv|getaddrinfo/i.test(rawMsg)
  ) {
    return {
      name,
      code,
      codeName,
      classification: 'DNS',
      hint: 'DNS resolution failed for the staging cluster. Check local DNS settings and internet connectivity.'
    };
  }

  // 3. TLS / SSL classification
  if (
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'CERT_HAS_EXPIRED' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    /SSL|TLS|certificate|handshake|self-signed/i.test(rawMsg)
  ) {
    return {
      name,
      code,
      codeName,
      classification: 'TLS',
      hint: 'TLS/SSL handshake or certificate validation failed. Check system root certificates and TLS configuration.'
    };
  }

  // 4. Atlas IP Access classification
  // Dropped connections by Atlas cluster gateway or explicit IP whitelist mentions
  if (
    /whitelisted|IP.*access|IP.*address|could not connect to any servers/i.test(rawMsg) ||
    (name.includes('ServerSelectionError') && /connection.*closed|ECONNREFUSED/i.test(rawMsg))
  ) {
    return {
      name,
      code,
      codeName,
      classification: 'ATLAS_IP_ACCESS',
      hint: 'Connection rejected or dropped by Atlas cluster gateway. Likely cause: client IP is not in Atlas Network Access list.'
    };
  }

  // 5. Network Timeout classification
  if (
    code === 'ETIMEDOUT' ||
    code === 'ESOCKETTIMEDOUT' ||
    name === 'MongoNetworkTimeoutError' ||
    /timed out/i.test(rawMsg)
  ) {
    return {
      name,
      code,
      codeName,
      classification: 'NETWORK_TIMEOUT',
      hint: 'Connection timed out while reaching MongoDB Atlas cluster. Check network latency, firewall rules on port 27017, or Atlas IP access.'
    };
  }

  return {
    name,
    code,
    codeName,
    classification: 'UNKNOWN',
    hint: 'Connection failed with an unclassified error.'
  };
}

export async function provisionStagingDatabase(rawUri) {
  if (!rawUri || typeof rawUri !== 'string' || !rawUri.trim()) {
    throw new Error('FAIL-CLOSED [STAGE:URI_VALIDATION]: STAGING_SETUP_MONGO_URI environment variable is required.');
  }

  let parsed;
  try {
    parsed = new URL(rawUri);
  } catch {
    throw new Error('FAIL-CLOSED [STAGE:URI_VALIDATION]: STAGING_SETUP_MONGO_URI could not be parsed as a valid URL.');
  }

  if (parsed.protocol !== 'mongodb+srv:') {
    throw new Error(`FAIL-CLOSED [STAGE:URI_VALIDATION]: Target protocol must be "mongodb+srv:", got "${parsed.protocol}".`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== APPROVED_STAGING_HOST) {
    throw new Error(`FAIL-CLOSED [STAGE:URI_VALIDATION]: Target host does not match approved staging host "${APPROVED_STAGING_HOST}".`);
  }

  const targetDb = parsed.pathname.replace(/^\//, '').split('?')[0];
  if (targetDb !== APPROVED_DATABASE) {
    throw new Error(`FAIL-CLOSED [STAGE:URI_VALIDATION]: Target database does not match approved database "${APPROVED_DATABASE}".`);
  }

  console.log(`[STAGING PROVISION] Connecting to verified host "${APPROVED_STAGING_HOST}", database "${APPROVED_DATABASE}"...`);

  let connectionAttempted = false;
  let executionError = null;
  let disconnectError = null;
  let result = null;

  try {
    connectionAttempted = true;
    try {
      await mongoose.connect(rawUri, {
        autoIndex: false,
        autoCreate: false,
        dbName: APPROVED_DATABASE,
        serverSelectionTimeoutMS: 8000
      });
    } catch (err) {
      const diag = classifyConnectionError(err);
      throw new Error(
        `FAIL-CLOSED [STAGE:CONNECT]: Database connection failed.\n` +
        `  Error Name:       ${diag.name}\n` +
        `  Error Code:       ${diag.code}\n` +
        `  Error CodeName:   ${diag.codeName}\n` +
        `  Classification:   ${diag.classification}\n` +
        `  Diagnostic Hint:  ${diag.hint}\n` +
        `  Credentials and connection string have been sanitized from this message.`
      );
    }

    const activeDbName = mongoose.connection.name;
    if (activeDbName !== APPROVED_DATABASE) {
      throw new Error(`FAIL-CLOSED [STAGE:DB_VERIFY]: Connected database "${activeDbName}" does not match "${APPROVED_DATABASE}".`);
    }

    result = await executeProvisioningPlan(mongoose.connection.db);
  } catch (err) {
    executionError = err;
  } finally {
    if (connectionAttempted) {
      try {
        await mongoose.disconnect();
        console.log('[STAGING PROVISION] Connection closed.');
      } catch {
        disconnectError = new Error('FAIL-CLOSED [STAGE:DISCONNECT]: Failed to cleanly disconnect from staging database.');
      }
    }
  }

  if (executionError) {
    throw executionError;
  }
  if (disconnectError) {
    throw disconnectError;
  }

  console.log(`[STAGING PROVISION] SUCCESS: Provisioning verified and connection closed cleanly. Newly created indexes: ${result.createdCount}.`);
  return result;
}

// Direct CLI execution guard
if (process.argv[1] && process.argv[1].endsWith('provisionStagingDb.js')) {
  provisionStagingDatabase(process.env.STAGING_SETUP_MONGO_URI)
    .then(() => process.exit(0))
    .catch(err => {
      console.error(`[STAGING PROVISION ERROR] ${err.message || 'Provisioning failed.'}`);
      process.exit(1);
    });
}
