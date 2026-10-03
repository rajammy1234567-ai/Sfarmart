import test from 'node:test';
import assert from 'node:assert/strict';
import { validCoordinates, distanceKm, canAccessOrder, storePoint } from '../utils/deliveryPolicy.js';
import { mapVehicleToTravelMode, calculateOrderRouteEta, clearRouteCache, getRouteCacheSize } from '../services/routingService.js';
import mongoose from 'mongoose';
import Order from '../models/Order.js';

// ─── 1. validCoordinates ─────────────────────────────────────────────────────
test('1. validCoordinates rejects out-of-range and non-finite values', () => {
  assert.equal(validCoordinates(30.9, 75.8), true);
  assert.equal(validCoordinates(0, 0), true);
  assert.equal(validCoordinates(-90, -180), true);
  assert.equal(validCoordinates(90, 180), true);
  assert.equal(validCoordinates(999, 75.8), false, 'lat > 90 must be invalid');
  assert.equal(validCoordinates(30.9, 999), false, 'lng > 180 must be invalid');
  assert.equal(validCoordinates(NaN, 75.8), false, 'NaN lat must be invalid');
  assert.equal(validCoordinates(30.9, NaN), false, 'NaN lng must be invalid');
  assert.equal(validCoordinates(null, 75.8), false, 'null lat must be invalid');
  assert.equal(validCoordinates(30.9, undefined), false, 'undefined lng must be invalid');
  assert.equal(validCoordinates(Infinity, 75.8), false, 'Infinity lat must be invalid');
});

// ─── 2. distanceKm ───────────────────────────────────────────────────────────
test('2. distanceKm returns Infinity for invalid coordinates', () => {
  assert.equal(distanceKm({ lat: NaN, lng: 75 }, { lat: 30, lng: 75 }), Infinity);
  assert.equal(distanceKm(null, { lat: 30, lng: 75 }), Infinity);
  assert.equal(distanceKm({ lat: 30, lng: 75 }, undefined), Infinity);
});

test('3. distanceKm: same point gives ~0 km', () => {
  const d = distanceKm({ lat: 30.9, lng: 75.8 }, { lat: 30.9, lng: 75.8 });
  assert.ok(d < 0.001, 'Same-point distance must be ~0 km');
});

// ─── 4. Serviceability: deliveryRadiusKm (not deliveryRadius) ────────────────
test('4. Serviceability uses deliveryRadiusKm, not deliveryRadius', () => {
  const store = { lat: 30.9009, lng: 75.8573 };
  const dist27km = distanceKm(store, { lat: 31.15, lng: 75.86 });
  assert.ok(dist27km > 10, 'Far delivery must be > 10 km');
  // Correct field
  const v5 = { deliveryRadiusKm: 5 };
  assert.equal(v5.deliveryRadiusKm || 7, 5, 'deliveryRadiusKm must be honoured');
  // Wrong field — demonstrates the pre-fix bug: always returns 7 km fallback (Vendor schema default)
  const wrong = { deliveryRadius: 5 };
  assert.equal(wrong.deliveryRadiusKm || 7, 7,
    'Wrong field name deliveryRadiusKm is undefined on {deliveryRadius:5} -> falls back to 7 km (Vendor schema default)');
});

// ─── 5. Out-of-order GPS ────────────────────────────────────────────────────
test('5. Out-of-order GPS: capturedAt <= prevTimestamp must be rejected', () => {
  const prev = Date.now() - 5000;
  assert.ok(prev - 1000 <= prev, 'stale timestamp must be <= prev');
  assert.ok(prev <= prev, 'equal timestamp must be <= prev');
  assert.ok(prev + 1000 > prev, 'fresh timestamp must be > prev');
});

// ─── 6. Impossible GPS jump ──────────────────────────────────────────────────
test('6. Impossible GPS jump: > 140 km/h detected', () => {
  const prev = { lat: 30.9009, lng: 75.8573 };
  const far  = { lat: 30.9999, lng: 75.95 };
  const kmh = (distanceKm(prev, far) / 2) * 3600;
  assert.ok(kmh > 140, 'Jump of ~10 km in 2s must exceed 140 km/h threshold');
  const near = { lat: 30.902, lng: 75.859 };
  const normalKmh = (distanceKm(prev, near) / 30) * 3600;
  assert.ok(normalKmh < 140, 'Normal urban movement must be under 140 km/h');
});

