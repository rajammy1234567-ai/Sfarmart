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
    assert.equal(navigationHistory.length, 1, 'Duplicate responseId must be ignored');
  });
});
