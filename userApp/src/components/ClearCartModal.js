import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { TactileButton } from './common/TactileButton';

export const ClearCartModal = ({
  visible,
  currentVendorName = 'Store A',
  newVendorName = 'Store B',
  itemCount = 1,
  onCancel,
  onConfirm
}) => {
  const slideAnim = useRef(new Animated.Value(120)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(120);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 6,
          tension: 180,
          useNativeDriver: Platform.OS !== 'web'
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: Platform.OS !== 'web'
        })
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onCancel}
        />
        <Animated.View
          style={[
            styles.modalCard,
            { transform: [{ translateY: slideAnim }] }
          ]}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="cart-outline" size={32} color="#dc2626" />
          </View>

          <Text style={styles.title}>Pehle wala cart hata dein?</Text>

          <Text style={styles.message}>
            Aapke cart me <Text style={styles.boldText}>{currentVendorName}</Text> ke{' '}
            <Text style={styles.boldText}>{itemCount} item{itemCount > 1 ? 's' : ''}</Text> hain.
            {'\n\n'}
            S-farmart 24 ek order me ek hi store se delivery karta hai.{' '}
            <Text style={styles.boldText}>{newVendorName}</Text> se order karne ke liye purana cart hatana hoga.
          </Text>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TactileButton
              style={styles.confirmBtn}
              onPress={onConfirm}
              rippleColor="rgba(255, 255, 255, 0.35)"
            >
              <Text style={styles.confirmText}>Cart hataayein & add karein</Text>
            </TactileButton>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fee2e2'
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
    textAlign: 'center'
  },
  message: {
    fontSize: 14,
    lineHeight: 22,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 24
  },
  boldText: {
    fontWeight: '700',
    color: '#0f172a'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    alignItems: 'center'
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    backgroundColor: '#f8fafc'
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569'
  },
  confirmBtn: {
    flex: 1.4,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2
  },
  confirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center'
  }
});
