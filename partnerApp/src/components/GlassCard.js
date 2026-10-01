import React, { useRef } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  Pressable,
  Animated
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { glassTheme } from '../theme/glass';

/**
 * GlassCard
 * Reusable Liquid Glass + Water card component for partnerApp.
 * 
 * Features:
 * - expo-blur (BlurView) with web backdropFilter fallback
 * - expo-linear-gradient inner water sheen (white 0.35 -> transparent)
 * - 1px translucent border with rounded corners (18-24px)
 * - Optional interactive tactile ripple/scale on press (0.97x -> 1.0x)
 * - Zero crash fallback
 */
export const GlassCard = ({
  children,
  style,
  contentStyle,
  onPress,
  disabled = false,
  intensity = glassTheme.blurIntensity,
  tint = 'light', // 'light' | 'dark' | 'amber' | 'green' | 'blue'
  variant = 'card', // 'card' | 'tile' | 'pill' | 'button'
  borderRadius = glassTheme.radii.lg,
  borderColor,
  showSheen = true,
  sheenColors,
  ...rest
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled || !onPress) return;
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      friction: 6,
      tension: 250,
      useNativeDriver: Platform.OS !== 'web'
    }).start();
  };

  const handlePressOut = () => {
    if (disabled || !onPress) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 200,
      useNativeDriver: Platform.OS !== 'web'
    }).start();
  };

  // Surface background color based on tint
  let bgTint = glassTheme.surfaceCard;
  let borderCol = borderColor || glassTheme.borderLight;
  let defaultSheen = glassTheme.sheenLight;

  if (tint === 'dark') {
    bgTint = glassTheme.surfaceDark;
    borderCol = borderColor || glassTheme.borderDark;
    defaultSheen = glassTheme.sheenDark;
  } else if (tint === 'amber') {
    bgTint = 'rgba(254, 243, 199, 0.65)';
    borderCol = borderColor || glassTheme.borderAmber;
    defaultSheen = glassTheme.sheenAmber;
  } else if (tint === 'green') {
    bgTint = 'rgba(220, 252, 231, 0.65)';
    borderCol = borderColor || glassTheme.borderGreen;
    defaultSheen = glassTheme.sheenGreen;
  } else if (tint === 'blue') {
    bgTint = 'rgba(219, 234, 254, 0.65)';
    borderCol = borderColor || glassTheme.borderBlue;
    defaultSheen = glassTheme.sheenBlue;
  }

  const resolvedSheen = sheenColors || defaultSheen;

  const cardCore = (
    <View
      style={[
        styles.outerContainer,
        glassTheme.shadow,
        {
          borderRadius,
          borderColor: borderCol,
          backgroundColor: bgTint
        },
        Platform.OS === 'web' && styles.webBackdrop,
        style
      ]}
    >
      {/* Native Blur Layer if available */}
      <BlurView
        intensity={intensity}
        tint={tint === 'dark' ? 'dark' : 'light'}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
        {...(Platform.OS === 'android' ? { experimentalBlurMethod: 'dimezisBlurView' } : {})}
      />

      {/* Liquid Water Sheen (Inner Top Highlight) */}
      {showSheen && (
        <LinearGradient
          colors={resolvedSheen}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.sheenGradient, { borderTopLeftRadius: borderRadius, borderTopRightRadius: borderRadius }]}
          pointerEvents="none"
        />
      )}

      {/* Content Container */}
      <View style={[styles.innerContent, contentStyle]}>
        {children}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled}
          accessibilityRole="button"
          {...rest}
        >
          {cardCore}
        </Pressable>
      </Animated.View>
    );
  }

  return cardCore;
};

const styles = StyleSheet.create({
  outerContainer: {
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative'
  },
  innerContent: {
    position: 'relative',
    zIndex: 2
  },
  sheenGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    zIndex: 1
  },
  webBackdrop: {
    // @ts-ignore
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)'
  }
});
