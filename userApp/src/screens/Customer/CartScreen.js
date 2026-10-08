import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { useCart } from '../../context/CartContext';
import { useCustomerSocket } from '../../context/SocketContext';
import { useAuthGate } from '../../hooks/useAuthGate';
import { apiService } from '../../services/api';
import { colors } from '../../theme/colors';
import { showAlert } from '../../utils/alert';
import { SafeAreaWrapper } from '../../components/SafeAreaWrapper';
import { SafeImage } from '../../components/common/SafeImage';

export const CartScreen = ({ navigation }) => {
  const { requireLogin } = useAuthGate();
  const {
    items,
    vendorId,
    vendorName,
    vendorStoreType,
    updateQuantity,
    removeFromCart,
    clearCart,
    billSummary
  } = useCart();

  const { productStockUpdate, watchCatalog } = useCustomerSocket();
  const [vendorDetails, setVendorDetails] = useState(null);

  useEffect(() => {
    if (vendorId) {
      apiService.getVendorById(vendorId).then((res) => {
        if (res.success && res.vendor) {
          setVendorDetails(res.vendor);
        }
      });
    }
  }, [vendorId]);

  useEffect(() => {
    let release = () => {};
    const subscribe = () => { release(); release = watchCatalog(vendorId); };
    if (navigation.isFocused?.() !== false) subscribe();
    const onFocus = navigation.addListener('focus', subscribe);
    const onBlur = navigation.addListener('blur', () => release());
    return () => { release(); onFocus(); onBlur(); };
  }, [vendorId, navigation, watchCatalog]);

  const isStoreOpen = vendorDetails ? vendorDetails.isOpen !== false : true;

  const handleCheckout = () => {
    if (items.length === 0) return;
    if (!isStoreOpen) {
      const msg = `${vendorName || 'This store'} is currently closed and not accepting new orders right now. Please check back when the store comes online.`;
      showAlert('Store Closed', msg);
      return;
    }

    const outOfStockItems = items.filter(
      (it) => it.product?.inStock === false || (it.product?.stockQty !== undefined && it.product?.stockQty <= 0)
    );
    if (outOfStockItems.length > 0) {
      showAlert('Out of Stock', `"${outOfStockItems[0].product?.name || 'An item'}" in your cart is out of stock. Please remove it to proceed.`);
      return;
    }

    const excessItems = items.filter(
      (it) => it.product?.stockQty !== undefined && it.quantity > it.product?.stockQty
    );
    if (excessItems.length > 0) {
      showAlert('Limited Stock', `Only ${excessItems[0].product?.stockQty} unit(s) of "${excessItems[0].product?.name}" are available in stock. Please reduce the quantity.`);
      return;
    }

    if (billSummary.isMinOrderMet === false && (billSummary.minOrder || 0) > 0) {
      showAlert(
        'Minimum Order Required',
        `Minimum order value for ${vendorName || 'this store'} is ₹${billSummary.minOrder}. Please add ₹${billSummary.minOrderShortfall} more to proceed.`
      );
      return;
    }

    // FLOW 3 Contextual Gate: require login before navigating to Checkout
    requireLogin({ type: 'CHECKOUT' }, () => {
      navigation.navigate('Checkout');
    });
  };

  return (
    <SafeAreaWrapper style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <Header navigation={navigation} title="My Cart" showCart={false} showBack />

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cart-outline" size={54} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptyDesc}>
            Explore farm fresh veggies, thalis, and sweets from local stores.
          </Text>
          <TouchableOpacity
            style={styles.shopBtn}
            onPress={() => navigation.navigate('Home')}
            activeOpacity={0.85}
          >
            <Text style={styles.shopBtnText}>Browse Stores</Text>
            <Ionicons name="arrow-forward" size={16} color="#ffffff" />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scrollFlex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Store Identification Badge */}
            <View style={styles.storeBadge}>
              <View style={styles.storeIconWrap}>
                <Ionicons
                  name={vendorStoreType === 'HOME_CHEF' ? 'restaurant' : 'leaf'}
                  size={16}
                  color="#15803d"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.storeBadgeLabel}>ORDERING FROM</Text>
                <Text style={styles.storeBadgeName}>{vendorName || 'Selected Store'}</Text>
              </View>
              <TouchableOpacity onPress={clearCart} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Clear Cart</Text>
              </TouchableOpacity>
            </View>

            {/* Closed Warning Banner if store is currently offline */}
            {!isStoreOpen && (
              <View style={styles.cartClosedBanner}>
                <Ionicons name="alert-circle" size={20} color="#b91c1c" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartClosedTitle}>STORE CURRENTLY CLOSED</Text>
                  <Text style={styles.cartClosedSub}>
                    {vendorName || 'Selected store'} is offline and not accepting orders right now. Checkout is paused until the store goes online.
                  </Text>
                </View>
              </View>
            )}

            {/* Cart Items List */}
            <Text style={styles.sectionTitle}>Cart Items ({billSummary.totalCount})</Text>
            {items.map((item) => {
              const prod = item.product || {};
              const prodId = prod._id || prod.id || item.productId || 'item';
              const isProdOutOfStock = prod.inStock === false || (prod.stockQty !== undefined && prod.stockQty <= 0);
              const isProdExcess = !isProdOutOfStock && prod.stockQty !== undefined && item.quantity > prod.stockQty;

              return (
                <View key={prodId} style={[styles.cartCard, isProdOutOfStock && { borderColor: '#fca5a5', backgroundColor: '#fff5f5' }]}>
                  <SafeImage
                    source={{ uri: prod.image }}
                    style={styles.itemImage}
                    placeholderIcon="fast-food-outline"
                    placeholderIconSize={24}
                  />

                  <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {prod.name || 'Produce Item'}
                    </Text>
                    <Text style={styles.itemPrice}>
                      ₹{prod.price || 0} <Text style={styles.itemUnit}>/ {prod.unit || 'unit'}</Text>
                    </Text>
                    {isProdOutOfStock && (
                      <Text style={styles.cartSoldOutText}>🔴 Out of stock • remove to proceed</Text>
                    )}
                    {isProdExcess && (
                      <Text style={styles.cartExcessText}>⚠️ Only {prod.stockQty} left in stock</Text>
                    )}
                  </View>

                  <View style={styles.rightCol}>
                    <TouchableOpacity
                      onPress={() => removeFromCart(prodId)}
                      style={styles.trashBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    </TouchableOpacity>

                    <View style={styles.stepperBox}>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => updateQuantity(prodId, -1)}
                      >
                        <Text style={styles.stepperBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.stepperQty}>{item.quantity}</Text>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => updateQuantity(prodId, 1)}
                      >
                        <Text style={styles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Bill Details */}
            <Text style={styles.sectionTitle}>Bill Details</Text>
            <View style={styles.billCard}>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Item Total</Text>
                <Text style={styles.billVal}>₹{billSummary.itemsTotal ?? billSummary.subtotal ?? 0}</Text>
              </View>

              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Delivery Partner Fee</Text>
                <Text
                  style={[
                    styles.billVal,
                    billSummary.deliveryFee === 0 && { color: '#16a34a', fontWeight: '700' }
                  ]}
                >
                  {billSummary.deliveryFee === 0 ? 'FREE' : `₹${billSummary.deliveryFee}`}
                </Text>
              </View>

              {billSummary.taxes > 0 && (
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Govt. Restaurant GST (5%)</Text>
                  <Text style={styles.billVal}>₹{billSummary.taxes}</Text>
                </View>
              )}

              {(billSummary.itemsTotal ?? billSummary.subtotal ?? 0) < 200 && (
                <Text style={styles.freeHint}>
                  💡 Add ₹{200 - (billSummary.itemsTotal ?? billSummary.subtotal ?? 0)} more for FREE delivery
                </Text>
              )}

              {!billSummary.isMinOrderMet && (billSummary.minOrder || 0) > 0 && (
                <View style={styles.minOrderAlert}>
                  <Ionicons name="alert-circle" size={16} color="#b45309" />
                  <Text style={styles.minOrderAlertText}>
                    Min order for {vendorName || 'this store'} is ₹{billSummary.minOrder}. Add ₹{billSummary.minOrderShortfall} more items to proceed.
                  </Text>
                </View>
              )}

              <View style={[styles.billRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Grand Total</Text>
                <Text style={styles.totalVal}>₹{billSummary.grandTotal ?? billSummary.total ?? 0}</Text>
              </View>
            </View>

            <View style={styles.cancellationPolicy}>
              <Ionicons name="information-circle-outline" size={16} color="#64748b" />
              <Text style={styles.policyText}>
                Orders once accepted by the kitchen/farmer cannot be cancelled to avoid fresh food wastage.
              </Text>
            </View>
          </ScrollView>

          {/* Sticky Bottom Bar */}
          <View style={styles.bottomBar}>
            <View>
              <Text style={styles.bottomLabel}>TO PAY</Text>
              <Text style={styles.bottomTotal}>₹{billSummary.grandTotal ?? billSummary.total ?? 0}</Text>
            </View>
            <TouchableOpacity
              style={[styles.checkoutBtn, !isStoreOpen && { backgroundColor: '#64748b' }]}
              onPress={handleCheckout}
              activeOpacity={0.85}
            >
              <Text style={styles.checkoutText}>
                {isStoreOpen ? 'Proceed to Checkout' : 'Store is Closed'}
              </Text>
              <Ionicons name={isStoreOpen ? 'arrow-forward' : 'lock-closed'} size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  scrollFlex: {
    flex: 1
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a'
  },
  emptyDesc: {
    fontSize: 13.5,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
    lineHeight: 20
  },
  shopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8
  },
  shopBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15
  },
  storeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 16,
    gap: 12
  },
  storeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  storeBadgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803d',
    letterSpacing: 0.5
  },
  storeBadgeName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0f172a'
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  clearBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#dc2626'
  },
  sectionTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 10
  },
  cartCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
    resizeMode: 'cover'
  },
  itemImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemInfo: {
    flex: 1
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  itemPrice: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#15803d',
    marginTop: 4
  },
  itemUnit: {
    fontSize: 11.5,
    color: '#64748b',
    fontWeight: '500'
  },
  cartSoldOutText: {
    fontSize: 10.5,
    color: '#dc2626',
    fontWeight: '700',
    marginTop: 3
  },
  cartExcessText: {
    fontSize: 10.5,
    color: '#d97706',
    fontWeight: '700',
    marginTop: 3
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 8
  },
  trashBtn: {
    padding: 2
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86efac',
    overflow: 'hidden'
  },
  stepperBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  stepperBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#15803d'
  },
  stepperQty: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    minWidth: 24,
    paddingHorizontal: 2,
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: 16
  },
  billCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  billLabel: {
    fontSize: 13,
    color: '#64748b'
  },
  billVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a'
  },
  freeHint: {
    fontSize: 11.5,
    color: '#d97706',
    fontWeight: '600',
    marginBottom: 8
  },
  minOrderAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef3c7',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginVertical: 8
  },
  minOrderAlertText: {
    fontSize: 11.5,
    color: '#92400e',
    fontWeight: '600',
    flex: 1
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
    marginTop: 4,
    marginBottom: 0
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a'
  },
  totalVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#15803d'
  },
  cancellationPolicy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4
  },
  policyText: {
    fontSize: 11.5,
    color: '#64748b',
    flex: 1,
    lineHeight: 16
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8
  },
  bottomLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
    letterSpacing: 0.5
  },
  bottomTotal: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a'
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 22,
    gap: 8
  },
  checkoutText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '700'
  },
  cartClosedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16
  },
  cartClosedTitle: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  cartClosedSub: {
    color: '#b91c1c',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16
  }
});
