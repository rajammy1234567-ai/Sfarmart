import { Platform } from 'react-native';
import Constants from 'expo-constants';
import NativeMapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const isExpoGo =
  Constants.executionEnvironment === 'storeClient' ||
  Constants.appOwnership === 'expo';

const mapsConfigured =
  Constants.expoConfig?.extra?.googleMaps?.[Platform.OS] === true;

// Installed Android builds must not mount Google Maps without a key
const canRenderMap =
  Platform.OS !== 'android' || isExpoGo || mapsConfigured;

const MapView = canRenderMap ? NativeMapView : null;

export { MapView, Marker, PROVIDER_GOOGLE };
export default MapView;

