module.exports = ({ config }) => {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  return {
    ...config,
    icon: './assets/delivery-icon.png',
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
      ['expo-splash-screen', {
  image: './assets/delivery-icon.png',
  imageWidth: 200,
  resizeMode: 'contain',
  backgroundColor: '#ffffff',
  dark: {
    image: './assets/delivery-icon.png',
    backgroundColor: '#ffffff'
  }
}],
      ['react-native-maps', {
        androidGoogleMapsApiKey: apiKey,
        iosGoogleMapsApiKey: apiKey
      }]
    ],
    extra: {
      ...config.extra,
      eas: {
        projectId: "0ffe353f-1525-4796-afa4-071da4cbbc71"
      },
      googleMaps: {
        android: !!apiKey,
        ios: !!apiKey
      }
    }
  };
};
