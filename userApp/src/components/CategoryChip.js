import React, { useRef } from 'react';
import { ScrollView, Text, StyleSheet, View, Animated, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

const DEFAULT_CATEGORIES = [
  { id: 'all', name: 'All Services', icon: 'grid-outline' },
  { id: 'grocery', name: 'S-farmart Mart', icon: 'basket-outline' },
  { id: 'veggies', name: 'Farm Veggies', icon: 'leaf-outline' },
  { id: 'fruits', name: 'Fresh Fruits', icon: 'sunny-outline' },
  { id: 'dairy', name: 'Dairy & Ghee', icon: 'water-outline' },
  { id: 'homerestro', name: 'Home Food & Thali', icon: 'restaurant-outline' },
  { id: 'bakery', name: 'Fresh Bakery', icon: 'disc-outline' },
  { id: 'sweets', name: 'Desi Sweets', icon: 'gift-outline' }
];

const AnimatedChipItem = ({ cat, isSelected, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const iconScaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: Platform.OS !== 'web',
      friction: 5,
      tension: 220
    }).start();
  };

  const handlePressOut = () => {
    // Satisfying bounce: 0.92 -> 1.10 -> 1.0
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.10,
        useNativeDriver: Platform.OS !== 'web',
        friction: 4,
        tension: 240
      }),
      Animated.spring(scaleAnim, {
        toValue: 1.0,
        useNativeDriver: Platform.OS !== 'web',
        friction: 5,
        tension: 180
      })
    ]).start();

    // Icon pop
    Animated.sequence([
      Animated.timing(iconScaleAnim, {
        toValue: 1.25,
        duration: 120,
        useNativeDriver: Platform.OS !== 'web'
      }),
      Animated.spring(iconScaleAnim, {
        toValue: 1.0,
        friction: 4,
        tension: 200,
        useNativeDriver: Platform.OS !== 'web'
      })
    ]).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={({ pressed }) => [
          styles.chip,
          isSelected ? styles.selectedChip : styles.unselectedChip,
          Platform.OS === 'web' && {
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)'
          }
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View
          style={[
            styles.iconWrap,
            isSelected && styles.iconWrapSelected,
            { transform: [{ scale: iconScaleAnim }] }
          ]}
        >
          {cat.icon && !/^[a-z0-9-]+$/.test(cat.icon) ? (
            <Text style={{ fontSize: 13 }}>{cat.icon}</Text>
          ) : (
            <Ionicons
              name={cat.icon || 'basket-outline'}
              size={15}
              color={isSelected ? colors.primaryDark : colors.textSecondary}
            />
          )}
        </Animated.View>
        <Text style={[styles.text, isSelected && styles.selectedText]}>{cat.name}</Text>
      </Pressable>
    </Animated.View>
  );
};

export const CategoryChip = ({ categories: propCats, selectedCategory, onSelectCategory }) => {
  const displayCategories = (propCats && propCats.length > 0)
    ? [{ id: 'all', name: 'All Services', icon: 'grid-outline' }, ...propCats.map((c) => ({
        id: c.slug || c._id || c.id,
        name: c.name,
        icon: c.icon || 'basket-outline'
      }))]
    : DEFAULT_CATEGORIES;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {displayCategories.map((cat) => {
        const catKey = cat.id || cat.slug || cat._id;
        const isSelected = selectedCategory === catKey;
        return (
          <AnimatedChipItem
            key={catKey}
            cat={cat}
            isSelected={isSelected}
            onPress={() => onSelectCategory(catKey)}
          />
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 24,
    gap: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  unselectedChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.95)'
  },
  selectedChip: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1.5,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconWrapSelected: {
    backgroundColor: '#ffffff',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 1
  },
  text: {
    fontSize: 12.5,
    fontWeight: '500',
    color: colors.textSecondary
  },
  selectedText: {
    color: colors.primaryDark,
    fontWeight: '700'
  }
});
