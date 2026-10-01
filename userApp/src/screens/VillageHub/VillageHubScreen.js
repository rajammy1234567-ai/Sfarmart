import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { colors } from '../../theme/colors';

export const VillageHubScreen = ({ navigation }) => {
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('Desi Ghee (A2)');

  const handleBooking = () => {
    if (!customerName || !phone) {
      Alert.alert('Details Needed', 'Please enter customer name and phone number.');
      return;
    }
    Alert.alert('Village Order Booked!', `Order recorded for ${customerName}. Dispatch code issued!`, [
      { text: 'OK', onPress: () => { setCustomerName(''); setPhone(''); } }
    ]);
  };

  return (
    <View style={styles.container}>
      <Header navigation={navigation} title="Village Hub Terminal" />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.hubHeader}>
          <Ionicons name="home" size={28} color="#ffffff" />
          <View>
            <Text style={styles.hubTitle}>Village Hub - Tarn Taran</Text>
            <Text style={styles.hubDesc}>Assisting local village customers & farmer procurement</Text>
          </View>
        </View>

        {/* Offline Order Assistance Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Assisted Rural Customer Order Booking</Text>
          <Text style={styles.cardSub}>Place orders on behalf of village residents without smartphone</Text>

          <Text style={styles.label}>Customer Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Ramesh Kumar"
            value={customerName}
            onChangeText={setCustomerName}
          />

          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 98000 00000"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />

          <Text style={styles.label}>Selected Package / Produce</Text>
          <TextInput
            style={styles.input}
            value={selectedProduct}
            onChangeText={setSelectedProduct}
          />

          <TouchableOpacity style={styles.bookBtn} onPress={handleBooking}>
            <Text style={styles.bookBtnText}>Confirm Order Booking</Text>
          </TouchableOpacity>
        </View>

        {/* Hub Inventory Quick Check */}
        <Text style={styles.sectionTitle}>Hub Inventory Stock</Text>
        <View style={styles.stockRow}>
          <View style={styles.stockItem}>
            <Text style={styles.stockQty}>450 kg</Text>
            <Text style={styles.stockName}>Fresh Tomatoes</Text>
          </View>
          <View style={styles.stockItem}>
            <Text style={styles.stockQty}>120 Liters</Text>
            <Text style={styles.stockName}>Fresh Milk</Text>
          </View>
          <View style={styles.stockItem}>
            <Text style={styles.stockQty}>85 Jars</Text>
            <Text style={styles.stockName}>Desi Ghee</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export const WomenEntrepreneurScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Header navigation={navigation} title="Women Entrepreneur Portal" />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.weBanner}>
          <Ionicons name="heart-circle" size={36} color="#ffffff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.weTitle}>S-farmart Women Entrepreneur Program</Text>
            <Text style={styles.weDesc}>Turn your cooking, baking & craft skills into a thriving brand.</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>₹8,400</Text>
            <Text style={styles.statLabel}>Weekly Earnings</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statVal}>48</Text>
            <Text style={styles.statLabel}>Orders Served</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statVal}>4.9 ⭐</Text>
            <Text style={styles.statLabel}>Customer Rating</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Your Registered Offerings</Text>

        <View style={styles.offeringCard}>
          <Ionicons name="restaurant-outline" size={22} color="#ec4899" />
          <View style={{ flex: 1 }}>
            <Text style={styles.offeringTitle}>Homestyle Rajma Chawal Thali</Text>
            <Text style={styles.offeringDesc}>Category: Home Restro • Price: ₹130</Text>
          </View>
          <View style={styles.activePill}><Text style={styles.activeText}>ACTIVE</Text></View>
        </View>

        <View style={styles.offeringCard}>
          <Ionicons name="gift-outline" size={22} color="#ec4899" />
          <View style={{ flex: 1 }}>
            <Text style={styles.offeringTitle}>Gur Besan Ladoo (Organic)</Text>
            <Text style={styles.offeringDesc}>Category: Desi Sweets • Price: ₹240</Text>
          </View>
          <View style={styles.activePill}><Text style={styles.activeText}>ACTIVE</Text></View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 16 },
  hubHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.secondary, borderRadius: 16, padding: 16, gap: 12, marginBottom: 14 },
  hubTitle: { fontSize: 16, fontWeight: '500', color: '#ffffff' },
  hubDesc: { fontSize: 11, color: '#ffedd5', marginTop: 2 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  cardSub: { fontSize: 11, color: colors.textSecondary, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '500', color: colors.textPrimary, marginTop: 8, marginBottom: 4 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  bookBtn: { backgroundColor: colors.secondary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  bookBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '500' },
  sectionTitle: { fontSize: 15, fontWeight: '500', color: colors.textPrimary, marginBottom: 10 },
  stockRow: { flexDirection: 'row', gap: 10 },
  stockItem: { flex: 1, backgroundColor: colors.card, padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  stockQty: { fontSize: 15, fontWeight: '500', color: colors.primaryDark },
  stockName: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

  weBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ec4899', borderRadius: 16, padding: 16, gap: 12, marginBottom: 14 },
  weTitle: { fontSize: 16, fontWeight: '500', color: '#ffffff' },
  weDesc: { fontSize: 11, color: '#fce7f3', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statVal: { fontSize: 15, fontWeight: '500', color: '#9d174d' },
  statLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  offeringCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, gap: 12 },
  offeringTitle: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  offeringDesc: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  activePill: { backgroundColor: '#fce7f3', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  activeText: { fontSize: 10, fontWeight: '500', color: '#9d174d' }
});
