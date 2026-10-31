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
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePartner } from '../context/PartnerContext';
import { colors } from '../theme/colors';
import { GlassCard } from '../components/GlassCard';
import { WaterBackground } from '../components/WaterBackground';

const LOGO = require('../../assets/farmart_logo.png');


export const PartnerLoginScreen = ({ navigation, onNavigateToRegister }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;

  const { loginVendor } = usePartner();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const loginPending = useRef(false);

  const handleLogin = async (overridePhone, overridePassword) => {
    if (loginPending.current) return;
    const targetPhone = (overridePhone || phone).trim();
    const targetPass = overridePassword || password;

    if (!/^\d{10}$/.test(targetPhone)) {
      setErrorMessage('Please enter your 10-digit registered phone number');
      return;
    }

    if (!targetPass) {
      setErrorMessage('Please enter your account password');
      return;
    }

    loginPending.current = true;
    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await loginVendor(targetPhone, targetPass);
      if (!res || !res.success) {
        if (res?.code === 'ACCOUNT_PENDING_APPROVAL') {
          setIsPendingApproval(true);
          setErrorMessage(res?.message || 'Your partner store application is pending approval from Farmart admin.');
        } else {
          setIsPendingApproval(false);
          setErrorMessage(res?.message || 'Invalid credentials. Please check phone and password.');
        }
      }
    } catch (err) {
      setErrorMessage('Network connection error. Please try again.');
    } finally {
      loginPending.current = false;
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <WaterBackground />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20) + 24,
            paddingBottom: Math.max(insets.bottom, 20) + 40,
            maxWidth: isTablet ? 520 : '100%',
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
          <Text style={styles.brandTitle}>Farmart Partner Hub</Text>
          <Text style={styles.brandSub}>
            Merchant Portal • Live store duty, incoming kitchen orders & catalog
          </Text>
        </View>

        {/* Login Form Glass Card */}
        <GlassCard style={styles.card} showSheen={true}>
          <Text style={styles.cardTitle}>Partner Login</Text>
          <Text style={styles.cardSub}>
            Sign in with your registered partner phone number and password.
          </Text>

          {isPendingApproval ? (
            <View style={styles.pendingCard} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <View style={styles.pendingHeaderRow}>
                <Ionicons name="time-outline" size={22} color="#b45309" />
                <Text style={styles.pendingTitle}>Application Under Review</Text>
              </View>
              <Text style={styles.pendingBody}>
                Your store application has been safely received. S-farmart operations verifies each partner before account activation to guarantee authentic local produce and store safety.
              </Text>
              <View style={styles.pendingBadgeRow}>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>Status: Pending Admin Approval</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.pendingRefreshBtn}
                onPress={() => handleLogin()}
                disabled={isLoading}
                accessibilityRole="button"
                accessibilityLabel="Check approval status"
              >
                <Ionicons name="refresh-outline" size={16} color="#b45309" style={{ marginRight: 6 }} />
                <Text style={styles.pendingRefreshText}>Check Approval Status Again</Text>
              </TouchableOpacity>
            </View>
          ) : errorMessage ? (
            <View style={styles.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={18} color="#dc2626" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Phone Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>REGISTERED PHONE NUMBER</Text>
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

          {/* Password Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>PASSWORD</Text>
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
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color="#64748b"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit Action */}
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={() => handleLogin()}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Log in to store console"
            accessibilityState={{ disabled: isLoading, busy: isLoading }}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Text style={styles.submitText}>Log In to Store Console</Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </>
            )}
          </TouchableOpacity>

          {isLoading && (
            <Text accessibilityLiveRegion="polite" style={styles.cardSub}>
              Signing in. The server may take up to a minute to respond.
            </Text>
          )}

          {/* Security Notice */}
          <View style={styles.securityBox}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#16a34a" />
            <Text style={styles.securityText}>
              Verified Merchant Portal. Each partner account is isolated with individual phone & password credentials.
            </Text>
          </View>

          {/* Visible Register Your Shop Entry */}
          <View style={styles.registerSection}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>NEW SHOP OWNER?</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.registerBtn}
              onPress={() => {
                if (typeof onNavigateToRegister === 'function') {
                  onNavigateToRegister();
                } else if (navigation && typeof navigation.navigate === 'function') {
                  navigation.navigate('Register');
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Register your shop"
              activeOpacity={0.8}
            >
              <Ionicons name="storefront-outline" size={18} color="#ea580c" style={{ marginRight: 8 }} />
              <Text style={styles.registerBtnText}>Register Your Shop</Text>
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
    marginBottom: 20
  },
  logoGlassGlow: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(234, 88, 12, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(234, 88, 12, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10
  },
  logoImage: {
    width: 44,
    height: 44
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
  pendingCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(254, 243, 199, 0.85)',
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    marginBottom: 16
  },
  pendingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6
  },
  pendingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400e'
  },
  pendingBody: {
    fontSize: 12,
    color: '#78350f',
    lineHeight: 18,
    marginBottom: 10
  },
  pendingBadgeRow: {
    marginBottom: 10
  },
  pendingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f59e0b'
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b45309'
  },
  pendingRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d97706',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44
  },
  pendingRefreshText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b45309'
  },
  card: {
    padding: 20,
    marginBottom: 20
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a'
  },
  cardSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3,
    marginBottom: 16
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    marginBottom: 14
  },
  errorText: {
    fontSize: 12,
    color: '#b91c1c',
    flex: 1
  },
  fieldGroup: {
    marginBottom: 14
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    letterSpacing: 0.5
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    overflow: 'hidden'
  },
  prefixBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 12,
    paddingRight: 6
  },
  prefixText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155'
  },
  textInput: {
    flex: 1,
    height: 46,
    paddingHorizontal: 8,
    fontSize: 14,
    color: '#0f172a'
  },
  eyeBtn: {
    position: 'absolute',
    right: 12
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#ea580c',
    marginTop: 8,
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4
  },
  submitText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff'
  },
  securityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.25)'
  },
  securityText: {
    fontSize: 12,
    color: '#15803d',
    fontWeight: '600',
    flex: 1,
    lineHeight: 16
  },
  registerSection: {
    marginTop: 20
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0'
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    paddingHorizontal: 10,
    letterSpacing: 0.5
  },
  registerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(234, 88, 12, 0.4)',
    backgroundColor: 'rgba(234, 88, 12, 0.06)'
  },
  registerBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ea580c'
  }
});
