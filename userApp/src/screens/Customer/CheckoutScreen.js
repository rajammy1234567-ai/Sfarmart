import * as Location from 'expo-location';
import GoogleMap from '../../components/GoogleMap';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
  Animated,
  KeyboardAvoidingView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useCart } from '../../context/CartContext';
import { useApp } from '../../context/AppContext';
import { apiService } from '../../services/api';
import { showAlert } from '../../utils/alert';
import { TactileButton } from '../../components/common/TactileButton';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { reverseGeocode } from '../../utils/maps';
import { SafeImage } from '../../components/common/SafeImage';

export const calculateHaversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return null;
  }
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
const StaggeredBillRow = ({ children, delay = 0, style }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const transY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: Platform.OS !== 'web'
        }),
        Animated.timing(transY, {
          toValue: 0,
          duration: 250,
          useNativeDriver: Platform.OS !== 'web'
        })
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: fadeAnim,
          transform: [{ translateY: transY }]
        }
      ]}
    >
      {children}
    </Animated.View>
  );
};

const AnimatedPayOption = ({ opt, isSelected, onSelect }) => {
  const scaleAnim = useRef(new Animated.Value(isSelected ? 1.02 : 1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isSelected ? 1.02 : 1,
      friction: 5,
      tension: 200,
      useNativeDriver: Platform.OS !== 'web'
    }).start();
  }, [isSelected]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.payOption,
          isSelected && styles.payOptionSelected,
          isSelected && {
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.18,
            shadowRadius: 6,
            elevation: 3
          }
        ]}
        onPress={onSelect}
        activeOpacity={0.8}
      >
        <View
          style={[
            styles.payIconCircle,
            isSelected ? { backgroundColor: '#dcfce7' } : { backgroundColor: '#f1f5f9' }
          ]}
        >
          <Ionicons
            name={opt.icon}
            size={20}
            color={isSelected ? colors.primary : '#64748b'}
          />
        </View>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.payTitle, isSelected && styles.payTitleSelected]}>
              {opt.title}
            </Text>
            {opt.tag && (
              <View style={[styles.payTag, { backgroundColor: opt.tagColor || '#16a34a' }]}>
                <Text style={styles.payTagText}>{opt.tag}</Text>
              </View>
            )}
          </View>
          <Text style={styles.paySub}>{opt.sub}</Text>
        </View>

        <View
          style={[
            styles.radioCircle,
            isSelected && { borderColor: colors.primary, backgroundColor: colors.primary }
          ]}
        >
          {isSelected && <View style={styles.radioDot} />}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export const CheckoutScreen = ({ navigation }) => {
  const { items, vendorId, vendorName, billSummary, placeOrder } = useCart();
  const { userProfile } = useApp();

  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [vendorDetails, setVendorDetails] = useState(null);

  // Consolidated address picker modal state
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [showAdvancedCoords, setShowAdvancedCoords] = useState(false);

  // Coordinate validation helper (handles valid (0, 0) coordinates correctly)
  const isFiniteCoord = useCallback((val, maxAbs = 180) => {
    return val != null && typeof val === 'number' && Number.isFinite(val) && Math.abs(val) <= maxAbs;
  }, []);

  // Address and pin states: Check if existing saved address has verified GPS coordinates
  const savedAddress = userProfile?.addresses?.find((a) => a.isDefault) || userProfile?.addresses?.[0];

  const hasValidSavedPin = Boolean(
    savedAddress &&
    isFiniteCoord(savedAddress.lat, 90) &&
    isFiniteCoord(savedAddress.lng, 180)
  );

  const [deliveryAddress, setDeliveryAddress] = useState({
    name: userProfile?.name || '',
    phone: userProfile?.phone || '',
    line1: savedAddress?.line1 || '',
    landmark: savedAddress?.landmark || '',
    city: savedAddress?.city || '',
    pincode: savedAddress?.pincode || '',
    lat: hasValidSavedPin ? savedAddress.lat : null,
    lng: hasValidSavedPin ? savedAddress.lng : null
  });

  const [pinConfirmed, setPinConfirmed] = useState(hasValidSavedPin);
  const [isSavedAddressReused, setIsSavedAddressReused] = useState(hasValidSavedPin);

  // Explicitly selected delivery pin: null until user drops a pin, uses GPS, or selects an address
  const [selectedPin, setSelectedPin] = useState(
    hasValidSavedPin ? { lat: savedAddress.lat, lng: savedAddress.lng } : null
  );

  // Map viewing center: used solely for viewport camera, NEVER treated as selected pin
  const getInitialMapCenter = useCallback(() => {
    if (hasValidSavedPin) {
      return { lat: savedAddress.lat, lng: savedAddress.lng };
    }
    if (vendorDetails?.location?.coordinates?.length === 2) {
      const vLng = vendorDetails.location.coordinates[0];
      const vLat = vendorDetails.location.coordinates[1];
      if (isFiniteCoord(vLat, 90) && isFiniteCoord(vLng, 180)) {
        return { lat: vLat, lng: vLng };
      }
    }
    return { lat: 30.9010, lng: 75.8573 };
  }, [hasValidSavedPin, savedAddress?.lat, savedAddress?.lng, vendorDetails?.location?.coordinates, isFiniteCoord]);

  const [mapCenter, setMapCenter] = useState(getInitialMapCenter);

  const [tempAddress, setTempAddress] = useState({
    line1: savedAddress?.line1 || '',
    landmark: savedAddress?.landmark || '',
    city: savedAddress?.city || '',
    pincode: savedAddress?.pincode || ''
  });

  const [manualLat, setManualLat] = useState(hasValidSavedPin ? String(savedAddress.lat) : '');
  const [manualLng, setManualLng] = useState(hasValidSavedPin ? String(savedAddress.lng) : '');

  // Sync recipient details from authenticated profile while respecting existing manual input
  useEffect(() => {
    if (userProfile) {
      const saved = userProfile?.addresses?.find((a) => a.isDefault) || userProfile?.addresses?.[0];
      const hasSavedPin = Boolean(
        saved &&
        isFiniteCoord(saved.lat, 90) &&
        isFiniteCoord(saved.lng, 180)
      );

      setDeliveryAddress((prev) => {
        if (!prev.line1 && saved) {
          return {
            name: prev.name || userProfile.name || '',
            phone: prev.phone || userProfile.phone || '',
            line1: saved.line1 || '',
            landmark: saved.landmark || '',
            city: saved.city || '',
            pincode: saved.pincode || '',
            lat: hasSavedPin ? saved.lat : null,
            lng: hasSavedPin ? saved.lng : null
          };
        }
        return {
          ...prev,
          name: prev.name || userProfile.name || '',
          phone: prev.phone || userProfile.phone || ''
        };
      });

      if (hasSavedPin) {
        setPinConfirmed(true);
        setIsSavedAddressReused(true);
        setSelectedPin({ lat: saved.lat, lng: saved.lng });
      }
    }
  }, [userProfile, isFiniteCoord]);

  // Fetch vendor details for live serviceability check
  useEffect(() => {
    if (vendorId) {
      apiService.getVendorById(vendorId).then((res) => {
        if (res?.success && res.vendor) {
          setVendorDetails(res.vendor);
        }
      }).catch((e) => {
        console.warn('Could not fetch vendor details for serviceability check:', e);
      });
    }
  }, [vendorId]);

  // Versioning and asynchronous lookup guards
  const lookupVersionRef = useRef(0);
  const isPickerOpenRef = useRef(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');
  const [pinChangeNotice, setPinChangeNotice] = useState('');
  const [suggestedRoad, setSuggestedRoad] = useState('');
  const [mapTilesReady, setMapTilesReady] = useState(false);
  const [hasReviewedRetainedAddress, setHasReviewedRetainedAddress] = useState(true);

  // Open the consolidated address picker modal
  const openAddressPicker = () => {
    lookupVersionRef.current += 1;
    setIsLocating(false);
    isPickerOpenRef.current = true;
    setIsLocating(false);
    setIsResolvingAddress(false);
    setGeocodeError('');
    setPinChangeNotice('');
    setSuggestedRoad('');
    setHasReviewedRetainedAddress(true);

    // If a valid pin was already confirmed, populate picker with it
    if (isFiniteCoord(deliveryAddress.lat, 90) && isFiniteCoord(deliveryAddress.lng, 180)) {
      const confirmedCoord = { lat: deliveryAddress.lat, lng: deliveryAddress.lng };
      setSelectedPin(confirmedCoord);
      setMapCenter(confirmedCoord);
      setManualLat(String(deliveryAddress.lat));
      setManualLng(String(deliveryAddress.lng));
    } else {
      // No pin confirmed yet: require explicit selection! Map center is NOT a selected pin
      setSelectedPin(null);
      setMapCenter(getInitialMapCenter());
      setManualLat('');
      setManualLng('');
    }

    setTempAddress({
      line1: deliveryAddress.line1 || '',
      landmark: deliveryAddress.landmark || '',
      city: deliveryAddress.city || '',
      pincode: deliveryAddress.pincode || ''
    });
    setShowAddressPicker(true);
  };

  // Close and cancel picker: invalidates all pending async GPS and geocoding operations
  const closeAddressPicker = () => {
    lookupVersionRef.current += 1;
    isPickerOpenRef.current = false;
    setIsLocating(false);
    setIsResolvingAddress(false);
    setGeocodeError('');
    setPinChangeNotice('');
    setSuggestedRoad('');
    setShowAddressPicker(false);
  };

  // Move or drop pin on picker map upon explicit interaction
  const handleSelectPin = async (point) => {
    if (!point || !isFiniteCoord(point.lat, 90) || !isFiniteCoord(point.lng, 180)) {
      showAlert('Invalid Location', 'Coordinates must be valid numbers (Latitude -90 to 90, Longitude -180 to 180).');
      return;
    }
    const validatedPoint = { lat: point.lat, lng: point.lng };

    lookupVersionRef.current += 1;
    const currentVersion = lookupVersionRef.current;
    setIsLocating(false);

    setSelectedPin(validatedPoint);
    setMapCenter(validatedPoint);
    setManualLat(String(point.lat));
    setManualLng(String(point.lng));
    setIsResolvingAddress(true);
    setGeocodeError('');

    // Check if moving to a new area compared to confirmed or saved address
    const refLat = deliveryAddress.lat ?? (hasValidSavedPin ? savedAddress.lat : null);
    const refLng = deliveryAddress.lng ?? (hasValidSavedPin ? savedAddress.lng : null);
    if (refLat !== null && refLng !== null && isFiniteCoord(refLat, 90) && isFiniteCoord(refLng, 180)) {
      const distFromPrevious = calculateHaversineDistanceKm(refLat, refLng, point.lat, point.lng);
      if (distFromPrevious !== null && distFromPrevious > 0.3) {
        setPinChangeNotice(
          `Pin moved ${distFromPrevious.toFixed(1)} km from your previous address. Please review your house / building details below.`
        );
        setHasReviewedRetainedAddress(false);
      } else {
        setPinChangeNotice('');
        setHasReviewedRetainedAddress(true);
      }
    } else {
      setPinChangeNotice('');
      setHasReviewedRetainedAddress(true);
    }

    try {
      const geo = await reverseGeocode(point.lat, point.lng);
      if (lookupVersionRef.current !== currentVersion || !isPickerOpenRef.current) {
        return; // Discard stale or cancelled response!
      }

      const newCity = (geo && geo.city) ? geo.city.trim() : '';
      const newPincode = (geo && geo.pincode) ? geo.pincode.trim() : '';
      const detectedRoad = (geo && (geo.address || geo.area)) ? (geo.address || geo.area).trim() : '';

      setSuggestedRoad(detectedRoad);

      // Requirement 4: Replace location-derived city/pincode together!
      // Missing geocoding fields must NEVER retain unrelated old values from another location.
      setTempAddress((prev) => {
        const hasExistingLine1 = prev.line1.trim().length > 0;
        return {
          ...prev,
          city: newCity,
          pincode: newPincode,
          line1: hasExistingLine1 ? prev.line1 : detectedRoad
        };
      });

      if (!newCity || !newPincode) {
        setGeocodeError(
          !newCity && !newPincode
            ? 'Could not auto-detect city and pincode for this pin. Please enter them manually below.'
            : !newCity
            ? 'Could not auto-detect city. Please enter your city manually below.'
            : 'Could not auto-detect pincode. Please enter postal pincode manually below.'
        );
      }
    } catch (e) {
      if (lookupVersionRef.current !== currentVersion || !isPickerOpenRef.current) return;
      console.warn('Reverse geocode failed on pin selection:', e);
      // Requirement 4: Missing geocoding fields must not retain unrelated old values
      setTempAddress((prev) => ({
        ...prev,
        city: '',
        pincode: ''
      }));
      setGeocodeError('Could not auto-detect address details for this pin. Please fill in City and Pincode manually below.');
    } finally {
      if (lookupVersionRef.current === currentVersion) {
        setIsResolvingAddress(false);
      }
    }
  };

  // Fetch current GPS location (explicit user tap only, no automatic fallback)
  const handleFetchCurrentLocation = async () => {
    lookupVersionRef.current += 1;
    const currentVersion = lookupVersionRef.current;
    setIsLocating(true);
    setGeocodeError('');
    try {
      let lat = null;
      let lng = null;

      const permission = await Location.requestForegroundPermissionsAsync();
      if (lookupVersionRef.current !== currentVersion || !isPickerOpenRef.current) return;

      if (permission.status !== 'granted') {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          const webPos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000
            });
          });
          if (lookupVersionRef.current !== currentVersion || !isPickerOpenRef.current) return;
          lat = webPos.coords.latitude;
          lng = webPos.coords.longitude;
        } else {
          showAlert(
            'Location Permission Denied',
            'Location permission was denied. Please allow permissions in device settings, or search your address.'
          );
          return;
        }
      } else {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (lookupVersionRef.current !== currentVersion || !isPickerOpenRef.current) return;
        lat = position.coords.latitude;
        lng = position.coords.longitude;
      }

      if (lookupVersionRef.current !== currentVersion || !isPickerOpenRef.current) return;

      if (isFiniteCoord(lat, 90) && isFiniteCoord(lng, 180)) {
        await handleSelectPin({ lat, lng });
      } else {
        showAlert('GPS Unavailable', 'Could not detect accurate GPS coordinates. Please search or enter coordinates.');
      }
    } catch (e) {
      if (lookupVersionRef.current === currentVersion && isPickerOpenRef.current) {
        showAlert('GPS Unavailable', e.message || 'Could not retrieve device location. Please search or pick on map.');
      }
    } finally {
      if (lookupVersionRef.current === currentVersion) {
        setIsLocating(false);
      }
    }
  };

  // Apply manual lat/lng from advanced inputs
  const handleApplyManualCoords = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isFiniteCoord(lat, 90) || !isFiniteCoord(lng, 180)) {
      showAlert('Invalid Coordinates', 'Latitude must be between -90 and 90, and longitude between -180 and 180.');
      return;
    }
    handleSelectPin({ lat, lng });
  };

  // Check whether address confirmation can proceed
  const canConfirmAddress = Boolean(
    !isLocating &&
    !isResolvingAddress &&
    selectedPin &&
    isFiniteCoord(selectedPin.lat, 90) &&
    isFiniteCoord(selectedPin.lng, 180) &&
    tempAddress.line1.trim().length > 0 &&
    tempAddress.city.trim().length > 0 &&
    tempAddress.pincode.trim().length > 0 &&
    hasReviewedRetainedAddress
  );

  const getConfirmButtonText = () => {
    if (isLocating) return "Detecting GPS Location...";
    if (isResolvingAddress) return "Resolving Address for Pin...";
    if (!selectedPin) return "Drop or Select Delivery Pin";
    if (!tempAddress.line1.trim()) return "Enter House / Flat Details";
    if (!tempAddress.city.trim()) return "Enter City";
    if (!tempAddress.pincode.trim()) return "Enter Postal Pincode";
    if (!hasReviewedRetainedAddress) return "Review Retained House Details";
    return "Confirm Pin & Use This Address";
  };

  // Confirm and save address from picker
  const handleConfirmAddressPicker = () => {
    if (!selectedPin || !isFiniteCoord(selectedPin.lat, 90) || !isFiniteCoord(selectedPin.lng, 180)) {
      showAlert('Delivery Pin Required', 'Please drop a pin on the map, use current location, or search your address.');
      return;
    }
    if (isLocating || isResolvingAddress) {
      showAlert('Resolving Location', 'Please wait while your pin coordinates and address are verified.');
      return;
    }
    if (!tempAddress.line1.trim()) {
      showAlert('House / Flat Required', 'Please enter your flat, apartment or house number to proceed.');
      return;
    }
    if (!tempAddress.city.trim()) {
      showAlert('City Required', 'Please enter your city to complete delivery details.');
      return;
    }
    if (!tempAddress.pincode.trim()) {
      showAlert('Pincode Required', 'Please enter your postal pincode.');
      return;
    }
    if (!hasReviewedRetainedAddress) {
      showAlert('Review Retained Address', 'Pin has moved. Please review and confirm your house and street details.');
      return;
    }

    // Serviceability distance check
    if (vendorDetails?.location?.coordinates?.length === 2) {
      const vLng = vendorDetails.location.coordinates[0];
      const vLat = vendorDetails.location.coordinates[1];
      const dist = calculateHaversineDistanceKm(vLat, vLng, selectedPin.lat, selectedPin.lng);
      const maxRadius = vendorDetails.deliveryRadiusKm || 7;
      if (dist !== null && dist > maxRadius) {
        showAlert(
          'Location May Be Out of Delivery Range',
          `Your selected pin is ${dist.toFixed(1)} km away from ${vendorDetails.storeName || 'the store'}. This vendor delivers up to ${maxRadius} km.`
        );
      }
    }

    setDeliveryAddress((prev) => ({
      ...prev,
      ...tempAddress,
      lat: selectedPin.lat,
      lng: selectedPin.lng
    }));
    setPinConfirmed(true);
    setIsSavedAddressReused(false);
    closeAddressPicker();
  };
  // Payment Gateway Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // Post-Order Confirmation Receipt Modal
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const receiptScale = useRef(new Animated.Value(0.88)).current;
  const receiptOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (confirmedOrder) {
      receiptScale.setValue(0.88);
      receiptOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(receiptScale, {
          toValue: 1,
          friction: 5,
          tension: 180,
          useNativeDriver: Platform.OS !== 'web'
        }),
        Animated.timing(receiptOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: Platform.OS !== 'web'
        })
      ]).start();
    }
  }, [confirmedOrder]);

  const grandTotal = billSummary?.grandTotal ?? billSummary?.total ?? 0;

  const handleInitiatePayment = async () => {
    if (loading || paymentSubmitting) return;

    if (
      !pinConfirmed ||
      !isFiniteCoord(deliveryAddress.lat, 90) ||
      !isFiniteCoord(deliveryAddress.lng, 180) ||
      !deliveryAddress.line1.trim() ||
      !deliveryAddress.city.trim() ||
      !deliveryAddress.pincode.trim() ||
      !deliveryAddress.name.trim() ||
      !deliveryAddress.phone.trim()
    ) {
      showAlert(
        'Delivery Pin & Address Required',
        'Please confirm your exact delivery pin on the map and complete your recipient contact and house details before proceeding to payment.'
      );
      return;
    }

    // Preserve vendor serviceability range validation
    if (vendorDetails?.location?.coordinates?.length === 2) {
      const vLng = vendorDetails.location.coordinates[0];
      const vLat = vendorDetails.location.coordinates[1];
      const dist = calculateHaversineDistanceKm(vLat, vLng, deliveryAddress.lat, deliveryAddress.lng);
      const maxRadius = vendorDetails.deliveryRadiusKm || 7;
      if (dist !== null && dist > maxRadius) {
        showAlert(
          'Location Out of Delivery Range',
          `Your delivery location is ${dist.toFixed(1)} km away from ${vendorDetails.storeName || 'the store'}. This store delivers within a ${maxRadius} km radius.`
        );
        return;
      }
    }

    if (items.length === 0) {
      showAlert('Cart Empty', 'Your cart is empty');
      return;
    }

    if (billSummary.isMinOrderMet === false && (billSummary.minOrder || 0) > 0) {
      showAlert(
        'Minimum Order Required',
        `Minimum order value for ${vendorName || 'this store'} is ₹${billSummary.minOrder}. Current items total is ₹${billSummary.itemsTotal ?? billSummary.subtotal ?? 0}. Please add ₹${billSummary.minOrderShortfall} more to place order.`
      );
      return;
    }

    // Check store open status live before processing payment
    if (vendorId) {
      try {
        const vRes = await apiService.getVendorById(vendorId);
        if (vRes.success && vRes.vendor && !vRes.vendor.isOpen) {
          showAlert('Store Closed', `${vRes.vendor.storeName || 'This store'} is currently closed and not accepting new orders right now. Please wait until the partner comes online.`);
          return;
        }
      } catch (e) {
        // continue
      }
    }

    if (paymentMethod === 'UPI' || paymentMethod === 'CARD') {
      setShowPaymentModal(true);
      setPaymentSubmitting(false);
    } else {
      // COD or Wallet - process directly
      executeOrderPlacement(paymentMethod);
    }
  };

  // Real Payment Gateway integration with Razorpay
  const handleConfirmGatewayPayment = async () => {
    if (paymentSubmitting || loading) return;
    setPaymentSubmitting(true);

    try {
      const actualPaymentMethod = paymentMethod === 'UPI' ? 'ONLINE_UPI' : 'CARD';
      const order = await placeOrder(deliveryAddress, actualPaymentMethod);

      if (!order || !order._id) {
        throw new Error('Order creation failed. Please try again.');
      }

      setShowPaymentModal(false);
      setPaymentSubmitting(false);

      navigation.navigate('RazorpayCheckout', {
        orderId: order._id,
        onSuccess: async (paymentResponse) => {
          try {
            const verification = await apiService.verifyPayment(paymentResponse);
            if (!verification?.success) {
              showAlert('Payment Verification Failed', verification?.message || 'Payment could not be verified.');
              return;
            }
            navigation.navigate('OrderTracking', {
              orderId: order._id,
              order,
            });
          } catch (error) {
            showAlert('Payment Verification Failed', error?.message || 'Payment could not be verified.');
          }
        },
        onFailure: () => {
          showAlert('Payment Pending', 'Payment was not completed. Your order is still pending; please contact support before trying again.');
        },
      });
    } catch (err) {
      setPaymentSubmitting(false);
      const msg = err?.message || 'Failed to initiate payment. Please try again.';
      showAlert('Payment Error', msg);
    }
  };

  const executeOrderPlacement = async (actualPaymentMethod) => {
    if (loading) return;
    setLoading(true);
    try {
      const order = await placeOrder(deliveryAddress, actualPaymentMethod);
      setLoading(false);
      if (order) {
        setConfirmedOrder(order);
      }
    } catch (err) {
      setLoading(false);
      const msg = err.message || 'Failed to place order. Please try again.';
      showAlert('Order Error', msg);
    }
  };

  const navigateToLiveTracking = () => {
    const orderToTrack = confirmedOrder;
    setConfirmedOrder(null);
    navigation.navigate('OrderTracking', {
      orderId: orderToTrack?._id,
      order: orderToTrack
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order & Payment Verification</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Fast Delivery Banner */}
        <View style={styles.deliveryBanner}>
          <View style={styles.flashCircle}>
            <Ionicons name="flash" size={18} color="#ffffff" />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.deliveryTitle}>Lightning 20–35 Mins Delivery</Text>
            <Text style={styles.deliverySub}>
              Direct delivery from <Text style={{ fontWeight: '700', color: '#0f172a' }}>{vendorName || 'Partner Store'}</Text>
            </Text>
          </View>
        </View>

        {!billSummary.isMinOrderMet && (billSummary.minOrder || 0) > 0 && (
          <View style={styles.minOrderWarningCard}>
            <Ionicons name="warning" size={20} color="#b45309" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.minOrderWarningTitle}>
                Minimum Order Value is ₹{billSummary.minOrder}
              </Text>
              <Text style={styles.minOrderWarningSub}>
                Your items total is ₹{billSummary.itemsTotal ?? billSummary.subtotal ?? 0}. Please add ₹{billSummary.minOrderShortfall} more items to proceed.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.addMoreBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <Text style={styles.addMoreBtnText}>+ Add More</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 1. KYA KYA AAYENGE: Items Verification Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="basket-outline" size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>VERIFY ITEMS TO BE DELIVERED</Text>
            </View>
            <View style={styles.verifiedCountBadge}>
              <Text style={styles.verifiedCountText}>{items.length} Items</Text>
            </View>
          </View>

          <View style={styles.itemsList}>
            {items.map((it, idx) => {
              const p = it.product || {};
              const qty = it.quantity || 1;
              const lineTotal = (p.price || 0) * qty;
              return (
                <View key={p._id || p.id || it.productId || idx} style={styles.itemVerifyRow}>
                  <SafeImage
                    source={{ uri: p.image }}
                    style={styles.itemVerifyImg}
                    placeholderIcon="leaf-outline"
                    placeholderIconSize={20}
                  />

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.itemVerifyName} numberOfLines={1}>
                      {p.name || 'Produce Item'}
                    </Text>
                    <View style={styles.itemVerifyMeta}>
                      <View style={styles.qtyPill}>
                        <Text style={styles.qtyPillText}>{it.quantity}x</Text>
                      </View>
                      <Text style={styles.itemVerifyUnit}>
                        • {p.unit || '1 unit'} @ ₹{p.price}/{p.unit || 'unit'}
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.itemVerifyPrice}>₹{lineTotal}</Text>
                    <View style={styles.inStockBadge}>
                      <Ionicons name="checkmark-circle" size={12} color="#16a34a" />
                      <Text style={styles.inStockText}>In Stock</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* 2. CONSOLIDATED DELIVERY ADDRESS SUMMARY CARD */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="location-outline" size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>DELIVERY ADDRESS</Text>
            </View>
            <TouchableOpacity
              style={styles.changeAddressBtn}
              onPress={openAddressPicker}
              activeOpacity={0.8}
            >
              <Text style={styles.changeAddressBtnText}>
                {pinConfirmed && deliveryAddress.line1 ? 'Change' : 'Set Pin / Address'}
              </Text>
              <Ionicons name="create-outline" size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.addressBox}>
            {/* Recipient Contact - Pre-filled from profile, editable */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldMicroLabel}>Recipient Name</Text>
                <TextInput
                  style={styles.addressInput}
                  placeholder="Recipient name"
                  value={deliveryAddress.name}
                  onChangeText={(name) => setDeliveryAddress((p) => ({ ...p, name }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldMicroLabel}>Phone Number</Text>
                <TextInput
                  style={styles.addressInput}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                  value={deliveryAddress.phone}
                  onChangeText={(phone) => setDeliveryAddress((p) => ({ ...p, phone }))}
                />
              </View>
            </View>

            {/* Address Summary */}
            {pinConfirmed && deliveryAddress.line1 && isFiniteCoord(deliveryAddress.lat, 90) && isFiniteCoord(deliveryAddress.lng, 180) ? (
              <View style={styles.savedAddressSummary}>
                <View style={styles.addressSourceBadgeRow}>
                  <View style={styles.addressSourceBadge}>
                    <Ionicons name={isSavedAddressReused ? "bookmark" : "location"} size={11} color="#15803d" />
                    <Text style={styles.addressSourceBadgeText}>
                      {isSavedAddressReused ? `Saved Address (${savedAddress?.label || 'Home'})` : 'Confirmed Delivery Pin'}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 }}>
                  <Ionicons name="home" size={16} color="#15803d" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.savedAddressLine1}>
                      {deliveryAddress.line1}
                      {deliveryAddress.landmark ? ` (Near ${deliveryAddress.landmark})` : ''}
                    </Text>
                    <Text style={styles.savedAddressCity}>
                      {deliveryAddress.city}{deliveryAddress.city && deliveryAddress.pincode ? ', ' : ''}{deliveryAddress.pincode}
                    </Text>
                  </View>
                </View>

                <View style={styles.pinConfirmedPill}>
                  <Ionicons name="checkmark-circle" size={13} color="#15803d" />
                  <Text style={styles.pinConfirmedPillText}>
                    Rider Drop Pin: {deliveryAddress.lat.toFixed(4)}, {deliveryAddress.lng.toFixed(4)}
                  </Text>
                </View>
              </View>
            ) : deliveryAddress.line1 ? (
              <View style={styles.savedAddressWithMissingPin}>
                <View style={styles.addressSourceBadgeRow}>
                  <View style={styles.savedDetailsBadge}>
                    <Ionicons name="home-outline" size={11} color="#475569" />
                    <Text style={styles.savedDetailsBadgeText}>
                      {savedAddress ? `Saved Address (${savedAddress?.label || 'Home'})` : 'Address Details'}
                    </Text>
                  </View>
                  <View style={styles.missingPinTag}>
                    <Ionicons name="warning" size={11} color="#b45309" />
                    <Text style={styles.missingPinTagText}>Pin Not Confirmed</Text>
                  </View>
                </View>

                <View style={{ marginTop: 4 }}>
                  <Text style={styles.savedAddressLine1}>
                    {deliveryAddress.line1}
                    {deliveryAddress.landmark ? ` (Near ${deliveryAddress.landmark})` : ''}
                  </Text>
                  <Text style={styles.savedAddressCity}>
                    {deliveryAddress.city}{deliveryAddress.city && deliveryAddress.pincode ? ', ' : ''}{deliveryAddress.pincode}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.setPinActionBtn}
                  onPress={openAddressPicker}
                  activeOpacity={0.85}
                >
                  <Ionicons name="map" size={15} color="#ffffff" />
                  <Text style={styles.setPinActionBtnText}>Set Exact Pin on Map</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.noAddressPrompt}>
                <Ionicons name="map-outline" size={24} color="#f59e0b" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.noAddressTitle}>Delivery Pin Not Set</Text>
                  <Text style={styles.noAddressSub}>
                    Choose your exact delivery location on the map so the rider can find your building entrance easily.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.selectPinActionBtn}
                  onPress={openAddressPicker}
                  activeOpacity={0.85}
                >
                  <Text style={styles.selectPinActionBtnText}>Select Pin</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* 3. PAYMENT OPTIONS: PAY KAREGA TAB PLACE HOGA */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="wallet-outline" size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>CHOOSE PAYMENT METHOD</Text>
            </View>
            <View style={styles.secureBadge}>
              <Ionicons name="shield-checkmark" size={12} color="#15803d" />
              <Text style={styles.secureBadgeText}>100% Secure</Text>
            </View>
          </View>

          <View style={styles.paymentOptions}>
            {[
              {
                id: 'COD',
                icon: 'cash-outline',
                title: 'Cash on Delivery',
                sub: 'Pay the rider on delivery',
                tag: null
              },
              {
                id: 'UPI',
                icon: 'flash-outline',
                title: 'UPI (GPay, PhonePe, Paytm, QR)',
                sub: 'Instant & secure via Razorpay',
                tag: 'RECOMMENDED'
              },
              {
                id: 'CARD',
                icon: 'card-outline',
                title: 'Credit / Debit Card',
                sub: 'Visa, Mastercard, RuPay & more via Razorpay',
                tag: null
              }
            ].map((opt) => (
              <AnimatedPayOption
                key={opt.id}
                opt={opt}
                isSelected={paymentMethod === opt.id}
                onSelect={() => setPaymentMethod(opt.id)}
              />
            ))}
          </View>
        </View>

        {/* 4. KITNA RUPYA LAG RAHA H: Itemized Bill Verification */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="receipt-outline" size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>EXACT BILL BREAKDOWN</Text>
            </View>
          </View>

          <StaggeredBillRow delay={0} style={styles.billRow}>
            <Text style={styles.billText}>Item Total ({billSummary.totalCount} items)</Text>
            <Text style={styles.billVal}>₹{billSummary.itemsTotal ?? billSummary.subtotal ?? 0}</Text>
          </StaggeredBillRow>

          <StaggeredBillRow delay={60} style={styles.billRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.billText}>Delivery Partner Fee</Text>
              {billSummary.deliveryFee === 0 && (
                <View style={styles.freeBadge}>
                  <Text style={styles.freeBadgeText}>FREE</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.billVal,
                billSummary.deliveryFee === 0 && { color: '#16a34a', fontWeight: '800' }
              ]}
            >
              {billSummary.deliveryFee === 0 ? '₹0' : `₹${billSummary.deliveryFee}`}
            </Text>
          </StaggeredBillRow>

          {billSummary.taxes > 0 && (
            <StaggeredBillRow delay={120} style={styles.billRow}>
              <Text style={styles.billText}>Govt. Restaurant GST (5%)</Text>
              <Text style={styles.billVal}>₹{billSummary.taxes}</Text>
            </StaggeredBillRow>
          )}

          <View style={styles.dashedLine} />

          <StaggeredBillRow delay={180} style={styles.totalRow}>
            <View>
              <Text style={styles.totalText}>Total Payable</Text>
              <Text style={styles.totalSub}>All inclusive of taxes & fees</Text>
            </View>
            <Text style={styles.totalAmount}>₹{grandTotal}</Text>
          </StaggeredBillRow>
        </View>

        <View style={styles.safetyCard}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#15803d" />
          <Text style={styles.safetyText}>
            S-farmart Guarantee: 100% genuine farm produce & fresh kitchen food, or instant replacement.
          </Text>
        </View>
      </ScrollView>

      {/* Pinned Bottom Payment Bar */}
      <View style={styles.footer}>
        <View style={styles.footerInner}>
          <View>
            <Text style={styles.footerLabel}>TOTAL TO PAY</Text>
            <Text style={styles.footerTotal}>₹{grandTotal}</Text>
            <Text style={styles.footerMethod}>Via {paymentMethod}</Text>
          </View>

          <TactileButton
            style={[styles.payBtn, loading && styles.disabledBtn]}
            onPress={handleInitiatePayment}
            disabled={loading}
            rippleColor="rgba(255, 255, 255, 0.35)"
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Text style={styles.payBtnText}>
                  {!pinConfirmed
                    ? 'Set Delivery Pin to Pay'
                    : (paymentMethod === 'COD' ? 'Confirm COD Order' : `Pay ₹${grandTotal} & Place Order`)}
                </Text>
                <Ionicons name={!pinConfirmed ? "location-outline" : "arrow-forward"} size={18} color="#ffffff" />
              </View>
            )}
          </TactileButton>
        </View>
      </View>

      {/* 5. INTERACTIVE PAYMENT GATEWAY MODAL (UPI / CARDS) */}
      <Modal visible={showPaymentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.paymentModalCard}>
            {/* Modal Header */}
            <View style={styles.paymentModalHeader}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="shield-checkmark" size={18} color="#16a34a" />
                  <Text style={styles.paymentModalTitle}>Razorpay Secure Checkout</Text>
                </View>
                <Text style={styles.paymentModalSub}>100% RBI Authorized & 256-Bit SSL Encrypted</Text>
              </View>
              <TouchableOpacity
                onPress={() => !paymentSubmitting && setShowPaymentModal(false)}
                style={styles.modalCloseBtn}
                disabled={paymentSubmitting}
              >
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Total Amount Badge */}
            <View style={styles.paymentAmountBanner}>
              <Text style={styles.payBannerLabel}>Paying to {vendorName || 'S-farmart'}</Text>
              <Text style={styles.payBannerAmount}>₹{grandTotal}</Text>
            </View>

            {paymentSubmitting ? (
              <View style={styles.processingBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.processingTitle}>Connecting to Razorpay...</Text>
                <Text style={styles.processingSub}>Please do not press back or close the app</Text>
              </View>
            ) : (
              <>
                <View style={styles.tabContent}>
                  <View style={{
                    backgroundColor: '#f8fafc',
                    padding: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    gap: 10
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: '#dcfce7',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Ionicons
                          name={paymentMethod === 'UPI' ? 'flash' : 'card'}
                          size={22}
                          color={colors.primary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>
                          {paymentMethod === 'UPI' ? 'UPI (Google Pay, PhonePe, Paytm, QR)' : 'Credit / Debit Card'}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          {paymentMethod === 'UPI'
                            ? 'Instant payment via any UPI app or dynamic QR'
                            : 'Visa, Mastercard, RuPay, Maestro & more'}
                        </Text>
                      </View>
                    </View>

                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: '#f0fdf4',
                      padding: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#bbf7d0'
                    }}>
                      <Ionicons name="shield-checkmark" size={16} color="#15803d" />
                      <Text style={{ fontSize: 11.5, color: '#15803d', fontWeight: '600', flex: 1 }}>
                        Payment entry is handled directly on Razorpay's secure checkout. No card numbers, CVVs, or UPI PINs are collected here.
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Pay Action Button */}
                <TouchableOpacity
                  style={styles.gatewaySubmitBtn}
                  onPress={handleConfirmGatewayPayment}
                  activeOpacity={0.85}
                >
                  <Ionicons name="lock-closed" size={18} color="#ffffff" />
                  <Text style={styles.gatewaySubmitText}>
                    Proceed to Razorpay (₹{grandTotal})
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* 6. POST-PAYMENT ORDER RECEIPT & CONFIRMATION MODAL */}
      <Modal visible={!!confirmedOrder} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.receiptCard,
              {
                opacity: receiptOpacity,
                transform: [{ scale: receiptScale }]
              }
            ]}
          >
            <View style={styles.receiptHeader}>
              <View style={styles.receiptTickCircle}>
                <Ionicons name="checkmark" size={32} color="#ffffff" />
              </View>
              <Text style={styles.receiptTitle}>Order Confirmed & Paid!</Text>
              <Text style={styles.receiptOrderNum}>
                Order #{confirmedOrder?.orderNumber || confirmedOrder?._id?.slice(-6)}
              </Text>
            </View>

            <View style={styles.receiptBody}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Store</Text>
                <Text style={styles.receiptValue}>{vendorName || 'Partner Store'}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Total Amount Paid</Text>
                <Text style={[styles.receiptValue, { color: '#16a34a', fontWeight: '800' }]}>
                  ₹{confirmedOrder?.pricing?.grandTotal || grandTotal} ({confirmedOrder?.payment?.method || paymentMethod})
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Delivery OTP</Text>
                <Text style={[styles.receiptValue, { letterSpacing: 2, fontWeight: '800' }]}>
                  {confirmedOrder?.deliveryOtp || '9018'}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Delivering To</Text>
                <Text style={styles.receiptValue} numberOfLines={1}>
                  {deliveryAddress?.name || 'Customer'}, {deliveryAddress?.line1 || ''}
                </Text>
              </View>

              <View style={styles.receiptItemsBox}>
                <Text style={styles.receiptItemsTitle}>VERIFIED ITEMS COMING:</Text>
                {confirmedOrder?.items?.map((it, i) => (
                  <Text key={i} style={styles.receiptItemLine}>
                    • {it.qty ?? it.quantity ?? 1}x {it.name || 'Produce Item'} ({it.unit || '1 unit'}) — ₹{it.lineTotal || (it.price || 0) * (it.qty ?? it.quantity ?? 1)}
                  </Text>
                ))}
              </View>
            </View>

            <TactileButton
              style={styles.trackOrderBtn}
              onPress={navigateToLiveTracking}
              rippleColor="rgba(255, 255, 255, 0.35)"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Text style={styles.trackOrderBtnText}>Track Live Order In Real-Time</Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </View>
            </TactileButton>
          </Animated.View>
        </View>
      </Modal>

      {/* 7. CONSOLIDATED SINGLE ADDRESS PICKER MODAL */}
      <Modal
        visible={showAddressPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeAddressPicker}
      >
        <SafeAreaView style={styles.pickerModalContainer} edges={['top', 'left', 'right', 'bottom']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* Modal Header */}
            <View style={styles.pickerModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerModalTitle}>Select Delivery Pin & Address</Text>
                <Text style={styles.pickerModalSubtitle}>Pin drop location will be used by the delivery rider</Text>
              </View>
              <TouchableOpacity
                style={styles.pickerCloseBtn}
                onPress={closeAddressPicker}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.pickerScroll}
              contentContainerStyle={styles.pickerScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* GPS Action Button */}
              <TouchableOpacity
                style={styles.gpsActionBtn}
                onPress={handleFetchCurrentLocation}
                disabled={isLocating}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isLocating ? 'reload-outline' : 'navigate'}
                  size={16}
                  color="#15803d"
                />
                <Text style={styles.gpsActionBtnText}>
                  {isLocating ? 'Detecting Real GPS Location...' : '📍 Use Current Location (Real GPS)'}
                </Text>
              </TouchableOpacity>

              {/* Address Search via GooglePlacesAutocomplete */}
              <View style={styles.searchWrapper}>
                <GooglePlacesAutocomplete
                  placeholder="Search delivery area, building or road"
                  fetchDetails={true}
                  onPress={(data, details = null) => {
                    const lat = details?.geometry?.location?.lat;
                    const lng = details?.geometry?.location?.lng;
                    if (lat && lng && Number.isFinite(lat) && Number.isFinite(lng)) {
                      handleSelectPin({ lat, lng });
                    }
                  }}
                  query={{
                    key: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
                    language: 'en'
                  }}
                  styles={{
                    container: { width: '100%', zIndex: 1000 },
                    textInputContainer: { backgroundColor: 'transparent' },
                    textInput: styles.searchPlacesInput,
                    listView: styles.searchPlacesListView,
                    row: { padding: 12 },
                    description: { fontSize: 13, color: '#334155' }
                  }}
                  enablePoweredByContainer={false}
                  keyboardShouldPersistTaps="handled"
                />
              </View>

              {/* The ONE and ONLY Google Map in Checkout */}
              <View style={styles.pickerMapCard}>
                <GoogleMap
                  points={
                    selectedPin && isFiniteCoord(selectedPin.lat, 90) && isFiniteCoord(selectedPin.lng, 180)
                      ? [{ ...selectedPin, label: 'Delivery Pin', id: 'checkout_delivery_pin' }]
                      : []
                  }
                  initialCenter={mapCenter}
                  onSelect={handleSelectPin}
                  onTilesLoadedChange={setMapTilesReady}
                />
                <View style={styles.mapHintOverlay}>
                  <Text style={styles.mapHintText}>
                    {mapTilesReady
                      ? '👆 Tap map or drag marker to set your exact entrance pin'
                      : '⚠️ If map appears dark, tap "Use Current Location (GPS)" or search above.'}
                  </Text>
                </View>
              </View>

              {/* Selected Pin & Serviceability Details */}
              <View style={styles.pinDetailsBox}>
                <View style={styles.pinDetailRow}>
                  <Ionicons
                    name={selectedPin ? "location" : "location-outline"}
                    size={16}
                    color={selectedPin ? "#15803d" : "#f59e0b"}
                  />
                  <Text style={[styles.pinDetailText, !selectedPin && { color: "#b45309" }]}>
                    {selectedPin && isFiniteCoord(selectedPin.lat, 90) && isFiniteCoord(selectedPin.lng, 180)
                      ? `Selected Coordinates: ${selectedPin.lat.toFixed(4)}, ${selectedPin.lng.toFixed(4)}`
                      : 'No pin dropped yet (Tap map, search address, or click GPS)'}
                  </Text>
                </View>

                {/* Live Distance to Vendor / Serviceability indicator */}
                {vendorDetails?.location?.coordinates?.length === 2 &&
                  selectedPin && isFiniteCoord(selectedPin.lat, 90) && isFiniteCoord(selectedPin.lng, 180) && (
                    (() => {
                      const vLng = vendorDetails.location.coordinates[0];
                      const vLat = vendorDetails.location.coordinates[1];
                      const dist = calculateHaversineDistanceKm(vLat, vLng, selectedPin.lat, selectedPin.lng);
                      const maxRadius = vendorDetails.deliveryRadiusKm || 7;
                      const isOutOfRange = dist !== null && dist > maxRadius;
                      return (
                        <View
                          style={[
                            styles.serviceabilityBadge,
                            isOutOfRange ? styles.serviceabilityBadgeWarning : styles.serviceabilityBadgeOk
                          ]}
                        >
                          <Ionicons
                            name={isOutOfRange ? 'warning-outline' : 'checkmark-circle-outline'}
                            size={14}
                            color={isOutOfRange ? '#b45309' : '#15803d'}
                          />
                          <Text
                            style={[
                              styles.serviceabilityText,
                              isOutOfRange ? { color: '#b45309' } : { color: '#15803d' }
                            ]}
                          >
                            {dist !== null ? `${dist.toFixed(1)} km from store` : ''} • Store radius: {maxRadius} km {isOutOfRange ? '(Out of range)' : '(Serviceable)'}
                          </Text>
                        </View>
                      );
                    })()
                  )}
              </View>

              {/* Resolving spinner or explicit geocoding notice */}
              {isResolvingAddress && (
                <View style={styles.resolvingBox}>
                  <ActivityIndicator size="small" color="#16a34a" />
                  <Text style={styles.resolvingText}>Resolving address details for selected pin...</Text>
                </View>
              )}

              {Boolean(geocodeError) && (
                <View style={styles.geocodeErrorBox}>
                  <Ionicons name="warning-outline" size={16} color="#b45309" />
                  <Text style={styles.geocodeErrorText}>{geocodeError}</Text>
                </View>
              )}

              {/* Required Essentials: House/Flat, Landmark, City, Pincode */}
              <View style={styles.essentialsCard}>
                <Text style={styles.essentialsTitle}>ADDRESS DETAILS</Text>

                {/* Retained House Review Notice if pin moved significantly */}
                {Boolean(pinChangeNotice) && !hasReviewedRetainedAddress && (
                  <View style={styles.retainedNoticeCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <Ionicons name="information-circle" size={18} color="#b45309" style={{ marginTop: 1 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.retainedNoticeText}>{pinChangeNotice}</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          {Boolean(suggestedRoad) && (
                            <TouchableOpacity
                              style={styles.retainedActionBtnPrimary}
                              onPress={() => {
                                setTempAddress((p) => ({ ...p, line1: suggestedRoad }));
                                setHasReviewedRetainedAddress(true);
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.retainedActionBtnPrimaryText}>
                                Use "{suggestedRoad}"
                              </Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={styles.retainedActionBtnSecondary}
                            onPress={() => setHasReviewedRetainedAddress(true)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.retainedActionBtnSecondaryText}>
                              Keep "{tempAddress.line1}"
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                )}

                <Text style={styles.pickerFieldLabel}>House / Flat / Apartment / Street *</Text>
                <TextInput
                  style={styles.pickerInput}
                  placeholder="e.g. Flat 302, Green Valley Apartments"
                  value={tempAddress.line1}
                  onChangeText={(txt) => {
                    setTempAddress((p) => ({ ...p, line1: txt }));
                    setHasReviewedRetainedAddress(true);
                  }}
                />

                <Text style={styles.pickerFieldLabel}>Landmark (Optional)</Text>
                <TextInput
                  style={styles.pickerInput}
                  placeholder="e.g. Near Rose Garden, Opposite Metro Station"
                  value={tempAddress.landmark}
                  onChangeText={(txt) => setTempAddress((p) => ({ ...p, landmark: txt }))}
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerFieldLabel}>City *</Text>
                    <TextInput
                      style={styles.pickerInput}
                      placeholder="City"
                      value={tempAddress.city}
                      onChangeText={(txt) => setTempAddress((p) => ({ ...p, city: txt }))}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerFieldLabel}>Pincode *</Text>
                    <TextInput
                      style={styles.pickerInput}
                      placeholder="Pincode"
                      keyboardType="number-pad"
                      value={tempAddress.pincode}
                      onChangeText={(txt) => setTempAddress((p) => ({ ...p, pincode: txt }))}
                    />
                  </View>
                </View>

                {/* Advanced: Manual Lat / Lng Entry behind toggle */}
                <TouchableOpacity
                  style={styles.advancedToggleBtn}
                  onPress={() => setShowAdvancedCoords(!showAdvancedCoords)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showAdvancedCoords ? 'chevron-down' : 'chevron-forward'}
                    size={15}
                    color="#64748b"
                  />
                  <Text style={styles.advancedToggleBtnText}>
                    {showAdvancedCoords ? 'Hide Manual Coordinates Entry' : 'Advanced: Enter Coordinates Manually'}
                  </Text>
                </TouchableOpacity>

                {showAdvancedCoords && (
                  <View style={styles.advancedBox}>
                    <Text style={styles.advancedHelpText}>
                      Enter precise latitude and longitude values (-90 to 90, -180 to 180):
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                      <TextInput
                        style={[styles.pickerInput, { flex: 1, marginBottom: 0 }]}
                        placeholder="Latitude (e.g. 30.9010)"
                        keyboardType="numeric"
                        value={manualLat}
                        onChangeText={setManualLat}
                      />
                      <TextInput
                        style={[styles.pickerInput, { flex: 1, marginBottom: 0 }]}
                        placeholder="Longitude (e.g. 75.8573)"
                        keyboardType="numeric"
                        value={manualLng}
                        onChangeText={setManualLng}
                      />
                      <TouchableOpacity
                        style={styles.applyCoordsBtn}
                        onPress={handleApplyManualCoords}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.applyCoordsBtnText}>Apply</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Confirm Button Accessible Above Keyboard & Safe Area */}
            <View style={[styles.pickerFooter, { paddingBottom: Math.max(insets.bottom, 14) }]}>
              <TouchableOpacity
                style={[
                  styles.confirmPinActionBtn,
                  !canConfirmAddress && styles.confirmPinActionBtnDisabled
                ]}
                onPress={handleConfirmAddressPicker}
                disabled={!canConfirmAddress}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={canConfirmAddress ? "checkmark-circle" : "alert-circle-outline"}
                  size={18}
                  color="#ffffff"
                />
                <Text style={styles.confirmPinActionBtnText}>
                  {getConfirmButtonText()}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  scrollFlex: {
    flex: 1
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  headerTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0f172a'
  },
  backBtn: {
    padding: 4
  },
  content: {
    padding: 16,
    paddingBottom: 32
  },
  deliveryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 14
  },
  minOrderWarningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: 14
  },
  minOrderWarningTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400e'
  },
  minOrderWarningSub: {
    fontSize: 11.5,
    color: '#78350f',
    marginTop: 2
  },
  addMoreBtn: {
    backgroundColor: '#d97706',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 8
  },
  addMoreBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '800'
  },
  flashCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center'
  },
  deliveryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#166534'
  },
  deliverySub: {
    fontSize: 12.5,
    color: '#475569',
    marginTop: 2
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.5
  },
  verifiedCountBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  verifiedCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d'
  },
  homeTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284c7',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  secureBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d'
  },
  itemsList: {
    gap: 12
  },
  itemVerifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4
  },
  itemVerifyImg: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f1f5f9'
  },
  itemVerifyImgPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemVerifyName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0f172a'
  },
  itemVerifyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3
  },
  qtyPill: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4
  },
  qtyPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a'
  },
  itemVerifyUnit: {
    fontSize: 11.5,
    color: '#64748b'
  },
  itemVerifyPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a'
  },
  inStockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2
  },
  inStockText: {
    fontSize: 10,
    color: '#16a34a',
    fontWeight: '600'
  },
  addressBox: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 12
  },
  addressRecipient: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6
  },
  addressInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
    marginBottom: 6
  },
  addressCity: {
    fontSize: 12,
    color: '#64748b'
  },
  paymentOptions: {
    gap: 10
  },
  payOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff'
  },
  payOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: '#f0fdf4'
  },
  payIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  },
  payTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1e293b'
  },
  payTitleSelected: {
    color: '#15803d'
  },
  payTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  payTagText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800'
  },
  paySub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff'
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5
  },
  billText: {
    fontSize: 13,
    color: '#475569'
  },
  billVal: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0f172a'
  },
  freeBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4
  },
  freeBadgeText: {
    color: '#15803d',
    fontSize: 10,
    fontWeight: '800'
  },
  dashedLine: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 10
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4
  },
  totalText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a'
  },
  totalSub: {
    fontSize: 11,
    color: '#64748b'
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: '#15803d'
  },
  safetyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 10
  },
  safetyText: {
    fontSize: 11.5,
    color: '#166534',
    flex: 1,
    lineHeight: 16
  },
  footer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8
  },
  footerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  footerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5
  },
  footerTotal: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a'
  },
  footerMethod: {
    fontSize: 11,
    color: '#15803d',
    fontWeight: '700'
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 22,
    gap: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  disabledBtn: {
    opacity: 0.6
  },
  payBtnText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '800'
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 16 : 0
  },
  paymentModalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderRadius: Platform.OS === 'web' ? 24 : 0,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16
  },
  paymentModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  paymentModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  paymentModalSub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2
  },
  modalCloseBtn: {
    padding: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 16
  },
  paymentAmountBanner: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  payBannerLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600'
  },
  payBannerAmount: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 2
  },
  gatewayTabs: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14
  },
  gatewayTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10
  },
  gatewayTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1
  },
  gatewayTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b'
  },
  gatewayTabTextActive: {
    color: '#0f172a',
    fontWeight: '800'
  },
  tabContent: {
    marginBottom: 16
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8
  },
  upiAppsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  upiAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff'
  },
  upiAppBtnSelected: {
    borderColor: colors.primary,
    backgroundColor: '#f0fdf4'
  },
  upiAppBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155'
  },
  upiAppBtnTextSelected: {
    color: '#15803d'
  },
  upiInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff'
  },
  upiInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a'
  },
  verifiedUpiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  verifiedUpiText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a'
  },
  qrTabContent: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 16
  },
  qrBox: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0'
  },
  qrScanText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 10
  },
  qrSub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2
  },
  cardInput: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#ffffff'
  },
  gatewaySubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  gatewaySubmitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800'
  },
  processingBox: {
    alignItems: 'center',
    paddingVertical: 36
  },
  processingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 16
  },
  processingSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4
  },
  successBox: {
    alignItems: 'center',
    paddingVertical: 32
  },
  successTickCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#15803d'
  },
  successSub: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4
  },
  // Receipt Modal
  receiptCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 20
  },
  receiptHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 16
  },
  receiptTickCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10
  },
  receiptTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a'
  },
  receiptOrderNum: {
    fontSize: 13,
    color: '#15803d',
    fontWeight: '700',
    marginTop: 2
  },
  receiptBody: {
    paddingVertical: 14,
    gap: 8
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  receiptLabel: {
    fontSize: 12.5,
    color: '#64748b'
  },
  receiptValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  receiptItemsBox: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 10,
    marginTop: 6
  },
  receiptItemsTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 4
  },
  receiptItemLine: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '500',
    marginVertical: 2
  },
  trackOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 12
  },
  trackOrderBtnText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '800'
  },
  // Address Summary & Picker Styles
  changeAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  changeAddressBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary
  },
  fieldMicroLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 3,
    textTransform: 'uppercase'
  },
  addressSourceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  addressSourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  addressSourceBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#15803d'
  },
  savedDetailsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6
  },
  savedDetailsBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569'
  },
  missingPinTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  missingPinTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#b45309'
  },
  savedAddressSummary: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 4
  },
  savedAddressWithMissingPin: {
    backgroundColor: '#fffdf5',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginTop: 4
  },
  setPinActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 10
  },
  setPinActionBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '800'
  },
  savedAddressLine1: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0f172a',
    lineHeight: 18
  },
  savedAddressCity: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  pinConfirmedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  pinConfirmedPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d'
  },
  noAddressPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fef3c7',
    marginTop: 4
  },
  noAddressTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e'
  },
  noAddressSub: {
    fontSize: 11,
    color: '#b45309',
    marginTop: 1
  },
  selectPinActionBtn: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 8
  },
  selectPinActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  // Picker Modal Styles
  pickerModalContainer: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  pickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff'
  },
  pickerModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  pickerModalSubtitle: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1
  },
  pickerCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9'
  },
  pickerScroll: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  pickerScrollContent: {
    padding: 14,
    paddingBottom: 24
  },
  gpsActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 12
  },
  gpsActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803d'
  },
  searchWrapper: {
    marginBottom: 12,
    zIndex: 1000
  },
  searchPlacesInput: {
    height: 44,
    color: '#0f172a',
    fontSize: 13.5,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12
  },
  searchPlacesListView: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    zIndex: 1001,
    marginTop: 4
  },
  pickerMapCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#e2e8f0',
    marginBottom: 12,
    position: 'relative'
  },
  mapHintOverlay: {
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center'
  },
  mapHintText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600'
  },
  pinDetailsBox: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12
  },
  pinDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  pinDetailText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1
  },
  serviceabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    padding: 8,
    borderRadius: 8
  },
  serviceabilityBadgeOk: {
    backgroundColor: '#f0fdf4'
  },
  serviceabilityBadgeWarning: {
    backgroundColor: '#fef3c7'
  },
  serviceabilityText: {
    fontSize: 11.5,
    fontWeight: '600'
  },
  essentialsCard: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  essentialsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 10,
    letterSpacing: 0.5
  },
  pickerFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
    marginTop: 4
  },
  pickerInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
    marginBottom: 8
  },
  advancedToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    marginTop: 4
  },
  advancedToggleBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748b'
  },
  advancedBox: {
    backgroundColor: '#f1f5f9',
    padding: 10,
    borderRadius: 8,
    marginTop: 4
  },
  advancedHelpText: {
    fontSize: 10.5,
    color: '#64748b'
  },
  applyCoordsBtn: {
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 8
  },
  applyCoordsBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  pickerFooter: {
    padding: 14,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0'
  },
  confirmPinActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12
  },
  confirmPinActionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  confirmPinActionBtnDisabled: {
    backgroundColor: '#94a3b8'
  },
  resolvingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12
  },
  resolvingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803d'
  },
  geocodeErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12
  },
  geocodeErrorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
    flex: 1
  },
  retainedNoticeCard: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12
  },
  retainedNoticeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
    lineHeight: 16
  },
  retainedActionBtnPrimary: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  retainedActionBtnPrimaryText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700'
  },
  retainedActionBtnSecondary: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  retainedActionBtnSecondaryText: {
    color: '#334155',
    fontSize: 11.5,
    fontWeight: '700'
  }
});
