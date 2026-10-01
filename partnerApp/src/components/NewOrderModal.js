import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Animated
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { soundAlert } from '../utils/soundAlert';

export const NewOrderModal = ({ order, onAccept, onReject, onClose }) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const [isMuted, setIsMuted] = useState(false);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState('Item out of stock');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasAutoAcceptedRef = useRef(false);
  const orderRef = useRef(order);
  orderRef.current = order;

  const handleAccept = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    soundAlert.stop();
    try {
      const targetOrder = orderRef.current || order;
      if (targetOrder) {
        await onAccept(targetOrder.orderId || targetOrder._id);
      }
    } catch (err) {
      console.warn('Accept order error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptRef = useRef(handleAccept);
  handleAcceptRef.current = handleAccept;

  useEffect(() => {
    if (!order) return;

    hasAutoAcceptedRef.current = false;
    soundAlert.start();
    setTimeLeft(60);

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          soundAlert.stop();
          if (!hasAutoAcceptedRef.current) {
            hasAutoAcceptedRef.current = true;
            console.log('⏰ 60 seconds expired: Auto-accepting order for preparation:', order.orderNumber || order._id);
            handleAcceptRef.current();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      soundAlert.stop();
    };
  }, [order]);

  const toggleMute = () => {
    if (isMuted) {
      soundAlert.start();
      setIsMuted(false);
    } else {
      soundAlert.stop();
      setIsMuted(true);
    }
  };

  const handleReject = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    soundAlert.stop();
    try {
      await onReject(order.orderId || order._id, rejectReason);
    } finally {
      setIsSubmitting(false);
    }
  };

  const entranceScale = useRef(new Animated.Value(0.88)).current;
  const pulseBorderAnim = useRef(new Animated.Value(0)).current;
  const tickAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!order) return;

    // Entrance spring animation (using false to stay synchronized with JS-driven pulse border)
    Animated.spring(entranceScale, {
      toValue: 1,
      friction: 5,
      tension: 180,
      useNativeDriver: false
    }).start();

    // Pulsing border glow animation in sync with alert
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseBorderAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: false
        }),
        Animated.timing(pulseBorderAnim, {
          toValue: 0,
          duration: 700,
          useNativeDriver: false
        })
      ])
    );
    pulseLoop.start();

    return () => pulseLoop.stop();
  }, [order]);

  // Tick animation on every second
  useEffect(() => {
    Animated.sequence([
      Animated.timing(tickAnim, {
        toValue: 1.25,
        duration: 90,
        useNativeDriver: false
      }),
      Animated.spring(tickAnim, {
        toValue: 1,
        friction: 4,
        tension: 200,
        useNativeDriver: false
      })
    ]).start();
  }, [timeLeft]);

  const timerColor = timeLeft > 30 ? '#16a34a' : timeLeft > 15 ? '#ea580c' : '#dc2626';

  const pulseBorderColor = pulseBorderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(220, 38, 38, 0.45)', 'rgba(234, 88, 12, 0.95)']
  });

  return (
    <Modal visible={!!order} transparent animationType="fade">
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.modalCard,
            {
              transform: [{ scale: entranceScale }],
              borderColor: pulseBorderColor,
              borderWidth: 2
            }
          ]}
        >
          {/* Native Blur Layer */}
          <BlurView
            intensity={65}
            tint="light"
            style={StyleSheet.absoluteFill}
            {...(Platform.OS === 'android' ? { experimentalBlurMethod: 'dimezisBlurView' } : {})}
          />

          {/* Water Sheen Gradient */}
          <LinearGradient
            colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.05)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.modalSheen}
            pointerEvents="none"
          />

          {/* Header Banner */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.pulseDot} />
              <Text style={styles.headerTitle}>NEW ORDER RECEIVED</Text>
            </View>
            <TouchableOpacity style={styles.muteBtn} onPress={toggleMute}>
              <Ionicons
                name={isMuted ? 'volume-mute' : 'volume-high'}
                size={18}
                color="#ffffff"
              />
              <Text style={styles.muteText}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </TouchableOpacity>
          </View>

          {/* Countdown Bar */}
          <View style={styles.timerBarWrapper}>
            <View
              style={[
                styles.timerBarFill,
                {
                  width: `${(timeLeft / 60) * 100}%`,
                  backgroundColor: timerColor
                }
              ]}
            />
          </View>
          <View style={styles.timerInfo}>
            <Ionicons name="time-outline" size={16} color={timerColor} />
            <Text style={[styles.timerLabel, { color: timerColor }]}>
              {timeLeft > 0
                ? 'Auto-accepts for preparation in:'
                : isSubmitting
                ? 'Auto-accepting for preparation...'
                : 'Auto-accepted for preparation!'}
            </Text>
            <Animated.Text
              style={[
                styles.timerSeconds,
                { color: timerColor, transform: [{ scale: tickAnim }] }
              ]}
            >
              {timeLeft}s
            </Animated.Text>
          </View>

          {/* Order Details Header */}
          <View style={styles.orderSummary}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.orderNum}>#{order.orderNumber || 'ORD-NEW'}</Text>
              <Text style={styles.custName} numberOfLines={1}>
                👤 {order.customer?.fullName || order.customer?.name || order.address?.name || 'Customer'}
              </Text>
              <Text style={styles.custPhone}>
                📞 {order.customer?.phone || order.address?.phone || '+91 98765 43210'}
              </Text>
            </View>
            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>Total Bill</Text>
              <Text style={styles.amountVal}>₹{order.pricing?.grandTotal || order.totalAmount || 0}</Text>
            </View>
          </View>

          {/* Item Breakdown List */}
          <Text style={styles.sectionTitle}>ITEMS TO PREPARE ({order.items?.length || 0})</Text>
          <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
            {order.items?.map((item, idx) => {
              const qty = item.qty ?? item.quantity ?? 1;
              const price = item.price || 0;
              return (
                <View key={idx} style={styles.itemRow}>
                  <View style={styles.itemQtyBadge}>
                    <Text style={styles.itemQtyText}>{qty}x</Text>
                  </View>
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name || 'Item'}</Text>
                    <Text style={styles.itemUnit}>{item.unit || 'unit'}</Text>
                  </View>
                  <Text style={styles.itemPrice}>₹{item.lineTotal || (price * qty)}</Text>
                </View>
              );
            })}
          </ScrollView>

          {/* Reject Reason Selector (if triggered) */}
          {showRejectReason ? (
            <View style={styles.rejectBox}>
              <Text style={styles.rejectLabel}>Select Reason for Rejection:</Text>
              <View style={styles.reasonButtons}>
                {['Item out of stock', 'Kitchen closing soon', 'Too busy right now'].map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.reasonOption,
                      rejectReason === r && styles.reasonOptionActive
                    ]}
                    onPress={() => setRejectReason(r)}
                  >
                    <Text
                      style={[
                        styles.reasonText,
                        rejectReason === r && styles.reasonTextActive
                      ]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.rejectActions}>
                <TouchableOpacity
                  style={styles.cancelRejectBtn}
                  onPress={() => setShowRejectReason(false)}
                >
                  <Text style={styles.cancelRejectText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmRejectBtn}
                  onPress={handleReject}
                >
                  <Text style={styles.confirmRejectText}>Confirm Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Action Buttons: Accept & Reject */
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.rejectBtn, isSubmitting && { opacity: 0.6 }]}
                onPress={() => setShowRejectReason(true)}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.acceptBtn, isSubmitting && { opacity: 0.6 }]}
                onPress={handleAccept}
                disabled={isSubmitting}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                <Text style={styles.acceptBtnText}>
                  {isSubmitting ? 'ACCEPTING...' : 'ACCEPT ORDER'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    ...(Platform.OS === 'web'
      ? {
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)'
        }
      : {})
  },
  modalSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48
  },
  header: {
    backgroundColor: '#ea580c',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
    marginRight: 10
  },
  headerTitle: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.5
  },
  muteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  muteText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4
  },
  timerBarWrapper: {
    height: 5,
    backgroundColor: 'rgba(226, 232, 240, 0.8)',
    width: '100%'
  },
  timerBarFill: {
    height: '100%'
  },
  timerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    gap: 6
  },
  timerLabel: {
    fontSize: 12,
    fontWeight: '600'
  },
  timerSeconds: {
    fontSize: 15,
    fontWeight: '800'
  },
  orderSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.7)'
  },
  orderNum: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  custName: {
    fontSize: 13,
    color: '#334155',
    marginTop: 2
  },
  custPhone: {
    fontSize: 12,
    color: '#64748b'
  },
  amountBox: {
    alignItems: 'flex-end'
  },
  amountLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600'
  },
  amountVal: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a'
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    paddingHorizontal: 18,
    marginTop: 12,
    marginBottom: 6,
    letterSpacing: 0.5
  },
  itemsList: {
    maxHeight: 180,
    paddingHorizontal: 18
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241, 245, 249, 0.9)'
  },
  itemQtyBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(234, 88, 12, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  itemQtyText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ea580c'
  },
  itemMeta: {
    flex: 1
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  itemUnit: {
    fontSize: 11,
    color: '#64748b'
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)'
  },
  rejectBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ef4444'
  },
  acceptBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4
  },
  acceptBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5
  },
  rejectBox: {
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  rejectLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8
  },
  reasonButtons: {
    gap: 8
  },
  reasonOption: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    backgroundColor: 'rgba(255, 255, 255, 0.7)'
  },
  reasonOptionActive: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.08)'
  },
  reasonText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600'
  },
  reasonTextActive: {
    color: '#dc2626',
    fontWeight: '700'
  },
  rejectActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12
  },
  cancelRejectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(100, 116, 139, 0.1)'
  },
  cancelRejectText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569'
  },
  confirmRejectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#ef4444'
  },
  confirmRejectText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff'
  }
});
