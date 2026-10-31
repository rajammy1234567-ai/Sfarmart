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
import * as ImagePicker from 'expo-image-picker';
import { usePartner } from '../context/PartnerContext';
import { colors } from '../theme/colors';
import { GlassCard } from '../components/GlassCard';
import { WaterBackground } from '../components/WaterBackground';
import { showAlert } from '../utils/alert';
import { useModalFocus, safeBlurActiveElement } from '../utils/focusManager';

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

const STOCK_PRESETS = ['10', '25', '50', '100', '200'];

export const AddProductScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;

  const editItem = route?.params?.product || route?.params?.item || null;
  const isEditing = Boolean(editItem);

  const { addInventoryItem, updateInventoryItem, uploadProductImage, categories = [], fetchCategories, requestCategory, createCategory, vendor } = usePartner();

  const displayCategories = Array.isArray(categories) ? categories : [];

  const initialCatId = editItem?.categoryId || (typeof editItem?.category === 'object' ? editItem.category?._id : editItem?.category) || '';
  const [name, setName] = useState(editItem?.name || '');
  const [selectedCatId, setSelectedCatId] = useState(initialCatId);
  const [selectedSubCategory, setSelectedSubCategory] = useState(editItem?.subCategory || '');
  const [price, setPrice] = useState(editItem?.price !== undefined ? String(editItem.price) : '');
  const [mrp, setMrp] = useState(editItem?.mrp !== undefined ? String(editItem.mrp) : '');
  const [unit, setUnit] = useState(editItem?.unit ? String(editItem.unit) : '');
  const [stock, setStock] = useState(
    editItem?.stock !== undefined ? String(editItem.stock) : editItem?.stockQty !== undefined ? String(editItem.stockQty) : '50'
  );
  const [description, setDescription] = useState(editItem?.description || '');
  const [imageUrl, setImageUrl] = useState(editItem?.image || '');
  const [previewUri, setPreviewUri] = useState(editItem?.image || '');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [isVeg, setIsVeg] = useState(editItem?.isVeg !== undefined ? editItem.isVeg : true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Category request modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('GROCERY');
  const [newCatParentId, setNewCatParentId] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('🥦');
  const [newCatReason, setNewCatReason] = useState('');
  const [isRequestingCategory, setIsRequestingCategory] = useState(false);

  useModalFocus(showCategoryModal);

  useEffect(() => {
    if (fetchCategories && (!categories || categories.length === 0)) {
      fetchCategories();
    }
  }, [fetchCategories, categories]);

  useEffect(() => {
    if (Array.isArray(categories) && categories.length > 0) {
      if (editItem) {
        const targetCat = editItem.categoryId || (typeof editItem.category === 'object' ? editItem.category?._id : editItem.category);
        const match = categories.find((c) => (c._id || c.id) === targetCat || c.name === targetCat || c.slug === targetCat);
        if (match) {
          setSelectedCatId(match._id || match.id);
          return;
        }
      }
      const exists = categories.some((c) => (c._id || c.id) === selectedCatId);
      if (!selectedCatId || !exists) {
        setSelectedCatId(categories[0]._id || categories[0].id);
      }
    }
  }, [categories, selectedCatId, editItem]);

  // When parent category changes: clear incompatible subcategory
  const handleSelectCategory = (newCatId) => {
    if (newCatId !== selectedCatId) {
      setSelectedCatId(newCatId);
      const targetCat = displayCategories.find((c) => (c._id || c.id) === newCatId);
      const isSubCompatible = (targetCat?.subCategories || []).some(
        (s) =>
          (s._id && String(s._id) === String(selectedSubCategory)) ||
          (s.name && s.name.toLowerCase() === (selectedSubCategory || '').toLowerCase()) ||
          (s.slug && s.slug.toLowerCase() === (selectedSubCategory || '').toLowerCase())
      );
      if (!isSubCompatible) {
        setSelectedSubCategory('');
      }
    }
  };

  const currentCategory = displayCategories.find((c) => (c._id || c.id) === selectedCatId);
  const availableSubCategories = Array.isArray(currentCategory?.subCategories) ? currentCategory.subCategories : [];

  const isFoodCategory = Boolean(
    currentCategory?.type === 'FOOD' ||
    vendor?.storeType === 'HOME_CHEF' ||
    (currentCategory?.name && /(food|meal|thali|restro|snack|bakery|mithai|sweet|dairy|egg|meat|chicken)/i.test(currentCategory.name))
  );

  const handlePickImage = async () => {
    setUploadError(null);
    try {
      if (Platform.OS !== 'web') {
        const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          if (!canAskAgain) {
            showAlert(
              'Photo Permission Required',
              'Photo library access is disabled. Please open device Settings to allow photo selection.'
            );
          } else {
            showAlert('Permission Denied', 'Please grant photo library access to choose a product picture.');
          }
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        selectionLimit: 1
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setPreviewUri(asset.uri);
      setIsUploadingImage(true);

      if (uploadProductImage) {
        const uploadRes = await uploadProductImage(asset);
        if (uploadRes && uploadRes.success) {
          const finalPath = uploadRes.path || uploadRes.url;
          setImageUrl(finalPath);
          setPreviewUri(uploadRes.url || finalPath);
          setUploadError(null);
        } else {
          setUploadError(uploadRes?.message || 'Failed to upload photo. Tap retry.');
        }
      } else {
        setImageUrl(asset.uri);
      }
    } catch (err) {
      console.warn('Image picker error:', err);
      setUploadError('Could not open photo picker. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setImageUrl('');
    setPreviewUri('');
    setUploadError(null);
  };

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

  const handleRequestCategorySubmit = async () => {
    if (!newCatName.trim()) {
      showFeedback('Validation Error', 'Please enter a category name.');
      return;
    }
    setIsRequestingCategory(true);
    try {
      const fn = requestCategory || createCategory;
      const res = await fn({
        proposedName: newCatName.trim(),
        proposedType: newCatType,
        suggestedParentCategory: newCatParentId || null,
        proposedIcon: newCatIcon.trim() || (newCatType === 'FOOD' ? '🍛' : '🥦'),
        reason: newCatReason.trim()
      });

      if (res && res.success) {
        setShowCategoryModal(false);
        setNewCatName('');
        setNewCatReason('');
        setNewCatParentId('');

        if (res.exists && res.category) {
          const existingId = res.category._id || res.category.id;
          setSelectedCatId(existingId);
          showFeedback(
            'Existing Category Selected',
            `An approved category "${res.category.name}" already exists and was selected for your product.`
          );
        } else {
          showFeedback(
            'Request Submitted! 📋',
            `Your request for "${newCatName.trim()}" has been submitted for Farmart admin review.\n\nPlease select an existing approved category below to publish your product now.`
          );
        }
      } else if (res && res.pending) {
        showFeedback(
          'Request Pending ⏳',
          res.message || 'You already have a pending request for this category name. Admin review is in progress.'
        );
      } else {
        showFeedback('Error', res?.message || 'Could not submit category request.');
      }
    } catch {
      showFeedback('Error', 'Failed to submit category request. Please check your connection.');
    } finally {
      setIsRequestingCategory(false);
    }
  };

  const handleSubmit = async () => {
    if (isUploadingImage) {
      showFeedback('Upload in Progress', 'Please wait for your product photo to finish uploading.');
      return;
    }
    if (!name.trim()) {
      showFeedback('Validation Error', 'Please enter a product title.');
      return;
    }
    if (!selectedCatId || !selectedCatId.match(/^[0-9a-fA-F]{24}$/)) {
      showFeedback('Validation Error', 'Please select a valid store category from the database.');
      return;
    }
    const parsedPrice = parseFloat(price);
    if (!price || isNaN(parsedPrice) || parsedPrice <= 0) {
      showFeedback('Validation Error', 'Please enter a valid selling price greater than ₹0.');
      return;
    }
    const parsedMrp = mrp && mrp.trim() ? parseFloat(mrp) : parsedPrice;
    if (mrp && mrp.trim()) {
      if (isNaN(parsedMrp) || parsedMrp < 0) {
        showFeedback('Validation Error', 'MRP must be a valid non-negative number.');
        return;
      }
      if (parsedMrp < parsedPrice) {
        showFeedback('Validation Error', `MRP (₹${mrp}) cannot be lower than the selling price (₹${price}).`);
        return;
      }
    }
    const parsedStock = parseInt(stock, 10);
    if (!stock || isNaN(parsedStock) || parsedStock < 0) {
      showFeedback('Validation Error', 'Please enter a valid available stock count (e.g. 25).');
      return;
    }
    if (!unit.trim()) {
      showFeedback('Validation Error', 'Please enter the pack size / unit of sale (e.g. 500 g, 1 kg, 1 dozen).');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        categoryId: selectedCatId,
        category: selectedCatId,
        subCategory: selectedSubCategory || '',
        price: parsedPrice,
        mrp: parsedMrp,
        unit: unit.trim(),
        stock: parsedStock,
        stockQty: parsedStock,
        description: description.trim(),
        image:
          imageUrl.trim() ||
          previewUri.trim() ||
          'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80',
        isVeg: isFoodCategory ? isVeg : true
      };

      let res;
      if (isEditing) {
        const itemId = editItem.id || editItem._id || editItem.productId;
        res = await updateInventoryItem(itemId, payload);
      } else {
        res = await addInventoryItem(payload);
      }

      if (res && res.success !== false) {
        showFeedback(
          isEditing ? 'Updated! ✨' : 'Success! 🌟',
          isEditing ? 'Product details updated successfully!' : 'New product published to customer app!',
          true
        );
      } else {
        showFeedback('Error', res?.message || 'Could not save product.');
      }
    } catch (err) {
      showFeedback('Error', 'Failed to save product. Please check your connection.');
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
          <Text style={styles.headerBarTitle}>{isEditing ? 'Edit Product Listing' : 'Add New Listing'}</Text>
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
              <View style={styles.categoryHeaderRow}>
                <View style={styles.fieldLabelRow}>
                  <Ionicons name="grid-outline" size={14} color="#ea580c" />
                  <Text style={styles.fieldLabel}>Category *</Text>
                </View>
                <TouchableOpacity
                  style={styles.addCatBtn}
                  onPress={() => {
                    setNewCatName('');
                    setNewCatType(vendor?.storeType === 'HOME_CHEF' ? 'FOOD' : 'GROCERY');
                    setNewCatIcon(vendor?.storeType === 'HOME_CHEF' ? '🍛' : '🥦');
                    setNewCatParentId('');
                    setNewCatReason('');
                    setShowCategoryModal(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="git-pull-request-outline" size={15} color="#16a34a" />
                  <Text style={styles.addCatBtnText}>Request Category</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldHelper}>Select the store category for customer discovery:</Text>

              {displayCategories.length === 0 ? (
                <View style={styles.catEmptyState}>
                  <Ionicons name="alert-circle-outline" size={24} color="#d97706" />
                  <Text style={styles.catEmptyText}>No categories loaded from database.</Text>
                  <TouchableOpacity
                    style={styles.createCatPromptBtn}
                    onPress={() => {
                      setNewCatName('');
                      setNewCatType(vendor?.storeType === 'HOME_CHEF' ? 'FOOD' : 'GROCERY');
                      setNewCatIcon(vendor?.storeType === 'HOME_CHEF' ? '🍛' : '🥦');
                      setNewCatParentId('');
                      setNewCatReason('');
                      setShowCategoryModal(true);
                    }}
                  >
                    <Text style={styles.createCatPromptText}>+ Request New Category</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.catGrid}>
                  {displayCategories.map((c) => {
                    const catId = c._id || c.id;
                    const isSelected = selectedCatId === catId;
                    const meta = getCategoryMeta(c.name);

                    return (
                      <TouchableOpacity
                        key={catId}
                        style={[styles.catChipWithIcon, isSelected && styles.catChipWithIconActive]}
                        onPress={() => handleSelectCategory(catId)}
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
              )}

              {/* ==================== SUBCATEGORY SELECTOR ==================== */}
              {availableSubCategories.length > 0 && (
                <View style={styles.subCatSection}>
                  <View style={styles.subCatHeaderRow}>
                    <Ionicons name="git-branch-outline" size={14} color="#ea580c" />
                    <Text style={styles.subCatLabel}>Subcategory (Optional)</Text>
                  </View>
                  <Text style={styles.subCatHelper}>
                    Select a curated subcategory under {currentCategory?.name || 'parent'}:
                  </Text>
                  <View style={styles.subCatGrid}>
                    <TouchableOpacity
                      style={[
                        styles.subCatChip,
                        !selectedSubCategory && styles.subCatChipActive
                      ]}
                      onPress={() => setSelectedSubCategory('')}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.subCatChipText,
                          !selectedSubCategory && styles.subCatChipTextActive
                        ]}
                      >
                        General / None
                      </Text>
                    </TouchableOpacity>
                    {availableSubCategories.map((sub) => {
                      const subId = sub._id || sub.id;
                      const subKey = subId || sub.slug || sub.name;
                      const isSubActive =
                        Boolean(selectedSubCategory) &&
                        (String(selectedSubCategory) === String(subId) ||
                          selectedSubCategory.toLowerCase() === (sub.name || '').toLowerCase() ||
                          selectedSubCategory.toLowerCase() === (sub.slug || '').toLowerCase());

                      return (
                        <TouchableOpacity
                          key={subKey}
                          style={[
                            styles.subCatChip,
                            isSubActive && styles.subCatChipActive
                          ]}
                          onPress={() => setSelectedSubCategory(isSubActive ? '' : sub.name)}
                          activeOpacity={0.8}
                        >
                          {isSubActive && (
                            <Ionicons name="checkmark-circle" size={14} color="#ea580c" />
                          )}
                          <Text
                            style={[
                              styles.subCatChipText,
                              isSubActive && styles.subCatChipTextActive
                            ]}
                          >
                            {sub.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
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
            {numMrp > 0 && numPrice > 0 && numMrp < numPrice && (
              <View style={styles.errorPill}>
                <Ionicons name="alert-circle" size={13} color="#ef4444" />
                <Text style={styles.errorPillText}>MRP (₹{mrp}) cannot be lower than selling price (₹{price})</Text>
              </View>
            )}
            {discountPercent > 0 && (
              <View style={styles.discountBadge}>
                <Ionicons name="pricetag" size={12} color="#16a34a" />
                <Text style={styles.discountText}>{discountPercent}% OFF Customer Discount</Text>
              </View>
            )}

            {/* Pack Size / Unit */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Pack Size / Unit *</Text>
              <TextInput
                style={styles.glassInput}
                value={unit}
                onChangeText={setUnit}
                placeholder="e.g. 10 kg, 10 litre, 10 packets, 750 g"
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
                spellCheck={false}
                maxLength={50}
                returnKeyType="next"
              />
            </View>

            {/* Initial Stock / Inventory Count */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Available Inventory (Total Packs) *</Text>
              <Text style={styles.fieldHelper}>How many packs you have ready to sell (e.g. 30 packs)</Text>
              <View style={styles.pillsWrap}>
                {STOCK_PRESETS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.presetPill, stock === s && styles.presetPillActive]}
                    onPress={() => setStock(s)}
                  >
                    <Text style={[styles.presetPillText, stock === s && styles.presetPillTextActive]}>
                      {s} packs
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.glassInput, { marginTop: 8 }]}
                value={stock}
                onChangeText={setStock}
                placeholder="Or type custom pack count (e.g. 30, 45, 120)"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            {/* Veg / Non-Veg Toggle (Food Categories only) */}
            {isFoodCategory && (
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
            )}

            {/* Real Device Image Upload */}
            <View style={styles.inputGroup}>
              <View style={styles.fieldLabelRow}>
                <Ionicons name="camera-outline" size={15} color="#ea580c" />
                <Text style={styles.fieldLabel}>Product Photo</Text>
              </View>
              <Text style={styles.fieldHelper}>Choose a photo from your device (JPG, PNG, WEBP up to 5 MB)</Text>

              {previewUri ? (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: previewUri }} style={styles.imagePreviewLarge} resizeMode="cover" />
                  <View style={styles.imageOverlayActions}>
                    <TouchableOpacity
                      style={styles.imageActionBtn}
                      onPress={handlePickImage}
                      disabled={isUploadingImage}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh-outline" size={15} color="#0f172a" />
                      <Text style={styles.imageActionBtnText}>Replace Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.imageActionBtn, styles.imageRemoveBtn]}
                      onPress={handleRemoveImage}
                      disabled={isUploadingImage}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={15} color="#ef4444" />
                      <Text style={[styles.imageActionBtnText, { color: '#ef4444' }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                  {isUploadingImage && (
                    <View style={styles.uploadingOverlay}>
                      <ActivityIndicator size="small" color="#ffffff" />
                      <Text style={styles.uploadingText}>Uploading photo...</Text>
                    </View>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.uploadDropZone}
                  onPress={handlePickImage}
                  disabled={isUploadingImage}
                  activeOpacity={0.8}
                >
                  {isUploadingImage ? (
                    <View style={{ alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator size="small" color="#ea580c" />
                      <Text style={styles.uploadDropZoneSub}>Uploading photo from device...</Text>
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center', gap: 6 }}>
                      <View style={styles.uploadDropZoneIconWrap}>
                        <Ionicons name="image-outline" size={26} color="#ea580c" />
                      </View>
                      <Text style={styles.uploadDropZoneTitle}>Choose Photo from Device</Text>
                      <Text style={styles.uploadDropZoneSub}>Tap to select from phone gallery or computer</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {uploadError ? (
                <View style={styles.uploadErrorBox}>
                  <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
                  <Text style={styles.uploadErrorText}>{uploadError}</Text>
                  <TouchableOpacity onPress={handlePickImage} style={styles.uploadRetryBtn}>
                    <Text style={styles.uploadRetryText}>Retry</Text>
                  </TouchableOpacity>
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
                  <Ionicons name={isEditing ? 'save-outline' : 'cloud-upload-outline'} size={20} color="#ffffff" />
                  <Text style={styles.publishBtnText}>
                    {isEditing ? 'Save Product Changes' : 'Publish to Customer Feed'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Global Category Request Modal (Moderated Flow) */}
      <Modal
        visible={showCategoryModal}
        transparent={true}
        animationType="fade"
        aria-modal={true}
        accessibilityViewIsModal={true}
        onRequestClose={() => {
          safeBlurActiveElement();
          setShowCategoryModal(false);
        }}
      >
        <View style={styles.catModalBackdrop}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.modalHeaderOrb}>
                  <Ionicons name="git-pull-request-outline" size={18} color="#16a34a" />
                </View>
                <Text style={styles.modalTitle}>Request New Category</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Propose a new category for admin review. Pending requests do not appear in customer apps until approved.
            </Text>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalLabel}>Proposed Category Name *</Text>
              <TextInput
                style={styles.modalInput}
                value={newCatName}
                onChangeText={setNewCatName}
                placeholder="e.g. Exotic Herbs & Microgreens"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalLabel}>Catalog Type *</Text>
              <View style={styles.typeSelectorRow}>
                <TouchableOpacity
                  style={[styles.typeBtn, newCatType === 'GROCERY' && styles.typeBtnActive]}
                  onPress={() => {
                    setNewCatType('GROCERY');
                    if (newCatIcon === '🍛') setNewCatIcon('🥦');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.typeEmoji}>🥦</Text>
                  <Text style={[styles.typeBtnText, newCatType === 'GROCERY' && styles.typeBtnTextActive]}>
                    GROCERY
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, newCatType === 'FOOD' && styles.typeBtnActive]}
                  onPress={() => {
                    setNewCatType('FOOD');
                    if (newCatIcon === '🥦') setNewCatIcon('🍛');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.typeEmoji}>🍛</Text>
                  <Text style={[styles.typeBtnText, newCatType === 'FOOD' && styles.typeBtnTextActive]}>
                    FOOD / MEALS
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Suggested Parent Category (Optional) */}
            <View style={styles.modalInputGroup}>
              <Text style={styles.modalLabel}>Suggested Parent Category (Optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                <TouchableOpacity
                  style={[
                    styles.parentCatChip,
                    !newCatParentId && styles.parentCatChipActive
                  ]}
                  onPress={() => setNewCatParentId('')}
                >
                  <Text style={[styles.parentCatChipText, !newCatParentId && styles.parentCatChipTextActive]}>
                    None (Top-Level)
                  </Text>
                </TouchableOpacity>
                {displayCategories.map((c) => {
                  const catId = c._id || c.id;
                  const isSelected = newCatParentId === catId;
                  return (
                    <TouchableOpacity
                      key={catId}
                      style={[
                        styles.parentCatChip,
                        isSelected && styles.parentCatChipActive
                      ]}
                      onPress={() => setNewCatParentId(catId)}
                    >
                      <Text style={[styles.parentCatChipText, isSelected && styles.parentCatChipTextActive]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalLabel}>Icon Emoji</Text>
              <TextInput
                style={styles.modalInput}
                value={newCatIcon}
                onChangeText={setNewCatIcon}
                placeholder={newCatType === 'FOOD' ? '🍛' : '🥦'}
                placeholderTextColor={colors.textMuted}
                maxLength={10}
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalLabel}>Reason / Store Justification (Optional)</Text>
              <TextInput
                style={[styles.modalInput, { minHeight: 46 }]}
                value={newCatReason}
                onChangeText={setNewCatReason}
                placeholder="Why is this category needed for your products?"
                placeholderTextColor={colors.textMuted}
                multiline
              />
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.catModalCancelBtn}
                onPress={() => setShowCategoryModal(false)}
                disabled={isRequestingCategory}
              >
                <Text style={styles.catModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.catModalSubmitBtn}
                onPress={handleRequestCategorySubmit}
                disabled={isRequestingCategory}
              >
                {isRequestingCategory ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.catModalSubmitText}>Submit Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  useModalFocus(Boolean(stockModalItem));

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
          onPress={() => {
            safeBlurActiveElement();
            navigation.navigate('AddProduct');
          }}
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
                      ₹{item.price} <Text style={styles.invUnit}>/ {item.unit || 'pack'}</Text>
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <Text
                        style={[
                          styles.stockBadgeText,
                          { color: stockQty > 0 ? '#16a34a' : '#dc2626' }
                        ]}
                      >
                        Stock: {stockQty} packs ({item.unit || 'pack'})
                      </Text>
                      {item.subCategory ? (
                        <View style={styles.subCatBadge}>
                          <Ionicons name="pricetag-outline" size={10} color="#0284c7" />
                          <Text style={styles.subCatBadgeText}>{item.subCategory}</Text>
                        </View>
                      ) : null}
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

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      style={styles.editListingBtn}
                      onPress={() => {
                        safeBlurActiveElement();
                        navigation.navigate('AddProduct', { product: item });
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="pencil-outline" size={16} color="#0284c7" />
                    </TouchableOpacity>
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
        aria-modal={true}
        accessibilityViewIsModal={true}
        onRequestClose={() => {
          safeBlurActiveElement();
          setStockModalItem(null);
        }}
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
  const { stats, orders, vendor } = usePartner();

  const completedOrders = (orders || []).filter(
    (o) => o.status === 'DELIVERED'
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <WaterBackground />

      <View style={[styles.headerBar, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20) + 10 }]}>
        <Text style={styles.headerBarTitle}>Merchant Ledger & Reports</Text>
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
        {/* Real Revenue & Performance Hero Card */}
        <GlassCard style={styles.wedHeroCard} showSheen={true} tint="green">
          <View style={styles.wedHeroRow}>
            <View style={styles.wedIconOrb}>
              <Ionicons name="wallet-outline" size={26} color="#16a34a" />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.wedHeroTitle}>Today's Delivered Revenue</Text>
              <Text style={styles.wedHeroAmount}>
                ₹{stats.todaySales || 0}
              </Text>
              <View style={styles.bankDirectTag}>
                <Ionicons name="checkmark-circle" size={13} color="#15803d" />
                <Text style={styles.bankDirectText}>
                  {vendor?.storeName || 'Merchant Store'} • {stats.todayDeliveredCount || completedOrders.length} Delivered Today
                </Text>
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Real Stats Metrics Grid */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <GlassCard style={{ flex: 1, padding: 14, alignItems: 'center' }}>
            <Ionicons name="receipt-outline" size={20} color="#0284c7" />
            <Text style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: '700' }}>Today's Orders</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a', marginTop: 2 }}>{stats.todayOrdersCount || 0}</Text>
          </GlassCard>
          <GlassCard style={{ flex: 1, padding: 14, alignItems: 'center' }}>
            <Ionicons name="checkmark-done-circle-outline" size={20} color="#16a34a" />
            <Text style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: '700' }}>Lifetime Completed</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a', marginTop: 2 }}>{stats.allTimeDelivered || completedOrders.length || 0}</Text>
          </GlassCard>
        </View>

        {/* Completed Orders Transaction History */}
        <Text style={styles.sectionHeaderTitle}>Completed Order Ledger</Text>
        {completedOrders.length === 0 ? (
          <GlassCard style={[styles.settleCard, { padding: 24, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="document-text-outline" size={40} color="#94a3b8" />
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 8 }}>
              No completed orders yet
            </Text>
            <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
              Delivered customer orders and their settlement revenue will be recorded here in real-time.
            </Text>
          </GlassCard>
        ) : (
          completedOrders.map((item, idx) => {
            const orderNum = item.orderNumber || item._id?.slice(-6) || `ORD-${idx + 1}`;
            const total = item.pricing?.grandTotal ?? item.totalAmount ?? 0;
            const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recent';
            return (
              <GlassCard key={item._id || idx} style={styles.settleCard} showSheen={false}>
                <View style={styles.settleRowTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.settleDate}>Order #{orderNum}</Text>
                      <Text style={{ fontSize: 11, color: '#64748b' }}>{dateStr}</Text>
                    </View>
                  </View>
                  <Text style={styles.settleAmount}>+₹{total}</Text>
                </View>

                <View style={styles.settleRowBottom}>
                  <View style={styles.settleStatusBadge}>
                    <Text style={styles.settleStatusText}>DELIVERED</Text>
                  </View>
                  <Text style={styles.settleRefText}>
                    {item.items?.length || 1} item(s) • {item.paymentMethod || 'Online'}
                  </Text>
                </View>
              </GlassCard>
            );
          })
        )}
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
  errorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 6
  },
  errorPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b91c1c'
  },
  imagePreviewContainer: {
    marginTop: 8,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    backgroundColor: '#f8fafc',
    position: 'relative'
  },
  imagePreviewLarge: {
    width: '100%',
    height: 160,
    backgroundColor: '#f1f5f9'
  },
  imageOverlayActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0'
  },
  imageActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9'
  },
  imageActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a'
  },
  imageRemoveBtn: {
    backgroundColor: '#fee2e2'
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  uploadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff'
  },
  uploadDropZone: {
    marginTop: 8,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  uploadDropZoneIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(234, 88, 12, 0.1)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  uploadDropZoneTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  uploadDropZoneSub: {
    fontSize: 12,
    color: '#64748b'
  },
  uploadErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8
  },
  uploadErrorText: {
    flex: 1,
    fontSize: 12,
    color: '#b91c1c',
    fontWeight: '500'
  },
  uploadRetryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#dc2626'
  },
  uploadRetryText: {
    fontSize: 11,
    fontWeight: '700',
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
  editListingBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(2, 132, 199, 0.1)'
  },
  subCatSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226, 232, 240, 0.7)'
  },
  subCatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6
  },
  subCatLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  subCatHelper: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 8
  },
  subCatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  subCatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(226, 232, 240, 0.85)'
  },
  subCatChipActive: {
    backgroundColor: 'rgba(234, 88, 12, 0.12)',
    borderColor: '#ea580c'
  },
  subCatChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569'
  },
  subCatChipTextActive: {
    color: '#ea580c',
    fontWeight: '800'
  },
  subCatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
    alignSelf: 'flex-start'
  },
  subCatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284c7'
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
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  addCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(22, 163, 74, 0.1)'
  },
  addCatBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a'
  },
  catEmptyState: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    alignItems: 'center',
    gap: 6
  },
  catEmptyText: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '600'
  },
  createCatPromptBtn: {
    backgroundColor: '#ea580c',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4
  },
  createCatPromptText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff'
  },
  catModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContentCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  modalHeaderOrb: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18
  },
  modalInputGroup: {
    marginBottom: 14
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a'
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 10
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc'
  },
  typeBtnActive: {
    borderColor: '#16a34a',
    backgroundColor: 'rgba(22, 163, 74, 0.08)'
  },
  typeEmoji: {
    fontSize: 16
  },
  typeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b'
  },
  typeBtnTextActive: {
    color: '#16a34a'
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10
  },
  catModalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9'
  },
  catModalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b'
  },
  catModalSubmitBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    minWidth: 110,
    alignItems: 'center'
  },
  catModalSubmitText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff'
  },
  parentCatChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc'
  },
  parentCatChipActive: {
    borderColor: '#16a34a',
    backgroundColor: 'rgba(22, 163, 74, 0.1)'
  },
  parentCatChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b'
  },
  parentCatChipTextActive: {
    color: '#16a34a',
    fontWeight: '700'
  }
});
