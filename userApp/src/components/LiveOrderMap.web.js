import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GoogleMap from './GoogleMap.web';
import { apiService } from '../services/api';
import { shouldRecalculateRoute, validCoordinates } from '../utils/trackingUtils';

export const LiveOrderMap = ({ order, riderLocation, rider, travelledTrail = [] }) => {
  const [isFollowing, setIsFollowing] = useState(true);
  const [routeInfo, setRouteInfo] = useState(null); // { distanceKm: number, durationMins: number, calculatedAt: number }
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeUnavailableMessage, setRouteUnavailableMessage] = useState('');
  const [nowTs, setNowTs] = useState(Date.now());

  const lastOriginRef = useRef(null);
  const lastCalcTimeRef = useRef(0);
  const isCalculatingRouteRef = useRef(false);

  // Extract coordinates
  const storeCoords = order?.vendor?.address?.location?.coordinates || order?.vendor?.location?.coordinates;
  const storeLat = storeCoords?.[1];
  const storeLng = storeCoords?.[0];

  const destLat = order?.address?.lat;
  const destLng = order?.address?.lng;

  const currentRiderLat = riderLocation?.lat;
  const currentRiderLng = riderLocation?.lng;

  const isOutForDelivery = order?.status === 'OUT_FOR_DELIVERY' || order?.status === 'DELIVERED';

  // 1-second clock for age calculations
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Determine current origin and destination for routing
  // Before pickup: route rider to store; After pickup: route rider to customer
  const routingTarget = useMemo(() => {
    const riderHasCoords = validCoordinates(currentRiderLat, currentRiderLng);
    const storeHasCoords = validCoordinates(storeLat, storeLng);
    const destHasCoords = validCoordinates(destLat, destLng);

    if (riderHasCoords) {
      if (!isOutForDelivery && storeHasCoords) {
        return {
          origin: { lat: currentRiderLat, lng: currentRiderLng },
          destination: { lat: storeLat, lng: storeLng },
          phase: 'TO_STORE'
        };
      }
      if (isOutForDelivery && destHasCoords) {
        return {
          origin: { lat: currentRiderLat, lng: currentRiderLng },
          destination: { lat: destLat, lng: destLng },
          phase: 'TO_CUSTOMER'
        };
      }
    } else if (storeHasCoords && destHasCoords) {
      return {
        origin: { lat: storeLat, lng: storeLng },
        destination: { lat: destLat, lng: destLng },
        phase: 'STORE_TO_CUSTOMER'
      };
    }

    return null;
  }, [currentRiderLat, currentRiderLng, storeLat, storeLng, destLat, destLng, isOutForDelivery]);

  // Bounded Route & ETA Calculation via backend Route & ETA service
  const calculateRoute = useCallback(async () => {
    if (!routingTarget || isCalculatingRouteRef.current || !order?._id) return;

    const { origin, destination } = routingTarget;
    if (!shouldRecalculateRoute(lastOriginRef.current, origin, lastCalcTimeRef.current)) {
      return;
    }

    isCalculatingRouteRef.current = true;
    lastOriginRef.current = origin;
    lastCalcTimeRef.current = Date.now();

    try {
      const res = await apiService.getOrderRouteEta(order._id);
      isCalculatingRouteRef.current = false;

      if (res && res.success) {
        setRouteInfo({
          distanceKm: res.distanceKm,
          durationMins: res.durationMins,
          calculatedAt: Date.now(),
          provider: res.provider || 'BACKEND',
          isStale: Boolean(res.isStale),
          gpsAgeSeconds: res.gpsAgeSeconds ?? null,
          etaStatus: res.etaStatus || 'LIVE',
          travelMode: res.travelMode
        });

        const polylineStr = res.encodedPolyline || res.overviewPolyline;
        if (Array.isArray(res.polyline) && res.polyline.length > 0) {
          setRouteCoordinates(res.polyline);
        } else if (polylineStr && typeof window !== 'undefined' && window.google?.maps?.geometry?.encoding) {
          const decoded = window.google.maps.geometry.encoding.decodePath(polylineStr);
          setRouteCoordinates(decoded.map((pt) => ({ lat: pt.lat(), lng: pt.lng() })));
        } else {
          // Never present a straight line as a road route
          setRouteCoordinates([]);
        }
        setRouteUnavailableMessage('');
      } else if (res && res.code === 'PROVIDER_UNCONFIGURED') {
        setRouteInfo(null);
        setRouteCoordinates([]);
        setRouteUnavailableMessage('Road route & driving ETA unconfigured on server. Set GOOGLE_MAPS_SERVER_KEY.');
      } else {
        setRouteInfo(null);
        setRouteCoordinates([]);
        setRouteUnavailableMessage(res?.message || 'Driving route unavailable.');
      }
    } catch (err) {
      isCalculatingRouteRef.current = false;
      console.warn('[LiveOrderMap.web] Route calculation error:', err);
      setRouteUnavailableMessage('Route service unavailable.');
    }
  }, [routingTarget, order?._id]);

  // Recalculate route whenever routing target changes within bounds
  useEffect(() => {
    calculateRoute();
  }, [calculateRoute]);

  // External Maps Fallback
  const handleOpenExternalMap = () => {
    const targetLat = isOutForDelivery ? destLat : storeLat;
    const targetLng = isOutForDelivery ? destLng : storeLng;
    if (targetLat && targetLng) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${targetLat},${targetLng}`).catch(() => {});
    }
  };

  // Build active points for map
  const points = useMemo(() => {
    const pts = [];
    if (validCoordinates(storeLat, storeLng)) {
      pts.push({
        lat: storeLat,
        lng: storeLng,
        label: 'Store: ' + (order?.vendor?.storeName || 'Merchant Store'),
        id: 'store',
        color: '#ea580c'
      });
    }
    if (validCoordinates(destLat, destLng)) {
      pts.push({
        lat: destLat,
        lng: destLng,
        label: 'Delivery Address',
        id: 'delivery',
        color: '#0284c7'
      });
    }
    if (validCoordinates(currentRiderLat, currentRiderLng)) {
      pts.push({
        lat: currentRiderLat,
        lng: currentRiderLng,
        label: 'Rider: ' + (rider?.name || 'Delivery Partner'),
        id: 'rider',
        color: '#16a34a',
        heading: riderLocation?.heading || 0
      });
    }
    return pts;
  }, [storeLat, storeLng, destLat, destLng, currentRiderLat, currentRiderLng, order?.vendor?.storeName, rider?.name, riderLocation?.heading]);

  // Compute fix age and freshness
  const fixTs = riderLocation?.at ? new Date(riderLocation.at).getTime() : 0;
  const ageSeconds = fixTs ? Math.max(0, Math.floor((nowTs - fixTs) / 1000)) : null;
  const isGpsOffline = ageSeconds === null || ageSeconds >= 60;
  const isGpsStale = ageSeconds !== null && ageSeconds >= 15 && ageSeconds < 60;

  // Route freshness
  const routeAgeSeconds = routeInfo?.calculatedAt ? Math.max(0, Math.floor((nowTs - routeInfo.calculatedAt) / 1000)) : null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={[
              styles.livePulseDot,
              isGpsOffline
                ? { backgroundColor: '#94a3b8' }
                : isGpsStale
                ? { backgroundColor: '#d97706' }
                : { backgroundColor: '#16a34a' }
            ]}
          />
          <Text style={styles.headerTitle}>LIVE DELIVERY RADAR</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Recenter / Follow Button */}
          <TouchableOpacity
            onPress={() => setIsFollowing(true)}
            style={[styles.followBtn, isFollowing && styles.followBtnActive]}
            activeOpacity={0.8}
          >
            <Ionicons name={isFollowing ? 'locate' : 'locate-outline'} size={13} color={isFollowing ? '#ffffff' : '#0284c7'} />
            <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
              {isFollowing ? 'Following' : 'Recenter'}
            </Text>
          </TouchableOpacity>

          {validCoordinates(destLat, destLng) && (
            <TouchableOpacity onPress={handleOpenExternalMap} style={styles.externalLinkBtn}>
              <Ionicons name="map-outline" size={13} color="#0284c7" />
              <Text style={styles.externalLinkText}>Open Maps</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Floating ETA & Driving Distance Banner */}
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
              ? `${routingTarget?.phase === 'TO_STORE' ? 'To Store' : 'To Doorstep'}: ${routeInfo.distanceKm.toFixed(1)} km road route • ~${Math.ceil(routeInfo.durationMins)} mins away ${routeInfo.isStale ? `(Stale GPS: fix ${routeInfo.gpsAgeSeconds ?? '30+'}s ago)` : `(ETA updated ${routeAgeSeconds}s ago)`}`
              : `Store to doorstep: ${routeInfo.distanceKm.toFixed(1)} km • ~${Math.ceil(routeInfo.durationMins)} mins`}
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
      ) : isGpsStale ? (
        <View style={[styles.etaBadge, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
          <Ionicons name="alert-circle" size={14} color="#d97706" />
          <Text style={[styles.etaBadgeText, { color: '#92400e' }]}>
            GPS signal stale • Last fix received {ageSeconds}s ago
          </Text>
        </View>
      ) : (
        <View style={styles.etaBadge}>
          <Ionicons name="navigate" size={14} color="#0284c7" />
          <Text style={styles.etaBadgeText}>
            {currentRiderLat
              ? `Rider GPS Active • ${riderLocation?.speed > 1.5 ? `Moving at ~${Math.round(riderLocation.speed)} km/h` : 'Stationary'}`
              : 'Connecting live delivery route...'}
          </Text>
        </View>
      )}

      {/* Interactive Web Map using GoogleMap.web.js */}
      <View style={styles.mapWrap}>
        <GoogleMap
          points={points}
          routeCoordinates={routeCoordinates}
          travelledTrail={travelledTrail}
          isFollowing={isFollowing}
          onUserPan={() => setIsFollowing(false)}
        />
      </View>

      {/* Development Key Notice (Explains "For development purposes only" watermark transparently) */}
      <Text style={styles.devKeyNote}>
        ℹ️ Map displays in development mode. For production, enable Google Maps JavaScript API with billing on Google Cloud Console.
      </Text>

      {/* Footer Status and Call Rider Action */}
      <View style={styles.footerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Ionicons
            name={currentRiderLat && !isGpsOffline ? 'checkmark-circle' : 'time-outline'}
            size={14}
            color={currentRiderLat && !isGpsOffline ? '#16a34a' : '#f59e0b'}
          />
          <Text style={styles.footerText} numberOfLines={1}>
            {order?.status === 'DELIVERED'
              ? 'Delivered to your doorstep'
              : currentRiderLat
              ? `Rider: ${rider?.name || 'Assigned Rider'} • ${travelledTrail.length} GPS fixes tracked`
              : 'Rider reaching pickup merchant'}
          </Text>
        </View>

        {rider?.phone ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(`tel:${rider.phone}`).catch(() => {})}
            style={styles.callRiderBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="call" size={13} color="#ffffff" />
            <Text style={styles.callRiderText}>Call</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginVertical: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#0f172a'
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a'
  },
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0284c7',
    backgroundColor: '#f0f9ff'
  },
  followBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7'
  },
  followBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7'
  },
  followBtnTextActive: {
    color: '#ffffff'
  },
  externalLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#f0f9ff'
  },
  externalLinkText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284c7'
  },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8
  },
  etaBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803d',
    flex: 1
  },
  mapWrap: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f8fafc'
  },
  devKeyNote: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 6,
    lineHeight: 14
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  footerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155'
  },
  callRiderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284c7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },
  callRiderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff'
  }
});

export default LiveOrderMap;
