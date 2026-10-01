import React, { useState } from 'react';
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


export const PartnerLoginScreen = () => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;

  const { loginVendor } = usePartner();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (overridePhone, overridePassword) => {
    const targetPhone = (overridePhone || phone).trim();
    const targetPass = overridePassword || password;

    if (!targetPhone) {
      setErrorMessage('Please enter your 10-digit registered phone number');
      return;
    }

    if (!targetPass) {
      setErrorMessage('Please enter your account password');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await loginVendor(targetPhone, targetPass);
      if (!res || !res.success) {
        setErrorMessage(res?.message || 'Invalid credentials. Please check phone and password.');
      }
    } catch (err) {
      setErrorMessage('Network connection error. Please try again.');
    } finally {
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
            Enter credentials or tap a test merchant account below
          </Text>

          {errorMessage ? (
            <View style={styles.errorBanner}>
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

          {/* Security Notice */}
          <View style={styles.securityBox}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#16a34a" />
            <Text style={styles.securityText}>
              Verified Merchant Portal. Each partner account is isolated with individual phone & password credentials.
            </Text>
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
  }
});
