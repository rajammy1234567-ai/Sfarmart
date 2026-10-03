import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  StatusBar,
  Platform,
  Animated,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { LiveOrderMap } from '../../components/LiveOrderMap';
import { apiService } from '../../services/api';
import { useCustomerSocket } from '../../context/SocketContext';
import { useApp } from '../../context/AppContext';
import { colors } from '../../theme/colors';
import { isValidRiderFix, isRealisticMovement, validCoordinates } from '../../utils/trackingUtils';

const TRACKING_STEPS = [
  { key: 'NEW_ORDER', title: 'Placed', icon: 'receipt-outline' },
  { key: 'ACCEPTED', title: 'Accepted', icon: 'checkmark-circle-outline' },
  { key: 'PREPARING', title: 'Preparing', icon: 'flame-outline' },
  { key: 'READY_FOR_RIDER', title: 'Order Packed', icon: 'cube-outline' },
  { key: 'OUT_FOR_DELIVERY', title: 'On Way', icon: 'bicycle-outline' },
  { key: 'DELIVERED', title: 'Delivered', icon: 'home-outline' }
];

const getStepIndex = (status) => {
  if (status === 'RIDER_ASSIGNED') return 3.3;
  if (status === 'RIDER_ARRIVED_STORE') return 3.7;
  const idx = TRACKING_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
};

