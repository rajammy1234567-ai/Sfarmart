import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { useApp } from '../../context/AppContext';
import { useCart } from '../../context/CartContext';
import { useCustomerSocket } from '../../context/SocketContext';
import { colors } from '../../theme/colors';
import { apiService, terminateSession, initializeSession } from '../../services/api';
import { useAuthGate } from '../../hooks/useAuthGate';
import { showAlert } from '../../utils/alert';

const LOGO = require('../../../assets/farmart24_logo.jpg');

export const ProfileWalletScreen = ({ navigation }) => {
  const { userProfile, isAuthenticated, logoutUser, loginUser } = useApp();
  const { requireLogin } = useAuthGate();
  const { clearCart } = useCart();
  const socket = useCustomerSocket();

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showLogoutAllModal, setShowLogoutAllModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Compute display wallet rupees
  const walletDisplay =
    userProfile?.walletRupees !== undefined
      ? userProfile.walletRupees
      : userProfile?.walletBalance
      ? userProfile.walletBalance >= 1000
        ? userProfile.walletBalance / 100
        : userProfile.walletBalance
      : 250;

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    setIsLoggingOut(true);
    if (socket && typeof socket.disconnectSocket === 'function') {
      socket.disconnectSocket(true);
    }
    try {
      if (typeof clearCart === 'function') {
        clearCart();
      }
      await logoutUser();
      if (navigation && navigation.reset) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }]
        });
      }
    } catch (err) {
      console.warn('Logout error:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const confirmLogoutAll = async () => {
    setShowLogoutAllModal(false);
    setIsLoggingOut(true);
    if (socket && typeof socket.disconnectSocket === 'function') {
      socket.disconnectSocket(true);
    }
    try {
      await apiService.logoutAll();
      if (typeof clearCart === 'function') clearCart();
      await logoutUser();
      if (navigation && navigation.reset) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }]
        });
      }
    } catch (err) {
      showAlert('Error', 'Could not log out from all devices. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const confirmDeleteAccount = async () => {
    setIsDeletingAccount(true);
    // Tell socket that a teardown is in flight so server disconnection does not attempt refresh
    if (socket && typeof socket.disconnectSocket === 'function') {
      socket.disconnectSocket(true);
    }

    try {
      const res = await apiService.deleteAccount();
      if (res && (res.success || res.ok)) {
        setShowDeleteModal(false);
        if (typeof clearCart === 'function') clearCart(true);
        await logoutUser();
        showAlert('Account Deleted', 'Your account and personal data have been permanently removed.');
        if (navigation && navigation.reset) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }]
          });
        }
      } else {
        // If server returned non-success response, restore socket and notify
        if (socket && typeof socket.restoreSocket === 'function') {
          socket.restoreSocket();
        }
        showAlert('Deletion Failed', res?.message || 'Could not delete your account. Please try again.');
      }
    } catch (err) {
      // Re-enable and reconnect socket on rejection or network failure
      if (socket && typeof socket.restoreSocket === 'function') {
        socket.restoreSocket();
      }
      if (err?.code === 'ACTIVE_ORDER_EXISTS') {
        showAlert(
          'Cannot Delete Account',
          err.message || 'Cannot delete account while an order is currently active. Please wait until your order is completed or cancelled.'
        );
      } else if (err?.isNetworkError) {
        showAlert(
          'Network Error',
          'Connection failed while requesting account deletion. Your account was not deleted and remains active. Please check your internet connection and retry.'
        );
      } else {
        showAlert('Deletion Failed', err?.message || 'Failed to delete account. Please try again.');
      }
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header navigation={navigation} title="Profile" showCart={false} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <Image source={LOGO} style={styles.brandLogo} resizeMode="contain" />
        </View>

        {!isAuthenticated ? (
          <View style={styles.guestCard}>
            <View style={styles.guestIconCircle}>
              <Ionicons name="person-circle-outline" size={54} color={colors.primary} />
            </View>
            <Text style={styles.guestTitle}>Welcome, Guest</Text>
            <Text style={styles.guestSub}>
              Log in to view your profile, wallet balance, saved addresses, and track live orders.
            </Text>

            <TouchableOpacity
              style={styles.guestLoginBtn}
              onPress={() => requireLogin({ type: 'WALLET' })}
              activeOpacity={0.85}
            >
              <Text style={styles.guestLoginBtnText}>Phone / OTP Se Log In Karein</Text>
              <Ionicons name="arrow-forward" size={16} color="#15803d" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.guestLoginBtn, { backgroundColor: '#f0fdf4', borderColor: '#86efac', marginTop: 10 }]}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.85}
            >
              <Text style={[styles.guestLoginBtnText, { color: '#16a34a', fontWeight: '700' }]}>Password Login / Naya Account</Text>
              <Ionicons name="person-add-outline" size={16} color="#16a34a" />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Profile Card */}
            <View style={styles.profileCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(userProfile?.name || 'Customer').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{userProfile?.name || 'Customer User'}</Text>
                <Text style={styles.userPhone}>📱 +91 {userProfile?.phone || '9876543210'}</Text>
                <View style={styles.hubRow}>
                  <Ionicons name="location" size={12} color={colors.primary} />
                  <Text style={styles.userHub}>
                    {userProfile?.addresses?.[0]?.line1 || userProfile?.city || 'Ludhiana, Punjab'}
                  </Text>
                </View>
              </View>
              <View style={styles.customerBadge}>
                <Text style={styles.customerBadgeText}>VERIFIED</Text>
              </View>
            </View>

            {/* S-farmart Wallet Balance Card */}
            <View style={styles.walletCard}>
              <View style={styles.walletHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.walletIconCircle}>
                    <Ionicons name="wallet" size={20} color="#0284c7" />
                  </View>
                  <View>
                    <Text style={styles.walletTitle}>S-farmart Wallet</Text>
                    <Text style={styles.walletSub}>Instant 1-Tap Checkout Balance</Text>
                  </View>
                </View>
                <Text style={styles.walletAmount}>₹{walletDisplay}</Text>
              </View>
              <View style={styles.walletDivider} />
              <Text style={styles.walletHint}>
                ⚡ Use your preloaded balance on checkout for zero-fee instant orders.
              </Text>
            </View>
          </>
        )}

        {/* Quick Action Tiles */}
        <View style={styles.quickActions}>
          {[
            {
              icon: 'receipt-outline',
              label: 'Orders',
              screen: 'OrderTracking'
            },
            { icon: 'cart-outline', label: 'Cart', screen: 'Cart' },
            { icon: 'location-outline', label: 'Addresses', screen: null },
            { icon: 'help-circle-outline', label: 'Help', screen: null }
          ].map((action) => (
            <TouchableOpacity
              key={action.label}
              style={styles.actionTile}
              activeOpacity={0.8}
              onPress={() =>
                action.screen && navigation.navigate(action.screen)
              }
            >
              <View style={styles.actionIcon}>
                <Ionicons name={action.icon} size={20} color={colors.primary} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Security & Sessions Section */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionHeader}>SECURITY & SESSIONS</Text>

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => setShowLogoutAllModal(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconCircle, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="shield-outline" size={18} color="#d97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Logout from all devices</Text>
              <Text style={styles.menuSub}>Revoke all other web & mobile sessions</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Danger / Logout & Account Deletion Section */}
        <View style={[styles.sectionBox, { marginTop: 14 }]}>
          <TouchableOpacity
            style={styles.logoutRow}
            onPress={() => setShowLogoutModal(true)}
            activeOpacity={0.75}
            disabled={isLoggingOut || isDeletingAccount}
          >
            <View style={styles.logoutIconCircle}>
              <Ionicons name="log-out-outline" size={20} color="#dc2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.logoutTitle}>Log Out</Text>
              <Text style={styles.logoutSub}>Sign out of your S-farmart 24 account</Text>
            </View>
            {isLoggingOut ? (
              <ActivityIndicator size="small" color="#dc2626" />
            ) : (
              <Ionicons name="arrow-forward" size={18} color="#dc2626" />
            )}
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <TouchableOpacity
            style={[styles.logoutRow, { backgroundColor: '#fef2f2' }]}
            onPress={() => setShowDeleteModal(true)}
            activeOpacity={0.75}
            disabled={isLoggingOut || isDeletingAccount}
          >
            <View style={[styles.logoutIconCircle, { backgroundColor: '#fee2e2' }]}>
              <Ionicons name="trash-outline" size={20} color="#b91c1c" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.logoutTitle, { color: '#b91c1c' }]}>Delete Account</Text>
              <Text style={styles.logoutSub}>Permanently delete account & personal data</Text>
            </View>
            {isDeletingAccount ? (
              <ActivityIndicator size="small" color="#b91c1c" />
            ) : (
              <Ionicons name="chevron-forward" size={18} color="#b91c1c" />
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.appVersion}>S-farmart 24 • Version 1.0.0 (Secure JWT Auth)</Text>
      </ScrollView>

      {/* 1. Log Out Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowLogoutModal(false)}>
          <Pressable style={styles.modalDialog} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalIconWrapRed}>
              <Ionicons name="log-out" size={32} color="#dc2626" />
            </View>
            <Text style={styles.modalTitle}>Log Out of S-farmart 24?</Text>
            <Text style={styles.modalDesc}>Kya aap sure hain? Aapka cart clear ho jayega.</Text>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowLogoutModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalDestructiveBtn}
                onPress={confirmLogout}
                activeOpacity={0.85}
              >
                <Text style={styles.modalDestructiveText}>Yes, Log Out</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 2. Logout All Devices Modal */}
      <Modal
        visible={showLogoutAllModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutAllModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowLogoutAllModal(false)}>
          <Pressable style={styles.modalDialog} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalIconWrapAmber}>
              <Ionicons name="shield-checkmark" size={32} color="#d97706" />
            </View>
            <Text style={styles.modalTitle}>Logout Everywhere?</Text>
            <Text style={styles.modalDesc}>
              This will revoke all active sessions on other phones and web browsers.
            </Text>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowLogoutAllModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalDestructiveBtn, { backgroundColor: '#d97706' }]}
                onPress={confirmLogoutAll}
                activeOpacity={0.85}
              >
                <Text style={styles.modalDestructiveText}>Logout Everywhere</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 3. Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => !isDeletingAccount && setShowDeleteModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !isDeletingAccount && setShowDeleteModal(false)}
        >
          <Pressable style={styles.modalDialog} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalIconWrapRed}>
              <Ionicons name="trash" size={32} color="#dc2626" />
            </View>
            <Text style={[styles.modalTitle, { color: '#b91c1c' }]}>Permanently Delete Account?</Text>
            <Text style={[styles.modalDesc, { marginBottom: 10 }]}>
              This action is permanent and cannot be undone.
            </Text>

            <View style={styles.consequencesBox}>
              <Text style={styles.consequenceText}>• Name, phone number, and delivery addresses will be permanently deleted.</Text>
              <Text style={styles.consequenceText}>• All active sessions across devices will be revoked immediately.</Text>
              <Text style={styles.consequenceText}>• Unspent promotional wallet credits (₹{walletDisplay}) will be permanently forfeited.</Text>
              <Text style={styles.consequenceText}>• Past order receipts will be irreversibly anonymized.</Text>
              <Text style={styles.consequenceText}>• You cannot delete while an order is currently in delivery.</Text>
            </View>

            <View style={[styles.modalButtonsRow, { marginTop: 16 }]}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowDeleteModal(false)}
                disabled={isDeletingAccount}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalDestructiveBtn, { backgroundColor: '#dc2626' }]}
                onPress={confirmDeleteAccount}
                disabled={isDeletingAccount}
                activeOpacity={0.85}
              >
                {isDeletingAccount ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalDestructiveText}>Delete Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 90
  },
  brandRow: {
    alignItems: 'center',
    marginBottom: 12
  },
  brandLogo: {
    width: 88,
    height: 88
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    shadowColor: 'rgba(15, 23, 42, 0.05)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700'
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary
  },
  userPhone: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2
  },
  hubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4
  },
  userHub: {
    fontSize: 11,
    color: colors.primaryDark,
    fontWeight: '500',
    flex: 1
  },
  customerBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12
  },
  customerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryDark,
    letterSpacing: 0.5
  },
  walletCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#e0f2fe',
    shadowColor: 'rgba(2, 132, 199, 0.08)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  walletIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center'
  },
  walletTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a'
  },
  walletSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1
  },
  walletAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0284c7'
  },
  walletDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 10
  },
  walletHint: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14
  },
  actionTile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textPrimary
  },
  sectionBox: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 12
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6
  },
  menuIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.textPrimary
  },
  menuSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4
  },
  logoutIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center'
  },
  logoutTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#dc2626'
  },
  logoutSub: {
    fontSize: 11,
    color: '#ef4444',
    marginTop: 2
  },
  appVersion: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 10
  },
  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  modalDialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: 'rgba(0, 0, 0, 0.25)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10
  },
  modalIconWrapRed: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  modalIconWrapAmber: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8
  },
  modalDesc: {
    fontSize: 13.5,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%'
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569'
  },
  modalDestructiveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalDestructiveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff'
  },
  guestCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  guestIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  guestTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6
  },
  guestSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
    paddingHorizontal: 12
  },
  guest1TapDemoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 14,
    width: '100%',
    marginBottom: 10,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  guest1TapDemoBtnText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '700',
  },
  guestLoginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    width: '100%',
  },
  guestLoginBtnText: {
    color: '#15803d',
    fontSize: 13.5,
    fontWeight: '700',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 4
  },
  consequencesBox: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    gap: 6
  },
  consequenceText: {
    fontSize: 12,
    color: '#9f1239',
    lineHeight: 17
  },
});
