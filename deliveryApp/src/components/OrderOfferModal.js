import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  Animated,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDelivery } from '../context/DeliveryContext';

export const OrderOfferModal = () => {
  const { pendingOffer, acceptOffer, declineOffer } = useDelivery();
  const [secondsLeft, setSecondsLeft] = useState(20);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Sound alert using Web Audio API on web
  useEffect(() => {
    if (!pendingOffer) return;

    setSecondsLeft(pendingOffer.expiresInSeconds || 20);

    // Audio chime loop
    let audioCtx = null;
    let chimeInterval = null;

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.AudioContext) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const playBeep = () => {
          if (!audioCtx || audioCtx.state === 'closed') return;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
          osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
          gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.3);
        };

        playBeep();
        chimeInterval = setInterval(playBeep, 2500);
      } catch (e) {
        console.warn('Audio chime error:', e);
      }
    }

    // Pulse animation
    const loopAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 600,
          useNativeDriver: true
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true
        })
      ])
    );
    loopAnim.start();

    // 20s Countdown timer
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          declineOffer(pendingOffer.orderId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      if (chimeInterval) clearInterval(chimeInterval);
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
      loopAnim.stop();
    };
  }, [pendingOffer, declineOffer, pulseAnim]);

  if (!pendingOffer) return null;

  const handleAccept = async () => {
    setIsSubmitting(true);
    await acceptOffer(pendingOffer.orderId);
    setIsSubmitting(false);
  };

  const handleDecline = async () => {
    setIsSubmitting(true);
    await declineOffer(pendingOffer.orderId);
    setIsSubmitting(false);
  };

  return (
    <Modal visible={!!pendingOffer} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Top Bar with Countdown Ring */}
          <View style={styles.topRow}>
            <View style={styles.tagPill}>
              <Ionicons name="flash" size={14} color="#0284c7" />
              <Text style={styles.tagText}>NEW ORDER OFFER</Text>
            </View>

            <Animated.View style={[styles.timerBadge, { transform: [{ scale: pulseAnim }] }]}>
              <Ionicons name="timer-outline" size={16} color="#ffffff" />
              <Text style={styles.timerText}>{secondsLeft}s</Text>
            </Animated.View>
          </View>

          {/* Earnings Hero */}
          <View style={styles.earningsHero}>
            <Text style={styles.payoutLabel}>GUARANTEED EARNING</Text>
            <Text style={styles.payoutVal}>₹{pendingOffer.estEarnings || 65}</Text>
            <Text style={styles.payoutSub}>
              Trip Distance: ~{pendingOffer.distanceKm || 2.8} km • {pendingOffer.itemsCount || 1} Item(s)
            </Text>
          </View>

          {/* Store Pickup Details */}
          <View style={styles.routeBox}>
            <View style={styles.stopRow}>
              <View style={[styles.dotCircle, { backgroundColor: '#f97316' }]}>
                <Ionicons name="restaurant" size={14} color="#ffffff" />
              </View>
              <View style={styles.stopInfo}>
                <Text style={styles.stopType}>STORE PICKUP</Text>
                <Text style={styles.stopTitle} numberOfLines={1}>
                  {pendingOffer.storeName || 'Merchant Store'}
                </Text>
                <Text style={styles.stopAddress} numberOfLines={1}>
                  {typeof pendingOffer.storeAddress === 'string'
                    ? pendingOffer.storeAddress
                    : pendingOffer.storeAddress?.line1
                    ? `${pendingOffer.storeAddress.line1}, ${pendingOffer.storeAddress.city || ''}`
                    : 'Store Location'}
                </Text>
              </View>
            </View>

            <View style={styles.connectorLine} />

            {/* Customer Drop Details */}
            <View style={styles.stopRow}>
              <View style={[styles.dotCircle, { backgroundColor: '#16a34a' }]}>
                <Ionicons name="location" size={14} color="#ffffff" />
              </View>
              <View style={styles.stopInfo}>
                <Text style={styles.stopType}>CUSTOMER DROP</Text>
                <Text style={styles.stopTitle} numberOfLines={1}>
                  {pendingOffer.customerName || 'Customer'}
                </Text>
                <Text style={styles.stopAddress} numberOfLines={1}>
                  {typeof pendingOffer.customerAddress === 'string'
                    ? pendingOffer.customerAddress
                    : pendingOffer.customerAddress?.line1
                    ? `${pendingOffer.customerAddress.line1}, ${pendingOffer.customerAddress.city || ''}`
                    : 'Customer Address'}
                </Text>
              </View>
            </View>
          </View>

          {/* COD Notice if cash order */}
          {pendingOffer.paymentMethod === 'COD' && (
            <View style={styles.codAlert}>
              <Ionicons name="cash-outline" size={18} color="#ea580c" />
              <Text style={styles.codText}>Cash on Delivery: Collect ₹{pendingOffer.totalAmount} at doorstep</Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={handleDecline}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={handleAccept}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="bicycle" size={20} color="#ffffff" />
                  <Text style={styles.acceptBtnText}>ACCEPT TRIP</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end'
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6
  },
  tagText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284c7'
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4
  },
  timerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  earningsHero: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16
  },
  payoutLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1
  },
  payoutVal: {
    color: '#38bdf8',
    fontSize: 38,
    fontWeight: '900',
    marginVertical: 4
  },
  payoutSub: {
    color: '#cbd5e1',
    fontSize: 12.5,
    fontWeight: '500'
  },
  routeBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  dotCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },
  stopInfo: {
    flex: 1
  },
  stopType: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b'
  },
  stopTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a'
  },
  stopAddress: {
    fontSize: 12,
    color: '#64748b'
  },
  connectorLine: {
    width: 2,
    height: 18,
    backgroundColor: '#cbd5e1',
    marginLeft: 15,
    marginVertical: 4
  },
  codAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fed7aa',
    gap: 8,
    marginBottom: 16
  },
  codText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#c2410c',
    flex: 1
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12
  },
  declineBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  declineBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b'
  },
  acceptBtn: {
    flex: 2,
    backgroundColor: '#0284c7',
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  acceptBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  }
});
