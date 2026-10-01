import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDelivery } from '../context/DeliveryContext';

export const EarningsScreen = () => {
  const { earnings, refreshEarnings } = useDelivery();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshEarnings();
    setRefreshing(false);
  };

  const todayAmount = earnings?.todayEarnings || 0;
  const totalAmount = earnings?.totalEarnings || 0;
  const completedCount = earnings?.completedCount || (todayAmount > 0 ? Math.floor(todayAmount / 65) : 0);
  const recentTrips = earnings?.recentTrips || [];

  // Weekly incentive tier calculations (target: 10 trips)
  const incentiveTarget = 10;
  const progressPercent = Math.min(100, Math.round((completedCount / incentiveTarget) * 100));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Top Header */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.headerTitle}>Earnings & Ledger</Text>
          <Text style={styles.headerSub}>Rider Partner Weekly Payout</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh" size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0284c7" />}
      >
        {/* Dark Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroTag}>TODAY'S ACCUMULATED EARNINGS</Text>
            <View style={styles.liveDot} />
          </View>

          <Text style={styles.heroAmount}>₹{todayAmount}</Text>

          <View style={styles.heroStatsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{completedCount}</Text>
              <Text style={styles.statLabel}>Trips Done</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>₹65</Text>
              <Text style={styles.statLabel}>Avg / Trip</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>₹{totalAmount}</Text>
              <Text style={styles.statLabel}>Total Pay</Text>
            </View>
          </View>

          <View style={styles.settlementBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#10b981" />
            <Text style={styles.settlementText}>Direct Bank Payout every Wednesday 10:00 AM</Text>
          </View>
        </View>

        {/* Weekly Incentive Milestone Progress */}
        <View style={styles.milestoneCard}>
          <View style={styles.milestoneHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="trophy" size={20} color="#f59e0b" />
              <Text style={styles.milestoneTitle}>Weekly Milestone Bonus</Text>
            </View>
            <Text style={styles.milestoneReward}>+₹150 Extra</Text>
          </View>

          <Text style={styles.milestoneSub}>
            Complete {incentiveTarget} orders this week to unlock ₹150 instant performance incentive.
          </Text>

          {/* Progress Bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>

          <View style={styles.progressMeta}>
            <Text style={styles.progressMetaText}>{completedCount} / {incentiveTarget} Completed</Text>
            <Text style={styles.progressMetaText}>{progressPercent}% Done</Text>
          </View>
        </View>

        {/* Payout Breakdown Card */}
        <View style={styles.breakdownCard}>
          <Text style={styles.sectionHeading}>TRIP FARE STRUCTURE</Text>

          <View style={styles.breakdownRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="bicycle-outline" size={16} color="#0284c7" />
              <Text style={styles.breakdownLabel}>Base Pickup & Drop Fee</Text>
            </View>
            <Text style={styles.breakdownValue}>₹45.00</Text>
          </View>

          <View style={styles.breakdownRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="speedometer-outline" size={16} color="#0284c7" />
              <Text style={styles.breakdownLabel}>Distance Surge (per km > 2km)</Text>
            </View>
            <Text style={styles.breakdownValue}>₹15.00</Text>
          </View>

          <View style={styles.breakdownRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="flash-outline" size={16} color="#0284c7" />
              <Text style={styles.breakdownLabel}>Peak Demand Incentive</Text>
            </View>
            <Text style={styles.breakdownValue}>₹5.00</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownTotalLabel}>Standard Net Trip Payout</Text>
            <Text style={styles.breakdownTotalValue}>₹65.00 / trip</Text>
          </View>
        </View>

        {/* Recent Trips Log */}
        <View style={styles.tripsCard}>
          <Text style={styles.sectionHeading}>RECENT COMPLETED DELIVERIES</Text>

          {recentTrips.length === 0 ? (
            <View style={styles.emptyTripsBox}>
              <Ionicons name="time-outline" size={36} color="#94a3b8" />
              <Text style={styles.emptyTripsTitle}>No trips completed today yet</Text>
              <Text style={styles.emptyTripsSub}>Accepted orders will appear here as soon as you verify the customer OTP.</Text>
            </View>
          ) : (
            recentTrips.map((trip, idx) => (
              <View key={trip._id || idx} style={styles.tripItem}>
                <View style={styles.tripLeft}>
                  <View style={styles.tripIconBox}>
                    <Ionicons name="checkmark-done" size={18} color="#16a34a" />
                  </View>
                  <View>
                    <Text style={styles.tripOrderNumber}>#{trip.orderNumber || String(trip._id || trip.id).slice(-6)}</Text>
                    <Text style={styles.tripStore}>{trip.vendor?.storeName || 'Partner Store'} ➔ {trip.address?.city || 'Ludhiana'}</Text>
                    <Text style={styles.tripTime}>
                      {trip.updatedAt ? new Date(trip.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.tripAmount}>+₹65</Text>
              </View>
            ))
          )}
        </View>
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
  headerSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  heroCard: {
    backgroundColor: '#0f172a',
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  heroTag: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 0.8
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981'
  },
  heroAmount: {
    fontSize: 38,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 16
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 14
  },
  statBox: {
    alignItems: 'center'
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff'
  },
  statLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)'
  },
  settlementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10
  },
  settlementText: {
    color: '#10b981',
    fontSize: 11.5,
    fontWeight: '600'
  },
  milestoneCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  milestoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  milestoneTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a'
  },
  milestoneReward: {
    fontSize: 13,
    fontWeight: '800',
    color: '#f59e0b'
  },
  milestoneSub: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
    marginBottom: 12
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#f59e0b',
    borderRadius: 4
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  progressMetaText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8'
  },
  breakdownCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8,
    marginBottom: 12
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500'
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 8
  },
  breakdownTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a'
  },
  breakdownTotalValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#16a34a'
  },
  tripsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  emptyTripsBox: {
    alignItems: 'center',
    paddingVertical: 28
  },
  emptyTripsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginTop: 8
  },
  emptyTripsSub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20
  },
  tripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  tripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  tripIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center'
  },
  tripOrderNumber: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a'
  },
  tripStore: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1
  },
  tripTime: {
    fontSize: 10.5,
    color: '#94a3b8',
    marginTop: 2
  },
  tripAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16a34a'
  }
});
