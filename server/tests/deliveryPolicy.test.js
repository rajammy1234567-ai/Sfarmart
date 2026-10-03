import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, canAccessOrder, orderForRole, activeDeliveryStates, idOf } from '../utils/deliveryPolicy.js';

// Helper to create mock order objects
function mockOrder(overrides = {}) {
  const base = {
    _id: 'order123',
    status: 'NEW_ORDER',
    customer: 'cust1',
    vendor: 'vend1',
    rider: null,
  };
  return { ...base, ...overrides };
}

function mockUser(role, id) {
  const user = { role };
  if (role === 'ADMIN') {
    // Admin should have full JWT payload fields for identity verification
    user.sub = id;
    user.id = id;
    user._id = id;
    return user;
  }
  user.sub = id;
  user.id = id;
  user._id = id;
  if (role === 'VENDOR') user.vendorId = id;
  if (role === 'RIDER') user.riderId = id;
  return user;
}

test('ADMIN identified can transition any status', () => {
  const admin = mockUser('ADMIN', 'admin1');
  const order = mockOrder({ status: 'NEW_ORDER' });
  assert.ok(canTransition(admin, order, 'ACCEPTED'));
});

test('ADMIN without identity fields is rejected', () => {
  const admin = { role: 'ADMIN' }; // no sub/id/_id
  const order = mockOrder({ status: 'NEW_ORDER' });
  assert.equal(canTransition(admin, order, 'ACCEPTED'), false);
});

test('CUSTOMER can cancel NEW_ORDER only', () => {
  const cust = mockUser('CUSTOMER', 'cust1');
  const order = mockOrder({ status: 'NEW_ORDER' });
  assert.ok(canTransition(cust, order, 'CANCELLED'));
  assert.equal(canTransition(cust, order, 'ACCEPTED'), false);
});

test('VENDOR valid preparation transition', () => {
  const vend = mockUser('VENDOR', 'vend1');
  const order = mockOrder({ status: 'NEW_ORDER' });
  assert.ok(canTransition(vend, order, 'ACCEPTED'));
});

test('VENDOR cannot transition directly to OUT_FOR_DELIVERY', () => {
  const vend = mockUser('VENDOR', 'vend1');
  const order = mockOrder({ status: 'READY_FOR_RIDER' });
  assert.equal(canTransition(vend, order, 'OUT_FOR_DELIVERY'), false);
  assert.equal(canTransition(vend, order, 'DELIVERED'), false);
});

test('VENDOR cannot act on orders they do not own', () => {
  const vend = mockUser('VENDOR', 'vendOther');
  const order = mockOrder({ status: 'NEW_ORDER', vendor: 'vend1' });
  assert.equal(canTransition(vend, order, 'ACCEPTED'), false);
});

test('RIDER generic transition is rejected even when assigned', () => {
  const rider = mockUser('RIDER', 'rider1');
  const order = mockOrder({ status: 'READY_FOR_RIDER', rider: 'rider1' });
  assert.equal(canTransition(rider, order, 'OUT_FOR_DELIVERY'), false);
});

// Additional check: rider cannot jump directly to DELIVERED
test('RIDER cannot transition from OUT_FOR_DELIVERY to DELIVERED via generic path', () => {
  const rider = mockUser('RIDER', 'rider1');
  const order = mockOrder({ status: 'OUT_FOR_DELIVERY', rider: 'rider1' });
  assert.equal(canTransition(rider, order, 'DELIVERED'), false);
});

test('RIDER cannot transition if not owner', () => {
  const rider = mockUser('RIDER', 'riderOther');
  const order = mockOrder({ status: 'READY_FOR_RIDER', rider: 'rider1' });
  assert.equal(canTransition(rider, order, 'OUT_FOR_DELIVERY'), false);
});

test('RIDER cannot transition if not assigned', () => {
  const rider = mockUser('RIDER', 'rider1');
  const order = mockOrder({ status: 'READY_FOR_RIDER', rider: null });
  assert.equal(canTransition(rider, order, 'OUT_FOR_DELIVERY'), false);
});

// Missing user or malformed user should be rejected
test('missing user identity is rejected', () => {
  const user = { role: 'CUSTOMER' }; // no id fields
  const order = mockOrder({ status: 'NEW_ORDER' });
  assert.equal(canTransition(user, order, 'CANCELLED'), false);
});

test('unknown role is rejected', () => {
  const user = mockUser('CUSTOMER', 'cust1');
  user.role = 'ALIEN'; // tamper role
  const order = mockOrder({ status: 'NEW_ORDER' });
  assert.equal(canTransition(user, order, 'CANCELLED'), false);
});
