import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StatusBar,
  Platform,
  Alert,
  AppState
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { startPolling } from '../../services/requestPolicy';
import { apiService } from '../../services/api';
import { useCart } from '../../context/CartContext';
import { useCustomerSocket } from '../../context/SocketContext';
import { ClearCartModal } from '../../components/ClearCartModal';
import { colors } from '../../theme/colors';
import { showAlert } from '../../utils/alert';
import { SafeImage, isValidImageUri } from '../../components/common/SafeImage';

export const VendorStoreScreen = ({ route, navigation }) => {
  const initialVendor = route.params?.vendor || {};
  const targetVendorId = route.params?.vendor?._id || route.params?.vendorId || route.params?.vendor?.id || initialVendor._id;
  const [vendor, setVendor] = useState(initialVendor);
  const [products, setProducts] = useState([]);
  const [selectedSubCat, setSelectedSubCat] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [productError, setProductError] = useState('');

  const {
    items,
    addToCart,
    updateQuantity,
    billSummary,
    vendorId: currentCartVendorId,
    vendorName: currentCartVendorName,
    conflictModal,
    confirmReplaceCart,
    cancelReplaceCart,
    clearEntireCart
  } = useCart();

  const { productStockUpdate, watchCatalog, reconnectCount } = useCustomerSocket();

  useEffect(() => {
    let release = () => {};
    const subscribe = () => { release(); release = watchCatalog(targetVendorId || vendor?._id); };
    if (navigation.isFocused?.() !== false) subscribe();
    const onFocus = navigation.addListener('focus', subscribe);
    const onBlur = navigation.addListener('blur', () => release());
    return () => { release(); onFocus(); onBlur(); };
  }, [targetVendorId || vendor?._id, navigation, watchCatalog]);

  const isStoreOpen = vendor?.isOpen !== false;

  // Real-time stock update listener via WebSocket
  useEffect(() => {
    if (productStockUpdate && productStockUpdate.productId) {
      console.log('⚡ Real-time stock reflection in store:', productStockUpdate);
      setProducts((prev) =>
        prev.map((p) => {
          if ((p._id || p.id) === productStockUpdate.productId) {
            return {
              ...p,
              stockQty: productStockUpdate.stockQty,
              inStock: productStockUpdate.inStock
            };
          }
          return p;
        })
      );
    }
  }, [productStockUpdate]);

  useEffect(() => {
    const vId = targetVendorId || vendor?._id;
    if (vId) {
      fetchProducts(vId);
      fetchVendorDetails(vId);

      // Periodic polling to stay updated with live Partner Online/Offline status
      return startPolling(() => fetchVendorDetails(vId), {
        intervalMs: 20000,
        active: () => navigation.isFocused?.() !== false && (AppState.currentState == null || AppState.currentState === 'active')
      });
    }
  }, [targetVendorId, vendor?._id]);

  useEffect(() => {
    if (reconnectCount > 1 && targetVendorId && navigation.isFocused?.() !== false) {
      fetchProducts(targetVendorId);
      fetchVendorDetails(targetVendorId);
    }
  }, [reconnectCount, targetVendorId]);

  const fetchVendorDetails = async (vId) => {
    try {
      const res = await apiService.getVendorById(vId);
      if (res.success && res.vendor) {
        setVendor(res.vendor);
      }
    } catch (e) {
      // quiet fallback
    }
  };

  const fetchProducts = async (vId) => {
    try {
      setIsLoading(true);
      setProductError('');
      const res = await apiService.getVendorProducts(vId);
      if (res.success && Array.isArray(res.products)) {
        setProducts(res.products);
      } else {
        setProductError(res?.message || 'Products could not be loaded. Please retry.');
      }
    } catch (e) {
      console.warn('Failed to load store products:', e);
      setProductError(e?.message || 'Products could not be loaded. Please retry.');
    } finally {
      setIsLoading(false);
    }
  };

  // Extract unique subCategories or categories
  const subCategories = ['ALL', ...new Set(products.map((p) => p.subCategory || p.category?.name).filter(Boolean))];

  const filteredProducts = selectedSubCat === 'ALL'
    ? products
    : products.filter((p) => (p.subCategory || p.category?.name) === selectedSubCat);

  const getItemQuantity = (productId) => {
    const item = items.find(
      (it) => (it.product?._id || it.product?.id) === productId
    );
    return item ? item.quantity : 0;
  };

  const handleClosedStoreTap = () => {
    const msg = `${vendor?.storeName || 'This store'} is currently closed and not accepting new orders right now. You can browse the menu; ordering will reopen as soon as the partner comes online.`;
    showAlert('Store Currently Closed', msg);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Store Banner Hero Header */}
      <View style={styles.heroBanner}>
        <SafeImage
          source={{
            uri:
              isValidImageUri(vendor?.banner)
                ? vendor.banner
                : 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&auto=format&fit=crop&q=80'
          }}
          style={styles.heroImg}
          placeholderIcon="storefront-outline"
          placeholderIconSize={48}
        />
        <View style={styles.heroOverlay} />

        <TouchableOpacity
          style={styles.backButtonCircle}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>

        <View style={styles.heroTextContainer}>
          <Text style={styles.heroStoreName}>{vendor?.storeName}</Text>
          <Text style={styles.heroStoreType}>
            {vendor?.storeType === 'HOME_CHEF'
              ? '👩‍🍳 Fresh Home Food & Mithai'
              : '🌾 Direct Farm Harvest'}
          </Text>
          <View style={styles.heroBadgesRow}>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={12} color="#ffffff" />
              <Text style={styles.ratingBadgeText}>{vendor?.rating || 4.8}</Text>
            </View>
            <Text style={styles.heroBadgeText}>⚡ {vendor?.avgPrepTimeMins || 25} mins prep</Text>
            <Text style={styles.heroBadgeText}>• Min ₹{vendor?.minOrderValue || 99}</Text>

            {/* Store Open/Closed Badge */}
            <View
              style={[
                styles.storeStatusBadge,
                { backgroundColor: isStoreOpen ? '#16a34a' : '#ef4444' }
              ]}
            >
              <Text style={styles.storeStatusBadgeText}>
                {isStoreOpen ? '● ONLINE' : '● CLOSED'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Closed Warning Banner */}
      {!isStoreOpen && (
        <View style={styles.closedBanner}>
          <Ionicons name="alert-circle" size={20} color="#b91c1c" />
          <View style={{ flex: 1 }}>
            <Text style={styles.closedBannerTitle}>STORE CURRENTLY CLOSED</Text>
            <Text style={styles.closedBannerText}>
              Browsing is enabled, but ordering is paused. You can view all items and prices below.
            </Text>
          </View>
        </View>
      )}

      {/* Subcategory Filter Tabs */}
      {subCategories.length > 1 && (
        <View style={styles.tabContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
            {subCategories.map((cat) => {
              const isSelected = selectedSubCat === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.tabChip, isSelected && styles.tabChipSelected]}
                  onPress={() => setSelectedSubCat(cat)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, isSelected && styles.tabTextSelected]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Products List */}
      {/* Deep-link / Direct-to-store warning banner */}
      {currentCartVendorId && vendor?._id && currentCartVendorId.toString() !== vendor._id.toString() && items.length > 0 && (
        <View style={styles.storeMismatchBanner}>
          <Ionicons name="information-circle" size={20} color="#b45309" />
          <View style={{ flex: 1 }}>
            <Text style={styles.storeMismatchTitle}>
              Aap abhi {currentCartVendorName || 'dusre store'} se shopping kar rahe hain
            </Text>
            <Text style={styles.storeMismatchSub}>
              Is store se add karne par purana cart replace ho jayega.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.switchStoreBtn}
            onPress={clearEntireCart}
            activeOpacity={0.8}
          >
            <Text style={styles.switchStoreBtnText}>Switch</Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading menu & produce...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            billSummary.totalCount > 0 && { paddingBottom: 100 }
          ]}
          showsVerticalScrollIndicator={false}
        >
          {productError ? (
            <TouchableOpacity onPress={() => fetchProducts(targetVendorId || vendor?._id)}>
              <Text style={{ color: '#b91c1c', padding: 16 }}>{productError} Tap to retry.</Text>
            </TouchableOpacity>
          ) : null}
          {filteredProducts.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="fast-food-outline" size={44} color="#94a3b8" />
              <Text style={styles.emptyTitle}>{productError ? 'Products temporarily unavailable' : 'No Items in this Section'}</Text>
            </View>
          ) : (
            filteredProducts.map((product) => {
              const qty = getItemQuantity(product._id);
              const isOutOfStock = product.inStock === false || (product.stockQty !== undefined && product.stockQty <= 0);
              const isLowStock = !isOutOfStock && product.stockQty !== undefined && product.stockQty <= 5 && product.stockQty > 0;
              const isMaxStockReached = !isOutOfStock && product.stockQty !== undefined && qty >= product.stockQty;

              return (
                <View key={product._id} style={[styles.productCard, isOutOfStock && { opacity: 0.82 }]}>
                  <View style={styles.productMeta}>
                    {/* Veg Indicator */}
                    <View style={styles.vegBox}>
                      <View style={styles.vegDot} />
                    </View>

                    <Text style={styles.productName}>{product.name}</Text>

                    <View style={styles.priceRow}>
                      <Text style={styles.price}>₹{product.price}</Text>
                      {product.mrp > product.price && (
                        <Text style={styles.mrp}>₹{product.mrp}</Text>
                      )}
                      <Text style={styles.unitText}>/ {product.unit}</Text>
                    </View>

                    {isOutOfStock ? (
                      <View style={styles.soldOutMetaBadge}>
                        <Ionicons name="close-circle" size={11} color="#ef4444" />
                        <Text style={styles.soldOutMetaText}>Out of stock</Text>
                      </View>
                    ) : isLowStock ? (
                      <View style={styles.lowStockRow}>
                        <Ionicons name="flame" size={12} color="#ea580c" />
                        <Text style={styles.lowStockText}>Only {product.stockQty} left in stock!</Text>
                      </View>
                    ) : null}

                    {product.description ? (
                      <Text style={styles.descText} numberOfLines={2}>
                        {product.description}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.productRight}>
                    <View style={styles.prodImgContainer}>
                      <SafeImage
                        source={{ uri: product.image }}
                        style={styles.prodImg}
                        placeholderIcon="restaurant-outline"
                        placeholderIconSize={28}
                      />
                      {isOutOfStock && (
                        <View style={styles.soldOutImageOverlay}>
                          <Text style={styles.soldOutImageBadgeText}>SOLD OUT</Text>
                        </View>
                      )}
                    </View>

                    {/* Stepper / Add Button / Store Closed Pill */}
                    <View style={styles.actionWrap}>
                      {!isStoreOpen ? (
                        <TouchableOpacity
                          style={styles.storeClosedBtn}
                          onPress={handleClosedStoreTap}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="lock-closed" size={10} color="#94a3b8" style={{ marginRight: 3 }} />
                          <Text style={styles.storeClosedBtnText}>CLOSED</Text>
                        </TouchableOpacity>
                      ) : isOutOfStock ? (
                        <View style={styles.outOfStockBtn}>
                          <Text style={styles.outOfStockText}>SOLD OUT</Text>
                        </View>
                      ) : qty > 0 ? (
                        <View style={styles.stepperBox}>
                          <TouchableOpacity
                            style={styles.stepperBtn}
                            onPress={() => updateQuantity(product._id, -1)}
                          >
                            <Text style={styles.stepperBtnText}>−</Text>
                          </TouchableOpacity>
                          <Text style={styles.stepperQty}>{qty}</Text>
                          <TouchableOpacity
                            style={[styles.stepperBtn, isMaxStockReached && { opacity: 0.35 }]}
                            onPress={() => {
                              if (isMaxStockReached) {
                                showAlert('Stock Limit', `Only ${product.stockQty} unit(s) available in stock.`);
                                return;
                              }
                              updateQuantity(product._id, 1);
                            }}
                          >
                            <Text style={styles.stepperBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.addBtn}
                          onPress={() => addToCart({ ...product, vendor })}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.addBtnText}>ADD</Text>
                          <Text style={styles.addBtnPlus}>+</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Sticky Bottom Cart Bar */}
      {billSummary.totalCount > 0 && (
        <View style={styles.stickyCartBar}>
          <View>
            <Text style={styles.cartCountText}>{billSummary.totalCount} ITEM(S)</Text>
            <Text style={styles.cartTotalText}>₹{billSummary.grandTotal ?? billSummary.total ?? 0}</Text>
          </View>
          {isStoreOpen ? (
            <TouchableOpacity
              style={styles.viewCartBtn}
              onPress={() => navigation.navigate('Cart')}
              activeOpacity={0.85}
            >
              <Text style={styles.viewCartText}>View Cart</Text>
              <Ionicons name="arrow-forward" size={18} color="#ffffff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.viewCartBtn, { backgroundColor: '#64748b' }]}
              onPress={handleClosedStoreTap}
              activeOpacity={0.85}
            >
              <Text style={styles.viewCartText}>Store Closed</Text>
              <Ionicons name="lock-closed" size={16} color="#ffffff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Global Single-Vendor Conflict Modal */}
      <ClearCartModal
        visible={conflictModal?.visible}
        currentVendorName={conflictModal?.currentVendorName}
        newVendorName={conflictModal?.newVendorName}
        itemCount={conflictModal?.itemCount || 1}
        onCancel={cancelReplaceCart}
        onConfirm={confirmReplaceCart}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  storeMismatchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fef3c7',
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  storeMismatchTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e'
  },
  storeMismatchSub: {
    fontSize: 11,
    color: '#b45309',
    marginTop: 2
  },
  switchStoreBtn: {
    backgroundColor: '#d97706',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  switchStoreBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },
  heroBanner: {
    height: 180,
    position: 'relative',
    justifyContent: 'flex-end',
    padding: 16
  },
  heroImg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    resizeMode: 'cover'
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.65)'
  },
  backButtonCircle: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 16 : 44,
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10
  },
  heroTextContainer: {
    zIndex: 5
  },
  heroStoreName: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800'
  },
  heroStoreType: {
    color: '#86efac',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2
  },
  heroBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16a34a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3
  },
  ratingBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800'
  },
  heroBadgeText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '500'
  },
  storeStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  storeStatusBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#fca5a5'
  },
  closedBannerTitle: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  closedBannerText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
    lineHeight: 16
  },
  tabContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  tabsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9'
  },
  tabChipSelected: {
    backgroundColor: colors.primary
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569'
  },
  tabTextSelected: {
    color: '#ffffff',
    fontWeight: '700'
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#64748b'
  },
  scrollContent: {
    padding: 16,
    gap: 14
  },
  emptyBox: {
    alignItems: 'center',
    padding: 40
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 10
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: 'rgba(15, 23, 42, 0.04)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2
  },
  productMeta: {
    flex: 1,
    paddingRight: 12
  },
  vegBox: {
    width: 15,
    height: 15,
    borderWidth: 1.5,
    borderColor: '#16a34a',
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6
  },
  vegDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#16a34a'
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
    marginBottom: 6
  },
  price: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  mrp: {
    fontSize: 13,
    color: '#94a3b8',
    textDecorationLine: 'line-through'
  },
  unitText: {
    fontSize: 12,
    color: '#64748b'
  },
  descText: {
    fontSize: 12.5,
    color: '#64748b',
    lineHeight: 17
  },
  productRight: {
    alignItems: 'center',
    width: 110
  },
  prodImg: {
    width: 100,
    height: 90,
    borderRadius: 14,
    resizeMode: 'cover'
  },
  prodImgPlaceholder: {
    width: 100,
    height: 90,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center'
  },
  actionWrap: {
    marginTop: -16
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#16a34a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#16a34a'
  },
  addBtnPlus: {
    fontSize: 13,
    fontWeight: '800',
    color: '#16a34a',
    marginLeft: 4
  },
  storeClosedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  storeClosedBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.3
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 5,
    gap: 10,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  stepperBtn: {
    paddingHorizontal: 6
  },
  stepperBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800'
  },
  stepperQty: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  soldOutMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 6
  },
  soldOutMetaText: {
    color: '#b91c1c',
    fontSize: 10.5,
    fontWeight: '700'
  },
  lowStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffedd5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 6
  },
  lowStockText: {
    color: '#c2410c',
    fontSize: 10.5,
    fontWeight: '700'
  },
  prodImgContainer: {
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden'
  },
  soldOutImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  soldOutImageBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    letterSpacing: 0.5
  },
  outOfStockBtn: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.2,
    borderColor: '#fca5a5',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1
  },
  outOfStockText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#dc2626',
    letterSpacing: 0.3
  },
  stickyCartBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#15803d',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#15803d',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8
  },
  cartCountText: {
    color: '#bbf7d0',
    fontSize: 11,
    fontWeight: '700'
  },
  cartTotalText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800'
  },
  viewCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10
  },
  viewCartText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14
  }
});
