import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { ProductCard } from '../../components/ProductCard';
import { apiService } from '../../services/api';
import { colors } from '../../theme/colors';
import { SafeImage } from '../../components/common/SafeImage';

const { width } = Dimensions.get('window');
const GAP = 10;
const CARD_WIDTH = (width - 32 - GAP) / 2;

const chefs = [
  {
    name: 'Sunita Sharma',
    role: 'Punjabi Thalis & Curries',
    rating: '4.9',
    orders: '120+',
    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&auto=format&fit=crop&q=80'
  },
  {
    name: 'Manjeet Kaur',
    role: 'Desi Sweets & Ladoo',
    rating: '5.0',
    orders: '90+',
    image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&auto=format&fit=crop&q=80'
  },
  {
    name: 'Kaur Spices',
    role: 'Handmade Masalas',
    rating: '5.0',
    orders: '62+',
    image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=300&auto=format&fit=crop&q=80'
  }
];

export const HomeRestroScreen = ({ navigation }) => {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDishes();
  }, []);

  const loadDishes = async () => {
    try {
      setIsLoading(true);
      const res = await apiService.getProducts();
      if (res && res.success && Array.isArray(res.products)) {
        setProducts(res.products);
      } else if (Array.isArray(res)) {
        setProducts(res);
      } else {
        setProducts([]);
      }
    } catch (err) {
      console.warn('Failed to load home restro dishes:', err);
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
      tags.includes('punjabi') ||
      tags.includes('paneer') ||
      tags.includes('paratha') ||
      name.includes('thali') ||
      name.includes('paratha') ||
      name.includes('masala') ||
      p.vendor?.storeType === 'HOME_CHEF'
    );
  });

  const rows = [];
  for (let i = 0; i < homeRestroItems.length; i += 2) {
    rows.push(homeRestroItems.slice(i, i + 2));
  }

  return (
    <View style={styles.container}>
      <Header navigation={navigation} title="Home Chef & Bakery" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons name="restaurant" size={24} color="#ec4899" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Home Restro & Sweets</Text>
              <Text style={styles.heroDesc}>
                Made with care. Served with trust. Empowers women entrepreneurs.
              </Text>
            </View>
          </View>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Ionicons name="checkmark-circle" size={12} color="#ec4899" />
              <Text style={styles.badgeText}>Hygienic kitchens</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="heart" size={12} color="#ec4899" />
              <Text style={styles.badgeText}>Authentic recipes</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="flame" size={12} color="#ec4899" />
              <Text style={styles.badgeText}>Fresh cooked</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Local home chefs</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chefScroll}>
          {chefs.map((chef) => (
            <View key={chef.name} style={styles.chefCard}>
              <SafeImage source={{ uri: chef.image }} style={styles.chefAvatar} placeholderIcon="person-outline" placeholderIconSize={28} />
              <Text style={styles.chefName}>{chef.name}</Text>
              <Text style={styles.chefRole}>{chef.role}</Text>
              <View style={styles.chefMeta}>
                <Ionicons name="star" size={11} color="#f59e0b" />
                <Text style={styles.chefRating}>
                  {chef.rating} · {chef.orders} orders
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>Homemade dishes & bakery</Text>
        {isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ marginTop: 10, color: colors.textSecondary, fontSize: 13 }}>Loading fresh homemade dishes...</Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <Ionicons name="restaurant-outline" size={44} color={colors.textMuted} />
            <Text style={{ marginTop: 10, fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>No dishes available right now</Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: colors.textSecondary }}>Our home chefs are preparing the next batch</Text>
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
    paddingBottom: 24,
    paddingTop: 12
  },
  heroCard: {
    backgroundColor: '#fdf2f8',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fbcfe8',
    marginBottom: 16
  },
  heroTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start'
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fbcfe8'
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: '#9d174d'
  },
  heroDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 17
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#fbcfe8'
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#9d174d'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 12
  },
  chefScroll: {
    marginBottom: 18
  },
  chefCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginRight: 12,
    width: 148,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  chefAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#fce7f3'
  },
  chefName: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
    textAlign: 'center'
  },
  chefRole: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2
  },
  chefMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 6
  },
  chefRating: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.accent
  },
  productRow: {
    flexDirection: 'row',
    gap: GAP,
    marginBottom: GAP
  },
  productCell: {
    width: CARD_WIDTH
  }
});
