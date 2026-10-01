import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { ShoppingFromBanner } from '../../components/ShoppingFromBanner';
import { CategoryChip } from '../../components/CategoryChip';
import { ProductCard } from '../../components/ProductCard';
import { ClearCartModal } from '../../components/ClearCartModal';
import { useCart } from '../../context/CartContext';
import { apiService } from '../../services/api';
import { colors } from '../../theme/colors';

const { width } = Dimensions.get('window');
const GAP = 10;
const CARD_WIDTH = (width - 32 - GAP) / 2;

export const CatalogScreen = ({ navigation }) => {
  const { conflictModal, confirmReplaceCart, cancelReplaceCart } = useCart();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [prodRes, catRes] = await Promise.all([
        apiService.getProducts(),
        apiService.getCategories()
      ]);
      if (prodRes && prodRes.success && Array.isArray(prodRes.products)) {
        setProducts(prodRes.products);
      } else if (Array.isArray(prodRes)) {
        setProducts(prodRes);
      } else {
        setProducts([]);
      }

      if (catRes && catRes.success && Array.isArray(catRes.categories)) {
        setCategories(catRes.categories);
      }
    } catch (err) {
      console.warn('Failed to load catalog products:', err);
      setError('Could not load products. Please check connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCat === 'all' || p.category === selectedCat;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

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
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Ionicons
            name="close-circle"
            size={18}
            color={colors.textMuted}
            onPress={() => setSearchQuery('')}
          />
        )}
      </View>

      <CategoryChip
        categories={categories}
        selectedCategory={selectedCat}
        onSelectCategory={setSelectedCat}
      />

      <View style={styles.countRow}>
        <Text style={styles.countText}>{filteredProducts.length} products</Text>
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
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item._id || item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
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
    paddingVertical: 11,
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
    fontWeight: '500',
    color: colors.textSecondary
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24
  },
  row: {
    gap: GAP,
    marginBottom: GAP
  },
  cardWrap: {
    width: CARD_WIDTH
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    marginTop: 10
  },
  emptySub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4
  }
});
