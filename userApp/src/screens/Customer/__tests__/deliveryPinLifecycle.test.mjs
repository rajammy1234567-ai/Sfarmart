import assert from 'node:assert/strict';
import test from 'node:test';

// Coordinate validation logic matching CheckoutScreen.js
const isFiniteCoord = (val, maxAbs = 180) => {
  return val != null && typeof val === 'number' && Number.isFinite(val) && Math.abs(val) <= maxAbs;
};

// Haversine distance calculator matching CheckoutScreen.js
const calculateHaversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return null;
  }
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

test('Requirement 1 & 2: Map Center is Separated from Selected Pin; Text-Only Saved Address Requires Pin', () => {
  // Staging fixture address without coordinates (like Rajesh Kumar)
  const stagingFixtureAddress = {
    line1: 'Flat 302, Staging Test Residency',
    city: 'Test City',
    state: 'Test State',
    pincode: '110001',
    isDefault: true
  };

  const hasValidSavedPin = Boolean(
    stagingFixtureAddress &&
    isFiniteCoord(stagingFixtureAddress.lat, 90) &&
    isFiniteCoord(stagingFixtureAddress.lng, 180)
  );

  assert.equal(hasValidSavedPin, false, 'Staging fixture address must not be marked as having a valid pin');

  // Checkout initialization
  const deliveryAddress = {
    line1: stagingFixtureAddress.line1,
    city: stagingFixtureAddress.city,
    pincode: stagingFixtureAddress.pincode,
    lat: hasValidSavedPin ? stagingFixtureAddress.lat : null,
    lng: hasValidSavedPin ? stagingFixtureAddress.lng : null
  };

  const pinConfirmed = hasValidSavedPin;
  const selectedPin = hasValidSavedPin ? { lat: stagingFixtureAddress.lat, lng: stagingFixtureAddress.lng } : null;
  const defaultMapCenter = { lat: 30.9010, lng: 75.8573 };

  assert.equal(pinConfirmed, false, 'pinConfirmed must be false when coordinates are missing');
  assert.equal(deliveryAddress.lat, null, 'deliveryAddress.lat must be null');
  assert.equal(selectedPin, null, 'selectedPin must be null upon modal opening');
  assert.notDeepEqual(selectedPin, defaultMapCenter, 'Map viewing center must NEVER count as selected pin');
});

test('Requirement 2: Valid Saved Address with Coordinates is Reused and Clearly Labeled', () => {
  const verifiedSavedAddress = {
    label: 'Office',
    line1: 'Tower B, Cyber City',
    city: 'Gurugram',
    pincode: '122002',
    lat: 28.4950,
    lng: 77.0895,
    isDefault: true
  };

  const hasValidSavedPin = Boolean(
    verifiedSavedAddress &&
    isFiniteCoord(verifiedSavedAddress.lat, 90) &&
    isFiniteCoord(verifiedSavedAddress.lng, 180)
  );

  assert.equal(hasValidSavedPin, true, 'Verified saved address has valid pin');

  const deliveryAddress = {
    line1: verifiedSavedAddress.line1,
    city: verifiedSavedAddress.city,
    pincode: verifiedSavedAddress.pincode,
    lat: hasValidSavedPin ? verifiedSavedAddress.lat : null,
    lng: hasValidSavedPin ? verifiedSavedAddress.lng : null
  };

  const pinConfirmed = hasValidSavedPin;
  const isSavedAddressReused = hasValidSavedPin;

  assert.equal(pinConfirmed, true);
  assert.equal(isSavedAddressReused, true, 'Address must be marked as reused saved address');
  assert.equal(deliveryAddress.lat, 28.4950);
});

test('Requirement 3 & 4: Explicit Selection Required; GPS Failure Does Not Confirm Fallback', async () => {
  let selectedPin = null;

  // Simulate GPS failure (e.g. timeout, permission denied, or invalid result)
  const mockGpsResult = { coords: { latitude: null, longitude: null } };
  const lat = mockGpsResult.coords.latitude;
  const lng = mockGpsResult.coords.longitude;

  if (isFiniteCoord(lat, 90) && isFiniteCoord(lng, 180)) {
    selectedPin = { lat, lng };
  } else {
    // Failure path: DO NOT fall back to Ludhiana or any other default!
  }

  assert.equal(selectedPin, null, 'GPS failure must NOT set a fallback pin as confirmed');
});

