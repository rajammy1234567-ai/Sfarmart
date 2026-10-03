// negativeTransition.test.js - verifies invalid status transition is rejected using offline controller mocks
import test from 'node:test';
import assert from 'node:assert/strict';

// Import the controller function and dependent models
import { updateOrderStatus } from '../controllers/orderController.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import mongoose from 'mongoose';

// Helper to create a mock response object
function createRes() {
  const res = {};
  res.statusCode = 200;
  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = payload => {
    res.payload = payload;
    return res;
  };
  return res;
}

// Store original implementations for restoration
let _origOrderFindById;
let _origOrderFindOneAndUpdate;
let _origProductFindByIdAndUpdate;
let _origMongooseStartSession;
let findOneAndUpdateCallCount = 0;
let sessionCallCount = 0;

// Restore originals after each test
test.afterEach(() => {
  if (_origOrderFindById) Order.findById = _origOrderFindById;
  if (_origOrderFindOneAndUpdate) Order.findOneAndUpdate = _origOrderFindOneAndUpdate;
  if (_origProductFindByIdAndUpdate) Product.findByIdAndUpdate = _origProductFindByIdAndUpdate;
  if (_origMongooseStartSession) mongoose.startSession = _origMongooseStartSession;
  // reset counters
  findOneAndUpdateCallCount = 0;
  sessionCallCount = 0;
});

// Stub out DB interactions to ensure no writes occur
function stubDb() {
  if (!_origOrderFindById) _origOrderFindById = Order.findById;
  if (!_origOrderFindOneAndUpdate) _origOrderFindOneAndUpdate = Order.findOneAndUpdate;
  if (!_origProductFindByIdAndUpdate) _origProductFindByIdAndUpdate = Product.findByIdAndUpdate;
  if (!_origMongooseStartSession) _origMongooseStartSession = mongoose.startSession;

  // Order lookups
  Order.findById = async id => ({
    _id: id,
    status: 'NEW_ORDER',
    items: [{ product: 'prod1', qty: 1 }],
    // keep original fields for access checks
    customer: 'cust1',
    vendor: 'vend1',
    rider: null
  });
  Order.findOneAndUpdate = async () => { findOneAndUpdateCallCount++; return null; }; // transition should be blocked, so return null

  // Product updates (stock rollback) – should never be called
  Product.findByIdAndUpdate = async () => {
    throw new Error('Product update should not be called');
  };

  // Mongoose session mock – no transaction needed
  mongoose.startSession = async () => { sessionCallCount++; return { withTransaction: async fn => await fn(), endSession: () => {} }; };
}

test('vendor cannot transition directly to OUT_FOR_DELIVERY (should be 403 INVALID_TRANSITION)', async () => {
  stubDb();
  const req = {
    user: { role: 'VENDOR', vendorId: 'vend1', sub: 'vend1', id: 'vend1', _id: 'vend1' },
    params: { id: 'order123' },
    body: { status: 'OUT_FOR_DELIVERY' }
  };
  const res = createRes();

  await updateOrderStatus(req, res);

  assert.equal(res.statusCode, 403, 'Expected 403 status');
  assert.equal(res.payload.code, 'INVALID_TRANSITION');
  assert.equal(findOneAndUpdateCallCount, 0, 'Expected zero Order.findOneAndUpdate calls');
  assert.equal(sessionCallCount, 0, 'Expected zero session starts');
});

test('rider cannot transition via generic endpoint (should be 403 INVALID_TRANSITION)', async () => {
  stubDb();
  const req = {
    user: { role: 'RIDER', riderId: 'rider1', sub: 'rider1', id: 'rider1', _id: 'rider1' },
    params: { id: 'order123' },
    body: { status: 'ACCEPTED' } // invalid for rider generic endpoint
  };
  const res = createRes();

  await updateOrderStatus(req, res);

  assert.equal(res.statusCode, 403, 'Expected 403 status');
  assert.equal(res.payload.code, 'INVALID_TRANSITION');
  assert.equal(findOneAndUpdateCallCount, 0, 'Expected zero Order.findOneAndUpdate calls');
  assert.equal(sessionCallCount, 0, 'Expected zero session starts');
});
// Legacy supertest suite removed – handled by node:test version above

test('assigned rider with OUT_FOR_DELIVERY cannot transition to DELIVERED via generic endpoint (should be 403 INVALID_TRANSITION)', async () => {
  stubDb();
  const req = {
    user: { role: 'RIDER', riderId: 'rider1', sub: 'rider1', id: 'rider1', _id: 'rider1' },
    params: { id: 'order123' },
    body: { status: 'DELIVERED' }
  };
  // modify stubDb to return rider assigned and status OUT_FOR_DELIVERY
  Order.findById = async id => ({
    _id: id,
    status: 'OUT_FOR_DELIVERY',
    items: [{ product: 'prod1', qty: 1 }],
    customer: 'cust1',
    vendor: 'vend1',
    rider: 'rider1'
  });
  const res = createRes();

  await updateOrderStatus(req, res);

  assert.equal(res.statusCode, 403, 'Expected 403 status');
  assert.equal(res.payload.code, 'INVALID_TRANSITION');
  assert.equal(findOneAndUpdateCallCount, 0, 'Expected zero Order.findOneAndUpdate calls');
  assert.equal(sessionCallCount, 0, 'Expected zero session starts');
});
