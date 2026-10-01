import React, { useState, useEffect, useRef } from 'react';
import { MapView, Marker, PROVIDER_GOOGLE, MapViewDirections } from '../components/MapViewWrapper';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  StatusBar,
  Linking,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDelivery } from '../context/DeliveryContext';
import { shouldRecalculateRoute } from '../utils/trackingUtils';

export const ActiveNavigationScreen = ({ navigation }) => {
  const {
    currentTask,
    markArrivedAtStore,
    verifyPickup,
    verifyDelivery,
    refreshActiveOrder,
    currentCoords
  } = useDelivery();

  const [pickupOtpInput, setPickupOtpInput] = useState('');
  const [deliveryOtpInput, setDeliveryOtpInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null); // { distance: km, duration: mins }
  const [boundedOrigin, setBoundedOrigin] = useState(null);

  const mapRef = useRef(null);
  const lastBoundedCalcTimeRef = useRef(0);
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  const riderLat = currentCoords?.latitude;
  const riderLng = currentCoords?.longitude;

  const orderId = currentTask?._id || currentTask?.id;
  const orderNumber = currentTask?.orderNumber || (orderId ? String(orderId).slice(-6) : 'ORD-101');
  const status = currentTask?.status || 'RIDER_ASSIGNED';

  const getAddressString = (addr, fallback) => {
    if (!addr) return fallback;
    if (typeof addr === 'string') return addr;
    if (typeof addr === 'object') {
      const parts = [addr.line1, addr.city, addr.pincode].filter(Boolean);
      return parts.length > 0 ? parts.join(', ') : fallback;
    }
    return fallback;
  };

  // Vendor / Store extraction
  const storeName = currentTask?.vendor?.storeName || currentTask?.vendor?.name || currentTask?.pickupLocation || 'Partner Merchant Store';
  const storePhone = currentTask?.vendor?.phone || '';
  const storeAddress = getAddressString(currentTask?.vendor?.address, currentTask?.pickupAddress || 'Shop #12, Market Complex, Ludhiana');
  const storeLat = currentTask?.vendor?.address?.location?.coordinates?.[1] ?? currentTask?.vendor?.location?.coordinates?.[1];
  const storeLng = currentTask?.vendor?.address?.location?.coordinates?.[0] ?? currentTask?.vendor?.location?.coordinates?.[0];

  // Customer extraction
  const customerName = currentTask?.customer?.name || currentTask?.address?.name || currentTask?.customerName || 'Customer';
  const customerPhone = currentTask?.customer?.phone || currentTask?.address?.phone || currentTask?.customerPhone || '';
  const customerAddress = getAddressString(currentTask?.address || currentTask?.deliveryAddress, 'Sector 32, Urban Estate, Ludhiana');
  const custLat = currentTask?.address?.lat;
  const custLng = currentTask?.address?.lng;

  // Financials & Payment
  const isCOD = currentTask?.payment?.method === 'COD' || currentTask?.paymentMethod === 'COD';
  const grandTotal = currentTask?.pricing?.grandTotal || currentTask?.totalAmount || currentTask?.totalToCollect || 180;
  const items = currentTask?.items || [];
  const itemsCount = items.length;

  // Navigation targets
  const targetDestination = (status === 'RIDER_ASSIGNED' || status === 'RIDER_ARRIVED_STORE')
    ? { name: storeName, address: storeAddress, lat: storeLat, lng: storeLng, role: 'STORE' }
    : { name: customerName, address: customerAddress, lat: custLat, lng: custLng, role: 'CUSTOMER' };

  useEffect(() => {
    if (!Number.isFinite(riderLat) || !Number.isFinite(riderLng)) {
      setBoundedOrigin(null);
      return;
    }
    const currentLoc = { lat: riderLat, lng: riderLng };
    const lastLoc = boundedOrigin ? { lat: boundedOrigin.latitude, lng: boundedOrigin.longitude } : null;
    if (shouldRecalculateRoute(lastLoc, currentLoc, lastBoundedCalcTimeRef.current)) {
      lastBoundedCalcTimeRef.current = Date.now();
      setBoundedOrigin({ latitude: riderLat, longitude: riderLng });
    }
  }, [riderLat, riderLng, boundedOrigin]);

  useEffect(() => {
    if (!mapRef.current) return;
    const pts = [];
    if (Number.isFinite(riderLat) && Number.isFinite(riderLng)) {
      pts.push({ latitude: riderLat, longitude: riderLng });
    }
    if (Number.isFinite(targetDestination.lat) && Number.isFinite(targetDestination.lng)) {
      pts.push({ latitude: targetDestination.lat, longitude: targetDestination.lng });
    }
    if (pts.length > 0) {
      mapRef.current.fitToCoordinates(pts, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }
  }, [riderLat, riderLng, targetDestination.lat, targetDestination.lng]);

  if (!currentTask) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <View style={styles.emptyIconCircle}>
          <Ionicons name="checkmark-circle-outline" size={56} color="#16a34a" />
        </View>
        <Text style={styles.emptyTitle}>No Active Delivery Trip</Text>
        <Text style={styles.emptySub}>
          You are currently ready to receive new delivery orders. Head back to the Duty Queue to accept requests.
        </Text>
        <TouchableOpacity
          style={styles.backBtnPill}
          onPress={() => navigation.navigate('Duty')}
          activeOpacity={0.85}
        >
          <Ionicons name="speedometer-outline" size={18} color="#ffffff" />
          <Text style={styles.backBtnText}>Open Duty Queue</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleOpenMaps = () => {
    const lat = targetDestination.lat;
    const lng = targetDestination.lng;
    if(!Number.isFinite(lat) || !Number.isFinite(lng)) {Alert.alert('Location missing','The delivery pin is missing. Contact the store/customer to confirm their location.');return;}
    const url='https://www.google.com/maps/dir/?api=1&destination='+lat+','+lng+'&travelmode=driving&dir_action=navigate';
    Linking.openURL(url).catch(()=>Alert.alert('Maps unavailable','Could not open Google Maps.'));
  };

  const handleCall = (phone) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Call Error', `Unable to dial ${phone}`);
    });
  };

  // Step 1: Rider arrived at store
  const handleArrivedAtStore = async () => {
    setIsSubmitting(true);
    const res = await markArrivedAtStore(orderId);
    setIsSubmitting(false);
    if (!res?.success) {
      Alert.alert('Arrival Update', res?.message || 'Failed to update store arrival status.');
    }
  };

  // Step 2: Store pickup OTP
  const handleVerifyPickup = async () => {
    if (!pickupOtpInput.trim()) {
      Alert.alert('OTP Required', 'Please enter the 4-digit Store Pickup OTP provided by the merchant.');
      return;
    }
    setIsSubmitting(true);
    const res = await verifyPickup(orderId, pickupOtpInput.trim());
    setIsSubmitting(false);
    if (!res?.success) {
      Alert.alert('Pickup Failed', res?.message || 'Invalid Store Pickup OTP.');
    } else {
      setPickupOtpInput('');
      Alert.alert('Parcel Picked Up! 📦', 'Proceed towards customer delivery address.');
    }
  };

  // Step 3: Customer doorstep delivery OTP
  const handleVerifyDelivery = async () => {
    if (!deliveryOtpInput.trim() || deliveryOtpInput.trim().length !== 4) {
      Alert.alert('Valid OTP Required', 'Please ask the customer for their 4-digit Delivery Confirmation OTP.');
      return;
    }

    setIsSubmitting(true);
    const res = await verifyDelivery(orderId, deliveryOtpInput.trim());
    setIsSubmitting(false);

    if (!res?.success) {
      Alert.alert('Verification Failed', res?.message || 'Invalid delivery OTP. Please verify with customer.');
    } else {
      setDeliveryOtpInput('');
      Alert.alert(
        'Delivery Completed! 🎉',
        `₹${res.earnedAmount || 65} has been credited to your rider wallet. Great job!`,
        [{ text: 'Return to Duty', onPress: () => navigation.navigate('Duty') }]
      );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.navigate('Duty')}
          style={styles.iconBtnCircle}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color="#0f172a" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Order #{orderNumber}</Text>
          <Text style={styles.headerSub}>Live Delivery Mission</Text>
        </View>

        <TouchableOpacity onPress={refreshActiveOrder} style={styles.iconBtnCircle} activeOpacity={0.7}>
          <Ionicons name="refresh" size={18} color="#0284c7" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Status Phase Indicator */}
        <View style={styles.phaseCard}>
          <View style={styles.phaseStepsRow}>
            <View style={[styles.phaseDot, (status === 'RIDER_ASSIGNED' || status === 'RIDER_ARRIVED_STORE' || status === 'OUT_FOR_DELIVERY') && styles.phaseDotActive]}>
              <Ionicons name="storefront" size={14} color="#ffffff" />
            </View>
            <View style={[styles.phaseLine, (status === 'RIDER_ARRIVED_STORE' || status === 'OUT_FOR_DELIVERY') && styles.phaseLineActive]} />
            <View style={[styles.phaseDot, (status === 'RIDER_ARRIVED_STORE' || status === 'OUT_FOR_DELIVERY') && styles.phaseDotActive]}>
              <Ionicons name="cube" size={14} color="#ffffff" />
            </View>
            <View style={[styles.phaseLine, status === 'OUT_FOR_DELIVERY' && styles.phaseLineActive]} />
            <View style={[styles.phaseDot, status === 'OUT_FOR_DELIVERY' && styles.phaseDotActive]}>
              <Ionicons name="home" size={14} color="#ffffff" />
            </View>
          </View>

          <View style={styles.phaseLabelRow}>
            <Text style={styles.phaseLabel}>To Store</Text>
            <Text style={styles.phaseLabel}>Pickup OTP</Text>
            <Text style={styles.phaseLabel}>To Customer</Text>
          </View>
        </View>
        {/* END phaseCard */}

        {/* Live GPS Route Overview & Google Maps Action */}
        <View style={styles.routeCard}>
          <View style={styles.routeHeaderRow}>
            <View style={styles.routeHeaderLeft}>
              <View style={styles.gpsBlinkDot} />
              <Text style={styles.routeHeaderTitle}>DELIVERY STOPS</Text>
            </View>
            <TouchableOpacity style={styles.mapsPillBtn} onPress={handleOpenMaps} activeOpacity={0.85}>
              <Ionicons name="map" size={14} color="#ffffff" />
              <Text style={styles.mapsPillText}>Google Maps</Text>
            </TouchableOpacity>
          </View>

          {/* Embedded Navigation Map (~180px) */}
          {Platform.OS === 'web' ? (
            <View style={{ height: 180, width: '100%', borderRadius: 12, overflow: 'hidden', marginVertical: 10, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#64748b', textAlign: 'center' }}>
                🗺️ Live map preview available in the mobile app
              </Text>
              <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 6 }}>
                Lat: {currentCoords?.latitude?.toFixed(4) ?? 'N/A'}, Lng: {currentCoords?.longitude?.toFixed(4) ?? 'N/A'}
              </Text>
            </View>
          ) : (
            <View style={{ height: 180, width: '100%', borderRadius: 12, overflow: 'hidden', marginVertical: 10, backgroundColor: '#f1f5f9' }}>
              {MapView ? (
                <MapView
                  ref={mapRef}
                  provider={PROVIDER_GOOGLE}
                  style={{ ...StyleSheet.absoluteFillObject }}
                  initialRegion={{
                    latitude: Number.isFinite(riderLat) ? riderLat : (targetDestination.lat || 20.59),
                    longitude: Number.isFinite(riderLng) ? riderLng : (targetDestination.lng || 78.96),
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                  }}
                  showsUserLocation={false}
                  showsMyLocationButton={false}
                >
                  {/* Target Destination Marker */}
                  {Number.isFinite(targetDestination.lat) && Number.isFinite(targetDestination.lng) && (
                    <Marker
                      coordinate={{ latitude: targetDestination.lat, longitude: targetDestination.lng }}
                      title={targetDestination.name}
                      description={targetDestination.address}
                    >
                      <View style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: targetDestination.role === 'STORE' ? '#ea580c' : '#0284c7',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 2,
                        borderColor: '#ffffff',
                        elevation: 4,
                      }}>
                        <Ionicons
                          name={targetDestination.role === 'STORE' ? 'storefront' : 'home'}
                          size={14}
                          color="#ffffff"
                        />
                      </View>
                    </Marker>
                  )}
                  {/* Rider Live Position Marker */}
                  {Number.isFinite(riderLat) && Number.isFinite(riderLng) && (
                    <Marker
                      coordinate={{ latitude: riderLat, longitude: riderLng }}
                      title="Your Location"
                    />
                  )}

                  {/* Bounded Directions Route Polyline */}
                  {boundedOrigin && Number.isFinite(targetDestination.lat) && Number.isFinite(targetDestination.lng) && apiKey && MapViewDirections ? (
                    <MapViewDirections
                      origin={boundedOrigin}
                      destination={{ latitude: targetDestination.lat, longitude: targetDestination.lng }}
                      apikey={apiKey}
                      strokeWidth={4}
                      strokeColor="#0284c7"
                      mode="DRIVING"
                      onReady={(result) => {
                        setRouteInfo({ distance: result.distance, duration: result.duration });
                      }}
                      onError={(err) => {
                        console.warn('[ActiveNavigationScreen] MapViewDirections error:', err);
                      }}
                    />
                  ) : null}
                </MapView>
              ) : (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: '#64748b' }}>Map not available on this device.</Text>
                </View>
              )}
            </View>
          )}

          {/* Active Trip ETA Banner */}
          {routeInfo && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: '#f0f9ff',
                borderWidth: 1,
                borderColor: '#bae6fd',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 7,
                marginBottom: 10
              }}
            >
              <Ionicons name="time" size={16} color="#0284c7" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#0369a1' }}>
                {targetDestination.role === 'STORE' ? 'To Merchant: ' : 'To Doorstep: '}
                {routeInfo.distance.toFixed(1)} km road route • ~{Math.ceil(routeInfo.duration)} mins away
              </Text>
            </View>
          )}

          {/* Route Stops */}
          <View style={styles.routeStops}>
            {/* Store Stop */}
            <View style={styles.stopRow}>
              <View style={[styles.stopIconCircle, { backgroundColor: '#ea580c' }]}>
                <Ionicons name="storefront" size={16} color="#ffffff" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.stopTitleRow}>
                  <Text style={styles.stopRole}>MERCHANT PICKUP</Text>
                  <TouchableOpacity onPress={() => handleCall(storePhone)} style={styles.callSmallBtn}>
                    <Ionicons name="call" size={12} color="#ea580c" />
                    <Text style={styles.callSmallText}>Call Store</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.stopName}>{storeName}</Text>
                <Text style={styles.stopAddress}>{storeAddress}</Text>
              </View>
            </View>

            {/* Connecting Route Line */}
            <View style={styles.verticalLineWrap}>
              <View style={styles.verticalDashedLine} />
              <View style={styles.riderBeaconWrap}>
                <Ionicons name="bicycle" size={14} color="#0284c7" />
                <Text style={styles.riderBeaconText}>{currentCoords ? 'GPS • '+Math.round(currentCoords.speed || 0)+' km/h' : 'Waiting for GPS'}</Text>
              </View>
            </View>

            {/* Customer Stop */}
            <View style={styles.stopRow}>
              <View style={[styles.stopIconCircle, { backgroundColor: '#0284c7' }]}>
                <Ionicons name="location" size={16} color="#ffffff" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.stopTitleRow}>
                  <Text style={[styles.stopRole, { color: '#0284c7' }]}>CUSTOMER DESTINATION</Text>
                  <TouchableOpacity onPress={() => handleCall(customerPhone)} style={[styles.callSmallBtn, { borderColor: '#0284c7' }]}>
                    <Ionicons name="call" size={12} color="#0284c7" />
                    <Text style={[styles.callSmallText, { color: '#0284c7' }]}>Call Customer</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.stopName}>{customerName}</Text>
                <Text style={styles.stopAddress}>{customerAddress}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <Ionicons name="navigate-circle" size={14} color="#16a34a" />
                  <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '700' }}>
                    GPS: {custLat?.toFixed(4)}°N, {custLng?.toFixed(4)}°E (Confirmed delivery pin)
                  </Text>
                </View>
              </View>
            </View>
          </View>
          {/* END routeStops */}

        </View>
        {/* END routeCard */}

        {/* Payment & COD Badge */}
        <View style={[styles.paymentBanner, isCOD ? styles.paymentCod : styles.paymentPrepaid]}>
          <Ionicons
            name={isCOD ? 'cash' : 'shield-checkmark'}
            size={22}
            color={isCOD ? '#991b1b' : '#166534'}
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.paymentBannerTitle, { color: isCOD ? '#991b1b' : '#166534' }]}>
              {isCOD ? `COLLECT CASH ON DELIVERY: ₹${grandTotal}` : 'PREPAID ORDER — DO NOT COLLECT CASH'}
            </Text>
            <Text style={[styles.paymentBannerSub, { color: isCOD ? '#b91c1c' : '#15803d' }]}>
              {isCOD ? 'Collect exact cash from customer before handing over package' : 'Payment was verified online via Razorpay/UPI'}
            </Text>
          </View>
        </View>

        {/* Order Items Checklist */}
        <View style={styles.itemsCard}>
          <View style={styles.itemsHeader}>
            <Ionicons name="receipt-outline" size={18} color="#0f172a" />
            <Text style={styles.itemsTitle}>Order Items ({itemsCount})</Text>
          </View>
          {items.map((it, idx) => {
            const qty = it.qty || it.quantity || 1;
            const name = it.name || it.product?.name || 'Produce Item';
            const price = it.lineTotal || it.price || 0;
            return (
              <View key={idx} style={styles.itemRow}>
                <View style={styles.itemBullet} />
                <Text style={styles.itemName}>{qty}x {name}</Text>
                <Text style={styles.itemPrice}>₹{price}</Text>
              </View>
            );
          })}
        </View>

        {/* Action Section based on current Status */}
        <View style={styles.actionCard}>
          {status === 'RIDER_ASSIGNED' && (
            <View>
              <Text style={styles.actionPromptTitle}>Step 1: Reach Merchant Store</Text>
              <Text style={styles.actionPromptSub}>
                Navigate to {storeName}. Once you arrive at the store counter, tap below to notify the merchant.
              </Text>
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={handleArrivedAtStore}
                disabled={isSubmitting}
                activeOpacity={0.85}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="storefront-outline" size={20} color="#ffffff" />
                    <Text style={styles.primaryActionBtnText}>I Have Arrived at Store</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {status === 'RIDER_ARRIVED_STORE' && (
            <View>
              <Text style={styles.actionPromptTitle}>Step 2: Collect Parcel & Verify Store OTP</Text>
              <Text style={styles.actionPromptSub}>
                Ask merchant for the 4-digit Store Pickup OTP shown on their Partner dashboard.
              </Text>
              <View style={styles.otpInputWrap}>
                <TextInput
                  style={styles.otpInput}
                  placeholder="Enter 4-digit Store OTP"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  maxLength={4}
                  value={pickupOtpInput}
                  onChangeText={setPickupOtpInput}
                />
              </View>
              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: '#16a34a' }]}
                onPress={handleVerifyPickup}
                disabled={isSubmitting}
                activeOpacity={0.85}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="bag-check-outline" size={20} color="#ffffff" />
                    <Text style={styles.primaryActionBtnText}>Verify OTP & Confirm Pickup</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {status === 'OUT_FOR_DELIVERY' && (
            <View>
              <Text style={styles.actionPromptTitle}>Step 3: Deliver to Customer & Verify OTP</Text>
              <Text style={styles.actionPromptSub}>
                {isCOD ? `1. Collect ₹${grandTotal} cash from customer.\n` : ''}
                Ask customer for their 4-digit Delivery Confirmation OTP shown on their app screen.
              </Text>
              <View style={styles.otpInputWrap}>
                <TextInput
                  style={styles.otpInput}
                  placeholder="Enter Customer Delivery OTP"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  maxLength={4}
                  value={deliveryOtpInput}
                  onChangeText={setDeliveryOtpInput}
                />
              </View>
              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: '#0284c7' }]}
                onPress={handleVerifyDelivery}
                disabled={isSubmitting}
                activeOpacity={0.85}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done-circle" size={22} color="#ffffff" />
                    <Text style={styles.primaryActionBtnText}>Verify OTP & Finish Delivery</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
        {/* END actionCard */}

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#ffffff'
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8
  },
  emptySub: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24
  },
  backBtnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0284c7',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 9999,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  backBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  headerCenter: {
    alignItems: 'center'
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a'
  },
  headerSub: {
    fontSize: 12,
    color: '#0284c7',
    fontWeight: '600',
    marginTop: 1
  },
  iconBtnCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  phaseCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  phaseStepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  phaseDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center'
  },
  phaseDotActive: {
    backgroundColor: '#0284c7'
  },
  phaseLine: {
    flex: 1,
    height: 4,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 8
  },
  phaseLineActive: {
    backgroundColor: '#0284c7'
  },
  phaseLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8
  },
  phaseLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b'
  },
  routeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2
  },
  routeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  routeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  gpsBlinkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a'
  },
  routeHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5
  },
  mapsPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20
  },
  mapsPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  routeStops: {
    paddingLeft: 4
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  stopIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stopTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  stopRole: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ea580c',
    letterSpacing: 0.5
  },
  callSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ea580c'
  },
  callSmallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ea580c'
  },
  stopName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2
  },
  stopAddress: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 18
  },
  verticalLineWrap: {
    paddingLeft: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  verticalDashedLine: {
    width: 2,
    height: 28,
    backgroundColor: '#cbd5e1'
  },
  riderBeaconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  riderBeaconText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7'
  },
  paymentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1.5
  },
  paymentCod: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5'
  },
  paymentPrepaid: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac'
  },
  paymentBannerTitle: {
    fontSize: 13.5,
    fontWeight: '800'
  },
  paymentBannerSub: {
    fontSize: 11.5,
    marginTop: 2,
    fontWeight: '500'
  },
  itemsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12
  },
  itemsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a'
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6
  },
  itemBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0284c7',
    marginRight: 8
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155'
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  actionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#0284c7',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3
  },
  actionPromptTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6
  },
  actionPromptSub: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
    marginBottom: 16
  },
  otpInputWrap: {
    marginBottom: 16
  },
  otpInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 14,
    letterSpacing: 4,
    color: '#0f172a'
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ea580c',
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800'
  }
});
