import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
  Platform,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRiderAuth } from '../context/RiderAuthContext';

export const ProfileScreen = () => {
  const { rider, logoutRider } = useRiderAuth();

  const handleLogout = () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to go offline and log out from Delivery Portal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await logoutRider();
          }
        }
      ]
    );
  };

  const handleSupportCall = () => {
    Linking.openURL('tel:1800123456').catch(() => {
      Alert.alert('Support Line', 'Farmart Rider Support: 1800-123-456 (24x7)');
    });
  };

  const name = rider?.name || 'Gurmukh Singh';
  const phone = rider?.phone || '9876543220';
  const vehicleType = rider?.vehicle?.type || 'BIKE';
  const vehicleModel = rider?.vehicle?.model || 'Hero Splendor Plus';
  const plateNumber = rider?.vehicle?.plateNumber || 'PB-10-AB-1234';
  const status = rider?.status || 'OFFLINE';
  const rating = rider?.rating || 4.9;
  const totalTrips = rider?.stats?.totalDeliveries || 142;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Top Header */}
      <View style={styles.topHeader}>
        <Text style={styles.headerTitle}>Rider Partner Profile</Text>
        <View style={[styles.statusBadge, status === 'OFFLINE' ? styles.statusOffline : styles.statusOnline]}>
          <View style={[styles.statusDot, status === 'OFFLINE' ? styles.dotOffline : styles.dotOnline]} />
          <Text style={[styles.statusText, status === 'OFFLINE' ? styles.textOffline : styles.textOnline]}>
            {status.replace(/_/g, ' ')}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>{name.charAt(0)}</Text>
            </View>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={12} color="#f59e0b" />
              <Text style={styles.ratingText}>{rating}</Text>
            </View>
          </View>

          <Text style={styles.riderName}>{name}</Text>
          <Text style={styles.riderPhone}>+91 {phone}</Text>

          <View style={styles.riderMetaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaVal}>{totalTrips}</Text>
              <Text style={styles.metaKey}>Completed Deliveries</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaItem}>
              <Text style={styles.metaVal}>99.4%</Text>
              <Text style={styles.metaKey}>On-Time Rating</Text>
            </View>
          </View>
        </View>

        {/* Assigned Vehicle Details */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="bicycle" size={18} color="#0284c7" />
            <Text style={styles.sectionTitle}>REGISTERED DELIVERY VEHICLE</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Vehicle Type</Text>
            <Text style={styles.infoVal}>{vehicleType} (Two-Wheeler)</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Vehicle Model</Text>
            <Text style={styles.infoVal}>{vehicleModel}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>License Plate #</Text>
            <View style={styles.platePill}>
              <Text style={styles.plateText}>{plateNumber}</Text>
            </View>
          </View>
        </View>

        {/* Verified KYC Documents */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="shield-checkmark" size={18} color="#16a34a" />
            <Text style={[styles.sectionTitle, { color: '#16a34a' }]}>VERIFIED KYC CREDENTIALS</Text>
          </View>

          <View style={styles.kycRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
              <Text style={styles.kycText}>Commercial Driving License</Text>
            </View>
            <Text style={styles.verifiedBadge}>VERIFIED</Text>
          </View>

          <View style={styles.kycRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
              <Text style={styles.kycText}>Aadhaar Identity Verification</Text>
            </View>
            <Text style={styles.verifiedBadge}>VERIFIED</Text>
          </View>

          <View style={styles.kycRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
              <Text style={styles.kycText}>Vehicle Registration Certificate (RC)</Text>
            </View>
            <Text style={styles.verifiedBadge}>VERIFIED</Text>
          </View>
        </View>

        {/* Direct Payout Bank Account */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="card-outline" size={18} color="#0f172a" />
            <Text style={styles.sectionTitle}>DIRECT SETTLEMENT BANK ACCOUNT</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Bank Name</Text>
            <Text style={styles.infoVal}>HDFC Bank Ltd.</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Account Number</Text>
            <Text style={styles.infoVal}>••••••••4812</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>IFSC Code</Text>
            <Text style={styles.infoVal}>HDFC0001234</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Cycle</Text>
            <Text style={[styles.infoVal, { color: '#16a34a', fontWeight: '700' }]}>Every Wednesday Automated NEFT</Text>
          </View>
        </View>

        {/* 24x7 Rider Support Button */}
        <TouchableOpacity style={styles.supportBtn} onPress={handleSupportCall} activeOpacity={0.85}>
          <Ionicons name="headset-outline" size={20} color="#0284c7" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.supportBtnTitle}>Rider Partner Helpline</Text>
            <Text style={styles.supportBtnSub}>24x7 toll-free dispatch and emergency support</Text>
          </View>
          <Ionicons name="call-outline" size={18} color="#0284c7" />
        </TouchableOpacity>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.logoutText}>Log Out from Rider Portal</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 52 : 20,
    paddingBottom: 16,
    backgroundColor: '#0f172a'
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff'
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  statusOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)'
  },
  statusOffline: {
    backgroundColor: 'rgba(148, 163, 184, 0.2)'
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5
  },
  dotOnline: {
    backgroundColor: '#10b981'
  },
  dotOffline: {
    backgroundColor: '#94a3b8'
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700'
  },
  textOnline: {
    color: '#10b981'
  },
  textOffline: {
    color: '#cbd5e1'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 12
  },
  avatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff'
  },
  ratingBadge: {
    position: 'absolute',
    bottom: -2,
    right: -6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ffffff'
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff'
  },
  riderName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a'
  },
  riderPhone: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500'
  },
  riderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  metaItem: {
    alignItems: 'center'
  },
  metaVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a'
  },
  metaKey: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2
  },
  metaDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#e2e8f0'
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14
  },
  sectionTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.6
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7
  },
  infoKey: {
    fontSize: 13,
    color: '#64748b'
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  platePill: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  plateText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a'
  },
  kycRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  kycText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600'
  },
  verifiedBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16a34a',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginBottom: 16
  },
  supportBtnTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0284c7'
  },
  supportBtnSub: {
    fontSize: 11.5,
    color: '#0369a1',
    marginTop: 2
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca'
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '800'
  }
});
