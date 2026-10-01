import MapView, { Marker, Polyline, PROVIDER_GOOGLE, AnimatedRegion } from 'react-native-maps';

let MapViewDirections = null;
try {
  const RnMapsDirections = require('react-native-maps-directions');
  MapViewDirections = RnMapsDirections.default || RnMapsDirections;
} catch {
  MapViewDirections = null;
}

export { MapView, Marker, Polyline, PROVIDER_GOOGLE, MapViewDirections, AnimatedRegion };
export default MapView;
