import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validCoordinates,
  distanceKm,
  computeBearing,
  shortestAngleDelta,
  isValidRiderFix,
  isRealisticMovement,
  shouldRecalculateRoute
} from '../trackingUtils.js';

test('1. validCoordinates accepts (0, 0) and rejects non-finite/out-of-bounds', () => {
  assert.equal(validCoordinates(0, 0), true, '(0, 0) must be accepted as valid geographic coordinates');
  assert.equal(validCoordinates(20.5937, 78.9629), true, 'Standard Indian coordinates must be valid');
  assert.equal(validCoordinates(-33.8688, 151.2093), true, 'Southern/eastern coordinates must be valid');
  assert.equal(validCoordinates(NaN, 78.96), false, 'NaN lat must be rejected');
  assert.equal(validCoordinates(20.59, Infinity), false, 'Infinity lng must be rejected');
  assert.equal(validCoordinates(91, 78.96), false, 'Lat > 90 must be rejected');
  assert.equal(validCoordinates(-91, 78.96), false, 'Lat < -90 must be rejected');
  assert.equal(validCoordinates(20.59, 181), false, 'Lng > 180 must be rejected');
  assert.equal(validCoordinates('20.59', '78.96'), false, 'String coordinates must be rejected');
});

test('2. shortestAngleDelta handles 359°/0° boundary without 360° spin', () => {
  // Crossing 0 from 358 to 2 degrees -> should rotate clockwise by +4 degrees
  assert.equal(shortestAngleDelta(358, 2), 4, '358° to 2° delta must be +4°');
  // Crossing 0 from 2 to 358 degrees -> should rotate counter-clockwise by -4 degrees
  assert.equal(shortestAngleDelta(2, 358), -4, '2° to 358° delta must be -4°');
  // Crossing from 5 to 355 degrees -> delta -10
  assert.equal(shortestAngleDelta(5, 355), -10, '5° to 355° delta must be -10°');
  // Crossing from 355 to 5 degrees -> delta +10
  assert.equal(shortestAngleDelta(355, 5), 10, '355° to 5° delta must be +10°');
  // Normal within-quadrant deltas
  assert.equal(shortestAngleDelta(10, 40), 30, '10° to 40° delta must be +30°');
  assert.equal(shortestAngleDelta(40, 10), -30, '40° to 10° delta must be -30°');
  assert.equal(shortestAngleDelta(180, 180), 0, 'Same heading delta must be 0°');
});

test('3. distanceKm and computeBearing calculations', () => {
  const ptA = { lat: 30.9010, lng: 75.8573 };
  const ptB = { lat: 30.9050, lng: 75.8600 };
  const dist = distanceKm(ptA, ptB);
  assert.ok(dist > 0.4 && dist < 0.6, `Distance should be ~0.5 km, got ${dist.toFixed(3)} km`);
  assert.equal(distanceKm(ptA, ptA), 0, 'Distance to self must be 0');
  assert.equal(distanceKm(null, ptB), Infinity, 'Distance with null point must be Infinity');

  const bearing = computeBearing(ptA, ptB);
  assert.ok(bearing >= 0 && bearing <= 360, `Bearing must be within [0, 360], got ${bearing}`);
});

test('4. isValidRiderFix rejects duplicates, out-of-order, unauthorized riders, and mismatches', () => {
  const orderId = '66f000000000000000000001';
  const assignedRiderId = '66f000000000000000000002';
  const mockOrder = {
    _id: orderId,
    rider: { _id: assignedRiderId, name: 'Gurpreet Singh' }
  };
  const baseTime = Date.now() - 10000;

  // Valid fix
  const validFix = {
    orderId,
    riderId: assignedRiderId,
    lat: 30.9010,
    lng: 75.8573,
    at: new Date(baseTime).toISOString()
  };
  assert.equal(isValidRiderFix(validFix, mockOrder, 0), true, 'Valid fix must be accepted');

  // Mismatched order ID
  const wrongOrderFix = { ...validFix, orderId: '66f999999999999999999999' };
  assert.equal(isValidRiderFix(wrongOrderFix, mockOrder, 0), false, 'Mismatched orderId must be rejected');

  // Unauthorized rider ID
  const wrongRiderFix = { ...validFix, riderId: '66f888888888888888888888' };
  assert.equal(isValidRiderFix(wrongRiderFix, mockOrder, 0), false, 'Unauthorized riderId must be rejected');

  // Invalid coordinates
  const badCoordsFix = { ...validFix, lat: NaN };
  assert.equal(isValidRiderFix(badCoordsFix, mockOrder, 0), false, 'NaN coordinates must be rejected');

  // Duplicate timestamp (ts === lastAcceptedTs)
  assert.equal(isValidRiderFix(validFix, mockOrder, baseTime), false, 'Duplicate timestamp must be rejected');

  // Out-of-order timestamp (ts < lastAcceptedTs)
  const olderFix = { ...validFix, at: new Date(baseTime - 5000).toISOString() };
  assert.equal(isValidRiderFix(olderFix, mockOrder, baseTime), false, 'Out-of-order older timestamp must be rejected');

  // Strictly newer timestamp (ts > lastAcceptedTs)
  const newerFix = { ...validFix, at: new Date(baseTime + 2000).toISOString() };
  assert.equal(isValidRiderFix(newerFix, mockOrder, baseTime), true, 'Newer timestamp must be accepted');
});

