import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { ShoppingFromBanner } from '../../components/ShoppingFromBanner';
import { apiService } from '../../services/api';
import { useCart } from '../../context/CartContext';
import { ClearCartModal } from '../../components/ClearCartModal';
import { colors } from '../../theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandBackground } from '../../components/common/BrandBackground';
import { SafeImage, isValidImageUri } from '../../components/common/SafeImage';
import { resolveBrowseCategories } from '../../config/categories';
import { getScrollBottomPadding, getStickyCartBottom } from '../../theme/layout';

export const HomeScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState(() => resolveBrowseCategories([]));
  const [vendors, setVendors] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiError, setApiError] = useState(null);

  const {
    billSummary,
    conflictModal,
    confirmReplaceCart,
    cancelReplaceCart
  } = useCart();

  const loadHomeData = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [catResult, vendResult] = await Promise.allSettled([
        apiService.getHomeCategories(),
        apiService.getVendors()
      ]);

      const catRes = catResult.status === 'fulfilled' ? catResult.value : null;
      const vendRes = vendResult.status === 'fulfilled' ? vendResult.value : null;

      let catFetchSucceeded = false;
      let vendFetchSucceeded = false;

      if (catRes && catRes.success && Array.isArray(catRes.categories)) {
        catFetchSucceeded = true;
        setCategories(resolveBrowseCategories(catRes.categories));
      }

      if (vendRes && vendRes.success && Array.isArray(vendRes.vendors)) {
        vendFetchSucceeded = true;
        setVendors(vendRes.vendors);
      }

      if (!catFetchSucceeded || !vendFetchSucceeded) {
        setApiError('Unable to sync latest live data. Tap to retry.');
      } else {
        setApiError(null);
      }
    } catch (err) {
      console.warn('HomeScreen loadHomeData error:', err);
      setApiError('Unable to load stores and produce. Tap to retry.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHomeData(false);
  }, [loadHomeData]);

  const isSearching = searchQuery.trim().length > 0;

  const filteredVendors = vendors.filter((v) => {
    if (!isSearching) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      v.storeName?.toLowerCase().includes(q) ||
      v.ownerName?.toLowerCase().includes(q) ||
      v.description?.toLowerCase().includes(q) ||
      v.storeType?.toLowerCase().includes(q) ||
      v.address?.city?.toLowerCase().includes(q)
    );
  });

  const filteredCategories = categories.filter((c) => {
    if (!isSearching) return true;
    const q = searchQuery.toLowerCase().trim();
    return c.name?.toLowerCase().includes(q) || c.slug?.toLowerCase().includes(q);
  });

  // Segregate by merchant type
  const kiranaStores = filteredVendors.filter((v) => v.storeType === 'KIRANA' || v.storeType === 'STORE');
  const homeChefs = filteredVendors.filter((v) => v.storeType === 'HOME_CHEF');
  const farmers = filteredVendors.filter((v) => v.storeType === 'FARMER');
  const popularStores = kiranaStores.length > 0 ? kiranaStores : filteredVendors.filter((v) => v.storeType !== 'HOME_CHEF');

  const hasActiveCart = Boolean(billSummary && billSummary.totalCount > 0);
  const scrollPaddingBottom = getScrollBottomPadding(insets, hasActiveCart);
  const stickyCartBottom = getStickyCartBottom(insets);

  return (
    <View style={styles.container}>
      <Header navigation={navigation} />
      <ShoppingFromBanner navigation={navigation} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadHomeData(true)}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollPaddingBottom }]}
      >
        {/* Prominent Search Bar */}
        <View style={styles.searchSection}>
          <Ionicons name="search" size={19} color="#16a34a" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search stores, farm veggies, dairy, thalis..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            accessibilityLabel="Search products and stores"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Retryable Error Banner on API Failure */}
        {apiError && (
          <TouchableOpacity
            style={styles.errorBanner}
            onPress={() => loadHomeData(false)}
            activeOpacity={0.85}
          >
            <Ionicons name="alert-circle-outline" size={18} color="#b91c1c" />
            <Text style={styles.errorBannerText}>{apiError}</Text>
            <View style={styles.errorRetryBtn}>
              <Text style={styles.errorRetryBtnText}>Retry</Text>
              <Ionicons name="refresh" size={12} color="#b91c1c" />
            </View>
          </TouchableOpacity>
        )}

        {/* Initial Loading Indicator */}
        {isLoading && !isRefreshing && vendors.length === 0 && (
          <View style={styles.initialLoadingContainer}>
            <ActivityIndicator size="small" color="#16a34a" />
            <Text style={styles.initialLoadingText}>Loading fresh neighbourhood stores...</Text>
          </View>
        )}

        {/* Dynamic Search Results Banner */}
        {isSearching ? (
          <View style={styles.searchResultWrapper}>
            <Text style={styles.searchResultHeader}>
              MATCHING RESULTS ({filteredVendors.length} STORES)
            </Text>

            {filteredVendors.length === 0 && filteredCategories.length === 0 ? (
              <View style={styles.noSearchCard}>
                <Ionicons name="search-outline" size={40} color="#94a3b8" />
                <Text style={styles.noSearchTitle}>No matching stores or produce</Text>
                <Text style={styles.noSearchSub}>
                  Try searching with keywords like "Fresh", "Milk", "Thali", or "Store"
                </Text>
                <TouchableOpacity style={styles.clearSearchBtn} onPress={() => setSearchQuery('')}>
                  <Text style={styles.clearSearchBtnText}>Clear Search</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {filteredVendors.map((v) => {
                  const isOpen = v.isOpen !== false;
                  return (
                    <TouchableOpacity
                      key={v._id}
                      style={[styles.vendorListCard, !isOpen && { opacity: 0.75 }]}
                      onPress={() => navigation.navigate('VendorStore', { vendor: v })}
                      activeOpacity={0.9}
                    >
                      <SafeImage
                        source={{ uri: isValidImageUri(v.banner) ? v.banner : null }}
                        style={styles.vendorListImg}
                        placeholderIcon="storefront-outline"
                        placeholderIconSize={32}
                      />
                      <View style={styles.vendorListInfo}>
                        <View style={styles.vendorListTopRow}>
                          <Text style={styles.vendorListTitle} numberOfLines={1}>{v.storeName}</Text>
                          {v.rating && typeof v.rating === 'number' && v.rating > 0 ? (
                            <View style={styles.ratingBadge}>
                              <Ionicons name="star" size={10} color="#ffffff" />
                              <Text style={styles.ratingBadgeText}>{Number(v.rating).toFixed(1)}</Text>
                            </View>
                          ) : null}
                        </View>
                        {v.description ? (
                          <Text style={styles.vendorListSub} numberOfLines={2}>{v.description}</Text>
                        ) : null}
                        <View style={styles.vendorListMetaRow}>
                          <Text style={[styles.metaTag, { color: isOpen ? '#15803d' : '#b91c1c' }]}>
                            {isOpen ? '🟢 Open Now' : '🔴 Closed'}
                          </Text>
                          <Text style={styles.metaTag}>⚡ {v.avgPrepTimeMins || 25} mins prep</Text>
                          {v.address?.city ? (
                            <Text style={styles.metaTag}>📍 {v.address.city}</Text>
                          ) : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <>
            {/* Reduced, Compact Promotional Card (No giant cropped strip) */}
            <View style={styles.promoCardWrapper}>
              <LinearGradient
                colors={['#15803d', '#16a34a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.promoCard}
              >
                <View style={styles.promoOrb1} pointerEvents="none" />
                <View style={styles.promoOrb2} pointerEvents="none" />
                <View style={styles.promoBadge}>
                  <Ionicons name="sparkles" size={11} color="#ea580c" />
                  <Text style={styles.promoBadgeText}>100% NEIGHBOURHOOD DIRECT</Text>
                </View>
                <Text style={styles.promoTitle}>Farm fresh & homemade food</Text>
                <Text style={styles.promoSub}>
                  Pure dairy, seasonal fruits & home-cooked thalis from verified local partners
                </Text>
              </LinearGradient>
            </View>

            {/* 1. Category Shortcuts */}
            {filteredCategories.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeading}>Explore categories</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Catalog')}>
                    <Text style={styles.seeAllText}>See Catalog →</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.categoryGrid}>
                  {filteredCategories.slice(0, 8).map((cat, idx) => (
                    <TouchableOpacity
                      key={String(cat._id || cat.slug || idx)}
                      style={styles.catCard}
                      onPress={() => navigation.navigate('CategoryVendors', { category: cat })}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`${cat.name} category`}
                    >
                      <View style={[styles.catIconWrap, cat.bgColor ? { backgroundColor: cat.bgColor } : null]}>
                        {cat.vectorIcon ? (
                          <Ionicons
                            name={cat.vectorIcon}
                            size={22}
                            color={cat.accentColor || '#16a34a'}
                          />
                        ) : (
                          <Text style={styles.catIconText}>{cat.icon || '🥦'}</Text>
                        )}
                      </View>
                      <Text style={styles.catName} numberOfLines={2}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

                        {/* 2. Popular Stores Near You (Kirana / Grocery) */}
            {popularStores.length > 0 && (
              <View style={[styles.sectionContainer, styles.storesSectionSurface]}>
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <Text style={styles.sectionHeading}>Popular local stores</Text>
                    <Text style={styles.sectionSubHeading}>Verified neighbourhood merchants</Text>
                  </View>
                  <TouchableOpacity onPress={() => navigation.navigate('Catalog')}>
                    <Text style={styles.seeAllText}>View All</Text>
                  </TouchableOpacity>
                </View>

                {popularStores.length === 1 ? (
                  <View style={styles.singleStoreWrapper}>
                    {popularStores.map((v) => {
                      const isOpen = v.isOpen !== false;
                      const hasRating = v.rating && typeof v.rating === 'number' && v.rating > 0;
                      return (
                        <TouchableOpacity
                          key={v._id}
                          style={[styles.singleStoreCard, !isOpen && { opacity: 0.75 }]}
                          onPress={() => navigation.navigate('VendorStore', { vendor: v })}
                          activeOpacity={0.9}
                          accessibilityRole="button"
                          accessibilityLabel={v.storeName}
                        >
                          <View style={styles.singleStoreImgContainer}>
                            <SafeImage
                              source={{ uri: isValidImageUri(v.banner) ? v.banner : null }}
                              style={styles.singleStoreImg}
                              placeholderIcon="storefront-outline"
                              placeholderIconSize={44}
                            />
                            {hasRating ? (
                              <View style={styles.singleStoreRatingBadge}>
                                <Ionicons name="star" size={11} color="#ffffff" />
                                <Text style={styles.singleStoreRatingText}>{Number(v.rating).toFixed(1)}</Text>
                              </View>
                            ) : null}
                          </View>

                          <View style={styles.singleStoreInfo}>
                            <View style={styles.singleStoreTitleRow}>
                              <Text style={styles.singleStoreName} numberOfLines={1}>
                                {v.storeName}
                              </Text>
                              <View style={[styles.storeStatusPill, { backgroundColor: isOpen ? '#dcfce7' : '#fee2e2' }]}>
                                <Text style={[styles.storeStatusPillText, { color: isOpen ? '#15803d' : '#b91c1c' }]}>
                                  {isOpen ? '● Open' : '● Closed'}
                                </Text>
                              </View>
                            </View>
                            {v.description ? (
                              <Text style={styles.singleStoreDesc} numberOfLines={2}>
                                {v.description}
                              </Text>
                            ) : null}
                            <View style={styles.singleStoreMetaRow}>
                              <Text style={styles.singleStoreMetaItem}>
                                ⚡ {v.avgPrepTimeMins || 25} mins prep
                              </Text>
                              {v.address?.city ? (
                                <Text style={styles.singleStoreMetaItem}>
                                  📍 {v.address.city}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.storeRail}
                  >
                    {popularStores.map((v) => {
                      const isOpen = v.isOpen !== false;
                      const hasRating = v.rating && typeof v.rating === 'number' && v.rating > 0;
                      return (
                        <TouchableOpacity
                          key={v._id}
                          style={[styles.storeCard, !isOpen && { opacity: 0.72 }]}
                          onPress={() => navigation.navigate('VendorStore', { vendor: v })}
                          activeOpacity={0.88}
                        >
                          <SafeImage
                            source={{ uri: isValidImageUri(v.banner) ? v.banner : null }}
                            style={styles.storeImg}
                            placeholderIcon="storefront-outline"
                            placeholderIconSize={28}
                          />

                          {hasRating ? (
                            <View style={styles.storeRatingBadge}>
                              <Ionicons name="star" size={10} color="#ffffff" />
                              <Text style={styles.storeRatingText}>{Number(v.rating).toFixed(1)}</Text>
                            </View>
                          ) : null}

                          <View style={styles.storeInfo}>
                            <Text style={styles.storeName} numberOfLines={1}>
                              {v.storeName}
                            </Text>
                            <Text style={styles.storePrepTime}>
                              ⚡ {v.avgPrepTimeMins || 25} mins • {v.address?.city || 'Local Area'}
                            </Text>
                            <Text style={[styles.storeStatus, { color: isOpen ? '#15803d' : '#b91c1c' }]}>
                              {isOpen ? '🟢 Open Now' : '🔴 Closed'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}

            {/* 3. Ghar Ka Khana (Home Chefs) */}
            {homeChefs.length > 0 && (
              <View style={[styles.sectionContainer, styles.chefsSectionSurface]}>
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <View style={styles.chefBadgeRow}>
                      <View style={styles.chefBadge}>
                        <Ionicons name="restaurant" size={11} color="#c2410c" />
                        <Text style={styles.chefBadgeText}>Home Kitchens</Text>
                      </View>
                    </View>
                    <Text style={styles.sectionHeading}>Ghar ka khana (Home chefs)</Text>
                    <Text style={styles.sectionSubHeading}>Authentic home-cooked meals & sweets</Text>
                  </View>
                  <TouchableOpacity onPress={() => navigation.navigate('HomeRestro')}>
                    <Text style={styles.seeAllText}>See Kitchens →</Text>
                  </TouchableOpacity>
                </View>

                {homeChefs.map((v) => {
                  const isOpen = v.isOpen !== false;
                  return (
                    <TouchableOpacity
                      key={v._id}
                      style={[styles.homeChefCard, !isOpen && { opacity: 0.75 }]}
                      onPress={() => navigation.navigate('VendorStore', { vendor: v })}
                      activeOpacity={0.9}
                    >
                      <SafeImage
                        source={{ uri: isValidImageUri(v.banner) ? v.banner : null }}
                        style={styles.homeChefImg}
                        placeholderIcon="restaurant-outline"
                        placeholderIconSize={36}
                      />
                      <View style={styles.homeChefInfo}>
                        <View style={styles.vendorListTopRow}>
                          <Text style={styles.homeChefTitle}>{v.storeName}</Text>
                          {v.rating && typeof v.rating === 'number' && v.rating > 0 ? (
                            <View style={styles.ratingBadge}>
                              <Ionicons name="star" size={10} color="#ffffff" />
                              <Text style={styles.ratingBadgeText}>{Number(v.rating).toFixed(1)}</Text>
                            </View>
                          ) : null}
                        </View>
                        {v.description ? (
                          <Text style={styles.homeChefSub} numberOfLines={2}>
                            {v.description}
                          </Text>
                        ) : null}
                        <View style={styles.homeChefMetaRow}>
                          <Text style={[styles.metaTag, { color: isOpen ? '#15803d' : '#b91c1c' }]}>
                            {isOpen ? '🟢 Open Now' : '🔴 Closed'}
                          </Text>
                          <Text style={styles.metaTag}>⚡ {v.avgPrepTimeMins || 25} mins</Text>
                          {v.address?.city ? (
                            <Text style={styles.metaTag}>📍 {v.address.city}</Text>
                          ) : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* 4. Direct From Farms */}
            {farmers.length > 0 && (
              <View style={[styles.sectionContainer, styles.farmsSectionSurface]}>
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <View style={styles.farmBadge}>
                      <Ionicons name="leaf" size={11} color="#15803d" />
                      <Text style={styles.farmBadgeText}>0 Middlemen</Text>
                    </View>
                    <Text style={styles.sectionHeading}>Direct from local farms</Text>
                    <Text style={styles.sectionSubHeading}>Freshly harvested produce</Text>
                  </View>
                </View>

                <View style={styles.farmerGrid}>
                  {farmers.map((v) => (
                    <TouchableOpacity
                      key={v._id}
                      style={styles.farmerCard}
                      onPress={() => navigation.navigate('VendorStore', { vendor: v })}
                      activeOpacity={0.9}
                    >
                      <SafeImage
                        source={{ uri: isValidImageUri(v.banner) ? v.banner : null }}
                        style={styles.farmerImg}
                        placeholderIcon="leaf-outline"
                        placeholderIconSize={32}
                      />
                      <View style={styles.farmerInfo}>
                        <Text style={styles.farmerStoreName} numberOfLines={1}>{v.storeName}</Text>
                        <Text style={styles.farmerOwner}>👨‍🌾 {v.ownerName}</Text>
                        {v.description ? (
                          <Text style={styles.farmerDesc} numberOfLines={2}>{v.description}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Sticky Bottom Cart Bar (Calculated with dynamic dock clearance) */}
      {hasActiveCart && (
        <View style={[styles.stickyCartBar, { bottom: stickyCartBottom }]}>
          <View>
            <Text style={styles.cartCountText}>{billSummary.totalCount} ITEM(S)</Text>
            <Text style={styles.cartTotalText}>₹{billSummary.grandTotal ?? billSummary.total ?? 0}</Text>
          </View>
          <TouchableOpacity
            style={styles.viewCartBtn}
            onPress={() => navigation.navigate('Cart')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="View Cart"
          >
            <Text style={styles.viewCartText}>View Cart</Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Global Single-Vendor Conflict Modal */}
      <ClearCartModal
        visible={conflictModal.visible}
        currentVendorName={conflictModal.currentVendorName}
        newVendorName={conflictModal.newVendorName}
        itemCount={conflictModal.itemCount || 1}
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
  scrollContent: {
    paddingTop: 4
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#86efac',
    gap: 10,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0f172a',
    padding: 0,
    minHeight: 24
  },
  promoCardWrapper: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 14
  },
  promoCard: {
    borderRadius: 18,
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#15803d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3
  },
  promoOrb1: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.12)'
  },
  promoOrb2: {
    position: 'absolute',
    bottom: -30,
    left: 40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(234, 88, 12, 0.14)'
  },
  promoBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fed7aa'
  },
  promoBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803d',
    letterSpacing: 0.4
  },
  promoTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 23
  },
  promoSub: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.92)',
    marginTop: 4,
    lineHeight: 16
  },
  sectionContainer: {
    marginHorizontal: 16,
    marginBottom: 18
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.2
  },
  sectionSubHeading: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803d'
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between'
  },
  catCard: {
    width: '23%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 3,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: 'rgba(15, 23, 42, 0.04)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1
  },
  catIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6
  },
  catIconText: {
    fontSize: 24
  },
  catName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
    lineHeight: 14
  },
  storesSectionSurface: {
    backgroundColor: 'rgba(220, 252, 231, 0.45)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 16
  },
  chefsSectionSurface: {
    backgroundColor: 'rgba(255, 237, 213, 0.45)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#fed7aa',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 16
  },
  farmsSectionSurface: {
    backgroundColor: 'rgba(240, 253, 244, 0.65)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 16
  },
  singleStoreWrapper: {
    paddingHorizontal: 0
  },
  singleStoreCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2
  },
  singleStoreImgContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#f1f5f9',
    position: 'relative',
    overflow: 'hidden'
  },
  singleStoreImg: {
    width: '100%',
    height: '100%'
  },
  singleStoreRatingBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#16a34a',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8
  },
  singleStoreRatingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff'
  },
  singleStoreInfo: {
    padding: 14
  },
  singleStoreTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  singleStoreName: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1,
    marginRight: 8
  },
  storeStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  storeStatusPillText: {
    fontSize: 11,
    fontWeight: '800'
  },
  singleStoreDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    lineHeight: 16
  },
  singleStoreMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8
  },
  singleStoreMetaItem: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600'
  },
  storeRail: {
    paddingHorizontal: 16,
    gap: 12
  },
  storeCard: {
    width: 210,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative'
  },
  storeImg: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#f1f5f9'
  },
  storeRatingBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#16a34a',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6
  },
  storeRatingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff'
  },
  storeInfo: {
    padding: 10
  },
  storeName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  storePrepTime: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  storeStatus: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3
  },
  chefBadgeRow: {
    marginBottom: 3
  },
  chefBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    alignSelf: 'flex-start'
  },
  chefBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#c2410c'
  },
  homeChefCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#fed7aa',
    marginBottom: 12,
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2
  },
  homeChefImg: {
    width: 100,
    height: 95,
    backgroundColor: '#fff7ed'
  },
  homeChefInfo: {
    flex: 1,
    padding: 10,
    justifyContent: 'center'
  },
  homeChefTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1
  },
  homeChefSub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2
  },
  homeChefMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6
  },
  farmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginBottom: 3
  },
  farmBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803d'
  },
  farmerGrid: {
    paddingHorizontal: 16,
    gap: 10
  },
  farmerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
    gap: 10
  },
  farmerImg: {
    width: 70,
    height: 70,
    borderRadius: 12,
    backgroundColor: '#f1f5f9'
  },
  farmerInfo: {
    flex: 1
  },
  farmerStoreName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0f172a'
  },
  farmerOwner: {
    fontSize: 11.5,
    color: '#15803d',
    fontWeight: '600',
    marginTop: 2
  },
  farmerDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  searchResultWrapper: {
    paddingHorizontal: 16,
    marginBottom: 16
  },
  searchResultHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 10,
    letterSpacing: 0.5
  },
  noSearchCard: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  noSearchTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 10
  },
  noSearchSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center'
  },
  clearSearchBtn: {
    marginTop: 14,
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  clearSearchBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12.5
  },
  vendorListCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    overflow: 'hidden',
    padding: 10,
    gap: 12
  },
  vendorListImg: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#f1f5f9'
  },
  vendorListInfo: {
    flex: 1,
    justifyContent: 'center'
  },
  vendorListTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8
  },
  vendorListTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1
  },
  vendorListSub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2
  },
  vendorListMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#16a34a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5
  },
  ratingBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700'
  },
  metaTag: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500'
  },
  stickyCartBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#15803d',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#15803d',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 998
  },
  cartCountText: {
    color: '#bbf7d0',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  cartTotalText: {
    color: '#ffffff',
    fontSize: 17,
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
    fontSize: 14.5
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    gap: 8
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#b91c1c',
    fontWeight: '500'
  },
  errorRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  errorRetryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b91c1c'
  },
  initialLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8
  },
  initialLoadingText: {
    fontSize: 12.5,
    color: '#64748b'
  }
});

export default HomeScreen;
