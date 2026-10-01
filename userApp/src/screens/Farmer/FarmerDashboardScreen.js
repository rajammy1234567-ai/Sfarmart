import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { useApp } from '../../context/AppContext';
import { colors } from '../../theme/colors';

export const FarmerDashboardScreen = ({ navigation }) => {
  const { farmerListings, userProfile } = useApp();

  const listings = Array.isArray(farmerListings) ? farmerListings : [];

  return (
    <View style={styles.container}>
      <Header navigation={navigation} title="Farmer Partner Portal" />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Banner */}
        <View style={styles.banner}>
          <Ionicons name="leaf" size={28} color="#ffffff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Farmer Direct Marketplace</Text>
            <Text style={styles.bannerDesc}>
              Fair prices, direct village hub procurement & weekly Wednesday settlements.
            </Text>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{listings.length}</Text>
            <Text style={styles.statLabel}>Active Harvests</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>₹4,850</Text>
            <Text style={styles.statLabel}>Pending Settlement</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>Wednesday</Text>
            <Text style={styles.statLabel}>Next Payout</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('AddHarvest')}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle" size={22} color="#ffffff" />
          <Text style={styles.addBtnText}>List New Harvest Produce</Text>
        </TouchableOpacity>

        {/* Existing Listings */}
        <Text style={styles.sectionTitle}>Your Harvest Produce Listings</Text>
        {listings.map((item) => (
          <View key={item.id} style={styles.listingCard}>
            <View style={styles.listingHeader}>
              <Text style={styles.cropTitle}>{item.cropName}</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>{(item.status || 'SUBMITTED').replace(/_/g, ' ')}</Text>
              </View>
            </View>

            <View style={styles.detailsRow}>
              <Text style={styles.detailText}>Quantity: {item.quantity}</Text>
              <Text style={styles.detailText}>Rate: ₹{item.expectedPrice}/kg</Text>
            </View>
            <Text style={styles.hubText}>Assigned: {item.hubAssigned}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export const AddHarvestScreen = ({ navigation }) => {
  const { addFarmerListing } = useApp();
  const [cropName, setCropName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expectedPrice, setExpectedPrice] = useState('');

  const handleSubmit = () => {
    if (!cropName || !quantity || !expectedPrice) {
      Alert.alert('Incomplete Form', 'Please provide crop name, quantity, and rate.');
      return;
    }
    addFarmerListing({
      cropName,
      quantity: `${quantity} kg`,
      expectedPrice: Number(expectedPrice),
      harvestDate: new Date().toISOString().split('T')[0]
    });
    Alert.alert('Listing Submitted!', 'Your produce has been listed for Village Hub pickup.', [
      { text: 'OK', onPress: () => navigation.goBack() }
    ]);
  };

  return (
    <View style={styles.container}>
      <Header navigation={navigation} title="List Produce" />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Harvest Details</Text>

          <Text style={styles.label}>Produce / Crop Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Fresh Potatoes, Spinach, Wheat"
            value={cropName}
            onChangeText={setCropName}
          />

          <Text style={styles.label}>Quantity Available (kg)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 200"
            keyboardType="numeric"
            value={quantity}
            onChangeText={setQuantity}
          />

          <Text style={styles.label}>Expected Rate per kg (₹)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 25"
            keyboardType="numeric"
            value={expectedPrice}
            onChangeText={setExpectedPrice}
          />

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
            <Text style={styles.submitBtnText}>Submit to Village Hub</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 16 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryDark,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginBottom: 14
  },
  bannerTitle: { fontSize: 16, fontWeight: '500', color: '#ffffff' },
  bannerDesc: { fontSize: 11, color: '#dcfce7', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statBox: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  statVal: { fontSize: 15, fontWeight: '500', color: colors.primaryDark },
  statLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 16
  },
  addBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '500' },
  sectionTitle: { fontSize: 15, fontWeight: '500', color: colors.textPrimary, marginBottom: 10 },
  listingCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  listingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cropTitle: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  statusPill: { backgroundColor: colors.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '500', color: colors.primaryDark },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  detailText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  hubText: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  formCard: { backgroundColor: colors.card, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  formTitle: { fontSize: 16, fontWeight: '500', color: colors.textPrimary, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '500', color: colors.textPrimary, marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 18 },
  submitBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '500' }
});
