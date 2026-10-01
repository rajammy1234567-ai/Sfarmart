import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../context/CartContext';
import { colors } from '../theme/colors';

export const ShoppingFromBanner = ({ navigation }) => {
  const { vendorName, items, billSummary, clearEntireCart } = useCart();

  if (!vendorName || !items || items.length === 0) {
    return null;
  }

  const itemCount = items.reduce((sum, it) => sum + (it.quantity || it.qty || 1), 0);
  const totalRupees = billSummary?.total || 0;

  return (
    <View style={styles.banner}>
      <View style={styles.left}>
        <Ionicons name="storefront" size={16} color="#15803d" />
        <Text style={styles.storeText} numberOfLines={1}>
          {vendorName} se shopping
        </Text>
        <Text style={styles.dot}>•</Text>
        <Text style={styles.metaText}>
          {itemCount} item{itemCount > 1 ? 's' : ''} · ₹{totalRupees}
        </Text>
      </View>

      <View style={styles.right}>
        <TouchableOpacity
          style={styles.viewCartBtn}
          onPress={() => navigation?.navigate('Cart')}
          activeOpacity={0.8}
        >
          <Text style={styles.viewCartText}>View Cart</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.clearBtn}
          onPress={clearEntireCart}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={18} color="#64748b" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#ecfdf5',
    borderBottomWidth: 1,
    borderBottomColor: '#a7f3d0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8
  },
  storeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065f46',
    maxWidth: '45%'
  },
  dot: {
    fontSize: 12,
    color: '#059669'
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#047857'
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  viewCartBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8
  },
  viewCartText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },
  clearBtn: {
    padding: 2
  }
});
