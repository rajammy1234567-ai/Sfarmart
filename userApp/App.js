import React, { Component } from 'react';
import { StyleSheet, StatusBar, Platform, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AppProvider, useApp } from './src/context/AppContext';
import { CartProvider } from './src/context/CartContext';
import { SocketProvider } from './src/context/SocketContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme/colors';

// Prevent unhandled promise rejections or native errors from crashing the mobile process
if (typeof global !== 'undefined' && global.ErrorUtils) {
  try {
    const originalHandler = global.ErrorUtils.getGlobalHandler();
    global.ErrorUtils.setGlobalHandler((error, isFatal) => {
      console.warn('⚡ Suppressed global runtime error:', error?.message || error);
      if (originalHandler) {
        originalHandler(error, false);
      }
    });
  } catch (e) {}
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('⚡ Suppressed unhandled Promise rejection:', event.reason);
    event.preventDefault();
  });
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled app error caught by ErrorBoundary:', error, errorInfo);
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorSub}>
            Farmart encountered an issue. Tap below to restart the app cleanly.
          </Text>
          <TouchableOpacity style={styles.restartBtn} onPress={this.handleRestart}>
            <Text style={styles.restartBtnText}>Reload App</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

import { AuthGateProvider } from './src/hooks/useAuthGate';

const linking = {
  prefixes: ['/'],
  config: {
    screens: {
      MainTabs: {
        path: '',
        screens: {
          Home: '',
          Catalog: 'catalog',
          HomeRestro: 'home-restro',
          OrderTracking: 'track',
          ProfileWallet: 'profile'
        }
      },
      Login: 'login',
      Signup: 'signup',
      Cart: 'cart',
      Checkout: 'checkout',
      OrderTracking: 'order-tracking'
    }
  }
};

// Inner container that passes customer auth token and userId to SocketProvider
function UserAppContainer() {
  const { userProfile, token } = useApp();

  return (
    <SocketProvider token={token} userId={userProfile?._id || userProfile?.id}>
      <CartProvider key={userProfile?._id || userProfile?.id || 'guest'}>
        <AuthGateProvider>
          <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.card} />
            <NavigationContainer key={userProfile?._id || userProfile?.id || 'guest'} linking={linking}>
              <RootNavigator />
            </NavigationContainer>
          </View>
        </AuthGateProvider>
      </CartProvider>
    </SocketProvider>
  );
}

import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <AppProvider>
            <UserAppContainer />
          </AppProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' })
  },
  errorScreen: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8
  },
  errorSub: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20
  },
  restartBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12
  },
  restartBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600'
  }
});