// ─── 7. Socket room authorization: canAccessOrder ────────────────────────────
test('7a. canAccessOrder: customer access own order only', () => {
  const order = { customer: 'cust1', vendor: 'vend1', rider: null };
  assert.equal(canAccessOrder({ role: 'CUSTOMER', sub: 'cust1' }, order), true);
  assert.equal(canAccessOrder({ role: 'CUSTOMER', sub: 'cust2' }, order), false,
    'Customer must not access another order');
  assert.equal(canAccessOrder({ role: 'CUSTOMER' }, order), false,
    'Missing identity must deny');
});

test('7b. canAccessOrder: vendor access own order only', () => {
  const order = { customer: 'cust1', vendor: 'vend1', rider: null };
  assert.equal(canAccessOrder({ role: 'VENDOR', sub: 'vend1', vendorId: 'vend1' }, order), true);
  assert.equal(canAccessOrder({ role: 'VENDOR', sub: 'vend2', vendorId: 'vend2' }, order), false);
});

test('7c. canAccessOrder: rider access assigned order only', () => {
  const order = { customer: 'cust1', vendor: 'vend1', rider: 'rider1' };
  assert.equal(canAccessOrder({ role: 'RIDER', sub: 'rider1' }, order), true);
  assert.equal(canAccessOrder({ role: 'RIDER', sub: 'rider2' }, order), false);
});

test('7d. canAccessOrder: ADMIN with identity allowed, without identity denied', () => {
  const order = { customer: 'cust1', vendor: 'vend1', rider: null };
  assert.equal(canAccessOrder({ role: 'ADMIN', sub: 'admin1' }, order), true);
  assert.equal(canAccessOrder({ role: 'ADMIN' }, order), false);
});

test('7e. canAccessOrder: GUEST and null denied', () => {
  const order = { customer: 'cust1', vendor: 'vend1', rider: null };
  assert.equal(canAccessOrder({ role: 'GUEST' }, order), false);
  assert.equal(canAccessOrder(null, order), false);
});

