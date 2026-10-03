import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// Configure foreground notification presentation for rider alerts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let isChannelConfigured = false;
let navigationRef = null;
let isAuthReady = false;
let pendingNotificationTarget = null;
const handledNotificationResponseIds = new Set();

/**
 * Configure high-importance Android notification channels for rider delivery offers and order updates
 */
export async function setupNotificationChannel() {
  if (Platform.OS !== 'android' || isChannelConfigured) {
    return;
  }

  try {
    await Notifications.setNotificationChannelAsync('delivery_offers', {
      name: 'Delivery Offers',
      description: 'Urgent incoming delivery assignment requests and order offers',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#0284c7',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Order Status Updates',
      description: 'Status updates and dispatch instructions for active deliveries',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0284c7',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    isChannelConfigured = true;
  } catch (err) {
    console.warn('[RiderNotifications] Failed to configure Android notification channels:', err.message);
  }
}

/**
 * Request notification permissions and register Expo push token for delivery app.
 * Non-blocking: returns null on denial or error without throwing or impeding app use.
 */
export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    await setupNotificationChannel();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[RiderNotifications] Push notification permission not granted:', finalStatus);
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      undefined;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    const token = tokenResponse?.data;
    if (token) {
      return {
        token,
        platform: Platform.OS
      };
    }
    return null;
  } catch (err) {
    console.warn('[RiderNotifications] Failed to obtain Expo push token:', err.message);
    return null;
  }
}

/**
 * Handle incoming notification payload data and route rider to the Duty or ActiveNavigation screen
 */
export function handleNotificationData(data, responseId = null) {
  if (!data) return;

  if (responseId) {
    if (handledNotificationResponseIds.has(responseId)) {
      return;
    }
    handledNotificationResponseIds.add(responseId);
  }

  const orderId = data.orderId || data.id;
  const isOffer = data.type === 'NEW_OFFER' || data.type === 'DELIVERY_OFFER';
  const targetScreen = isOffer ? 'Duty' : (data.screen || (orderId ? 'ActiveNavigation' : 'Duty'));
  const navParams = orderId ? { orderId: String(orderId) } : {};

  if (navigationRef?.isReady() && isAuthReady) {
    try {
      navigationRef.navigate(targetScreen, navParams);
      pendingNotificationTarget = null;
    } catch (navErr) {
      try {
        navigationRef.navigate('DeliveryTabs', { screen: targetScreen, params: navParams });
        pendingNotificationTarget = null;
      } catch (nestedErr) {
        console.warn('[RiderNotifications] Direct navigation failed, queueing target:', nestedErr);
        pendingNotificationTarget = { screen: targetScreen, params: navParams };
      }
    }
  } else {
    pendingNotificationTarget = { screen: targetScreen, params: navParams };
  }
}

/**
 * Flush any queued notification navigation once navigation and auth readiness are established
 */
function flushPendingNavigation() {
  if (pendingNotificationTarget && navigationRef?.isReady() && isAuthReady) {
    const { screen, params } = pendingNotificationTarget;
    pendingNotificationTarget = null;
    try {
      navigationRef.navigate(screen, params);
    } catch (err) {
      try {
        navigationRef.navigate('DeliveryTabs', { screen, params });
      } catch (nestedErr) {
        console.warn('[RiderNotifications] Error flushing pending navigation:', nestedErr);
      }
    }
  }
}

/**
 * Set the root navigation ref
 */
export function setNavigationRef(ref) {
  navigationRef = ref;
  flushPendingNavigation();
}

/**
 * Notify notification service of rider auth readiness
 */
export function setNotificationAuthReady(ready) {
  isAuthReady = Boolean(ready);
  if (isAuthReady) {
    flushPendingNavigation();
  }
}

/**
 * Initialize listeners for both warm launch (response listener) and cold launch (last response)
 */
export function initNotificationListeners() {
  if (Platform.OS === 'web') {
    return () => {};
  }

  // 1. Warm / Background Tap Listener
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    try {
      const responseId = response?.notification?.request?.identifier;
      const data = response?.notification?.request?.content?.data;
      handleNotificationData(data, responseId);
    } catch (err) {
      console.warn('[RiderNotifications] Error handling warm notification response:', err);
    }
  });

  // 2. Cold Launch Check (App opened directly from a notification tap)
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      try {
        const responseId = response?.notification?.request?.identifier;
        const data = response?.notification?.request?.content?.data;
        handleNotificationData(data, responseId);
      } catch (err) {
        console.warn('[RiderNotifications] Error handling cold notification response:', err);
      }
    }
  }).catch((err) => {
    console.warn('[RiderNotifications] Failed to retrieve last notification response:', err);
  });

  return () => {
    subscription.remove();
  };
}
