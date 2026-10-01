import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  APPROVED_STAGING_HOST,
  APPROVED_DATABASE,
  REQUIRED_SCHEMA,
  findMatchingIndex,
  isTextIndex,
  getExpectedWeights,
  getExpectedNormalizedKey,
  executeProvisioningPlan,
  provisionStagingDatabase
} from '../scripts/provisionStagingDb.js';
import { executeTeardown } from '../utils/testTeardownHelper.js';

test('1. Normalized text index matching and rejection of extra compound keys or mismatched options', () => {
  const textReq = REQUIRED_SCHEMA.products.indexes.find(i => i.options.name === 'name_text_tags_text');
  assert.ok(textReq, 'Required text index must be defined in schema');
  assert.equal(isTextIndex(textReq.keys), true);

  const expectedKey = getExpectedNormalizedKey(textReq.keys);
  assert.deepEqual(expectedKey, { _fts: 'text', _ftsx: 1 });

  const expectedWeights = getExpectedWeights(textReq.keys);
  assert.deepEqual(expectedWeights, { name: 1, tags: 1 });

  // Case A: Correct normalized MongoDB text index descriptor -> MATCH
  const validMongoIndex = {
    v: 2,
    key: { _fts: 'text', _ftsx: 1 },
    name: 'name_text_tags_text',
    weights: { name: 1, tags: 1 },
    default_language: 'english',
    language_override: 'language',
    textIndexVersion: 3
  };
  const matchResult = findMatchingIndex([validMongoIndex], textReq);
  assert.equal(matchResult.status, 'MATCH');
  assert.equal(matchResult.index.name, 'name_text_tags_text');

  // Case B: Extra compound keys present in key structure -> CONFLICT
  const extraCompoundKeyIndex = {
    v: 2,
    key: { category: 1, _fts: 'text', _ftsx: 1 },
    name: 'category_1_name_text_tags_text',
    weights: { name: 1, tags: 1 },
    default_language: 'english',
    language_override: 'language'
  };
  const extraKeyResult = findMatchingIndex([extraCompoundKeyIndex], textReq);
  assert.equal(extraKeyResult.status, 'CONFLICT');
  assert.match(extraKeyResult.reason, /key structure mismatch/);

  // Case C: Mismatched weights alone must NOT match -> CONFLICT
  const wrongWeightsIndex = {
    v: 2,
    key: { _fts: 'text', _ftsx: 1 },
    name: 'name_text_tags_text',
    weights: { name: 2, tags: 1 }, // mismatch in weight
    default_language: 'english',
    language_override: 'language'
  };
  const wrongWeightsResult = findMatchingIndex([wrongWeightsIndex], textReq);
  assert.equal(wrongWeightsResult.status, 'CONFLICT');
  assert.match(wrongWeightsResult.reason, /weights mismatch/);

  // Case D: Mismatched default_language -> CONFLICT
  const wrongLangIndex = {
    v: 2,
    key: { _fts: 'text', _ftsx: 1 },
    name: 'name_text_tags_text',
    weights: { name: 1, tags: 1 },
    default_language: 'spanish',
    language_override: 'language'
  };
  const wrongLangResult = findMatchingIndex([wrongLangIndex], textReq);
  assert.equal(wrongLangResult.status, 'CONFLICT');
  assert.match(wrongLangResult.reason, /default_language mismatch/);

  // Case E: Mismatched language_override -> CONFLICT
  const wrongOverrideIndex = {
    v: 2,
    key: { _fts: 'text', _ftsx: 1 },
    name: 'name_text_tags_text',
    weights: { name: 1, tags: 1 },
    default_language: 'english',
    language_override: 'custom_lang_field'
  };
  const wrongOverrideResult = findMatchingIndex([wrongOverrideIndex], textReq);
  assert.equal(wrongOverrideResult.status, 'CONFLICT');
  assert.match(wrongOverrideResult.reason, /language_override mismatch/);
});

