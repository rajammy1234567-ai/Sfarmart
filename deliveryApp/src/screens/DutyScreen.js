import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  StatusBar,
  RefreshControl,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRiderAuth } from '../context/RiderAuthContext';
import { useDelivery } from '../context/DeliveryContext';

export const DutyScreen = ({ navigation }) => {
  const { rider, toggleDutyStatus } = useRiderAuth();
  const {
    currentTask,
    availableOrders,
    earnings,
    refreshActiveOrder,
    refreshEarnings,
    fetchAvailablePool,
    acceptOffer,
    locationError
  } = useDelivery();

  const [dutyError,setDutyError]=useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTogglingDuty, setIsTogglingDuty] = useState(false);

  const isOnline = rider?.status === 'ONLINE_IDLE' || rider?.status === 'ON_DELIVERY';

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refreshActiveOrder(), refreshEarnings(), fetchAvailablePool()]);
    setIsRefreshing(false);
  };

  const handleToggleDuty = async () => {
    setIsTogglingDuty(true);
    try {
      await toggleDutyStatus();setDutyError('');
    } catch(e) {
      setDutyError(e.response?.data?.message || e.message);
    } finally {
      setIsTogglingDuty(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarCircle}>
            <Ionicons name="bicycle" size={24} color="#ffffff" />
          </View>
          <View>
            <Text style={styles.driverName}>{rider?.name || 'Delivery Partner'}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.vehicleText}>🛵 {rider?.vehicleNumber || 'PB-10-AB-1234'}</Text>
              <Text style={styles.ratingBadge}>★ {rider?.rating || 4.9}</Text>
            </View>
          </View>
        </View>

        {/* Duty Toggle Switch */}
        <View style={[styles.dutySwitchBox, { backgroundColor: isOnline ? '#f0fdf4' : '#f8fafc' }]}>
          <View style={[styles.dutyDot, { backgroundColor: isOnline ? '#16a34a' : '#94a3b8' }]} />
          <Text style={[styles.dutyLabel, { color: isOnline ? '#15803d' : '#64748b' }]}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </Text>
          {isTogglingDuty ? (
            <ActivityIndicator size="small" color="#16a34a" style={{ marginLeft: 6 }} />
          ) : (
            <Switch
              value={isOnline}
              onValueChange={handleToggleDuty}
              trackColor={{ false: '#cbd5e1', true: '#bbf7d0' }}
              thumbColor={isOnline ? '#16a34a' : '#94a3b8'}
            />
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {(dutyError || locationError)?<Text style={{padding:12,color:'#b45309'}}>{dutyError || locationError}</Text>:null}
        {/* Performance & Pay Bar */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>₹{earnings.todayEarnings}</Text>
            <Text style={styles.statLabel}>Today's Pay</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{earnings.completedCount}</Text>
            <Text style={styles.statLabel}>Trips Done</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: '#0284c7' }]}>₹65</Text>
            <Text style={styles.statLabel}>Base / Order</Text>
          </View>
        </View>

        {/* Active Trip Banner (if currently assigned) */}
        {currentTask && (
          <TouchableOpacity
            style={styles.activeTripCard}
            onPress={() => navigation.navigate('ActiveNavigation')}
            activeOpacity={0.85}
          >
            <View style={styles.activeTripHeader}>
              <View style={styles.activeBadge}>
                <View style={styles.pingDot} />
                <Text style={styles.activeBadgeText}>ACTIVE TRIP IN PROGRESS</Text>
              </View>
              <Text style={styles.activeOrderId}>#{currentTask.orderNumber}</Text>
            </View>

            <Text style={styles.activeStoreTitle}>{currentTask.vendor?.storeName || 'Merchant Store'}</Text>
            <Text style={styles.activeCustomerText}>
              Drop: {currentTask.customer?.name || 'Customer'} • {currentTask.address?.line1 || ''}
            </Text>

            <View style={styles.jumpBtnRow}>
              <Text style={styles.jumpBtnText}>Tap to Open Route & Navigation</Text>
              <Ionicons name="arrow-forward" size={16} color="#0284c7" />
            </View>
          </TouchableOpacity>
        )}

        {/* Duty Status Guidance */}
        {!isOnline && (
          <View style={styles.offlineNotice}>
            <Ionicons name="moon-outline" size={28} color="#64748b" />
            <Text style={styles.offlineNoticeTitle}>You are currently OFFLINE</Text>
            <Text style={styles.offlineNoticeSub}>
              Toggle your status to ONLINE above to start receiving instant delivery offers in your area.
            </Text>
          </View>
        )}

        {/* Available Dispatch Pool */}
        {isOnline && (
          <View style={styles.poolSection}>
            <View style={styles.poolHeader}>
              <Text style={styles.poolTitle}>Nearby Orders Available ({availableOrders.length})</Text>
              <TouchableOpacity onPress={onRefresh}>
                <Ionicons name="refresh" size={18} color="#0284c7" />
              </TouchableOpacity>
            </View>

            {availableOrders.length === 0 ? (
              <View style={styles.emptyPoolBox}>
                <Ionicons name="radio-outline" size={36} color="#94a3b8" />
                <Text style={styles.emptyPoolText}>Searching for nearby kitchen parcels...</Text>
                <Text style={styles.emptyPoolSub}>You will hear an audio chime the moment a store packs an order.</Text>
              </View>
            ) : (
              availableOrders.map((ord) => (
                <View key={ord._id} style={styles.orderCard}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.orderIdBadge}>#{ord.orderNumber}</Text>
                    <Text style={styles.estPayBadge}>₹65 Payout</Text>
                  </View>

                  <Text style={styles.cardStoreName}>{ord.vendor?.storeName || 'Merchant Store'}</Text>
                  <Text style={styles.cardStoreAddr}>
                    {typeof ord.vendor?.address === 'string'
                      ? ord.vendor.address
                      : ord.vendor?.address?.line1
                      ? `${ord.vendor.address.line1}, ${ord.vendor.address.city || ''}`
                      : 'Store Location'}
                  </Text>

                  <View style={styles.cardDivider} />

                  <Text style={styles.cardCustomerText}>
                    Drop: {ord.customer?.name || ord.address?.name || 'Customer'} (
                    {typeof ord.address === 'string'
                      ? ord.address
                      : ord.address?.line1 || ord.deliveryAddress || ''}
                    )
                  </Text>

                  <TouchableOpacity
                    style={styles.claimBtn}
                    onPress={() => acceptOffer(ord._id)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="bicycle" size={18} color="#ffffff" />
                    <Text style={styles.claimBtnText}>ACCEPT & START PICKUP</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 40 : 16,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center'
  },
  driverName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2
  },
  vehicleText: {
    fontSize: 11.5,
    color: '#64748b'
  },
  ratingBadge: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#eab308'
  },
  dutySwitchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6
  },
  dutyDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  dutyLabel: {
    fontSize: 11,
    fontWeight: '800'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    justifyContent: 'space-around',
    alignItems: 'center'
  },
  statItem: {
    alignItems: 'center'
  },
  statVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a'
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#e2e8f0'
  },
  activeTripCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#86efac',
    marginBottom: 18,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3
  },
  activeTripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  pingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a'
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803d'
  },
  activeOrderId: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
  },
  activeStoreTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  activeCustomerText: {
    fontSize: 12.5,
    color: '#475569',
    marginTop: 4
  },
  jumpBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#bbf7d0'
  },
  jumpBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7'
  },
  offlineNotice: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  offlineNoticeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    marginTop: 10
  },
  offlineNoticeSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18
  },
  poolSection: {
    marginTop: 4
  },
  poolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  poolTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a'
  },
  emptyPoolBox: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  emptyPoolText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginTop: 10
  },
  emptyPoolSub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4
  },
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  orderIdBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b'
  },
  estPayBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#16a34a',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  cardStoreName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a'
  },
  cardStoreAddr: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 10
  },
  cardCustomerText: {
    fontSize: 12.5,
    color: '#334155',
    marginBottom: 12
  },
  claimBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  claimBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff'
  }
});
