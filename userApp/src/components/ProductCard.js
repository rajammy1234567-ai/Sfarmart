import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useCart } from '../context/CartContext';
import { showAlert } from '../utils/alert';
import { TactileButton } from './common/TactileButton';
import { SafeImage } from './common/SafeImage';

export const ProductCard = ({ product, onPress, compact = false }) => {
  const { addToCart, updateQuantity, items, vendorId: currentCartVendorId } = useCart();
  if (!product) return null;
  const prodId = product._id || product.id;
  const cartItem = items?.find((item) => (item.product?._id || item.product?.id || item.productId) === prodId);
  const qty = cartItem ? cartItem.quantity : 0;

  const prodVendorId = (product.vendor?._id || product.vendor?.id || (typeof product.vendor === 'string' ? product.vendor : null) || product.vendorId);
  const isDifferentVendor = Boolean(currentCartVendorId && prodVendorId && currentCartVendorId.toString() !== prodVendorId.toString() && items?.length > 0);

  const isOutOfStock = product.inStock === false || (product.stockQty !== undefined && product.stockQty <= 0);
  const isLowStock = !isOutOfStock && product.stockQty !== undefined && product.stockQty <= 5 && product.stockQty > 0;
  const isMaxStockReached = !isOutOfStock && product.stockQty !== undefined && qty >= product.stockQty;

  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.cardCompact, isOutOfStock && { opacity: 0.85 }]}
      onPress={onPress}
      activeOpacity={0.92}
    >
      <View style={[styles.imageContainer, compact && styles.imageCompact]}>
        <SafeImage source={{ uri: product.image }} style={styles.image} resizeMode="cover" placeholderIcon="leaf-outline" />
        {product.discount && !isOutOfStock ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{product.discount}</Text>
          </View>
        ) : null}
        <View style={styles.ratingPill}>
          <Ionicons name="star" size={10} color="#f59e0b" />
          <Text style={styles.ratingText}>{product.rating || '4.8'}</Text>
        </View>

        {isOutOfStock && (
          <View style={styles.soldOutOverlay}>
            <Text style={styles.soldOutPill}>SOLD OUT</Text>
          </View>
        )}
      </View>

      <View style={styles.details}>
        <Text style={styles.title} numberOfLines={2}>
          {product.name}
        </Text>

        <View style={styles.unitRow}>
          <Text style={styles.unit} numberOfLines={1}>
            {product.unit}
          </Text>
          {isLowStock && (
            <Text style={styles.lowStockTag}>🔥 {product.stockQty} left</Text>
          )}
          {isOutOfStock && (
            <Text style={styles.outOfStockTag}>🔴 Out of stock</Text>
          )}
        </View>

        <View style={styles.farmerRow}>
          <Ionicons name="shield-checkmark" size={11} color={colors.primary} />
          <Text style={styles.farmerText} numberOfLines={1}>
            {product.farmer || 'Verified Farm'}
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.price}>₹{product.price}</Text>

          {isOutOfStock ? (
            <View style={styles.outOfStockBtn}>
              <Text style={styles.outOfStockBtnText}>SOLD OUT</Text>
            </View>
          ) : qty > 0 ? (
            <View style={styles.qtyControl}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQuantity(product._id || product.id, -1)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={14} color="#ffffff" />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{qty}</Text>
              <TouchableOpacity
                style={[styles.qtyBtn, isMaxStockReached && { opacity: 0.35 }]}
                onPress={() => {
                  if (isMaxStockReached) {
                    showAlert('Stock Limit', `Only ${product.stockQty} unit(s) available in stock.`);
                    return;
                  }
                  addToCart(product);
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={14} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TactileButton
              style={[styles.addButton, isDifferentVendor && styles.addButtonOutline]}
              onPress={() => addToCart(product)}
              rippleColor="rgba(22, 163, 74, 0.28)"
            >
              <Text style={[styles.addButtonText, isDifferentVendor && styles.addButtonTextOutline]}>
                {isDifferentVendor ? '+ ADD' : 'ADD'}
              </Text>
            </TactileButton>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  cardCompact: {
    flex: 1,
    marginBottom: 0
  },
  imageContainer: {
    height: 130,
    width: '100%',
    position: 'relative',
    backgroundColor: '#f1f5f9'
  },
  imageCompact: {
    height: 110
  },
  image: {
    width: '100%',
    height: '100%'
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.secondary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  discountText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '500'
  },
  ratingPill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textPrimary
  },
  details: {
    padding: 10
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
    lineHeight: 17,
    minHeight: 34
  },
  unit: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500'
  },
  farmerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
    marginBottom: 8
  },
  farmerText: {
    fontSize: 10,
    color: colors.primaryDark,
    fontWeight: '500',
    flex: 1
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  price: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary
  },
  addButton: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 58,
    alignItems: 'center'
  },
  addButtonText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '500'
  },
  addButtonOutline: {
    backgroundColor: '#ffffff',
    borderWidth: 1.2,
    borderColor: '#94a3b8'
  },
  addButtonTextOutline: {
    color: '#64748b',
    fontWeight: '600'
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    flexWrap: 'wrap',
    gap: 4
  },
  lowStockTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ea580c',
    backgroundColor: '#ffedd5',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4
  },
  outOfStockTag: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#dc2626',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4
  },
  soldOutOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  soldOutPill: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '800',
    backgroundColor: '#ef4444',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    letterSpacing: 0.5
  },
  outOfStockBtn: {
    backgroundColor: '#fee2e2',
    borderWidth: 1.2,
    borderColor: '#fca5a5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center'
  },
  outOfStockBtnText: {
    color: '#dc2626',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 8,
    overflow: 'hidden'
  },
  qtyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    minWidth: 24,
    paddingHorizontal: 2,
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: 16
  }
});
