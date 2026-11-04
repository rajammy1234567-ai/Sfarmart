import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../../services/api';
import { useCart } from '../../context/CartContext';
import { colors } from '../../theme/colors';
import { SafeImage } from '../../components/common/SafeImage';

export const CategoryVendorsScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const category = route.params?.category || { name: 'Stores', slug: 'fruits-vegetables' };
  const [vendors, setVendors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorState, setErrorState] = useState(null); // null | 'NETWORK_ERROR'
  const { billSummary } = useCart();

  const isConfiguredOnly = category?.isAvailableInDb === false;

  useEffect(() => {
    fetchVendors();
  }, [category?.slug, category?.isAvailableInDb]);

  const fetchVendors = async () => {
    setErrorState(null);

    // If category is a configured browse category not yet seeded in database
    if (isConfiguredOnly || !category?.slug) {
      setIsLoading(false);
      setVendors([]);
      return;
    }

    try {
      setIsLoading(true);
      const res = await apiService.getCategoryVendors(category.slug);
      if (res.isNetworkError) {
        setErrorState('NETWORK_ERROR');
        setVendors([]);
      } else if (res.success && Array.isArray(res.vendors)) {
        setVendors(res.vendors.filter(v => v.isActive !== false));
      } else {
        // Genuinely empty category or not found in DB - honest empty state, do NOT show unrelated stores
        setVendors([]);
      }
    } catch (err) {
      console.warn('Failed to load vendors:', err);
      setErrorState('NETWORK_ERROR');
      setVendors([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBrowseAllStores = () => {
    // Clear category filter and open real store list on Home
    navigation.navigate('MainTabs', {
      screen: 'Home',
      params: { selectedCategory: 'all' }
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header with Safe Area clearance */}
      <View style={[styles.header, { paddingTop: Math.max(14, insets.top + 6) }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
            {category?.name || 'Stores'}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1} ellipsizeMode="tail">
            {isLoading
              ? 'Finding local stores...'
              : isConfiguredOnly
              ? 'Category overview'
              : `${vendors.length} ${vendors.length === 1 ? 'store' : 'stores'} available`}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Finding local stores & farmers...</Text>
        </View>
      ) : errorState === 'NETWORK_ERROR' ? (
        <View style={styles.emptyBox}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="cloud-offline-outline" size={32} color="#ef4444" />
          </View>
          <Text style={styles.emptyTitle}>Connection Error</Text>
          <Text style={styles.emptySub}>
            Unable to connect to service. Please check your internet connection and retry.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={fetchVendors}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Retry Connection"
          >
            <Ionicons name="reload-outline" size={16} color="#ffffff" />
            <Text style={styles.retryBtnText}>Retry Connection</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom:
                billSummary.totalCount > 0
                  ? Math.max(100, insets.bottom + 80)
                  : Math.max(24, insets.bottom + 16)
            }
          ]}
          showsVerticalScrollIndicator={false}
        >
          {vendors.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <Ionicons
                  name={isConfiguredOnly ? 'time-outline' : 'storefront-outline'}
                  size={32}
                  color="#94a3b8"
                />
              </View>
              <Text style={styles.emptyTitle}>
                {isConfiguredOnly ? 'Category Coming Soon' : 'No stores in this category'}
              </Text>
              <Text style={styles.emptySub}>
                {isConfiguredOnly
                  ? `We are onboarding verified partners for ${category.name}. Check back soon!`
                  : `Currently there are no partner stores listed under ${category.name}.`}
              </Text>
              <TouchableOpacity
                style={styles.browseCatalogBtn}
                onPress={handleBrowseAllStores}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Browse All Stores"
              >
                <Text style={styles.browseCatalogBtnText}>Browse All Stores</Text>
              </TouchableOpacity>
            </View>
          ) : (
            vendors.map((vendor) => {
              const isOpen = vendor.isOpen !== false;
              const hasRating = Boolean(
                vendor.rating &&
                typeof vendor.rating === 'number' &&
                vendor.rating > 0 &&
                (vendor.numReviews > 0 || vendor.ratingCount > 0 || vendor.reviewsCount > 0)
              );

              return (
                <TouchableOpacity
                  key={vendor._id}
                  style={[styles.vendorCard, !isOpen && styles.vendorCardClosed]}
                  onPress={() => navigation.navigate('VendorStore', { vendor })}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel={vendor.storeName}
                >
                  <View style={styles.bannerContainer}>
                    <SafeImage
                      source={{ uri: vendor.banner }}
                      style={styles.bannerImg}
                      placeholderIcon="storefront-outline"
                      placeholderIconSize={36}
                    />
                    {!isOpen && (
                      <View style={styles.closedOverlay}>
                        <Text style={styles.closedText}>CURRENTLY CLOSED</Text>
                        <Text style={styles.closedSub}>Opens in morning</Text>
                      </View>
                    )}
                    <View style={styles.timeBadge}>
                      <Ionicons name="time-outline" size={12} color="#ffffff" />
                      <Text style={styles.timeText}>{vendor.avgPrepTimeMins || 25} mins</Text>
                    </View>
                  </View>

                  <View style={styles.vendorInfo}>
                    <View style={styles.titleRow}>
                      <Text style={styles.storeName}>{vendor.storeName}</Text>
                      {hasRating ? (
                        <View style={styles.ratingBox}>
                          <Ionicons name="star" size={12} color="#ffffff" />
                          <Text style={styles.ratingText}>{Number(vendor.rating).toFixed(1)}</Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={styles.storeType}>
                      {vendor.storeType === 'HOME_CHEF'
                        ? '👩‍🍳 Home Cooked Fresh Food & Mithai'
                        : vendor.storeType === 'FARMER'
                        ? '🌾 Direct Farm Harvest'
                        : '🏪 Local Mart'}
                    </Text>

                    {vendor.description ? (
                      <Text style={styles.descText} numberOfLines={2}>
                        {vendor.description}
                      </Text>
                    ) : null}

                    <View style={styles.metaRow}>
                      {vendor.address?.city ? (
                        <Text style={styles.metaItem}>📍 {vendor.address.city}</Text>
                      ) : null}
                      {typeof vendor.deliveryRadiusKm === 'number' && vendor.deliveryRadiusKm > 0 ? (
                        <>
                          <Text style={styles.dotSeparator}>•</Text>
                          <Text style={styles.metaItem}>{vendor.deliveryRadiusKm} km radius</Text>
                        </>
                      ) : null}
                      {typeof vendor.minOrderValue === 'number' && vendor.minOrderValue > 0 ? (
                        <>
                          <Text style={styles.dotSeparator}>•</Text>
                          <Text style={styles.metaItem}>Min ₹{vendor.minOrderValue}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Sticky Bottom Cart Bar */}
      {billSummary.totalCount > 0 && (
        <View style={[styles.stickyCartBar, { bottom: Math.max(16, insets.bottom + 12) }]}>
          <View>
            <Text style={styles.cartCountText}>{billSummary.totalCount} ITEM(S)</Text>
            <Text style={styles.cartTotalText}>₹{billSummary.grandTotal ?? billSummary.total ?? 0}</Text>
          </View>
          <TouchableOpacity
            style={styles.viewCartBtn}
            onPress={() => navigation.navigate('Cart')}
            activeOpacity={0.85}
          >
            <Text style={styles.viewCartText}>View Cart</Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 2 }
    })
  },
  backBtn: {
    padding: 6,
    marginRight: 8
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center'
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a'
  },
  headerSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b'
  },
  scrollContent: {
    padding: 16,
    gap: 16
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a'
  },
  emptySub: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 260
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#15803d',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 16
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  browseCatalogBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  browseCatalogBtnText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700'
  },
  vendorCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: 'rgba(15, 23, 42, 0.06)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 3
  },
  vendorCardClosed: {
    opacity: 0.75
  },
  bannerContainer: {
    height: 140,
    position: 'relative'
  },
  bannerImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover'
  },
  closedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  closedText: {
    color: '#f87171',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 1
  },
  closedSub: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 4
  },
  timeBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  timeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },
  vendorInfo: {
    padding: 16
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  storeName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15803d',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4
  },
  ratingText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12
  },
  storeType: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#16a34a',
    marginBottom: 6
  },
  descText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 10
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  metaItem: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500'
  },
  dotSeparator: {
    fontSize: 12,
    color: '#cbd5e1'
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
    gap: 6
  },
  viewCartText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15
  }
});
