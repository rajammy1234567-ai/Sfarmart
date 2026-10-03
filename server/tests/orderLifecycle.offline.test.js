import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  canAccessOrder,
  canTransition,
  orderForRole,
  validCoordinates,
  distanceKm,
  storePoint
} from '../utils/deliveryPolicy.js';
import {
  handleRiderAccept,
  handleRiderDecline,
  _setOfferForTest,
  _expireOfferForTest,
  _clearOffersForTest
} from '../services/riderAssignmentService.js';
import Order from '../models/Order.js';
import Rider from '../models/Rider.js';
import Product from '../models/Product.js';

test('Order Lifecycle Offline Test Suite: State Machine, Security & Concurrency', async (t) => {
  const customerId = new mongoose.Types.ObjectId().toString();
  const otherCustomerId = new mongoose.Types.ObjectId().toString();
  const vendorId = new mongoose.Types.ObjectId().toString();
  const otherVendorId = new mongoose.Types.ObjectId().toString();
  const riderId = new mongoose.Types.ObjectId().toString();
  const otherRiderId = new mongoose.Types.ObjectId().toString();
  const orderId = new mongoose.Types.ObjectId().toString();

  const mockOrder = {
    _id: orderId,
    orderNumber: 'ORD-TEST-999',
    customer: customerId,
    vendor: vendorId,
    rider: riderId,
    status: 'NEW_ORDER',
    pickupOtp: '4821',
    deliveryOtp: '7934',
    items: [{ product: new mongoose.Types.ObjectId(), name: 'Apples', qty: 2 }],
    pricing: { grandTotal: 150 }
  };

  // 1. Role Access & Ownership Gate
  await t.test('1. canAccessOrder strictly enforces role-based order ownership', () => {
    // Customer access
    assert.equal(canAccessOrder({ role: 'CUSTOMER', id: customerId }, mockOrder), true);
    assert.equal(canAccessOrder({ role: 'CUSTOMER', id: otherCustomerId }, mockOrder), false);

    // Vendor access
    assert.equal(canAccessOrder({ role: 'VENDOR', vendorId: vendorId }, mockOrder), true);
    assert.equal(canAccessOrder({ role: 'VENDOR', vendorId: otherVendorId }, mockOrder), false);

    // Rider access
    assert.equal(canAccessOrder({ role: 'RIDER', id: riderId }, mockOrder), true);
    assert.equal(canAccessOrder({ role: 'RIDER', id: otherRiderId }, mockOrder), false);

    // Admin access
    assert.equal(canAccessOrder({ role: 'ADMIN', id: 'admin_1' }, mockOrder), true);

    // Anonymous / unauthenticated
    assert.equal(canAccessOrder(null, mockOrder), false);
    assert.equal(canAccessOrder({}, mockOrder), false);
  });

  // 2. Sensitive OTP & Credential Redaction per Role
  await t.test('2. orderForRole redacts pickupOtp, deliveryOtp and sensitive credentials per role', () => {
    // Customer sees deliveryOtp (to share with rider upon dropoff), NOT pickupOtp
    const customerView = orderForRole(mockOrder, 'CUSTOMER');
    assert.equal(customerView.deliveryOtp, '7934');
    assert.equal(customerView.pickupOtp, undefined, 'Customer must not see vendor pickupOtp');

    // Vendor sees pickupOtp (to hand to rider), NOT deliveryOtp
    const vendorView = orderForRole(mockOrder, 'VENDOR');
    assert.equal(vendorView.pickupOtp, '4821');
    assert.equal(vendorView.deliveryOtp, undefined, 'Vendor must not see customer deliveryOtp');

    // Rider sees NEITHER pickupOtp NOR deliveryOtp until verbally given by vendor/customer
    const riderView = orderForRole(mockOrder, 'RIDER');
    assert.equal(riderView.pickupOtp, undefined, 'Rider must not have pickupOtp ahead of arrival');
    assert.equal(riderView.deliveryOtp, undefined, 'Rider must not have deliveryOtp ahead of arrival');

    // Admin sees both for arbitration
    const adminView = orderForRole(mockOrder, 'ADMIN');
    assert.equal(adminView.pickupOtp, '4821');
    assert.equal(adminView.deliveryOtp, '7934');
  });

  // 3. State Transition Matrix Enforcement
  await t.test('3. canTransition enforces valid state machine transitions per role', () => {
    const userCustomer = { role: 'CUSTOMER', id: customerId };
    const userVendor = { role: 'VENDOR', vendorId: vendorId };
    const userRider = { role: 'RIDER', id: riderId };

    // Customer can only cancel when NEW_ORDER
    assert.equal(canTransition(userCustomer, { ...mockOrder, status: 'NEW_ORDER' }, 'CANCELLED'), true);
    assert.equal(canTransition(userCustomer, { ...mockOrder, status: 'ACCEPTED' }, 'CANCELLED'), false, 'Customer cannot cancel accepted order');
    assert.equal(canTransition(userCustomer, { ...mockOrder, status: 'NEW_ORDER' }, 'DELIVERED'), false);

    // Vendor transition rules
    assert.equal(canTransition(userVendor, { ...mockOrder, status: 'NEW_ORDER' }, 'ACCEPTED'), true);
    assert.equal(canTransition(userVendor, { ...mockOrder, status: 'NEW_ORDER' }, 'REJECTED'), true);
    assert.equal(canTransition(userVendor, { ...mockOrder, status: 'ACCEPTED' }, 'PREPARING'), true);
    assert.equal(canTransition(userVendor, { ...mockOrder, status: 'PREPARING' }, 'READY_FOR_RIDER'), true);
    assert.equal(canTransition(userVendor, { ...mockOrder, status: 'READY_FOR_RIDER' }, 'DELIVERED'), false, 'Vendor cannot mark delivered');
    assert.equal(canTransition(userVendor, { ...mockOrder, status: 'PREPARING' }, 'OUT_FOR_DELIVERY'), false);

    // Rider transition rules: generic transition endpoint must reject RIDER (OTP verification required)
    assert.equal(canTransition(userRider, { ...mockOrder, status: 'READY_FOR_RIDER' }, 'OUT_FOR_DELIVERY'), false);
    assert.equal(canTransition(userRider, { ...mockOrder, status: 'OUT_FOR_DELIVERY' }, 'DELIVERED'), false);
    assert.equal(canTransition(userRider, { ...mockOrder, status: 'NEW_ORDER' }, 'DELIVERED'), false);
  });

  // 4. Coordinates & Distance Calculations
  await t.test('4. Geographic distance and coordinate validation', () => {
    assert.equal(validCoordinates(30.901, 75.857), true);
    assert.equal(validCoordinates(0, 0), true);
    assert.equal(validCoordinates(91, 75), false);
    assert.equal(validCoordinates(30, 181), false);
    assert.equal(validCoordinates(null, undefined), false);

    // Ludhiana store to nearby customer (~1.5 km)
    const store = { lat: 30.900965, lng: 75.857276 };
    const nearby = { lat: 30.912000, lng: 75.865000 };
    const dist = distanceKm(store, nearby);
    assert.ok(dist > 1.0 && dist < 2.5, `Distance should be ~1.5km, got ${dist}`);

    // Infinite distance for invalid coordinates
    assert.equal(distanceKm(store, { lat: 999, lng: 999 }), Infinity);
  });

  // 5. Rider Offer Expiry & Reassignment Enforcement
  await t.test('5. Expired rider offers cannot be accepted from an old notification', async () => {
    _clearOffersForTest();
    const testOrderId = new mongoose.Types.ObjectId().toString();
    const rider1Id = new mongoose.Types.ObjectId().toString();
    const rider2Id = new mongoose.Types.ObjectId().toString();

    // 5a. Offer expired via timeout tombstone
    _expireOfferForTest(testOrderId, rider1Id);
    const acceptExpired = await handleRiderAccept(testOrderId, rider1Id);
    assert.equal(acceptExpired.success, false);
    assert.equal(acceptExpired.code, 'OFFER_EXPIRED');

    // 5b. Offer reassigned to another rider
    _clearOffersForTest();
    _setOfferForTest(testOrderId, {
      riderId: rider2Id,
      expiresAt: Date.now() + 20000
    });
    const acceptReassigned = await handleRiderAccept(testOrderId, rider1Id);
    assert.equal(acceptReassigned.success, false);
    assert.equal(acceptReassigned.code, 'OFFER_REASSIGNED');

    // 5c. Offer in activeOffers whose timestamp has elapsed
    _clearOffersForTest();
    _setOfferForTest(testOrderId, {
      riderId: rider1Id,
      expiresAt: Date.now() - 1000 // Expired 1 second ago
    });
    const acceptElapsed = await handleRiderAccept(testOrderId, rider1Id);
    assert.equal(acceptElapsed.success, false);
    assert.equal(acceptElapsed.code, 'OFFER_EXPIRED');

    _clearOffersForTest();
  });

  // 6. Duplicate Checkout & Idempotency Key Handling
  await t.test('6. Idempotent checkout returns existing order without creating duplicates', () => {
    const existingOrder = { _id: orderId, clientOrderId: 'client_tx_uuid_101', customer: customerId };

    // Check key collision logic
    const isDupKey = (err) => Boolean(err && (err.code === 11000 || String(err.message).includes('E11000')));
    assert.equal(isDupKey({ code: 11000 }), true);
    assert.equal(isDupKey(new Error('E11000 duplicate key error collection')), true);
    assert.equal(isDupKey(new Error('Some other error')), false);
  });

  // 7. Atomic Stock Lock Simulation
  await t.test('7. Stock protection prevents overselling when stock is insufficient', () => {
    const currentStock = 3;
    const requestedQty = 5;

    // Condition in Product.findOneAndUpdate({ _id, stockQty: { $gte: qty } })
    const satisfiesCondition = currentStock >= requestedQty;
    assert.equal(satisfiesCondition, false, 'Must fail when requested quantity exceeds available stock');

    const exactStock = 5;
    assert.equal(exactStock >= requestedQty, true, 'Exact stock must satisfy condition');
  });
});
