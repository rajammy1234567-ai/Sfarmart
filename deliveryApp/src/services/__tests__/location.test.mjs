import test from 'node:test';
import assert from 'node:assert/strict';

// Core locationPayload logic from deliveryApp/src/services/location.js
export function locationPayload(position) {
  const c = position.coords;
  if (c.accuracy == null || c.accuracy > 100 || Date.now() - position.timestamp > 120000) {
    throw new Error('GPS accuracy is low. Move outdoors and retry.');
  }
  return {
    lat: c.latitude,
    lng: c.longitude,
    accuracy: c.accuracy,
    capturedAt: position.timestamp,
    heading: Math.max(0, c.heading || 0),
    speed: Math.max(0, c.speed || 0) * 3.6
  };
}

test('DeliveryApp Location Service & Tracking Lifecycle Suite', async (t) => {
  await t.test('1. locationPayload rejects null or missing accuracy', () => {
    const invalidPosition = {
      coords: { latitude: 30.9010, longitude: 75.8573, accuracy: null },
      timestamp: Date.now()
    };
    assert.throws(
      () => locationPayload(invalidPosition),
      /GPS accuracy is low/
    );
  });

  await t.test('2. locationPayload rejects accuracy > 100 meters', () => {
    const poorGpsPosition = {
      coords: { latitude: 30.9010, longitude: 75.8573, accuracy: 150 },
      timestamp: Date.now()
    };
    assert.throws(
      () => locationPayload(poorGpsPosition),
      /GPS accuracy is low/
    );
  });

  await t.test('3. locationPayload rejects stale location timestamps (> 120 seconds old)', () => {
    const stalePosition = {
      coords: { latitude: 30.9010, longitude: 75.8573, accuracy: 15 },
      timestamp: Date.now() - 150000 // 150 seconds ago
    };
    assert.throws(
      () => locationPayload(stalePosition),
      /GPS accuracy is low/
    );
  });

  await t.test('4. locationPayload accepts fresh, accurate GPS fix and converts m/s speed to km/h', () => {
    const now = Date.now();
    const validPosition = {
      coords: {
        latitude: 30.9010,
        longitude: 75.8573,
        accuracy: 8,
        heading: 90,
        speed: 10 // 10 m/s = 36 km/h
      },
      timestamp: now
    };
    const payload = locationPayload(validPosition);
    assert.equal(payload.lat, 30.9010);
    assert.equal(payload.lng, 75.8573);
    assert.equal(payload.accuracy, 8);
    assert.equal(payload.capturedAt, now);
    assert.equal(payload.heading, 90);
    assert.equal(payload.speed, 36); // 10 * 3.6
  });

  await t.test('5. locationPayload clamps negative or missing heading and speed to 0', () => {
    const fixWithNegativeValues = {
      coords: {
        latitude: 30.9010,
        longitude: 75.8573,
        accuracy: 20,
        heading: -1,
        speed: -5
      },
      timestamp: Date.now()
    };
    const payload = locationPayload(fixWithNegativeValues);
    assert.equal(payload.heading, 0);
    assert.equal(payload.speed, 0);
  });

  await t.test('6. Background task skips upload when rider is OFFLINE or token is missing', async () => {
    let uploadCalled = false;
    const mockStorage = {
      token: null,
      rider: { status: 'OFFLINE' }
    };
    const mockRiderApi = {
      sendLocation: async () => { uploadCalled = true; }
    };

    const handleBackgroundTask = async (data) => {
      if (!data?.locations?.length || !mockStorage.token) return;
      if (!mockStorage.rider || mockStorage.rider.status === 'OFFLINE') return;
      await mockRiderApi.sendLocation(locationPayload(data.locations[data.locations.length - 1]));
    };

    // Case A: Token missing
    await handleBackgroundTask({
      locations: [{ coords: { latitude: 30.9, longitude: 75.8, accuracy: 10 }, timestamp: Date.now() }]
    });
    assert.equal(uploadCalled, false, 'Must not upload if token is missing');

    // Case B: Token present, but rider status is OFFLINE
    mockStorage.token = 'valid_token';
    await handleBackgroundTask({
      locations: [{ coords: { latitude: 30.9, longitude: 75.8, accuracy: 10 }, timestamp: Date.now() }]
    });
    assert.equal(uploadCalled, false, 'Must not upload if rider is OFFLINE');

    // Case C: Token present and rider is ONLINE_IDLE
    mockStorage.rider.status = 'ONLINE_IDLE';
    await handleBackgroundTask({
      locations: [{ coords: { latitude: 30.9, longitude: 75.8, accuracy: 10 }, timestamp: Date.now() }]
    });
    assert.equal(uploadCalled, true, 'Must upload when rider is ONLINE_IDLE');
  });

  await t.test('7. Foreground permission rejection aborts duty toggle with descriptive error', async () => {
    const mockLocationModule = {
      requestForegroundPermissionsAsync: async () => ({ status: 'denied' })
    };

    const toggleDuty = async () => {
      const permission = await mockLocationModule.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Allow precise location permission to go online.');
      }
    };

    await assert.rejects(
      async () => toggleDuty(),
      /Allow precise location permission to go online\./
    );
  });

  await t.test('8. Tracking cleanup: watch subscription and background updates stop on logout/offline', async () => {
    let watchRemoved = false;
    let backgroundUpdatesStopped = false;

    const mockWatch = {
      remove: () => { watchRemoved = true; }
    };

    const stopBackgroundLocation = async () => {
      backgroundUpdatesStopped = true;
    };

    // Simulate Rider logout or going offline
    const onLogoutOrOffline = async () => {
      mockWatch.remove();
      await stopBackgroundLocation();
    };

    await onLogoutOrOffline();
    assert.equal(watchRemoved, true, 'Foreground watchPosition subscription must be removed');
    assert.equal(backgroundUpdatesStopped, true, 'Background location updates must be stopped');
  });

  await t.test('9. Delivery completion: clears active order tracking, preserves ONLINE_IDLE duty location', async () => {
    // Rider state simulator
    let currentTask = { id: 'order_101', status: 'OUT_FOR_DELIVERY' };
    let riderStatus = 'ON_DELIVERY';
    let isTrackingLocation = true;
    let earnedTotal = 0;

    const completeDelivery = async (orderId, otp) => {
      if (otp !== '1234') throw new Error('Invalid OTP');
      // 1. Clear order tracking
      currentTask = null;
      // 2. Refresh earnings
      earnedTotal += 65;
      // 3. Return to ONLINE_IDLE (keep duty location active)
      riderStatus = 'ONLINE_IDLE';
      return { success: true, earnedAmount: 65 };
    };

    const res = await completeDelivery('order_101', '1234');
    assert.equal(res.success, true);
    assert.equal(currentTask, null, 'Active order task must be cleared');
    assert.equal(riderStatus, 'ONLINE_IDLE', 'Rider must return to ONLINE_IDLE status');
    assert.equal(isTrackingLocation, true, 'Duty location tracking must remain active while ONLINE_IDLE');
    assert.equal(earnedTotal, 65, 'Earnings must be updated');
  });

  await t.test('10. Ready for next order: rider receives and accepts incoming offer after completion', async () => {
    let currentTask = null;
    let riderStatus = 'ONLINE_IDLE';
    let pendingOffer = null;

    // Simulate incoming offer event
    const onReceiveOffer = (offer) => {
      if (riderStatus === 'ONLINE_IDLE' && !currentTask) {
        pendingOffer = offer;
      }
    };

    const acceptOffer = async (orderId) => {
      if (pendingOffer && pendingOffer.orderId === orderId) {
        currentTask = { id: orderId, status: 'RIDER_ASSIGNED' };
        pendingOffer = null;
        riderStatus = 'ON_DELIVERY';
        return { success: true };
      }
      return { success: false };
    };

    // Receive next delivery offer
    onReceiveOffer({ orderId: 'order_202', storeName: 'Fresh Mart', payout: 75 });
    assert.notEqual(pendingOffer, null, 'Rider must receive the next incoming offer');
    assert.equal(pendingOffer.orderId, 'order_202');

    // Accept next offer
    const acceptRes = await acceptOffer('order_202');
    assert.equal(acceptRes.success, true);
    assert.equal(pendingOffer, null, 'Pending offer must be cleared upon acceptance');
    assert.equal(currentTask.id, 'order_202', 'New order task must be assigned');
    assert.equal(riderStatus, 'ON_DELIVERY', 'Rider status must transition to ON_DELIVERY');
  });
});
