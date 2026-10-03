import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// Configure foreground notification presentation
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
 * Configure high-importance Android notification channel for order alerts
 */
export async function setupNotificationChannel() {
  if (Platform.OS !== 'android' || isChannelConfigured) {
    return;
  }

  try {
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Order Updates',
      description: 'Notifications for order status changes, kitchen preparation, and delivery updates',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#16a34a',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
    isChannelConfigured = true;
  } catch (err) {
    console.warn('[Notifications] Failed to set up Android notification channel:', err.message);
  }
}

/**
 * Request notification permissions and register Expo push token.
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
      console.log('[Notifications] Push notification permission not granted:', finalStatus);
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      'b92a3a9a-2815-457f-b3ba-739b15298d2d';

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
    console.warn('[Notifications] Failed to obtain Expo push token:', err.message);
    return null;
  }
}

/**
 * Handle notification payload data and route to the correct order screen
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
  const targetScreen = data.screen || 'OrderTracking';

  if (!orderId) {
    return;
  }

  const navParams = { orderId: String(orderId) };

  if (navigationRef?.isReady() && isAuthReady) {
    try {
      navigationRef.navigate(targetScreen, navParams);
      pendingNotificationTarget = null;
    } catch (navErr) {
      console.warn('[Notifications] Direct navigation failed, queueing target:', navErr);
      pendingNotificationTarget = { screen: targetScreen, params: navParams };
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
      console.warn('[Notifications] Error flushing pending navigation:', err);
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
 * Notify notification service of auth readiness (login/bootstrap completed)
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
      console.warn('[Notifications] Error handling warm notification response:', err);
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
        console.warn('[Notifications] Error handling cold notification response:', err);
      }
    }
  }).catch((err) => {
    console.warn('[Notifications] Failed to retrieve last notification response:', err);
  });

  return () => {
    subscription.remove();
  };
}
