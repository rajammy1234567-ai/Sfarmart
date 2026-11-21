import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Dimensions,
  Animated,
  AccessibilityInfo
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
import { SafeImage, isValidImageUri, resolveMediaUrl } from '../../components/common/SafeImage';
import { resolveBrowseCategories } from '../../config/categories';
import { getScrollBottomPadding, getStickyCartBottom } from '../../theme/layout';
import { useApp } from '../../context/AppContext';
import storage from '../../services/storage';
import { distanceKm, validCoordinates } from '../../utils/trackingUtils';

/**
 * CategoryGridTile – 3D Quick-Commerce Category Card
 * Features:
 * - Rounded white card with layered bottom edge and subtle shadow
 * - Curved pastel color accent at bottom (per category)
 * - Large centered soft 3D product illustration (contain)
 * - Small circular arrow badge at bottom-right
 * - Bold dark real text label
 * - Gentle press bounce animation respecting reduced motion
 */
const CategoryGridTile = React.memo(({ cat, isSelected, onPress, reduceMotion }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!reduceMotion) {
      Animated.spring(scaleAnim, {
        toValue: 0.93,
        friction: 8,
        tension: 100,
        useNativeDriver: Platform.OS !== 'web'
      }).start();
    }
  };

  const handlePressOut = () => {
    if (!reduceMotion) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 120,
        useNativeDriver: Platform.OS !== 'web'
      }).start();
    }
  };

  const resolvedUri = cat.image ? resolveMediaUrl(cat.image) : null;
  const imageSource = (resolvedUri && isValidImageUri(resolvedUri))
    ? (typeof resolvedUri === 'number' ? resolvedUri : { uri: resolvedUri })
    : null;

  return (
    <Animated.View
      style={[
        styles.categoryGridCol,
        { transform: [{ scale: scaleAnim }] }
      ]}
    >
      <TouchableOpacity
        style={styles.categoryTileTouch}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={`${cat.name} category tile`}
        testID={`category-grid-tile-${cat.slug || cat._id}`}
      >
        <View
          style={[
            styles.categoryCardWhite,
            cat.borderColor ? { borderColor: cat.borderColor } : null,
            isSelected && styles.categoryCardActive
          ]}
        >
          {/* Curved Pastel Bottom Accent */}
          <View
            style={[
              styles.curvedBottomAccent,
              { backgroundColor: cat.curvedAccentColor || cat.bgColor || '#dcfce7' },
              isSelected && { opacity: 1 }
            ]}
          />

          {/* Large Centred Soft 3D Illustration */}
          <View style={styles.category3DImageContainer}>
            {imageSource ? (
              <SafeImage
                source={imageSource}
                style={styles.category3DImage}
                resizeMode="contain"
                placeholderBg="transparent"
                placeholderIcon={cat.vectorIcon || 'leaf-outline'}
                placeholderIconSize={26}
              />
            ) : cat.vectorIcon ? (
              <View style={styles.categoryIconFallback}>
                <Ionicons
                  name={cat.vectorIcon}
                  size={26}
                  color={cat.accentColor || '#16a34a'}
                />
              </View>
            ) : (
              <View style={styles.categoryIconFallback}>
                <Text style={styles.categoryIconEmoji}>{cat.icon || '🥦'}</Text>
              </View>
            )}
          </View>

          {/* Small Circular Arrow Badge */}
          <View
            style={[
              styles.cardArrowCircle,
              isSelected && styles.cardArrowCircleActive
            ]}
          >
            <Ionicons
              name="chevron-forward"
              size={9}
              color={isSelected ? '#ffffff' : (cat.accentColor || '#475569')}
            />
          </View>
        </View>

        {/* Bold Dark Real Text Label */}
        <Text
          style={[
            styles.categoryLabelDark,
            isSelected && styles.categoryLabelActive
          ]}
          numberOfLines={2}
        >
          {cat.shortName || cat.name}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// Filter available products (exclude controlled test shop and unpublished items)
const filterEligibleProducts = (rawProducts) => {
  if (!Array.isArray(rawProducts)) return [];
  return rawProducts.filter((p) => {
    if (!p) return false;
    if (p.isActive === false || p.isPublished === false) return false;
    const v = p.vendor;
    if (!v) return false;
    if (v.isActive === false || v.isApproved === false) return false;
    const vId = (v._id || v.id || String(v || '')).toString();
    if (vId === '6aea07db1cf98f83bee27ee4') return false;
    if (v.storeName?.toLowerCase().includes('controlled verification')) return false;
    return true;
  });
};

export const HomeScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [categories, setCategories] = useState(() => resolveBrowseCategories([]));
  const [vendors, setVendors] = useState([]);
  const [banners, setBanners] = useState([]);
  const [homeSections, setHomeSections] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('default');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiError, setApiError] = useState(null);

  // Paginated 2-column vertical feed states
  const [feedProducts, setFeedProducts] = useState([]);
  const [feedPage, setFeedPage] = useState(1);
  const [hasMoreFeed, setHasMoreFeed] = useState(false);
  const [feedTotal, setFeedTotal] = useState(0);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [isLoadingMoreFeed, setIsLoadingMoreFeed] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(null);

  const searchTimerRef = useRef(null);
  const feedSeqRef = useRef(0);
  const isLoadingMoreRef = useRef(false);

  const {
    billSummary,
    conflictModal,
    confirmReplaceCart,
    cancelReplaceCart
  } = useCart();

  const { userProfile } = useApp();
  const [customerLocation, setCustomerLocation] = useState(null);

  useEffect(() => {
    if (route?.params?.selectedCategory) {
      setSelectedCategory(route.params.selectedCategory);
    }
  }, [route?.params?.selectedCategory]);

  useEffect(() => {
    let isMounted = true;
    const resolveLocation = async () => {
      if (userProfile?.lat && userProfile?.lng && validCoordinates(userProfile.lat, userProfile.lng)) {
        if (isMounted) setCustomerLocation({ lat: userProfile.lat, lng: userProfile.lng });
        return;
      }
      try {
        const raw = await storage.getItem('farmart_user_location');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (validCoordinates(parsed.lat, parsed.lng)) {
            if (isMounted) setCustomerLocation({ lat: parsed.lat, lng: parsed.lng });
            return;
          }
        }
      } catch (_) {}
      if (isMounted) setCustomerLocation(null);
    };
    resolveLocation();
    return () => { isMounted = false; };
  }, [userProfile?.lat, userProfile?.lng, userProfile?.address]);

  useEffect(() => {
    let isMounted = true;
    if (AccessibilityInfo?.isReduceMotionEnabled) {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((enabled) => { if (isMounted) setReduceMotion(Boolean(enabled)); })
        .catch(() => {});
    }
    const sub = AccessibilityInfo?.addEventListener
      ? AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
          if (isMounted) setReduceMotion(Boolean(enabled));
        })
      : null;
    return () => {
      isMounted = false;
      if (sub?.remove) sub.remove();
    };
  }, []);

  // Server-side search debounce (300ms)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = searchQuery.trim();
    if (!q) {
      setDebouncedSearch('');
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(q);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // Load Home metadata (categories, active vendors, merchandising banners, curated rails)
  const loadHomeMetadata = useCallback(async (isPullToRefresh = false) => {
    try {
      const [catResult, vendResult, banResult, secResult] = await Promise.allSettled([
        apiService.getHomeCategories(),
        apiService.getVendors(),
        apiService.getBanners ? apiService.getBanners() : Promise.resolve({ success: true, banners: [] }),
        apiService.getHomeSections ? apiService.getHomeSections() : Promise.resolve({ success: true, sections: [] })
      ]);

      const catRes = catResult.status === 'fulfilled' ? catResult.value : null;
      const vendRes = vendResult.status === 'fulfilled' ? vendResult.value : null;
      const banRes = banResult.status === 'fulfilled' ? banResult.value : null;
      const secRes = secResult.status === 'fulfilled' ? secResult.value : null;

      let catFetchSucceeded = false;

      if (catRes && catRes.success && Array.isArray(catRes.categories)) {
        catFetchSucceeded = true;
        setCategories(resolveBrowseCategories(catRes.categories));
      }

      if (vendRes && vendRes.success && Array.isArray(vendRes.vendors)) {
        setVendors(vendRes.vendors);
      }

      if (banRes && banRes.success && Array.isArray(banRes.banners)) {
        setBanners(banRes.banners);
      } else {
        setBanners([]);
      }

      if (secRes && secRes.success && Array.isArray(secRes.sections)) {
        setHomeSections(secRes.sections);
      } else {
        setHomeSections([]);
      }

      if (!catFetchSucceeded) {
        setApiError('Unable to sync latest live catalog. Tap to retry.');
      } else {
        setApiError(null);
      }
    } catch (err) {
      console.warn('HomeScreen loadHomeMetadata error:', err);
      setApiError('Unable to load produce. Tap to retry.');
    }
  }, []);

  // Load initial page (first 50 products) of the vertical feed
  const loadFeedInitial = useCallback(
    async ({
      search = debouncedSearch,
      category = selectedCategory,
      sort = sortBy,
      isPullToRefresh = false
    } = {}) => {
      const seq = ++feedSeqRef.current;
      if (!isPullToRefresh) {
        setIsLoadingFeed(true);
      }
      setLoadMoreError(null);
      setApiError(null);

      try {
        const params = {
          page: 1,
          limit: 50,
          inStockOnly: 'true'
        };
        if (search && search.trim()) params.search = search.trim();
        if (category && category !== 'all') params.category = category;
        if (sort && sort !== 'default') params.sort = sort;

        const res = await apiService.getProducts(params);

        if (seq !== feedSeqRef.current) return; // Drop stale response

        if (res && res.success && Array.isArray(res.products)) {
          const eligible = filterEligibleProducts(res.products);
          const map = new Map();
          eligible.forEach((p) => {
            const key = p._id || p.id;
            if (key) map.set(String(key), p);
          });
          const deduped = Array.from(map.values());
          setFeedProducts(deduped);
          setFeedPage(1);
          setHasMoreFeed(Boolean(res.hasMore));
          setFeedTotal(typeof res.total === 'number' ? res.total : deduped.length);
        } else if (Array.isArray(res)) {
          const eligible = filterEligibleProducts(res);
          setFeedProducts(eligible);
          setFeedPage(1);
          setHasMoreFeed(false);
          setFeedTotal(eligible.length);
        } else {
          setFeedProducts([]);
          setFeedTotal(0);
          setHasMoreFeed(false);
        }
      } catch (err) {
        if (seq !== feedSeqRef.current) return;
        console.warn('HomeScreen loadFeedInitial error:', err);
        setApiError('Unable to load produce. Tap to retry.');
      } finally {
        if (seq === feedSeqRef.current) {
          setIsLoadingFeed(false);
        }
      }
    },
    [debouncedSearch, selectedCategory, sortBy]
  );

  // Load next 50 products on end reached (virtualized infinite scroll)
  const handleLoadMoreFeed = useCallback(async () => {
    if (!hasMoreFeed || isLoadingMoreRef.current || isLoadingFeed || isRefreshing) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMoreFeed(true);
    setLoadMoreError(null);

    const nextPage = feedPage + 1;
    const seq = feedSeqRef.current;

    try {
      const params = {
        page: nextPage,
        limit: 50,
        inStockOnly: 'true'
      };
      if (debouncedSearch && debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (selectedCategory && selectedCategory !== 'all') params.category = selectedCategory;
      if (sortBy && sortBy !== 'default') params.sort = sortBy;

      const res = await apiService.getProducts(params);

      if (seq !== feedSeqRef.current) return;

      if (res && res.success && Array.isArray(res.products)) {
        const eligible = filterEligibleProducts(res.products);
        setFeedProducts((prev) => {
          const map = new Map();
          prev.forEach((p) => {
            const key = p._id || p.id;
            if (key) map.set(String(key), p);
          });
          eligible.forEach((p) => {
            const key = p._id || p.id;
            if (key) map.set(String(key), p);
          });
          return Array.from(map.values());
        });
        setFeedPage(nextPage);
        setHasMoreFeed(Boolean(res.hasMore));
        if (typeof res.total === 'number') setFeedTotal(res.total);
      } else {
        setHasMoreFeed(false);
      }
    } catch (err) {
      if (seq !== feedSeqRef.current) return;
      console.warn('HomeScreen handleLoadMoreFeed error:', err);
      setLoadMoreError('Could not load more items. Tap to retry.');
    } finally {
      if (seq === feedSeqRef.current) {
        setIsLoadingMoreFeed(false);
        isLoadingMoreRef.current = false;
      }
    }
  }, [hasMoreFeed, isLoadingFeed, isRefreshing, feedPage, debouncedSearch, selectedCategory, sortBy]);

  // Initial metadata sync on mount
  useEffect(() => {
    loadHomeMetadata(false);
  }, [loadHomeMetadata]);

  // Reactively fetch page 1 whenever search, category, or sort changes
  useEffect(() => {
    loadFeedInitial({
      search: debouncedSearch,
      category: selectedCategory,
      sort: sortBy
    });
  }, [debouncedSearch, selectedCategory, sortBy, loadFeedInitial]);

  // Pull-to-refresh handler (syncs metadata and resets feed to page 1)
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        loadHomeMetadata(true),
        loadFeedInitial({
          search: debouncedSearch,
          category: selectedCategory,
          sort: sortBy,
          isPullToRefresh: true
        })
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadHomeMetadata, loadFeedInitial, debouncedSearch, selectedCategory, sortBy]);

  const isSearching = searchQuery.trim().length > 0;

  // Filter out inactive/unapproved and controlled test vendors
  const filteredVendors = vendors.filter((v) => {
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
  });

  const filteredCategories = categories.filter((c) => {
    if (!isSearching) return true;
    const q = searchQuery.toLowerCase().trim();
    return c.name?.toLowerCase().includes(q) || c.slug?.toLowerCase().includes(q);
  });

  // Client sort memoization for immediate responsiveness
  const sortedFeedProducts = useMemo(() => {
    if (sortBy === 'price_low') {
      return [...feedProducts].sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    }
    if (sortBy === 'price_high') {
      return [...feedProducts].sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    }
    return feedProducts;
  }, [feedProducts, sortBy]);

  const hasActiveCart = Boolean(billSummary && billSummary.totalCount > 0);
  const scrollPaddingBottom = getScrollBottomPadding(insets, hasActiveCart);
  const stickyCartBottom = getStickyCartBottom(insets);

  const handleBannerPress = (banner) => {
    if (!banner) return;
    if (banner.linkType === 'CATEGORY' && banner.linkTarget) {
      setSelectedCategory(banner.linkTarget);
    } else if (banner.linkType === 'PRODUCT' && banner.linkTarget) {
      const targetProduct = feedProducts.find(
        (p) => (p._id || p.id || '').toString() === banner.linkTarget.toString()
      );
      if (targetProduct) {
        navigation.navigate('ProductDetails', { product: targetProduct });
      } else {
        navigation.navigate('ProductDetails', { productId: banner.linkTarget });
      }
    }
  };

  const renderProductItem = useCallback(
    ({ item }) => {
      return (
        <View style={styles.cardWrap}>
          <ProductCard
            product={item}
            compact={true}
            onPress={() => navigation.navigate('ProductDetails', { product: item })}
          />
        </View>
      );
    },
    [navigation]
  );

  const renderHeader = () => {
    return (
      <View>
        {/* Prominent Blinkit-Style Search Bar */}
        <View style={styles.searchSection}>
          <Ionicons name="search" size={19} color="#16a34a" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search grocery, vegetables, milk, snacks..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            accessibilityLabel="Search products and categories"
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

        {/* Dynamic Server-Side Search View vs Normal Browse Header */}
        {isSearching ? (
          <View style={styles.searchResultWrapper}>
            <View style={styles.searchResultHeaderRow}>
              <Text style={styles.searchResultHeader}>
                MATCHING PRODUCTS ({feedTotal || sortedFeedProducts.length})
              </Text>
              {sortedFeedProducts.length > 0 && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('Catalog', { search: debouncedSearch })}
                >
                  <Text style={styles.seeAllText}>See all in Catalog →</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Matching Stores if query matches merchant name */}
            {filteredVendors.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.searchSubSectionHeader}>Matching Merchant Stores</Text>
                {filteredVendors.map((v) => (
                  <TouchableOpacity
                    key={v._id}
                    style={styles.vendorSearchCard}
                    onPress={() => navigation.navigate('VendorStore', { vendor: v })}
                    activeOpacity={0.9}
                  >
                    <SafeImage
                      source={{ uri: isValidImageUri(v.banner) ? v.banner : null }}
                      style={styles.vendorSearchImg}
                      placeholderIcon="storefront-outline"
                      placeholderIconSize={28}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vendorSearchTitle} numberOfLines={1}>{v.storeName}</Text>
                      <Text style={styles.vendorSearchSub} numberOfLines={1}>{v.address?.city || 'Local Store'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : (
          <>
            {/* Horizontal Category Navigation Tabs Bar */}
            {filteredCategories.length > 0 && (
              <View style={styles.categoryTabsWrapper}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryTabsContent}
                >
                  <TouchableOpacity
                    style={[
                      styles.categoryTabChip,
                      selectedCategory === 'all' && styles.categoryTabChipActive
                    ]}
                    onPress={() => setSelectedCategory('all')}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="All categories"
                  >
                    <Ionicons
                      name="grid-outline"
                      size={13}
                      color={selectedCategory === 'all' ? '#ffffff' : '#16a34a'}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.categoryTabChipText,
                        selectedCategory === 'all' && styles.categoryTabChipTextActive
                      ]}
                    >
                      All
                    </Text>
                  </TouchableOpacity>

                  {filteredCategories.map((cat, idx) => {
                    const catIdentifier = cat.slug || cat._id || cat.key || String(idx);
                    const isSelected = selectedCategory === catIdentifier || selectedCategory === cat.slug;
                    return (
                      <TouchableOpacity
                        key={String(cat._id || cat.slug || idx)}
                        style={[
                          styles.categoryTabChip,
                          isSelected && styles.categoryTabChipActive
                        ]}
                        onPress={() => {
                          setSelectedCategory(isSelected ? 'all' : (cat.slug || catIdentifier));
                        }}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`${cat.name} category`}
                      >
                        {cat.vectorIcon ? (
                          <Ionicons
                            name={cat.vectorIcon}
                            size={13}
                            color={isSelected ? '#ffffff' : (cat.accentColor || '#16a34a')}
                            style={{ marginRight: 4 }}
                          />
                        ) : (
                          <Text style={{ fontSize: 12, marginRight: 4 }}>{cat.icon || '🥦'}</Text>
                        )}
                        <Text
                          style={[
                            styles.categoryTabChipText,
                            isSelected && styles.categoryTabChipTextActive
                          ]}
                        >
                          {cat.shortName || cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Active Category Filter Tag Banner */}
            {selectedCategory !== 'all' && (
              <View style={styles.filterActiveBar}>
                <View style={styles.filterActiveInfo}>
                  <Ionicons name="funnel" size={12} color="#15803d" />
                  <Text style={styles.filterActiveText}>
                    Filtered: {
                      categories.find(c => c.slug === selectedCategory || c._id === selectedCategory || c.key === selectedCategory)?.name ||
                      selectedCategory
                    } ({feedTotal || sortedFeedProducts.length} product{sortedFeedProducts.length === 1 ? '' : 's'})
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedCategory('all')}
                  style={styles.filterClearBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={13} color="#b91c1c" />
                  <Text style={styles.filterClearText}>Reset</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Retryable Error Banner on API Failure */}
            {apiError && (
              <TouchableOpacity
                style={styles.errorBanner}
                onPress={() => {
                  loadHomeMetadata(false);
                  loadFeedInitial({ search: debouncedSearch, category: selectedCategory, sort: sortBy });
                }}
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

            {/* 1. Merchandising Banners Carousel */}
            {banners.length > 0 && (
              <View style={styles.bannerCarouselContainer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.bannerTrack}
                >
                  {banners.map((ban) => (
                    <TouchableOpacity
                      key={ban._id}
                      style={styles.bannerCard}
                      activeOpacity={0.9}
                      onPress={() => handleBannerPress(ban)}
                    >
                      <SafeImage
                        source={{ uri: ban.imageUrl }}
                        style={styles.bannerImg}
                        resizeMode="cover"
                        placeholderIcon="image-outline"
                        placeholderIconSize={32}
                      />
                      {(ban.title || ban.subtitle) && (
                        <LinearGradient
                          colors={['transparent', 'rgba(15, 23, 42, 0.72)']}
                          style={styles.bannerGradient}
                        >
                          {ban.title ? <Text style={styles.bannerTitle} numberOfLines={1}>{ban.title}</Text> : null}
                          {ban.subtitle ? <Text style={styles.bannerSub} numberOfLines={1}>{ban.subtitle}</Text> : null}
                        </LinearGradient>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 2. Admin-Controlled 3D Category Grid (Soft 3D Claymorphic Blinkit Style) */}
            {filteredCategories.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <Text style={styles.sectionHeading}>Shop By Category</Text>
                    <Text style={styles.sectionSubHeading}>Explore fresh grocery & daily essentials</Text>
                  </View>
                  <TouchableOpacity onPress={() => navigation.navigate('Catalog')}>
                    <Text style={styles.seeAllText}>See Catalog →</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.blinkitCategoryGrid}>
                  {filteredCategories.slice(0, 8).map((cat, idx) => {
                    const isSelected = selectedCategory === (cat.slug || cat._id || cat.name);
                    return (
                      <CategoryGridTile
                        key={String(cat._id || cat.slug || idx)}
                        cat={cat}
                        isSelected={isSelected}
                        reduceMotion={reduceMotion}
                        onPress={() => {
                          setSelectedCategory(isSelected ? 'all' : (cat.slug || cat._id || cat.name));
                        }}
                      />
                    );
                  })}
                </View>
              </View>
            )}

            {/* 3. Curated Product Sections (Promotional Rails from Backend - visible when browsing all categories) */}
            {selectedCategory === 'all' && homeSections.length > 0 && (
              homeSections.map((sec) => {
                if (!sec.products || sec.products.length === 0) return null;
                const secCatSlug = sec.category?.slug || sec.category?._id || sec.category?.name || sec.category || sec.title;
                return (
                  <View key={sec._id} style={styles.sectionContainer}>
                    <View style={styles.sectionHeaderRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.sectionHeading}>{sec.title}</Text>
                        {sec.subtitle ? (
                          <Text style={styles.sectionSubHeading}>{sec.subtitle}</Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          navigation.navigate('Catalog', {
                            category: secCatSlug
                          });
                        }}
                      >
                        <Text style={styles.seeAllText}>View All →</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Horizontal rail for Blinkit quick-browse feel */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.horizontalProductRail}
                    >
                      {sec.products.map((p) => (
                        <View key={p._id || p.id} style={styles.railProductCardWrap}>
                          <ProductCard
                            product={p}
                            compact={true}
                            onPress={() => navigation.navigate('ProductDetails', { product: p })}
                          />
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                );
              })
            )}

            {/* 4. Section Heading for the 2-Column Vertical Feed */}
            <View style={styles.feedHeaderRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.sectionHeading}>
                  {selectedCategory === 'all'
                    ? 'Explore Catalog'
                    : (categories.find(c => c.slug === selectedCategory || c._id === selectedCategory || c.key === selectedCategory)?.name || 'Category Products')
                  }
                </Text>
                <Text style={styles.sectionSubHeading}>
                  {selectedCategory === 'all'
                    ? `All available items direct from local farms & merchants (${feedTotal || sortedFeedProducts.length})`
                    : `${feedTotal || sortedFeedProducts.length} items available`
                  }
                </Text>
              </View>
              <View style={styles.sortPillGroup}>
                <TouchableOpacity
                  style={[styles.sortPill, sortBy === 'price_low' && styles.sortPillActive]}
                  onPress={() => setSortBy(sortBy === 'price_low' ? 'default' : 'price_low')}
                >
                  <Text style={[styles.sortPillText, sortBy === 'price_low' && styles.sortPillTextActive]}>₹ Low</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sortPill, sortBy === 'price_high' && styles.sortPillActive]}
                  onPress={() => setSortBy(sortBy === 'price_high' ? 'default' : 'price_high')}
                >
                  <Text style={[styles.sortPillText, sortBy === 'price_high' && styles.sortPillTextActive]}>₹ High</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </View>
    );
  };

  const renderFooter = () => {
    if (isLoadingMoreFeed) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#16a34a" />
          <Text style={styles.footerLoaderText}>Loading next 50 items...</Text>
        </View>
      );
    }
    if (loadMoreError) {
      return (
        <TouchableOpacity
          style={styles.retryFooterBtn}
          onPress={handleLoadMoreFeed}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh" size={14} color="#16a34a" />
          <Text style={styles.retryFooterText}>{loadMoreError}</Text>
        </TouchableOpacity>
      );
    }
    if (!hasMoreFeed && sortedFeedProducts.length > 0) {
      return (
        <View style={styles.footerEnded}>
          <Ionicons name="checkmark-circle-outline" size={15} color="#16a34a" style={{ marginRight: 5 }} />
          <Text style={styles.footerEndedText}>All {sortedFeedProducts.length} items loaded</Text>
        </View>
      );
    }
    return null;
  };

  const renderEmpty = () => {
    if (isLoadingFeed && !isRefreshing) {
      return (
        <View style={styles.initialLoadingContainer}>
          <ActivityIndicator size="small" color="#16a34a" />
          <Text style={styles.initialLoadingText}>
            {isSearching ? 'Searching catalog on server...' : 'Loading fresh inventory...'}
          </Text>
        </View>
      );
    }
    if (isSearching) {
      return (
        <View style={styles.noSearchCard}>
          <Ionicons name="search-outline" size={40} color="#94a3b8" />
          <Text style={styles.noSearchTitle}>No matching products</Text>
          <Text style={styles.noSearchSub}>
            Try searching with keywords like "Fresh", "Milk", "Ghee", "Kheel", or "Rice"
          </Text>
          <TouchableOpacity style={styles.clearSearchBtn} onPress={() => setSearchQuery('')}>
            <Text style={styles.clearSearchBtnText}>Clear Search</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (selectedCategory !== 'all') {
      return (
        <View style={styles.honestEmptyBox}>
          <Ionicons name="cube-outline" size={36} color="#94a3b8" />
          <Text style={styles.honestEmptyTitle}>No items currently in this category</Text>
          <Text style={styles.honestEmptySub}>Tap All above to browse all products.</Text>
          <TouchableOpacity
            style={styles.filterResetInlineBtn}
            onPress={() => setSelectedCategory('all')}
          >
            <Text style={styles.filterResetInlineBtnText}>Show All Products</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.honestEmptyBox}>
        <Ionicons name="cart-outline" size={36} color="#94a3b8" />
        <Text style={styles.honestEmptyTitle}>No products currently available</Text>
        <Text style={styles.honestEmptySub}>Products added by partners will display here.</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header navigation={navigation} />
      <ShoppingFromBanner navigation={navigation} />

      {/* Single vertically virtualized container for entire Home */}
      <FlatList
        data={sortedFeedProducts}
        keyExtractor={(item) => String(item._id || item.id)}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: scrollPaddingBottom }
        ]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        onEndReached={handleLoadMoreFeed}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={renderHeader}
        renderItem={renderProductItem}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
      />

      {/* Sticky Bottom Cart Bar */}
      {hasActiveCart && (
        <View style={[styles.stickyCartBar, { bottom: stickyCartBottom }]}>
          <View>
            <Text style={styles.cartCountText}>{billSummary.totalCount} ITEM{billSummary.totalCount === 1 ? '' : 'S'}</Text>
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
  categoryTabsWrapper: {
    marginVertical: 4,
    paddingHorizontal: 0
  },
  categoryTabsContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  categoryTabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: 'rgba(15, 23, 42, 0.04)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1
  },
  categoryTabChipActive: {
    backgroundColor: '#16a34a',
    borderColor: '#15803d',
    shadowColor: '#16a34a',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2
  },
  categoryTabChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155'
  },
  categoryTabChipTextActive: {
    color: '#ffffff',
    fontWeight: '800'
  },
  filterActiveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#dcfce7',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  filterActiveInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1
  },
  filterActiveText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803d',
    flex: 1
  },
  filterClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  filterClearText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b91c1c'
  },
  filterResetInlineBtn: {
    marginTop: 10,
    alignSelf: 'center',
    backgroundColor: '#16a34a',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8
  },
  filterResetInlineBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff'
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 10,
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8
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
    gap: 3,
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
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  initialLoadingText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500'
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
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1
  },
  seeAllText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#15803d'
  },
  sortPillGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 2
  },
  sortPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10
  },
  sortPillActive: {
    backgroundColor: '#16a34a'
  },
  sortPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b'
  },
  sortPillTextActive: {
    color: '#ffffff'
  },
  // Refined 4-Column Category Grid (Soft 3D Claymorphic Blinkit Style)
  blinkitCategoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12
  },
  categoryGridCol: {
    width: '23%',
    alignItems: 'center',
    marginBottom: 4
  },
  categoryTileTouch: {
    width: '100%',
    alignItems: 'center'
  },
  categoryCardWhite: {
    width: '100%',
    aspectRatio: 1.0,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e8edf2',
    borderBottomWidth: 3,
    borderBottomColor: '#d1d9e2',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2
  },
  categoryCardActive: {
    borderColor: '#16a34a',
    borderBottomColor: '#15803d',
    borderBottomWidth: 3.5,
    backgroundColor: '#ffffff',
    shadowColor: 'rgba(22, 163, 74, 0.28)',
    shadowRadius: 6,
    elevation: 3
  },
  curvedBottomAccent: {
    position: 'absolute',
    bottom: -4,
    left: -4,
    right: -4,
    height: '34%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    opacity: 0.82,
    zIndex: 1
  },
  category3DImageContainer: {
    width: '84%',
    height: '84%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2
  },
  category3DImage: {
    width: '100%',
    height: '100%'
  },
  categoryIconFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center'
  },
  categoryIconEmoji: {
    fontSize: 28
  },
  cardArrowCircle: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
    borderWidth: 0.8,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
    elevation: 1
  },
  cardArrowCircleActive: {
    backgroundColor: '#16a34a',
    borderColor: '#15803d'
  },
  categoryLabelDark: {
    fontSize: Dimensions.get('window').width < 380 ? 10.5 : 11,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    lineHeight: Dimensions.get('window').width < 380 ? 13 : 14.5,
    marginTop: 6,
    minHeight: 28
  },
  categoryLabelActive: {
    color: '#15803d',
    fontWeight: '900'
  },
  // Banners
  bannerCarouselContainer: {
    marginVertical: 8
  },
  bannerTrack: {
    paddingHorizontal: 16,
    gap: 12
  },
  bannerCard: {
    width: Dimensions.get('window').width > 420 ? 340 : Dimensions.get('window').width - 48,
    height: 140,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    position: 'relative',
    shadowColor: 'rgba(0, 0, 0, 0.08)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2
  },
  bannerImg: {
    width: '100%',
    height: '100%'
  },
  bannerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff'
  },
  bannerSub: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: 2
  },
  // Horizontal Product Rail (Blinkit style)
  horizontalProductRail: {
    gap: 10,
    paddingVertical: 4
  },
  railProductCardWrap: {
    width: 154
  },
  // 2-Column Product Grid
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
  columnWrapper: {
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 10
  },
  cardWrap: {
    flex: 1,
    maxWidth: '48.5%',
    minWidth: 0
  },
  feedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 6
  },
  searchResultHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  footerLoaderText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600'
  },
  retryFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginHorizontal: 16,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    marginBottom: 12
  },
  retryFooterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a'
  },
  footerEnded: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16
  },
  footerEndedText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600'
  },
  // Honest Empty State
  honestEmptyBox: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6
  },
  honestEmptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 4
  },
  honestEmptySub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 16
  },
  // Search Results
  searchResultWrapper: {
    paddingHorizontal: 16,
    marginTop: 6
  },
  searchResultHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.6,
    marginBottom: 12
  },
  searchSubSectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8
  },
  noSearchCard: {
    alignItems: 'center',
    paddingVertical: 36,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 20
  },
  noSearchTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 10
  },
  noSearchSub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16
  },
  clearSearchBtn: {
    marginTop: 14,
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  clearSearchBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff'
  },
  vendorSearchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    gap: 10
  },
  vendorSearchImg: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#f1f5f9'
  },
  vendorSearchTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0f172a'
  },
  vendorSearchSub: {
    fontSize: 11.5,
    color: '#64748b'
  },
  // Sticky Bottom Cart Bar
  stickyCartBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#15803d',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#15803d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 100
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
    paddingVertical: 8,
    paddingHorizontal: 14,
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