test('5. isRealisticMovement filters unrealistic sensor jumps', () => {
  const baseTime = Date.now() - 10000;
  const fix1 = { lat: 30.9000, lng: 75.8500, at: new Date(baseTime).toISOString() };
  // Realistic movement: 30 meters in 3 seconds (~36 km/h)
  const fixRealistic = { lat: 30.9002, lng: 75.8502, at: new Date(baseTime + 3000).toISOString() };
  assert.equal(isRealisticMovement(fix1, fixRealistic), true, 'Normal driving speed must be realistic');

  // Unrealistic teleportation: 5 km in 2 seconds (9000 km/h)
  const fixTeleport = { lat: 30.9500, lng: 75.9000, at: new Date(baseTime + 2000).toISOString() };
  assert.equal(isRealisticMovement(fix1, fixTeleport), false, '5km in 2s jump must be rejected as unrealistic');
});

test('6. shouldRecalculateRoute bounded recalculation thresholds', () => {
  const origin1 = { lat: 30.9000, lng: 75.8500 };
  const time1 = Date.now();

  // No movement and fresh cache (10s old) -> false
  assert.equal(shouldRecalculateRoute(origin1, origin1, time1 - 10000), false, 'Unchanged origin within 10s must use cache');

  // Moved 50m (0.05 km) within 20s (< 150m and < 60s) -> false
  const originMinorMove = { lat: 30.9003, lng: 75.8503 };
  assert.equal(shouldRecalculateRoute(origin1, originMinorMove, time1 - 20000), false, 'Move < 150m within 20s must use cache');

  // Moved 250m (0.25 km) within 20s (> 150m) -> true
  const originMajorMove = { lat: 30.9022, lng: 75.8520 };
  assert.equal(shouldRecalculateRoute(origin1, originMajorMove, time1 - 20000), true, 'Move > 150m must trigger recalculation');

  // Expired cache (> 60s old, even if origin hasn\'t changed) -> true
  assert.equal(shouldRecalculateRoute(origin1, origin1, time1 - 65000), true, 'Cache older than 60s must trigger recalculation');
});

test('7. isRealisticMovement recovers after GPS outage (> 45s gap)', () => {
  const baseTime = Date.now() - 60000;
  const fix1 = { lat: 30.9000, lng: 75.8500, at: new Date(baseTime).toISOString() };
  // Rider was at fix1, then had a 50-second outage/tunnel, and emerged 2km away
  const fixAfterOutage = { lat: 30.9180, lng: 75.8650, at: new Date(baseTime + 50000).toISOString() };
  assert.equal(isRealisticMovement(fix1, fixAfterOutage), true, 'Fix after 50s outage must be accepted for tracking recovery');
});

test('8. isRealisticMovement recovers after consecutive rejected bad fixes', () => {
  const baseTime = Date.now() - 10000;
  const fix1 = { lat: 30.9000, lng: 75.8500, at: new Date(baseTime).toISOString() };
  const fixTeleport = { lat: 30.9500, lng: 75.9000, at: new Date(baseTime + 2000).toISOString() };

  // If 1st jump occurs, reject it
  assert.equal(isRealisticMovement(fix1, fixTeleport, 0), false, 'First bad jump must be rejected');
  // If 2nd jump occurs, reject it
  assert.equal(isRealisticMovement(fix1, fixTeleport, 1), false, 'Second bad jump must be rejected');
  // If 3rd jump occurs (consecutiveRejections = 2), reject it
  assert.equal(isRealisticMovement(fix1, fixTeleport, 2), false, 'Third bad jump must be rejected');
  // If 3 consecutive fixes have been rejected (streak = 3), accept to reset baseline and avoid permanent lockout
  assert.equal(isRealisticMovement(fix1, fixTeleport, 3), true, 'Fix with streak >= 3 must be accepted to reset baseline');
});