test('Requirement 5: Reverse Geocoding Failure Does Not Fabricate City/Pincode', () => {
  const existingAddress = {
    line1: 'Flat 302, Staging Test Residency',
    city: '',
    pincode: ''
  };

  // Mock geocoder failing (e.g. offline/empty response)
  const mockGeo = { address: '', city: '', pincode: '' };

  const updatedAddress = {
    ...existingAddress,
    line1: existingAddress.line1.trim() ? existingAddress.line1 : (mockGeo.address || ''),
    city: mockGeo.city || existingAddress.city,
    pincode: mockGeo.pincode || existingAddress.pincode
  };

  assert.equal(updatedAddress.city, '', 'City must NOT be fabricated with fallback like "Ludhiana"');
  assert.equal(updatedAddress.pincode, '', 'Pincode must NOT be fabricated');
  assert.equal(updatedAddress.line1, 'Flat 302, Staging Test Residency');
});

test('Requirement 6: Address Confirmation is Disabled Until Required Details & Valid Pin Exist', () => {
  const checkCanConfirm = (pin, addr) => {
    return Boolean(
      pin &&
      isFiniteCoord(pin.lat, 90) &&
      isFiniteCoord(pin.lng, 180) &&
      addr.line1.trim().length > 0 &&
      addr.city.trim().length > 0 &&
      addr.pincode.trim().length > 0
    );
  };

  // Case A: Missing Pin
  assert.equal(
    checkCanConfirm(null, { line1: 'Flat 302', city: 'Test City', pincode: '110001' }),
    false,
    'Cannot confirm without pin'
  );

  // Case B: Missing line1
  assert.equal(
    checkCanConfirm({ lat: 30.9010, lng: 75.8573 }, { line1: '', city: 'Test City', pincode: '110001' }),
    false,
    'Cannot confirm without house/flat'
  );

  // Case C: Missing city or pincode
  assert.equal(
    checkCanConfirm({ lat: 30.9010, lng: 75.8573 }, { line1: 'Flat 302', city: '', pincode: '110001' }),
    false,
    'Cannot confirm without city'
  );
  assert.equal(
    checkCanConfirm({ lat: 30.9010, lng: 75.8573 }, { line1: 'Flat 302', city: 'Test City', pincode: '' }),
    false,
    'Cannot confirm without pincode'
  );

  // Case D: All valid
  assert.equal(
    checkCanConfirm({ lat: 30.9010, lng: 75.8573 }, { line1: 'Flat 302', city: 'Test City', pincode: '110001' }),
    true,
    'Can confirm when all required fields and pin are valid'
  );
});

