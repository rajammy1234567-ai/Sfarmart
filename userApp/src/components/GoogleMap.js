// Safe fallback for GoogleMap: platform files GoogleMap.native.js and GoogleMap.web.js
// are prioritized by Metro. This file avoids importing react-native-maps.
export { default } from './GoogleMap.web';
