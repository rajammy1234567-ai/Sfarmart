import React, { Component } from 'react';
import { StyleSheet, StatusBar, Platform, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { RiderAuthProvider, useRiderAuth } from './src/context/RiderAuthContext';
import { DeliveryProvider } from './src/context/DeliveryContext';
import { DeliveryNavigator } from './src/navigation/DeliveryNavigator';

// Prevent unhandled promise rejections or native errors from crashing the mobile process
if (typeof global !== 'undefined' && global.ErrorUtils) {
  try {
    const originalHandler = global.ErrorUtils.getGlobalHandler();
    global.ErrorUtils.setGlobalHandler((error, isFatal) => {
      console.warn('⚡ Suppressed deliveryApp global runtime error:', error?.message || error);
      if (originalHandler) {
        originalHandler(error, false);
      }
    });
  } catch (e) {}
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('⚡ Suppressed deliveryApp unhandled Promise rejection:', event.reason);
    event.preventDefault();
  });
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('DeliveryApp Error Boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>Delivery Agent Alert</Text>
          <Text style={styles.errorSub}>An unexpected error occurred in Delivery Portal.</Text>
          <TouchableOpacity style={styles.reloadBtn} onPress={() => this.setState({ hasError: false })}>
            <Text style={styles.reloadText}>Reload Duty Screen</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

function RiderSession({ children }) {
  const { rider } = useRiderAuth();
  return <DeliveryProvider key={rider?._id || rider?.id || 'guest'}>{children}</DeliveryProvider>;
}
export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <RiderAuthProvider>
          <RiderSession>
            <View style={styles.container}>
              <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
              <NavigationContainer>
                <DeliveryNavigator />
              </NavigationContainer>
            </View>
          </RiderSession>
        </RiderAuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
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
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8
  },
  errorSub: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20
  },
  reloadBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12
  },
  reloadText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14
  }
});