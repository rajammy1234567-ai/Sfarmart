import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { ShoppingFromBanner } from '../../components/ShoppingFromBanner';
import { apiService } from '../../services/api';
import { useCart } from '../../context/CartContext';
import { ClearCartModal } from '../../components/ClearCartModal';
import { colors } from '../../theme/colors';
import { SafeImage, isValidImageUri } from '../../components/common/SafeImage';
import { resolveBrowseCategories } from '../../config/categories';

export const HomeScreen = ({ navigation }) => {
  const [categories, setCategories] = useState(() => resolveBrowseCategories([]));
  const [vendors, setVendors] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [hasCategoriesLoaded, setHasCategoriesLoaded] = useState(false);

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
      // Use Promise.allSettled to eliminate unhandled promise rejections
      const [catResult, vendResult] = await Promise.allSettled([
        apiService.getHomeCategories(),
        apiService.getVendors()
      ]);

      const catRes = catResult.status === 'fulfilled' ? catResult.value : null;
      const vendRes = vendResult.status === 'fulfilled' ? vendResult.value : null;

      let catFetchSucceeded = false;
      let vendFetchSucceeded = false;

      // Handle categories response
      if (catRes && catRes.success && Array.isArray(catRes.categories)) {
        catFetchSucceeded = true;
        setCategories(resolveBrowseCategories(catRes.categories));
        setHasCategoriesLoaded(true);
      } else if (catRes && !catRes.success) {
        console.warn('HomeScreen: Categories API unreachable or failed:', catRes);
        // On failure, preserve previously loaded categories without clearing or fabricating
      }

      // Handle vendors response
      if (vendRes && vendRes.success && Array.isArray(vendRes.vendors)) {
        vendFetchSucceeded = true;
        setVendors(vendRes.vendors);
      } else if (vendRes && !vendRes.success) {
        console.warn('HomeScreen: Vendors API unreachable or failed:', vendRes);
        // On failure, preserve previously loaded vendors
      }

      // Track error state for retry banner without wiping existing data
      if (!catFetchSucceeded || !vendFetchSucceeded) {
        setApiError('Unable to sync latest live data. Tap to retry.');
      } else {
        setApiError(null);
      }
    } catch (err) {
      console.warn('HomeScreen loadHomeData unexpected exception:', err);
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

  const homeChefs = filteredVendors.filter((v) => v.storeType === 'HOME_CHEF');
  const farmers = filteredVendors.filter((v) => v.storeType === 'FARMER');

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
        contentContainerStyle={[
          styles.scrollContent,
          billSummary.totalCount > 0 && { paddingBottom: 90 }
        ]}
      >
        {/* Search Bar */}
        <View style={styles.searchSection}>
          <Ionicons name="search" size={18} color={colors.primary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search stores, veggies, home thalis, sweets..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
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
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.initialLoadingText}>Loading fresh local produce & stores...</Text>
          </View>
        )}

        {/* Dynamic Search Results Banner when user is typing */}
        {isSearching ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 12 }}>
              SEARCH RESULTS FOR "{searchQuery}" ({filteredVendors.length} Stores, {filteredCategories.length} Categories)
            </Text>

            {filteredVendors.length === 0 && filteredCategories.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 32, backgroundColor: '#ffffff', borderRadius: 16 }}>
                <Ionicons name="search-outline" size={44} color="#94a3b8" />
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#475569', marginTop: 10 }}>No stores or produce found</Text>
                <Text style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, textAlign: 'center' }}>Try searching with a different keyword like "Dal", "Fresh", "Thali", or "Farm"</Text>
                <TouchableOpacity
                  style={{ marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                  onPress={() => setSearchQuery('')}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>Clear Search</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {filteredVendors.map((v) => {
                  const isOpen = v.isOpen !== false;
                  return (
                    <TouchableOpacity
                      key={v._id}
                      style={[styles.featuredVendorCard, !isOpen && { opacity: 0.75 }]}
                      onPress={() => navigation.navigate('VendorStore', { vendor: v })}
                      activeOpacity={0.9}
                    >
                      <SafeImage
                        source={{
                          uri: isValidImageUri(v.banner)
                            ? v.banner
                            : 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800'
                        }}
                        style={styles.featuredImg}
                        placeholderIcon="storefront-outline"
                        placeholderIconSize={36}
                      />
                      <View style={styles.featuredInfo}>
                        <View style={styles.featuredHeader}>
                          <Text style={styles.featuredTitle}>{v.storeName}</Text>
                          <View style={styles.ratingBadge}>
                            <Ionicons name="star" size={11} color="#ffffff" />
                            <Text style={styles.ratingBadgeText}>{v.rating || 4.8}</Text>
                          </View>
                        </View>
                        <Text style={styles.featuredSub}>{v.description}</Text>
                        <View style={styles.featuredMeta}>
                          <Text style={[styles.metaTag, { color: isOpen ? '#15803d' : '#b91c1c' }]}>
                            {isOpen ? '🟢 Open Now' : '🔴 Closed'}
                          </Text>
                          <Text style={styles.metaTag}>⚡ {v.avgPrepTimeMins || 25} mins prep</Text>
                          <Text style={styles.metaTag}>📍 {v.address?.city || 'Ludhiana'}</Text>
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
            {/* Promo Top Banner */}
            <View style={styles.bannerWrapper}>
              <SafeImage
                source={{
                  uri: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80'
                }}
                style={styles.bannerImg}
                placeholderIcon="leaf-outline"
                placeholderIconSize={48}
              />
              <View style={styles.bannerOverlay}>
                <View style={styles.pillBadge}>
                  <Ionicons name="sparkles" size={11} color="#ffffff" />
                  <Text style={styles.pillText}>DIRECT FROM LOCAL STORES</Text>
                </View>
                <Text style={styles.bannerTitle}>Pesticide-Free & Fresh 🌾</Text>
                <Text style={styles.bannerSub}>Organic farm produce & home-cooked food delivered in 30 mins</Text>
              </View>
            </View>

            {/* 1. Category-First Grid (Dynamic Categories count from MongoDB) */}
            {filteredCategories.length > 0 && (
              <View style={styles.categorySection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeading}>WHAT ARE YOU LOOKING FOR?</Text>
                  <Text style={styles.sectionBadge}>
                    {filteredCategories.length} {filteredCategories.length === 1 ? 'Category' : 'Categories'}
                  </Text>
                </View>

                <View style={styles.categoryGrid}>
                  {filteredCategories.map((cat, idx) => (
                    <TouchableOpacity
                      key={String(cat._id || cat.dbId || cat.key || cat.slug || idx)}
                      style={styles.catCard}
                      onPress={() => navigation.navigate('CategoryVendors', { category: cat })}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.catIconWrap,
                          cat.bgColor ? { backgroundColor: cat.bgColor } : null
                        ]}
                      >
                        {cat.vectorIcon ? (
                          <Ionicons
                            name={cat.vectorIcon}
                            size={22}
                            color={cat.accentColor || colors.primary}
                          />
                        ) : (
                          <Text style={styles.catIconText}>{cat.icon || '🥦'}</Text>
                        )}
                      </View>
                      <Text
                        style={styles.catName}
                        numberOfLines={2}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* 2. Popular Stores Near You */}
            <View style={styles.vendorSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeading}>POPULAR STORES NEAR YOU</Text>
                <Text style={styles.sectionSubText}>Express Delivery</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vendorRail}>
                {vendors.map((v) => {
                  const isOpen = v.isOpen !== false;
                  return (
                    <TouchableOpacity
                      key={v._id}
                      style={[styles.vendorRailCard, !isOpen && { opacity: 0.7 }]}
                      onPress={() => navigation.navigate('VendorStore', { vendor: v })}
                      activeOpacity={0.85}
                    >
                      <SafeImage
                        source={{
                          uri: isValidImageUri(v.banner)
                            ? v.banner
                            : 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400'
                        }}
                        style={styles.railImg}
                        placeholderIcon="storefront-outline"
                        placeholderIconSize={28}
                      />
                      <View style={styles.railRatingBadge}>
                        <Ionicons name="star" size={10} color="#ffffff" />
                        <Text style={styles.railRatingText}>{v.rating || 4.8}</Text>
                      </View>

                      <View style={styles.railInfo}>
                        <Text style={styles.railStoreName} numberOfLines={1}>
                          {v.storeName}
                        </Text>
                        <Text style={styles.railPrepTime}>
                          ⚡ {v.avgPrepTimeMins || 25} mins • {v.address?.city || 'Ludhiana'}
                        </Text>
                        <Text style={[styles.railStatus, { color: isOpen ? '#15803d' : '#b91c1c' }]}>
                          {isOpen ? '🟢 Open Now' : '🔴 Closed'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </>
        )}

        {/* 3. Ghar Ka Khana (Home Chefs) Rail */}
        {homeChefs.length > 0 && (
          <View style={styles.vendorSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>GHAR KA KHANA (HOME CHEFS)</Text>
              <Text style={styles.sectionSubText}>Motherly Love</Text>
            </View>

            {homeChefs.map((v) => (
              <TouchableOpacity
                key={v._id}
                style={styles.featuredVendorCard}
                onPress={() => navigation.navigate('VendorStore', { vendor: v })}
                activeOpacity={0.9}
              >
                <SafeImage
                  source={{
                    uri: isValidImageUri(v.banner)
                      ? v.banner
                      : 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800'
                  }}
                  style={styles.featuredImg}
                  placeholderIcon="restaurant-outline"
                  placeholderIconSize={36}
                />
                <View style={styles.featuredInfo}>
                  <View style={styles.featuredHeader}>
                    <Text style={styles.featuredTitle}>{v.storeName}</Text>
                    <View style={styles.ratingBadge}>
                      <Ionicons name="star" size={11} color="#ffffff" />
                      <Text style={styles.ratingBadgeText}>{v.rating || 4.9}</Text>
                    </View>
                  </View>
                  <Text style={styles.featuredSub}>{v.description}</Text>
                  <View style={styles.featuredMeta}>
                    <Text style={styles.metaTag}>🍛 Fresh Punjabi Thali</Text>
                    <Text style={styles.metaTag}>🍰 Desi Ghee Mithai</Text>
                    <Text style={styles.metaTag}>⚡ 25 mins</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 4. Farm Direct Produce */}
        {farmers.length > 0 && (
          <View style={styles.vendorSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>DIRECT FROM FARMS & ORCHARDS</Text>
              <Text style={styles.sectionSubText}>0 Middlemen</Text>
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
                    source={{
                      uri: isValidImageUri(v.banner)
                        ? v.banner
                        : 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800'
                    }}
                    style={styles.farmerImg}
                    placeholderIcon="leaf-outline"
                    placeholderIconSize={36}
                  />
                  <View style={styles.farmerInfo}>
                    <Text style={styles.farmerStoreName} numberOfLines={1}>{v.storeName}</Text>
                    <Text style={styles.farmerOwner}>👨‍🌾 {v.ownerName}</Text>
                    <Text style={styles.farmerDesc} numberOfLines={2}>{v.description}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky Bottom Cart Bar */}
      {billSummary.totalCount > 0 && (
        <View style={styles.stickyCartBar}>
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
    paddingBottom: 28
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '500',
    color: '#0f172a',
    padding: 0
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 8
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#991b1b'
  },
  errorRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  errorRetryBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c'
  },
  initialLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12
  },
  initialLoadingText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748b'
  },
  bannerWrapper: {
    height: 130,
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative'
  },
  bannerImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover'
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    padding: 16,
    justifyContent: 'center'
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    marginBottom: 6
  },
  pillText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700'
  },
  bannerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff'
  },
  bannerSub: {
    fontSize: 11.5,
    color: '#e2e8f0',
    marginTop: 2
  },
  categorySection: {
    paddingHorizontal: 16,
    marginBottom: 20
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8
  },
  sectionBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a'
  },
  sectionSubText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b'
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
    fontSize: 22
  },
  catName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    lineHeight: 13,
    includeFontPadding: false,
    minHeight: 26
  },
  catCardUnavailable: {
    opacity: 0.72,
    backgroundColor: '#fafafa',
    borderColor: '#f1f5f9'
  },
  catIconWrapUnavailable: {
    backgroundColor: '#f1f5f9'
  },
  catNameUnavailable: {
    color: '#64748b'
  },
  unavailableBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4
  },
  unavailableBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase'
  },
  vendorSection: {
    marginBottom: 22,
    paddingHorizontal: 16
  },
  vendorRail: {
    gap: 12,
    paddingVertical: 4
  },
  vendorRailCard: {
    width: 170,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  railImg: {
    width: '100%',
    height: 95,
    resizeMode: 'cover'
  },
  railRatingBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  railRatingText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800'
  },
  railInfo: {
    padding: 10
  },
  railStoreName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0f172a'
  },
  railPrepTime: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  railStatus: {
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 4
  },
  featuredVendorCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12
  },
  featuredImg: {
    width: '100%',
    height: 120,
    resizeMode: 'cover'
  },
  featuredInfo: {
    padding: 14
  },
  featuredHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  featuredTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#16a34a',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  ratingBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800'
  },
  featuredSub: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 4
  },
  featuredMeta: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap'
  },
  metaTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#15803d',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  farmerGrid: {
    gap: 12
  },
  farmerCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  farmerImg: {
    width: 100,
    height: 100,
    resizeMode: 'cover'
  },
  farmerInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center'
  },
  farmerStoreName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0f172a'
  },
  farmerOwner: {
    fontSize: 12,
    color: '#15803d',
    fontWeight: '600',
    marginTop: 2
  },
  farmerDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4
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