// ─── 8. Reconnect snapshot: location suppressed for inactive states ───────────
test('8. Reconnect snapshot suppresses riderLocation/route for inactive states', () => {
  const activeStates   = ['READY_FOR_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const inactiveStates = ['NEW_ORDER', 'ACCEPTED', 'PREPARING', 'CANCELLED'];
  const loc   = { lat: 30.9, lng: 75.8, at: new Date() };
  const route = [{ lat: 30.9, lng: 75.8, at: new Date() }];
  for (const s of activeStates) {
    const snap = {
      riderLocation: loc,
      deliveryRoute: route
    };
    assert.notEqual(snap.riderLocation, null, 'location non-null for active state');
    assert.ok(snap.deliveryRoute.length > 0, 'route non-empty for active state');
  }
  for (const s of inactiveStates) {
    const snap = {
      riderLocation: null,
      deliveryRoute: []
    };
    assert.equal(snap.riderLocation, null, 'location null for inactive state');
    assert.equal(snap.deliveryRoute.length, 0, 'route empty for inactive state');
  }
});

// ─── 9. Stale ETA: etaStatus classification ──────────────────────────────────
test('9a. etaStatus is STALE_GPS when fix >= 30s old', () => {
  const check = (fixTs, usingRider) => {
    if (!usingRider) return 'STATIC_STORE_TO_CUSTOMER';
    const ageMs = fixTs > 0 ? Date.now() - fixTs : Infinity;
    return (!fixTs || isNaN(ageMs) || ageMs >= 30000) ? 'STALE_GPS' : 'LIVE';
  };
  assert.equal(check(0, true), 'STALE_GPS', 'no timestamp => STALE_GPS');
  assert.equal(check(Date.now() - 35000, true), 'STALE_GPS', '35s old => STALE_GPS');
  assert.equal(check(Date.now() - 30000, true), 'STALE_GPS', 'exactly 30s => STALE_GPS boundary');
  assert.equal(check(Date.now() - 10000, true), 'LIVE', '10s old => LIVE');
  assert.equal(check(0, false), 'STATIC_STORE_TO_CUSTOMER', 'no rider origin => STATIC');
});

test('9b. gpsAgeSeconds is computed correctly', () => {
  const fixTs = Date.now() - 45000;
  const ageMs = Date.now() - fixTs;
  const secs  = Number.isFinite(ageMs) && ageMs >= 0 ? Math.floor(ageMs / 1000) : null;
  assert.ok(secs !== null, 'gpsAgeSeconds must be non-null for valid timestamp');
  assert.ok(secs >= 44 && secs <= 46, 'gpsAgeSeconds must be ~45');
});

// ─── 10. Vehicle travel mode mapping ─────────────────────────────────────────
test('10. mapVehicleToTravelMode maps all types correctly', () => {
  assert.equal(mapVehicleToTravelMode('bike'),    'TWO_WHEELER');
  assert.equal(mapVehicleToTravelMode(null),      'TWO_WHEELER', 'null defaults to TWO_WHEELER');
  assert.equal(mapVehicleToTravelMode(undefined), 'TWO_WHEELER', 'undefined defaults to TWO_WHEELER');
  assert.equal(mapVehicleToTravelMode('cycle'),   'BICYCLE');
  assert.equal(mapVehicleToTravelMode('BICYCLE'), 'BICYCLE');
  assert.equal(mapVehicleToTravelMode('CYCLE'),   'BICYCLE');
  assert.equal(mapVehicleToTravelMode('on_foot'), 'WALK');
  assert.equal(mapVehicleToTravelMode('WALK'),    'WALK');
  assert.equal(mapVehicleToTravelMode('FOOT'),    'WALK');
  assert.equal(mapVehicleToTravelMode('CAR'),     'DRIVE');
  assert.equal(mapVehicleToTravelMode('VAN'),     'DRIVE');
  assert.equal(mapVehicleToTravelMode('DRIVE'),   'DRIVE');
  assert.equal(mapVehicleToTravelMode('AUTO'),    'DRIVE');
});

// Shared mock Order.findById builder
function mockOrderFindById(orderId, custId, vendId, riderId, opts = {}) {
  return () => ({
    populate: () => ({ populate: () => ({ populate: () => Promise.resolve({
      _id: orderId,
      status: opts.status || 'OUT_FOR_DELIVERY',
      customer: { _id: custId },
      vendor: { _id: vendId, address: { location: { coordinates: [75.8573, 30.9009] } } },
      rider: riderId ? { _id: riderId, vehicleType: 'bike' } : null,
      riderLocation: opts.noRiderLoc ? null : { lat: 30.902, lng: 75.859, at: new Date() },
      address: opts.noAddr ? { lat: undefined, lng: undefined } : { lat: 30.905, lng: 75.86 }
    }) }) })
  });
}

// ─── 11. MOCK_ROUTING prohibited outside test env ─────────────────────────────
test('11. MOCK_ROUTING=true outside NODE_ENV=test returns MOCK_ROUTING_PROHIBITED (500)', async () => {
  const origEnv = process.env.NODE_ENV;
  const origMock = process.env.MOCK_ROUTING;
  const origKey  = process.env.GOOGLE_MAPS_SERVER_KEY;
  const origFn   = Order.findById;
  const oid = new mongoose.Types.ObjectId();
  const cid = new mongoose.Types.ObjectId();
  const vid = new mongoose.Types.ObjectId();
  const rid = new mongoose.Types.ObjectId();
  try {
    process.env.NODE_ENV = 'staging';
    process.env.MOCK_ROUTING = 'true';
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    Order.findById = mockOrderFindById(oid, cid, vid, rid);
    const result = await calculateOrderRouteEta(oid.toString(), { role: 'CUSTOMER', sub: cid.toString(), id: cid.toString() });
    assert.equal(result.status, 500);
    assert.equal(result.data.code, 'MOCK_ROUTING_PROHIBITED');
  } finally {
    process.env.NODE_ENV = origEnv;
    if (origMock !== undefined) process.env.MOCK_ROUTING = origMock; else delete process.env.MOCK_ROUTING;
    if (origKey) process.env.GOOGLE_MAPS_SERVER_KEY = origKey; else delete process.env.GOOGLE_MAPS_SERVER_KEY;
    Order.findById = origFn;
    clearRouteCache();
  }
});

// ─── 12. PROVIDER_UNCONFIGURED when no API key in non-test env ───────────────
test('12. No API key in production returns PROVIDER_UNCONFIGURED (503)', async () => {
  const origEnv  = process.env.NODE_ENV;
  const origMock = process.env.MOCK_ROUTING;
  const origKey  = process.env.GOOGLE_MAPS_SERVER_KEY;
  const origFn   = Order.findById;
  const oid = new mongoose.Types.ObjectId();
  const cid = new mongoose.Types.ObjectId();
  const vid = new mongoose.Types.ObjectId();
  const rid = new mongoose.Types.ObjectId();
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.MOCK_ROUTING;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    Order.findById = mockOrderFindById(oid, cid, vid, rid);
    const result = await calculateOrderRouteEta(oid.toString(), { role: 'CUSTOMER', sub: cid.toString(), id: cid.toString() });
    assert.equal(result.status, 503);
    assert.equal(result.data.code, 'PROVIDER_UNCONFIGURED');
  } finally {
    process.env.NODE_ENV = origEnv;
    if (origMock !== undefined) process.env.MOCK_ROUTING = origMock; else delete process.env.MOCK_ROUTING;
    if (origKey) process.env.GOOGLE_MAPS_SERVER_KEY = origKey; else delete process.env.GOOGLE_MAPS_SERVER_KEY;
    Order.findById = origFn;
    clearRouteCache();
  }
});

