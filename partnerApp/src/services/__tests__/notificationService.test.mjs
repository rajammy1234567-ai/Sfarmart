import test from 'node:test';
import assert from 'node:assert/strict';

test('Partner Notification Tap Navigation Lifecycle Suite', async (t) => {
  let navigationRef = null;
  let isAuthReady = false;
  let pendingNotificationTarget = null;
  const navigationHistory = [];
  const handledResponseIds = new Set();

  const fakeNavRef = {
    isReady: () => Boolean(navigationRef),
    navigate: (screen, params) => {
      navigationHistory.push({ screen, params });
    }
  };

  const handleNotificationData = (data, responseId = null) => {
    if (!data) return;

    if (responseId) {
      if (handledResponseIds.has(responseId)) {
        return;
      }
      handledResponseIds.add(responseId);
    }

    const orderId = data.orderId || data.id;
    const targetScreen = 'Orders';
    const navParams = orderId ? { orderId: String(orderId) } : {};

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

  await t.test('1. Partner cold launch: routes to Orders tab once ready', () => {
    navigationRef = null;
    isAuthReady = false;
    pendingNotificationTarget = null;
    navigationHistory.length = 0;

    handleNotificationData({ orderId: 'ord_partner_123', type: 'NEW_ORDER' }, 'resp_cold_1');

    assert.equal(navigationHistory.length, 0);
    assert.deepEqual(pendingNotificationTarget, { screen: 'Orders', params: { orderId: 'ord_partner_123' } });

    setNavigationRef(fakeNavRef);
    assert.equal(navigationHistory.length, 0);

    setAuthReady(true);
    assert.equal(navigationHistory.length, 1);
    assert.deepEqual(navigationHistory[0], { screen: 'Orders', params: { orderId: 'ord_partner_123' } });
    assert.equal(pendingNotificationTarget, null);
  });

  await t.test('2. Partner warm launch: routes immediately when active', () => {
    navigationHistory.length = 0;
    navigationRef = fakeNavRef;
    isAuthReady = true;

    handleNotificationData({ orderId: 'ord_partner_456', type: 'NEW_ORDER' }, 'resp_warm_2');

    assert.equal(navigationHistory.length, 1);
    assert.deepEqual(navigationHistory[0], { screen: 'Orders', params: { orderId: 'ord_partner_456' } });
  });

  await t.test('3. Deduplicates identical notification responses', () => {
    navigationHistory.length = 0;
    navigationRef = fakeNavRef;
    isAuthReady = true;

    handleNotificationData({ orderId: 'ord_dup_1', type: 'NEW_ORDER' }, 'resp_dup_unique');
    assert.equal(navigationHistory.length, 1);

    // Repeated call with same response identifier (e.g. remount / cold fetch replay)
    handleNotificationData({ orderId: 'ord_dup_1', type: 'NEW_ORDER' }, 'resp_dup_unique');
    assert.equal(navigationHistory.length, 1);
  });
});

test('Partner Android Expo Go Push Notification Guard Suite', async (t) => {
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

  function simulatePartnerNotificationService(platform, constants, mockExpoNotifications = null) {
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
      return { token: 'ExponentPushToken[mock-partner-token]', platform };
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

  await t.test('2. Accurately identifies Non-Expo-Go environments (iOS, Standalone, Bare, Dev-Client)', () => {
    assert.equal(checkIsAndroidExpoGo('ios', { executionEnvironment: 'storeClient' }), false);
    assert.equal(checkIsAndroidExpoGo('web', { executionEnvironment: 'storeClient' }), false);
    assert.equal(checkIsAndroidExpoGo('android', { executionEnvironment: 'standalone' }), false);
    assert.equal(checkIsAndroidExpoGo('android', { executionEnvironment: 'bare' }), false);
  });

  await t.test('3. Android Expo Go: avoids requiring expo-notifications, skips registration and listeners safely', async () => {
    const service = simulatePartnerNotificationService('android', { executionEnvironment: 'storeClient' });

    assert.equal(service.isExpoGo, true);

    const tokenResult = await service.registerForPush();
    assert.equal(tokenResult, null, 'Push registration must return null on Android Expo Go without error');

    const cleanup = service.initListeners();
    assert.equal(typeof cleanup, 'function', 'Must return cleanup function contract');
    cleanup();

    await service.setupChannel();
    assert.equal(service.isChannelConfigured(), false);
    assert.equal(service.wasRequired(), false, 'expo-notifications must NEVER be required in Android Expo Go');
  });

  await t.test('4. Standalone / Dev Build: requires expo-notifications and configures channel', async () => {
    const mockModule = {
      setNotificationHandler: () => {},
      setNotificationChannelAsync: async () => {},
      getPermissionsAsync: async () => ({ status: 'granted' }),
      getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[mock-partner-token]' }),
      addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
      getLastNotificationResponseAsync: async () => null,
    };

    const service = simulatePartnerNotificationService('android', { executionEnvironment: 'standalone' }, mockModule);

    assert.equal(service.isExpoGo, false);

    const cleanup = service.initListeners();
    assert.equal(service.getListenerCount(), 1);
    assert.equal(service.wasRequired(), true);

    cleanup();
    assert.equal(service.getListenerCount(), 0);

    const tokenResult = await service.registerForPush();
    assert.deepEqual(tokenResult, { token: 'ExponentPushToken[mock-partner-token]', platform: 'android' });
    assert.equal(service.isChannelConfigured(), true);
  });
});
