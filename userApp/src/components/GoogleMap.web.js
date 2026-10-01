import React, { useEffect, useRef, useState, useCallback } from 'react';
import { shortestAngleDelta, distanceKm, validCoordinates } from '../utils/trackingUtils';

let mapsPromise = null;

function loadMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window unavailable'));
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (mapsPromise) return mapsPromise;

  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return Promise.reject(
      new Error('Google Maps API key is not configured. Set EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY.')
    );
  }

  mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('Google Maps script load timed out.')), 15000);
    window.farmartMapsReady = () => {
      clearTimeout(timer);
      resolve(window.google.maps);
    };
    script.src =
      'https://maps.googleapis.com/maps/api/js?key=' +
      encodeURIComponent(key) +
      '&libraries=geometry&loading=async&callback=farmartMapsReady&v=weekly';
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Failed to load Google Maps script. Check key and network.'));
    };
    document.head.appendChild(script);
  });

  return mapsPromise;
}

export default function GoogleMap({
  points = [],
  routeCoordinates = [],
  travelledTrail = [],
  isFollowing = true,
  onUserPan,
  onSelect,
  initialCenter,
  style
}) {
  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  // Persistent marker instances keyed by point id
  const markersRef = useRef(new Map());

  // Animation and state refs for rider marker interpolation
  const riderDisplayPosRef = useRef(null);
  const riderDisplayHeadingRef = useRef(0);
  const riderAnimFrameRef = useRef(null);
  const hasFitInitialRef = useRef(false);

  // Polylines
  const routePolylineRef = useRef(null);
  const trailPolylineRef = useRef(null);

  // Initialize Map
  useEffect(() => {
    let cancelled = false;
    let dragListener = null;
    let clickListener = null;

    loadMaps()
      .then((maps) => {
        if (cancelled || !elementRef.current) return;

        const hasInitialCenter = initialCenter && Number.isFinite(initialCenter.lat) && Number.isFinite(initialCenter.lng);
        const centerCoord = points[0] || (hasInitialCenter ? initialCenter : { lat: 20.59, lng: 78.96 });

        const map = new maps.Map(elementRef.current, {
          center: centerCoord,
          zoom: points.length ? 15 : (hasInitialCenter ? 14 : 5),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: 'greedy'
        });

        mapRef.current = map;

        // Detect user manual interaction to notify parent to release follow lock
        dragListener = map.addListener('dragstart', () => {
          if (onUserPan) onUserPan();
        });

        if (onSelect) {
          clickListener = map.addListener('click', (e) => {
            onSelect({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          });
        }

        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
      if (dragListener) dragListener.remove();
      if (clickListener) clickListener.remove();
      if (riderAnimFrameRef.current) cancelAnimationFrame(riderAnimFrameRef.current);
    };
  }, []);

  // Animate rider marker position and heading smoothly
  const animateRiderMarker = useCallback((marker, startPos, targetPos, startHeading, targetHeading, durationMs = 800) => {
    if (riderAnimFrameRef.current) {
      cancelAnimationFrame(riderAnimFrameRef.current);
      riderAnimFrameRef.current = null;
    }

    const startTime = performance.now();
    const headingDelta = shortestAngleDelta(startHeading, targetHeading);

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);

      const curLat = startPos.lat + (targetPos.lat - startPos.lat) * ease;
      const curLng = startPos.lng + (targetPos.lng - startPos.lng) * ease;
      const curHeading = (startHeading + headingDelta * ease + 360) % 360;

      riderDisplayPosRef.current = { lat: curLat, lng: curLng };
      riderDisplayHeadingRef.current = curHeading;

      marker.setPosition({ lat: curLat, lng: curLng });

      // Update rider SVG icon with rotated heading
      const maps = window.google?.maps;
      if (maps) {
        marker.setIcon({
          path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 5,
          fillColor: '#16a34a',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          rotation: Math.round(curHeading)
        });
      }

      if (progress < 1) {
        riderAnimFrameRef.current = requestAnimationFrame(step);
      } else {
        riderAnimFrameRef.current = null;
      }
    };

    riderAnimFrameRef.current = requestAnimationFrame(step);
  }, []);

  // Synchronize Markers
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const maps = window.google.maps;
    const currentMap = mapRef.current;
    const activeIds = new Set();

    points.forEach((p, idx) => {
      if (!validCoordinates(p.lat, p.lng)) return;
      const id = p.id || `point-${idx}`;
      activeIds.add(id);

      const targetPos = { lat: p.lat, lng: p.lng };

      if (markersRef.current.has(id)) {
        const marker = markersRef.current.get(id);

        if (id === 'rider') {
          const prevDisplay = riderDisplayPosRef.current || targetPos;
          const dist = distanceKm(prevDisplay, targetPos);

          // Avoid stationary jitter: only animate if moved > 2m
          if (dist > 0.002) {
            const startHeading = riderDisplayHeadingRef.current || 0;
            const targetHeading = p.heading || 0;
            animateRiderMarker(marker, prevDisplay, targetPos, startHeading, targetHeading, 800);
          } else {
            marker.setPosition(targetPos);
          }

          // Follow rider camera
          if (isFollowing) {
            currentMap.panTo(targetPos);
          }
        } else {
          marker.setPosition(targetPos);
        }
      } else {
        // Create new marker
        let icon = null;
        if (id === 'rider') {
          icon = {
            path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 5,
            fillColor: '#16a34a',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            rotation: p.heading || 0
          };
          riderDisplayPosRef.current = targetPos;
          riderDisplayHeadingRef.current = p.heading || 0;
        } else if (id === 'store') {
          icon = {
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
            fillColor: '#ea580c',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
            scale: 1.4,
            anchor: new maps.Point(12, 22)
          };
        } else if (id === 'delivery') {
          icon = {
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
            fillColor: '#0284c7',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
            scale: 1.4,
            anchor: new maps.Point(12, 22)
          };
        }

        const marker = new maps.Marker({
          map: currentMap,
          position: targetPos,
          title: p.label,
          icon: icon || undefined
        });

        markersRef.current.set(id, marker);
      }
    });

    // Remove markers that are no longer in points
    for (const [id, marker] of markersRef.current.entries()) {
      if (!activeIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    }

    // Initial fit bounds only once on startup
    if (!hasFitInitialRef.current && points.length > 0) {
      const valid = points.filter((p) => validCoordinates(p.lat, p.lng));
      if (valid.length === 1) {
        currentMap.setCenter({ lat: valid[0].lat, lng: valid[0].lng });
        currentMap.setZoom(16);
        hasFitInitialRef.current = true;
      } else if (valid.length > 1) {
        const bounds = new maps.LatLngBounds();
        valid.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
        currentMap.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
        hasFitInitialRef.current = true;
      }
    }
  }, [ready, points, isFollowing, animateRiderMarker]);

  // Synchronize Travelled Trail Polyline
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const maps = window.google.maps;

    if (travelledTrail.length > 1) {
      const path = travelledTrail.filter((pt) => validCoordinates(pt.lat, pt.lng)).map((pt) => ({ lat: pt.lat, lng: pt.lng }));

      if (!trailPolylineRef.current) {
        trailPolylineRef.current = new maps.Polyline({
          map: mapRef.current,
          path,
          strokeColor: '#0284c7',
          strokeOpacity: 0.7,
          strokeWeight: 4
        });
      } else {
        trailPolylineRef.current.setPath(path);
      }
    } else if (trailPolylineRef.current) {
      trailPolylineRef.current.setPath([]);
    }
  }, [ready, travelledTrail]);

  // Synchronize Remaining Road Route Polyline
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const maps = window.google.maps;

    if (routeCoordinates.length > 1) {
      const path = routeCoordinates.filter((pt) => validCoordinates(pt.lat, pt.lng)).map((pt) => ({ lat: pt.lat, lng: pt.lng }));

      if (!routePolylineRef.current) {
        routePolylineRef.current = new maps.Polyline({
          map: mapRef.current,
          path,
          strokeColor: '#10b981',
          strokeOpacity: 0.85,
          strokeWeight: 5
        });
      } else {
        routePolylineRef.current.setPath(path);
      }
    } else if (routePolylineRef.current) {
      routePolylineRef.current.setPath([]);
    }
  }, [ready, routeCoordinates]);

  return (
    <div style={{ width: '100%', position: 'relative', ...style }}>
      {error && (
        <div role="status" style={{ padding: 12, color: '#dc2626', backgroundColor: '#fef2f2', borderRadius: 8, fontSize: 13, marginBottom: 8 }}>
          {error}
        </div>
      )}
      <div
        ref={elementRef}
        aria-label="Interactive Google Delivery Radar"
        style={{
          height: error ? 0 : 300,
          width: '100%',
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: '#e2e8f0'
        }}
      />
    </div>
  );
}