const AnimatedLiveStepper = ({ steps, currentStepIdx }) => {
  const progressAnim = useRef(new Animated.Value(currentStepIdx)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: currentStepIdx,
      duration: 650,
      useNativeDriver: false
    }).start();
  }, [currentStepIdx]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 850,
          useNativeDriver: Platform.OS !== 'web'
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 850,
          useNativeDriver: Platform.OS !== 'web'
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const totalSteps = steps.length;
  const lineWidthPercent = progressAnim.interpolate({
    inputRange: [0, Math.max(1, totalSteps - 1)],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp'
  });

  return (
    <View style={styles.stepperContainer}>
      {/* Background Track Line */}
      <View style={styles.trackLineBackground} />
      {/* Animated Filled Progress Line */}
      <Animated.View style={[styles.trackLineFilled, { width: lineWidthPercent }]} />

      <View style={styles.stepperBar}>
        {steps.map((step, idx) => {
          const isDone = idx <= currentStepIdx;
          const isCurrent = idx === currentStepIdx;

          return (
            <View key={step.key} style={styles.stepItem}>
              {isCurrent ? (
                <Animated.View
                  style={[
                    styles.stepCircle,
                    styles.stepCircleDone,
                    styles.stepCircleCurrent,
                    { transform: [{ scale: pulseAnim }] }
                  ]}
                >
                  <Ionicons name={step.icon} size={14} color="#ffffff" />
                </Animated.View>
              ) : (
                <View
                  style={[
                    styles.stepCircle,
                    isDone && styles.stepCircleDone
                  ]}
                >
                  <Ionicons
                    name={step.icon}
                    size={14}
                    color={isDone ? '#ffffff' : '#94a3b8'}
                  />
                </View>
              )}
              <Text style={[styles.stepLabel, isDone && styles.stepLabelActive]}>
                {step.title}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export const OrderTrackingScreen = ({ route, navigation }) => {
  const { isAuthenticated, userProfile } = useApp();
  const [activeOrder, setActiveOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [, setIsRefreshing] = useState(false);
  const { activeOrderUpdate, riderLocationUpdate, trackOrder, leaveOrder, reconnectCount } = useCustomerSocket();
  const [riderLiveLocation, setRiderLiveLocation] = useState(null);
  const [travelledTrail, setTravelledTrail] = useState([]);
  const [nowTs, setNowTs] = useState(Date.now());

  const initialRouteParamHandledRef = useRef(null);
  const lastTrackedOrderIdRef = useRef(null);
  const lastAcceptedTsRef = useRef(0);
  const prevRiderFixRef = useRef(null);
  const consecutiveRejectionsRef = useRef(0);
  const isMountedRef = useRef(true);

  // Keep a 1-second clock to render fresh elapsed seconds
  useEffect(() => {
    const clockTimer = setInterval(() => {
      if (isMountedRef.current) setNowTs(Date.now());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Cleanup live tracking on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      leaveOrder();
    };
  }, [leaveOrder]);

  // On reconnect, fetch an authorized latest-location snapshot from the server
  useEffect(() => {
    if (reconnectCount > 1 && activeOrder?._id) {
      console.log('⚡ [OrderTrackingScreen] Reconnected to socket, fetching authorized snapshot for order:', activeOrder._id);
      apiService.getOrderLocation(activeOrder._id).then((res) => {
        if (!isMountedRef.current || !res?.success) return;
        const snap = res;
        setActiveOrder((prev) => (prev ? {
          ...prev,
          status: snap.status || prev.status,
          rider: snap.rider || prev.rider,
          riderLocation: snap.riderLocation || prev.riderLocation,
          deliveryRoute: snap.deliveryRoute || prev.deliveryRoute
        } : null));

        if (snap.riderLocation && isValidRiderFix(snap.riderLocation, activeOrder, lastAcceptedTsRef.current)) {
          const ts = new Date(snap.riderLocation.at).getTime();
          lastAcceptedTsRef.current = ts;
          prevRiderFixRef.current = snap.riderLocation;
          consecutiveRejectionsRef.current = 0;
          setRiderLiveLocation(snap.riderLocation);
        }

        if (Array.isArray(snap.deliveryRoute) && snap.deliveryRoute.length > 0) {
          setTravelledTrail(
            snap.deliveryRoute.map((pt) => ({
              lat: pt.lat,
              lng: pt.lng,
              latitude: pt.lat,
              longitude: pt.lng
            }))
          );
        }
      }).catch((err) => {
        console.warn('⚡ [OrderTrackingScreen] Failed to fetch snapshot on reconnect:', err);
      });
    }
  }, [reconnectCount, activeOrder?._id]);

  // Handle live rider GPS updates with strict validation
  useEffect(() => {
    if (!riderLocationUpdate || !activeOrder?._id) return;

    // 1. Validate fix matches active order, assigned rider, valid coordinates, strictly increasing timestamp
    if (!isValidRiderFix(riderLocationUpdate, activeOrder, lastAcceptedTsRef.current)) {
      return;
    }

    // 2. Filter out unrealistic GPS teleportation / sensor jumps (> 130 km/h) with outage & bad-fix recovery
    if (!isRealisticMovement(prevRiderFixRef.current, riderLocationUpdate, consecutiveRejectionsRef.current)) {
      consecutiveRejectionsRef.current += 1;
      console.warn(`[OrderTrackingScreen] Rejected unrealistic jump fix (streak: ${consecutiveRejectionsRef.current}):`, riderLocationUpdate);
      return;
    }

    consecutiveRejectionsRef.current = 0;
    const ts = new Date(riderLocationUpdate.at).getTime();
    lastAcceptedTsRef.current = ts;
    prevRiderFixRef.current = riderLocationUpdate;
    setRiderLiveLocation(riderLocationUpdate);

    // Append to travelled trail for display on map
    setTravelledTrail((prev) => [
      ...prev,
      {
        lat: riderLocationUpdate.lat,
        lng: riderLocationUpdate.lng,
        latitude: riderLocationUpdate.lat,
        longitude: riderLocationUpdate.lng
      }
    ]);
  }, [riderLocationUpdate, activeOrder]);

  // Join order tracking room only when tracked order ID actually changes
  useEffect(() => {
    const currentId = activeOrder?._id ? String(activeOrder._id) : null;
    if (currentId && currentId !== lastTrackedOrderIdRef.current) {
      lastTrackedOrderIdRef.current = currentId;
      lastAcceptedTsRef.current = 0;
      prevRiderFixRef.current = null;
      setRiderLiveLocation(null);

      // If activeOrder already has riderLocation snapshot, seed it
      if (activeOrder.riderLocation && validCoordinates(activeOrder.riderLocation.lat, activeOrder.riderLocation.lng)) {
        const ts = activeOrder.riderLocation.at ? new Date(activeOrder.riderLocation.at).getTime() : Date.now();
        lastAcceptedTsRef.current = ts;
        prevRiderFixRef.current = activeOrder.riderLocation;
        setRiderLiveLocation(activeOrder.riderLocation);
      }

      // Initialize travelled trail from existing route points if present
      if (Array.isArray(activeOrder.deliveryRoute) && activeOrder.deliveryRoute.length > 0) {
        setTravelledTrail(
          activeOrder.deliveryRoute.map((pt) => ({
            lat: pt.lat,
            lng: pt.lng,
            latitude: pt.lat,
            longitude: pt.lng
          }))
        );
      } else {
        setTravelledTrail([]);
      }

      trackOrder(currentId);
    }
  }, [activeOrder?._id, trackOrder]);

  // Live Socket Status update listener
  useEffect(() => {
    if (activeOrderUpdate && (activeOrderUpdate.orderId || activeOrderUpdate.orderNumber)) {
      const isTarget =
        (activeOrder?._id && String(activeOrder._id) === String(activeOrderUpdate.orderId)) ||
        (activeOrder?.orderNumber && activeOrder.orderNumber === activeOrderUpdate.orderNumber);

      if (isTarget) {
        console.log('⚡ Updating active order state from socket:', activeOrderUpdate.status);
        setActiveOrder((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: activeOrderUpdate.status || prev.status,
            rejectionReason: activeOrderUpdate.rejectionReason !== undefined ? activeOrderUpdate.rejectionReason : prev.rejectionReason,
            statusHistory: activeOrderUpdate.statusHistory || prev.statusHistory,
            rider: activeOrderUpdate.rider || prev.rider
          };
        });
      }

      setOrders((prev) =>
        prev.map((o) => {
          const match =
            (o._id && String(o._id) === String(activeOrderUpdate.orderId)) ||
            (o.orderNumber && o.orderNumber === activeOrderUpdate.orderNumber);
          return match
            ? {
                ...o,
                status: activeOrderUpdate.status || o.status,
                rejectionReason: activeOrderUpdate.rejectionReason !== undefined ? activeOrderUpdate.rejectionReason : o.rejectionReason,
                rider: activeOrderUpdate.rider || o.rider
              }
            : o;
        })
      );
    }
  }, [activeOrderUpdate, activeOrder?._id, activeOrder?.orderNumber]);

  // Handle route params order safely on mount or when route param targets a new order
  useEffect(() => {
    let routeOrder = route.params?.order;
    const routeOrderId = route.params?.orderId;
    if (typeof routeOrder === 'string') {
      try {
        routeOrder = JSON.parse(routeOrder);
      } catch {
        routeOrder = null;
      }
    }

    const targetOrderId = routeOrder?._id ? String(routeOrder._id) : (routeOrderId ? String(routeOrderId) : null);
    if (!targetOrderId) return;

    if (initialRouteParamHandledRef.current === targetOrderId) {
      return;
    }

    if (routeOrder && typeof routeOrder === 'object') {
      const currentUserId = (userProfile?._id || userProfile?.id)?.toString();
      const currentUserPhone = userProfile?.phone?.toString();
      const orderCustId = (routeOrder.customer?._id || routeOrder.customer)?.toString();
      const orderCustPhone = (routeOrder.customer?.phone || routeOrder.customerPhone)?.toString();

      const isMine =
        !currentUserId ||
        (currentUserId && orderCustId === currentUserId) ||
        (currentUserPhone && orderCustPhone === currentUserPhone);

      if (isMine) {
        initialRouteParamHandledRef.current = targetOrderId;
        setActiveOrder((prev) => {
          if (prev && String(prev._id) === targetOrderId) return prev;
          return routeOrder;
        });
        setOrders((prev) => {
          const exists = prev.some((o) => String(o._id) === targetOrderId);
          return exists ? prev : [routeOrder, ...prev];
        });
        setIsInitialLoading(false);
      }
    } else if (routeOrderId) {
      initialRouteParamHandledRef.current = targetOrderId;
      setActiveOrder((prev) => {
        if (prev && String(prev._id) === targetOrderId) return prev;
        return prev;
      });
    }
  }, [route.params?.order, route.params?.orderId, userProfile?._id, userProfile?.id, userProfile?.phone]);

  const fetchMyOrders = async (isInitial = false) => {
    if (!isAuthenticated) {
      setOrders([]);
      setActiveOrder(null);
      setIsInitialLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (isInitial && !activeOrder) {
      setIsInitialLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const res = await apiService.getCustomerOrders();
      if (!isMountedRef.current) return;

      if (res && (res.success || res.ok) && Array.isArray(res.orders)) {
        const currentUserId = (userProfile?._id || userProfile?.id)?.toString();
        const currentUserPhone = userProfile?.phone?.toString();

        const myOrders = res.orders.filter((o) => {
          const orderCustId = (o.customer?._id || o.customer)?.toString();
          const orderCustPhone = (o.customer?.phone || o.customerPhone)?.toString();
          if (currentUserId && orderCustId) {
            return orderCustId === currentUserId;
          }
          if (currentUserPhone && orderCustPhone) {
            return orderCustPhone === currentUserPhone;
          }
          return true;
        });

        setOrders(myOrders);
        if (myOrders.length > 0) {
          const directTargetId = route.params?.orderId ? String(route.params.orderId) : null;
          setActiveOrder((prev) => {
            const targetId = directTargetId || (prev?._id ? String(prev._id) : null);
            if (targetId) {
              const matched = myOrders.find((o) => String(o._id) === targetId);
              if (matched) {
                const prevStep = prev ? getStepIndex(prev.status) : -1;
                const matchedStep = getStepIndex(matched.status);
                return {
                  ...(prev || {}),
                  ...matched,
                  status: matchedStep >= prevStep ? matched.status : (prev?.status || matched.status)
                };
              }
            }
            return myOrders[0];
          });
        }
      }
    } catch (e) {
      console.warn('Failed to fetch customer orders (preserving displayed order):', e);
    } finally {
      if (isMountedRef.current) {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  // Reset and synchronize orders whenever auth changes
  useEffect(() => {
    if (!isAuthenticated) {
      setOrders([]);
      setActiveOrder(null);
      setIsInitialLoading(false);
      return;
    }

    fetchMyOrders(true);

    const interval = setInterval(() => {
      fetchMyOrders(false);
    }, 8000);

    return () => clearInterval(interval);
  }, [isAuthenticated, userProfile?._id, userProfile?.id]);

  const currentStepIdx = getStepIndex(activeOrder?.status || 'NEW_ORDER');

  const callStore = (phone) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`).catch((err) => {
        console.warn('Dialer not supported or failed to open:', err);
      });
    }
  };

  const callRider = (phone) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`).catch((err) => {
        console.warn('Dialer not supported or failed to open:', err);
      });
    }
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'NEW_ORDER':
        return {
          title: 'Order Placed with Store ⏳',
          sub: 'Waiting for store to confirm and start preparation.',
          bg: '#eff6ff',
          border: '#bfdbfe',
          textColor: '#1e40af',
          icon: 'time-outline'
        };
      case 'ACCEPTED':
      case 'PREPARING':
        return {
          title: 'Preparing Your Order 🔥',
          sub: 'The kitchen/store is preparing your fresh order and packing it with care.',
          bg: '#fff7ed',
          border: '#fed7aa',
          textColor: '#c2410c',
          icon: 'flame-outline'
        };
      case 'READY_FOR_RIDER':
        return {
          title: 'Done! Order is Packed 📦',
          sub: 'Done! Your order is packed, and soon our delivery partner will pick and deliver to you.',
          bg: '#f0fdf4',
          border: '#86efac',
          textColor: '#15803d',
          icon: 'checkmark-circle'
        };
      case 'RIDER_ASSIGNED':
        return {
          title: 'Delivery Partner Assigned 🛵',
          sub: `${activeOrder?.rider?.name || 'A rider partner'} has been assigned and is heading to the store.`,
          bg: '#eff6ff',
          border: '#93c5fd',
          textColor: '#1d4ed8',
          icon: 'bicycle-outline'
        };
      case 'RIDER_ARRIVED_STORE':
        return {
          title: 'Rider Reached Store 🏪',
          sub: 'Your delivery partner is at the store verifying and packing your items.',
          bg: '#f0fdf4',
          border: '#86efac',
          textColor: '#15803d',
          icon: 'storefront-outline'
        };
      case 'OUT_FOR_DELIVERY':
        return {
          title: 'Out for Delivery 🚴',
          sub: 'Our delivery partner has picked up your package and is on the way to you!',
          bg: '#ecfeff',
          border: '#a5f3fc',
          textColor: '#0e7490',
          icon: 'bicycle-outline'
        };
      case 'DELIVERED':
        return {
          title: 'Order Delivered Successfully 🎉',
          sub: 'Delivered! Enjoy your fresh meal and farm produce.',
          bg: '#f0fdf4',
          border: '#bbf7d0',
          textColor: '#166534',
          icon: 'checkmark-done-circle'
        };
      case 'REJECTED':
      case 'CANCELLED':
        return {
          title: 'Order Cancelled ❌',
          sub: activeOrder?.rejectionReason || 'Store was unable to accept this order.',
          bg: '#fef2f2',
          border: '#fecaca',
          textColor: '#991b1b',
          icon: 'close-circle'
        };
      default:
        return {
          title: 'Order Processing',
          sub: 'Your order is being processed by the store.',
          bg: '#f8fafc',
          border: '#e2e8f0',
          textColor: '#334155',
          icon: 'information-circle-outline'
        };
    }
  };

  const statusInfo = getStatusInfo(activeOrder?.status || 'NEW_ORDER');

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <Header navigation={navigation} title="Live Order Tracker" showCart={false} showBack />
        <View style={styles.loggedOutWrap}>
          <View style={styles.loggedOutIconBox}>
            <Ionicons name="lock-closed-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.loggedOutTitle}>Login to View Live Orders</Text>
          <Text style={styles.loggedOutSub}>
            Sign in to track your current delivery, access order receipts, and get live status updates from the kitchen.
          </Text>
          <TouchableOpacity
            style={styles.loggedOutBtn}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.85}
          >
            <Text style={styles.loggedOutBtnText}>Log In to Your Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <Header navigation={navigation} title="Live Order Tracker" showCart={false} showBack />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* If customer has multiple active/past orders, provide switcher pills */}
        {orders.length > 1 && (
          <View style={styles.orderSwitcherWrap}>
            <Text style={styles.orderSwitcherTitle}>YOUR ACTIVE & PAST ORDERS ({orders.length})</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.orderSwitcherScroll}
            >
              {orders.map((ord, idx) => {
                const isSelected = String(activeOrder?._id) === String(ord._id);
                return (
                  <TouchableOpacity
                    key={ord._id || idx}
                    style={[styles.orderPill, isSelected && styles.orderPillActive]}
                    onPress={() => setActiveOrder(ord)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.orderPillDot, isSelected && styles.orderPillDotActive]} />
                    <Text style={[styles.orderPillText, isSelected && styles.orderPillTextActive]}>
                      #{ord.orderNumber || ord._id?.slice(-6)}
                    </Text>
                    <Text style={[styles.orderPillStatus, isSelected && styles.orderPillStatusActive]}>
                      {(ord.status || 'NEW').replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {activeOrder ? (
          <View style={styles.activeCard}>
            {/* Live Header Status */}
            <View style={styles.activeHeader}>
              <View>
                <Text style={styles.orderNum}>#{activeOrder.orderNumber || activeOrder._id?.slice(-6)}</Text>
                <Text style={styles.vendorName}>
                  {activeOrder.vendor?.storeName || 'Partner Store'}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  activeOrder.status === 'DELIVERED'
                    ? styles.statusDelivered
                    : activeOrder.status === 'REJECTED'
                    ? styles.statusRejected
                    : styles.statusLive
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    activeOrder.status === 'DELIVERED'
                      ? { color: '#15803d' }
                      : activeOrder.status === 'REJECTED'
                      ? { color: '#b91c1c' }
                      : { color: '#1e40af' }
                  ]}
                >
                  {(activeOrder.status || 'NEW_ORDER').replace(/_/g, ' ')}
                </Text>
              </View>
            </View>

            {/* Prominent Live Status Announcement Card */}
            <View
              style={[
                styles.statusAnnouncementBox,
                {
                  backgroundColor: statusInfo.bg,
                  borderColor: statusInfo.border
                }
              ]}
            >
              <View style={styles.statusAnnouncementIconBox}>
                <Ionicons name={statusInfo.icon} size={22} color={statusInfo.textColor} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.statusAnnouncementTitle, { color: statusInfo.textColor }]}>
                  {statusInfo.title}
                </Text>
                <Text style={[styles.statusAnnouncementSub, { color: statusInfo.textColor }]}>
                  {statusInfo.sub}
                </Text>
              </View>
            </View>

            {/* Assigned Rider Card (if rider is assigned or order in delivery) */}
            {(activeOrder.rider || ['RIDER_ASSIGNED', 'RIDER_ARRIVED_STORE', 'OUT_FOR_DELIVERY'].includes(activeOrder.status)) && (
              <View style={styles.riderCard}>
                <View style={styles.riderCardHeader}>
                  <View style={styles.riderAvatar}>
                    <Text style={styles.riderInitial}>
                      {(activeOrder.rider?.name || 'G').charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.riderName}>{activeOrder.rider?.name || 'Assigned rider'}</Text>
                      <View style={styles.riderRatingPill}>
                        <Ionicons name="star" size={10} color="#f59e0b" />
                        <Text style={styles.riderRatingText}>{activeOrder.rider?.rating || '4.9'}</Text>
                      </View>
                    </View>
                    <Text style={styles.riderVehicle}>
                      {activeOrder.rider?.vehicle?.model || 'Hero Splendor'} • {activeOrder.rider?.vehicle?.plateNumber || 'PB-10-AB-1234'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.callRiderBtn}
                    onPress={() => callRider(activeOrder.rider?.phone)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="call" size={15} color="#ffffff" />
                    <Text style={styles.callRiderText}>Call</Text>
                  </TouchableOpacity>
                </View>

                {/* Live GPS Telemetry Bar - consistent freshness and truthful speed */}
                {(() => {
                  const fixTs = riderLiveLocation?.at ? new Date(riderLiveLocation.at).getTime() : 0;
                  const ageSeconds = fixTs ? Math.max(0, Math.floor((nowTs - fixTs) / 1000)) : null;
                  const isGpsOffline = ageSeconds === null || ageSeconds >= 60;
                  const isGpsStale = ageSeconds !== null && ageSeconds >= 15 && ageSeconds < 60;

                  return (
                    <View style={[styles.liveGpsBar, isGpsOffline ? { backgroundColor: '#f1f5f9' } : isGpsStale ? { backgroundColor: '#fffbeb' } : {}]}>
                      <View
                        style={[
                          styles.liveGpsPulseDot,
                          isGpsOffline
                            ? { backgroundColor: '#94a3b8' }
                            : isGpsStale
                            ? { backgroundColor: '#d97706' }
                            : { backgroundColor: '#16a34a' }
                        ]}
                      />
                      <Text
                        style={[
                          styles.liveGpsText,
                          isGpsOffline
                            ? { color: '#64748b' }
                            : isGpsStale
                            ? { color: '#92400e' }
                            : { color: '#15803d' }
                        ]}
                      >
                        {!riderLiveLocation
                          ? 'Waiting for rider GPS signal...'
                          : isGpsOffline
                          ? `Rider GPS offline • Last fix ${Math.floor(ageSeconds / 60)}m ago`
                          : isGpsStale
                          ? `GPS signal stale • Last update ${ageSeconds}s ago`
                          : `LIVE GPS: ${riderLiveLocation.speed > 1.5 ? `Moving at ~${Math.round(riderLiveLocation.speed)} km/h` : 'Stationary at stop'} • ${ageSeconds === 0 ? 'Just now' : `${ageSeconds}s ago`}`}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            )}

            {/* Live Interactive GPS Radar Map with Rider Marker & Real-Time Tracking */}
            {(activeOrder.rider || ['RIDER_ASSIGNED', 'RIDER_ARRIVED_STORE', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(activeOrder.status)) && (
              <LiveOrderMap
                order={activeOrder}
                riderLocation={riderLiveLocation}
                rider={activeOrder.rider}
                travelledTrail={travelledTrail}
              />
            )}

            {/* OTP Banner */}
            <View style={styles.otpBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.otpLabel}>DELIVERY CONFIRMATION OTP</Text>
                <Text style={styles.otpCode}>{activeOrder.deliveryOtp || '4819'}</Text>
                <Text style={styles.otpSub}>Share with rider only when order arrives</Text>
              </View>
              <Ionicons name="key-outline" size={28} color="#15803d" />
            </View>

            {/* Live Stepper */}
            {activeOrder.status !== 'REJECTED' ? (
              <AnimatedLiveStepper steps={TRACKING_STEPS} currentStepIdx={currentStepIdx} />
            ) : (
              <View style={styles.rejectionNotice}>
                <Ionicons name="close-circle" size={22} color="#ef4444" />
                <Text style={styles.rejectionText}>
                  Order was rejected: {activeOrder.rejectionReason || 'Store is currently unavailable'}
                </Text>
              </View>
            )}

            {/* Ordered Items Summary */}
            <View style={styles.itemsSummary}>
              <Text style={styles.itemsTitle}>ORDER DETAILS</Text>
              {activeOrder.items?.map((item, idx) => {
                const qty = item.qty ?? item.quantity ?? 1;
                const price = item.price || 0;
                return (
                  <View key={idx} style={styles.itemRow}>
                    <Text style={styles.itemName}>
                      {qty}x {item.name || 'Produce Item'}
                    </Text>
                    <Text style={styles.itemPrice}>₹{item.lineTotal || price * qty}</Text>
                  </View>
                );
              })}

              <View style={styles.totalDivider} />
              <View style={styles.itemRow}>
                <Text style={styles.totalLabel}>Total Paid / Payable</Text>
                <Text style={styles.totalVal}>
                  ₹{activeOrder.pricing?.grandTotal || activeOrder.totalAmount || 0}
                </Text>
              </View>
            </View>

            {/* Store Contact Button */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={styles.callStoreBtn}
                onPress={() => callStore(activeOrder.vendor?.phone)}
                activeOpacity={0.85}
              >
                <Ionicons name="call" size={16} color="#ffffff" />
                <Text style={styles.callStoreText}>Call Store / Kitchen</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.refreshOrderBtn}
                onPress={() => fetchMyOrders(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh" size={16} color="#475569" />
              </TouchableOpacity>
            </View>
          </View>
        ) : isInitialLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading live tracking...</Text>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={48} color="#94a3b8" />
            <Text style={styles.emptyCardTitle}>No Recent Orders</Text>
            <Text style={styles.emptyCardSub}>Place an order to see live real-time preparation steps.</Text>
            <TouchableOpacity
              style={styles.browseStoresBtn}
              onPress={() => navigation.navigate('Home')}
            >
              <Text style={styles.browseStoresText}>Browse Stores</Text>
            </TouchableOpacity>
          </View>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  activeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: 'rgba(15, 23, 42, 0.08)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 4
  },
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  orderNum: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a'
  },
  vendorName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#16a34a',
    marginTop: 2
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  statusLive: {
    backgroundColor: '#eff6ff'
  },
  statusDelivered: {
    backgroundColor: '#f0fdf4'
  },
  statusRejected: {
    backgroundColor: '#fef2f2'
  },
  statusAnnouncementBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 16
  },
  statusAnnouncementIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2
  },
  statusAnnouncementTitle: {
    fontSize: 14,
    fontWeight: '800'
  },
  statusAnnouncementSub: {
    fontSize: 12.5,
    marginTop: 3,
    lineHeight: 18,
    fontWeight: '500'
  },
  otpBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 18
  },
  otpLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#15803d',
    letterSpacing: 0.5
  },
  otpCode: {
    fontSize: 24,
    fontWeight: '900',
    color: '#166534',
    letterSpacing: 3,
    marginVertical: 2
  },
  otpSub: {
    fontSize: 11,
    color: '#15803d'
  },
  stepperContainer: {
    backgroundColor: '#f8fafc',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginBottom: 18,
    position: 'relative'
  },
  trackLineBackground: {
    position: 'absolute',
    top: 27,
    left: 28,
    right: 28,
    height: 3,
    backgroundColor: '#e2e8f0',
    zIndex: 1
  },
  trackLineFilled: {
    position: 'absolute',
    top: 27,
    left: 28,
    maxWidth: '85%',
    height: 3,
    backgroundColor: '#16a34a',
    zIndex: 2,
    borderRadius: 2
  },
  stepperBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 3
  },
  stepItem: {
    alignItems: 'center',
    width: '16%'
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4
  },
  stepCircleDone: {
    backgroundColor: '#16a34a'
  },
  stepCircleCurrent: {
    borderWidth: 2,
    borderColor: '#86efac',
    backgroundColor: '#15803d'
  },
  stepLabel: {
    fontSize: 9,
    color: '#94a3b8',
    fontWeight: '600',
    textAlign: 'center'
  },
  stepLabelActive: {
    color: '#15803d',
    fontWeight: '700'
  },
  rejectionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 18
  },
  rejectionText: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '600',
    flex: 1
  },
  itemsSummary: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16
  },
  itemsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 8
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4
  },
  itemName: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '500'
  },
  itemPrice: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '700'
  },
  totalDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 8
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  totalVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#15803d'
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10
  },
  callStoreBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6
  },
  callStoreText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700'
  },
  refreshOrderBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  loadingWrap: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 220
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 12
  },
  emptyCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 12
  },
  emptyCardSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20
  },
  browseStoresBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12
  },
  browseStoresText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14
  },
  loggedOutWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#ffffff'
  },
  loggedOutIconBox: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20
  },
  loggedOutTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8
  },
  loggedOutSub: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24
  },
  loggedOutBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    elevation: 3
  },
  loggedOutBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700'
  },
  orderSwitcherWrap: {
    marginBottom: 16
  },
  orderSwitcherTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4
  },
  orderSwitcherScroll: {
    gap: 8
  },
  orderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6
  },
  orderPillActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981'
  },
  orderPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94a3b8'
  },
  orderPillDotActive: {
    backgroundColor: '#10b981'
  },
  orderPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155'
  },
  orderPillTextActive: {
    color: '#065f46'
  },
  orderPillStatus: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'capitalize'
  },
  orderPillStatusActive: {
    color: '#047857'
  },
  riderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    marginBottom: 16,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2
  },
  riderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  riderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center'
  },
  riderInitial: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800'
  },
  riderName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0f172a'
  },
  riderRatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8
  },
  riderRatingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#b45309'
  },
  riderVehicle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  callRiderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10
  },
  callRiderText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700'
  },
  liveGpsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10
  },
  liveGpsPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#16a34a'
  },
  liveGpsText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1'
  }
});
