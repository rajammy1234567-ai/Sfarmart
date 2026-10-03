import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import Rider from '../models/Rider.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Category from '../models/Category.js';
import {
  validateStagingUri,
  APPROVED_STAGING_HOST,
  APPROVED_DATABASE,
  sanitizeErrorMessage
} from '../config/db.js';

import {
  API_BASE,
  JWT_SECRET,
  FIXTURE_PREFIX,
  createdFixtureIds,
  signToken,
  apiCall,
  validateLiveStagingGuards,
  verifyTargetApiStagingEnvironment,
  waitForAutoDispatchedOffer,
  performTeardown
} from './helpers/liveStagingHelpers.js';

let customerToken, vendorToken, riderToken;
let fixtureCustomer, fixtureVendor, fixtureRider, fixtureCategory, fixtureProduct;

const isLiveStagingOptIn = process.env.ALLOW_LIVE_STAGING_TEST === 'true' || process.env.ALLOW_STAGING_ATLAS_TEST === 'true';

if (!isLiveStagingOptIn) {
  test('Offline Guard: Live staging test blocked without explicit opt-in (0 connects, 0 writes)', () => {
    assert.throws(
      () => validateLiveStagingGuards(process.env),
      /FAIL-CLOSED: Live staging test requires explicit opt-in via ALLOW_LIVE_STAGING_TEST=true\./
    );
  });
} else {
  // Guarantee teardown even if setup or assertion fails globally
  after(async () => {
    await performTeardown();
  });

  test('Live Staging Tri-App Order Lifecycle Integration Test', async (t) => {
    // Guarantee teardown on suite termination
    t.after(async () => {
      await performTeardown();
    });

    // Guard check: strictly validated before any DB connection or write
    const guardConfig = validateLiveStagingGuards(process.env);

  // Connect to DB with autoIndex: false and autoCreate: false (zero DDL operations)
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

  // Pre-flight check on API server health
  await verifyTargetApiStagingEnvironment(API_BASE);

  // 1. Setup disposable staging fixtures
  await t.test('Step 0: Setup disposable staging fixtures', async () => {
    try {
      const randomSuffix1 = Math.floor(1000000 + Math.random() * 9000000);
      const randomSuffix2 = Math.floor(1000000 + Math.random() * 9000000);
      const randomSuffix3 = Math.floor(1000000 + Math.random() * 9000000);

      // Create Category fixture (disposable category fixture replacing hardcoded ID)
      fixtureCategory = await Category.create({
        name: `${FIXTURE_PREFIX}_Category`,
        nameNormalized: `${FIXTURE_PREFIX}_category`.toLowerCase(),
        slug: `${FIXTURE_PREFIX.toLowerCase()}-cat`,
        type: 'GROCERY',
        icon: '🍎',
        sortOrder: 999,
        isActive: true,
        homeVisibility: false,
        isStagingFixture: true,
        fixtureRunId: FIXTURE_PREFIX,
        subCategories: [
          { name: 'Fresh Fruits', slug: 'fresh-fruits' }
        ]
      });
      createdFixtureIds.categories.add(fixtureCategory._id.toString());

      // Verify target API server reads from the same approved staging database
      await verifyTargetApiStagingEnvironment(API_BASE, {
        categorySlug: fixtureCategory.slug,
        categoryId: fixtureCategory._id.toString()
      });

      // Create Customer (10 digits starting with 9)
      fixtureCustomer = await User.create({
        name: `${FIXTURE_PREFIX}_Customer`,
        phone: `981${randomSuffix1}`,
        role: 'CUSTOMER',
        status: 'ACTIVE'
      });
      createdFixtureIds.users.add(fixtureCustomer._id.toString());
      customerToken = signToken({
        sub: fixtureCustomer._id.toString(),
        id: fixtureCustomer._id.toString(),
        role: 'CUSTOMER',
        phone: fixtureCustomer.phone
      });

      // Create Vendor
      fixtureVendor = await Vendor.create({
        storeName: `${FIXTURE_PREFIX}_Store`,
        ownerName: `${FIXTURE_PREFIX}_Owner`,
        phone: `982${randomSuffix2}`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhash',
        isOpen: true,
        minOrderValue: 50,
        storeType: 'KIRANA',
        address: {
          line1: '123 Market Rd',
          city: 'Ludhiana',
          location: {
            type: 'Point',
            coordinates: [75.857276, 30.900965] // Ludhiana Central
          }
        }
      });
      createdFixtureIds.vendors.add(fixtureVendor._id.toString());
      vendorToken = signToken({
        sub: fixtureVendor._id.toString(),
        id: fixtureVendor._id.toString(),
        vendorId: fixtureVendor._id.toString(),
        role: 'VENDOR',
        phone: fixtureVendor.phone
      });

      // Create Rider (positioned 500m from store)
      fixtureRider = await Rider.create({
        name: `${FIXTURE_PREFIX}_Rider`,
        phone: `983${randomSuffix3}`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhash',
        status: 'ONLINE_IDLE',
        currentLocation: {
          type: 'Point',
          coordinates: [75.858000, 30.901500]
        },
        locationUpdatedAt: new Date()
      });
      createdFixtureIds.riders.add(fixtureRider._id.toString());
      riderToken = signToken({
        sub: fixtureRider._id.toString(),
        id: fixtureRider._id.toString(),
        riderId: fixtureRider._id.toString(),
        role: 'RIDER',
        phone: fixtureRider.phone
      });

      // Create Product using valid disposable category fixture
      fixtureProduct = await Product.create({
        name: `${FIXTURE_PREFIX}_FreshApples`,
        vendor: fixtureVendor._id,
        category: fixtureCategory._id,
        subCategory: 'fresh-fruits',
        price: 60,
        mrp: 80,
        unit: '1 kg',
        stockQty: 20,
        inStock: true
      });
      createdFixtureIds.products.add(fixtureProduct._id.toString());

      assert.ok(fixtureCustomer && fixtureVendor && fixtureRider && fixtureCategory && fixtureProduct);
    } catch (step0Err) {
      console.error('❌ Step 0 failure:', sanitizeErrorMessage(step0Err.message));
      throw step0Err;
    }
  });

  let createdOrder = null;
  const clientOrderId = `${FIXTURE_PREFIX}_CID_1`;
  createdFixtureIds.clientOrderIds.add(clientOrderId);

  // 2. Checkout & Idempotency
  await t.test('Step 1: Customer checkout & duplicate prevention', async () => {
    const payload = {
      clientOrderId,
      vendorId: fixtureVendor._id.toString(),
      items: [{ productId: fixtureProduct._id.toString(), qty: 2 }],
      address: {
        name: 'Fixture Recipient',
        phone: fixtureCustomer.phone,
        line1: 'House 42, Civil Lines',
        city: 'Ludhiana',
        lat: 30.9050,
        lng: 75.8600
      },
      paymentMethod: 'COD'
    };

    // 1a. Initial Order Placement
    const res1 = await apiCall('POST', '/orders', payload, customerToken);
    assert.equal(res1.status, 201, `Order placement failed: HTTP ${res1.status} (code: ${res1.data?.code || 'N/A'}) - ${JSON.stringify(res1.data)}`);
    assert.ok(res1.data, `Response body missing (HTTP ${res1.status})`);
    assert.equal(res1.data.success, true, `Expected success: true, got ${JSON.stringify(res1.data)} (HTTP ${res1.status})`);
    createdOrder = res1.data.order;
    assert.ok(createdOrder?._id, `Order ID missing in response (HTTP ${res1.status})`);
    createdFixtureIds.orders.add(createdOrder._id.toString());
    assert.equal(createdOrder.status, 'NEW_ORDER');

    // Verify stock was decremented from 20 to 18
    const checkStock1 = await Product.findById(fixtureProduct._id);
    assert.equal(checkStock1.stockQty, 18, 'Stock must be atomically decremented');

    // 1b. Duplicate Order Submission with same clientOrderId (idempotency guarantee)
    const res2 = await apiCall('POST', '/orders', payload, customerToken);
    assert.equal(res2.status, 200, `Duplicate clientOrderId failed: HTTP ${res2.status} (code: ${res2.data?.code || 'N/A'})`);
    assert.ok(res2.data?.order, `Duplicate order response missing order (HTTP ${res2.status})`);
    assert.equal(res2.data.order._id.toString(), createdOrder._id.toString());
    assert.equal(res2.data.isExisting, true);

    // Verify stock was NOT decremented again
    const checkStock2 = await Product.findById(fixtureProduct._id);
    assert.equal(checkStock2.stockQty, 18, 'Duplicate checkout must not decrement stock twice');
  });

  // 2b. Unauthorized Transitions Gate
  await t.test('Step 1.5: Unauthorized transitions rejected fail-closed', async () => {
    const orderId = createdOrder._id.toString();

    // Vendor cannot jump from NEW_ORDER directly to OUT_FOR_DELIVERY
    const resInvalidVendor = await apiCall('PATCH', `/orders/${orderId}/status`, { status: 'OUT_FOR_DELIVERY' }, vendorToken);
    assert.equal(resInvalidVendor.status, 403, `Vendor invalid transition must return 403: HTTP ${resInvalidVendor.status} (code: ${resInvalidVendor.data?.code})`);
    assert.equal(resInvalidVendor.data?.code, 'INVALID_TRANSITION', `Expected INVALID_TRANSITION, got ${resInvalidVendor.data?.code} (HTTP ${resInvalidVendor.status})`);

    // Customer cannot transition to ACCEPTED
    const resInvalidCust = await apiCall('PATCH', `/orders/${orderId}/status`, { status: 'ACCEPTED' }, customerToken);
    assert.equal(resInvalidCust.status, 403, `Customer invalid transition must return 403: HTTP ${resInvalidCust.status} (code: ${resInvalidCust.data?.code})`);
    assert.equal(resInvalidCust.data?.code, 'INVALID_TRANSITION', `Expected INVALID_TRANSITION, got ${resInvalidCust.data?.code} (HTTP ${resInvalidCust.status})`);

    // Rider cannot transition via generic endpoint
    const resInvalidRider = await apiCall('PATCH', `/orders/${orderId}/status`, { status: 'ACCEPTED' }, riderToken);
    assert.equal(resInvalidRider.status, 403, `Rider generic transition must return 403: HTTP ${resInvalidRider.status} (code: ${resInvalidRider.data?.code})`);
    assert.equal(resInvalidRider.data?.code, 'INVALID_TRANSITION', `Expected INVALID_TRANSITION, got ${resInvalidRider.data?.code} (HTTP ${resInvalidRider.status})`);
  });

  // 3. Partner Acceptance & Kitchen Preparation
  await t.test('Step 2: Partner accepts and transitions order to PREPARING and READY_FOR_RIDER', async () => {
    const orderId = createdOrder._id.toString();

    // 2a. Vendor Accepts Order
    const resAccept = await apiCall('PATCH', `/orders/${orderId}/status`, { status: 'ACCEPTED' }, vendorToken);
    assert.equal(resAccept.status, 200, `Vendor accept failed: HTTP ${resAccept.status} (code: ${resAccept.data?.code}) - ${JSON.stringify(resAccept.data)}`);
    assert.ok(resAccept.data?.order, `Accept response missing order (HTTP ${resAccept.status})`);
    assert.equal(resAccept.data.order.status, 'ACCEPTED');

    // 2b. Vendor starts Kitchen Preparation
    const resPrep = await apiCall('PATCH', `/orders/${orderId}/status`, { status: 'PREPARING' }, vendorToken);
    assert.equal(resPrep.status, 200, `Vendor prep failed: HTTP ${resPrep.status} (code: ${resPrep.data?.code}) - ${JSON.stringify(resPrep.data)}`);
    assert.ok(resPrep.data?.order, `Prep response missing order (HTTP ${resPrep.status})`);
    assert.equal(resPrep.data.order.status, 'PREPARING');

    // Ensure fixture rider has fresh location so automatic dispatch can target fixture rider
    await Rider.findByIdAndUpdate(fixtureRider._id, {
      status: 'ONLINE_IDLE',
      activeOrderId: null,
      locationUpdatedAt: new Date(),
      currentLocation: { type: 'Point', coordinates: [75.8575, 30.9010] }
    });

    // 2c. Vendor marks Ready for Rider
    const resReady = await apiCall('PATCH', `/orders/${orderId}/status`, { status: 'READY_FOR_RIDER' }, vendorToken);
    assert.equal(resReady.status, 200, `Vendor ready_for_rider failed: HTTP ${resReady.status} (code: ${resReady.data?.code}) - ${JSON.stringify(resReady.data)}`);
    assert.ok(resReady.data?.order, `Ready response missing order (HTTP ${resReady.status})`);
    assert.equal(resReady.data.order.status, 'READY_FOR_RIDER');
  });

  // 4. Automatic Rider Dispatch Verification & Acceptance (No Manual Offer Injection)
  await t.test('Step 3: Automatic rider-dispatch verification, actual offer acceptance & arrival', async () => {
    const orderId = createdOrder._id.toString();

    // 3a. Bounded wait for automatic dispatch - MUST FAIL if no offer arrives within bounded timeout
    const orderWithOffer = await waitForAutoDispatchedOffer(orderId, fixtureRider._id.toString(), 10000, 250);

    // 3b. Verify actual offer structure without manual injection
    assert.ok(orderWithOffer.currentOffer?.rider, 'Auto-dispatched offer must carry candidate rider');
    assert.equal(
      orderWithOffer.currentOffer.rider.toString(),
      fixtureRider._id.toString(),
      'Auto-dispatched offer must target the eligible fixture rider'
    );
    assert.ok(orderWithOffer.currentOffer.offerId, 'Auto-dispatched offer must carry unique offerId');
    assert.ok(orderWithOffer.currentOffer.expiresAt, 'Auto-dispatched offer must carry expiration timestamp');
    assert.ok(
      new Date(orderWithOffer.currentOffer.expiresAt).getTime() > Date.now(),
      'Auto-dispatched offer must not be expired'
    );

    // 3c. Rider accepts the ACTUAL offer directly without manual injection
    const resAccept = await apiCall('POST', `/rider/orders/${orderId}/accept`, {}, riderToken);
    assert.equal(resAccept.status, 200, `Rider acceptance failed: HTTP ${resAccept.status} (code: ${resAccept.data?.code}) - ${JSON.stringify(resAccept.data)}`);
    assert.ok(resAccept.data?.order, `Rider accept response missing order (HTTP ${resAccept.status})`);
    assert.equal(resAccept.data.order.status, 'RIDER_ASSIGNED');
    assert.equal(resAccept.data.order.rider._id.toString(), fixtureRider._id.toString());

    // 3d. Rider marks Arrived at Store
    const resArrived = await apiCall('POST', `/rider/orders/${orderId}/arrived-store`, {}, riderToken);
    assert.equal(resArrived.status, 200, `Rider arrived failed: HTTP ${resArrived.status} (code: ${resArrived.data?.code}) - ${JSON.stringify(resArrived.data)}`);
    assert.ok(resArrived.data?.order, `Rider arrived response missing order (HTTP ${resArrived.status})`);
    assert.equal(resArrived.data.order.status, 'RIDER_ARRIVED_STORE');
  });

  // 5. OTP Privacy & Pickup Verification
  await t.test('Step 4: OTP privacy enforcement and pickup verification', async () => {
    const orderId = createdOrder._id.toString();

    // 4a. Fetch as Vendor: Vendor sees pickupOtp
    const resVendorOrder = await apiCall('GET', `/orders/${orderId}`, null, vendorToken);
    assert.equal(resVendorOrder.status, 200, `Vendor fetch failed: HTTP ${resVendorOrder.status} (code: ${resVendorOrder.data?.code})`);
    assert.ok(resVendorOrder.data?.order, `Vendor fetch missing order (HTTP ${resVendorOrder.status})`);
    const vendorPickupOtp = resVendorOrder.data.order.pickupOtp;
    assert.ok(vendorPickupOtp, 'Vendor must see pickupOtp to give to rider');
    assert.equal(resVendorOrder.data.order.deliveryOtp, undefined, 'Vendor must NOT see deliveryOtp');

    // 4b. Fetch as Customer: Customer sees deliveryOtp, not pickupOtp
    const resCustOrder = await apiCall('GET', `/orders/${orderId}`, null, customerToken);
    assert.equal(resCustOrder.status, 200, `Customer fetch failed: HTTP ${resCustOrder.status} (code: ${resCustOrder.data?.code})`);
    assert.ok(resCustOrder.data?.order, `Customer fetch missing order (HTTP ${resCustOrder.status})`);
    const customerDeliveryOtp = resCustOrder.data.order.deliveryOtp;
    assert.ok(customerDeliveryOtp, 'Customer must see deliveryOtp to give to rider at door');
    assert.equal(resCustOrder.data.order.pickupOtp, undefined, 'Customer must NOT see pickupOtp');

    // 4c. Fetch as Rider: Rider sees NEITHER OTP
    const resRiderOrder = await apiCall('GET', `/orders/${orderId}`, null, riderToken);
    assert.equal(resRiderOrder.status, 200, `Rider fetch failed: HTTP ${resRiderOrder.status} (code: ${resRiderOrder.data?.code})`);
    assert.ok(resRiderOrder.data?.order, `Rider fetch missing order (HTTP ${resRiderOrder.status})`);
    assert.equal(resRiderOrder.data.order.pickupOtp, undefined, 'Rider must NOT see pickupOtp');
    assert.equal(resRiderOrder.data.order.deliveryOtp, undefined, 'Rider must NOT see deliveryOtp');

    // 4d. Rider submits wrong pickup OTP -> must be rejected
    const resWrongPickup = await apiCall('POST', `/rider/orders/${orderId}/pickup-verify`, { pickupOtp: '0000' }, riderToken);
    assert.equal(resWrongPickup.status, 409, `Invalid pickup OTP must return 409: HTTP ${resWrongPickup.status} (code: ${resWrongPickup.data?.code})`);

    // 4e. Rider submits valid pickup OTP -> OUT_FOR_DELIVERY
    const resCorrectPickup = await apiCall('POST', `/rider/orders/${orderId}/pickup-verify`, { pickupOtp: vendorPickupOtp }, riderToken);
    assert.equal(resCorrectPickup.status, 200, `Valid pickup OTP failed: HTTP ${resCorrectPickup.status} (code: ${resCorrectPickup.data?.code}) - ${JSON.stringify(resCorrectPickup.data)}`);
    assert.ok(resCorrectPickup.data?.order, `Pickup verify missing order (HTTP ${resCorrectPickup.status})`);
    assert.equal(resCorrectPickup.data.order.status, 'OUT_FOR_DELIVERY');

    // 4f. Assigned rider cannot transition OUT_FOR_DELIVERY to DELIVERED via generic endpoint
    const resRiderGenericDelivered = await apiCall('PATCH', `/orders/${orderId}/status`, { status: 'DELIVERED' }, riderToken);
    assert.equal(resRiderGenericDelivered.status, 403, `Rider generic DELIVERED must return 403: HTTP ${resRiderGenericDelivered.status} (code: ${resRiderGenericDelivered.data?.code})`);
    assert.equal(resRiderGenericDelivered.data?.code, 'INVALID_TRANSITION', `Expected INVALID_TRANSITION, got ${resRiderGenericDelivered.data?.code} (HTTP ${resRiderGenericDelivered.status})`);
  });

  // 6. Delivery Completion & Payment Settlement
  await t.test('Step 5: Delivery OTP verification and final settlement', async () => {
    const orderId = createdOrder._id.toString();

    // Fetch delivery OTP from customer view
    const resCust = await apiCall('GET', `/orders/${orderId}`, null, customerToken);
    assert.equal(resCust.status, 200, `Customer fetch for delivery OTP failed: HTTP ${resCust.status} (code: ${resCust.data?.code})`);
    assert.ok(resCust.data?.order, `Customer fetch missing order (HTTP ${resCust.status})`);
    const customerDeliveryOtp = resCust.data.order.deliveryOtp;

    // 5a. Rider submits wrong delivery OTP -> must be rejected
    const resWrongDelivery = await apiCall('POST', `/rider/orders/${orderId}/delivery-verify`, { deliveryOtp: '1111' }, riderToken);
    assert.equal(resWrongDelivery.status, 409, `Invalid delivery OTP must return 409: HTTP ${resWrongDelivery.status} (code: ${resWrongDelivery.data?.code})`);

    // 5b. Rider submits correct delivery OTP -> DELIVERED
    const resCorrectDelivery = await apiCall('POST', `/rider/orders/${orderId}/delivery-verify`, { deliveryOtp: customerDeliveryOtp }, riderToken);
    assert.equal(resCorrectDelivery.status, 200, `Delivery verify failed: HTTP ${resCorrectDelivery.status} (code: ${resCorrectDelivery.data?.code}) - ${JSON.stringify(resCorrectDelivery.data)}`);
    assert.ok(resCorrectDelivery.data?.order, `Delivery verify missing order (HTTP ${resCorrectDelivery.status})`);
    assert.equal(resCorrectDelivery.data.order.status, 'DELIVERED');
    assert.equal(resCorrectDelivery.data.order.payment.status, 'PAID');

    // Verify rider activeOrderId was cleared and earnings credited
    const updatedRider = await Rider.findById(fixtureRider._id);
    assert.equal(updatedRider.activeOrderId, null);
    assert.ok(updatedRider.totalEarningsPaise >= 6500, 'Rider must be credited delivery earnings');
  });

  // 7. Cancellation & Stock Rollback Verification
  await t.test('Step 6: Cancellation rolls back stock atomically', async () => {
    // Check initial stock (18)
    const stockBefore = (await Product.findById(fixtureProduct._id)).stockQty;

    const cancelClientOrderId = `${FIXTURE_PREFIX}_CID_CANCEL`;
    createdFixtureIds.clientOrderIds.add(cancelClientOrderId);

    // Place a second order
    const resCancelOrder = await apiCall('POST', '/orders', {
      clientOrderId: cancelClientOrderId,
      vendorId: fixtureVendor._id.toString(),
      items: [{ productId: fixtureProduct._id.toString(), qty: 3 }],
      address: {
        name: 'Cancel Recipient',
        phone: fixtureCustomer.phone,
        line1: 'House 99',
        city: 'Ludhiana',
        lat: 30.9050,
        lng: 75.8600
      },
      paymentMethod: 'COD'
    }, customerToken);

    assert.equal(resCancelOrder.status, 201, `Cancel test order creation failed: HTTP ${resCancelOrder.status} (code: ${resCancelOrder.data?.code}) - ${JSON.stringify(resCancelOrder.data)}`);
    assert.ok(resCancelOrder.data?.order, `Cancel test order missing order (HTTP ${resCancelOrder.status})`);
    const cancelOrderId = resCancelOrder.data.order._id.toString();
    createdFixtureIds.orders.add(cancelOrderId);

    // Stock should be 18 - 3 = 15
    const stockAfterPlace = (await Product.findById(fixtureProduct._id)).stockQty;
    assert.equal(stockAfterPlace, stockBefore - 3);

    // Customer cancels order
    const resCancel = await apiCall('PATCH', `/orders/${cancelOrderId}/status`, { status: 'CANCELLED' }, customerToken);
    assert.equal(resCancel.status, 200, `Cancellation failed: HTTP ${resCancel.status} (code: ${resCancel.data?.code}) - ${JSON.stringify(resCancel.data)}`);
    assert.ok(resCancel.data?.order, `Cancel response missing order (HTTP ${resCancel.status})`);
    assert.equal(resCancel.data.order.status, 'CANCELLED');

    // Stock must be restored back to initial (18)
    const stockAfterCancel = (await Product.findById(fixtureProduct._id)).stockQty;
    assert.equal(stockAfterCancel, stockBefore, 'Cancelled order must restore product stock');
  });

  // 8. Strict Teardown / Cleanup
  await t.test('Step 7: Surgical teardown of staging fixtures', async () => {
    await performTeardown();
  });
});
}