test('2. Conflict detected during Stage B before ANY create operation is performed', async () => {
  let createCollectionCalls = 0;
  let createIndexCalls = 0;

  // Mock DB where 'orders' has a conflicting index definition (unique: false instead of unique: true)
  const mockDb = {
    listCollections: () => ({
      toArray: async () => [{ name: 'orders' }]
    }),
    collection: (name) => ({
      indexes: async () => {
        if (name === 'orders') {
          return [
            {
              key: { orderNumber: 1 },
              name: 'orderNumber_1',
              unique: false // CONFLICT: schema requires unique: true
            }
          ];
        }
        return [];
      },
      createIndex: async () => {
        createIndexCalls++;
      }
    }),
    createCollection: async () => {
      createCollectionCalls++;
    }
  };

  await assert.rejects(
    async () => {
      await executeProvisioningPlan(mockDb);
    },
    (err) => {
      assert.match(err.message, /FAIL-CLOSED \[STAGE:CONFLICT_CHECK\]: Conflicting index detected on "orders"/);
      return true;
    }
  );

  assert.equal(createCollectionCalls, 0, 'No collection must be created when conflict is detected');
  assert.equal(createIndexCalls, 0, 'No index must be created when conflict is detected');
});

test('2b. Obsolete legacy clientOrderId unique index is rejected before any create operation', async () => {
  let createCollectionCalls = 0;
  let createIndexCalls = 0;

  const mockDb = {
    listCollections: () => ({
      toArray: async () => [{ name: 'orders' }]
    }),
    collection: (name) => ({
      indexes: async () => {
        if (name === 'orders') {
          return [
            { key: { clientOrderId: 1 }, name: 'clientOrderId_1', unique: true }
          ];
        }
        return [];
      },
      createIndex: async () => { createIndexCalls++; },
      indexesCalled: true
    }),
    createCollection: async () => { createCollectionCalls++; }
  };

  await assert.rejects(
    async () => {
      await executeProvisioningPlan(mockDb);
    },
    (err) => {
      assert.match(err.message, /FAIL-CLOSED \[STAGE:CONFLICT_CHECK\]: Obsolete single-key unique index on clientOrderId is present in orders collection/);
      return true;
    }
  );

  assert.equal(createCollectionCalls, 0);
  assert.equal(createIndexCalls, 0);
});

test('3. Error sanitization in provisionStagingDatabase prevents credential and raw driver leakage', async () => {
  // Test protocol validation
  await assert.rejects(
    async () => {
      await provisionStagingDatabase(`mongodb://${APPROVED_STAGING_HOST}/${APPROVED_DATABASE}`);
    },
    (err) => {
      assert.match(err.message, /FAIL-CLOSED \[STAGE:URI_VALIDATION\]: Target protocol must be "mongodb\+srv:"/);
      return true;
    }
  );

  // Test host validation
  await assert.rejects(
    async () => {
      await provisionStagingDatabase(`mongodb+srv://wrong-host.mongodb.net/${APPROVED_DATABASE}`);
    },
    (err) => {
      assert.match(err.message, /FAIL-CLOSED \[STAGE:URI_VALIDATION\]: Target host does not match approved staging host/);
      return true;
    }
  );

  // Test database validation
  await assert.rejects(
    async () => {
      await provisionStagingDatabase(`mongodb+srv://${APPROVED_STAGING_HOST}/wrong_db`);
    },
    (err) => {
      assert.match(err.message, /FAIL-CLOSED \[STAGE:URI_VALIDATION\]: Target database does not match approved database/);
      return true;
    }
  );

  // Test connection failure inside try/finally: driver error containing secret must be sanitized
  const originalConnect = mongoose.connect;
  const originalDisconnect = mongoose.disconnect;
  let disconnectCalled = false;

  mongoose.connect = async () => {
    throw new Error('MongoServerSelectionError: connection timed out containing mongodb+srv://app_user:SUPER_SECRET_PASSWORD@cluster');
  };
  mongoose.disconnect = async () => {
    disconnectCalled = true;
  };

  try {
    await assert.rejects(
      async () => {
        await provisionStagingDatabase(`mongodb+srv://${APPROVED_STAGING_HOST}/${APPROVED_DATABASE}`);
      },
      (err) => {
        assert.equal(err.message, 'FAIL-CLOSED [STAGE:CONNECT]: Database connection failed. Credentials and connection string have been sanitized from this message.');
        assert.equal(err.message.includes('SUPER_SECRET_PASSWORD'), false);
        return true;
      }
    );
    assert.equal(disconnectCalled, true, 'disconnect must be called on connection failure');
  } finally {
    mongoose.connect = originalConnect;
    mongoose.disconnect = originalDisconnect;
  }
});

