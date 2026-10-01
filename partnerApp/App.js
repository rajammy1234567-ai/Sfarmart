import React, { Component } from 'react';
import { StyleSheet, StatusBar, Platform, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { PartnerProvider, usePartner } from './src/context/PartnerContext';
import { SocketProvider, useSocket } from './src/context/SocketContext';
import { NewOrderModal } from './src/components/NewOrderModal';
import { PartnerNavigator } from './src/navigation/PartnerNavigator';
import { PartnerLoginScreen } from './src/screens/PartnerLoginScreen';
import { soundAlert } from './src/utils/soundAlert';
import { colors } from './src/theme/colors';

// Prevent unhandled promise rejections or native errors from crashing the mobile process
if (typeof global !== 'undefined' && global.ErrorUtils) {
  try {
    const originalHandler = global.ErrorUtils.getGlobalHandler();
    global.ErrorUtils.setGlobalHandler((error, _isFatal) => {
      console.warn('⚡ Suppressed partnerApp global error:', error?.message || error);
      if (originalHandler) {
        originalHandler(error, false);
      }
    });
  } catch {}
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('⚡ Suppressed partnerApp unhandled Promise rejection:', event.reason);
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
    console.error('PartnerApp Error Boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>Partner Hub Alert</Text>
          <Text style={styles.errorSub}>An unexpected error occurred in Partner Portal.</Text>
          <TouchableOpacity style={styles.reloadBtn} onPress={() => this.setState({ hasError: false })}>
            <Text style={styles.reloadText}>Reload Dashboard</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// Inner container that connects Socket and Context
function PartnerMain() {
  const { vendor, token, fetchOrders } = usePartner();

  return (
    <SocketProvider key={vendor?._id || 'guest'} vendor={vendor} token={token} onOrderReceived={() => fetchOrders(vendor?._id)}>
      <PartnerContent />
    </SocketProvider>
  );
}

function PartnerContent() {
  const { vendor, token, orders, isLoading } = usePartner();
  const { pendingOrder, setPendingOrder, acceptOrder, rejectOrder, dismissPendingOrder, connectionMode } = useSocket();
  const notifiedOrderIdsRef = React.useRef(new Set());

  // Dual-Safety: Ensure newly arrived NEW_ORDER from either WebSocket OR fast polling triggers modal + ring + vibration
  React.useEffect(() => {
    if (!orders || orders.length === 0 || pendingOrder) return;
    const newUnaccepted = orders.find(
      (o) => o.status === 'NEW_ORDER' && !notifiedOrderIdsRef.current.has(o._id || o.id)
    );
    if (newUnaccepted) {
      const orderId = newUnaccepted._id || newUnaccepted.id;
      notifiedOrderIdsRef.current.add(orderId);
      console.log('🔔 [Partner Notification] Live order arrived for store:', newUnaccepted.orderNumber || orderId);
      setPendingOrder(newUnaccepted);
      soundAlert.start();
    }
  }, [orders, pendingOrder, setPendingOrder]);

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!vendor || !token) {
    return <PartnerLoginScreen />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.card} />
      <NavigationContainer>
        <PartnerNavigator connectionMode={connectionMode} />
      </NavigationContainer>

      {/* Global Real-Time New Order Pop-up with Looping Audio Alert & Vibration */}
      {pendingOrder && (
        <NewOrderModal
          order={pendingOrder}
          onAccept={acceptOrder}
          onReject={rejectOrder}
          onClose={dismissPendingOrder}
        />
      )}
    </View>
  );
}

import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <PartnerProvider>
            <PartnerMain />
          </PartnerProvider>
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
    fontSize: 20,
    fontWeight: '500',
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
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12
  },
  reloadText: {
    color: '#ffffff',
    fontWeight: '500',
    fontSize: 14
  }
});
