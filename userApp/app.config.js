module.exports = ({ config }) => {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          apiKey
        }
      }
    },
    ios: {
      ...config.ios,
      config: {
        ...config.ios?.config,
        googleMapsApiKey: apiKey
      }
    },
    plugins: [
      ...(config.plugins || []),
      ['expo-location', { locationWhenInUsePermission: 'Allow Farmart to find your delivery address.' }],
      ['react-native-maps', {
        androidGoogleMapsApiKey: apiKey,
        iosGoogleMapsApiKey: apiKey
      }]
    ],
    extra: {
      ...config.extra,
      googleMaps: {
        android: !!apiKey,
        ios: !!apiKey
      }
    }
  };
};
