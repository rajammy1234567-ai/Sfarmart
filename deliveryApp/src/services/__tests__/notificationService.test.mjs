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
    assert.equal(navigationHistory.length, 1, 'Duplicate responseId must be ignored');
  });
});
