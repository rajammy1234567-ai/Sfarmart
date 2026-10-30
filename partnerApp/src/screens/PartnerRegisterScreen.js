import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  Platform,
  Image,
  useWindowDimensions,
  Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePartner } from '../context/PartnerContext';
import { colors } from '../theme/colors';
import { GlassCard } from '../components/GlassCard';
import { WaterBackground } from '../components/WaterBackground';
import { MapView, Marker, PROVIDER_GOOGLE } from '../components/MapViewWrapper';

const LOGO = require('../../assets/farmart_logo.png');

const STORE_TYPES = [
  { key: 'KIRANA', label: 'Kirana / Grocery', icon: 'basket-outline' },
  { key: 'HOME_CHEF', label: 'Home Chef / Kitchen', icon: 'restaurant-outline' },
  { key: 'FARMER', label: 'Farmer / Fresh Produce', icon: 'leaf-outline' },
  { key: 'DAIRY', label: 'Dairy & Milk', icon: 'water-outline' },
  { key: 'BAKERY', label: 'Bakery & Confectionery', icon: 'nutrition-outline' }
];

export const PartnerRegisterScreen = ({ navigation, onNavigateToLogin }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;

  const { registerVendor } = usePartner();

  // Multi-step state: 1 = Owner, 2 = Shop Details, 3 = Location & Pin
  const [currentStep, setCurrentStep] = useState(1);

  // Form State (Non-sensitive values preserved across steps)
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState('KIRANA');

  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');

  // Map & Pin Selection State
  // Initial default display coordinates (India centroid region)
  const [selectedLat, setSelectedLat] = useState(null);
  const [selectedLng, setSelectedLng] = useState(null);
  const [isPinConfirmed, setIsPinConfirmed] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Submission & Feedback State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isRegisteredSuccess, setIsRegisteredSuccess] = useState(false);
  const [registeredVendorInfo, setRegisteredVendorInfo] = useState(null);

  const submitPendingRef = useRef(false);
  const mapRef = useRef(null);

  const handleReturnToLogin = () => {
    if (typeof onNavigateToLogin === 'function') {
      onNavigateToLogin();
    } else if (navigation && typeof navigation.navigate === 'function') {
      navigation.navigate('Login');
    }
  };

  // Step 1 Validation
  const validateStep1 = () => {
    setErrorMessage('');
    const cleanName = ownerName.trim();
    if (!cleanName || cleanName.length < 2) {
      setErrorMessage('Please enter owner full name (at least 2 characters)');
      return false;
    }
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    if (!/^\d{10}$/.test(cleanPhone)) {
      setErrorMessage('Please enter a valid 10-digit Indian phone number');
      return false;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long');
      return false;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter');
      return false;
    }
    return true;
  };

  // Step 2 Validation
  const validateStep2 = () => {
    setErrorMessage('');
    const cleanStore = storeName.trim();
    if (!cleanStore || cleanStore.length < 2) {
      setErrorMessage('Please enter your shop or business name (at least 2 characters)');
      return false;
    }
    if (!storeType) {
      setErrorMessage('Please select a store category');
      return false;
    }
    return true;
  };

  // GPS Current Location Detection
  const handleDetectLocation = async () => {
    setIsLocating(true);
    setErrorMessage('');
    try {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position?.coords?.latitude;
            const lng = position?.coords?.longitude;
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              setSelectedLat(Number(lat.toFixed(6)));
              setSelectedLng(Number(lng.toFixed(6)));
              setIsPinConfirmed(false); // User must still explicitly confirm
              if (mapRef.current && typeof mapRef.current.animateToRegion === 'function') {
                mapRef.current.animateToRegion({
                  latitude: lat,
                  longitude: lng,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005
                }, 800);
              }
            }
            setIsLocating(false);
          },
          (err) => {
            console.warn('[GPS Detection Error]', err);
            setIsLocating(false);
            Alert.alert(
              'Location Access',
              'Could not detect GPS location automatically. You can manually tap on the map or enter coordinates below.'
            );
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
        );
      } else {
        setIsLocating(false);
        Alert.alert('GPS Unavailable', 'Please manually adjust the map pin or enter coordinates.');
      }
    } catch (e) {
      setIsLocating(false);
      console.warn('GPS detection failure:', e);
    }
  };

  // Explicit Pin Confirmation
  const handleConfirmPin = () => {
    if (!Number.isFinite(selectedLat) || !Number.isFinite(selectedLng)) {
      setErrorMessage('Please pick a location pin on the map first');
      return;
    }
    if (selectedLat < -90 || selectedLat > 90 || selectedLng < -180 || selectedLng > 180) {
      setErrorMessage('Coordinates out of range. Please adjust map pin');
      return;
    }
    setIsPinConfirmed(true);
    setErrorMessage('');
  };

  // Final Submission
  const handleSubmitRegistration = async () => {
    if (submitPendingRef.current || isSubmitting) return;

    setErrorMessage('');

    // Validate Address
    const cleanLine1 = line1.trim();
    if (!cleanLine1 || cleanLine1.length < 3) {
      setErrorMessage('Please enter shop street address / premise (at least 3 characters)');
      return;
    }
    const cleanPincode = pincode.trim();
    if (!/^\d{6}$/.test(cleanPincode)) {
      setErrorMessage('Please enter a valid 6-digit postal pincode');
      return;
    }

    // Require Explicit Confirmation of Map Coordinates
    if (!isPinConfirmed || !Number.isFinite(selectedLat) || !Number.isFinite(selectedLng)) {
      setErrorMessage('Please explicitly tap "Confirm Shop Pin" to verify your pickup location on the map');
      return;
    }

    submitPendingRef.current = true;
    setIsSubmitting(true);

    try {
      const cleanPhone = phone.trim().replace(/[\s-]/g, '');
      const registrationPayload = {
        ownerName: ownerName.trim(),
        phone: cleanPhone,
        password,
        storeName: storeName.trim(),
        storeType,
        address: {
          line1: cleanLine1,
          city: city.trim(),
          pincode: cleanPincode
        },
        coordinates: [selectedLng, selectedLat] // [lng, lat] GeoJSON format
      };

      const res = await registerVendor(registrationPayload);

      if (res && res.success && res.pendingApproval) {
        setIsRegisteredSuccess(true);
        setRegisteredVendorInfo(res.vendor);
        // Clean transient password from component memory
        setPassword('');
        setConfirmPassword('');
      } else {
        setErrorMessage(res?.message || 'Registration failed. Please check the provided information.');
      }
    } catch (err) {
      setErrorMessage('Network connection error. Please try again.');
    } finally {
      submitPendingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // SUCCESS VIEW: Registration Pending Approval
  if (isRegisteredSuccess) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        <WaterBackground />
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, 24) + 40,
              paddingBottom: Math.max(insets.bottom, 20) + 40,
              maxWidth: isTablet ? 540 : '100%',
              alignSelf: 'center',
              width: '100%'
            }
          ]}
          showsVerticalScrollIndicator={false}
        >
          <GlassCard style={styles.card} showSheen={true}>
            <View style={styles.successIconBadge}>
              <Ionicons name="time-outline" size={42} color="#ea580c" />
            </View>

            <Text style={styles.successTitle}>Application Submitted!</Text>
            <Text style={styles.successSub}>
              Your partner store application for <Text style={{ fontWeight: '800', color: '#0f172a' }}>{registeredVendorInfo?.storeName || storeName}</Text> has been received.
            </Text>

            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Ionicons name="storefront-outline" size={18} color="#64748b" />
                <Text style={styles.infoLabel}>Shop:</Text>
                <Text style={styles.infoValue}>{registeredVendorInfo?.storeName || storeName}</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={18} color="#64748b" />
                <Text style={styles.infoLabel}>Owner:</Text>
                <Text style={styles.infoValue}>{registeredVendorInfo?.ownerName || ownerName}</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={18} color="#64748b" />
                <Text style={styles.infoLabel}>Phone:</Text>
                <Text style={styles.infoValue}>+91 {registeredVendorInfo?.phone || phone}</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="shield-outline" size={18} color="#64748b" />
                <Text style={styles.infoLabel}>Status:</Text>
                <Text style={[styles.infoValue, { color: '#ea580c', fontWeight: '800' }]}>Pending Admin Approval</Text>
              </View>
            </View>

            <View style={styles.approvalNoteBox}>
              <Ionicons name="information-circle-outline" size={20} color="#0284c7" />
              <Text style={styles.approvalNoteText}>
                Our operations team reviews each store verification. Once approved by administration, you can sign in with your phone and password to manage catalog, pricing, and live orders.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleReturnToLogin}
              accessibilityRole="button"
              accessibilityLabel="Return to Partner Login"
            >
              <Ionicons name="arrow-back" size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>Return to Partner Login</Text>
            </TouchableOpacity>
          </GlassCard>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <WaterBackground />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20) + 16,
            paddingBottom: Math.max(insets.bottom, 20) + 40,
            maxWidth: isTablet ? 540 : '100%',
            alignSelf: 'center',
            width: '100%'
          }
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand Header */}
        <View style={styles.header}>
          <View style={styles.logoGlassGlow}>
            <Image source={LOGO} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={styles.brandTitle}>Register Your Shop</Text>
          <Text style={styles.brandSub}>
            Join Farmart Partner Network • Direct kitchen duty & store delivery
          </Text>
        </View>

        {/* Step Indicator Progress */}
        <View style={styles.progressRow}>
          <View style={[styles.stepDot, currentStep >= 1 && styles.stepDotActive]}>
            <Text style={[styles.stepDotNum, currentStep >= 1 && styles.stepDotNumActive]}>1</Text>
          </View>
          <View style={[styles.stepLine, currentStep >= 2 && styles.stepLineActive]} />
          <View style={[styles.stepDot, currentStep >= 2 && styles.stepDotActive]}>
            <Text style={[styles.stepDotNum, currentStep >= 2 && styles.stepDotNumActive]}>2</Text>
          </View>
          <View style={[styles.stepLine, currentStep >= 3 && styles.stepLineActive]} />
          <View style={[styles.stepDot, currentStep >= 3 && styles.stepDotActive]}>
            <Text style={[styles.stepDotNum, currentStep >= 3 && styles.stepDotNumActive]}>3</Text>
          </View>
        </View>
        <Text style={styles.stepTitle}>
          {currentStep === 1 && 'Step 1: Owner Credentials'}
          {currentStep === 2 && 'Step 2: Shop & Category'}
          {currentStep === 3 && 'Step 3: Location & Coordinates'}
        </Text>

        {/* Registration Glass Card */}
        <GlassCard style={styles.card} showSheen={true}>
          {errorMessage ? (
            <View style={styles.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={18} color="#dc2626" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* ──────── STEP 1: OWNER CREDENTIALS ──────── */}
          {currentStep === 1 && (
            <View>
              {/* Owner Name */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>OWNER FULL NAME *</Text>
                <View style={styles.inputWrap}>
                  <View style={styles.prefixBox}>
                    <Ionicons name="person-outline" size={16} color="#64748b" />
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Ramesh Kumar"
                    placeholderTextColor={colors.textMuted}
                    value={ownerName}
                    onChangeText={setOwnerName}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Phone */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>MOBILE PHONE NUMBER *</Text>
                <View style={styles.inputWrap}>
                  <View style={styles.prefixBox}>
                    <Ionicons name="call-outline" size={16} color="#64748b" />
                    <Text style={styles.prefixText}>+91</Text>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="10-digit mobile number"
                    placeholderTextColor={colors.textMuted}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                </View>
              </View>

              {/* Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PASSWORD (MIN 6 CHARACTERS) *</Text>
                <View style={styles.inputWrap}>
                  <View style={styles.prefixBox}>
                    <Ionicons name="lock-closed-outline" size={16} color="#64748b" />
                  </View>
                  <TextInput
                    style={[styles.textInput, { paddingRight: 44 }]}
                    placeholder="Enter password"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>CONFIRM PASSWORD *</Text>
                <View style={styles.inputWrap}>
                  <View style={styles.prefixBox}>
                    <Ionicons name="shield-checkmark-outline" size={16} color="#64748b" />
                  </View>
                  <TextInput
                    style={[styles.textInput, { paddingRight: 44 }]}
                    placeholder="Re-enter password"
                    placeholderTextColor={colors.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showConfirmPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Next Step Button */}
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => {
                  if (validateStep1()) setCurrentStep(2);
                }}
              >
                <Text style={styles.primaryBtnText}>Continue to Shop Details</Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            </View>
          )}

          {/* ──────── STEP 2: SHOP DETAILS ──────── */}
          {currentStep === 2 && (
            <View>
              {/* Shop Name */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>STORE / SHOP NAME *</Text>
                <View style={styles.inputWrap}>
                  <View style={styles.prefixBox}>
                    <Ionicons name="storefront-outline" size={16} color="#64748b" />
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Green Valley Organics"
                    placeholderTextColor={colors.textMuted}
                    value={storeName}
                    onChangeText={setStoreName}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Store Category Selection */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>STORE CATEGORY *</Text>
                <View style={styles.categoryGrid}>
                  {STORE_TYPES.map((type) => {
                    const isSelected = storeType === type.key;
                    return (
                      <TouchableOpacity
                        key={type.key}
                        style={[styles.categoryPill, isSelected && styles.categoryPillSelected]}
                        onPress={() => setStoreType(type.key)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={type.icon}
                          size={18}
                          color={isSelected ? '#ea580c' : '#64748b'}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={[styles.categoryPillText, isSelected && styles.categoryPillTextSelected]}>
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Navigation Buttons */}
              <View style={styles.rowBtnWrap}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => {
                    setErrorMessage('');
                    setCurrentStep(1);
                  }}
                >
                  <Ionicons name="arrow-back" size={16} color="#475569" style={{ marginRight: 6 }} />
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryBtn, { flex: 1, marginTop: 0 }]}
                  onPress={() => {
                    if (validateStep2()) setCurrentStep(3);
                  }}
                >
                  <Text style={styles.primaryBtnText}>Set Shop Location</Text>
                  <Ionicons name="arrow-forward" size={18} color="#ffffff" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ──────── STEP 3: LOCATION & MAP CONFIRMATION ──────── */}
          {currentStep === 3 && (
            <View>
              {/* Address Line 1 */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>SHOP PREMISES / STREET ADDRESS *</Text>
                <View style={styles.inputWrap}>
                  <View style={styles.prefixBox}>
                    <Ionicons name="location-outline" size={16} color="#64748b" />
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Shop/Plot number, Market, Street"
                    placeholderTextColor={colors.textMuted}
                    value={line1}
                    onChangeText={setLine1}
                  />
                </View>
              </View>

              {/* City & Pincode */}
              <View style={styles.twoColRow}>
                <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.fieldLabel}>CITY / AREA</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="City or Town"
                      placeholderTextColor={colors.textMuted}
                      value={city}
                      onChangeText={setCity}
                    />
                  </View>
                </View>

                <View style={[styles.fieldGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.fieldLabel}>PINCODE *</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="6 digits"
                      placeholderTextColor={colors.textMuted}
                      value={pincode}
                      onChangeText={setPincode}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                  </View>
                </View>
              </View>

              {/* GPS Detection Action */}
              <View style={styles.gpsActionRow}>
                <TouchableOpacity
                  style={styles.gpsBtn}
                  onPress={handleDetectLocation}
                  disabled={isLocating}
                  activeOpacity={0.8}
                >
                  {isLocating ? (
                    <ActivityIndicator size="small" color="#0284c7" />
                  ) : (
                    <>
                      <Ionicons name="locate" size={18} color="#0284c7" style={{ marginRight: 6 }} />
                      <Text style={styles.gpsBtnText}>Use My Current Location</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Map View / Coordinate Selector */}
              <View style={styles.mapContainer}>
                {MapView ? (
                  <MapView
                    ref={mapRef}
                    style={styles.map}
                    provider={PROVIDER_GOOGLE}
                    initialRegion={{
                      latitude: Number.isFinite(selectedLat) ? selectedLat : 30.9010,
                      longitude: Number.isFinite(selectedLng) ? selectedLng : 75.8573,
                      latitudeDelta: 0.05,
                      longitudeDelta: 0.05
                    }}
                    onPress={(e) => {
                      const coord = e.nativeEvent?.coordinate;
                      if (coord && Number.isFinite(coord.latitude) && Number.isFinite(coord.longitude)) {
                        setSelectedLat(Number(coord.latitude.toFixed(6)));
                        setSelectedLng(Number(coord.longitude.toFixed(6)));
                        setIsPinConfirmed(false);
                      }
                    }}
                  >
                    {Number.isFinite(selectedLat) && Number.isFinite(selectedLng) && (
                      <Marker
                        coordinate={{ latitude: selectedLat, longitude: selectedLng }}
                        draggable
                        onDragEnd={(e) => {
                          const coord = e.nativeEvent?.coordinate;
                          if (coord && Number.isFinite(coord.latitude) && Number.isFinite(coord.longitude)) {
                            setSelectedLat(Number(coord.latitude.toFixed(6)));
                            setSelectedLng(Number(coord.longitude.toFixed(6)));
                            setIsPinConfirmed(false);
                          }
                        }}
                        title={storeName || 'Shop Pickup Location'}
                        description="Drag or tap to set exact shop entrance"
                      />
                    )}
                  </MapView>
                ) : (
                  <View style={styles.mapFallback}>
                    <Ionicons name="map-outline" size={32} color="#94a3b8" />
                    <Text style={styles.mapFallbackTitle}>Shop Pickup Coordinates</Text>
                    <Text style={styles.mapFallbackSub}>
                      Tap "Use My Current Location" or adjust coordinates manually below.
                    </Text>
                  </View>
                )}

                {/* Coordinate Inputs / Visual Badge */}
                <View style={styles.coordDisplayBox}>
                  <View style={styles.coordCol}>
                    <Text style={styles.coordLabel}>LATITUDE</Text>
                    <TextInput
                      style={styles.coordInput}
                      placeholder="e.g. 30.9010"
                      placeholderTextColor="#94a3b8"
                      value={selectedLat !== null ? String(selectedLat) : ''}
                      onChangeText={(val) => {
                        const parsed = parseFloat(val);
                        setSelectedLat(Number.isFinite(parsed) ? parsed : null);
                        setIsPinConfirmed(false);
                      }}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.coordCol}>
                    <Text style={styles.coordLabel}>LONGITUDE</Text>
                    <TextInput
                      style={styles.coordInput}
                      placeholder="e.g. 75.8573"
                      placeholderTextColor="#94a3b8"
                      value={selectedLng !== null ? String(selectedLng) : ''}
                      onChangeText={(val) => {
                        const parsed = parseFloat(val);
                        setSelectedLng(Number.isFinite(parsed) ? parsed : null);
                        setIsPinConfirmed(false);
                      }}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* Explicit Pin Confirmation Button */}
                <TouchableOpacity
                  style={[styles.confirmPinBtn, isPinConfirmed && styles.confirmPinBtnActive]}
                  onPress={handleConfirmPin}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isPinConfirmed ? 'checkmark-circle' : 'pin-outline'}
                    size={18}
                    color={isPinConfirmed ? '#16a34a' : '#ea580c'}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.confirmPinText, isPinConfirmed && styles.confirmPinTextActive]}>
                    {isPinConfirmed ? 'Shop Pin Confirmed ✓' : 'Confirm This Shop Pin'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Navigation & Submit Buttons */}
              <View style={styles.rowBtnWrap}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => {
                    setErrorMessage('');
                    setCurrentStep(2);
                  }}
                  disabled={isSubmitting}
                >
                  <Ionicons name="arrow-back" size={16} color="#475569" style={{ marginRight: 6 }} />
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryBtn, { flex: 1, marginTop: 0 }]}
                  onPress={handleSubmitRegistration}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Submit Partner Application"
                  accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                  activeOpacity={0.8}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Text style={styles.primaryBtnText}>Submit Partner Application</Text>
                      <Ionicons name="checkmark-done" size={18} color="#ffffff" style={{ marginLeft: 8 }} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Return to Login link at bottom */}
          <View style={styles.loginFooter}>
            <Text style={styles.loginFooterText}>Already have a registered store?</Text>
            <TouchableOpacity onPress={handleReturnToLogin}>
              <Text style={styles.loginLinkText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  scrollContent: {
    paddingHorizontal: 16
  },
  header: {
    alignItems: 'center',
    marginBottom: 16
  },
  logoGlassGlow: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(234, 88, 12, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(234, 88, 12, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
  },
  logoImage: {
    width: 38,
    height: 38
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a'
  },
  brandSub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepDotActive: {
    backgroundColor: '#ea580c'
  },
  stepDotNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b'
  },
  stepDotNumActive: {
    color: '#ffffff'
  },
  stepLine: {
    width: 44,
    height: 3,
    backgroundColor: '#e2e8f0'
  },
  stepLineActive: {
    backgroundColor: '#ea580c'
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
    marginBottom: 16
  },
  card: {
    padding: 20,
    marginBottom: 20
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
    fontWeight: '500'
  },
  fieldGroup: {
    marginBottom: 14
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 6,
    letterSpacing: 0.5
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    overflow: 'hidden'
  },
  prefixBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: '#f1f5f9'
  },
  prefixText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginLeft: 6
  },
  textInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a'
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    height: 44,
    justifyContent: 'center'
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    marginBottom: 4
  },
  categoryPillSelected: {
    borderColor: '#ea580c',
    backgroundColor: 'rgba(234, 88, 12, 0.08)'
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569'
  },
  categoryPillTextSelected: {
    color: '#ea580c',
    fontWeight: '700'
  },
  twoColRow: {
    flexDirection: 'row'
  },
  gpsActionRow: {
    marginBottom: 12
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 132, 199, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.25)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8
  },
  gpsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7'
  },
  mapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16
  },
  map: {
    width: '100%',
    height: 200
  },
  mapFallback: {
    width: '100%',
    height: 120,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16
  },
  mapFallbackTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 6
  },
  mapFallbackSub: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 2
  },
  coordDisplayBox: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  coordCol: {
    flex: 1,
    paddingHorizontal: 6
  },
  coordLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 2
  },
  coordInput: {
    height: 34,
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 8
  },
  confirmPinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(234, 88, 12, 0.08)',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(234, 88, 12, 0.2)'
  },
  confirmPinBtnActive: {
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    borderTopColor: 'rgba(22, 163, 74, 0.2)'
  },
  confirmPinText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ea580c'
  },
  confirmPinTextActive: {
    color: '#16a34a'
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ea580c',
    height: 48,
    borderRadius: 10,
    marginTop: 12
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff'
  },
  rowBtnWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    marginRight: 10
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569'
  },
  loginFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  loginFooterText: {
    fontSize: 13,
    color: '#64748b',
    marginRight: 6
  },
  loginLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ea580c'
  },
  successIconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(234, 88, 12, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center'
  },
  successSub: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18
  },
  infoBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginVertical: 18
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    width: 70,
    marginLeft: 8
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1
  },
  approvalNoteBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(2, 132, 199, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.2)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20
  },
  approvalNoteText: {
    fontSize: 12,
    color: '#0369a1',
    lineHeight: 17,
    marginLeft: 8,
    flex: 1
  }
});

