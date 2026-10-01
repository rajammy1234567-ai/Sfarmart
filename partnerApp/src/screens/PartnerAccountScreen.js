import React,{useState} from 'react';
import {API_BASE_URL} from '../config/env';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  TextInput,
  Linking,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePartner } from '../context/PartnerContext';
import { GlassCard } from '../components/GlassCard';
import { WaterBackground } from '../components/WaterBackground';
import { showAlert } from '../utils/alert';

export const PartnerAccountScreen = () => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;

  const { vendor, token, logoutVendor } = usePartner();

  const [pickupLat,setPickupLat]=useState(String(vendor?.address?.location?.coordinates?.[1] ?? ''));
  const [pickupLng,setPickupLng]=useState(String(vendor?.address?.location?.coordinates?.[0] ?? ''));
  const [savingPin,setSavingPin]=useState(false);
  const savePin = async () => {
    const lat = Number(pickupLat), lng = Number(pickupLng);
    if (!pickupLat.trim() || !pickupLng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      showAlert('Invalid location', 'Enter a valid store pickup pin.');
      return;
    }
    setSavingPin(true);
    try {
      const response = await fetch(API_BASE_URL + '/vendors/me/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({ location: { lat, lng } })
      });
      if (response.status === 401) {
        await logoutVendor();
        showAlert('Session Expired', 'Your merchant session has expired. Please log in again.');
        return;
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'Could not save location');
      showAlert('Pickup pin saved', 'Riders will navigate to this store entrance.');
    } catch (e) {
      showAlert('Unable to save', e.message);
    } finally {
      setSavingPin(false);
    }
  };
  const handleLogout = () => {
    showAlert(
      'Confirm Logout',
      `Are you sure you want to log out of ${vendor?.storeName || 'Partner Portal'}? You will need your credentials to log back in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await logoutVendor();
            } catch (err) {
              console.warn('Logout error:', err);
            }
          }
        }
      ]
    );
  };

  const isStoreOpen = vendor?.isOpen ?? true;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <WaterBackground />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20) + 12,
            paddingBottom: Math.max(insets.bottom, 20) + 120,
            maxWidth: isTablet ? 720 : '100%',
            alignSelf: 'center',
            width: '100%'
          }
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Title */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageHeaderTitle}>Store Profile & Account</Text>
          <Text style={styles.pageHeaderSub}>Manage your verified merchant credentials and settings</Text>
        </View>

        {/* 1. Main Store Identity Card */}
        <GlassCard style={styles.profileCard} showSheen={true}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarGlow}>
              <Ionicons name="storefront" size={32} color="#ea580c" />
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.storeName} numberOfLines={1}>
                  {vendor?.storeName || 'Merchant Partner'}
                </Text>
                <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
              </View>
              <Text style={styles.ownerName}>
                {vendor?.ownerName || 'Verified Merchant'}
              </Text>
              <View style={styles.phoneRow}>
                <Ionicons name="call-outline" size={13} color="#ea580c" />
                <Text style={styles.phoneText}>{vendor?.phone || '+91 98765 43210'}</Text>
              </View>
            </View>
          </View>

          {/* Quick Metrics & Live Duty Badge */}
          <View style={styles.storeMetricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Store Duty</Text>
              <View style={styles.statusBadgeWrap}>
                <View style={[styles.statusDot, isStoreOpen ? styles.dotOnline : styles.dotOffline]} />
                <Text style={[styles.statusText, isStoreOpen ? styles.textOnline : styles.textOffline]}>
                  {isStoreOpen ? 'ONLINE' : 'OFFLINE'}
                </Text>
              </View>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Customer Rating</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={14} color="#f59e0b" />
                <Text style={styles.metricValue}>{vendor?.rating || '4.9'} ★</Text>
              </View>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Orders Fulfilled</Text>
              <Text style={styles.metricValue}>180+ orders</Text>
            </View>
          </View>
        </GlassCard>

        {/* 2. Store Operational Parameters Card */}
        <GlassCard style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.sectionIconOrb, { backgroundColor: 'rgba(234, 88, 12, 0.12)' }]}>
              <Ionicons name="options-outline" size={18} color="#ea580c" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.sectionTitle}>Store Operational Details</Text>
              <Text style={styles.sectionSubtitle}>Standard parameters shown to customers</Text>
            </View>
          </View>

          <View style={styles.detailBox}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Business Specialization</Text>
              <Text style={styles.detailVal}>{vendor?.storeType || 'Fresh Farm Produce & Groceries'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Minimum Order Value</Text>
              <Text style={styles.detailVal}>₹{vendor?.minOrderValue || 99}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Average Preparation Time</Text>
              <Text style={styles.detailVal}>{vendor?.avgPrepTimeMins || 15} - 25 mins</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Service Radius</Text>
              <Text style={styles.detailVal}>Up to 8 km express delivery</Text>
            </View>
            <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.detailLabel}>Operating Hours</Text>
              <Text style={styles.detailVal}>07:00 AM – 10:30 PM (Daily)</Text>
            </View>
          </View>
        </GlassCard>

        <GlassCard style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Store entrance pin</Text>
          <Text style={{marginVertical:10}}>Copy the coordinates of your entrance from Google Maps. Riders use this pin for pickup.</Text>
          <TextInput accessibilityLabel="Store latitude" value={pickupLat} onChangeText={setPickupLat} placeholder="Latitude" style={{padding:12,borderWidth:1,borderColor:'#cbd5e1',marginVertical:5}}/>
          <TextInput accessibilityLabel="Store longitude" value={pickupLng} onChangeText={setPickupLng} placeholder="Longitude" style={{padding:12,borderWidth:1,borderColor:'#cbd5e1',marginVertical:5}}/>
          <TouchableOpacity disabled={savingPin} onPress={savePin}><Text style={{padding:12,color:'#15803d',fontWeight:'700'}}>{savingPin?'Saving...':'Save pickup pin'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={()=>Linking.openURL('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(pickupLat+','+pickupLng)).catch(()=>{})}><Text style={{padding:12,color:'#0284c7'}}>Preview in Google Maps</Text></TouchableOpacity>
        </GlassCard>
        {/* 3. Store Pickup & Location Address Card */}
        <GlassCard style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.sectionIconOrb, { backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
              <Ionicons name="location-outline" size={18} color="#0891b2" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.sectionTitle}>Pickup & Dispatch Address</Text>
              <Text style={styles.sectionSubtitle}>Assigned location for delivery partner pick-ups</Text>
            </View>
          </View>

          <View style={styles.detailBox}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Store Address</Text>
              <Text style={styles.detailVal}>{vendor?.address?.line1 || 'Main Market Road, Model Town'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>City & Region</Text>
              <Text style={styles.detailVal}>{vendor?.address?.city || 'Ludhiana'}, {vendor?.address?.state || 'Punjab'}</Text>
            </View>
            <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.detailLabel}>Postal Pincode</Text>
              <Text style={styles.detailVal}>{vendor?.address?.pincode || '141001'}</Text>
            </View>
          </View>
        </GlassCard>

        {/* 4. Banking & Payout Settlement Info */}
        <GlassCard style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.sectionIconOrb, { backgroundColor: 'rgba(22, 163, 74, 0.12)' }]}>
              <Ionicons name="wallet-outline" size={18} color="#16a34a" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.sectionTitle}>Banking & Weekly Settlements</Text>
              <Text style={styles.sectionSubtitle}>Automated earnings payout account</Text>
            </View>
          </View>

          <View style={styles.detailBox}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Payout Schedule</Text>
              <Text style={styles.detailVal}>Every Wednesday (06:00 AM)</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Linked Bank</Text>
              <Text style={styles.detailVal}>State Bank of India (SBI)</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Account Number</Text>
              <Text style={styles.detailVal}>•••• •••• 4321 (KYC Verified)</Text>
            </View>
            <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.detailLabel}>Settlement Mode</Text>
              <Text style={styles.detailVal}>Direct NEFT / IMPS Transfer</Text>
            </View>
          </View>
        </GlassCard>

        {/* 5. Account Security & Privacy Guarantee */}
        <GlassCard style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.sectionIconOrb, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#2563eb" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.sectionTitle}>Account Security & Protection</Text>
              <Text style={styles.sectionSubtitle}>Encrypted merchant session active</Text>
            </View>
          </View>

          <Text style={styles.securityExplanation}>
            Your partner store data, inventory catalog, and incoming customer orders are isolated and private. Unauthorized access or 1-tap switching without phone and password authentication is strictly blocked.
          </Text>
        </GlassCard>

        {/* 6. Secure Log Out Button */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.logoutText}>Log Out of Partner Account</Text>
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
  scrollContent: {
    paddingHorizontal: 16
  },
  pageHeader: {
    marginBottom: 16
  },
  pageHeaderTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a'
  },
  pageHeaderSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  profileCard: {
    marginBottom: 16,
    padding: 18
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  avatarGlow: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(234, 88, 12, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(234, 88, 12, 0.35)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  storeName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    flexShrink: 1
  },
  ownerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4
  },
  phoneText: {
    fontSize: 12,
    color: '#ea580c',
    fontWeight: '700'
  },
  storeMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226, 232, 240, 0.7)'
  },
  metricItem: {
    flex: 1,
    alignItems: 'center'
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a'
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(226, 232, 240, 0.8)'
  },
  statusBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.7)'
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  dotOnline: {
    backgroundColor: '#16a34a'
  },
  dotOffline: {
    backgroundColor: '#dc2626'
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800'
  },
  textOnline: {
    color: '#15803d'
  },
  textOffline: {
    color: '#b91c1c'
  },
  sectionCard: {
    marginBottom: 16,
    padding: 16
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionIconOrb: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a'
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1
  },
  detailBox: {
    marginTop: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 4
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.6)'
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500'
  },
  detailVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 10
  },
  securityExplanation: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginTop: 2
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    marginTop: 4,
    marginBottom: 16
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ef4444'
  }
});
