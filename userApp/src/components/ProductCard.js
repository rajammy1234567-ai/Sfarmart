import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useCart } from '../context/CartContext';
import { showAlert } from '../utils/alert';
import { SafeImage } from './common/SafeImage';

export const isPreparedFoodProduct = (product) => {
  if (!product) return false;
  const storeType = product.vendor?.storeType || product.storeType;
  if (storeType === 'HOME_CHEF') return true;
  const catType = product.category?.type;
  if (catType === 'FOOD') return true;
  const catSlug = (product.category?.slug || product.category?.name || '').toLowerCase();
  if (
    catSlug.includes('thali') ||
    catSlug.includes('home-thali') ||
    catSlug.includes('sweet') ||
    catSlug.includes('bakery') ||
    catSlug.includes('curry') ||
    catSlug.includes('cooked')
  ) {
    return true;
  }
  const name = (product.name || '').toLowerCase();
  if (
    name.includes('thali') ||
    name.includes('paratha') ||
    name.includes('paneer butter') ||
    name.includes('dal makhani') ||
    name.includes('ladoo') ||
    name.includes('jamun') ||
    name.includes('chaas') ||
    name.includes('sabzi') ||
    name.includes('roti')
  ) {
    return true;
  }
  return false;
};

export const ProductCard = ({ product, onPress, compact = false }) => {
  const { addToCart, updateQuantity, items, vendorId: currentCartVendorId } = useCart();
  if (!product) return null;

  const prodId = product._id || product.id;
  const cartItem = items?.find((item) => (item.product?._id || item.product?.id || item.productId) === prodId);
  const qty = cartItem ? cartItem.quantity : 0;

  const prodVendorId =
    product.vendor?._id ||
    product.vendor?.id ||
    (typeof product.vendor === 'string' ? product.vendor : null) ||
    product.vendorId;
  const isDifferentVendor = Boolean(
    currentCartVendorId && prodVendorId && currentCartVendorId.toString() !== prodVendorId.toString() && items?.length > 0
  );

  const isOutOfStock = product.inStock === false || (product.stockQty !== undefined && product.stockQty <= 0);
  const isLowStock = !isOutOfStock && product.stockQty !== undefined && product.stockQty <= 5 && product.stockQty > 0;
  const isMaxStockReached = !isOutOfStock && product.stockQty !== undefined && qty >= product.stockQty;

  const isFood = isPreparedFoodProduct(product);
  const resizeMode = isFood ? 'cover' : 'contain';

  // Valid MRP calculation
  const hasValidDiscount = Boolean(product.mrp && Number(product.mrp) > Number(product.price));
  const discountPercent = hasValidDiscount
    ? Math.round(((Number(product.mrp) - Number(product.price)) / Number(product.mrp)) * 100)
    : 0;

  // Real store / merchant name
  const storeName = product.vendor?.storeName || product.vendorName || null;

  // Saved pack size / unit
  const packSizeText = product.unit || product.packSize || product.packQuantity || null;

  // Genuine review rating (only if numeric, > 0, and backed by genuine reviews)
  const hasRealRating = Boolean(
    product.rating &&
    typeof product.rating === 'number' &&
    product.rating > 0 &&
    (product.numReviews > 0 || product.reviewsCount > 0 || product.ratingCount > 0)
  );

  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.cardCompact, isOutOfStock && styles.cardOutOfStock]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ₹${product.price}`}
    >
      {/* Product Image Area */}
      <View style={[styles.imageContainer, isFood ? styles.imageContainerFood : styles.imageContainerGrocery]}>
        <SafeImage
          source={{ uri: product.image }}
          style={styles.image}
          resizeMode={resizeMode}
          placeholderIcon={isFood ? 'restaurant-outline' : 'leaf-outline'}
          placeholderIconSize={32}
        />

        {/* Valid Calculated Discount Badge */}
        {hasValidDiscount && !isOutOfStock && discountPercent > 0 ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{discountPercent}% OFF</Text>
          </View>
        ) : null}

        {/* Optional Real Rating */}
        {hasRealRating ? (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color="#ffffff" />
            <Text style={styles.ratingText}>{Number(product.rating).toFixed(1)}</Text>
          </View>
        ) : null}

        {/* Out of Stock Overlay */}
        {isOutOfStock && (
          <View style={styles.soldOutOverlay}>
            <Text style={styles.soldOutPill}>OUT OF STOCK</Text>
          </View>
        )}
      </View>

      {/* Product Details Area */}
      <View style={styles.details}>
        {/* Product Title */}
        <Text style={styles.title} numberOfLines={2}>
          {product.name}
        </Text>

        {/* Pack Size / Unit & Stock alerts */}
        <View style={styles.metaRow}>
          {packSizeText ? (
            <Text style={styles.unitText} numberOfLines={1}>
              {packSizeText}
            </Text>
          ) : (
            <View style={{ height: 16 }} />
          )}

          {isLowStock && (
            <Text style={styles.lowStockTag}>🔥 {product.stockQty} left</Text>
          )}
        </View>

        {/* Real Merchant / Shop Name */}
        {storeName ? (
          <View style={styles.storeRow}>
            <Ionicons
              name={isFood ? 'restaurant-outline' : 'storefront-outline'}
              size={11}
              color={colors.textSecondary}
            />
            <Text style={styles.storeText} numberOfLines={1}>
              {storeName}
            </Text>
          </View>
        ) : (
          <View style={{ height: 16 }} />
        )}

        {/* Price & Action Row */}
        <View style={styles.footerRow}>
          <View style={styles.priceColumn}>
            <Text style={styles.price}>₹{product.price}</Text>
            {hasValidDiscount ? (
              <Text style={styles.mrp}>₹{product.mrp}</Text>
            ) : null}
          </View>

          {isOutOfStock ? (
            <View style={styles.outOfStockBtn}>
              <Text style={styles.outOfStockBtnText}>UNAVAILABLE</Text>
            </View>
          ) : qty > 0 ? (
            <View style={styles.qtyControl}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQuantity(product._id || product.id, -1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
                accessibilityLabel="Decrease quantity"
              >
                <Ionicons name="remove" size={15} color="#ffffff" />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{qty}</Text>
              <TouchableOpacity
                style={[styles.qtyBtn, isMaxStockReached && { opacity: 0.35 }]}
                onPress={() => {
                  if (isMaxStockReached) {
                    showAlert('Stock Limit', `Only ${product.stockQty} pack(s) available in stock.`);
                    return;
                  }
                  addToCart(product);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
                accessibilityLabel="Increase quantity"
              >
                <Ionicons name="add" size={15} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.addButton, isDifferentVendor && styles.addButtonConflict]}
              onPress={() => addToCart(product)}
              activeOpacity={0.8}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`Add ${product.name} to cart`}
            >
              <Text style={[styles.addButtonText, isDifferentVendor && styles.addButtonTextConflict]}>
                {isDifferentVendor ? '+ ADD' : 'ADD'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    flex: 1
  },
  cardCompact: {
    marginBottom: 0
  },
  cardOutOfStock: {
    opacity: 0.82
  },
  imageContainer: {
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  imageContainerGrocery: {
    height: 128,
    backgroundColor: '#f8fafc',
    padding: 8
  },
  imageContainerFood: {
    height: 120,
    backgroundColor: '#f1f5f9'
  },
  image: {
    width: '100%',
    height: '100%'
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#ea580c',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 5,
    zIndex: 2
  },
  discountText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  ratingBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#16a34a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 2
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff'
  },
  soldOutOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5
  },
  soldOutPill: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: '#dc2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    letterSpacing: 0.5
  },
  details: {
    padding: 10,
    flex: 1,
    justifyContent: 'space-between'
  },
  title: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0f172a',
    lineHeight: 18,
    minHeight: 36
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 4
  },
  unitText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500'
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
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
    marginBottom: 8
  },
  storeText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
    flex: 1
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2
  },
  priceColumn: {
    flexDirection: 'column',
    justifyContent: 'center'
  },
  price: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0f172a'
  },
  mrp: {
    fontSize: 11,
    color: '#94a3b8',
    textDecorationLine: 'line-through',
    marginTop: -1
  },
  addButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 62,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { outlineStyle: 'none' }
    })
  },
  addButtonText: {
    color: '#16a34a',
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.2
  },
  addButtonConflict: {
    borderColor: '#94a3b8',
    backgroundColor: '#f8fafc'
  },
  addButtonTextConflict: {
    color: '#64748b'
  },
  outOfStockBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 6
  },
  outOfStockBtnText: {
    color: '#94a3b8',
    fontSize: 9.5,
    fontWeight: '700'
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16a34a',
    borderRadius: 8,
    overflow: 'hidden',
    height: 34
  },
  qtyBtn: {
    paddingHorizontal: 8,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
    ...Platform.select({
      web: { outlineStyle: 'none' }
    })
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    minWidth: 22,
    textAlign: 'center',
    paddingHorizontal: 2
  }
});

export default ProductCard;
