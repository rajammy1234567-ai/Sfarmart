import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Switch,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePartner } from '../context/PartnerContext';
import { colors } from '../theme/colors';
import { GlassCard } from '../components/GlassCard';
import { WaterBackground } from '../components/WaterBackground';
import { showAlert } from '../utils/alert';

// Standard 8 seeded categories for instant zero-latency render
const FALLBACK_CATEGORIES = [
  { _id: 'cat-1', name: 'Fresh Fruits & Vegetables' },
  { _id: 'cat-2', name: 'Dairy, Bread & Eggs' },
  { _id: 'cat-3', name: 'Atta, Rice & Dal' },
  { _id: 'cat-4', name: 'Oil, Ghee & Masala' },
  { _id: 'cat-5', name: 'Ghar Ka Khana / Home Thali' },
  { _id: 'cat-6', name: 'Mithai & Bakery' },
  { _id: 'cat-7', name: 'Snacks & Munchies' },
  { _id: 'cat-8', name: 'Cold Drinks & Juices' }
];

// Helper to assign real vector icons & curated colors to each category
export const getCategoryMeta = (catName = '') => {
  const n = (catName || '').toLowerCase();
  if (n.includes('fruit') || n.includes('vegetable') || n.includes('veg') || n.includes('sabzi')) {
    return { icon: 'leaf-outline', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.12)' };
  }
  if (n.includes('dairy') || n.includes('milk') || n.includes('bread') || n.includes('egg') || n.includes('paneer')) {
    return { icon: 'water-outline', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.12)' };
  }
  if (n.includes('atta') || n.includes('rice') || n.includes('dal') || n.includes('grain')) {
    return { icon: 'layers-outline', color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' };
  }
  if (n.includes('oil') || n.includes('ghee') || n.includes('masala')) {
    return { icon: 'flame-outline', color: '#ea580c', bg: 'rgba(234, 88, 12, 0.12)' };
  }
  if (n.includes('khana') || n.includes('thali') || n.includes('home') || n.includes('meal') || n.includes('restro') || n.includes('chef')) {
    return { icon: 'restaurant-outline', color: '#e11d48', bg: 'rgba(225, 29, 72, 0.12)' };
  }
  if (n.includes('mithai') || n.includes('sweet') || n.includes('bakery')) {
    return { icon: 'gift-outline', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)' };
  }
  if (n.includes('snack') || n.includes('munchies')) {
    return { icon: 'pizza-outline', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' };
  }
  if (n.includes('drink') || n.includes('juice') || n.includes('cold') || n.includes('beverage')) {
    return { icon: 'wine-outline', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' };
  }
  return { icon: 'grid-outline', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' };
};

const UNIT_PRESETS = ['1 kg', '500 g', '250 g', '1 pc', '1 plate', '1 packet', '1 litre', '1 dozen'];
const STOCK_PRESETS = ['10', '25', '50', '100', '200'];

export const AddProductScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;

  const { addInventoryItem, categories, vendor } = usePartner();

  const displayCategories = categories && categories.length > 0 ? categories : FALLBACK_CATEGORIES;

  const [name, setName] = useState('');
  const [selectedCatId, setSelectedCatId] = useState(displayCategories[0]?._id || '');
  const [price, setPrice] = useState('');
  const [mrp, setMrp] = useState('');
  const [unit, setUnit] = useState('1 kg');
  const [stock, setStock] = useState('50');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isVeg, setIsVeg] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (displayCategories.length > 0 && !selectedCatId) {
      setSelectedCatId(displayCategories[0]._id || displayCategories[0].id);
    }
  }, [displayCategories, selectedCatId]);

  const numPrice = parseFloat(price);
  const numMrp = parseFloat(mrp);
  const discountPercent =
    numPrice > 0 && numMrp > numPrice ? Math.round(((numMrp - numPrice) / numMrp) * 100) : 0;

  const showFeedback = (title, message, isSuccess = false) => {
    showAlert(title, message, [
      {
        text: 'OK',
        onPress: () => {
          if (isSuccess) navigation.goBack();
        }
      }
    ]);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      showFeedback('Validation Error', 'Please enter a product title.');
      return;
    }
    if (!price || isNaN(price) || Number(price) <= 0) {
      showFeedback('Validation Error', 'Please enter a valid selling price.');
      return;
    }
    if (!stock || isNaN(stock) || Number(stock) < 0) {
      showFeedback('Validation Error', 'Please enter valid stock available.');
      return;
    }

    setIsSubmitting(true);
    try {
      const catId = selectedCatId || displayCategories[0]?._id;
      const res = await addInventoryItem({
        name: name.trim(),
        categoryId: catId,
        category: catId,
        price: Number(price),
        mrp: numMrp && numMrp > 0 ? Number(numMrp) : Number(price),
        unit: unit.trim() || '1 kg',
        stock: Number(stock),
        description: description.trim(),
        image:
          imageUrl.trim() ||
          'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80',
        isVeg: isVeg
      });

      if (res && res.success !== false) {
        showFeedback('Success! 🌟', 'New product published to customer app!', true);
      } else {
        showFeedback('Error', res?.message || 'Could not save product.');
      }
    } catch (err) {
      showFeedback('Error', 'Failed to publish product. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <WaterBackground />

      {/* Top Header */}
      <View
        style={[
          styles.headerBar,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20) + 8
          }
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.glassBackBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerBarTitle}>Add New Listing</Text>
          <Text style={styles.headerBarSub}>{vendor?.storeName || 'Merchant Store'}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: Math.max(insets.bottom, 20) + 130,
              maxWidth: isTablet ? 720 : '100%',
              alignSelf: 'center',
              width: '100%'
            }
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* ==================== PRODUCT FORM CARD ==================== */}
          <GlassCard style={styles.sectionCard} showSheen={true}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.formIconOrb}>
                <Ionicons name="create-outline" size={16} color="#16a34a" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.sectionTitle}>Product Listing Details</Text>
                <Text style={styles.sectionSubtitle}>Select category and fill in product information</Text>
              </View>
            </View>

            {/* Product Title */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Product Title *</Text>
              <TextInput
                style={styles.glassInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Kashmiri Sweet Apples, Fresh Thali..."
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
                spellCheck={false}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            {/* ==================== CATEGORY SELECTOR WITH ICONS ==================== */}
            <View style={styles.inputGroup}>
              <View style={styles.fieldLabelRow}>
                <Ionicons name="grid-outline" size={14} color="#ea580c" />
                <Text style={styles.fieldLabel}>Category *</Text>
              </View>
              <Text style={styles.fieldHelper}>Select the store category for customer discovery:</Text>

              <View style={styles.catGrid}>
                {displayCategories.map((c) => {
                  const catId = c._id || c.id;
                  const isSelected = selectedCatId === catId;
                  const meta = getCategoryMeta(c.name);

                  return (
                    <TouchableOpacity
                      key={catId}
                      style={[styles.catChipWithIcon, isSelected && styles.catChipWithIconActive]}
                      onPress={() => setSelectedCatId(catId)}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.catIconOrb,
                          { backgroundColor: isSelected ? '#ea580c' : meta.bg }
                        ]}
                      >
                        <Ionicons
                          name={meta.icon}
                          size={16}
                          color={isSelected ? '#ffffff' : meta.color}
                        />
                      </View>
                      <Text
                        style={[
                          styles.catChipText,
                          isSelected && styles.catChipTextActive
                        ]}
                        numberOfLines={2}
                      >
                        {c.name}
                      </Text>
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color="#ea580c"
                          style={{ marginLeft: 'auto' }}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Price & MRP */}
            <View style={styles.rowTwoCols}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Selling Price (₹) *</Text>
                <TextInput
                  style={styles.glassInput}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="120"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  returnKeyType="next"
                  autoCorrect={false}
                  spellCheck={false}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>MRP (₹)</Text>
                <TextInput
                  style={styles.glassInput}
                  value={mrp}
                  onChangeText={setMrp}
                  placeholder="150"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  returnKeyType="next"
                  autoCorrect={false}
                  spellCheck={false}
                />
              </View>
            </View>
            {discountPercent > 0 && (
              <View style={styles.discountBadge}>
                <Ionicons name="pricetag" size={12} color="#16a34a" />
                <Text style={styles.discountText}>{discountPercent}% OFF Customer Discount</Text>
              </View>
            )}

            {/* Unit Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Unit of Sale</Text>
              <View style={styles.pillsWrap}>
                {UNIT_PRESETS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.presetPill, unit === u && styles.presetPillActive]}
                    onPress={() => setUnit(u)}
                  >
                    <Text style={[styles.presetPillText, unit === u && styles.presetPillTextActive]}>
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Initial Stock */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Initial Stock Available *</Text>
              <View style={styles.pillsWrap}>
                {STOCK_PRESETS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.presetPill, stock === s && styles.presetPillActive]}
                    onPress={() => setStock(s)}
                  >
                    <Text style={[styles.presetPillText, stock === s && styles.presetPillTextActive]}>
                      {s} units
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Veg / Non-Veg Toggle */}
            <View style={styles.switchRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.vegDot, { backgroundColor: isVeg ? '#16a34a' : '#dc2626' }]} />
                <Text style={styles.switchLabel}>
                  {isVeg ? 'Vegetarian Item' : 'Non-Vegetarian Item'}
                </Text>
              </View>
              <Switch
                value={isVeg}
                onValueChange={setIsVeg}
                trackColor={{ false: '#fca5a5', true: '#bbf7d0' }}
                thumbColor={isVeg ? '#16a34a' : '#dc2626'}
              />
            </View>

            {/* Image Preview & URL */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Product Image URL (Optional)</Text>
              <TextInput
                style={styles.glassInput}
                value={imageUrl}
                onChangeText={setImageUrl}
                placeholder="https://images.unsplash.com/..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="next"
              />
              {imageUrl ? (
                <View style={styles.imagePreviewWrap}>
                  <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
                </View>
              ) : null}
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.glassInput, { height: 76, textAlignVertical: 'top', paddingTop: 8 }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Brief description of fresh harvest, taste or ingredients..."
                placeholderTextColor={colors.textMuted}
                multiline={true}
                numberOfLines={3}
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            {/* Publish Button */}
            <TouchableOpacity
              style={styles.publishBtn}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={20} color="#ffffff" />
                  <Text style={styles.publishBtnText}>Publish to Customer Feed</Text>
                </>
              )}
            </TouchableOpacity>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export const InventoryScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;

  const {
    inventory,
    toggleItemAvailability,
    deleteInventoryItem,
    addStockToItem,
    vendor
  } = usePartner();

  const [activeTab, setActiveTab] = useState('ALL');
  const [replenishingId, setReplenishingId] = useState(null);
  const [stockModalItem, setStockModalItem] = useState(null);
  const [stockInputVal, setStockInputVal] = useState('25');

  const filteredItems = inventory.filter((item) => {
    if (activeTab === 'IN_STOCK') return item.isAvailable && (item.stock ?? item.stockQty) > 0;
    if (activeTab === 'OUT_OF_STOCK') return !item.isAvailable || (item.stock ?? item.stockQty) <= 0;
    return true;
  });

  const handleQuickAdd = async (itemId, amt) => {
    setReplenishingId(itemId);
    try {
      await addStockToItem(itemId, amt);
    } finally {
      setReplenishingId(null);
    }
  };

  const handleSaveModalStock = async () => {
    if (!stockModalItem) return;
    const qty = parseInt(stockInputVal, 10);
    if (isNaN(qty) || qty < 0) return;

    const targetId = stockModalItem.id || stockModalItem._id || stockModalItem.productId;
    setReplenishingId(targetId);
    try {
      const current = stockModalItem.stock ?? stockModalItem.stockQty ?? 0;
      const diff = qty - current;
      await addStockToItem(targetId, diff);
      setStockModalItem(null);
    } finally {
      setReplenishingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <WaterBackground />

      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20) + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerBarTitle}>My Store Catalog ({inventory.length})</Text>
          <Text style={styles.headerBarSub}>{vendor?.storeName || 'Merchant Store'}</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('AddProduct')}
          style={styles.addNavBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#ffffff" />
          <Text style={styles.addNavBtnText}>Add Listing</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabsContainer}>
        <GlassCard style={styles.filterGlassBar} showSheen={false} borderRadius={16}>
          <View style={styles.filterTabsRow}>
            {['ALL', 'IN_STOCK', 'OUT_OF_STOCK'].map((tab) => {
              const isActive = activeTab === tab;
              const label =
                tab === 'ALL'
                  ? `All (${inventory.length})`
                  : tab === 'IN_STOCK'
                  ? `In Stock (${inventory.filter((i) => i.isAvailable && (i.stock ?? i.stockQty) > 0).length})`
                  : `Out of Stock (${inventory.filter((i) => !i.isAvailable || (i.stock ?? i.stockQty) <= 0).length})`;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.filterTabChip, isActive && styles.filterTabChipActive]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text style={[styles.filterTabChipText, isActive && styles.filterTabChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </GlassCard>
      </View>

      {/* Catalog Items List */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Math.max(insets.bottom, 20) + 110,
            maxWidth: isTablet ? 720 : '100%',
            alignSelf: 'center',
            width: '100%'
          }
        ]}
        showsVerticalScrollIndicator={false}
      >
        {filteredItems.length === 0 ? (
          <GlassCard style={styles.emptyInventoryCard}>
            <Ionicons name="cube-outline" size={44} color="#94a3b8" />
            <Text style={styles.emptyInvTitle}>No items in this category</Text>
            <Text style={styles.emptyInvSub}>
              Use "+ Add Listing" to publish farm produce or kitchen meals.
            </Text>
          </GlassCard>
        ) : (
          filteredItems.map((item) => {
            const itemId = item.id || item._id || item.productId;
            const stockQty = item.stock ?? item.stockQty ?? 0;
            const isAvailable = item.isAvailable && stockQty > 0;
            const isBusy = replenishingId === itemId;

            return (
              <GlassCard key={itemId} style={styles.inventoryCard} showSheen={true}>
                <View style={styles.invCardRow}>
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.invThumb} />
                  ) : (
                    <View style={styles.invThumbFallback}>
                      <Ionicons name="basket-outline" size={24} color="#94a3b8" />
                    </View>
                  )}

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.invName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.invPrice}>
                      ₹{item.price} <Text style={styles.invUnit}>/ {item.unit || '1 kg'}</Text>
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Text
                        style={[
                          styles.stockBadgeText,
                          { color: stockQty > 0 ? '#16a34a' : '#dc2626' }
                        ]}
                      >
                        Stock: {stockQty} {item.unit || 'units'}
                      </Text>
                    </View>
                  </View>

                  {/* One-Tap Availability Toggle */}
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Switch
                      value={item.isAvailable}
                      onValueChange={() => toggleItemAvailability(itemId)}
                      trackColor={{ false: '#cbd5e1', true: '#bbf7d0' }}
                      thumbColor={item.isAvailable ? '#16a34a' : '#94a3b8'}
                    />
                    <Text
                      style={[
                        styles.availLabel,
                        { color: item.isAvailable ? '#16a34a' : '#64748b' }
                      ]}
                    >
                      {item.isAvailable ? 'In Stock' : 'Hidden'}
                    </Text>
                  </View>
                </View>

                {/* Stock Controls & Actions Bar */}
                <View style={styles.invActionsRow}>
                  <View style={styles.quickStockRow}>
                    <Text style={styles.quickStockLabel}>+Add:</Text>
                    {[10, 25, 50].map((amt) => (
                      <TouchableOpacity
                        key={amt}
                        style={styles.quickAddChip}
                        onPress={() => handleQuickAdd(itemId, amt)}
                        disabled={isBusy}
                      >
                        <Text style={styles.quickAddText}>+{amt}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.editStockChip}
                      onPress={() => {
                        setStockModalItem(item);
                        setStockInputVal(String(stockQty));
                      }}
                    >
                      <Ionicons name="pencil" size={12} color="#0284c7" />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.deleteListingBtn}
                    onPress={() => {
                      showAlert('Remove Product', `Delete "${item.name}" from store catalog?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteInventoryItem(itemId) }
                      ]);
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </GlassCard>
            );
          })
        )}
      </ScrollView>

      {/* Custom Stock Modal */}
      <Modal
        visible={!!stockModalItem}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setStockModalItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.stockModalCard}>
            <Text style={styles.stockModalTitle}>Set Stock Quantity</Text>
            <Text style={styles.stockModalSub}>{stockModalItem?.name}</Text>

            <TextInput
              style={styles.stockModalInput}
              value={stockInputVal}
              onChangeText={setStockInputVal}
              keyboardType="numeric"
              placeholder="e.g. 50"
            />

            <View style={styles.stockModalBtnsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setStockModalItem(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveModalStock}
              >
                <Text style={styles.modalSaveText}>Save Stock</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </View>
      </Modal>
    </View>
  );
};

export const SettlementsScreen = () => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;
  const { stats } = usePartner();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <WaterBackground />

      <View style={[styles.headerBar, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20) + 10 }]}>
        <Text style={styles.headerBarTitle}>Wednesday Settlements</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Math.max(insets.bottom, 20) + 110,
            maxWidth: isTablet ? 720 : '100%',
            alignSelf: 'center',
            width: '100%'
          }
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Upcoming Wednesday Payout Hero Card */}
        <GlassCard style={styles.wedHeroCard} showSheen={true} tint="green">
          <View style={styles.wedHeroRow}>
            <View style={styles.wedIconOrb}>
              <Ionicons name="calendar-outline" size={26} color="#16a34a" />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.wedHeroTitle}>Upcoming Wednesday Payout</Text>
              <Text style={styles.wedHeroAmount}>
                ₹{stats.todaySales ? stats.todaySales + 1250 : 1850}
              </Text>
              <View style={styles.bankDirectTag}>
                <Ionicons name="checkmark-circle" size={13} color="#15803d" />
                <Text style={styles.bankDirectText}>Direct Transfer to SBI A/c (*4321)</Text>
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Previous Weekly Payouts Ledger */}
        <Text style={styles.sectionHeaderTitle}>Previous Weekly Payouts</Text>
        {[
          { date: 'Wednesday, Sep 10, 2026', total: 4280, status: 'PAID TO BANK', ref: 'FARM-PAY-88231' },
          { date: 'Wednesday, Sep 03, 2026', total: 3950, status: 'PAID TO BANK', ref: 'FARM-PAY-87109' },
          { date: 'Wednesday, Aug 27, 2026', total: 5120, status: 'PAID TO BANK', ref: 'FARM-PAY-86043' }
        ].map((item, idx) => (
          <GlassCard key={idx} style={styles.settleCard} showSheen={false}>
            <View style={styles.settleRowTop}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="arrow-down-circle" size={20} color="#16a34a" />
                <Text style={styles.settleDate}>{item.date}</Text>
              </View>
              <Text style={styles.settleAmount}>+₹{item.total}</Text>
            </View>

            <View style={styles.settleRowBottom}>
              <View style={styles.settleStatusBadge}>
                <Text style={styles.settleStatusText}>{item.status}</Text>
              </View>
              <Text style={styles.settleRefText}>Ref: {item.ref}</Text>
            </View>
          </GlassCard>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12
  },
  headerBarTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a'
  },
  headerBarSub: {
    fontSize: 12,
    color: '#64748b'
  },
  glassBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  addNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#ea580c',
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3
  },
  addNavBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff'
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6
  },
  sectionCard: {
    marginBottom: 16,
    padding: 18
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  formIconOrb: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748b'
  },
  inputGroup: {
    marginBottom: 14
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155'
  },
  fieldHelper: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 8
  },
  glassInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.85)',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a'
  },

  // CATEGORY GRID WITH ICONS
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  catChipWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    minHeight: 52,
    flexGrow: 1,
    flexBasis: '47%'
  },
  catChipWithIconActive: {
    backgroundColor: 'rgba(254, 243, 199, 0.75)',
    borderColor: '#ea580c'
  },
  catIconOrb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    flexShrink: 1,
    lineHeight: 15
  },
  catChipTextActive: {
    color: '#ea580c',
    fontWeight: '800'
  },

  rowTwoCols: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8
  },
  discountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    alignSelf: 'flex-start',
    marginBottom: 12
  },
  discountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a'
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  presetPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)'
  },
  presetPillActive: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    borderColor: '#d97706'
  },
  presetPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569'
  },
  presetPillTextActive: {
    color: '#b45309',
    fontWeight: '700'
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 10
  },
  vegDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155'
  },
  imagePreviewWrap: {
    marginTop: 8,
    alignItems: 'center'
  },
  imagePreview: {
    width: '100%',
    height: 120,
    borderRadius: 12
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#ea580c',
    marginTop: 8,
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4
  },
  publishBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },

  // INVENTORY STYLES
  filterTabsContainer: {
    paddingHorizontal: 16,
    marginBottom: 12
  },
  filterGlassBar: {
    padding: 6
  },
  filterTabsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  filterTabChip: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 12
  },
  filterTabChipActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2
  },
  filterTabChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b'
  },
  filterTabChipTextActive: {
    color: '#0f172a',
    fontWeight: '800'
  },
  emptyInventoryCard: {
    alignItems: 'center',
    padding: 32,
    marginTop: 20
  },
  emptyInvTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 10
  },
  emptyInvSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center'
  },
  inventoryCard: {
    marginBottom: 12,
    padding: 14
  },
  invCardRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  invThumb: {
    width: 54,
    height: 54,
    borderRadius: 12
  },
  invThumbFallback: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: 'rgba(226, 232, 240, 0.6)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  invName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  invPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2
  },
  invUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748b'
  },
  stockBadgeText: {
    fontSize: 11,
    fontWeight: '700'
  },
  availLabel: {
    fontSize: 10,
    fontWeight: '700'
  },
  invActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226, 232, 240, 0.7)'
  },
  quickStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  quickStockLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b'
  },
  quickAddChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.3)'
  },
  quickAddText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a'
  },
  editStockChip: {
    padding: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(2, 132, 199, 0.12)'
  },
  deleteListingBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  stockModalCard: {
    width: '100%',
    maxWidth: 380,
    padding: 20
  },
  stockModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  stockModalSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 12
  },
  stockModalInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16
  },
  stockModalBtnsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(100, 116, 139, 0.1)'
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569'
  },
  modalSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#16a34a'
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff'
  },

  // SETTLEMENTS STYLES
  wedHeroCard: {
    marginBottom: 16,
    padding: 18
  },
  wedHeroRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  wedIconOrb: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(22, 163, 74, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(22, 163, 74, 0.35)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wedHeroTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#15803d'
  },
  wedHeroAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2
  },
  bankDirectTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4
  },
  bankDirectText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#15803d'
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10
  },
  settleCard: {
    marginBottom: 10,
    padding: 14
  },
  settleRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  settleDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  settleAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16a34a'
  },
  settleRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8
  },
  settleStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(22, 163, 74, 0.12)'
  },
  settleStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16a34a'
  },
  settleRefText: {
    fontSize: 11,
    color: '#64748b'
  }
});
