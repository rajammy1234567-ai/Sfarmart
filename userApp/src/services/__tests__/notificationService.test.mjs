import test from 'node:test';
import assert from 'node:assert/strict';

// Test navigation service logic in isolation
test('Customer Notification Tap Navigation Lifecycle Suite', async (t) => {
  // Simulate stateful notification navigation manager
  let navigationRef = null;
  let isAuthReady = false;
  let pendingNotificationTarget = null;
  const navigationHistory = [];

  const fakeNavRef = {
    isReady: () => Boolean(navigationRef),
    navigate: (screen, params) => {
      navigationHistory.push({ screen, params });
    }
  };

  const handleNotificationData = (data) => {
    if (!data) return;
    const orderId = data.orderId || data.id;
    const targetScreen = data.screen || 'OrderTracking';
    if (!orderId) return;

    const navParams = { orderId: String(orderId) };

    if (fakeNavRef.isReady() && isAuthReady) {
      fakeNavRef.navigate(targetScreen, navParams);
      pendingNotificationTarget = null;
    } else {
      pendingNotificationTarget = { screen: targetScreen, params: navParams };
    }
  };

  const flushPending = () => {
    if (pendingNotificationTarget && fakeNavRef.isReady() && isAuthReady) {
      const { screen, params } = pendingNotificationTarget;
      pendingNotificationTarget = null;
      fakeNavRef.navigate(screen, params);
    }
  };

  const setNavigationRef = (ref) => {
    navigationRef = ref;
    flushPending();
  };

  const setAuthReady = (ready) => {
    isAuthReady = Boolean(ready);
    if (isAuthReady) {
      flushPending();
    }
  };

  await t.test('1. Cold launch tap: queues target until navigation and auth are ready', () => {
    navigationRef = null;
    isAuthReady = false;
    pendingNotificationTarget = null;
    navigationHistory.length = 0;

    // Cold launch tap event arrives before React mount
    handleNotificationData({ orderId: 'ord_cold_999', screen: 'OrderTracking' });

    assert.equal(navigationHistory.length, 0, 'Must not navigate before navigation is ready');
    assert.deepEqual(pendingNotificationTarget, { screen: 'OrderTracking', params: { orderId: 'ord_cold_999' } });

    // Navigation mounts, but auth is still bootstrapping
    setNavigationRef(fakeNavRef);
    assert.equal(navigationHistory.length, 0, 'Must not navigate before authentication bootstrapping finishes');

    // Auth bootstrap finishes
    setAuthReady(true);
    assert.equal(navigationHistory.length, 1, 'Must flush queued navigation once both are ready');
    assert.deepEqual(navigationHistory[0], { screen: 'OrderTracking', params: { orderId: 'ord_cold_999' } });
    assert.equal(pendingNotificationTarget, null);
  });

  await t.test('2. Warm launch tap: navigates immediately when already mounted and authenticated', () => {
    navigationHistory.length = 0;
    navigationRef = fakeNavRef;
    isAuthReady = true;

    handleNotificationData({ orderId: 'ord_warm_888' });

    assert.equal(navigationHistory.length, 1);
    assert.deepEqual(navigationHistory[0], { screen: 'OrderTracking', params: { orderId: 'ord_warm_888' } });
  });

  await t.test('3. Ignores empty or irrelevant notification payloads', () => {
    navigationHistory.length = 0;
    handleNotificationData(null);
    handleNotificationData({});
    handleNotificationData({ type: 'GENERAL_PROMO' });

    assert.equal(navigationHistory.length, 0);
  });
});

