import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import {
  validateLiveStagingGuards,
  verifyTargetApiStagingEnvironment,
  performTeardown,
  waitForAutoDispatchedOffer,
  createdFixtureIds
} from './orderLifecycle.liveStaging.test.js';
import {
  APPROVED_STAGING_HOST,
  APPROVED_DATABASE
} from '../config/db.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Rider from '../models/Rider.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';

test('Offline Staging Guards & Teardown Hardening Test Suite', async (t) => {
  const validUri = `mongodb+srv://staging_tester:SuperSecretPassword123@${APPROVED_STAGING_HOST}/${APPROVED_DATABASE}?retryWrites=true&w=majority`;
  const baseValidEnv = {
    ALLOW_LIVE_STAGING_TEST: 'true',
    MONGODB_URI: validUri,
    JWT_ACCESS_SECRET: 'test_jwt_access_secret_12345'
  };

  // 1. Guard 1: Missing Opt-In Check
  await t.test('1. Missing opt-in prevents all execution (0 connects, 0 writes)', () => {
    let connectCalled = 0;
    const origConnect = mongoose.connect;
    mongoose.connect = async () => { connectCalled++; };

    try {
      // Test missing env var
      assert.throws(
        () => validateLiveStagingGuards({ ...baseValidEnv, ALLOW_LIVE_STAGING_TEST: undefined }),
        /FAIL-CLOSED: Live staging test requires explicit opt-in via ALLOW_LIVE_STAGING_TEST=true\./
      );

      // Test false env var
      assert.throws(
        () => validateLiveStagingGuards({ ...baseValidEnv, ALLOW_LIVE_STAGING_TEST: 'false' }),
        /FAIL-CLOSED: Live staging test requires explicit opt-in via ALLOW_LIVE_STAGING_TEST=true\./
      );

      // Verify ZERO connection attempts
      assert.equal(connectCalled, 0, 'mongoose.connect must never be called when opt-in is missing');
    } finally {
      mongoose.connect = origConnect;
    }
  });

  // 2. Guard 2: Missing or Empty URI
  await t.test('2. Missing or empty URI fails closed (0 connects, 0 writes)', () => {
    let connectCalled = 0;
    const origConnect = mongoose.connect;
    mongoose.connect = async () => { connectCalled++; };

    try {
      assert.throws(
        () => validateLiveStagingGuards({ ...baseValidEnv, MONGODB_URI: '' }),
        /FAIL-CLOSED: MONGODB_URI or STAGING_MONGO_URI is required/
      );
      assert.throws(
        () => validateLiveStagingGuards({ ...baseValidEnv, MONGODB_URI: null }),
        /FAIL-CLOSED: MONGODB_URI or STAGING_MONGO_URI is required/
      );
      assert.equal(connectCalled, 0);
    } finally {
      mongoose.connect = origConnect;
    }
  });

  // 3. Guard 3: Wrong Protocol Pinning
  await t.test('3. Non-mongodb+srv protocol fails closed (0 connects, 0 writes)', () => {
    let connectCalled = 0;
    const origConnect = mongoose.connect;
    mongoose.connect = async () => { connectCalled++; };

    try {
      assert.throws(
        () => validateLiveStagingGuards({
          ...baseValidEnv,
          MONGODB_URI: `mongodb://staging_tester:pass@${APPROVED_STAGING_HOST}/${APPROVED_DATABASE}`
        }),
        /FAIL-CLOSED:.*protocol "mongodb\+srv:"/
      );
      assert.equal(connectCalled, 0);
    } finally {
      mongoose.connect = origConnect;
    }
  });

  // 4. Guard 4: Host Pinning
  await t.test('4. Host mismatch fails closed (0 connects, 0 writes)', () => {
    let connectCalled = 0;
    const origConnect = mongoose.connect;
    mongoose.connect = async () => { connectCalled++; };

    try {
      // Localhost host
      assert.throws(
        () => validateLiveStagingGuards({
          ...baseValidEnv,
          MONGODB_URI: `mongodb+srv://staging_tester:pass@localhost/${APPROVED_DATABASE}`
        }),
        /FAIL-CLOSED: Staging host mismatch/
      );

      // Other Atlas cluster
      assert.throws(
        () => validateLiveStagingGuards({
          ...baseValidEnv,
          MONGODB_URI: `mongodb+srv://staging_tester:pass@production-cluster.mongodb.net/${APPROVED_DATABASE}`
        }),
        /FAIL-CLOSED: Staging host mismatch/
      );
      assert.equal(connectCalled, 0);
    } finally {
      mongoose.connect = origConnect;
    }
  });

  // 5. Guard 5: Database Pinning
  await t.test('5. Database mismatch fails closed (0 connects, 0 writes)', () => {
    let connectCalled = 0;
    const origConnect = mongoose.connect;
    mongoose.connect = async () => { connectCalled++; };

    try {
      // Production DB name
      assert.throws(
        () => validateLiveStagingGuards({
          ...baseValidEnv,
          MONGODB_URI: `mongodb+srv://staging_tester:pass@${APPROVED_STAGING_HOST}/production_db`
        }),
        /FAIL-CLOSED: Staging database mismatch/
      );

      // Generic test DB name
      assert.throws(
        () => validateLiveStagingGuards({
          ...baseValidEnv,
          MONGODB_URI: `mongodb+srv://staging_tester:pass@${APPROVED_STAGING_HOST}/test`
        }),
        /FAIL-CLOSED: Staging database mismatch/
      );
      assert.equal(connectCalled, 0);
    } finally {
      mongoose.connect = origConnect;
    }
  });

  // 6. Guard 6: Explicit Credentials Requirement
  await t.test('6. Missing credentials in URI fails closed (0 connects, 0 writes)', () => {
    let connectCalled = 0;
    const origConnect = mongoose.connect;
    mongoose.connect = async () => { connectCalled++; };

    try {
      // No credentials in URI
      assert.throws(
        () => validateLiveStagingGuards({
          ...baseValidEnv,
          MONGODB_URI: `mongodb+srv://${APPROVED_STAGING_HOST}/${APPROVED_DATABASE}`
        }),
        /FAIL-CLOSED: Explicit staging database credentials/
      );

      // Username but no password
      assert.throws(
        () => validateLiveStagingGuards({
          ...baseValidEnv,
          MONGODB_URI: `mongodb+srv://user@${APPROVED_STAGING_HOST}/${APPROVED_DATABASE}`
        }),
        /FAIL-CLOSED: Explicit staging database credentials/
      );
      assert.equal(connectCalled, 0);
    } finally {
      mongoose.connect = origConnect;
    }
  });

  // 7. Guard 7: Missing JWT Secret
  await t.test('7. Missing JWT secret fails closed (0 connects, 0 writes)', () => {
    let connectCalled = 0;
    const origConnect = mongoose.connect;
    mongoose.connect = async () => { connectCalled++; };

    try {
      assert.throws(
        () => validateLiveStagingGuards({
          ...baseValidEnv,
          JWT_ACCESS_SECRET: '',
          JWT_SECRET: ''
        }),
        /FAIL-CLOSED: JWT_ACCESS_SECRET is required/
      );
      assert.equal(connectCalled, 0);
    } finally {
      mongoose.connect = origConnect;
    }
  });

  // 8. Positive Verification: Approved Staging Config Passes
  await t.test('8. Approved staging configuration passes validation with exact credentials and host', () => {
    const config = validateLiveStagingGuards(baseValidEnv);
    assert.equal(config.host, APPROVED_STAGING_HOST);
    assert.equal(config.database, APPROVED_DATABASE);
    assert.equal(config.username, 'staging_tester');
  });

  // 9. Guard 8: Target API Server Environment & Probe Verification
  await t.test('9. Target API server environment check verifies database parity and fails closed on mismatch', async () => {
    const origFetch = global.fetch;

    try {
      // 9a: Server unreachable
      global.fetch = async () => {
        throw new Error('fetch failed (ECONNREFUSED)');
      };
      await assert.rejects(
        () => verifyTargetApiStagingEnvironment('http://localhost:5000/api'),
        /FAIL-CLOSED: Target API server is unreachable/
      );

      // 9b: Server returns 500 on health
      global.fetch = async (url) => {
        if (url.includes('/health')) {
          return { ok: false, status: 500 };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      };
      await assert.rejects(
        () => verifyTargetApiStagingEnvironment('http://localhost:5000/api'),
        /FAIL-CLOSED: Target API server health check failed/
      );

      // 9c: Server probe category not found (mismatched database)
      global.fetch = async (url) => {
        if (url.includes('/health')) {
          return { ok: true, status: 200, json: async () => ({ status: 'OK' }) };
        }
        if (url.includes('/categories/probe_cat_123')) {
          return { ok: false, status: 404, json: async () => ({ success: false, message: 'Not Found' }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      };
      await assert.rejects(
        () => verifyTargetApiStagingEnvironment('http://localhost:5000/api', {
          categorySlug: 'probe_cat_123',
          categoryId: '65f1234567890abcdef12345'
        }),
        /FAIL-CLOSED: Target API server at .* cannot find disposable staging probe category/
      );

      // 9d: Server probe category ID mismatch
      global.fetch = async (url) => {
        if (url.includes('/health')) {
          return { ok: true, status: 200, json: async () => ({ status: 'OK' }) };
        }
        if (url.includes('/categories/probe_cat_123')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, category: { _id: 'DIFFERENT_ID_99999' } })
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      };
      await assert.rejects(
        () => verifyTargetApiStagingEnvironment('http://localhost:5000/api', {
          categorySlug: 'probe_cat_123',
          categoryId: '65f1234567890abcdef12345'
        }),
        /FAIL-CLOSED: Target API server returned mismatched category data/
      );

      // 9e: Matching environment passes probe verification cleanly
      global.fetch = async (url) => {
        if (url.includes('/health')) {
          return { ok: true, status: 200, json: async () => ({ status: 'OK' }) };
        }
        if (url.includes('/categories/probe_cat_123')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, category: { _id: '65f1234567890abcdef12345' } })
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      };
      await verifyTargetApiStagingEnvironment('http://localhost:5000/api', {
        categorySlug: 'probe_cat_123',
        categoryId: '65f1234567890abcdef12345'
      });
    } finally {
      global.fetch = origFetch;
    }
  });

  // 10. Teardown Guarantee & Order Recovery by clientOrderId
  await t.test('10. performTeardown guarantees fixture cleanup and recovers lost-response orders by clientOrderId', async () => {
    const deletedCollections = {
      orders: 0,
      products: 0,
      categories: 0,
      riders: 0,
      vendors: 0,
      users: 0
    };

    // Stubs
    const origReadyState = mongoose.connection.readyState;
    const origDisconnect = mongoose.disconnect;
    const origOrderFind = Order.find;
    const origOrderDeleteMany = Order.deleteMany;
    const origProductDeleteMany = Product.deleteMany;
    const origCategoryDeleteMany = Category.deleteMany;
    const origRiderDeleteMany = Rider.deleteMany;
    const origVendorDeleteMany = Vendor.deleteMany;
    const origUserDeleteMany = User.deleteMany;
    const origOrderCountDocuments = Order.countDocuments;
    const origProductCountDocuments = Product.countDocuments;
    const origCategoryCountDocuments = Category.countDocuments;
    const origRiderCountDocuments = Rider.countDocuments;
    const origVendorCountDocuments = Vendor.countDocuments;
    const origUserCountDocuments = User.countDocuments;

    let disconnected = false;
    let recoveredOrderId = 'recovered_order_id_88888';
    let queryReceived = null;

    try {
      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
      mongoose.disconnect = async () => { disconnected = true; };

      // Stub Order.find to simulate finding an order whose response was lost
      Order.find = (query) => {
        queryReceived = query;
        return {
          select: () => [{ _id: recoveredOrderId }]
        };
      };

      Order.deleteMany = async (filter) => {
        deletedCollections.orders = filter._id.$in.length;
        return { deletedCount: filter._id.$in.length };
      };
      Product.deleteMany = async (filter) => {
        deletedCollections.products = filter._id.$in.length;
        return { deletedCount: filter._id.$in.length };
      };
      Category.deleteMany = async (filter) => {
        deletedCollections.categories = filter._id.$in.length;
        return { deletedCount: filter._id.$in.length };
      };
      Rider.deleteMany = async (filter) => {
        deletedCollections.riders = filter._id.$in.length;
        return { deletedCount: filter._id.$in.length };
      };
      Vendor.deleteMany = async (filter) => {
        deletedCollections.vendors = filter._id.$in.length;
        return { deletedCount: filter._id.$in.length };
      };
      User.deleteMany = async (filter) => {
        deletedCollections.users = filter._id.$in.length;
        return { deletedCount: filter._id.$in.length };
      };

      // Stub countDocuments to verify 0 remaining fixtures
      Order.countDocuments = async () => 0;
      Product.countDocuments = async () => 0;
      Category.countDocuments = async () => 0;
      Rider.countDocuments = async () => 0;
      Vendor.countDocuments = async () => 0;
      User.countDocuments = async () => 0;

      // Populate test fixtures in tracking sets
      const testRunPrefix = 'TEST_RECOVERY_RUN_99';
      createdFixtureIds.orders.clear();
      createdFixtureIds.products.clear();
      createdFixtureIds.categories.clear();
      createdFixtureIds.riders.clear();
      createdFixtureIds.vendors.clear();
      createdFixtureIds.users.clear();
      createdFixtureIds.clientOrderIds.clear();

      createdFixtureIds.clientOrderIds.add(`${testRunPrefix}_CID_LOST`);
      createdFixtureIds.users.add('user_1');
      createdFixtureIds.vendors.add('vendor_1');
      createdFixtureIds.riders.add('rider_1');
      createdFixtureIds.categories.add('category_1');
      createdFixtureIds.products.add('product_1');

      // Execute teardown
      await performTeardown(testRunPrefix);

      // Verify recovery query checked clientOrderId
      assert.ok(queryReceived, 'Recovery query must be executed');
      assert.ok(
        createdFixtureIds.orders.has(recoveredOrderId),
        'Lost order must be recovered by clientOrderId and added to orders to delete'
      );

      // Verify all collections had deleteMany called with correct counts
      assert.equal(deletedCollections.orders, 1, 'Recovered order must be deleted');
      assert.equal(deletedCollections.products, 1);
      assert.equal(deletedCollections.categories, 1);
      assert.equal(deletedCollections.riders, 1);
      assert.equal(deletedCollections.vendors, 1);
      assert.equal(deletedCollections.users, 1);
      assert.equal(disconnected, true, 'Teardown must disconnect from Mongoose');
    } finally {
      Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
      mongoose.disconnect = origDisconnect;
      Order.find = origOrderFind;
      Order.deleteMany = origOrderDeleteMany;
      Product.deleteMany = origProductDeleteMany;
      Category.deleteMany = origCategoryDeleteMany;
      Rider.deleteMany = origRiderDeleteMany;
      Vendor.deleteMany = origVendorDeleteMany;
      User.deleteMany = origUserDeleteMany;
      Order.countDocuments = origOrderCountDocuments;
      Product.countDocuments = origProductCountDocuments;
      Category.countDocuments = origCategoryCountDocuments;
      Rider.countDocuments = origRiderCountDocuments;
      Vendor.countDocuments = origVendorCountDocuments;
      User.countDocuments = origUserCountDocuments;
    }
  });

  // 11. Auto-dispatch bounded timeout failure test (Missing-offer failure offline test)
  await t.test('11. waitForAutoDispatchedOffer fails when no offer arrives within bounded timeout', async () => {
    const origOrderFindById = Order.findById;
    let pollCount = 0;
    try {
      // Simulate order with no offer attached
      Order.findById = async (id) => {
        pollCount++;
        return {
          _id: id,
          status: 'READY_FOR_RIDER',
          currentOffer: null
        };
      };

      await assert.rejects(
        () => waitForAutoDispatchedOffer('test_order_123', 'rider_abc', 100, 20),
        /FAIL-CLOSED: Auto-dispatch timed out after 100ms: no offer arrived for order test_order_123 targeting rider rider_abc/
      );
      assert.ok(pollCount > 1, `Must have polled multiple times within bounded window (polled ${pollCount} times)`);
    } finally {
      Order.findById = origOrderFindById;
    }
  });

  // 12. Teardown attempts all cleanup operations, always disconnects, and reports failure when deletion fails (Cleanup-failure propagation)
  await t.test('12. performTeardown attempts all cleanup operations, always disconnects, and reports failure when deletion fails', async () => {
    const origReadyState = mongoose.connection.readyState;
    const origDisconnect = mongoose.disconnect;
    const origOrderFind = Order.find;
    const origOrderDeleteMany = Order.deleteMany;
    const origProductDeleteMany = Product.deleteMany;
    const origCategoryDeleteMany = Category.deleteMany;
    const origRiderDeleteMany = Rider.deleteMany;
    const origVendorDeleteMany = Vendor.deleteMany;
    const origUserDeleteMany = User.deleteMany;
    const origOrderCountDocuments = Order.countDocuments;
    const origProductCountDocuments = Product.countDocuments;
    const origCategoryCountDocuments = Category.countDocuments;
    const origRiderCountDocuments = Rider.countDocuments;
    const origVendorCountDocuments = Vendor.countDocuments;
    const origUserCountDocuments = User.countDocuments;

    let disconnected = false;
    const attemptedDeletions = [];

    try {
      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
      mongoose.disconnect = async () => { disconnected = true; };

      // Stub Order.find to return empty
      Order.find = () => ({ select: () => [] });

      // Order deletion throws an error
      Order.deleteMany = async () => {
        attemptedDeletions.push('orders');
        throw new Error('Database disk error during Order cleanup');
      };
      // Other models should STILL be attempted despite Order deletion throwing
      Product.deleteMany = async () => { attemptedDeletions.push('products'); return { deletedCount: 1 }; };
      Category.deleteMany = async () => { attemptedDeletions.push('categories'); return { deletedCount: 1 }; };
      Rider.deleteMany = async () => { attemptedDeletions.push('riders'); return { deletedCount: 1 }; };
      Vendor.deleteMany = async () => { attemptedDeletions.push('vendors'); return { deletedCount: 1 }; };
      User.deleteMany = async () => { attemptedDeletions.push('users'); return { deletedCount: 1 }; };

      Order.countDocuments = async () => 0;
      Product.countDocuments = async () => 0;
      Category.countDocuments = async () => 0;
      Rider.countDocuments = async () => 0;
      Vendor.countDocuments = async () => 0;
      User.countDocuments = async () => 0;

      createdFixtureIds.orders.clear();
      createdFixtureIds.products.clear();
      createdFixtureIds.categories.clear();
      createdFixtureIds.riders.clear();
      createdFixtureIds.vendors.clear();
      createdFixtureIds.users.clear();

      createdFixtureIds.orders.add('order_err_1');
      createdFixtureIds.products.add('prod_err_1');
      createdFixtureIds.categories.add('cat_err_1');
      createdFixtureIds.riders.add('rider_err_1');
      createdFixtureIds.vendors.add('vendor_err_1');
      createdFixtureIds.users.add('user_err_1');

      // Teardown MUST throw and report failure
      await assert.rejects(
        () => performTeardown('ERR_TEST_PREFIX'),
        /FAIL-CLOSED: Teardown failed: Failed to delete orders: Database disk error during Order cleanup/
      );

      // Verify ALL cleanup operations were attempted despite earlier failure
      assert.deepEqual(
        attemptedDeletions,
        ['orders', 'products', 'categories', 'riders', 'vendors', 'users'],
        'All cleanup operations must be attempted even if one fails'
      );

      // Verify ALWAYS disconnected
      assert.equal(disconnected, true, 'Teardown must always disconnect from database even when deletion fails');
    } finally {
      Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
      mongoose.disconnect = origDisconnect;
      Order.find = origOrderFind;
      Order.deleteMany = origOrderDeleteMany;
      Product.deleteMany = origProductDeleteMany;
      Category.deleteMany = origCategoryDeleteMany;
      Rider.deleteMany = origRiderDeleteMany;
      Vendor.deleteMany = origVendorDeleteMany;
      User.deleteMany = origUserDeleteMany;
      Order.countDocuments = origOrderCountDocuments;
      Product.countDocuments = origProductCountDocuments;
      Category.countDocuments = origCategoryCountDocuments;
      Rider.countDocuments = origRiderCountDocuments;
      Vendor.countDocuments = origVendorCountDocuments;
      User.countDocuments = origUserCountDocuments;
    }
  });

  // 13. Teardown reports failure if run-owned fixtures remain after cleanup (Remaining fixtures failure)
  await t.test('13. performTeardown reports failure and disconnects if run-owned fixtures remain', async () => {
    const origReadyState = mongoose.connection.readyState;
    const origDisconnect = mongoose.disconnect;
    const origOrderFind = Order.find;
    const origOrderDeleteMany = Order.deleteMany;
    const origProductDeleteMany = Product.deleteMany;
    const origProductCountDocuments = Product.countDocuments;
    const origOrderCountDocuments = Order.countDocuments;
    const origCategoryCountDocuments = Category.countDocuments;
    const origRiderCountDocuments = Rider.countDocuments;
    const origVendorCountDocuments = Vendor.countDocuments;
    const origUserCountDocuments = User.countDocuments;

    let disconnected = false;

    try {
      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
      mongoose.disconnect = async () => { disconnected = true; };

      Order.find = () => ({ select: () => [] });
      Order.deleteMany = async () => ({ deletedCount: 0 });
      Product.deleteMany = async () => ({ deletedCount: 0 });

      // Simulate that 2 product fixtures still remain in DB
      Product.countDocuments = async () => 2;
      Order.countDocuments = async () => 0;
      Category.countDocuments = async () => 0;
      Rider.countDocuments = async () => 0;
      Vendor.countDocuments = async () => 0;
      User.countDocuments = async () => 0;

      createdFixtureIds.orders.clear();
      createdFixtureIds.products.clear();
      createdFixtureIds.categories.clear();
      createdFixtureIds.riders.clear();
      createdFixtureIds.vendors.clear();
      createdFixtureIds.users.clear();

      createdFixtureIds.products.add('prod_unremoved_1');
      createdFixtureIds.products.add('prod_unremoved_2');

      await assert.rejects(
        () => performTeardown('REMAIN_TEST_PREFIX'),
        /FAIL-CLOSED: Teardown failed:.*2 run-owned products still remain in database/
      );

      assert.equal(disconnected, true, 'Teardown must always disconnect even when remaining fixtures are detected');
    } finally {
      Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
      mongoose.disconnect = origDisconnect;
      Order.find = origOrderFind;
      Order.deleteMany = origOrderDeleteMany;
      Product.deleteMany = origProductDeleteMany;
      Product.countDocuments = origProductCountDocuments;
      Order.countDocuments = origOrderCountDocuments;
      Category.countDocuments = origCategoryCountDocuments;
      Rider.countDocuments = origRiderCountDocuments;
      Vendor.countDocuments = origVendorCountDocuments;
      User.countDocuments = origUserCountDocuments;
    }
  });
});
