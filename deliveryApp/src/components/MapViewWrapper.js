import { Platform, View, Text } from 'react-native';
import React from 'react';

let MapView = null;
let Marker = null;
let Polyline = null;
let PROVIDER_GOOGLE = null;
let MapViewDirections = null;

if (Platform.OS !== 'web') {
  const RnMaps = require('react-native-maps');
  MapView = RnMaps.default || RnMaps.MapView || RnMaps;
  Marker = RnMaps.Marker;
  Polyline = RnMaps.Polyline;
  PROVIDER_GOOGLE = RnMaps.PROVIDER_GOOGLE;
  try {
    const RnMapsDirections = require('react-native-maps-directions');
    MapViewDirections = RnMapsDirections.default || RnMapsDirections;
  } catch (e) {
    MapViewDirections = null;
  }
} else {
  // Web fallback — these are no-ops so JSX doesn't crash
  const Dummy = () => null;
  Marker = Dummy;
  Polyline = Dummy;
  PROVIDER_GOOGLE = 'google';
  MapViewDirections = Dummy;
  // MapView stays null on web — consumers must check Platform.OS before rendering
}

export { MapView, Marker, Polyline, PROVIDER_GOOGLE, MapViewDirections };
