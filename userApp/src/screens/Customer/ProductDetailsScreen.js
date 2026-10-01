import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useCart } from '../../context/CartContext';
import { apiService } from '../../services/api';
import { ProductCard } from '../../components/ProductCard';
import { SafeImage } from '../../components/common/SafeImage';

const { width } = Dimensions.get('window');

export const ProductDetailsScreen = ({ route, navigation }) => {
  const [product, setProduct] = useState(route.params?.product || null);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(!route.params?.product);
  const { addToCart, updateQuantity, items, billSummary } = useCart();

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
  const cartItem = items?.find(item => (item.product?._id || item.product?.id) === prodId);
  const qtyInCart = cartItem ? cartItem.quantity : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Premium Solid Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Cart')}>
          <Ionicons name="cart-outline" size={26} color={colors.textPrimary} />
          {billSummary.totalCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{billSummary.totalCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Product Image - Square and Contained */}
        <View style={styles.imageWrap}>
          <SafeImage source={{ uri: product.image }} style={styles.image} resizeMode="contain" placeholderIcon="leaf-outline" placeholderIconSize={48} />
          {product.discount && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>{product.discount} OFF</Text>
            </View>
          )}
        </View>

        {/* Core Product Info */}
        <View style={styles.mainInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.productName}>{product.name}</Text>
          </View>
          <Text style={styles.unitText}>{product.unit}</Text>

          <View style={styles.actionRow}>
            <View style={styles.priceContainer}>
              <Text style={styles.price}>₹{product.price}</Text>
              <View style={styles.ratingBox}>
                <Text style={styles.ratingText}>{product.rating}</Text>
                <Ionicons name="star" size={10} color="#ffffff" style={{marginLeft: 2}} />
              </View>
            </View>

            {/* Quick Commerce Add Button */}
            <View style={styles.btnWrapper}>
              {qtyInCart === 0 ? (
                <TouchableOpacity 
                  style={styles.addBtn} 
                  onPress={() => addToCart(product)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addBtnText}>ADD</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.qtyControl}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(product.id, -1)}
                  >
                    <Ionicons name="remove" size={18} color="#ffffff" />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{qtyInCart}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(product.id, 1)}
                  >
                    <Ionicons name="add" size={18} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Delivery Timeline / Trust */}
        <View style={styles.trustSection}>
          <View style={styles.trustItem}>
            <View style={styles.trustIconWrap}>
              <MaterialCommunityIcons name="clock-fast" size={24} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.trustTitle}>Superfast Delivery</Text>
              <Text style={styles.trustSub}>Get it right at your door</Text>
            </View>
          </View>
          
          <View style={styles.trustItem}>
            <View style={styles.trustIconWrap}>
              <MaterialCommunityIcons name="leaf" size={24} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.trustTitle}>100% Genuine</Text>
              <Text style={styles.trustSub}>Sourced directly from partners</Text>
            </View>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Description Section */}
        <View style={styles.descSection}>
          <Text style={styles.sectionHeading}>Product Details</Text>
          <Text style={styles.descriptionText}>{product.description}</Text>
          
          <Text style={[styles.sectionHeading, {marginTop: 20}]}>Sourced By</Text>
          <Text style={styles.farmerText}>{product.farmer}</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Suggestions */}
        {similarProducts.length > 0 && (
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
        )}

      </ScrollView>

      {/* Floating Checkout Bar (Appears only if cart has items) */}
      {(items?.length > 0) && (
        <View style={styles.floatingCart}>
          <View style={styles.floatingCartInner}>
            <View>
              <Text style={styles.fcItems}>{billSummary?.totalCount || items.length} ITEM{(billSummary?.totalCount || items.length) > 1 ? 'S' : ''}</Text>
              <Text style={styles.fcTotal}>View Cart · ₹{billSummary?.total || 0}</Text>
            </View>
            <TouchableOpacity 
              style={styles.fcBtn} 
              onPress={() => navigation.navigate('Cart')}
            >
              <Ionicons name="cart" size={20} color={colors.primary} />
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
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  iconBtn: {
    padding: 8
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: colors.secondary,
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff'
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '500'
  },
  scrollContent: {
    paddingBottom: 100
  },
  imageWrap: {
    width: width,
    height: width, // 1:1 Aspect Ratio
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  image: {
    width: '80%',
    height: '80%'
  },
  discountBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  discountText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '500'
  },
  mainInfo: {
    padding: 16,
    paddingTop: 20
  },
  titleRow: {
    marginBottom: 4
  },
  productName: {
    fontSize: 22,
    fontWeight: '500',
    color: '#0f172a',
    lineHeight: 28
  },
  unitText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500'
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  price: {
    fontSize: 24,
    fontWeight: '500',
    color: '#0f172a'
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6
  },
  ratingText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500'
  },
  btnWrapper: {
    minWidth: 100,
    height: 38
  },
  addBtn: {
    flex: 1,
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  addBtnText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '500'
  },
  qtyControl: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  qtyBtn: {
    paddingHorizontal: 12,
    height: '100%',
    justifyContent: 'center'
  },
  qtyText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 24,
    paddingHorizontal: 2,
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: 18
  },
  divider: {
    height: 8,
    backgroundColor: '#f1f5f9'
  },
  trustSection: {
    padding: 16,
    gap: 16
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  trustIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center'
  },
  trustTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155'
  },
  trustSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  descSection: {
    padding: 16,
    paddingVertical: 20
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '500',
    color: '#0f172a',
    marginBottom: 10
  },
  descriptionText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22
  },
  farmerText: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500'
  },
  suggestionsBox: {
    paddingVertical: 20
  },
  suggestionScroll: {
    paddingHorizontal: 16,
    gap: 12
  },
  suggestionCardWrap: {
    width: width * 0.42 // Slimmer cards for quick-commerce look
  },
  floatingCart: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    left: 16,
    right: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8
  },
  floatingCartInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  fcItems: {
    color: '#dcfce7',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2
  },
  fcTotal: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500'
  },
  fcBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontWeight: '600'
  }
});
