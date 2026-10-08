import test from 'node:test';
import assert from 'node:assert/strict';

test('Rider Notification Tap Navigation Lifecycle Suite', async (t) => {
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
    const isOffer = data.type === 'NEW_OFFER' || data.type === 'DELIVERY_OFFER';
    const targetScreen = isOffer ? 'Duty' : (data.screen || (orderId ? 'ActiveNavigation' : 'Duty'));
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

  await t.test('1. Delivery offer tap: routes to Duty screen', () => {
    navigationRef = null;
    isAuthReady = false;
    pendingNotificationTarget = null;
    navigationHistory.length = 0;

    handleNotificationData({ orderId: 'ord_offer_101', type: 'DELIVERY_OFFER' }, 'resp_offer_1');

    assert.equal(navigationHistory.length, 0);
    assert.deepEqual(pendingNotificationTarget, { screen: 'Duty', params: { orderId: 'ord_offer_101' } });

    setNavigationRef(fakeNavRef);
    assert.equal(navigationHistory.length, 0);

    setAuthReady(true);
    assert.equal(navigationHistory.length, 1);
    assert.deepEqual(navigationHistory[0], { screen: 'Duty', params: { orderId: 'ord_offer_101' } });
    assert.equal(pendingNotificationTarget, null);
  });

  await t.test('2. Active delivery update tap: routes to ActiveNavigation screen', () => {
    navigationHistory.length = 0;
    navigationRef = fakeNavRef;
    isAuthReady = true;

    handleNotificationData({ orderId: 'ord_active_202', type: 'ORDER_UPDATE' }, 'resp_update_2');

    assert.equal(navigationHistory.length, 1);
    assert.deepEqual(navigationHistory[0], { screen: 'ActiveNavigation', params: { orderId: 'ord_active_202' } });
  });

  await t.test('3. Deduplicates identical notification responses', () => {
    navigationHistory.length = 0;
    navigationRef = fakeNavRef;
    isAuthReady = true;

    handleNotificationData({ orderId: 'ord_active_303', type: 'ORDER_UPDATE' }, 'resp_dup_rider');
    assert.equal(navigationHistory.length, 1);

    handleNotificationData({ orderId: 'ord_active_303', type: 'ORDER_UPDATE' }, 'resp_dup_rider');
    assert.equal(navigationHistory.length, 1);
  });
});

test('Rider Android Expo Go Push Notification Guard Suite', async (t) => {
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

  function simulateRiderNotificationService(platform, constants, mockExpoNotifications = null) {
    let requiredModule = false;
    let channelsConfigured = false;
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

    async function setupChannels() {
      if (platform !== 'android' || channelsConfigured || isExpoGo) {
        return;
      }
      const mod = getNotifications();
      if (!mod) return;
      channelsConfigured = true;
    }

    async function registerForPush() {
      if (platform === 'web' || isExpoGo) {
        return null;
      }
      const mod = getNotifications();
      if (!mod) return null;
      await setupChannels();
      return { token: 'ExponentPushToken[mock-rider-token]', platform };
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
      setupChannels,
      registerForPush,
      initListeners,
      wasRequired: () => requiredModule,
      areChannelsConfigured: () => channelsConfigured,
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

  await t.test('3. Android Expo Go: avoids requiring expo-notifications, returns safe null token and no-op cleanup', async () => {
    const service = simulateRiderNotificationService('android', { executionEnvironment: 'storeClient' });

    assert.equal(service.isExpoGo, true);

    const tokenResult = await service.registerForPush();
    assert.equal(tokenResult, null, 'Push registration must return null in Expo Go without throwing');

    const cleanup = service.initListeners();
    assert.equal(typeof cleanup, 'function', 'Must return cleanup function');
    cleanup();

    await service.setupChannels();
    assert.equal(service.areChannelsConfigured(), false);
    assert.equal(service.wasRequired(), false, 'Must NEVER require expo-notifications in Android Expo Go');
  });

  await t.test('4. Standalone / Dev Build: requires expo-notifications and configures channels', async () => {
    const mockModule = {
      setNotificationHandler: () => {},
      setNotificationChannelAsync: async () => {},
      getPermissionsAsync: async () => ({ status: 'granted' }),
      getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[mock-rider-token]' }),
      addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
      getLastNotificationResponseAsync: async () => null,
    };

    const service = simulateRiderNotificationService('android', { executionEnvironment: 'standalone' }, mockModule);

    assert.equal(service.isExpoGo, false);

    const cleanup = service.initListeners();
    assert.equal(service.getListenerCount(), 1);
    assert.equal(service.wasRequired(), true);

    cleanup();
    assert.equal(service.getListenerCount(), 0);

    const tokenResult = await service.registerForPush();
    assert.deepEqual(tokenResult, { token: 'ExponentPushToken[mock-rider-token]', platform: 'android' });
    assert.equal(service.areChannelsConfigured(), true);
  });
});
