import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useCart } from '../../context/CartContext';
import { apiService } from '../../services/api';
import { ProductCard, isPreparedFoodProduct } from '../../components/ProductCard';
import { SafeImage } from '../../components/common/SafeImage';
import { showAlert } from '../../utils/alert';

const { width } = Dimensions.get('window');

export const ProductDetailsScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const [product, setProduct] = useState(route.params?.product || null);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(!route.params?.product);
  const { addToCart, updateQuantity, items, billSummary, vendorId: currentCartVendorId } = useCart();

  const passedProductId = route.params?.productId || route.params?.product?._id || route.params?.product?.id;

  useEffect(() => {
    loadProductDetails();
  }, [passedProductId]);

  const loadProductDetails = async () => {
    if (!product && passedProductId) {
      try {
        setIsLoading(true);
        const res = await apiService.getProductById(passedProductId);
        if (res && res.success && res.product) {
          setProduct(res.product);
          loadSimilar(res.product);
        }
      } catch (err) {
        console.warn('Failed to fetch product details:', err);
      } finally {
        setIsLoading(false);
      }
    } else if (product) {
      loadSimilar(product);
    }
  };

  const loadSimilar = async (currentProd) => {
    try {
      const res = await apiService.getProducts();
      if (res && res.success && Array.isArray(res.products)) {
        const currentId = currentProd._id || currentProd.id;
        const currentCat = currentProd.category?._id || currentProd.category;
        const similar = res.products.filter(
          (p) => (p._id || p.id) !== currentId && (!currentCat || (p.category?._id || p.category) === currentCat)
        ).slice(0, 6);
        setSimilarProducts(similar);
      }
    } catch (e) {
      console.warn('Failed to load similar products:', e);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]} edges={['top', 'left', 'right', 'bottom']}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.textSecondary }}>Loading product details...</Text>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]} edges={['top', 'left', 'right', 'bottom']}>
        <Ionicons name="alert-circle-outline" size={54} color={colors.textMuted} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginTop: 12 }}>Product Not Found</Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: 20 }}>
          This product might be temporarily unavailable or out of catalog.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryBtnText}>Back to Marketplace</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const prodId = product._id || product.id;
  const cartItem = items?.find((item) => (item.product?._id || item.product?.id || item.productId) === prodId);
  const qtyInCart = cartItem ? cartItem.quantity : 0;

  const isOutOfStock = product.inStock === false || (product.stockQty !== undefined && product.stockQty <= 0);
  const isLowStock = !isOutOfStock && product.stockQty !== undefined && product.stockQty <= 5 && product.stockQty > 0;
  const isMaxStockReached = !isOutOfStock && product.stockQty !== undefined && qtyInCart >= product.stockQty;

  const isFood = isPreparedFoodProduct(product);
  const resizeMode = isFood ? 'cover' : 'contain';

  // MRP & Real Discount calculation
  const hasValidDiscount = Boolean(product.mrp && Number(product.mrp) > Number(product.price));
  const discountPercent = hasValidDiscount
    ? Math.round(((Number(product.mrp) - Number(product.price)) / Number(product.mrp)) * 100)
    : 0;

  // Real store / merchant
  const storeName = product.vendor?.storeName || product.vendorName || product.farmer || 'Verified S-farmart Partner';
  const packSizeText = product.unit || product.packSize || product.packQuantity || null;
  const hasRealRating = Boolean(product.rating && typeof product.rating === 'number' && product.rating > 0 && (product.numReviews > 0 || product.reviewsCount > 0 || product.ratingCount > 0));

  const prodVendorId =
    product.vendor?._id ||
    product.vendor?.id ||
    (typeof product.vendor === 'string' ? product.vendor : null) ||
    product.vendorId;
  const isDifferentVendor = Boolean(
    currentCartVendorId && prodVendorId && currentCartVendorId.toString() !== prodVendorId.toString() && items?.length > 0
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Solid Clean Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{product.name}</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Cart')} activeOpacity={0.7}>
          <Ionicons name="cart-outline" size={24} color={colors.textPrimary} />
          {billSummary.totalCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{billSummary.totalCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: items?.length > 0 ? Math.max(90, insets.bottom + 80) : Math.max(30, insets.bottom + 24) }
        ]}
      >
        {/* Product Image Area - Square, Contained for Packaged/Bottles */}
        <View style={[styles.imageWrap, isFood ? styles.imageWrapFood : styles.imageWrapGrocery]}>
          <SafeImage
            source={{ uri: product.image }}
            style={styles.image}
            resizeMode={resizeMode}
            placeholderIcon={isFood ? 'restaurant-outline' : 'leaf-outline'}
            placeholderIconSize={48}
          />
          {hasValidDiscount && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>{discountPercent}% OFF</Text>
            </View>
          )}
          {isOutOfStock && (
            <View style={styles.outOfStockOverlay}>
              <Text style={styles.outOfStockBadgeText}>SOLD OUT</Text>
            </View>
          )}
        </View>

        {/* Core Product Info */}
        <View style={styles.mainInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.productName}>{product.name}</Text>
          </View>
          {packSizeText && (
            <Text style={styles.unitText}>{packSizeText}</Text>
          )}

          {isOutOfStock ? (
            <View style={styles.stockAlertRow}>
              <Ionicons name="close-circle" size={14} color="#ef4444" />
              <Text style={styles.outOfStockText}>Currently unavailable at this partner store</Text>
            </View>
          ) : isLowStock ? (
            <View style={styles.stockAlertRow}>
              <Ionicons name="flame" size={14} color="#ea580c" />
              <Text style={styles.lowStockText}>Hurry! Only {product.stockQty} packs left in stock</Text>
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <View style={styles.priceContainer}>
              <Text style={styles.price}>₹{product.price}</Text>
              {hasValidDiscount && (
                <Text style={styles.mrpText}>₹{product.mrp}</Text>
              )}
              {hasRealRating && (
                <View style={styles.ratingBox}>
                  <Text style={styles.ratingText}>{product.rating}</Text>
                  <Ionicons name="star" size={10} color="#ffffff" style={{ marginLeft: 2 }} />
                </View>
              )}
            </View>

            {/* Quick Commerce Add Button / Stepper */}
            <View style={styles.btnWrapper}>
              {isOutOfStock ? (
                <View style={styles.soldOutBtn}>
                  <Text style={styles.soldOutBtnText}>SOLD OUT</Text>
                </View>
              ) : qtyInCart === 0 ? (
                <TouchableOpacity
                  style={[styles.addBtn, isDifferentVendor && styles.addBtnConflict]}
                  onPress={() => addToCart(product)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.addBtnText, isDifferentVendor && styles.addBtnTextConflict]}>
                    {isDifferentVendor ? 'REPLACE' : 'ADD'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.qtyControl}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(prodId, -1)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={16} color="#ffffff" />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{qtyInCart}</Text>
                  <TouchableOpacity
                    style={[styles.qtyBtn, isMaxStockReached && { opacity: 0.4 }]}
                    onPress={() => {
                      if (isMaxStockReached) {
                        showAlert('Stock Limit', `Only ${product.stockQty} unit(s) available in stock.`);
                        return;
                      }
                      updateQuantity(prodId, 1);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={16} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Store / Partner Attribution */}
        <TouchableOpacity
          style={styles.storeSection}
          onPress={() => {
            if (product.vendor && typeof product.vendor === 'object') {
              navigation.navigate('VendorStore', { vendor: product.vendor });
            }
          }}
          activeOpacity={product.vendor ? 0.7 : 1}
        >
          <View style={styles.storeIconWrap}>
            <Ionicons name="storefront-outline" size={20} color="#16a34a" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.storeLabel}>SOLD & FULFILLED BY</Text>
            <Text style={styles.storeNameText}>{storeName}</Text>
          </View>
          {product.vendor && typeof product.vendor === 'object' && (
            <View style={styles.viewStoreChip}>
              <Text style={styles.viewStoreChipText}>View Store</Text>
              <Ionicons name="chevron-forward" size={14} color="#16a34a" />
            </View>
          )}
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Delivery Timeline / Trust */}
        <View style={styles.trustSection}>
          <View style={styles.trustItem}>
            <View style={styles.trustIconWrap}>
              <MaterialCommunityIcons name="clock-fast" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.trustTitle}>Superfast Hyperlocal Delivery</Text>
              <Text style={styles.trustSub}>Direct from neighbor store to your doorstep</Text>
            </View>
          </View>
          
          <View style={styles.trustItem}>
            <View style={styles.trustIconWrap}>
              <MaterialCommunityIcons name="shield-check" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.trustTitle}>100% Genuine & Fresh</Text>
              <Text style={styles.trustSub}>Direct partner inventory with genuine quality</Text>
            </View>
          </View>
        </View>

        {/* Description Section */}
        {product.description ? (
          <>
            <View style={styles.divider} />
            <View style={styles.descSection}>
              <Text style={styles.sectionHeading}>Product Details</Text>
              <Text style={styles.descriptionText}>{product.description}</Text>
            </View>
          </>
        ) : null}

        {/* Suggestions */}
        {similarProducts.length > 0 && (
          <>
            <View style={styles.divider} />
            <View style={styles.suggestionsBox}>
              <Text style={styles.sectionHeading}>You might also like</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestionScroll}
              >
                {similarProducts.map((item) => (
                  <View key={item._id || item.id} style={styles.suggestionCardWrap}>
                    <ProductCard 
                      product={item} 
                      compact 
                      onPress={() => navigation.push('ProductDetails', { product: item })}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          </>
        )}
      </ScrollView>

      {/* Floating Checkout Bar */}
      {items?.length > 0 && (
        <View style={[styles.floatingCart, { bottom: Math.max(16, insets.bottom + 12) }]}>
          <View style={styles.floatingCartInner}>
            <View>
              <Text style={styles.fcItems}>{billSummary?.totalCount || items.length} ITEM{(billSummary?.totalCount || items.length) > 1 ? 'S' : ''}</Text>
              <Text style={styles.fcTotal}>View Cart · ₹{billSummary?.grandTotal || billSummary?.total || 0}</Text>
            </View>
            <TouchableOpacity 
              style={styles.fcBtn} 
              onPress={() => navigation.navigate('Cart')}
              activeOpacity={0.85}
            >
              <Ionicons name="cart" size={18} color="#15803d" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginHorizontal: 12,
    textAlign: 'center'
  },
  iconBtn: {
    padding: 6,
    position: 'relative'
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#ea580c',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#ffffff'
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800'
  },
  scrollContent: {
    paddingBottom: 40
  },
  imageWrap: {
    width: '100%',
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  imageWrapGrocery: {
    backgroundColor: '#f8fafc',
    padding: 16
  },
  imageWrapFood: {
    backgroundColor: '#ffffff'
  },
  image: {
    width: '88%',
    height: '88%'
  },
  discountBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: '#16a34a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  discountText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800'
  },
  outOfStockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  outOfStockBadgeText: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    letterSpacing: 0.5
  },
  mainInfo: {
    padding: 16,
    paddingTop: 16
  },
  titleRow: {
    marginBottom: 4
  },
  productName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: 26
  },
  unitText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2
  },
  stockAlertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8
  },
  outOfStockText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ef4444'
  },
  lowStockText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ea580c'
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  price: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a'
  },
  mrpText: {
    fontSize: 14,
    color: '#94a3b8',
    textDecorationLine: 'line-through'
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16a34a',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 4
  },
  ratingText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800'
  },
  btnWrapper: {
    minWidth: 104,
    height: 38
  },
  addBtn: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#16a34a',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    ...Platform.select({
      web: { outlineStyle: 'none' }
    })
  },
  addBtnText: {
    color: '#16a34a',
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  addBtnConflict: {
    borderColor: '#94a3b8',
    backgroundColor: '#f8fafc'
  },
  addBtnTextConflict: {
    color: '#64748b'
  },
  soldOutBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10
  },
  soldOutBtnText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800'
  },
  qtyControl: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#16a34a',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4
  },
  qtyBtn: {
    paddingHorizontal: 10,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { outlineStyle: 'none' }
    })
  },
  qtyText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'center'
  },
  divider: {
    height: 8,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9'
  },
  storeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12
  },
  storeIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center'
  },
  storeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.4
  },
  storeNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 2
  },
  viewStoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    gap: 2
  },
  viewStoreChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#16a34a'
  },
  trustSection: {
    padding: 16,
    gap: 14
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  trustIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  trustTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0f172a'
  },
  trustSub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1
  },
  descSection: {
    padding: 16
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8
  },
  descriptionText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20
  },
  suggestionsBox: {
    paddingVertical: 16,
    paddingLeft: 16
  },
  suggestionScroll: {
    paddingRight: 16,
    gap: 12,
    marginTop: 8
  },
  suggestionCardWrap: {
    width: 150
  },
  floatingCart: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#15803d',
    borderRadius: 14,
    shadowColor: '#15803d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8
  },
  floatingCartInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  fcItems: {
    color: '#bbf7d0',
    fontSize: 10.5,
    fontWeight: '800'
  },
  fcTotal: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800'
  },
  fcBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center'
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  }
});