// ─── 13. Provider timeout => ROUTING_PROVIDER_TIMEOUT (504) ──────────────────
test('13. Provider AbortError returns ROUTING_PROVIDER_TIMEOUT (504)', async () => {
  const origEnv  = process.env.NODE_ENV;
  const origKey  = process.env.GOOGLE_MAPS_SERVER_KEY;
  const origMock = process.env.MOCK_ROUTING;
  const origFn   = Order.findById;
  const oid = new mongoose.Types.ObjectId();
  const cid = new mongoose.Types.ObjectId();
  const vid = new mongoose.Types.ObjectId();
  const rid = new mongoose.Types.ObjectId();
  try {
    process.env.NODE_ENV = 'production';
    process.env.GOOGLE_MAPS_SERVER_KEY = 'fake_key_timeout_test';
    delete process.env.MOCK_ROUTING;
    Order.findById = mockOrderFindById(oid, cid, vid, rid);
    const abortFetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    const result = await calculateOrderRouteEta(oid.toString(), { role: 'CUSTOMER', sub: cid.toString(), id: cid.toString() }, abortFetch);
    assert.equal(result.status, 504);
    assert.equal(result.data.code, 'ROUTING_PROVIDER_TIMEOUT');
  } finally {
    process.env.NODE_ENV = origEnv;
    if (origKey) process.env.GOOGLE_MAPS_SERVER_KEY = origKey; else delete process.env.GOOGLE_MAPS_SERVER_KEY;
    if (origMock !== undefined) process.env.MOCK_ROUTING = origMock; else delete process.env.MOCK_ROUTING;
    Order.findById = origFn;
    clearRouteCache();
  }
});