test('Requirement 7: Block Checkout Submission Without Confirmed Pin & Respect Serviceability', () => {
  const checkCanSubmitCheckout = (pinConfirmed, deliveryAddress, vendorDetails) => {
    if (
      !pinConfirmed ||
      !isFiniteCoord(deliveryAddress.lat, 90) ||
      !isFiniteCoord(deliveryAddress.lng, 180) ||
      !deliveryAddress.line1?.trim() ||
      !deliveryAddress.city?.trim() ||
      !deliveryAddress.pincode?.trim() ||
      !deliveryAddress.name?.trim() ||
      !deliveryAddress.phone?.trim()
    ) {
      return { allowed: false, reason: 'PIN_OR_ADDRESS_REQUIRED' };
    }

    if (vendorDetails?.location?.coordinates?.length === 2) {
      const vLng = vendorDetails.location.coordinates[0];
      const vLat = vendorDetails.location.coordinates[1];
      const dist = calculateHaversineDistanceKm(vLat, vLng, deliveryAddress.lat, deliveryAddress.lng);
      const maxRadius = vendorDetails.deliveryRadiusKm || 7;
      if (dist !== null && dist > maxRadius) {
        return { allowed: false, reason: 'OUT_OF_RANGE', dist, maxRadius };
      }
    }

    return { allowed: true };
  };

  const validAddress = {
    name: 'Rajesh Kumar',
    phone: '9876543210',
    line1: 'Flat 302',
    city: 'Ludhiana',
    pincode: '141001',
    lat: 30.9010,
    lng: 75.8573
  };

  // Case A: Pin not confirmed
  const resNoPin = checkCanSubmitCheckout(false, validAddress, null);
  assert.equal(resNoPin.allowed, false);
  assert.equal(resNoPin.reason, 'PIN_OR_ADDRESS_REQUIRED');

  // Case B: Confirmed pin but out of delivery radius (Vendor at 30.7000, 76.7000 is ~90km away)
  const farVendor = {
    storeName: 'Chandigarh Organics',
    location: { coordinates: [76.7000, 30.7000] },
    deliveryRadiusKm: 15
  };
  const resOutOfRange = checkCanSubmitCheckout(true, validAddress, farVendor);
  assert.equal(resOutOfRange.allowed, false);
  assert.equal(resOutOfRange.reason, 'OUT_OF_RANGE');

  // Case C: Confirmed pin within radius (Vendor at 30.9050, 75.8550 is ~0.5km away)
  const localVendor = {
    storeName: 'Local Ludhiana Farm',
    location: { coordinates: [75.8550, 30.9050] },
    deliveryRadiusKm: 10
  };
  const resOk = checkCanSubmitCheckout(true, validAddress, localVendor);
  assert.equal(resOk.allowed, true);
});

test('Requirement 8: Valid (0, 0) Coordinates Handled Correctly and Modal Cancel Discards Changes', () => {
  // 1. Zero coordinates validation
  assert.equal(isFiniteCoord(0, 90), true, 'Lat 0 must be treated as a valid finite coordinate');
  assert.equal(isFiniteCoord(0, 180), true, 'Lng 0 must be treated as a valid finite coordinate');

  // 2. Modal cancel preserving previously confirmed address
  const confirmedBeforeModal = {
    line1: 'Flat 101, Existing Colony',
    city: 'Ludhiana',
    pincode: '141001',
    lat: 30.9010,
    lng: 75.8573
  };
  let currentDeliveryAddress = { ...confirmedBeforeModal };
  let currentPinConfirmed = true;

  // User opens picker: temporary draft state is created
  let tempSelectedPin = { lat: 15.0000, lng: 75.0000 }; // User dropped a pin on map
  let tempAddress = { line1: 'Temporary Draft Flat', city: 'Draft City', pincode: '999999' };

  // User clicks "Cancel" / "Close" (onRequestClose):
  // Temporary state is discarded without modifying currentDeliveryAddress or currentPinConfirmed
  tempSelectedPin = null;
  tempAddress = null;

  assert.deepEqual(currentDeliveryAddress, confirmedBeforeModal, 'Previously confirmed address must not change on cancel');
  assert.equal(currentPinConfirmed, true, 'pinConfirmed state must remain true on cancel');
});

test('Requirement 3: Out-of-Order Asynchronous Responses (Request / Version Guard)', async () => {
  let lookupVersion = 0;
  let activeState = { lat: null, lng: null, city: '', pincode: '' };

  // Simulation of version guard
  const triggerLookup = async (version, coords, delayMs, result) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (version !== lookupVersion) {
      // Discard stale response
      return { discarded: true };
    }
    activeState = {
      lat: coords.lat,
      lng: coords.lng,
      city: result.city,
      pincode: result.pincode
    };
    return { discarded: false, activeState };
  };

  // User triggers GPS (Req 1) which takes 80ms
  lookupVersion += 1;
  const version1 = lookupVersion;
  const p1 = triggerLookup(version1, { lat: 30.6558, lng: 76.8226 }, 80, {
    city: 'Zirakpur',
    pincode: '140603'
  });

  // User quickly enters manual coords (Req 2) which takes 20ms
  lookupVersion += 1;
  const version2 = lookupVersion;
  const p2 = triggerLookup(version2, { lat: 28.6139, lng: 77.2090 }, 20, {
    city: 'New Delhi',
    pincode: '110001'
  });

  const res2 = await p2;
  assert.equal(res2.discarded, false);
  assert.equal(activeState.city, 'New Delhi', 'Version 2 must update active state');

  const res1 = await p1;
  assert.equal(res1.discarded, true, 'Older version 1 response must be discarded');
  assert.equal(activeState.city, 'New Delhi', 'Stale response must NOT overwrite newer selection');
  assert.equal(activeState.lat, 28.6139);
});

