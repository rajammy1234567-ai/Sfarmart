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
import { ProductCard } from '../../components/ProductCard';
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
  const [products, setProducts] = useState([]);
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
      const [catResult, vendResult, prodResult] = await Promise.allSettled([
        apiService.getHomeCategories(),
        apiService.getVendors(),
        apiService.getProducts()
      ]);

      const catRes = catResult.status === 'fulfilled' ? catResult.value : null;
      const vendRes = vendResult.status === 'fulfilled' ? vendResult.value : null;
      const prodRes = prodResult.status === 'fulfilled' ? prodResult.value : null;

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

      if (prodRes && prodRes.success && Array.isArray(prodRes.products)) {
        setProducts(prodRes.products);
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

  // Filter out inactive/unapproved and controlled test vendor
  const filteredVendors = vendors
    .filter((v) => {
      if (v.isActive === false || v.isApproved === false) return false;
      const vId = (v._id || v.id || '').toString();
      if (vId === '6aea07db1cf98f83bee27ee4') return false;
      if (v.storeName?.toLowerCase().includes('controlled verification')) return false;

      if (!isSearching) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        v.storeName?.toLowerCase().includes(q) ||
        v.ownerName?.toLowerCase().includes(q) ||
        v.description?.toLowerCase().includes(q) ||
        v.storeType?.toLowerCase().includes(q) ||
        v.address?.city?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      // Open stores appear first, closed stores afterward
      const aOpen = a.isOpen !== false ? 1 : 0;
      const bOpen = b.isOpen !== false ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;
      return 0;
    });

  const filteredCategories = categories.filter((c) => {
    if (!isSearching) return true;
    const q = searchQuery.toLowerCase().trim();
    return c.name?.toLowerCase().includes(q) || c.slug?.toLowerCase().includes(q);
  });

  // Filter available products (exclude controlled test shop and unpublished items)
  const availableProducts = products.filter((p) => {
    if (p.isActive === false || p.isPublished === false) return false;
    const v = p.vendor;
    if (!v) return false;
    if (v.isActive === false || v.isApproved === false) return false;
    const vId = (v._id || v.id || String(v || '')).toString();
    if (vId === '6aea07db1cf98f83bee27ee4') return false;
    if (v.storeName?.toLowerCase().includes('controlled verification')) return false;

    if (!isSearching) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      v.storeName?.toLowerCase().includes(q)
    );
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
              MATCHING RESULTS ({filteredVendors.length} STORES, {availableProducts.length} PRODUCTS)
            </Text>

            {filteredVendors.length === 0 && filteredCategories.length === 0 && availableProducts.length === 0 ? (
              <View style={styles.noSearchCard}>
                <Ionicons name="search-outline" size={40} color="#94a3b8" />
                <Text style={styles.noSearchTitle}>No matching stores or produce</Text>
                <Text style={styles.noSearchSub}>
                  Try searching with keywords like "Fresh", "Milk", "Water", or "Store"
                </Text>
                <TouchableOpacity style={styles.clearSearchBtn} onPress={() => setSearchQuery('')}>
                  <Text style={styles.clearSearchBtnText}>Clear Search</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 14 }}>
                {filteredVendors.map((v) => {
                  const isOpen = v.isOpen !== false;
                  const hasRating = Boolean(
                    v.rating &&
                    typeof v.rating === 'number' &&
                    v.rating > 0 &&
                    (v.numReviews > 0 || v.ratingCount > 0 || v.reviewsCount > 0)
                  );
                  return (
                    <TouchableOpacity
                      key={v._id}
                      style={[styles.vendorListCard, !isOpen && { opacity: 0.78 }]}
                      onPress={() => navigation.navigate('VendorStore', { vendor: v })}
                      activeOpacity={0.9}
                    >
                      <SafeImage
                        source={{ uri: isValidImageUri(v.banner) ? v.banner : null }}
                        style={[styles.vendorListImg, !isOpen && { opacity: 0.65 }]}
                        placeholderIcon="storefront-outline"
                        placeholderIconSize={32}
                      />
                      <View style={styles.vendorListInfo}>
                        <View style={styles.vendorListTopRow}>
                          <Text style={styles.vendorListTitle} numberOfLines={1}>{v.storeName}</Text>
                          {hasRating ? (
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

                {/* Matching Products during search */}
                {availableProducts.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.searchSubSectionHeader}>Matching Products</Text>
                    <View style={styles.productsGrid}>
                      {availableProducts.map((p) => (
                        <View key={p._id} style={styles.productCol}>
                          <ProductCard
                            product={p}
                            onPress={() => navigation.navigate('ProductDetails', { product: p })}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        ) : (
          <>
            {/* Reduced, Compact Promotional Card */}
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
                <Text style={styles.promoTitle}>Farm fresh & daily essentials</Text>
                <Text style={styles.promoSub}>
                  Pure dairy, farm harvests & essentials delivered from verified local partners
                </Text>
              </LinearGradient>
            </View>

            {/* 1. Compact 8-Category Grid */}
            {filteredCategories.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <Text style={styles.sectionHeading}>Explore categories</Text>
                    <Text style={styles.sectionSubHeading}>Shop fresh essentials & local specialties</Text>
                  </View>
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
                      <View
                        style={[
                          styles.catIconWrap,
                          cat.bgColor ? { backgroundColor: cat.bgColor } : null,
                          cat.borderColor ? { borderColor: cat.borderColor, borderWidth: 1 } : null
                        ]}
                      >
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
                        {cat.shortName || cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* 2. Popular Stores Near You (Open stores first, closed stores afterward) */}
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
                      const hasRating = Boolean(
                        v.rating &&
                        typeof v.rating === 'number' &&
                        v.rating > 0 &&
                        (v.numReviews > 0 || v.ratingCount > 0 || v.reviewsCount > 0)
                      );
                      return (
                        <TouchableOpacity
                          key={v._id}
                          style={[styles.singleStoreCard, !isOpen && styles.singleStoreCardClosed]}
                          onPress={() => navigation.navigate('VendorStore', { vendor: v })}
                          activeOpacity={0.9}
                          accessibilityRole="button"
                          accessibilityLabel={v.storeName}
                        >
                          <View style={[styles.singleStoreImgContainer, !isOpen && { opacity: 0.65 }]}>
                            <SafeImage
                              source={{ uri: isValidImageUri(v.banner) ? v.banner : null }}
                              style={styles.singleStoreImg}
                              placeholderIcon="storefront-outline"
                              placeholderIconSize={38}
                            />
                            {hasRating ? (
                              <View style={styles.singleStoreRatingBadge}>
                                <Ionicons name="star" size={11} color="#ffffff" />
                                <Text style={styles.singleStoreRatingText}>{Number(v.rating).toFixed(1)}</Text>
                              </View>
                            ) : null}
                            <View style={[styles.storeStatusPill, { backgroundColor: isOpen ? '#dcfce7' : '#fee2e2' }]}>
                              <Text style={[styles.storeStatusPillText, { color: isOpen ? '#15803d' : '#b91c1c' }]}>
                                {isOpen ? '● Open Now' : '● Closed'}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.singleStoreInfo}>
                            <View style={styles.singleStoreTitleRow}>
                              <Text style={styles.singleStoreName} numberOfLines={1}>
                                {v.storeName}
                              </Text>
                              <Text style={styles.singleStoreTypeTag}>
                                {v.storeType === 'KIRANA' || v.storeType === 'STORE' ? '🏪 Local Kirana' : '🌾 Partner Shop'}
                              </Text>
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
                              <Text style={[styles.singleStoreMetaItem, { color: '#16a34a', fontWeight: '700' }]}>
                                Min ₹{v.minOrderValue || 99}
                              </Text>
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
                      const hasRating = Boolean(
                        v.rating &&
                        typeof v.rating === 'number' &&
                        v.rating > 0 &&
                        (v.numReviews > 0 || v.ratingCount > 0 || v.reviewsCount > 0)
                      );
                      return (
                        <TouchableOpacity
                          key={v._id}
                          style={[styles.storeCard, !isOpen && { opacity: 0.78 }]}
                          onPress={() => navigation.navigate('VendorStore', { vendor: v })}
                          activeOpacity={0.88}
                        >
                          <SafeImage
                            source={{ uri: isValidImageUri(v.banner) ? v.banner : null }}
                            style={[styles.storeImg, !isOpen && { opacity: 0.65 }]}
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

            {/* 3. Actual Available Products Below Stores (Includes Krishna's Water Product) */}
            {availableProducts.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <Text style={styles.sectionHeading}>Available in your area</Text>
                    <Text style={styles.sectionSubHeading}>Order direct from verified local partners</Text>
                  </View>
                  <TouchableOpacity onPress={() => navigation.navigate('Catalog')}>
                    <Text style={styles.seeAllText}>View All ({availableProducts.length}) →</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.productsGrid}>
                  {availableProducts.slice(0, 6).map((product) => (
                    <View
                      key={product._id}
                      style={availableProducts.length === 1 ? styles.singleProductCol : styles.productCol}
                    >
                      <ProductCard
                        product={product}
                        onPress={() => navigation.navigate('ProductDetails', { product })}
                      />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 4. Explore S-farmart (3 Attractive Core Showcase Cards) */}
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionHeading}>Explore S-farmart</Text>
                  <Text style={styles.sectionSubHeading}>Neighbourhood freshness across our 3 core pillars</Text>
                </View>
              </View>

              <View style={styles.exploreGrid}>
                {/* Card 1: Daily Groceries */}
                <TouchableOpacity
                  style={[styles.exploreCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}
                  onPress={() => navigation.navigate('Catalog')}
                  activeOpacity={0.88}
                >
                  <View style={styles.exploreCardTop}>
                    <View style={[styles.exploreIconWrap, { backgroundColor: '#dcfce7' }]}>
                      <Ionicons name="cart" size={20} color="#16a34a" />
                    </View>
                    <View style={[styles.exploreBadge, { backgroundColor: '#dcfce7', borderColor: '#86efac' }]}>
                      <Text style={[styles.exploreBadgeText, { color: '#15803d' }]}>● Live in your area</Text>
                    </View>
                  </View>
                  <Text style={styles.exploreCardTitle}>Daily Groceries & Staples</Text>
                  <Text style={styles.exploreCardDesc}>
                    Pantry staples, dairy & packaged essentials from trusted local neighbourhood kirana stores.
                  </Text>
                  <View style={styles.exploreCardFooter}>
                    <Text style={[styles.exploreActionText, { color: '#16a34a' }]}>Browse Stores</Text>
                    <Ionicons name="arrow-forward" size={14} color="#16a34a" />
                  </View>
                </TouchableOpacity>

                {/* Card 2: Direct Farm Harvests */}
                <View
                  style={[styles.exploreCard, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}
                >
                  <View style={styles.exploreCardTop}>
                    <View style={[styles.exploreIconWrap, { backgroundColor: '#e2e8f0' }]}>
                      <Ionicons name="leaf" size={20} color="#059669" />
                    </View>
                    <View style={[styles.exploreBadge, { backgroundColor: '#fef3c7', borderColor: '#fde68a' }]}>
                      <Text style={[styles.exploreBadgeText, { color: '#b45309' }]}>Showcase · Coming soon</Text>
                    </View>
                  </View>
                  <Text style={styles.exploreCardTitle}>Direct Farm Harvests</Text>
                  <Text style={styles.exploreCardDesc}>
                    Fresh seasonal vegetables & fruits procured directly from regional village farm hubs without middlemen.
                  </Text>
                  <View style={styles.exploreCardFooter}>
                    <Text style={[styles.exploreActionText, { color: '#64748b' }]}>Non-orderable showcase</Text>
                  </View>
                </View>

                {/* Card 3: Home-Cooked Food */}
                <TouchableOpacity
                  style={[styles.exploreCard, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}
                  onPress={() => navigation.navigate('HomeRestro')}
                  activeOpacity={0.88}
                >
                  <View style={styles.exploreCardTop}>
                    <View style={[styles.exploreIconWrap, { backgroundColor: '#ffedd5' }]}>
                      <Ionicons name="restaurant" size={20} color="#ea580c" />
                    </View>
                    <View style={[styles.exploreBadge, { backgroundColor: '#fef3c7', borderColor: '#fde68a' }]}>
                      <Text style={[styles.exploreBadgeText, { color: '#b45309' }]}>Showcase · Coming soon</Text>
                    </View>
                  </View>
                  <Text style={styles.exploreCardTitle}>Ghar Ka Khana & Mithai</Text>
                  <Text style={styles.exploreCardDesc}>
                    Homely Punjabi thalis, regional curries & traditional homemade sweets prepared fresh by local home chefs.
                  </Text>
                  <View style={styles.exploreCardFooter}>
                    <Text style={[styles.exploreActionText, { color: '#ea580c' }]}>Learn More</Text>
                    <Ionicons name="arrow-forward" size={14} color="#ea580c" />
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* 5. Real Ghar Ka Khana (Rendered only if actual home chefs exist) */}
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
                  const hasRating = Boolean(
                    v.rating &&
                    typeof v.rating === 'number' &&
                    v.rating > 0 &&
                    (v.numReviews > 0 || v.ratingCount > 0 || v.reviewsCount > 0)
                  );
                  return (
                    <TouchableOpacity
                      key={v._id}
                      style={[styles.homeChefCard, !isOpen && { opacity: 0.78 }]}
                      onPress={() => navigation.navigate('VendorStore', { vendor: v })}
                      activeOpacity={0.9}
                    >
                      <SafeImage
                        source={{ uri: isValidImageUri(v.banner) ? v.banner : null }}
                        style={[styles.homeChefImg, !isOpen && { opacity: 0.65 }]}
                        placeholderIcon="restaurant-outline"
                        placeholderIconSize={36}
                      />
                      <View style={styles.homeChefInfo}>
                        <View style={styles.vendorListTopRow}>
                          <Text style={styles.homeChefTitle}>{v.storeName}</Text>
                          {hasRating ? (
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

            {/* 6. Real Direct From Farms (Rendered only if actual farmers exist) */}
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

      {/* Sticky Bottom Cart Bar */}
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
    marginTop: 8,
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
    marginTop: 4,
    marginBottom: 12
  },
  promoCard: {
    borderRadius: 16,
    padding: 14,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#15803d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
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
    paddingVertical: 3,
    borderRadius: 20,
    marginBottom: 6
  },
  promoBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803d',
    letterSpacing: 0.4
  },
  promoTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3
  },
  promoSub: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.92)',
    marginTop: 3,
    lineHeight: 15
  },
  sectionContainer: {
    marginHorizontal: 16,
    marginBottom: 14
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  sectionHeading: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.2
  },
  sectionSubHeading: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1
  },
  seeAllText: {
    fontSize: 12.5,
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
    paddingVertical: 9,
    paddingHorizontal: 3,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: 'rgba(15, 23, 42, 0.04)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
    marginBottom: 4
  },
  catIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5
  },
  catIconText: {
    fontSize: 22
  },
  catName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    lineHeight: 14
  },
  storesSectionSurface: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 14,
    shadowColor: 'rgba(15, 23, 42, 0.03)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 1
  },
  singleStoreWrapper: {
    paddingHorizontal: 0
  },
  singleStoreCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#86efac',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2
  },
  singleStoreCardClosed: {
    borderColor: '#cbd5e1'
  },
  singleStoreImgContainer: {
    width: '100%',
    aspectRatio: 2.1,
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
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#16a34a',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  singleStoreRatingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff'
  },
  singleStoreInfo: {
    padding: 12
  },
  singleStoreTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  singleStoreName: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1,
    marginRight: 8
  },
  singleStoreTypeTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6
  },
  storeStatusPill: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  storeStatusPillText: {
    fontSize: 10.5,
    fontWeight: '800'
  },
  singleStoreDesc: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 4,
    lineHeight: 15
  },
  singleStoreMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8
  },
  singleStoreMetaItem: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600'
  },
  storeRail: {
    gap: 10
  },
  storeCard: {
    width: 200,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
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
    paddingVertical: 2,
    borderRadius: 6
  },
  storeRatingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff'
  },
  storeInfo: {
    padding: 10
  },
  storeName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a'
  },
  storePrepTime: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  storeStatus: {
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 4
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start'
  },
  productCol: {
    width: '48%',
    marginBottom: 4
  },
  singleProductCol: {
    width: '52%',
    maxWidth: 240,
    marginBottom: 4
  },
  exploreGrid: {
    gap: 10
  },
  exploreCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    shadowColor: 'rgba(15, 23, 42, 0.04)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 1
  },
  exploreCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  exploreIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center'
  },
  exploreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1
  },
  exploreBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2
  },
  exploreCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.2
  },
  exploreCardDesc: {
    fontSize: 12,
    color: '#475569',
    marginTop: 3,
    lineHeight: 16
  },
  exploreCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8
  },
  exploreActionText: {
    fontSize: 12,
    fontWeight: '700'
  },
  chefsSectionSurface: {
    backgroundColor: '#fff7ed',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#fed7aa',
    padding: 12,
    marginBottom: 14
  },
  chefBadgeRow: {
    flexDirection: 'row',
    marginBottom: 4
  },
  chefBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffedd5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  chefBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#c2410c'
  },
  homeChefCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#fed7aa',
    marginBottom: 10,
    flexDirection: 'row'
  },
  homeChefImg: {
    width: 90,
    height: 90,
    backgroundColor: '#f1f5f9'
  },
  homeChefInfo: {
    flex: 1,
    padding: 10,
    justifyContent: 'center'
  },
  homeChefTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a'
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
    marginTop: 4
  },
  farmsSectionSurface: {
    backgroundColor: '#f0fdf4',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    padding: 12,
    marginBottom: 14
  },
  farmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4
  },
  farmBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803d'
  },
  farmerGrid: {
    gap: 8
  },
  farmerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    flexDirection: 'row'
  },
  farmerImg: {
    width: 80,
    height: 80,
    backgroundColor: '#f1f5f9'
  },
  farmerInfo: {
    flex: 1,
    padding: 10,
    justifyContent: 'center'
  },
  farmerStoreName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a'
  },
  farmerOwner: {
    fontSize: 11,
    color: '#15803d',
    fontWeight: '700',
    marginTop: 2
  },
  farmerDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#b91c1c',
    fontWeight: '600'
  },
  errorRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
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
    paddingVertical: 16
  },
  initialLoadingText: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '600'
  },
  searchResultWrapper: {
    marginHorizontal: 16,
    marginTop: 6
  },
  searchResultHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 10,
    letterSpacing: 0.5
  },
  searchSubSectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8
  },
  noSearchCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 10
  },
  noSearchTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 10
  },
  noSearchSub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4
  },
  clearSearchBtn: {
    marginTop: 14,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  clearSearchBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
  },
  vendorListCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    shadowColor: 'rgba(15, 23, 42, 0.04)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1
  },
  vendorListImg: {
    width: 95,
    height: 95,
    backgroundColor: '#f1f5f9'
  },
  vendorListInfo: {
    flex: 1,
    padding: 10,
    justifyContent: 'center'
  },
  vendorListTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  vendorListTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1,
    marginRight: 6
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
  metaTag: {
    fontSize: 10.5,
    color: '#475569',
    fontWeight: '600'
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    backgroundColor: '#16a34a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5
  },
  ratingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff'
  },
  stickyCartBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#15803d',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#15803d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6
  },
  cartCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#86efac',
    letterSpacing: 0.5
  },
  cartTotalText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff'
  },
  viewCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16a34a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4ade80'
  },
  viewCartText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff'
  }
});
