import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Platform,
  View
} from 'react-native';

/**
 * GlassIconBtn (Partner App)
 * 
 * Provides:
 * 1. "Glass Chip" look: translucent frosted background + subtle 1px border
 * 2. 60fps spring scale-down to 0.90 on press, pop back on release
 * 3. Soft radial amber glow
 */
export const GlassIconBtn = ({
  children,
  onPress,
  size = 40,
  style,
  borderRadius = 12,
  blurTint = 'light',
  activeScale = 0.90,
  disabled = false,
  ...props
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: activeScale,
        useNativeDriver: Platform.OS !== 'web',
        friction: 4,
        tension: 220
      }),
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: Platform.OS !== 'web'
      })
    ]).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
        friction: 3.5,
        tension: 200
      }),
      Animated.timing(glowAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web'
      })
    ]).start();
  };

  const isDark = blurTint === 'dark';

  return (
    <Animated.View
      style={[
        { transform: [{ scale: scaleAnim }] },
        styles.container,
        {
          width: size,
          height: size,
          borderRadius
        }
      ]}
    >
      <Pressable
        onPress={!disabled ? onPress : undefined}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.glassChip,
          isDark ? styles.glassChipDark : styles.glassChipLight,
          { borderRadius },
          style,
          Platform.OS === 'web' && {
            cursor: disabled ? 'not-allowed' : 'pointer',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)'
          }
        ]}
        {...props}
      >
        {children}

        <Animated.View
          pointerEvents="none"
          style={[
            styles.glowOverlay,
            {
              borderRadius,
              opacity: glowAnim,
              backgroundColor: isDark
                ? 'rgba(255, 255, 255, 0.12)'
                : 'rgba(234, 88, 12, 0.18)'
            }
          ]}
        />
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative'
  },
  glassChip: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  glassChipLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2
  },
  glassChipDark: {
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject
  }
});
