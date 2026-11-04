import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { ProductCard } from '../../components/ProductCard';
import { apiService } from '../../services/api';
import { colors } from '../../theme/colors';
import { SafeImage } from '../../components/common/SafeImage';
import { getScrollBottomPadding } from '../../theme/layout';

const GAP = 12;

export const HomeRestroScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState([]);
  const [chefs, setChefs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [prodRes, vendorRes] = await Promise.all([
        apiService.getProducts(),
        apiService.getVendors()
      ]);

      if (prodRes && prodRes.success && Array.isArray(prodRes.products)) {
        setProducts(prodRes.products);
      } else if (Array.isArray(prodRes)) {
        setProducts(prodRes);
      } else {
        setProducts([]);
      }

      if (vendorRes && vendorRes.success && Array.isArray(vendorRes.vendors)) {
        const homeChefs = vendorRes.vendors.filter((v) => v.storeType === 'HOME_CHEF' && v.isApproved !== false && v.isActive !== false);
        setChefs(homeChefs);
      } else if (Array.isArray(vendorRes)) {
        const homeChefs = vendorRes.filter((v) => v.storeType === 'HOME_CHEF' && v.isApproved !== false && v.isActive !== false);
        setChefs(homeChefs);
      } else {
        setChefs([]);
      }
    } catch (err) {
      console.warn('Failed to load home restro data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const homeRestroItems = products.filter((p) => {
    const cat = (p.category?.name || p.category?.slug || p.category || p.subCategory || '').toLowerCase();
    const tags = (p.tags || []).join(' ').toLowerCase();
    const name = (p.name || '').toLowerCase();
    return (
      cat.includes('thali') ||
      cat.includes('home') ||
      cat.includes('restro') ||
      cat.includes('sweet') ||
      cat.includes('bakery') ||
      cat.includes('cooked') ||
      tags.includes('punjabi') ||
      tags.includes('paneer') ||
      tags.includes('paratha') ||
      name.includes('thali') ||
      name.includes('paratha') ||
      name.includes('masala') ||
      p.vendor?.storeType === 'HOME_CHEF' ||
      p.storeType === 'HOME_CHEF'
    );
  });

  const rows = [];
  for (let i = 0; i < homeRestroItems.length; i += 2) {
    rows.push(homeRestroItems.slice(i, i + 2));
  }

  return (
    <View style={styles.container}>
      <Header navigation={navigation} title="Home Chef & Bakery" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: getScrollBottomPadding(insets, false) }
        ]}
      >
        {/* S-farmart warm banner for authentic kitchen food */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons name="restaurant" size={24} color="#ea580c" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Authentic Home Kitchens</Text>
              <Text style={styles.heroDesc}>
                Freshly cooked meals, homemade thalis & artisan sweets made with care by local chefs.
              </Text>
            </View>
          </View>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Ionicons name="checkmark-circle" size={13} color="#16a34a" />
              <Text style={styles.badgeText}>Hygienic home kitchens</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="heart" size={13} color="#ea580c" />
              <Text style={styles.badgeText}>Authentic taste</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="flame" size={13} color="#ea580c" />
              <Text style={styles.badgeText}>Made fresh</Text>
            </View>
          </View>
        </View>

        {/* Real Home Chefs from backend API */}
        {chefs.length > 0 && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Featured Home Chefs</Text>
              <Text style={styles.sectionSubCount}>{chefs.length} kitchen{chefs.length > 1 ? 's' : ''}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chefScroll}>
              {chefs.map((chef) => {
                const chefId = chef._id || chef.id;
                const hasRating = Boolean(chef.rating && typeof chef.rating === 'number' && chef.rating > 0);
                const orderText = chef.totalOrders ? `${chef.totalOrders}+ orders` : null;

                return (
                  <TouchableOpacity
                    key={chefId}
                    style={styles.chefCard}
                    onPress={() => navigation.navigate('VendorStore', { vendor: chef })}
                    activeOpacity={0.85}
                  >
                    <SafeImage
                      source={{ uri: chef.logo || chef.banner }}
                      style={styles.chefAvatar}
                      placeholderIcon="person-outline"
                      placeholderIconSize={28}
                    />
                    <Text style={styles.chefName} numberOfLines={1}>{chef.storeName || chef.ownerName}</Text>
                    <Text style={styles.chefRole} numberOfLines={2}>
                      {chef.description || 'Authentic home recipes & meals'}
                    </Text>
                    {hasRating ? (
                      <View style={styles.chefMeta}>
                        <Ionicons name="star" size={11} color="#f59e0b" />
                        <Text style={styles.chefRating}>
                          {chef.rating} {orderText ? `· ${orderText}` : ''}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.chefMeta}>
                        <Ionicons name="shield-checkmark" size={11} color="#16a34a" />
                        <Text style={[styles.chefRating, { color: '#16a34a' }]}>Verified Kitchen</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Homemade Dishes & Bakery</Text>
          {homeRestroItems.length > 0 && (
            <Text style={styles.sectionSubCount}>{homeRestroItems.length} dish{homeRestroItems.length > 1 ? 'es' : ''}</Text>
          )}
        </View>

        {isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ marginTop: 10, color: colors.textSecondary, fontSize: 13 }}>Loading fresh homemade dishes...</Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="restaurant-outline" size={44} color={colors.textMuted} />
            <Text style={{ marginTop: 10, fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>No home chefs or dishes available</Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 20 }}>There are currently no registered home chefs or homemade dishes available. Please check back later.</Text>
          </View>
        ) : (
          rows.map((row, idx) => (
            <View key={`hr-${idx}`} style={styles.productRow}>
              {row.map((item) => (
                <View key={item._id || item.id} style={styles.productCell}>
                  <ProductCard
                    product={item}
                    compact
                    onPress={() => navigation.navigate('ProductDetails', { product: item })}
                  />
                </View>
              ))}
              {row.length === 1 && <View style={styles.productCell} />}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12
  },
  heroCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fed7aa',
    marginBottom: 16
  },
  heroTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start'
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ffedd5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fed7aa'
  },
  heroTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#9a3412'
  },
  heroDesc: {
    fontSize: 12,
    color: '#78350f',
    marginTop: 3,
    lineHeight: 17
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#fde68a'
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#78350f'
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary
  },
  sectionSubCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary
  },
  chefScroll: {
    marginBottom: 20
  },
  chefCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    marginRight: 12,
    width: 156,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: 'rgba(15, 23, 42, 0.04)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2
  },
  chefAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#fed7aa',
    backgroundColor: '#f8fafc'
  },
  chefName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center'
  },
  chefRole: {
    fontSize: 10.5,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 14,
    minHeight: 28
  },
  chefMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 6
  },
  chefRating: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.accent
  },
  productRow: {
    flexDirection: 'row',
    gap: GAP,
    marginBottom: GAP
  },
  productCell: {
    flex: 1,
    minWidth: 0
  },
  emptyCard: {
    paddingVertical: 40,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  }
});
