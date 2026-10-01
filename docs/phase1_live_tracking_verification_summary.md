# Phase 1 Live Delivery Tracking: Verification & Implementation Record

**Conversation ID**: `b3ab2aa6-fb23-4903-bdf0-f3fac82aedfe`  
**Date**: October 1, 2026  
**Status**: Phase 1 Requirements Implemented & Verified with Focused Checks

---

## 1. Executive Summary

This session verified and finalized the Phase 1 live delivery tracking implementation across the `userApp` (Web and Android), `deliveryApp` (Android), and `partnerApp` (Web) backed by the Node.js / Express / Socket.io server.

All 5 core verification requirements were resolved with concrete code implementations, unit tests, and live diagnostics:
1. **Authorized Location Snapshot Endpoint & Event**: Implemented `GET /api/orders/:id/location` with strict ownership checks, updated `join:order` socket room join to acknowledge with the snapshot, and wired customer reconnect to restore tracking immediately.
2. **Backend Route & ETA Service (Google Routes API computeRoutes)**: Updated `server/services/routingService.js` to integrate directly with `https://routes.googleapis.com/directions/v2:computeRoutes`. Fixed the legacy Directions bug (where motorcycles were routed as bicycles) by using official RouteTravelMode enums (`TWO_WHEELER` for motorcycles/scooters, `BICYCLE` for cycles, `WALK` for on-foot, and `DRIVE` for cars). Restricts `routingPreference: 'TRAFFIC_AWARE'` strictly to `DRIVE` and `TWO_WHEELER`. Enforces backend `GOOGLE_MAPS_SERVER_KEY`, in-flight request coalescing, cache invalidation on destination or rider change, and stale GPS detection.
3. **Truly Single-Flight Token Refresh**: Replaced competing refresh mechanisms with shared in-flight Promise mutexes in `userApp` (`refreshAuthToken`) and `deliveryApp` (`refreshRiderAuthToken`), preventing double-use of refresh tokens across simultaneous REST 401s and socket disconnects. Prevented partner socket from looping on `io server disconnect`.
4. **Motion Filtering Outage & Streak Recovery**: Enhanced `isRealisticMovement` with a 45-second outage threshold and a 3-consecutive-rejection outlier recovery rule, eliminating permanent tracking lockouts after tunnels or bad fixes.
5. **Exact Google Maps Console Error Identified**: Diagnosed via Chrome DevTools Protocol on headless Edge: `Google Maps JavaScript API error: BillingNotEnabledMapError`. Detailed required Cloud APIs and key restriction profiles.

---

## 2. Implemented Code Locations

