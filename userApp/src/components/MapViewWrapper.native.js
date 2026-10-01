const RnMaps = require('react-native-maps');
const MapView = RnMaps.default || RnMaps.MapView || RnMaps;
const Marker = RnMaps.Marker;
const Polyline = RnMaps.Polyline;
const PROVIDER_GOOGLE = RnMaps.PROVIDER_GOOGLE;
const AnimatedRegion = RnMaps.AnimatedRegion;

let MapViewDirections = null;
try {
  const RnMapsDirections = require('react-native-maps-directions');
  MapViewDirections = RnMapsDirections.default || RnMapsDirections;
} catch {
  MapViewDirections = null;
}

export { MapView, Marker, Polyline, PROVIDER_GOOGLE, MapViewDirections, AnimatedRegion };
export default MapView;
