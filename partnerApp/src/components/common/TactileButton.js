import React, { useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  Platform
} from 'react-native';

/**
 * TactileButton / WaterRipplePressable (Partner App)
 * 
 * Implements:
 * 1. 60fps spring scale-down on pressIn, spring back on pressOut
 * 2. Radial water droplet ripple expanding from exact touch point
 * 3. Merchant Amber/Crimson theme glow (#ea580c)
 * 4. Zero-crash defensive guards
 */
export const TactileButton = ({
  children,
  onPress,
  style,
  rippleColor = 'rgba(234, 88, 12, 0.25)',
  activeScale = 0.95,
  disabled = false,
  ...props
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rippleScale = useRef(new Animated.Value(0)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;

  const [ripplePos, setRipplePos] = useState({ x: 0, y: 0 });
  const [showRipple, setShowRipple] = useState(false);

  const handlePressIn = (e) => {
    if (disabled) return;

    try {
      const { locationX, locationY } = e.nativeEvent || {};
      if (typeof locationX === 'number' && typeof locationY === 'number') {
        setRipplePos({ x: locationX, y: locationY });
      } else {
        setRipplePos({ x: 50, y: 20 });
      }
    } catch {
      setRipplePos({ x: 50, y: 20 });
    }

    setShowRipple(true);
    rippleScale.setValue(0.2);
    rippleOpacity.setValue(0.7);

    Animated.spring(scaleAnim, {
      toValue: activeScale,
      useNativeDriver: Platform.OS !== 'web',
      friction: 5,
      tension: 180
    }).start();

    Animated.parallel([
      Animated.timing(rippleScale, {
        toValue: 2.8,
        duration: 400,
        useNativeDriver: Platform.OS !== 'web'
      }),
      Animated.timing(rippleOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: Platform.OS !== 'web'
      })
    ]).start(() => {
      setShowRipple(false);
    });
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
      friction: 4,
      tension: 200
    }).start();
  };

  return (
    <Animated.View
      style={[
        { transform: [{ scale: scaleAnim }] },
        styles.overflowContainer,
        disabled && styles.disabledContainer
      ]}
    >
      <Pressable
        onPress={!disabled ? onPress : undefined}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.pressable,
          style,
          Platform.OS === 'web' && { cursor: disabled ? 'not-allowed' : 'pointer' }
        ]}
        {...props}
      >
        {children}

        {showRipple && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ripple,
              {
                left: ripplePos.x - 35,
                top: ripplePos.y - 35,
                backgroundColor: rippleColor,
                opacity: rippleOpacity,
                transform: [{ scale: rippleScale }]
              }
            ]}
          />
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overflowContainer: {
    overflow: 'hidden',
    position: 'relative'
  },
  disabledContainer: {
    opacity: 0.6
  },
  pressable: {
    position: 'relative',
    overflow: 'hidden'
  },
  ripple: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    zIndex: 10
  }
});
