// Safe fallback: platform-specific files LiveOrderMap.native.js and LiveOrderMap.web.js
// are prioritized by Metro. This file ensures any generic fallback never imports react-native-maps.
export * from './LiveOrderMap.web';
export { default } from './LiveOrderMap.web';
