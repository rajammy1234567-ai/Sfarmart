import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Pressable,
  Animated,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import storage from "../services/storage";
import { colors } from "../theme/colors";
import { useApp } from "../context/AppContext";
import { useCart } from "../context/CartContext";
import { GlassIconBtn } from "./common/GlassIconBtn";
import { reverseGeocode } from "../utils/maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LOGO = require("../../assets/farmart24_logo.jpg");

export const Header = ({
  navigation,
  title,
  showCart = true,
  showBack = false,
}) => {
  const { userProfile, setUserProfile, isAuthenticated } = useApp();
  const insets = useSafeAreaInsets();
  const { billSummary } = useCart();
  const cartItemCount = billSummary?.totalCount || 0;
  const canGoBack = Boolean(showBack);

  const badgeScaleAnim = useRef(new Animated.Value(1)).current;
  const prevCountRef = useRef(cartItemCount);

  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [displayAddress, setDisplayAddress] = useState(
    "Set your delivery address",
  );
  const [locationSubtitle, setLocationSubtitle] = useState(
    "Detecting location...",
  );
  const [isLocationLoading, setIsLocationLoading] = useState(true);

  const detectCurrentLocation = async (isManual = false) => {
    setIsLocationLoading(true);
    setLocationSubtitle("Detecting location...");

    const fallbackAddress =
      userProfile?.address ||
      userProfile?.city ||
      "Set your delivery address";

    try {
      // 1. Request Permission from user
      let granted = false;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") granted = true;
      } catch (permErr) {
        console.warn("Foreground permission error:", permErr.message);
      }

      if (!granted && typeof navigator !== "undefined" && navigator.geolocation) {
        // Fallback for Web browser permission prompt
        granted = true;
      }

      if (!granted) {
        setLocationSubtitle(userProfile?.city || "Location permission denied");
        if (isManual && Platform.OS !== "web") {
          Alert.alert("Permission Required", "Please enable location permission to detect nearby delivery areas.");
        }
        setIsLocationLoading(false);
        return;
      }

      // 2. Access user GPS coordinates
      setLocationSubtitle("Detecting GPS...");
      let latitude = null;
      let longitude = null;

      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        latitude = pos?.coords?.latitude;
        longitude = pos?.coords?.longitude;
      } catch (posErr) {
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          const webPos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
            });
          });
          latitude = webPos?.coords?.latitude;
          longitude = webPos?.coords?.longitude;
        } else {
          throw posErr;
        }
      }

      if (!latitude || !longitude) {
        throw new Error("Could not retrieve GPS coordinates");
      }

      // 3. Detect nearby area via Google Maps / High precision geocoder
      setLocationSubtitle("Finding nearby area...");
      const geoResult = await reverseGeocode(latitude, longitude);

      const resolvedAddress = geoResult?.address || fallbackAddress;
      const nearbySubtitle = geoResult?.area
        ? `${geoResult.area}, ${geoResult.city || ''}`
        : (geoResult?.city || "Nearby location");

      setDisplayAddress(resolvedAddress);
      setManualAddress(resolvedAddress);
      setLocationSubtitle(nearbySubtitle.trim().replace(/^,\s*/, ''));

      // 4. Update user profile and storage
      if (userProfile) {
        setUserProfile({
          ...userProfile,
          address: resolvedAddress,
          city: geoResult?.city || userProfile.city || "Ludhiana",
          lat: latitude,
          lng: longitude,
        });
      }
      try {
        await storage.setItem(
          "farmart_user_location",
          JSON.stringify({
            address: resolvedAddress,
            city: geoResult?.city,
            area: geoResult?.area,
            lat: latitude,
            lng: longitude,
          })
        );
      } catch (e) {
        // silent
      }
    } catch (err) {
      console.warn("Location detection failed:", err.message);
      setDisplayAddress(fallbackAddress);
      setManualAddress(fallbackAddress);
      setLocationSubtitle(userProfile?.city || "Could not detect location");
    } finally {
      setIsLocationLoading(false);
    }
  };

  useEffect(() => {
    detectCurrentLocation(false);
  }, [userProfile?.phone]);

  useEffect(() => {
    if (cartItemCount !== prevCountRef.current) {
      prevCountRef.current = cartItemCount;
      if (cartItemCount > 0) {
        // Dynamic pulse on item change
        Animated.sequence([
          Animated.timing(badgeScaleAnim, {
            toValue: 1.45,
            duration: 130,
            useNativeDriver: Platform.OS !== 'web'
          }),
          Animated.spring(badgeScaleAnim, {
            toValue: 1.0,
            friction: 3.5,
            tension: 220,
            useNativeDriver: Platform.OS !== 'web'
          })
        ]).start();
      }
    }
  }, [cartItemCount]);

  const openAddressModal = () => {
    setManualAddress(displayAddress);
    setAddressModalVisible(true);
  };

  const saveAddress = () => {
    const nextAddress = manualAddress.trim() || "Set your delivery address";
    setDisplayAddress(nextAddress);
    setLocationSubtitle("Address updated");

    if (userProfile) {
      setUserProfile({
        ...userProfile,
        address: nextAddress,
        city: userProfile.city || nextAddress,
      });
    }

    setAddressModalVisible(false);
  };

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        {canGoBack ? (
          <GlassIconBtn
            size={40}
            onPress={() => navigation.goBack()}
            borderRadius={12}
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </GlassIconBtn>
        ) : (
          <Image source={LOGO} style={styles.logoImage} resizeMode="contain" />
        )}

        <View style={styles.centerSection}>
          {title ? (
            <Text style={styles.pageTitle} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            <TouchableOpacity
              style={styles.locationSection}
              activeOpacity={0.8}
              onPress={openAddressModal}
            >
              <View style={styles.deliveryRow}>
                <Ionicons name="location" size={14} color={colors.secondary} />
                <Text style={styles.deliveryLabel}>Deliver to</Text>
                <Ionicons
                  name="chevron-down"
                  size={12}
                  color={colors.textPrimary}
                />
              </View>
              <Text style={styles.addressTitle} numberOfLines={1}>
                {displayAddress}
              </Text>
              <Text style={styles.addressSub} numberOfLines={1}>
                {isLocationLoading
                  ? "Detecting your location..."
                  : `${locationSubtitle} · Express 30–45 min`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.rightActionsRow}>
          {!userProfile ? (
            <TouchableOpacity
              style={styles.loginQuickChip}
              onPress={() => {
                if (navigation && typeof navigation.navigate === "function") {
                  navigation.navigate("Login");
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="log-in-outline" size={15} color="#16a34a" />
              <Text style={styles.loginQuickChipText}>Login</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.userAvatarChip}
              onPress={() => {
                if (navigation && typeof navigation.navigate === "function") {
                  navigation.navigate("ProfileWallet");
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.userAvatarInitial}>
                {(userProfile?.name || 'R').charAt(0).toUpperCase()}
              </Text>
              <View style={styles.userOnlineDot} />
            </TouchableOpacity>
          )}

          {showCart ? (
            <View style={styles.cartBtnContainer}>
              <GlassIconBtn
                size={42}
                borderRadius={12}
                onPress={() => navigation && navigation.navigate("Cart")}
                accessibilityLabel="Shopping Cart"
                accessibilityRole="button"
              >
                <Ionicons
                  name="cart-outline"
                  size={22}
                  color={colors.textPrimary}
                />
              </GlassIconBtn>
              {cartItemCount > 0 && (
                <Animated.View
                  style={[
                    styles.badge,
                    { transform: [{ scale: badgeScaleAnim }] },
                  ]}
                  pointerEvents="none"
                >
                  <Text
                    style={styles.badgeText}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.8}
                  >
                    {cartItemCount > 99 ? "99+" : String(cartItemCount)}
                  </Text>
                </Animated.View>
              )}
            </View>
          ) : (
            <View style={styles.cartPlaceholder} />
          )}
        </View>
      </View>

      <Modal
        transparent
        visible={addressModalVisible}
        animationType="fade"
        onRequestClose={() => setAddressModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setAddressModalVisible(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Ionicons
                name="location-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.modalTitle}>Update delivery address</Text>
            </View>

            <TouchableOpacity
              style={styles.gpsDetectBtn}
              onPress={() => detectCurrentLocation(true)}
              activeOpacity={0.8}
              disabled={isLocationLoading}
            >
              {isLocationLoading ? (
                <ActivityIndicator size="small" color="#16a34a" />
              ) : (
                <Ionicons name="navigate" size={18} color="#16a34a" />
              )}
              <Text style={styles.gpsDetectBtnText}>
                {isLocationLoading ? "Detecting nearby location..." : "📍 Use Current GPS Location (Google)"}
              </Text>
            </TouchableOpacity>

            <View style={styles.orDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.orText}>OR ENTER MANUALLY</Text>
              <View style={styles.dividerLine} />
            </View>

            <Text style={styles.modalLabel}>Your delivery address</Text>
            <TextInput
              style={styles.modalInput}
              value={manualAddress}
              onChangeText={setManualAddress}
              placeholder="Enter your address"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveAddress}
              activeOpacity={0.85}
            >
              <Text style={styles.saveButtonText}>Save address</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  logoImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  centerSection: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    overflow: "hidden",
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  locationSection: {
    justifyContent: "center",
    width: "100%",
  },
  deliveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  deliveryLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.secondary,
  },
  addressTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textPrimary,
    marginTop: 1,
  },
  addressSub: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 1,
  },
  cartButton: {
    position: "relative",
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBtnContainer: {
    position: 'relative',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartPlaceholder: {
    width: 44,
    height: 44,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: colors.secondary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#ffffff",
    zIndex: 10,
    elevation: 4,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    includeFontPadding: false,
    lineHeight: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  modalLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 90,
    textAlignVertical: "top",
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 14,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: '500',
  },
  gpsDetectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
    marginBottom: 14,
  },
  gpsDetectBtnText: {
    color: '#15803d',
    fontSize: 14,
    fontWeight: '700',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  orText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loginQuickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1.2,
    borderColor: '#86efac',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  loginQuickChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
  },
  userAvatarChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  userAvatarInitial: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  userOnlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
});