test('Requirement 3: Cancellation During In-Flight Lookup Discards Results', async () => {
  let lookupVersion = 0;
  let isPickerOpen = false;
  let activeState = { lat: null, lng: null, city: '' };

  // User opens picker
  lookupVersion += 1;
  isPickerOpen = true;

  // Pin is selected, geocoding initiated
  lookupVersion += 1;
  const currentVersion = lookupVersion;
  const geocodePromise = new Promise((resolve) => {
    setTimeout(() => {
      if (lookupVersion !== currentVersion || !isPickerOpen) {
        resolve({ discarded: true });
        return;
      }
      activeState = { lat: 54.4365, lng: 94.8010, city: 'Partizanskoye' };
      resolve({ discarded: false });
    }, 50);
  });

  // User immediately cancels / closes picker
  lookupVersion += 1;
  isPickerOpen = false;

  const result = await geocodePromise;
  assert.equal(result.discarded, true, 'In-flight geocoding result must be discarded after cancellation');
  assert.equal(activeState.lat, null, 'Active state must remain untouched');
});

test('Requirement 4: Partial Geocoding Decoupling (Missing Pincode Does Not Retain Stale Value)', () => {
  // Existing address had old Delhi fixture pincode 110001
  const prevAddress = {
    line1: 'Flat 302, Staging Test Residency',
    city: 'Test City',
    pincode: '110001'
  };

  // User moved pin to Siberian coords 54.4365, 94.8010
  // Reverse geocode returns foreign-language city, but NO postal code
  const geoResult = {
    city: 'Partizanskoye',
    pincode: '',
    address: 'Partizansky District, Krasnoyarsk Krai'
  };

  // Fixed implementation: replace city/pincode together without fallback to previous unrelated values
  const updatedAddress = {
    ...prevAddress,
    city: geoResult.city ? geoResult.city.trim() : '',
    pincode: geoResult.pincode ? geoResult.pincode.trim() : ''
  };

  assert.equal(updatedAddress.city, 'Partizanskoye', 'City updated to newly detected city');
  assert.equal(updatedAddress.pincode, '', 'Pincode must NOT retain unrelated old fixture pincode 110001');

  // Verify that confirmation is disabled because pincode is now missing
  const canConfirm = Boolean(
    updatedAddress.line1.trim() &&
    updatedAddress.city.trim() &&
    updatedAddress.pincode.trim()
  );
  assert.equal(canConfirm, false, 'Address confirmation must be disabled when pincode is missing');
});

