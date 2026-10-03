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
