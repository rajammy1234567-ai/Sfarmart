import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * WaterBackground
 * Renders very slow, low-opacity floating organic gradient blobs in the background
 * to produce an ambient liquid water / shimmering glass depth beneath all content.
 */
export const WaterBackground = () => {
  const floatAnim1 = useRef(new Animated.Value(0)).current;
  const floatAnim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop1 = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim1, {
          toValue: 1,
          duration: 9000,
          useNativeDriver: false
        }),
        Animated.timing(floatAnim1, {
          toValue: 0,
          duration: 9000,
          useNativeDriver: false
        })
      ])
    );

    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim2, {
          toValue: 1,
          duration: 12000,
          useNativeDriver: false
        }),
        Animated.timing(floatAnim2, {
          toValue: 0,
          duration: 12000,
          useNativeDriver: false
        })
      ])
    );

    loop1.start();
    loop2.start();

    return () => {
      loop1.stop();
      loop2.stop();
    };
  }, [floatAnim1, floatAnim2]);

  const translateY1 = floatAnim1.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 30]
  });
  const translateX1 = floatAnim1.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 20]
  });

  const translateY2 = floatAnim2.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -35]
  });
  const translateX2 = floatAnim2.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -25]
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Base Canvas Toned White */}
      <View style={styles.baseBg} />

      {/* Floating Amber/Orange Water Blob */}
      <Animated.View
        style={[
          styles.blob,
          styles.amberBlob,
          {
            transform: [{ translateX: translateX1 }, { translateY: translateY1 }]
          }
        ]}
      />

      {/* Floating Emerald/Green Water Blob */}
      <Animated.View
        style={[
          styles.blob,
          styles.greenBlob,
          {
            transform: [{ translateX: translateX2 }, { translateY: translateY2 }]
          }
        ]}
      />

      {/* Floating Sky Blue Water Droplet Blob */}
      <Animated.View
        style={[
          styles.blob,
          styles.blueBlob,
          {
            transform: [{ translateX: translateY1 }, { translateY: translateX2 }]
          }
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  baseBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f8fafc'
  },
  blob: {
    position: 'absolute',
    borderRadius: 9999,
    opacity: 0.16
  },
  amberBlob: {
    top: -40,
    right: -50,
    width: 280,
    height: 280,
    backgroundColor: '#ea580c',
    ...(Platform.OS === 'web' ? { filter: 'blur(60px)' } : {})
  },
  greenBlob: {
    top: 220,
    left: -60,
    width: 260,
    height: 260,
    backgroundColor: '#16a34a',
    ...(Platform.OS === 'web' ? { filter: 'blur(60px)' } : {})
  },
  blueBlob: {
    bottom: 80,
    right: -40,
    width: 240,
    height: 240,
    backgroundColor: '#0284c7',
    ...(Platform.OS === 'web' ? { filter: 'blur(55px)' } : {})
  }
});