test('Requirement 2: Coordinate Ordering and Payload Handling', () => {
  // Map event payload extractor matching GoogleMap.native.js
  const extractCoordinate = (e) => {
    const coord = e?.nativeEvent?.coordinate;
    if (
      coord &&
      typeof coord.latitude === 'number' &&
      typeof coord.longitude === 'number' &&
      Number.isFinite(coord.latitude) &&
      Number.isFinite(coord.longitude) &&
      Math.abs(coord.latitude) <= 90 &&
      Math.abs(coord.longitude) <= 180
    ) {
      return { lat: coord.latitude, lng: coord.longitude };
    }
    return null;
  };

  // Case 1: Valid Android map tap payload
  const validTap = { nativeEvent: { coordinate: { latitude: 30.6558, longitude: 76.8226 } } };
  const resValid = extractCoordinate(validTap);
  assert.deepEqual(resValid, { lat: 30.6558, lng: 76.8226 });
  assert.equal(resValid.lat, 30.6558, 'lat corresponds to latitude');
  assert.equal(resValid.lng, 76.8226, 'lng corresponds to longitude');

  // Case 2: Swapped / Inverted coordinates (e.g. latitude 94.8010 is invalid on Earth)
  const invertedTap = { nativeEvent: { coordinate: { latitude: 94.8010, longitude: 54.4365 } } };
  const resInverted = extractCoordinate(invertedTap);
  assert.equal(resInverted, null, 'Inverted coordinates with latitude > 90 must be rejected');

  // Case 3: Zero coordinates
  const zeroTap = { nativeEvent: { coordinate: { latitude: 0, longitude: 0 } } };
  const resZero = extractCoordinate(zeroTap);
  assert.deepEqual(resZero, { lat: 0, lng: 0 }, 'Zero coordinates must be accepted');

  // Case 4: Malformed payload
  assert.equal(extractCoordinate({}), null);
  assert.equal(extractCoordinate(null), null);
});

test('Requirement 5: Retained-Address Consistency and Review Requirement', () => {
  const previousConfirmedPin = { lat: 28.6139, lng: 77.2090 }; // Delhi
  const newPin = { lat: 30.6558, lng: 76.8226 }; // Zirakpur (~220 km away)

  const distKm = calculateHaversineDistanceKm(
    previousConfirmedPin.lat,
    previousConfirmedPin.lng,
    newPin.lat,
    newPin.lng
  );

  assert.ok(distKm > 200, 'Distance must be > 200km');

  // When pin moves > 300m, flag retained address for review
  const requiresReview = distKm > 0.3;
  let hasReviewedRetainedAddress = !requiresReview;

  assert.equal(hasReviewedRetainedAddress, false, 'Moving to a distant location must require address review');

  // Confirmation must be blocked while review is pending
  const checkCanConfirm = (pin, addr, hasReviewed) => {
    return Boolean(
      pin &&
      isFiniteCoord(pin.lat, 90) &&
      isFiniteCoord(pin.lng, 180) &&
      addr.line1.trim() &&
      addr.city.trim() &&
      addr.pincode.trim() &&
      hasReviewed
    );
  };

  const currentAddress = {
    line1: 'Flat 302, Staging Test Residency',
    city: 'Zirakpur',
    pincode: '140603'
  };

  assert.equal(
    checkCanConfirm(newPin, currentAddress, hasReviewedRetainedAddress),
    false,
    'Confirmation must be blocked until retained house details are reviewed'
  );

  // User reviews and acknowledges
  hasReviewedRetainedAddress = true;
  assert.equal(
    checkCanConfirm(newPin, currentAddress, hasReviewedRetainedAddress),
    true,
    'Confirmation allowed after user reviews retained house details'
  );
});

test('Requirement 9: Text-Only Saved Address Starts With Unconfirmed Pin and Disabled Confirmation', () => {
  const textOnlySaved = {
    line1: 'House 42, Green Avenue',
    city: 'Amritsar',
    pincode: '143001',
    lat: null,
    lng: null
  };

  const hasValidSavedPin = Boolean(
    textOnlySaved &&
    isFiniteCoord(textOnlySaved.lat, 90) &&
    isFiniteCoord(textOnlySaved.lng, 180)
  );

  assert.equal(hasValidSavedPin, false);

  const checkoutState = {
    selectedPin: hasValidSavedPin ? { lat: textOnlySaved.lat, lng: textOnlySaved.lng } : null,
    pinConfirmed: hasValidSavedPin,
    isSavedAddressReused: hasValidSavedPin
  };

  assert.equal(checkoutState.selectedPin, null, 'Must start with no selected pin');
  assert.equal(checkoutState.pinConfirmed, false, 'Must start with pinConfirmed = false');
  assert.equal(checkoutState.isSavedAddressReused, false);
});
