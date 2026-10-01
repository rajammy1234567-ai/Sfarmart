import Order from '../models/Order.js';
import { canAccessOrder, validCoordinates, distanceKm } from '../utils/deliveryPolicy.js';

// In-memory bounded route cache: Map<cacheKey, { orderId, riderId, origin, destination, phase, travelMode, result, cachedAt }>
const routeCache = new Map();

// In-flight request coalescing to prevent duplicate simultaneous provider calls
const inFlightRequests = new Map();

/**
 * Clean up expired cache entries older than 5 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of routeCache.entries()) {
    if (now - val.cachedAt > 300000) {
      routeCache.delete(key);
    }
  }
}, 60000).unref();

/**
 * Clear cache helper for unit tests
 */
export function clearRouteCache() {
  routeCache.clear();
  inFlightRequests.clear();
}

/**
 * Inspect cache size helper for unit tests
 */
export function getRouteCacheSize() {
  return routeCache.size;
}

/**
 * Map rider vehicle type to official Google Routes API RouteTravelMode enum:
 * - TWO_WHEELER: motorcycles, scooters, mopeds
 * - BICYCLE: bicycles, cycles
 * - WALK: pedestrians, on foot
 * - DRIVE: cars, vans, autos, 4-wheelers
 */
export function mapVehicleToTravelMode(vehicleType) {
  if (!vehicleType) return 'TWO_WHEELER';
  const norm = String(vehicleType).toUpperCase().trim();
  if (norm === 'BICYCLE' || norm === 'CYCLE') return 'BICYCLE';
  if (norm === 'WALK' || norm === 'ON_FOOT' || norm === 'FOOT') return 'WALK';
  if (norm === 'CAR' || norm === 'VAN' || norm === 'AUTO' || norm === 'DRIVE') return 'DRIVE';
  return 'TWO_WHEELER';
}

/**
 * Determine whether route recalculation is bounded:
 * Recalculate if no cache exists, or rider moved >= 150 meters, or cache is >= 60 seconds old.
 */
function shouldRecalculate(cached, newOrigin) {
  if (!cached || !cached.origin) return true;
  const distKm = distanceKm(cached.origin, newOrigin);
  const ageSec = (Date.now() - cached.cachedAt) / 1000;
  return distKm >= 0.15 || ageSec >= 60;
}

/**
 * Backend-owned authorized Route and ETA service using Google Routes API (computeRoutes).
 * - Enforces order authorization (canAccessOrder)
 * - Phase-aware: pre-pickup (TO_STORE), post-pickup (TO_CUSTOMER), fallback (STORE_TO_CUSTOMER)
 * - Vehicle-aware RouteTravelMode: TWO_WHEELER, BICYCLE, WALK, DRIVE
 * - Traffic awareness: TRAFFIC_AWARE specified only for DRIVE and TWO_WHEELER
 * - Bounded caching (150m / 60s) with invalidation on destination or assigned rider change
 * - In-flight request coalescing for identical routes
 * - Identifies ETA from stale GPS fixes (>= 30s)
 * - Strict timeout (5000ms) with cleanup in finally
 * - Strict restriction of mock responses to automated test environments
 */
