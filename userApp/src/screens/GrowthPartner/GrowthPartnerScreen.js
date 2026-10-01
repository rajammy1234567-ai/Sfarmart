import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { colors } from '../../theme/colors';

const dreamRewards = [
  {
    id: 'reward-1',
    title: 'Silver Partner Milestone',
    targetScore: 500,
    currentScore: 320,
    reward: 'Premium Smartphone / Tab',
    description: 'Achieve 500 network orders in your city zone',
    icon: 'phone-portrait-outline'
  },
  {
    id: 'reward-2',
    title: 'Gold Partner Milestone',
    targetScore: 2000,
    currentScore: 1240,
    reward: 'Electric Two-Wheeler EV',
    description: 'Achieve 2,000 network orders across your village hubs',
    icon: 'bicycle-outline'
  }
];

export const GrowthPartnerScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Header navigation={navigation} title="Growth Partner Leadership" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* City Leadership Header */}
        <View style={styles.heroBox}>
          <Ionicons name="trophy" size={32} color="#ffffff" />
          <Text style={styles.heroTitle}>City Growth Partner Dashboard</Text>
          <Text style={styles.heroSub}>Lead. Grow. Build Your City with S-farmart.</Text>
          <View style={styles.rankPill}>
            <Text style={styles.rankText}>Rank: District Senior Partner (Ludhiana Zone)</Text>
          </View>
        </View>

        {/* Network Metrics */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>14</Text>
            <Text style={styles.statTitle}>Village Hubs</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNum}>42</Text>
            <Text style={styles.statTitle}>Digital Partners</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNum}>1,240</Text>
            <Text style={styles.statTitle}>Active Customers</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNum}>₹14,250</Text>
            <Text style={styles.statTitle}>Est. Wed Commission</Text>
          </View>
        </View>

        {/* Dream Rewards Tracker */}
        <Text style={styles.sectionTitle}>🏆 S-farmart Dream Rewards Program</Text>
        <Text style={styles.sectionSub}>Milestones tracked automatically based on network orders</Text>

        {dreamRewards.map((reward) => {
          const progressPercent = Math.min(
            100,
            Math.round((reward.currentScore / reward.targetScore) * 100)
          );

          return (
            <View key={reward.id} style={styles.rewardCard}>
              <View style={styles.rewardHeader}>
                <View style={styles.rewardTitleRow}>
                  <Ionicons name={reward.icon} size={20} color={colors.accent} />
                  <Text style={styles.rewardTitle}>{reward.title}</Text>
                </View>
                <Text style={styles.rewardTarget}>
                  {reward.currentScore} / {reward.targetScore} Orders
                </Text>
              </View>

              <Text style={styles.rewardPrize}>🎁 Gift: {reward.reward}</Text>
              <Text style={styles.rewardDesc}>{reward.description}</Text>

              {/* Progress Bar */}
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
              </View>
              <Text style={styles.percentText}>{progressPercent}% Milestone Completed</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 16 },
  heroBox: {
    backgroundColor: colors.darkCard,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    alignItems: 'center'
  },
  heroTitle: { fontSize: 17, fontWeight: '500', color: '#ffffff', marginTop: 8 },
  heroSub: { fontSize: 11, color: '#94a3b8', marginTop: 2, textAlign: 'center' },
  rankPill: {
    backgroundColor: colors.accent + '30',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 10
  },
  rankText: { color: colors.accent, fontSize: 11, fontWeight: '500' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  statNum: { fontSize: 18, fontWeight: '500', color: colors.primaryDark },
  statTitle: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.textPrimary },
  sectionSub: { fontSize: 11, color: colors.textSecondary, marginBottom: 12 },
  rewardCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border
  },
  rewardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rewardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rewardTitle: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  rewardTarget: { fontSize: 11, fontWeight: '500', color: colors.accent },
  rewardPrize: { fontSize: 13, fontWeight: '500', color: colors.primaryDark, marginTop: 6 },
  rewardDesc: { fontSize: 11, color: colors.textSecondary, marginTop: 2, marginBottom: 10 },
  progressBg: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 4 },
  percentText: { fontSize: 10, fontWeight: '500', color: colors.textMuted, marginTop: 4, textAlign: 'right' }
});
