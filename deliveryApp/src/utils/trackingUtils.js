/**
 * trackingUtils.js
 * Core telemetry, geometric calculation, and filtering utilities for live rider tracking.
 */

/**
 * Validate that latitude and longitude are valid finite geographic coordinates.
 * Accepts (0, 0) as valid coordinates.
 */
export function validCoordinates(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * Compute Haversine great-circle distance between two points in kilometers.
 */
export function distanceKm(a, b) {
  if (!a || !b || !validCoordinates(a.lat, a.lng) || !validCoordinates(b.lat, b.lng)) {
    return Infinity;
  }
  const rad = (n) => (n * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLng = Math.sin(dLng / 2);
  const h =
    sinHalfLat * sinHalfLat +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * sinHalfLng * sinHalfLng;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Compute bearing from previous point to next point in degrees (0-360 clockwise from north).
 */
export function computeBearing(prev, next) {
  if (!prev || !next || !validCoordinates(prev.lat, prev.lng) || !validCoordinates(next.lat, next.lng)) {
    return 0;
  }
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const lat1 = toRad(prev.lat);
  const lat2 = toRad(next.lat);
  const dLon = toRad(next.lng - prev.lng);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  let brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/**
 * Compute the shortest rotation delta across 359/0 degrees.
 * Returns delta in range [-180, 180].
 * e.g., current = 358°, target = 2° -> delta = +4° (NOT -356°).
 * e.g., current = 5°, target = 355° -> delta = -10° (NOT +350°).
 */
export function shortestAngleDelta(currentAngle, targetAngle) {
  const normCurrent = ((currentAngle % 360) + 360) % 360;
  const normTarget = ((targetAngle % 360) + 360) % 360;
  return ((normTarget - normCurrent + 540) % 360) - 180;
}

/**
 * Validate incoming rider GPS fix:
 * - Must belong to current active order
 * - Must match assigned rider (if rider is assigned)
 * - Must have valid finite coordinates
 * - Must have capture timestamp strictly greater than last accepted timestamp (reject duplicates & out-of-order fixes)
 */
export function isValidRiderFix(fix, activeOrder, lastAcceptedTs) {
  if (!fix || typeof fix !== 'object') return false;
  const { orderId, riderId, lat, lng, at } = fix;

  // 1. Order ID match
  if (!activeOrder?._id || String(orderId) !== String(activeOrder._id)) {
    return false;
  }

  // 2. Filter by assigned rider (if order has rider assigned)
  const assignedRiderId =
    activeOrder.rider?._id ||
    activeOrder.rider?.id ||
    (typeof activeOrder.rider === 'string' ? activeOrder.rider : null);
  if (assignedRiderId && riderId && String(riderId) !== String(assignedRiderId)) {
    console.warn(`[Tracking] Ignored GPS fix from unauthorized rider ${riderId} (assigned: ${assignedRiderId})`);
    return false;
  }

  // 3. Valid coordinates
  if (!validCoordinates(lat, lng)) {
    return false;
  }

  // 4. Capture timestamp validation: reject duplicates and out-of-order fixes
  if (!at) return false;
  const ts = new Date(at).getTime();
  if (!Number.isFinite(ts)) return false;
  if (Number.isFinite(lastAcceptedTs) && ts <= lastAcceptedTs) {
    return false;
  }

  return true;
}

/**
 * Verify whether movement between two consecutive fixes is physically realistic.
 * Filters out unrealistic GPS teleportation / sensor jumps (> 130 km/h for urban delivery),
 * while supporting outage recovery (> 45s gap) and outlier recovery (>= 3 consecutive rejections)
 * so tracking never enters a permanent rejection lockout.
 */
export function isRealisticMovement(prevFix, newFix, consecutiveRejections = 0) {
  if (!prevFix || !validCoordinates(prevFix.lat, prevFix.lng)) return true;
  const dist = distanceKm(prevFix, newFix);
  const prevTs = new Date(prevFix.at).getTime();
  const newTs = new Date(newFix.at).getTime();
  const timeSec = (newTs - prevTs) / 1000;

  if (timeSec <= 0) return false;

  // 1. GPS Outage Recovery: If more than 45 seconds have passed since previous fix,
  // allow recovery as rider may have travelled during the outage/tunnel.
  if (timeSec >= 45) {
    return true;
  }

  // 2. Bad Fix / Outlier Recovery: If 3 or more consecutive fixes were rejected,
  // reset baseline to recover rather than permanently locking out live updates.
  if (consecutiveRejections >= 3) {
    return true;
  }

  const speedKmh = (dist / timeSec) * 3600;

  // If distance > 300m and speed > 130 km/h, flag as unrealistic jump
  if (dist > 0.3 && speedKmh > 130) {
    console.warn(`[Tracking] Unrealistic GPS jump: ${dist.toFixed(2)} km in ${timeSec.toFixed(1)}s (${speedKmh.toFixed(0)} km/h)`);
    return false;
  }
  return true;
}

/**
 * Determine whether routing / ETA calculation should be recalculated:
 * Bounded calculation: only if no cached route, or rider moved > 150m, or cache is > 60s old.
 */
export function shouldRecalculateRoute(lastOrigin, currentRiderLoc, lastCalculatedAt) {
  if (!lastOrigin || !currentRiderLoc || !lastCalculatedAt) return true;
  const dist = distanceKm(lastOrigin, currentRiderLoc);
  const ageSec = (Date.now() - lastCalculatedAt) / 1000;
  return dist >= 0.15 || ageSec >= 60;
}