### Backend
- **Location Snapshot Endpoint**:
  - Controller: [`getOrderLocation`](file:///c:/viz/all%20app/farmart/farm-mart-/server/controllers/orderController.js#L635-L675) in [server/controllers/orderController.js](file:///c:/viz/all%20app/farmart/farm-mart-/server/controllers/orderController.js)
  - Route: `GET /api/orders/:id/location` in [server/routes/orderRoutes.js](file:///c:/viz/all%20app/farmart/farm-mart-/server/routes/orderRoutes.js#L28)
- **Backend Route & ETA Service**:
  - Service: [`calculateOrderRouteEta`](file:///c:/viz/all%20app/farmart/farm-mart-/server/services/routingService.js#L35-L246) in [server/services/routingService.js](file:///c:/viz/all%20app/farmart/farm-mart-/server/services/routingService.js)
  - Controller: [`getOrderRouteEta`](file:///c:/viz/all%20app/farmart/farm-mart-/server/controllers/orderController.js#L677-L693) in [server/controllers/orderController.js](file:///c:/viz/all%20app/farmart/farm-mart-/server/controllers/orderController.js)
  - Route: `GET /api/orders/:id/route-eta` in [server/routes/orderRoutes.js](file:///c:/viz/all%20app/farmart/farm-mart-/server/routes/orderRoutes.js#L29)
- **Socket Snapshot on Room Join**:
  - Event: `join:order` in [server/socket/index.js](file:///c:/viz/all%20app/farmart/farm-mart-/server/socket/index.js#L27-L52) acknowledges with `{ ok: true, snapshot: { ... } }`

### User App (`userApp`)
- **Single-Flight Refresh Mutex & API Endpoints**:
  - [`refreshAuthToken`](file:///c:/viz/all%20app/farmart/farm-mart-/userApp/src/services/api.js#L37-L80) in [userApp/src/services/api.js](file:///c:/viz/all%20app/farmart/farm-mart-/userApp/src/services/api.js)
  - Methods: `getOrderLocation(id)`, `getOrderRouteEta(id)`
- **Socket Disconnect & Snapshot Ack**:
  - [userApp/src/context/SocketContext.js](file:///c:/viz/all%20app/farmart/farm-mart-/userApp/src/context/SocketContext.js#L51-L78)
- **Customer Tracking Screen**:
  - Reconnect snapshot fetching & streak recovery in [userApp/src/screens/Customer/OrderTrackingScreen.js](file:///c:/viz/all%20app/farmart/farm-mart-/userApp/src/screens/Customer/OrderTrackingScreen.js#L140-L215)
- **Map Backend Route Integration**:
  - Web: [userApp/src/components/LiveOrderMap.web.js](file:///c:/viz/all%20app/farmart/farm-mart-/userApp/src/components/LiveOrderMap.web.js#L78-L125)
  - Native: [userApp/src/components/LiveOrderMap.native.js](file:///c:/viz/all%20app/farmart/farm-mart-/userApp/src/components/LiveOrderMap.native.js#L150-L175)
- **Tracking Motion Filtering**:
  - [userApp/src/utils/trackingUtils.js](file:///c:/viz/all%20app/farmart/farm-mart-/userApp/src/utils/trackingUtils.js#L115-L148)

### Delivery App (`deliveryApp`)
- **Single-Flight Rider Refresh Mutex**:
  - [`refreshRiderAuthToken`](file:///c:/viz/all%20app/farmart/farm-mart-/deliveryApp/src/services/api.js#L71-L108) in [deliveryApp/src/services/api.js](file:///c:/viz/all%20app/farmart/farm-mart-/deliveryApp/src/services/api.js)
- **Socket Disconnect Fresh Token Reconnect**:
  - [deliveryApp/src/services/socket.js](file:///c:/viz/all%20app/farmart/farm-mart-/deliveryApp/src/services/socket.js#L86-L102)
- **Rider Motion Filtering**:
  - [deliveryApp/src/utils/trackingUtils.js](file:///c:/viz/all%20app/farmart/farm-mart-/deliveryApp/src/utils/trackingUtils.js#L115-L148)

### Partner App (`partnerApp`)
- **Server Disconnect Safeguard**:
  - [partnerApp/src/context/SocketContext.js](file:///c:/viz/all%20app/farmart/farm-mart-/partnerApp/src/context/SocketContext.js#L75-L85)

---

## 3. Verification Test Suite & Results

### A. Tracking Utilities Unit Tests (`trackingUtils.test.mjs`)
Command: `node userApp/src/utils/__tests__/trackingUtils.test.mjs`  
Result: **8/8 Passed (Code 0)**
- Test 1: `validCoordinates` accepts `(0, 0)` and rejects invalid/NaN coordinates.
- Test 2: `shortestAngleDelta` handles 359°/0° boundary without 360° spinning.
- Test 3: `distanceKm` and `computeBearing` verified.
- Test 4: `isValidRiderFix` rejects duplicates, out-of-order timestamps, and mismatched riders.
- Test 5: `isRealisticMovement` filters unrealistic jumps (> 130 km/h).
- Test 6: `shouldRecalculateRoute` bounded recalculation (150m / 60s).
- Test 7: GPS outage recovery (> 45s gap accepted for tracking recovery).
- Test 8: Bad fix streak recovery (>= 3 consecutive rejections reset baseline).

### B. Routing Service & Snapshot Unit Tests (`test_routing_and_snapshot_unit.mjs`)
Command: `node scratch/test_routing_and_snapshot_unit.mjs`  
Result: **All Checks Passed (Code 0)**
- Protected routes `GET /api/orders/:id/location` and `GET /api/orders/:id/route-eta` return HTTP 401 without auth token.
- Non-existent order returns HTTP 404.
- Unauthorized user returns HTTP 403.
- Unconfigured server key returns HTTP 503 `PROVIDER_UNCONFIGURED` without fabricating route/ETA.
- Mocked routing (`MOCK_ROUTING=true`) returns 200 with distance (1.47 km), duration (5 mins), and phase (`TO_CUSTOMER`).
- Immediate subsequent call verified in-memory route cache (`cached: true`).

### C. Comprehensive Google Routes API Unit Tests (`test_routing_service_comprehensive.mjs`)
Command: `node scratch/test_routing_service_comprehensive.mjs`  
Result: **10/10 Checks Passed (Code 0)**
- **Test 1**: Vehicle type to RouteTravelMode enum mapping (`TWO_WHEELER`, `BICYCLE`, `WALK`, `DRIVE`).
- **Test 2**: Google Routes API `computeRoutes` request structure, field mask (`routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline`), and backend headers.
- **Test 3**: `routingPreference: 'TRAFFIC_AWARE'` properly omitted for `BICYCLE` and `WALK`, and included for `TWO_WHEELER` and `DRIVE`.
- **Test 4**: Invalidate cache when destination changes (e.g. customer updates address).
- **Test 5**: Invalidate cache when assigned rider changes.
- **Test 6**: Coalesce concurrent requests for the same route into 1 provider call (single-flight mutex).
- **Test 7**: Stale GPS identification (`isStale: true`, `etaStatus: 'STALE_GPS'` for fixes $\ge 30$s).
- **Test 8**: Strict restriction of mock responses (HTTP 503 `PROVIDER_UNCONFIGURED` in live/production).
- **Test 9**: Timeout handling (5000ms `AbortController` timeout returns HTTP 504 `ROUTING_PROVIDER_TIMEOUT`).
- **Test 10**: Provider error sanitization (no key leaks or raw stack traces).

### D. Single-Flight Refresh Mutex Test (`test_single_flight_refresh.mjs`)
Command: `node scratch/test_single_flight_refresh.mjs`  
Result: **Verified (Code 0)**
- 3 simultaneous REST 401 calls and 1 Socket disconnect executed concurrently.
- Exactly 1 network request made to `/auth/refresh`; all 4 callers received the identical fresh token.

### E. Full Bundle Compilation Checks
- **UserApp Web Bundle**: `http://localhost:8084/index.bundle?platform=web&dev=true` -> **HTTP 200 OK**
- **UserApp Android Bundle**: `http://localhost:8081/index.bundle?platform=android&dev=true` -> **HTTP 200 OK**
- **DeliveryApp Android Bundle**: `http://localhost:8083/index.bundle?platform=android&dev=true` -> **HTTP 200 OK**

---

## 4. Google Maps Watermark Diagnosis & Required Setup

- **Exact Error Code**: `BillingNotEnabledMapError`
- **Documentation Link**: `https://developers.google.com/maps/documentation/javascript/error-messages#billing-not-enabled-map-error`
- **Root Cause**: An active Google Cloud Billing account is not linked to the project for the configured key.
- **Required APIs**:
  1. Maps JavaScript API (Web map)
  2. Directions API (Backend route & ETA)
  3. Geocoding API (Address geocoding)
  4. Places API (New) (Search)
  5. Maps SDK for Android (Native app maps)
- **Key Restrictions**:
  - `GOOGLE_MAPS_SERVER_KEY`: IP-restricted to backend servers, restricted to Directions & Geocoding APIs.
  - `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY`: HTTP Referrer-restricted to domain/localhost, restricted to Maps JavaScript API.
  - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`: Android package name + SHA-1 restricted to Maps SDK for Android.
