import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

let notificationsModule = null;
let isHandlerConfigured = false;
let isChannelConfigured = false;
let navigationRef = null;
let isAuthReady = false;
let pendingNotificationTarget = null;
let hasLoggedExpoGoNotice = false;
const handledNotificationResponseIds = new Set();

/**
 * Detect whether the app is executing inside the Android Expo Go store client.
 * In Expo SDK 53+, remote push notification native functionality was removed
 * from Android Expo Go, throwing an unrecoverable runtime exception if loaded.
 */
export function isAndroidExpoGo() {
  if (Platform.OS !== 'android') {
    return false;
  }
  const isStoreClient =
    Constants?.executionEnvironment === ExecutionEnvironment?.StoreClient ||
    Constants?.executionEnvironment === 'storeClient';
  return Boolean(isStoreClient || Constants?.appOwnership === 'expo');
}

/**
 * Guarded lazy loader for expo-notifications.
 * In Android Expo Go and Web, strictly returns null without requiring or evaluating the package.
 * In native builds (standalone/dev-client) and iOS, lazily requires expo-notifications
 * and configures the foreground presentation handler once.
 */
export function getNotifications() {
  if (Platform.OS === 'web' || isAndroidExpoGo()) {
    if (isAndroidExpoGo() && !hasLoggedExpoGoNotice) {
      hasLoggedExpoGoNotice = true;
      console.log(
        '[PartnerNotifications] Android Expo Go detected (SDK 53+): remote push notifications are not supported in Expo Go on Android. Bypassing expo-notifications module to prevent startup crash.'
      );
    }
    return null;
  }

  if (!notificationsModule) {
    try {
      // Lazy load expo-notifications only when supported (non-Expo Go Android / iOS / native builds)
      notificationsModule = require('expo-notifications');
      if (notificationsModule && !isHandlerConfigured) {
        notificationsModule.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        isHandlerConfigured = true;
      }
    } catch (err) {
      console.warn('[PartnerNotifications] Failed to load expo-notifications module:', err?.message || err);
      return null;
    }
  }

  return notificationsModule;
}

/**
 * Configure high-importance Android notification channel for new incoming vendor orders
 */
export async function setupNotificationChannel() {
  if (Platform.OS !== 'android' || isChannelConfigured || isAndroidExpoGo()) {
    return;
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    return;
  }

  try {
    await Notifications.setNotificationChannelAsync('partner_orders', {
      name: 'New Orders & Kitchen Alerts',
      description: 'Instant high-priority notifications for new incoming customer orders and kitchen alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#15803d',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
    isChannelConfigured = true;
  } catch (err) {
    console.warn('[PartnerNotifications] Failed to configure Android notification channel:', err.message);
  }
}

/**
 * Request notification permissions and register Expo push token for partner app.
 * Non-blocking: returns null on denial, error, or Android Expo Go without throwing or impeding app use.
 */
export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web' || isAndroidExpoGo()) {
    return null;
  }

  const Notifications = getNotifications();
  if (!Notifications) {
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
      console.log('[PartnerNotifications] Push notification permission not granted:', finalStatus);
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      '59989093-917c-4e06-9cfd-15ab65aa3aee';

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
    console.warn('[PartnerNotifications] Failed to obtain Expo push token:', err?.message || err);
    return null;
  }
}

/**
 * Handle incoming notification payload data and route partner to the Orders tab
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
  const targetScreen = 'Orders';
  const navParams = orderId ? { orderId: String(orderId) } : {};

  if (navigationRef?.isReady() && isAuthReady) {
    try {
      navigationRef.navigate(targetScreen, navParams);
      pendingNotificationTarget = null;
    } catch (navErr) {
      try {
        navigationRef.navigate('PartnerTabs', { screen: targetScreen, params: navParams });
        pendingNotificationTarget = null;
      } catch (nestedErr) {
        console.warn('[PartnerNotifications] Direct navigation failed, queueing target:', nestedErr);
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
        navigationRef.navigate('PartnerTabs', { screen, params });
      } catch (nestedErr) {
        console.warn('[PartnerNotifications] Error flushing pending navigation:', nestedErr);
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
 * Notify notification service of partner auth readiness
 */
export function setNotificationAuthReady(ready) {
  isAuthReady = Boolean(ready);
  if (isAuthReady) {
    flushPendingNavigation();
  }
}

/**
 * Initialize listeners for both warm launch (response listener) and cold launch (last response).
 * Safely skipped in Android Expo Go and Web, preserving the cleanup function contract.
 */
export function initNotificationListeners() {
  if (Platform.OS === 'web' || isAndroidExpoGo()) {
    return () => {};
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    return () => {};
  }

  // 1. Warm / Background Tap Listener
  let subscription = null;
  try {
    subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const responseId = response?.notification?.request?.identifier;
        const data = response?.notification?.request?.content?.data;
        handleNotificationData(data, responseId);
      } catch (err) {
        console.warn('[PartnerNotifications] Error handling warm notification response:', err);
      }
    });
  } catch (err) {
    console.warn('[PartnerNotifications] Failed to add notification response listener:', err);
  }

  // 2. Cold Launch Check (App opened directly from a notification tap)
  try {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        try {
          const responseId = response?.notification?.request?.identifier;
          const data = response?.notification?.request?.content?.data;
          handleNotificationData(data, responseId);
        } catch (err) {
          console.warn('[PartnerNotifications] Error handling cold notification response:', err);
        }
      }
    }).catch((err) => {
      console.warn('[PartnerNotifications] Failed to retrieve last notification response:', err);
    });
  } catch (err) {
    console.warn('[PartnerNotifications] Error querying last notification response:', err);
  }

  return () => {
    try {
      subscription?.remove?.();
    } catch (err) {
      console.warn('[PartnerNotifications] Error removing notification listener:', err);
    }
  };
}