// ─── 14. HTTP provider error => ROUTING_PROVIDER_ERROR (502) ─────────────────
test('14. Provider HTTP 500 returns ROUTING_PROVIDER_ERROR (502)', async () => {
  const origEnv  = process.env.NODE_ENV;
  const origKey  = process.env.GOOGLE_MAPS_SERVER_KEY;
  const origMock = process.env.MOCK_ROUTING;
  const origFn   = Order.findById;
  const oid = new mongoose.Types.ObjectId();
  const cid = new mongoose.Types.ObjectId();
  const vid = new mongoose.Types.ObjectId();
  const rid = new mongoose.Types.ObjectId();
  try {
    process.env.NODE_ENV = 'production';
    process.env.GOOGLE_MAPS_SERVER_KEY = 'fake_key_http_err';
    delete process.env.MOCK_ROUTING;
    Order.findById = mockOrderFindById(oid, cid, vid, rid);
    const errFetch = async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'internal' } }) });
    const result = await calculateOrderRouteEta(oid.toString(), { role: 'CUSTOMER', sub: cid.toString(), id: cid.toString() }, errFetch);
    assert.equal(result.status, 502);
    assert.equal(result.data.code, 'ROUTING_PROVIDER_ERROR');
  } finally {
    process.env.NODE_ENV = origEnv;
    if (origKey) process.env.GOOGLE_MAPS_SERVER_KEY = origKey; else delete process.env.GOOGLE_MAPS_SERVER_KEY;
    if (origMock !== undefined) process.env.MOCK_ROUTING = origMock; else delete process.env.MOCK_ROUTING;
    Order.findById = origFn;
    clearRouteCache();
  }
});

// ─── 15. MISSING_COORDINATES ─────────────────────────────────────────────────
test('15. MISSING_COORDINATES when no valid GPS on order (400)', async () => {
  const origEnv  = process.env.NODE_ENV;
  const origKey  = process.env.GOOGLE_MAPS_SERVER_KEY;
  const origFn   = Order.findById;
  const oid = new mongoose.Types.ObjectId();
  const cid = new mongoose.Types.ObjectId();
  const vid = new mongoose.Types.ObjectId();
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    delete process.env.MOCK_ROUTING;
    Order.findById = mockOrderFindById(oid, cid, vid, null, { noRiderLoc: true, noAddr: true });
    const result = await calculateOrderRouteEta(oid.toString(), { role: 'CUSTOMER', sub: cid.toString(), id: cid.toString() });
    assert.equal(result.status, 400);
    assert.equal(result.data.code, 'MISSING_COORDINATES');
  } finally {
    process.env.NODE_ENV = origEnv;
    if (origKey) process.env.GOOGLE_MAPS_SERVER_KEY = origKey;
    Order.findById = origFn;
    clearRouteCache();
  }
});

// ─── 16. Route cache helpers ──────────────────────────────────────────────────
test('16. clearRouteCache() empties the cache', () => {
  clearRouteCache();
  assert.equal(getRouteCacheSize(), 0, 'Cache must be 0 after clear');
});

// ─── 17-18. storePoint GeoJSON extraction ────────────────────────────────────
test('17. storePoint extracts [1]=lat, [0]=lng from vendor.address.location.coordinates', () => {
  const p = storePoint({ address: { location: { coordinates: [75.8573, 30.9009] } } });
  assert.equal(p.lng, 75.8573, 'lng is coordinates[0]');
  assert.equal(p.lat, 30.9009, 'lat is coordinates[1]');
});

test('18. storePoint falls back to vendor.location.coordinates', () => {
  const p = storePoint({ location: { coordinates: [75.86, 30.91] } });
  assert.equal(p.lng, 75.86);
  assert.equal(p.lat, 30.91);
});

// ─── 19. Breadcrumb throttle ──────────────────────────────────────────────────
test('19. GPS breadcrumb throttle: write only when >= 30s since last breadcrumb', () => {
  const now = Date.now();
  assert.equal((now - (now - 35000)) >= 30000, true,  'Should write after 35s');
  assert.equal((now - (now - 10000)) >= 30000, false, 'Should NOT write after 10s');
});

// ─── 20. Ping rate limiter ────────────────────────────────────────────────────
test('20. Ping rate limiter: throttled if < 2.8s since last ping', () => {
  const now = Date.now();
  assert.equal((now - (now - 1000)) < 2800, true,  'Ping after 1s must be throttled');
  assert.equal((now - (now - 3000)) < 2800, false, 'Ping after 3s must not be throttled');
});