export async function calculateOrderRouteEta(orderId, user, customFetch = null) {
  const order = await Order.findById(orderId)
    .populate('vendor', 'storeName phone address location isOpen')
    .populate('customer', 'name phone')
    .populate('rider', 'name phone vehicleType vehicleNumber rating');

  if (!order) {
    return { status: 404, data: { success: false, code: 'ORDER_NOT_FOUND', message: 'Order not found' } };
  }

  if (!canAccessOrder(user, order)) {
    return { status: 403, data: { success: false, code: 'FORBIDDEN', message: 'Unauthorized' } };
  }

  const isPostPickup = order.status === 'OUT_FOR_DELIVERY' || order.status === 'DELIVERED';

  // 1. Resolve store coordinates
  const storeCoords = order.vendor?.address?.location?.coordinates || order.vendor?.location?.coordinates;
  const storeLat = storeCoords?.[1];
  const storeLng = storeCoords?.[0];

  // 2. Resolve customer coordinates
  const custLat = order.address?.lat;
  const custLng = order.address?.lng;

  // 3. Resolve rider coordinates
  const riderLat = order.riderLocation?.lat;
  const riderLng = order.riderLocation?.lng;

  let origin = null;
  let destination = null;
  let phase = null;
  let usingRiderOrigin = false;

  if (validCoordinates(riderLat, riderLng)) {
    origin = { lat: riderLat, lng: riderLng };
    usingRiderOrigin = true;
    if (!isPostPickup && validCoordinates(storeLat, storeLng)) {
      destination = { lat: storeLat, lng: storeLng };
      phase = 'TO_STORE';
    } else if (isPostPickup && validCoordinates(custLat, custLng)) {
      destination = { lat: custLat, lng: custLng };
      phase = 'TO_CUSTOMER';
    }
  } else if (validCoordinates(storeLat, storeLng) && validCoordinates(custLat, custLng)) {
    origin = { lat: storeLat, lng: storeLng };
    destination = { lat: custLat, lng: custLng };
    phase = 'STORE_TO_CUSTOMER';
  }

  if (!origin || !destination) {
    return {
      status: 400,
      data: {
        success: false,
        code: 'MISSING_COORDINATES',
        message: 'Insufficient GPS coordinates to calculate road route.'
      }
    };
  }

  // 4. Stale GPS identification
  let isStale = false;
  let gpsAgeSeconds = null;
  let etaStatus = 'LIVE';

  if (usingRiderOrigin) {
    const fixTs = order.riderLocation?.at ? new Date(order.riderLocation.at).getTime() : 0;
    const now = Date.now();
    const ageMs = fixTs > 0 ? now - fixTs : Infinity;
    gpsAgeSeconds = Number.isFinite(ageMs) && ageMs >= 0 ? Math.floor(ageMs / 1000) : null;

    if (!fixTs || isNaN(ageMs) || ageMs >= 30000) {
      isStale = true;
      etaStatus = 'STALE_GPS';
    } else {
      isStale = false;
      etaStatus = 'LIVE';
    }
  } else {
    etaStatus = 'STATIC_STORE_TO_CUSTOMER';
  }

  // 5. Determine vehicle travel mode
  const riderVehicle = order.rider?.vehicleType || order.rider?.vehicle?.type || null;
  const travelMode = mapVehicleToTravelMode(riderVehicle);

  // 6. Cache Key & Invalidation
  const currentRiderId = order.rider?._id ? String(order.rider._id) : (order.rider ? String(order.rider) : 'UNASSIGNED');
  const destKey = `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`;
  const cacheKey = `${orderId}:${currentRiderId}:${destKey}:${phase}:${travelMode}`;

  // Check if cache exists for this order
  const cached = routeCache.get(cacheKey);

  // If cached entry exists, verify destination and rider haven't changed
  if (cached) {
    const riderChanged = cached.riderId !== currentRiderId;
    const destChanged = distanceKm(cached.destination, destination) > 0.01;
    const phaseChanged = cached.phase !== phase;
    const modeChanged = cached.travelMode !== travelMode;

    if (riderChanged || destChanged || phaseChanged || modeChanged) {
      routeCache.delete(cacheKey);
    } else if (!shouldRecalculate(cached, origin)) {
      const ageSec = Math.max(0, Math.floor((Date.now() - cached.cachedAt) / 1000));
      return {
        status: 200,
        data: {
          success: true,
          cached: true,
          phase,
          travelMode,
          isStale,
          gpsAgeSeconds,
          etaStatus,
          freshnessAgeSeconds: ageSec,
          ...cached.result
        }
      };
    }
  }

  // 7. In-Flight Request Coalescing (Single-Flight Mutex for duplicate requests)
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const computePromise = (async () => {
    // 8. Security & Configuration Gate:
    // Routing mocks are strictly available ONLY when NODE_ENV === 'test'.
    // If MOCK_ROUTING is enabled outside test (e.g. staging or production), fail with a configuration error.
    const isMockRoutingSet = process.env.MOCK_ROUTING === 'true' || process.env.MOCK_ROUTING === '1';

    if (isMockRoutingSet && process.env.NODE_ENV !== 'test') {
      return {
        status: 500,
        data: {
          success: false,
          code: 'MOCK_ROUTING_PROHIBITED',
          message: `MOCK_ROUTING is only permitted when NODE_ENV === 'test'. Found NODE_ENV='${process.env.NODE_ENV || 'development'}' with MOCK_ROUTING enabled.`
        }
      };
    }

    const serverApiKey = process.env.GOOGLE_MAPS_SERVER_KEY;

    // Automated test mock response (ONLY allowed when NODE_ENV === 'test')
    if (process.env.NODE_ENV === 'test' && (isMockRoutingSet || !serverApiKey)) {
      const straightLineKm = distanceKm(origin, destination);
      const mockResult = {
        distanceKm: Number(straightLineKm.toFixed(2)),
        durationMins: Math.max(1, Math.ceil(straightLineKm * 3)),
        encodedPolyline: 'mock_encoded_polyline',
        overviewPolyline: 'mock_encoded_polyline',
        provider: 'MOCKED_TEST_PROVIDER'
      };

      routeCache.set(cacheKey, {
        orderId,
        riderId: currentRiderId,
        origin,
        destination,
        phase,
        travelMode,
        result: mockResult,
        cachedAt: Date.now()
      });

      return {
        status: 200,
        data: {
          success: true,
          cached: false,
          phase,
          travelMode,
          isStale,
          gpsAgeSeconds,
          etaStatus,
          freshnessAgeSeconds: 0,
          ...mockResult
        }
      };
    }

    if (!serverApiKey) {
      return {
        status: 503,
        data: {
          success: false,
          code: 'PROVIDER_UNCONFIGURED',
          message: 'Google Routes API server key is not configured on the backend. Set GOOGLE_MAPS_SERVER_KEY to enable backend road routing and driving ETA.'
        }
      };
    }

    // 9. Execute Google Routes API (computeRoutes) Call
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const requestBody = {
        origin: {
          location: {
            latLng: {
              latitude: origin.lat,
              longitude: origin.lng
            }
          }
        },
        destination: {
          location: {
            latLng: {
              latitude: destination.lat,
              longitude: destination.lng
            }
          }
        },
        travelMode: travelMode
      };

      // routingPreference can ONLY be specified when travelMode is DRIVE or TWO_WHEELER
      if (travelMode === 'DRIVE' || travelMode === 'TWO_WHEELER') {
        requestBody.routingPreference = 'TRAFFIC_AWARE';
      }

      const fetchFn = customFetch || globalThis.fetch;
      const response = await fetchFn('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': serverApiKey,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const sanitizedMsg = errorData?.error?.message || `Provider returned HTTP ${response.status}`;
        return {
          status: response.status >= 500 ? 502 : 422,
          data: {
            success: false,
            code: 'ROUTING_PROVIDER_ERROR',
            message: sanitizedMsg
          }
        };
      }

      const data = await response.json();
      const primaryRoute = data.routes?.[0];

      if (!primaryRoute) {
        return {
          status: 422,
          data: {
            success: false,
            code: 'NO_ROAD_ROUTE_FOUND',
            message: 'Could not find a navigable road route between coordinates.'
          }
        };
      }

      const distanceMeters = primaryRoute.distanceMeters || 0;
      const distanceKmVal = Number((distanceMeters / 1000).toFixed(2));

      // duration is returned as a duration string, e.g. "340s"
      const durationStr = primaryRoute.duration || '0s';
      const durationSec = parseInt(durationStr, 10) || 0;
      const durationMinsVal = Math.max(1, Math.ceil(durationSec / 60));

      const encodedPolyline = primaryRoute.polyline?.encodedPolyline || null;

      const calculatedResult = {
        distanceKm: distanceKmVal,
        durationMins: durationMinsVal,
        encodedPolyline,
        overviewPolyline: encodedPolyline,
        provider: 'GOOGLE_ROUTES_API'
      };

      routeCache.set(cacheKey, {
        orderId,
        riderId: currentRiderId,
        origin,
        destination,
        phase,
        travelMode,
        result: calculatedResult,
        cachedAt: Date.now()
      });

      return {
        status: 200,
        data: {
          success: true,
          cached: false,
          phase,
          travelMode,
          isStale,
          gpsAgeSeconds,
          etaStatus,
          freshnessAgeSeconds: 0,
          ...calculatedResult
        }
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          status: 504,
          data: {
            success: false,
            code: 'ROUTING_PROVIDER_TIMEOUT',
            message: 'Routing provider request timed out after 5000ms.'
          }
        };
      }

      return {
        status: 500,
        data: {
          success: false,
          code: 'ROUTING_SERVICE_ERROR',
          message: 'An internal error occurred while calculating route and ETA.'
        }
      };
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  inFlightRequests.set(cacheKey, computePromise);

  try {
    return await computePromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}
