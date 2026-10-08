import { Platform } from 'react-native';
import Constants from 'expo-constants';
import NativeMapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  AnimatedRegion,
} from 'react-native-maps';

const isExpoGo =
  Constants.executionEnvironment === 'storeClient' ||
  Constants.appOwnership === 'expo';

const mapsConfigured =
  Constants.expoConfig?.extra?.googleMaps?.[Platform.OS] === true;

// Installed Android builds must not mount Google Maps without a key.
const canRenderMap =
  Platform.OS !== 'android' || isExpoGo || mapsConfigured;

const MapView = canRenderMap ? NativeMapView : null;

let MapViewDirections = null;
if (canRenderMap) {
  try {
    const module = require('react-native-maps-directions');
    MapViewDirections = module.default || module;
  } catch {
    MapViewDirections = null;
  }
}

export {
  MapView,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  MapViewDirections,
  AnimatedRegion,
};
export default MapView;