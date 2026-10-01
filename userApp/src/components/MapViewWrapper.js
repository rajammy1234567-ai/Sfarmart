// Safe wrapper file: platform-specific files MapViewWrapper.native.js and MapViewWrapper.web.js
// are prioritized by Metro. This file ensures any generic fallback never imports react-native-maps.
export * from './MapViewWrapper.web';
export { default } from './MapViewWrapper.web';
