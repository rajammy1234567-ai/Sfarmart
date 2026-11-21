import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { ShoppingFromBanner } from '../../components/ShoppingFromBanner';
import { CategoryChip } from '../../components/CategoryChip';
import { ProductCard } from '../../components/ProductCard';
import { ClearCartModal } from '../../components/ClearCartModal';
import { useCart } from '../../context/CartContext';
import { apiService } from '../../services/api';
import { colors } from '../../theme/colors';
import { getScrollBottomPadding } from '../../theme/layout';

const GAP = 12;

export const CatalogScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { conflictModal, confirmReplaceCart, cancelReplaceCart } = useCart();
  const initialCategory = route?.params?.category || route?.params?.selectedCategory || 'all';
  const initialSearch = route?.params?.search || '';
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState(initialCategory);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const requestSeqRef = useRef(0);
  const searchTimerRef = useRef(null);

  // Synchronize route params when navigated with category or search
  useEffect(() => {
    const nextCat = route?.params?.category || route?.params?.selectedCategory;
    if (nextCat && nextCat !== selectedCat) {
      setSelectedCat(nextCat);
    }
    if (route?.params?.search !== undefined && route.params.search !== searchQuery) {
      setSearchQuery(route.params.search || '');
      setDebouncedSearch(route.params.search || '');
    }
  }, [route?.params?.category, route?.params?.selectedCategory, route?.params?.search]);

  // Debounce search query input (300ms)
  const handleSearchChange = (text) => {
    setSearchQuery(text);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(text.trim());
    }, 300);
  };

  const handleClearSearch = () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSearchQuery('');
    setDebouncedSearch('');
  };

  // Load initial page (page 1) whenever category filter or debounced search changes
  useEffect(() => {
    loadInitialPage();
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [debouncedSearch, selectedCat]);

  const loadInitialPage = async () => {
    const seq = ++requestSeqRef.current;
    setIsLoading(true);
    setError(null);
    setLoadMoreError(null);

    try {
      const [prodRes, catRes] = await Promise.all([
        apiService.getProducts({
          page: 1,
          limit: 50,
          search: debouncedSearch || undefined,
          category: selectedCat !== 'all' ? selectedCat : undefined
        }),
        categories.length === 0 ? apiService.getCategories() : Promise.resolve(null)
      ]);

      if (seq !== requestSeqRef.current) return; // Drop stale response

      if (catRes && catRes.success && Array.isArray(catRes.categories)) {
        setCategories(catRes.categories);
      }

      if (prodRes && prodRes.success && Array.isArray(prodRes.products)) {
        setProducts(prodRes.products);
        setPage(1);
        setTotalCount(typeof prodRes.total === 'number' ? prodRes.total : prodRes.products.length);
        setHasMore(Boolean(prodRes.hasMore));
      } else if (Array.isArray(prodRes)) {
        setProducts(prodRes);
        setPage(1);
        setTotalCount(prodRes.length);
        setHasMore(false);
      } else {
        setProducts([]);
        setTotalCount(0);
        setHasMore(false);
      }
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      console.warn('Failed to load catalog products:', err);
      setError('Could not load products. Please check connection.');
    } finally {
      if (seq === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  };

  // Infinite scroll: fetch next 50 products near bottom
  const handleLoadMore = async () => {
    if (!hasMore || isLoadingMore || isLoading || isRefreshing) return;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    const nextPage = page + 1;
    const seq = requestSeqRef.current;

    try {
      const res = await apiService.getProducts({
        page: nextPage,
        limit: 50,
        search: debouncedSearch || undefined,
        category: selectedCat !== 'all' ? selectedCat : undefined
      });

      if (seq !== requestSeqRef.current) return;

      if (res && res.success && Array.isArray(res.products)) {
        setProducts((prev) => {
          const map = new Map();
          prev.forEach((p) => map.set(p._id || p.id, p));
          res.products.forEach((p) => map.set(p._id || p.id, p));
          return Array.from(map.values());
        });
        setPage(nextPage);
        setHasMore(Boolean(res.hasMore));
        if (typeof res.total === 'number') setTotalCount(res.total);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      console.warn('Failed to load more products:', err);
      setLoadMoreError('Could not load more items. Tap to retry.');
    } finally {
      if (seq === requestSeqRef.current) {
        setIsLoadingMore(false);
      }
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadInitialPage();
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderFooter = () => {
    if (isLoadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.footerLoaderText}>Loading next 50 items...</Text>
        </View>
      );
    }
    if (loadMoreError) {
      return (
        <TouchableOpacity onPress={handleLoadMore} style={styles.retryFooterBtn} activeOpacity={0.8}>
          <Ionicons name="refresh" size={16} color={colors.primary} />
          <Text style={styles.retryFooterText}>{loadMoreError}</Text>
        </TouchableOpacity>
      );
    }
    if (!hasMore && products.length > 0) {
      return (
        <View style={styles.footerEnded}>
          <Text style={styles.footerEndedText}>All {products.length} products loaded</Text>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <Header navigation={navigation} title="Marketplace" />
      <ShoppingFromBanner navigation={navigation} />

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.primary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search produce, dairy, bakery..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={handleSearchChange}
          returnKeyType="search"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={handleClearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons
              name="close-circle"
              size={18}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>

      {categories && categories.length > 0 && (
        <CategoryChip
          categories={categories}
          selectedCategory={selectedCat}
          onSelectCategory={(cat) => {
            setSelectedCat(cat);
          }}
        />
      )}

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {totalCount > 0 ? `${totalCount} items available` : `${products.length} items available`}
          {debouncedSearch ? ` for "${debouncedSearch}"` : ''}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading fresh products...</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadInitialPage}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          style={styles.flatList}
          data={products}
          keyExtractor={(item) => item._id || item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[
            styles.listContainer,
            { paddingBottom: getScrollBottomPadding(insets, false) }
          ]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          ListFooterComponent={renderFooter}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <ProductCard 
                product={item} 
                compact 
                onPress={() => navigation.navigate('ProductDetails', { product: item })}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="basket-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>No items found</Text>
              <Text style={styles.emptySub}>Try another category or search term</Text>
            </View>
          }
        />
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
    backgroundColor: colors.background
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
    padding: 0
  },
  countRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 4
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary
  },
  flatList: {
    flex: 1
  },
  listContainer: {
    paddingHorizontal: 16
  },
  row: {
    gap: GAP,
    marginBottom: GAP
  },
  cardWrap: {
    flex: 1,
    maxWidth: '48.5%',
    minWidth: 0
  },
  loadingContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: colors.textSecondary
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 10
  },
  emptySub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: 8
  },
  retryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  }
});
