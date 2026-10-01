import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import http from 'node:http';

import * as authController from '../controllers/authController.js';
import * as authMiddleware from '../middleware/auth.js';
import { loginUser, registerUser } from '../controllers/userController.js';
import { createOrder } from '../controllers/orderController.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import RefreshToken from '../models/RefreshToken.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import * as socketModule from '../socket/index.js';

const createMockSession = (overrides = {}) => ({
  withTransaction: async (fn) => await fn(),
  endSession: async () => {},
  ...overrides
});

test('Customer Account Deletion, Concurrency & Recovery Suite', async (t) => {
  const originalEnv = { ...process.env };
  const mockJwtSecret = 'test_access_secret_account_deletion_78910';
  process.env.JWT_ACCESS_SECRET = mockJwtSecret;

  const originalStartSession = mongoose.startSession;

  t.after(() => {
    process.env = originalEnv;
    mongoose.startSession = originalStartSession;
  });

  await t.test('1. Unauthorized deletion request is rejected with 401 AUTH_REQUIRED', async () => {
    const req = { user: null };
    let statusCode = 200;
    let resPayload = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { resPayload = data; return res; }
    };

    await authController.deleteAccount(req, res);
    assert.equal(statusCode, 401);
    assert.equal(resPayload.code, 'AUTH_REQUIRED');
    assert.equal(resPayload.success, false);
  });

  await t.test('2. Role Isolation: Non-customer roles (VENDOR/RIDER/ADMIN) cannot delete via customer flow', async () => {
    const req = {
      user: { _id: '507f1f77bcf86cd799439011', id: '507f1f77bcf86cd799439011', role: 'VENDOR' }
    };
    let statusCode = 200;
    let resPayload = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { resPayload = data; return res; }
    };

    await authController.deleteAccount(req, res);
    assert.equal(statusCode, 403);
    assert.equal(resPayload.code, 'FORBIDDEN_ROLE');
    assert.equal(resPayload.success, false);
  });

  await t.test('3. Customer Isolation: Client-provided body/query userId is ignored; only acts on req.user._id', async () => {
    const originalFindById = User.findById;
    const originalFindOneAndUpdate = User.findOneAndUpdate;
    const originalFindOne = Order.findOne;
    const originalUpdateMany = Order.updateMany;
    const originalCartDeleteMany = Cart.deleteMany;
    const originalRefreshDeleteMany = RefreshToken.deleteMany;
    const originalUserDeleteOne = User.deleteOne;

    mongoose.startSession = () => Promise.resolve(createMockSession());

    let queriedUserId = null;
    let deletedUserId = null;

    User.findOneAndUpdate = (filter, update) => {
      queriedUserId = String(filter._id);
      return Promise.resolve({
        _id: '507f1f77bcf86cd799439011',
        phone: '9876543210',
        role: 'CUSTOMER',
        status: 'DELETED'
      });
    };

    User.findById = (id) => ({
      session: () => Promise.resolve({
        _id: '507f1f77bcf86cd799439011',
        phone: '9876543210',
        role: 'CUSTOMER',
        status: 'DELETED'
      })
    });

    Order.findOne = () => ({ session: () => Promise.resolve(null) });
    Order.updateMany = () => Promise.resolve({ modifiedCount: 0 });
    Cart.deleteMany = () => Promise.resolve({ deletedCount: 0 });
    RefreshToken.deleteMany = () => Promise.resolve({ deletedCount: 1 });
    User.deleteOne = (filter) => {
      deletedUserId = String(filter._id);
      return Promise.resolve({ deletedCount: 1 });
    };

    try {
      const req = {
        user: { _id: '507f1f77bcf86cd799439011', role: 'CUSTOMER' },
        body: { userId: '507f1f77bcf86cd799439999' },
        query: { userId: '507f1f77bcf86cd799439999' }
      };

      let statusCode = 200;
      let resPayload = null;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: (data) => { resPayload = data; return res; }
      };

      await authController.deleteAccount(req, res);
      assert.equal(statusCode, 200);
      assert.equal(resPayload.code, 'ACCOUNT_DELETED');
      assert.equal(queriedUserId, '507f1f77bcf86cd799439011');
      assert.equal(deletedUserId, '507f1f77bcf86cd799439011');
    } finally {
      User.findById = originalFindById;
      User.findOneAndUpdate = originalFindOneAndUpdate;
      Order.findOne = originalFindOne;
      Order.updateMany = originalUpdateMany;
      Cart.deleteMany = originalCartDeleteMany;
      RefreshToken.deleteMany = originalRefreshDeleteMany;
      User.deleteOne = originalUserDeleteOne;
      mongoose.startSession = originalStartSession;
    }
  });

  await t.test('4. Active Delivery Guard: Rejects deletion if order is active in progress', async () => {
    const originalFindById = User.findById;
    const originalFindOneAndUpdate = User.findOneAndUpdate;
    const originalFindOne = Order.findOne;

    mongoose.startSession = () => Promise.resolve(createMockSession());

    User.findOneAndUpdate = () => Promise.resolve({
      _id: '507f1f77bcf86cd799439022',
      phone: '9876543210',
      role: 'CUSTOMER',
      status: 'DELETED'
    });

    Order.findOne = (query) => {
      assert.equal(query.customer, '507f1f77bcf86cd799439022');
      assert.ok(query.status.$in.includes('OUT_FOR_DELIVERY'));
      return {
        session: () => Promise.resolve({
          _id: 'order_in_transit_123',
          status: 'OUT_FOR_DELIVERY'
        })
      };
    };

    try {
      const req = {
        user: { _id: '507f1f77bcf86cd799439022', role: 'CUSTOMER' }
      };

      let statusCode = 200;
      let resPayload = null;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: (data) => { resPayload = data; return res; }
      };

      await authController.deleteAccount(req, res);
      assert.equal(statusCode, 409);
      assert.equal(resPayload.code, 'ACTIVE_ORDER_EXISTS');
      assert.match(resPayload.message, /order is currently being prepared or delivered/i);
    } finally {
      User.findById = originalFindById;
      User.findOneAndUpdate = originalFindOneAndUpdate;
      Order.findOne = originalFindOne;
      mongoose.startSession = originalStartSession;
    }
  });

  await t.test('5. Personal-Data Completeness: Anonymizes all address fields, route breadcrumbs, riderLocation, OTPs and purges cart/tokens', async () => {
    const originalFindById = User.findById;
    const originalFindOneAndUpdate = User.findOneAndUpdate;
    const originalFindOne = Order.findOne;
    const originalOrderUpdateMany = Order.updateMany;
    const originalCartDeleteMany = Cart.deleteMany;
    const originalRefreshDeleteMany = RefreshToken.deleteMany;
    const originalUserDeleteOne = User.deleteOne;

    mongoose.startSession = () => Promise.resolve(createMockSession());

    let pastOrdersScrubbed = false;
    let cartPurged = false;
    let tokensPurged = false;
    let userDeleted = false;
    let socketDisconnected = false;

    User.findOneAndUpdate = (filter, update, opts) => {
      assert.equal(filter._id, '507f1f77bcf86cd799439033');
      assert.equal(update.$set.status, 'DELETED');
      assert.equal(update.$inc.orderRevision, 1);
      assert.ok(opts?.session, 'Session must be passed to User.findOneAndUpdate');
      return Promise.resolve({
        _id: '507f1f77bcf86cd799439033',
        status: 'DELETED'
      });
    };

    Order.findOne = () => ({ session: () => Promise.resolve(null) });

    Order.updateMany = (filter, update, opts) => {
      assert.equal(filter.customer, '507f1f77bcf86cd799439033');
      assert.equal(update.$set['address.name'], 'Customer (Deleted)');
      assert.equal(update.$set['address.phone'], '0000000000');
      assert.equal(update.$set['address.line1'], 'Redacted for privacy (Account Deleted)');
      assert.equal(update.$set['address.lat'], null, 'Latitude must be wiped');
      assert.equal(update.$set['address.lng'], null, 'Longitude must be wiped');
      assert.deepEqual(update.$set['deliveryRoute'], [], 'Delivery route breadcrumbs must be emptied');
      assert.equal(update.$set['riderLocation'], null, 'Rider location drop point must be wiped');
      assert.equal(update.$set['clientOrderId'], null, 'Client device/order reference must be scrubbed');
      assert.equal(update.$set['pickupOtp'], '0000', 'Pickup OTP must be redacted');
      assert.equal(update.$set['deliveryOtp'], '0000', 'Delivery OTP must be redacted');
      assert.ok(opts?.session, 'Session must be passed to Order.updateMany');
      pastOrdersScrubbed = true;
      return Promise.resolve({ modifiedCount: 3 });
    };

    Cart.deleteMany = (filter, opts) => {
      assert.equal(filter.user, '507f1f77bcf86cd799439033');
      assert.ok(opts?.session, 'Session must be passed to Cart.deleteMany');
      cartPurged = true;
      return Promise.resolve({ deletedCount: 1 });
    };

    RefreshToken.deleteMany = (filter, opts) => {
      assert.equal(filter.user, '507f1f77bcf86cd799439033');
      assert.ok(opts?.session, 'Session must be passed to RefreshToken.deleteMany');
      tokensPurged = true;
      return Promise.resolve({ deletedCount: 2 });
    };

    User.deleteOne = (filter, opts) => {
      assert.equal(filter._id, '507f1f77bcf86cd799439033');
      assert.ok(opts?.session, 'Session must be passed to User.deleteOne');
      userDeleted = true;
      return Promise.resolve({ deletedCount: 1 });
    };

    const originalIO = socketModule.getIO();
    socketModule.setIO({
      in: (room) => {
        assert.equal(room, 'customer:507f1f77bcf86cd799439033');
        return {
          disconnectSockets: (force) => {
            assert.equal(force, true);
            socketDisconnected = true;
          }
        };
      }
    });

    try {
      const req = {
        user: { _id: '507f1f77bcf86cd799439033', role: 'CUSTOMER' }
      };

      let statusCode = 200;
      let resPayload = null;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: (data) => { resPayload = data; return res; }
      };

      await authController.deleteAccount(req, res);

      assert.equal(statusCode, 200);
      assert.equal(resPayload.code, 'ACCOUNT_DELETED');
      assert.equal(pastOrdersScrubbed, true);
      assert.equal(cartPurged, true);
      assert.equal(tokensPurged, true);
      assert.equal(socketDisconnected, true);
      assert.equal(userDeleted, true);
    } finally {
      User.findById = originalFindById;
      User.findOneAndUpdate = originalFindOneAndUpdate;
      Order.findOne = originalFindOne;
      Order.updateMany = originalOrderUpdateMany;
      Cart.deleteMany = originalCartDeleteMany;
      RefreshToken.deleteMany = originalRefreshDeleteMany;
      User.deleteOne = originalUserDeleteOne;
      socketModule.setIO(originalIO);
      mongoose.startSession = originalStartSession;
    }
  });

  await t.test('6. Concurrency Interleaving 1: createOrder wins race -> deleteAccount detects active order and rolls back', async () => {
    const customerId = '507f1f77bcf86cd799439044';
    const originalFindById = User.findById;
    const originalFindOneAndUpdate = User.findOneAndUpdate;
    const originalOrderFindOne = Order.findOne;
    const originalUserDeleteOne = User.deleteOne;

    mongoose.startSession = () => Promise.resolve(createMockSession());

    let userStatus = 'ACTIVE';
    let userDeletedCalled = false;

    // Simulation: createOrder won and committed
    // Now deleteAccount attempts to run concurrently
    User.findOneAndUpdate = (filter, update) => {
      if (filter.status === 'ACTIVE' && userStatus === 'ACTIVE') {
        userStatus = update.$set.status; // becomes 'DELETED' temporarily inside tx
        return Promise.resolve({ _id: customerId, status: userStatus });
      }
      return Promise.resolve(null);
    };

    // When deleteAccount checks active orders, it detects the newly created order
    Order.findOne = (query) => {
      assert.equal(query.customer, customerId);
      return {
        session: () => Promise.resolve({
          _id: 'order_just_created_by_race_winner',
          customer: customerId,
          status: 'NEW_ORDER'
        })
      };
    };

    User.deleteOne = () => {
      userDeletedCalled = true;
      return Promise.resolve({ deletedCount: 1 });
    };

    try {
      const req = { user: { _id: customerId, role: 'CUSTOMER' } };
      let statusCode = 200;
      let resPayload = null;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: (data) => { resPayload = data; return res; }
      };

      await authController.deleteAccount(req, res);

      // Must reject with 409 and not delete the user
      assert.equal(statusCode, 409);
      assert.equal(resPayload.code, 'ACTIVE_ORDER_EXISTS');
      assert.equal(userDeletedCalled, false, 'User must NOT be deleted when active order is detected');
    } finally {
      User.findById = originalFindById;
      User.findOneAndUpdate = originalFindOneAndUpdate;
      Order.findOne = originalOrderFindOne;
      User.deleteOne = originalUserDeleteOne;
      mongoose.startSession = originalStartSession;
    }
  });

  await t.test('7. Concurrency Interleaving 2: deleteAccount wins race -> createOrder conditional User write fails and rolls back stock', async () => {
    const customerId = '507f1f77bcf86cd799439055';
    const prodId = '507f1f77bcf86cd799439066';
    const vendorId = '507f1f77bcf86cd799439077';

    const originalFindById = User.findById;
    const originalFindOneAndUpdate = User.findOneAndUpdate;
    const originalProductFind = Product.find;
    const originalProductFindOneAndUpdate = Product.findOneAndUpdate;
    const originalVendorFindById = Vendor.findById;

    mongoose.startSession = () => Promise.resolve(createMockSession());

    let stockDeducted = false;
    let orderSaved = false;

    // Simulation: deleteAccount won and committed. User is now DELETED or gone.
    User.findById = () => Promise.resolve({
      _id: customerId,
      status: 'DELETED'
    });

    User.findOneAndUpdate = (filter) => {
      // Conditional write requires status: 'ACTIVE'
      if (filter.status === 'ACTIVE') {
        return Promise.resolve(null); // Fails because user was deleted
      }
      return Promise.resolve(null);
    };

    Product.find = () => Promise.resolve([
      { _id: prodId, vendor: vendorId, price: 100, stockQty: 10, name: 'Fresh Apples', inStock: true }
    ]);

    Vendor.findById = () => Promise.resolve({
      _id: vendorId,
      storeName: 'Farm Fresh',
      isOpen: true,
      minOrderValue: 50
    });

    Product.findOneAndUpdate = () => {
      stockDeducted = true;
      return Promise.resolve({ _id: prodId, stockQty: 9 });
    };

    try {
      const req = {
        user: { _id: customerId, id: customerId },
        body: {
          items: [{ product: prodId, qty: 1 }],
          paymentMethod: 'COD',
          address: {
            name: 'Test Customer',
            phone: '9876543210',
            line1: '123 Model Town',
            city: 'Ludhiana',
            pincode: '141001',
            lat: 30.9,
            lng: 75.85
          }
        }
      };

      let statusCode = 200;
      let resPayload = null;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: (data) => { resPayload = data; return res; }
      };

      await createOrder(req, res);

      // createOrder must fail with 403 ACCOUNT_INACTIVE
      assert.equal(statusCode, 403);
      assert.equal(resPayload.code, 'ACCOUNT_INACTIVE');
      assert.equal(stockDeducted, false, 'Stock must NOT be deducted when deletion has won the race');
      assert.equal(orderSaved, false, 'Order must NOT be created');
    } finally {
      User.findById = originalFindById;
      User.findOneAndUpdate = originalFindOneAndUpdate;
      Product.find = originalProductFind;
      Product.findOneAndUpdate = originalProductFindOneAndUpdate;
      Vendor.findById = originalVendorFindById;
      mongoose.startSession = originalStartSession;
    }
  });

  await t.test('8. startSession failure: zero database writes and 503 SERVICE_UNAVAILABLE', async () => {
    let writeAttempts = 0;
    const originalFindOneAndUpdate = User.findOneAndUpdate;
    const originalUpdateMany = Order.updateMany;
    const originalCartDeleteMany = Cart.deleteMany;
    const originalRefreshDeleteMany = RefreshToken.deleteMany;
    const originalUserDeleteOne = User.deleteOne;

    User.findOneAndUpdate = () => { writeAttempts++; return Promise.resolve({}); };
    Order.updateMany = () => { writeAttempts++; return Promise.resolve({}); };
    Cart.deleteMany = () => { writeAttempts++; return Promise.resolve({}); };
    RefreshToken.deleteMany = () => { writeAttempts++; return Promise.resolve({}); };
    User.deleteOne = () => { writeAttempts++; return Promise.resolve({}); };

    mongoose.startSession = () => Promise.reject(new Error('Connection pool exhausted / startSession failure'));

    try {
      const req = { user: { _id: '507f1f77bcf86cd799439088', role: 'CUSTOMER' } };
      let statusCode = 200;
      let resPayload = null;
      const res = {
        status: (c) => { statusCode = c; return res; },
        json: (d) => { resPayload = d; return res; }
      };

      await authController.deleteAccount(req, res);

      assert.equal(statusCode, 503);
      assert.equal(resPayload.code, 'SERVICE_UNAVAILABLE');
      assert.equal(writeAttempts, 0, 'Zero database writes must occur when startSession fails');
    } finally {
      User.findOneAndUpdate = originalFindOneAndUpdate;
      Order.updateMany = originalUpdateMany;
      Cart.deleteMany = originalCartDeleteMany;
      RefreshToken.deleteMany = originalRefreshDeleteMany;
      User.deleteOne = originalUserDeleteOne;
      mongoose.startSession = originalStartSession;
    }
  });

  await t.test('9. missing withTransaction: zero database writes and 503 TRANSACTIONS_UNSUPPORTED', async () => {
    let writeAttempts = 0;
    const originalFindOneAndUpdate = User.findOneAndUpdate;
    const originalUpdateMany = Order.updateMany;
    const originalCartDeleteMany = Cart.deleteMany;
    const originalRefreshDeleteMany = RefreshToken.deleteMany;
    const originalUserDeleteOne = User.deleteOne;

    User.findOneAndUpdate = () => { writeAttempts++; return Promise.resolve({}); };
    Order.updateMany = () => { writeAttempts++; return Promise.resolve({}); };
    Cart.deleteMany = () => { writeAttempts++; return Promise.resolve({}); };
    RefreshToken.deleteMany = () => { writeAttempts++; return Promise.resolve({}); };
    User.deleteOne = () => { writeAttempts++; return Promise.resolve({}); };

    // Return a session object without withTransaction
    mongoose.startSession = () => Promise.resolve({
      endSession: () => Promise.resolve()
    });

    try {
      const req = { user: { _id: '507f1f77bcf86cd799439088', role: 'CUSTOMER' } };
      let statusCode = 200;
      let resPayload = null;
      const res = {
        status: (c) => { statusCode = c; return res; },
        json: (d) => { resPayload = d; return res; }
      };

      await authController.deleteAccount(req, res);

      assert.equal(statusCode, 503);
      assert.equal(resPayload.code, 'TRANSACTIONS_UNSUPPORTED');
      assert.equal(writeAttempts, 0, 'Zero database writes must occur when withTransaction is missing');
    } finally {
      User.findOneAndUpdate = originalFindOneAndUpdate;
      Order.updateMany = originalUpdateMany;
      Cart.deleteMany = originalCartDeleteMany;
      RefreshToken.deleteMany = originalRefreshDeleteMany;
      User.deleteOne = originalUserDeleteOne;
      mongoose.startSession = originalStartSession;
    }
  });

  await t.test('10. database-operation failure: transaction abort and HTTP 500 without completing deletion', async () => {
    const originalFindById = User.findById;
    const originalFindOneAndUpdate = User.findOneAndUpdate;
    const originalFindOne = Order.findOne;
    const originalOrderUpdateMany = Order.updateMany;
    const originalCartDeleteMany = Cart.deleteMany;
    const originalRefreshDeleteMany = RefreshToken.deleteMany;
    const originalUserDeleteOne = User.deleteOne;

    let userDeleted = false;

    mongoose.startSession = () => Promise.resolve(createMockSession());

    User.findOneAndUpdate = () => Promise.resolve({ _id: '507f1f77bcf86cd799439088', status: 'DELETED' });
    Order.findOne = () => ({ session: () => Promise.resolve(null) });

    // Simulate failure at Cart.deleteMany
    Order.updateMany = () => Promise.resolve({ modifiedCount: 1 });
    Cart.deleteMany = () => Promise.reject(new Error('Disk I/O error during Cart.deleteMany'));
    RefreshToken.deleteMany = () => Promise.resolve({ deletedCount: 1 });
    User.deleteOne = () => { userDeleted = true; return Promise.resolve({ deletedCount: 1 }); };

    try {
      const req = { user: { _id: '507f1f77bcf86cd799439088', role: 'CUSTOMER' } };
      let statusCode = 200;
      let resPayload = null;
      const res = {
        status: (c) => { statusCode = c; return res; },
        json: (d) => { resPayload = d; return res; }
      };

      await authController.deleteAccount(req, res);

      assert.equal(statusCode, 500);
      assert.equal(resPayload.code, 'SERVER_ERROR');
      assert.equal(userDeleted, false, 'User document must NOT be deleted when database operation fails');
    } finally {
      User.findById = originalFindById;
      User.findOneAndUpdate = originalFindOneAndUpdate;
      Order.findOne = originalFindOne;
      Order.updateMany = originalOrderUpdateMany;
      Cart.deleteMany = originalCartDeleteMany;
      RefreshToken.deleteMany = originalRefreshDeleteMany;
      User.deleteOne = originalUserDeleteOne;
      mongoose.startSession = originalStartSession;
    }
  });

  await t.test('11. successful commit followed by endSession failure: deletion still succeeds (200 ACCOUNT_DELETED)', async () => {
    const originalFindById = User.findById;
    const originalFindOneAndUpdate = User.findOneAndUpdate;
    const originalFindOne = Order.findOne;
    const originalOrderUpdateMany = Order.updateMany;
    const originalCartDeleteMany = Cart.deleteMany;
    const originalRefreshDeleteMany = RefreshToken.deleteMany;
    const originalUserDeleteOne = User.deleteOne;

    // Simulate session where commit succeeds but endSession throws during cleanup
    mongoose.startSession = () => Promise.resolve({
      withTransaction: async (fn) => await fn(),
      endSession: () => Promise.reject(new Error('Network reset during endSession cleanup'))
    });

    User.findOneAndUpdate = () => Promise.resolve({ _id: '507f1f77bcf86cd799439088', status: 'DELETED' });
    Order.findOne = () => ({ session: () => Promise.resolve(null) });
    Order.updateMany = () => Promise.resolve({ modifiedCount: 1 });
    Cart.deleteMany = () => Promise.resolve({ deletedCount: 1 });
    RefreshToken.deleteMany = () => Promise.resolve({ deletedCount: 1 });
    User.deleteOne = () => Promise.resolve({ deletedCount: 1 });

    try {
      const req = { user: { _id: '507f1f77bcf86cd799439088', role: 'CUSTOMER' } };
      let statusCode = 200;
      let resPayload = null;
      const res = {
        status: (c) => { statusCode = c; return res; },
        json: (d) => { resPayload = d; return res; }
      };

      await authController.deleteAccount(req, res);

      assert.equal(statusCode, 200);
      assert.equal(resPayload.code, 'ACCOUNT_DELETED');
      assert.equal(resPayload.success, true);
    } finally {
      User.findById = originalFindById;
      User.findOneAndUpdate = originalFindOneAndUpdate;
      Order.findOne = originalFindOne;
      Order.updateMany = originalOrderUpdateMany;
      Cart.deleteMany = originalCartDeleteMany;
      RefreshToken.deleteMany = originalRefreshDeleteMany;
      User.deleteOne = originalUserDeleteOne;
      mongoose.startSession = originalStartSession;
    }
  });

  await t.test('12. unsupported transaction deployment: no non-transactional fallback in createOrder', async () => {
    const customerId = '507f1f77bcf86cd799439088';
    const prodId = '507f1f77bcf86cd799439099';
    let stockModified = false;
    let orderSaved = false;

    const originalFindById = User.findById;
    const originalProductFind = Product.find;
    const originalProductFindOneAndUpdate = Product.findOneAndUpdate;
    const originalOrderSave = Order.prototype.save;

    // Simulate unsupported transactions (missing withTransaction)
    mongoose.startSession = () => Promise.resolve({
      endSession: () => Promise.resolve()
    });

    User.findById = () => Promise.resolve({ _id: customerId, status: 'ACTIVE' });
    Product.find = () => ({
      populate: () => Promise.resolve([
        {
          _id: prodId,
          stockQty: 10,
          price: 50,
          inStock: true,
          vendor: { _id: '507f1f77bcf86cd799439077', storeName: 'Test', isOpen: true }
        }
      ])
    });
    Product.findOneAndUpdate = () => { stockModified = true; return Promise.resolve({}); };

    try {
      const req = {
        user: { _id: customerId, id: customerId },
        body: {
          items: [{ product: prodId, qty: 1 }],
          paymentMethod: 'COD',
          address: { name: 'A', phone: '9876543210', line1: 'L', city: 'Ludhiana', pincode: '141001', lat: 30.9, lng: 75.8 }
        }
      };

      let statusCode = 200;
      let resPayload = null;
      const res = {
        status: (c) => { statusCode = c; return res; },
        json: (d) => { resPayload = d; return res; }
      };

      await createOrder(req, res);

      assert.equal(statusCode, 503);
      assert.equal(resPayload.code, 'TRANSACTIONS_UNSUPPORTED');
      assert.equal(stockModified, false, 'Must NEVER modify stock outside a transaction');
    } finally {
      User.findById = originalFindById;
      Product.find = originalProductFind;
      Product.findOneAndUpdate = originalProductFindOneAndUpdate;
      mongoose.startSession = originalStartSession;
    }
  });

  await t.test('13. Socket Authorization & Reconnection: Authoritative DB check rejects missing/inactive customers', async () => {
    const originalFindById = User.findById;

    const fakeServer = http.createServer();
    const { initSocket } = socketModule;
    const io = initSocket(fakeServer);
    const middleware = (io.sockets._fns && io.sockets._fns[0]) || (io._fns && io._fns[0]);

    // Test Case 13A: Customer deleted / not found in DB
    User.findById = () => ({
      select: () => Promise.resolve(null)
    });

    const deletedToken = jwt.sign(
      { sub: '507f1f77bcf86cd799439099', id: '507f1f77bcf86cd799439099', role: 'CUSTOMER' },
      mockJwtSecret,
      { expiresIn: '15m' }
    );

    const socketMissing = {
      handshake: { auth: { token: deletedToken } }
    };

    let missingErr = null;
    await new Promise((resolve) => {
      middleware(socketMissing, (err) => { missingErr = err; resolve(); });
    });

    assert.ok(missingErr, 'Must reject missing customer');
    assert.equal(missingErr.message, 'USER_NOT_FOUND');

    // Test Case 13B: Customer inactive in DB
    User.findById = () => ({
      select: () => Promise.resolve({ _id: '507f1f77bcf86cd799439099', status: 'DELETED', role: 'CUSTOMER' })
    });

    const socketInactive = {
      handshake: { auth: { token: deletedToken } }
    };

    let inactiveErr = null;
    await new Promise((resolve) => {
      middleware(socketInactive, (err) => { inactiveErr = err; resolve(); });
    });

    assert.ok(inactiveErr, 'Must reject inactive customer');
    assert.equal(inactiveErr.message, 'ACCOUNT_INACTIVE');

    // Test Case 13C: Guest connection accepted
    const socketGuest = { handshake: { auth: {} } };
    let guestErr = null;
    await new Promise((resolve) => {
      middleware(socketGuest, (err) => { guestErr = err; resolve(); });
    });
    assert.equal(guestErr, undefined);
    assert.equal(socketGuest.user.role, 'GUEST');

    // Test Case 13D: Valid active customer accepted
    User.findById = () => ({
      select: () => Promise.resolve({ _id: '507f1f77bcf86cd799439099', status: 'ACTIVE', role: 'CUSTOMER' })
    });
    const activeToken = jwt.sign(
      { sub: '507f1f77bcf86cd799439099', role: 'CUSTOMER' },
      mockJwtSecret,
      { expiresIn: '15m' }
    );
    const socketActive = { handshake: { auth: { token: activeToken } } };
    let activeErr = null;
    await new Promise((resolve) => {
      middleware(socketActive, (err) => { activeErr = err; resolve(); });
    });
    assert.equal(activeErr, undefined);
    assert.equal(socketActive.user.role, 'CUSTOMER');

    User.findById = originalFindById;
  });

  await t.test('14. Exact Endpoint & Method Matching: POST /api/auth/account/delete vs other methods and paths', async () => {
    const originalFindById = User.findById;
    User.findById = () => Promise.resolve(null); // Deleted user

    const token = jwt.sign(
      { sub: '507f1f77bcf86cd799439100', id: '507f1f77bcf86cd799439100', role: 'CUSTOMER' },
      mockJwtSecret,
      { expiresIn: '15m' }
    );

    try {
      // 14A: Correct POST /api/auth/account/delete -> 200 ACCOUNT_ALREADY_DELETED
      const exactReq = {
        method: 'POST',
        baseUrl: '/api/auth',
        path: '/account/delete',
        headers: { authorization: `Bearer ${token}` }
      };

      let exactCode = 200;
      let exactPayload = null;
      const exactRes = {
        status: (c) => { exactCode = c; return exactRes; },
        json: (d) => { exactPayload = d; return exactRes; }
      };

      await authMiddleware.requireAuth(exactReq, exactRes, () => {});
      assert.equal(exactCode, 200);
      assert.equal(exactPayload.code, 'ACCOUNT_ALREADY_DELETED');

      // 14B: GET /api/auth/account/delete (Wrong method) -> 401 USER_NOT_FOUND (not bypassed)
      const wrongMethodReq = {
        method: 'GET',
        baseUrl: '/api/auth',
        path: '/account/delete',
        headers: { authorization: `Bearer ${token}` }
      };

      let wrongMethodCode = 200;
      let wrongMethodPayload = null;
      const wrongMethodRes = {
        status: (c) => { wrongMethodCode = c; return wrongMethodRes; },
        json: (d) => { wrongMethodPayload = d; return wrongMethodRes; }
      };

      await authMiddleware.requireAuth(wrongMethodReq, wrongMethodRes, () => {});
      assert.equal(wrongMethodCode, 401);
      assert.equal(wrongMethodPayload.code, 'USER_NOT_FOUND');

      // 14C: POST /api/orders/account/delete (Wrong path) -> 401 USER_NOT_FOUND
      const wrongPathReq = {
        method: 'POST',
        baseUrl: '/api/orders',
        path: '/account/delete',
        headers: { authorization: `Bearer ${token}` }
      };

      let wrongPathCode = 200;
      let wrongPathPayload = null;
      const wrongPathRes = {
        status: (c) => { wrongPathCode = c; return wrongPathRes; },
        json: (d) => { wrongPathPayload = d; return wrongPathRes; }
      };

      await authMiddleware.requireAuth(wrongPathReq, wrongPathRes, () => {});
      assert.equal(wrongPathCode, 401);
      assert.equal(wrongPathPayload.code, 'USER_NOT_FOUND');
    } finally {
      User.findById = originalFindById;
    }
  });

  await t.test('15. Token Expiry After Failed Deletion: Expired token rejected by requireAuth with 401 TOKEN_EXPIRED', async () => {
    const expiredToken = jwt.sign(
      { sub: '507f1f77bcf86cd799439300', role: 'CUSTOMER' },
      mockJwtSecret,
      { expiresIn: '-1s' } // Already expired
    );

    const req = {
      method: 'POST',
      baseUrl: '/api/auth',
      path: '/account/delete',
      headers: { authorization: `Bearer ${expiredToken}` }
    };

    let statusCode = 200;
    let resPayload = null;
    const res = {
      status: (c) => { statusCode = c; return res; },
      json: (d) => { resPayload = d; return res; }
    };

    await authMiddleware.requireAuth(req, res, () => {});
    assert.equal(statusCode, 401);
    assert.equal(resPayload.code, 'TOKEN_EXPIRED');
  });

  await t.test('16. Safe Re-Registration & Identity Separation: Re-registering phone creates new _id, old token cannot access it', async () => {
    const originalFindOne = User.findOne;
    const originalFindById = User.findById;
    const originalCreate = User.create;
    const originalReadyState = mongoose.connection.readyState;
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    const originalRefreshCreate = RefreshToken.create;
    RefreshToken.create = () => Promise.resolve({ tokenHash: 'test_mock_hash' });

    try {
      User.findOne = () => Promise.resolve(null);
      User.create = (doc) => Promise.resolve({
        _id: '507f1f77bcf86cd799439401',
        id: 'USER-9999',
        name: doc.name,
        phone: doc.phone,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        walletBalance: 25000,
        addresses: doc.addresses,
        toRupees: () => 250
      });

      const regReq = {
        body: { name: 'New Customer', phone: '9876543210', password: 'NewPassword123' }
      };

      let regStatusCode = 200;
      let regPayload = null;
      const regRes = {
        status: (code) => { regStatusCode = code; return regRes; },
        json: (data) => { regPayload = data; return regRes; }
      };

      await registerUser(regReq, regRes);
      assert.equal(regStatusCode, 201);
      assert.equal(regPayload.success, true);
      assert.equal(regPayload.user.phone, '9876543210');

      // Old token belonging to old deleted user ID tries to access
      User.findById = (id) => {
        if (String(id) === '507f1f77bcf86cd799439401') {
          return Promise.resolve({ _id: '507f1f77bcf86cd799439401', status: 'ACTIVE' });
        }
        return Promise.resolve(null);
      };

      const oldToken = jwt.sign(
        { sub: '507f1f77bcf86cd799439400', role: 'CUSTOMER' },
        mockJwtSecret,
        { expiresIn: '15m' }
      );

      const oldReq = {
        method: 'GET',
        baseUrl: '/api/auth',
        path: '/me',
        headers: { authorization: `Bearer ${oldToken}` }
      };

      let authStatusCode = 200;
      let authPayload = null;
      const authRes = {
        status: (code) => { authStatusCode = code; return authRes; },
        json: (data) => { authPayload = data; return authRes; }
      };

      let nextCalled = false;
      await authMiddleware.requireAuth(oldReq, authRes, () => { nextCalled = true; });

      assert.equal(nextCalled, false, 'Old token must NOT access newly registered customer');
      assert.equal(authStatusCode, 401);
      assert.equal(authPayload.code, 'USER_NOT_FOUND');
    } finally {
      User.findOne = originalFindOne;
      User.findById = originalFindById;
      User.create = originalCreate;
      Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true });
      RefreshToken.create = originalRefreshCreate;
    }
  });
});
