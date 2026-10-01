import React, { useRef, useEffect, useState } from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import { MapView, Marker, PROVIDER_GOOGLE } from './MapViewWrapper';
import Constants from 'expo-constants';

export default function GoogleMap({ points = [], onSelect, initialCenter, onTilesLoadedChange }) {
  const ref = useRef(null);
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const nativeReady = Boolean(Constants.expoConfig?.extra?.googleMaps?.[Platform.OS]);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [tilesTimedOut, setTilesTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!tilesLoaded) {
        setTilesTimedOut(true);
        if (onTilesLoadedChange) onTilesLoadedChange(false);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [tilesLoaded, onTilesLoadedChange]);

  useEffect(() => {
    if (ref.current && valid.length) {
      ref.current.fitToCoordinates(
        valid.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: { top: 45, right: 45, bottom: 45, left: 45 }, animated: true }
      );
    }
  }, [JSON.stringify(valid)]);

  const handleCoordinatePayload = (e) => {
    if (!onSelect) return;
    const coord = e?.nativeEvent?.coordinate;
    if (
      coord &&
      typeof coord.latitude === 'number' &&
      typeof coord.longitude === 'number' &&
      Number.isFinite(coord.latitude) &&
      Number.isFinite(coord.longitude) &&
      Math.abs(coord.latitude) <= 90 &&
      Math.abs(coord.longitude) <= 180
    ) {
      onSelect({ lat: coord.latitude, lng: coord.longitude });
    }
  };

  const handleMapLoaded = () => {
    setTilesLoaded(true);
    setTilesTimedOut(false);
    if (onTilesLoadedChange) onTilesLoadedChange(true);
  };

  if (!nativeReady || !MapView) {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackTitle}>Map preview unavailable</Text>
        <Text style={styles.fallbackSubtitle}>
          Use 'Use Current Location (GPS)', Address Search, or enter manual coordinates below.
        </Text>
      </View>
    );
  }

  const hasInitialCenter = initialCenter && Number.isFinite(initialCenter.lat) && Number.isFinite(initialCenter.lng);
  const center = valid[0] || (hasInitialCenter ? initialCenter : { lat: 20.59, lng: 78.96 });

  return (
    <View style={styles.mapWrapper}>
      <MapView
        ref={ref}
        provider={PROVIDER_GOOGLE}
        style={{ height: 280, width: '100%' }}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: valid.length ? 0.02 : (hasInitialCenter ? 0.05 : 20),
          longitudeDelta: valid.length ? 0.02 : (hasInitialCenter ? 0.05 : 20)
        }}
        onMapLoaded={handleMapLoaded}
        onPress={handleCoordinatePayload}
      >
        {valid.map((p, i) => (
          <Marker
            key={p.id || i}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.label}
            pinColor={p.color || '#16a34a'}
            draggable={!!onSelect}
            onDragEnd={handleCoordinatePayload}
          />
        ))}
      </MapView>

      {tilesTimedOut && !tilesLoaded && (
        <View style={styles.tileWarningOverlay}>
          <Text style={styles.tileWarningText}>
            ⚠️ Map tiles appear blank or dark. Tap 'Use Current Location (GPS)' or search above.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrapper: {
    height: 280,
    width: '100%',
    position: 'relative'
  },
  fallbackContainer: {
    padding: 18,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160
  },
  fallbackTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4
  },
  fallbackSubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center'
  },
  tileWarningOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  tileWarningText: {
    color: '#fef08a',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center'
  }
});