test('4. Provisioning disconnect failure must cause nonzero exit status (cannot swallow error)', async () => {
  const originalConnect = mongoose.connect;
  const originalDisconnect = mongoose.disconnect;

  // Mock successful connection and execution
  mongoose.connect = async () => {};
  const originalDb = mongoose.connection.db;
  const originalName = mongoose.connection.name;

  // Mock stateful database where creation succeeds so Stage D verify passes
  const createdCollections = new Set();
  const createdIndexes = {
    orders: [],
    riders: [],
    users: [],
    vendors: [],
    products: [],
    refreshtokens: []
  };

  Object.defineProperty(mongoose.connection, 'name', { value: APPROVED_DATABASE, configurable: true });
  Object.defineProperty(mongoose.connection, 'db', {
    value: {
      listCollections: () => ({
        toArray: async () => Array.from(createdCollections).map(name => ({ name }))
      }),
      collection: (name) => ({
        indexes: async () => createdIndexes[name] || [],
        createIndex: async (keys, options) => {
          if (!createdIndexes[name]) createdIndexes[name] = [];
          if (name === 'products' && keys.name === 'text') {
            createdIndexes[name].push({
              key: { _fts: 'text', _ftsx: 1 },
              name: options.name,
              weights: { name: 1, tags: 1 },
              default_language: 'english',
              language_override: 'language'
            });
          } else {
            createdIndexes[name].push({
              key: keys,
              name: options.name,
              unique: Boolean(options.unique),
              sparse: Boolean(options.sparse),
              expireAfterSeconds: options.expireAfterSeconds,
              partialFilterExpression: options.partialFilterExpression
            });
          }
        }
      }),
      createCollection: async (name) => {
        createdCollections.add(name);
      }
    },
    configurable: true
  });

  // Mock disconnect failure
  mongoose.disconnect = async () => {
    throw new Error('MongoNetworkError: network partition during disconnect');
  };

  try {
    await assert.rejects(
      async () => {
        await provisionStagingDatabase(`mongodb+srv://${APPROVED_STAGING_HOST}/${APPROVED_DATABASE}`);
      },
      (err) => {
        assert.equal(err.message, 'FAIL-CLOSED [STAGE:DISCONNECT]: Failed to cleanly disconnect from staging database.');
        return true;
      }
    );
  } finally {
    mongoose.connect = originalConnect;
    mongoose.disconnect = originalDisconnect;
    Object.defineProperty(mongoose.connection, 'name', { value: originalName, configurable: true });
    Object.defineProperty(mongoose.connection, 'db', { value: originalDb, configurable: true });
  }
});

test('5. Shutdown failure does not bypass database cleanup in actual executeTeardown implementation', async () => {
  let socketDisconnected = false;
  let ioClosed = false;
  let httpClosed = false;
  let ordersDeleted = false;
  let ridersDeleted = false;
  let mongooseClosed = false;

  const mockIo = {
    disconnectSockets: () => { socketDisconnected = true; },
    close: (cb) => {
      ioClosed = true;
      cb(new Error('Simulated Socket.IO network failure'));
    }
  };

  const mockServer = {
    listening: true,
    close: (cb) => {
      httpClosed = true;
      cb(null);
    }
  };

  const mockModels = {
    Order: {
      deleteMany: async () => { ordersDeleted = true; }
    },
    Rider: {
      deleteMany: async () => { ridersDeleted = true; }
    },
    Product: { deleteMany: async () => {} },
    Vendor: { deleteMany: async () => {} },
    User: { deleteMany: async () => {} }
  };

  const mockMongooseConn = {
    readyState: 1,
    name: 'farmart_test_disposable',
    close: async () => { mongooseClosed = true; }
  };

  const trackedIds = {
    orders: new Set(['ord_1']),
    riders: new Set(['rid_1']),
    products: new Set(),
    vendors: new Set(),
    users: new Set()
  };

  // Call the actual exported executeTeardown function from testTeardownHelper.js
  await assert.rejects(
    async () => {
      await executeTeardown({
        io: mockIo,
        server: mockServer,
        handshakePassed: true,
        mongooseConnection: mockMongooseConn,
        trackedIds,
        isStagingMode: true,
        models: mockModels
      });
    },
    (err) => {
      assert.equal(err.message, 'FAIL-CLOSED [STAGE:SOCKET_SHUTDOWN]: Socket.IO close encountered an error.');
      return true;
    }
  );

  assert.equal(socketDisconnected, true, 'Socket.IO disconnectSockets must be called');
  assert.equal(ioClosed, true, 'Socket.IO close must be called');
  assert.equal(httpClosed, true, 'HTTP server close must be called');
  assert.equal(ordersDeleted, true, 'Database cleanup for orders must execute even after socket failure');
  assert.equal(ridersDeleted, true, 'Database cleanup for riders must execute even after socket failure');
  assert.equal(mongooseClosed, true, 'Mongoose disconnect/close must execute in finally');
});
