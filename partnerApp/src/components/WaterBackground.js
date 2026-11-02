import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * WaterBackground (Brand Gradient Canvas)
 * Clearly visible, soft diagonal gradient (#DCFCE7 → #F0FDF4 → #FFF7ED)
 * with static low-opacity ambient accents that preserve card legibility and performance.
 */
export const WaterBackground = () => {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['#dcfce7', '#f0fdf4', '#fff7ed']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Static low-opacity decorative circles */}
      <View style={styles.orbTopRight} pointerEvents="none" />
      <View style={styles.orbMidLeft} pointerEvents="none" />
      <View style={styles.orbBottomRight} pointerEvents="none" />
    </View>
  );
};

const styles = StyleSheet.create({
  orbTopRight: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(22, 163, 74, 0.08)'
  },
  orbMidLeft: {
    position: 'absolute',
    top: 320,
    left: -70,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(234, 88, 12, 0.05)'
  },
  orbBottomRight: {
    position: 'absolute',
    bottom: 60,
    right: -60,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(22, 163, 74, 0.06)'
  }
});

export default WaterBackground;
