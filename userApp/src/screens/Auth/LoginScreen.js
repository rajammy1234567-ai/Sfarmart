import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { useApp } from "../../context/AppContext";
import { showAlert } from "../../utils/alert";

const LOGO = require("../../../assets/farmart24_logo.jpg");

export const LoginScreen = ({ navigation }) => {
  const { loginUser } = useApp();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);
  const [loading, setLoading] = useState(false);
  const phoneInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  const navigateAfterLogin = () => {
    if (navigation && typeof navigation.navigate === 'function') {
      navigation.navigate("MainTabs");
    } else if (navigation && typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const handleLogin = async () => {
    const cleanPhone = phone ? phone.trim() : "";
    const cleanPass = password ? password.trim() : "";

    if (!cleanPhone || !cleanPass) {
      showAlert("Error", "Please enter phone number and password.");
      return;
    }

    setLoading(true);
    try {
      const user = await loginUser(cleanPhone, cleanPass);
      setLoading(false);
      if (user) {
        navigateAfterLogin();
      } else {
        showAlert(
          "Login Failed",
          "Invalid phone number or password. If you are a new customer, please register on the Sign Up tab."
        );
      }
    } catch (error) {
      setLoading(false);
      showAlert(
        "Login Failed",
        error?.message || "Could not log in. Please check your credentials."
      );
    }
  };

  const skipLogin = () => {
    navigateAfterLogin();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#f0fdf4" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Action Bar */}
          <View style={styles.headerBar}>
            <View style={styles.badgeWrap}>
              <View style={styles.statusDot} />
              <Text style={styles.badgeText}>Direct Farm Supply</Text>
            </View>
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={skipLogin}
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>Skip</Text>
              <Ionicons name="chevron-forward" size={14} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Hero Branding Box */}
          <View style={styles.heroSection}>
            <View style={styles.logoBadgeContainer}>
              <View style={styles.logoCircle}>
                <Image
                  source={LOGO}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.leafIconBadge}>
                <Ionicons name="leaf" size={16} color="#ffffff" />
              </View>
            </View>
            <Text style={styles.title}>Welcome Back 👋</Text>
            <Text style={styles.subtitle}>
              Fresh produce, daily essentials & local food delivered to your
              doorstep.
            </Text>
          </View>


          {/* Login Card Form */}
          <View style={styles.card}>
            {/* Tab Switcher Header */}
            <View style={styles.tabHeader}>
              <TouchableOpacity style={styles.activeTab} activeOpacity={0.9}>
                <Text style={styles.activeTabText}>Log In</Text>
                <View style={styles.tabIndicator} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inactiveTab}
                onPress={() => navigation.navigate("Signup")}
                activeOpacity={0.7}
              >
                <Text style={styles.inactiveTabText}>Sign Up</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formSection}>
              {/* Phone Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <Pressable
                  style={[
                    styles.inputWrap,
                    focusedInput === "phone" && styles.inputWrapFocused,
                  ]}
                  onPress={() => phoneInputRef.current?.focus()}
                >
                  <Ionicons
                    name="call-outline"
                    size={20}
                    color={
                      focusedInput === "phone" ? colors.primary : "#94a3b8"
                    }
                    style={styles.inputIcon}
                    pointerEvents="none"
                  />
                  <TextInput
                    ref={phoneInputRef}
                    style={styles.input}
                    placeholder="Enter phone number"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    onFocus={() => setFocusedInput("phone")}
                    onBlur={() => setFocusedInput(null)}
                    placeholderTextColor="#94a3b8"
                  />
                </Pressable>
              </View>

              {/* Password Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <Pressable
                  style={[
                    styles.inputWrap,
                    focusedInput === "password" && styles.inputWrapFocused,
                  ]}
                  onPress={() => passwordInputRef.current?.focus()}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={
                      focusedInput === "password" ? colors.primary : "#94a3b8"
                    }
                    style={styles.inputIcon}
                    pointerEvents="none"
                  />
                  <TextInput
                    ref={passwordInputRef}
                    style={styles.input}
                    placeholder="Enter password"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedInput("password")}
                    onBlur={() => setFocusedInput(null)}
                    placeholderTextColor="#94a3b8"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    activeOpacity={0.7}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color="#64748b"
                    />
                  </TouchableOpacity>
                </Pressable>
              </View>

              {/* Forgot Password Link */}
              <TouchableOpacity style={styles.forgotBtn} activeOpacity={0.7}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>

              {/* Login Action Button */}
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.disabledBtn]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <View style={styles.btnInner}>
                    <Text style={styles.primaryBtnText}>Log In to Account</Text>
                    <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                  </View>
                )}
              </TouchableOpacity>

            </View>
          </View>

          {/* Footer Section */}
          <View style={styles.footerSection}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("Signup")}
              activeOpacity={0.7}
            >
              <Text style={styles.linkText}>Create Account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0fdf4",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 12 : 16,
    paddingBottom: Platform.OS === "ios" ? 40 : 80,
  },
  heroDemoLoginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3
  },
  heroDemoIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroDemoTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#15803d'
  },
  heroDemoSub: {
    fontSize: 11.5,
    color: '#166534',
    marginTop: 2,
    fontWeight: '500'
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  badgeWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dcfce7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primaryDark,
  },
  skipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  skipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  logoBadgeContainer: {
    position: "relative",
    marginBottom: 14,
  },
  logoCircle: {
    width: 86,
    height: 86,
    borderRadius: 26,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 2,
    borderColor: "#bbf7d0",
  },
  logoImage: {
    width: 72,
    height: 72,
  },
  leafIconBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  title: {
    fontSize: 26,
    fontWeight: '500',
    color: "#0f172a",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13.5,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 12,
    lineHeight: 20,
    marginBottom: 14,
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 22,
    shadowColor: "rgba(15, 23, 42, 0.12)",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.8)",
  },
  tabHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    marginBottom: 20,
  },
  activeTab: {
    paddingBottom: 10,
    marginRight: 24,
    position: "relative",
  },
  activeTabText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.primary,
  },
  tabIndicator: {
    position: "absolute",
    bottom: -1,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  inactiveTab: {
    paddingBottom: 10,
  },
  inactiveTabText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textMuted,
  },
  formSection: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: "#334155",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
  },
  inputWrapFocused: {
    borderColor: colors.primary,
    backgroundColor: "#ffffff",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
    fontSize: 15,
    color: "#0f172a",
    fontWeight: "500",
  },
  eyeBtn: {
    padding: 6,
  },
  forgotBtn: {
    alignSelf: "flex-end",
    marginTop: -4,
  },
  forgotText: {
    color: colors.primary,
    fontSize: 13.5,
    fontWeight: '500',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    height: 54,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  btnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: '500',
  },
  footerSection: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 22,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  linkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
});