test('Customer Android Expo Go Push Notification Guard Suite', async (t) => {
  const ExecutionEnvironment = {
    Bare: 'bare',
    Standalone: 'standalone',
    StoreClient: 'storeClient',
  };

  function checkIsAndroidExpoGo(platform, constants) {
    if (platform !== 'android') return false;
    const isStoreClient =
      constants?.executionEnvironment === ExecutionEnvironment.StoreClient ||
      constants?.executionEnvironment === 'storeClient';
    return Boolean(isStoreClient || constants?.appOwnership === 'expo');
  }

  function simulateNotificationService(platform, constants, mockExpoNotifications = null) {
    let requiredModule = false;
    let channelConfigured = false;
    let presentationConfigured = false;
    let listenerCount = 0;

    const isExpoGo = checkIsAndroidExpoGo(platform, constants);

    function getNotifications() {
      if (platform === 'web' || isExpoGo) {
        return null;
      }
      requiredModule = true;
      if (mockExpoNotifications && !presentationConfigured) {
        presentationConfigured = true;
      }
      return mockExpoNotifications;
    }

    async function setupChannel() {
      if (platform !== 'android' || channelConfigured || isExpoGo) {
        return;
      }
      const mod = getNotifications();
      if (!mod) return;
      channelConfigured = true;
    }

    async function registerForPush() {
      if (platform === 'web' || isExpoGo) {
        return null;
      }
      const mod = getNotifications();
      if (!mod) return null;
      await setupChannel();
      return { token: 'ExponentPushToken[mock-test]', platform };
    }

    function initListeners() {
      if (platform === 'web' || isExpoGo) {
        return () => {};
      }
      const mod = getNotifications();
      if (!mod) return () => {};
      listenerCount++;
      return () => {
        listenerCount--;
      };
    }

    return {
      isExpoGo,
      getNotifications,
      setupChannel,
      registerForPush,
      initListeners,
      wasRequired: () => requiredModule,
      isChannelConfigured: () => channelConfigured,
      getListenerCount: () => listenerCount,
    };
  }

  await t.test('1. Accurately identifies Android Expo Go via ExecutionEnvironment.StoreClient', () => {
    assert.equal(checkIsAndroidExpoGo('android', { executionEnvironment: 'storeClient' }), true);
    assert.equal(checkIsAndroidExpoGo('android', { executionEnvironment: ExecutionEnvironment.StoreClient }), true);
    assert.equal(checkIsAndroidExpoGo('android', { appOwnership: 'expo' }), true);
  });

  await t.test('2. Accurately identifies Non-Expo-Go environments (iOS, Web, Standalone, Dev-Client)', () => {
    assert.equal(checkIsAndroidExpoGo('ios', { executionEnvironment: 'storeClient' }), false);
    assert.equal(checkIsAndroidExpoGo('web', { executionEnvironment: 'storeClient' }), false);
    assert.equal(checkIsAndroidExpoGo('android', { executionEnvironment: 'standalone' }), false);
    assert.equal(checkIsAndroidExpoGo('android', { executionEnvironment: 'bare' }), false);
    assert.equal(checkIsAndroidExpoGo('android', {}), false);
  });

  await t.test('3. Android Expo Go: avoids requiring expo-notifications, skips registration and listeners safely', async () => {
    const service = simulateNotificationService('android', { executionEnvironment: 'storeClient' });

    assert.equal(service.isExpoGo, true);

    const tokenResult = await service.registerForPush();
    assert.equal(tokenResult, null, 'Push registration must return null on Android Expo Go without error');

    const cleanup = service.initListeners();
    assert.equal(typeof cleanup, 'function', 'Must return a cleanup function contract');
    cleanup();

    await service.setupChannel();
    assert.equal(service.isChannelConfigured(), false);
    assert.equal(service.wasRequired(), false, 'expo-notifications must NEVER be required in Android Expo Go');
  });

  await t.test('4. Native Standalone / Dev Build: requires expo-notifications and preserves full functionality', async () => {
    const mockModule = {
      setNotificationHandler: () => {},
      setNotificationChannelAsync: async () => {},
      getPermissionsAsync: async () => ({ status: 'granted' }),
      getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[mock-test]' }),
      addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
      getLastNotificationResponseAsync: async () => null,
    };

    const service = simulateNotificationService('android', { executionEnvironment: 'standalone' }, mockModule);

    assert.equal(service.isExpoGo, false);

    const cleanup = service.initListeners();
    assert.equal(service.getListenerCount(), 1);
    assert.equal(service.wasRequired(), true, 'Must load expo-notifications in standalone/dev builds');

    cleanup();
    assert.equal(service.getListenerCount(), 0);

    const tokenResult = await service.registerForPush();
    assert.deepEqual(tokenResult, { token: 'ExponentPushToken[mock-test]', platform: 'android' });
    assert.equal(service.isChannelConfigured(), true);
  });
});
