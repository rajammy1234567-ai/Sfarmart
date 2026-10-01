import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRiderAuth } from '../context/RiderAuthContext';

const DEMO_RIDERS = [
  { name: 'Gurmukh Singh', phone: '9876543220', vehicle: '🏍️ Hero Splendor' },
  { name: 'Harpreet Singh', phone: '9876543221', vehicle: '🛵 Honda Activa' },
  { name: 'Manjinder Singh', phone: '9876543222', vehicle: '🚲 E-Cycle' }
];

const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

export const RiderLoginScreen = () => {
  const { login } = useRiderAuth();
  const [phone, setPhone] = useState(IS_DEV ? '9876543220' : '');
  const [password, setPassword] = useState(IS_DEV ? 'demo123' : '');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!phone || !password) {
      Alert.alert('Required Fields', 'Please enter your registered phone and password.');
      return;
    }

    setIsLoading(true);
    try {
      await login(phone.trim(), password);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Login failed. Please check credentials.';
      Alert.alert('Login Error', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPreset = (p) => {
    setPhone(p.phone);
    setPassword('demo123');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Dark Brand Header */}
      <View style={styles.header}>
        <View style={styles.logoBadge}>
          <Ionicons name="bicycle" size={32} color="#38bdf8" />
        </View>
        <Text style={styles.brandTitle}>S-farmart Delivery</Text>
        <Text style={styles.brandSubtitle}>Rider Operations & Live Logistics Terminal</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Quick Demo Switcher (DEV only) */}
        {IS_DEV && (
          <View style={styles.presetSection}>
            <Text style={styles.presetHeading}>⚡ 1-TAP DEMO RIDER LOGIN</Text>
            <View style={styles.presetGrid}>
              {DEMO_RIDERS.map((r) => {
                const active = phone === r.phone;
                return (
                  <TouchableOpacity
                    key={r.phone}
                    style={[styles.presetCard, active && styles.presetCardActive]}
                    onPress={() => handleSelectPreset(r)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.presetName, active && styles.presetTextActive]}>{r.name}</Text>
                    <Text style={[styles.presetVehicle, active && styles.presetTextActive]}>{r.vehicle}</Text>
                    <Text style={styles.presetPhone}>{r.phone}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Credentials Form */}
        <View style={styles.formCard}>
          <Text style={styles.formHeading}>Rider Authentication</Text>

          {/* Phone Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Registered Mobile Number</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="call-outline" size={20} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="10-digit mobile number"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Password Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
              />
            </View>
          </View>

          {/* Login Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={20} color="#ffffff" />
                <Text style={styles.submitBtnText}>LOGIN TO DUTY TERMINAL</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Fleet Perks Footer */}
        <View style={styles.perksCard}>
          <View style={styles.perkItem}>
            <Ionicons name="shield-checkmark" size={18} color="#16a34a" />
            <Text style={styles.perkText}>Accidental Insurance Included</Text>
          </View>
          <View style={styles.perkItem}>
            <Ionicons name="cash" size={18} color="#0284c7" />
            <Text style={styles.perkText}>Weekly Wednesday Bank Transfers</Text>
          </View>
          <View style={styles.perkItem}>
            <Ionicons name="navigate-circle" size={18} color="#f97316" />
            <Text style={styles.perkText}>Optimized Multi-Order Route Navigation</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a'
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
    backgroundColor: '#0f172a'
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5
  },
  brandSubtitle: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#94a3b8',
    marginTop: 4
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40
  },
  presetSection: {
    marginBottom: 20
  },
  presetHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 1,
    marginBottom: 10
  },
  presetGrid: {
    flexDirection: 'row',
    gap: 8
  },
  presetCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#334155'
  },
  presetCardActive: {
    borderColor: '#38bdf8',
    backgroundColor: '#0c4a6e'
  },
  presetName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#f8fafc'
  },
  presetVehicle: {
    fontSize: 10,
    color: '#94a3b8',
    marginVertical: 2
  },
  presetPhone: {
    fontSize: 9.5,
    color: '#64748b',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'
  },
  presetTextActive: {
    color: '#ffffff'
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
    marginBottom: 20
  },
  formHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 18
  },
  inputGroup: {
    marginBottom: 16
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    height: 50
  },
  inputIcon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a'
  },
  submitBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 16,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  submitBtnDisabled: {
    opacity: 0.6
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5
  },
  perksCard: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  perkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  perkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#cbd5e1'
  }
});
