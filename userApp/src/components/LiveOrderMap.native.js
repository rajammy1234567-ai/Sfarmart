import React, { useState, useEffect, useRef } from 'react';
import { AnimatedRegion } from 'react-native-maps';
import { Animated } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking
} from 'react-native';
import { MapView, Marker, Polyline, PROVIDER_GOOGLE, MapViewDirections } from './MapViewWrapper';
import { Ionicons } from '@expo/vector-icons';
import { computeBearing } from '../utils/maps';
import {
  shortestAngleDelta,
  isRealisticMovement,
  validCoordinates,
  distanceKm,
  shouldRecalculateRoute
} from '../utils/trackingUtils';
import { apiService } from '../services/api';

export const LiveOrderMap = ({ order, riderLocation, rider, travelledTrail = [] }) => {
  const mapRef = useRef(null);
  const prevLocRef = useRef(null);
  const headingAnim = useRef(new Animated.Value(0)).current;
  const riderRegionRef = useRef(new AnimatedRegion({
    latitude: riderLocation?.lat || 0,
    longitude: riderLocation?.lng || 0,
    latitudeDelta: 0.0001,
    longitudeDelta: 0.0001,
  })).current;
  const [isStale, setIsStale] = useState(false);
  const lastTimestampRef = useRef(null);
  const staleTimerRef = useRef(null);

  const setStaleTimer = (captureTs) => {
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    const now = Date.now();
    const age = captureTs ? now - captureTs : 0;
    const remaining = Math.max(15000 - age, 0);
    staleTimerRef.current = setTimeout(() => setIsStale(true), remaining);
  };

  // Cleanup on unmount / order change - stop any running animations
  useEffect(() => {
    return () => {
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      if (positionAnimRef.current) positionAnimRef.current.stop();
      if (headingAnimRef.current) headingAnimRef.current.stop();
    };
  }, []);

  const [routeInfo, setRouteInfo] = useState(null); // { distance: km, duration: mins }

  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Extract coordinates
  const storeCoords = order?.vendor?.address?.location?.coordinates || order?.vendor?.location?.coordinates;
  const storeLat = storeCoords?.[1];
  const storeLng = storeCoords?.[0];

  const destLat = order?.address?.lat;
  const destLng = order?.address?.lng;

  const currentRiderLat = riderLocation?.lat;
  const currentRiderLng = riderLocation?.lng;

  // Refs for cancelable animations
  const positionAnimRef = useRef(null);
  const headingAnimRef = useRef(null);

  // Update rider position, heading, and stale handling
  useEffect(() => {
    if (!riderLocation) return;
    const { lat, lng, heading: rawHeading, at } = riderLocation;
    if (!validCoordinates(lat, lng) || !at) return;
    // Ignore out-of-order or duplicate timestamps
    const ts = new Date(at).getTime();
    if (lastTimestampRef.current && ts <= lastTimestampRef.current) return;

    // Filter unrealistic jumps (> 130 km/h)
    if (!isRealisticMovement(prevLocRef.current, { lat, lng, at })) {
      console.warn('[LiveOrderMap.native] Ignored unrealistic GPS jump:', lat, lng);
      return;
    }

    lastTimestampRef.current = ts;

    // Stop previous animations if any
    if (positionAnimRef.current) positionAnimRef.current.stop();
    if (headingAnimRef.current) headingAnimRef.current.stop();

    // Avoid stationary jitter: only animate position if moved > 2m
    const dist = prevLocRef.current ? distanceKm(prevLocRef.current, { lat, lng }) : 1;
    if (dist > 0.002) {
      positionAnimRef.current = riderRegionRef.timing({ latitude: lat, longitude: lng, duration: 800, useNativeDriver: false });
      positionAnimRef.current.start();
    } else {
      riderRegionRef.setValue({
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.0001,
        longitudeDelta: 0.0001
      });
    }

    // Compute heading (shortest angle delta across 359/0 boundary)
    let targetHeading = rawHeading ?? 0;
    if (prevLocRef.current && (prevLocRef.current.lat !== lat || prevLocRef.current.lng !== lng)) {
      const bearing = computeBearing(prevLocRef.current, { lat, lng });
      if (!isNaN(bearing)) targetHeading = bearing;
    }

    const current = headingAnim.__getValue ? headingAnim.__getValue() : 0;
    const delta = shortestAngleDelta(current, targetHeading);
    headingAnimRef.current = Animated.timing(headingAnim, { toValue: current + delta, duration: 400, useNativeDriver: false });
    headingAnimRef.current.start();

    prevLocRef.current = { lat, lng, at };
    // Reset stale timer based on capture timestamp
    setIsStale(false);
    setStaleTimer(ts);
  }, [riderLocation]);

  // Determine origin & destination for MapViewDirections based on order phase
  const isOutForDelivery = order?.status === 'OUT_FOR_DELIVERY' || order?.status === 'DELIVERED';
  
  let origin = null;
  let destination = null;

  if (validCoordinates(currentRiderLat, currentRiderLng)) {
    origin = { latitude: currentRiderLat, longitude: currentRiderLng };
    destination = isOutForDelivery && validCoordinates(destLat, destLng)
      ? { latitude: destLat, longitude: destLng }
      : validCoordinates(storeLat, storeLng)
      ? { latitude: storeLat, longitude: storeLng }
      : null;
  } else if (validCoordinates(storeLat, storeLng) && validCoordinates(destLat, destLng)) {
    origin = { latitude: storeLat, longitude: storeLng };
    destination = { latitude: destLat, longitude: destLng };
  }

  // Bounded recalculation for route origin
  const [boundedOrigin, setBoundedOrigin] = useState(null);
  const [backendRoute, setBackendRoute] = useState(null);
  const [routeUnavailableMessage, setRouteUnavailableMessage] = useState('');
  const lastBoundedTimeRef = useRef(0);
  const isFetchingRouteRef = useRef(false);

  useEffect(() => {
    if (!origin) {
      setBoundedOrigin(null);
      return;
    }
    const currentLoc = { lat: origin.latitude, lng: origin.longitude };
    const lastLoc = boundedOrigin ? { lat: boundedOrigin.latitude, lng: boundedOrigin.longitude } : null;
    if (shouldRecalculateRoute(lastLoc, currentLoc, lastBoundedTimeRef.current)) {
      lastBoundedTimeRef.current = Date.now();
      setBoundedOrigin(origin);

      if (order?._id && !isFetchingRouteRef.current) {
        isFetchingRouteRef.current = true;
        apiService.getOrderRouteEta(order._id).then((res) => {
          isFetchingRouteRef.current = false;
          if (res && res.success) {
            setRouteInfo({
              distance: res.distanceKm,
              duration: res.durationMins,
              isStale: Boolean(res.isStale),
              gpsAgeSeconds: res.gpsAgeSeconds ?? null,
              etaStatus: res.etaStatus || 'LIVE'
            });
            if (Array.isArray(res.polyline) && res.polyline.length > 0) {
              setBackendRoute(res.polyline.map((pt) => ({ latitude: pt.lat, longitude: pt.lng })));
            } else {
              setBackendRoute(null);
            }
            setRouteUnavailableMessage('');
          } else if (res && res.code === 'PROVIDER_UNCONFIGURED') {
            setRouteInfo(null);
            setBackendRoute(null);
            setRouteUnavailableMessage('Road route & driving ETA unconfigured on server. Set GOOGLE_MAPS_SERVER_KEY.');
          } else {
            setRouteInfo(null);
            setBackendRoute(null);
            setRouteUnavailableMessage(res?.message || 'Driving route provider unavailable.');
          }
        }).catch(() => {
          isFetchingRouteRef.current = false;
          setRouteInfo(null);
          setBackendRoute(null);
          setRouteUnavailableMessage('Driving route provider unavailable.');
        });
      }
    }
  }, [origin?.latitude, origin?.longitude, order?._id]);

  // Collect active points to fit on map
  const hasFitInitial = useRef(false);
  useEffect(() => {
    if (!mapRef.current || hasFitInitial.current) return;
    const pts = [];
    if (storeLat && storeLng) pts.push({ latitude: storeLat, longitude: storeLng });
    if (destLat && destLng) pts.push({ latitude: destLat, longitude: destLng });
    if (currentRiderLat && currentRiderLng) pts.push({ latitude: currentRiderLat, longitude: currentRiderLng });
    if (pts.length > 0) {
      mapRef.current.fitToCoordinates(pts, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
      hasFitInitial.current = true;
    }
  }, [storeLat, storeLng, destLat, destLng, currentRiderLat, currentRiderLng]);

  // Follow mode state – when true, map auto-recenters on rider updates
  const [isFollowing, setIsFollowing] = React.useState(true);

  // When rider location updates, if follow mode is active, animate map to rider
  useEffect(() => {
    if (isFollowing && mapRef.current && currentRiderLat && currentRiderLng) {
      mapRef.current.animateToRegion({
        latitude: currentRiderLat,
        longitude: currentRiderLng,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 800);
    }
  }, [currentRiderLat, currentRiderLng, isFollowing]);

  // Detect manual map interaction to disable follow mode
  const handleMapPan = () => {
    if (isFollowing) setIsFollowing(false);
  };

  // Open external maps fallback / helper
  const handleOpenExternalMap = () => {
    const targetLat = isOutForDelivery ? destLat : storeLat;
    const targetLng = isOutForDelivery ? destLng : storeLng;
    if (targetLat && targetLng) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${targetLat},${targetLng}`).catch(() => {});
    }
  };

  const initialLat = currentRiderLat || storeLat || destLat || 20.59;
  const initialLng = currentRiderLng || storeLng || destLng || 78.96;

  const straightLineKm = (origin && destination)
    ? distanceKm({ lat: origin.latitude, lng: origin.longitude }, { lat: destination.latitude, lng: destination.longitude })
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={styles.livePulseDot} />
          <Text style={styles.headerTitle}>LIVE DELIVERY RADAR</Text>
        </View>

        {Number.isFinite(destLat) && (
          <TouchableOpacity onPress={handleOpenExternalMap} style={styles.externalLinkBtn}>
            <Ionicons name="map-outline" size={13} color="#0284c7" />
            <Text style={styles.externalLinkText}>Open Maps</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Floating ETA Badge */}
      {routeInfo ? (
        <View style={[styles.etaBadge, routeInfo.isStale && { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
          <Ionicons
            name={routeInfo.isStale ? 'alert-circle' : 'time'}
            size={15}
            color={routeInfo.isStale ? '#d97706' : '#15803d'}
          />
          <Text style={[styles.etaBadgeText, routeInfo.isStale && { color: '#92400e' }]}>
            {order?.status === 'DELIVERED'
              ? 'Order Delivered'
              : currentRiderLat
              ? `Rider is ${routeInfo.distance.toFixed(1)} km away • Arriving in ~${Math.ceil(routeInfo.duration)} mins ${routeInfo.isStale ? `(Stale GPS: ${routeInfo.gpsAgeSeconds ?? '30+'}s ago)` : ''}`
              : `Store to doorstep: ${routeInfo.distance.toFixed(1)} km • ~${Math.ceil(routeInfo.duration)} mins`}
          </Text>
        </View>
      ) : routeUnavailableMessage ? (
        <View style={[styles.etaBadge, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
          <Ionicons name="alert-circle" size={14} color="#d97706" />
          <Text style={[styles.etaBadgeText, { color: '#92400e' }]}>
            {Number.isFinite(straightLineKm)
              ? `Distance: ~${straightLineKm.toFixed(1)} km (straight-line) • Driving road ETA unavailable`
              : routeUnavailableMessage}
          </Text>
        </View>
      ) : isStale ? (
        <View style={styles.etaBadge}>
          <Ionicons name="alert-circle" size={14} color="#d97706" />
          <Text style={styles.etaBadgeText}>GPS signal stale – waiting for update</Text>
        </View>
      ) : (
        <View style={styles.etaBadge}>
          <Ionicons name="navigate" size={14} color="#0284c7" />
          <Text style={styles.etaBadgeText}>
            {currentRiderLat
              ? `Rider GPS Active • ${Math.round(riderLocation?.speed || 0)} km/h`
              : 'Connecting live delivery route...'}
          </Text>
        </View>
      )}

      {/* Map Container */}
      {MapView ? (
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: initialLat,
              longitude: initialLng,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
            showsUserLocation={false}
            showsMyLocationButton={false}
            onPanDrag={handleMapPan}
          >
            {/* Store Marker */}
            {Number.isFinite(storeLat) && Number.isFinite(storeLng) && (
              <Marker
                coordinate={{ latitude: storeLat, longitude: storeLng }}
                title={order?.vendor?.storeName || 'Merchant Store'}
                description="Pickup location"
              >
                <View style={[styles.markerBadge, { backgroundColor: '#ea580c' }]}>
                  <Ionicons name="storefront" size={14} color="#ffffff" />
                </View>
              </Marker>
            )}

            {/* Customer Delivery Pin Marker */}
            {Number.isFinite(destLat) && Number.isFinite(destLng) && (
              <Marker
                coordinate={{ latitude: destLat, longitude: destLng }}
                title="Delivery Address"
                description={order?.address?.line1 || 'Destination'}
              >
                <View style={[styles.markerBadge, { backgroundColor: '#0284c7' }]}>
                  <Ionicons name="home" size={14} color="#ffffff" />
                </View>
              </Marker>
            )}

            {/* Rider Live Marker with Heading Rotation */}
            {Number.isFinite(currentRiderLat) && Number.isFinite(currentRiderLng) && (
              <Marker.Animated
                coordinate={riderRegionRef}
                title={rider?.name || 'Delivery Partner'}
                description={`Speed: ${Math.round(riderLocation?.speed || 0)} km/h`}
                anchor={{ x: 0.5, y: 0.5 }}
                flat={true}
              >
                <Animated.View
                  style={{
                    transform: [
                      {
                        rotate: headingAnim.interpolate({
                          inputRange: [0, 360],
                          outputRange: ['0deg', '360deg'],
                        }),
                      },
                    ],
                  }}
                >
                  <View style={styles.riderMarkerWrap}>
                    <View style={styles.riderIconCircle}>
                      <Ionicons name="navigate" size={16} color="#ffffff" style={{ transform: [{ rotate: '-45deg' }] }} />
                    </View>
                  </View>
                </Animated.View>
              </Marker.Animated>
            )}

            {/* Travelled Breadcrumb Trail from accepted real GPS fixes */}
            {travelledTrail && travelledTrail.length > 1 && Polyline ? (
              <Polyline
                coordinates={travelledTrail
                  .filter((pt) => validCoordinates(pt.lat ?? pt.latitude, pt.lng ?? pt.longitude))
                  .map((pt) => ({
                    latitude: pt.lat ?? pt.latitude,
                    longitude: pt.lng ?? pt.longitude
                  }))}
                strokeColor="#0284c7"
                strokeWidth={4}
              />
            ) : null}

            {/* Server-calculated Driving Route Polyline, or client MapViewDirections fallback */}
            {backendRoute && backendRoute.length > 0 ? (
              <Polyline
                coordinates={backendRoute}
                strokeColor="#16a34a"
                strokeWidth={4}
              />
            ) : boundedOrigin && destination && apiKey && MapViewDirections ? (
              <MapViewDirections
                origin={boundedOrigin}
                destination={destination}
                apikey={apiKey}
                strokeWidth={4}
                strokeColor="#16a34a"
                mode="DRIVING"
                onReady={(result) => {
                  setRouteInfo({ distance: result.distance, duration: result.duration });
                }}
                onError={(errorMessage) => {
                  console.warn('MapViewDirections error:', errorMessage);
                }}
              />
            ) : null}
          </MapView>

          {/* Recenter / Follow rider button */}
          <TouchableOpacity
            onPress={() => {
              setIsFollowing(true);
              if (mapRef.current && currentRiderLat && currentRiderLng) {
                mapRef.current.animateToRegion({
                  latitude: currentRiderLat,
                  longitude: currentRiderLng,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }, 800);
              }
            }}
            style={styles.recenterBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="locate" size={18} color={isFollowing ? '#16a34a' : '#0284c7'} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.mapWrap, { alignItems: 'center', justifyContent: 'center', padding: 16 }]}>
          <Text style={{ color: '#64748b', textAlign: 'center' }}>
            🗺️ Live map preview available in the mobile app
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 6 }}>
            Lat: {initialLat?.toFixed(4) ?? 'N/A'}, Lng: {initialLng?.toFixed(4) ?? 'N/A'}
          </Text>
        </View>
      )}

      <View style={styles.footerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons
            name={currentRiderLat ? 'checkmark-circle' : 'time-outline'}
            size={14}
            color={currentRiderLat ? '#16a34a' : '#f59e0b'}
          />
          <Text style={styles.footerText}>
            {order?.status === 'DELIVERED'
              ? 'Delivered to your doorstep'
              : currentRiderLat
              ? `Rider: ${rider?.name || 'Assigned Rider'} (Live GPS)`
              : 'Rider reaching pickup merchant'}
          </Text>
        </View>

        {rider?.phone ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(`tel:${rider.phone}`).catch(() => {})}
            style={styles.callRiderBtn}
          >
            <Ionicons name="call" size={12} color="#16a34a" />
            <Text style={styles.callRiderText}>Call</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

export default LiveOrderMap;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  headerTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.6,
  },
  externalLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#f0f9ff',
    borderRadius: 6,
  },
  externalLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 10,
  },
  etaBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    flex: 1,
  },
  mapWrap: {
    height: 240,
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  markerBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  riderMarkerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  footerText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  callRiderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  callRiderText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#16a34a',
  },
  recenterBtn: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    zIndex: 10,
  },
});
