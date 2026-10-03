import test from 'node:test';
import assert from 'node:assert/strict';

test('PartnerApp Serviceability, Location Pin & Provider UI Lifecycle Suite', async (t) => {
  // 1. Store pickup coordinates validation logic
  const validatePickupPin = (latStr, lngStr) => {
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (
      !latStr?.trim() ||
      !lngStr?.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return { valid: false, error: 'Enter a valid store pickup pin.' };
    }
    return { valid: true, lat, lng };
  };

  await t.test('1. validatePickupPin accepts valid geographical coordinates', () => {
    const valid = validatePickupPin('30.9010', '75.8573');
    assert.equal(valid.valid, true);
    assert.equal(valid.lat, 30.9010);
    assert.equal(valid.lng, 75.8573);
  });

  await t.test('2. validatePickupPin rejects invalid, empty, or out-of-bounds coordinates', () => {
    assert.equal(validatePickupPin('', '75.8573').valid, false);
    assert.equal(validatePickupPin('30.9010', '').valid, false);
    assert.equal(validatePickupPin('abc', '75.8573').valid, false);
    assert.equal(validatePickupPin('95.0', '75.8573').valid, false);
    assert.equal(validatePickupPin('30.9010', '185.0').valid, false);
  });

  await t.test('3. Service radius formatting falls back to 7 km default', () => {
    const formatRadius = (radiusKm) => `Up to ${radiusKm || 7} km express delivery`;
    assert.equal(formatRadius(undefined), 'Up to 7 km express delivery');
    assert.equal(formatRadius(null), 'Up to 7 km express delivery');
    assert.equal(formatRadius(12), 'Up to 12 km express delivery');
  });

  await t.test('4. Save pickup pin creates standard location payload for server', () => {
    const createPayload = (lat, lng) => ({
      location: { lat: Number(lat), lng: Number(lng) }
    });
    const payload = createPayload('30.9100', '75.8600');
    assert.deepEqual(payload, {
      location: { lat: 30.91, lng: 75.86 }
    });
  });

  await t.test('5. 401 response during profile update triggers session logout', async () => {
    let loggedOut = false;
    let alertMessage = '';

    const handleProfileResponse = async (status, logoutFn, alertFn) => {
      if (status === 401) {
        await logoutFn();
        alertFn('Session Expired', 'Your merchant session has expired. Please log in again.');
        return false;
      }
      return true;
    };

    const success = await handleProfileResponse(
      401,
      async () => { loggedOut = true; },
      (title, msg) => { alertMessage = `${title}: ${msg}`; }
    );

    assert.equal(success, false);
    assert.equal(loggedOut, true);
    assert.match(alertMessage, /Session Expired/);
  });

  await t.test('6. Order status UI determines correct rider assignment / searching state', () => {
    const getRiderStatusUi = (order) => {
      if (order.rider) {
        return { type: 'ASSIGNED', name: order.rider.name, plate: order.rider.vehicle?.plateNumber };
      }
      if (['READY_FOR_RIDER', 'RIDER_ASSIGNED'].includes(order.status)) {
        return { type: 'SEARCHING', message: 'Assigning nearby delivery partner...' };
      }
      return { type: 'NONE' };
    };

    const orderPendingRider = { status: 'READY_FOR_RIDER', rider: null };
    assert.deepEqual(getRiderStatusUi(orderPendingRider), {
      type: 'SEARCHING',
      message: 'Assigning nearby delivery partner...'
    });

    const orderWithRider = {
      status: 'READY_FOR_RIDER',
      rider: { name: 'Gurmukh Singh', vehicle: { plateNumber: 'PB-10-AB-1234' } }
    };
    assert.deepEqual(getRiderStatusUi(orderWithRider), {
      type: 'ASSIGNED',
      name: 'Gurmukh Singh',
      plate: 'PB-10-AB-1234'
    });
  });
});
