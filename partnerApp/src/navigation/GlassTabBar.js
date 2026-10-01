import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  useWindowDimensions
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { glassTheme } from '../theme/glass';

const TAB_ICONS = {
  Dashboard: { active: 'storefront', inactive: 'storefront-outline', label: 'Dashboard' },
  Orders: { active: 'receipt', inactive: 'receipt-outline', label: 'Orders' },
  Inventory: { active: 'cube', inactive: 'cube-outline', label: 'Inventory' },
  Reports: { active: 'bar-chart', inactive: 'bar-chart-outline', label: 'Reports' },
  Account: { active: 'person', inactive: 'person-outline', label: 'Profile' }
};

const TabItem = ({ route, isFocused, onPress, onLongPress }) => {
  const iconMeta = TAB_ICONS[route.name] || { active: 'ellipse', inactive: 'ellipse-outline', label: route.name };
  const scaleAnim = useRef(new Animated.Value(isFocused ? 1.08 : 1.0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isFocused ? 1.08 : 1.0,
      friction: 4.5,
      tension: 220,
      useNativeDriver: Platform.OS !== 'web'
    }).start();
  }, [isFocused]);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
      style={styles.tabBtn}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: 'center' }}>
        {isFocused ? (
          // Floating Glossy Glass Orb with Glow
          <View style={styles.activeOrbWrapper}>
            <LinearGradient
              colors={['#ea580c', '#d97706']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.activeOrb}
            >
              {/* Inner glass water specular reflection */}
              <LinearGradient
                colors={['rgba(255,255,255,0.45)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 0.7 }}
                style={styles.orbSheen}
                pointerEvents="none"
              />
              <Ionicons name={iconMeta.active} size={22} color="#ffffff" />
            </LinearGradient>
          </View>
        ) : (
          <View style={styles.inactiveIconWrap}>
            <Ionicons name={iconMeta.inactive} size={22} color={colors.textSecondary} />
            <Text style={styles.inactiveLabel} numberOfLines={1}>
              {iconMeta.label}
            </Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

export const GlassTabBar = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;

  // Maximum width on wider screens to look like a sleek floating pill dock
  const containerWidth = isTablet ? 540 : width - 32;

  return (
    <View
      style={[
        styles.dockWrapper,
        {
          bottom: insets.bottom > 0 ? insets.bottom + 6 : 14,
          left: (width - containerWidth) / 2,
          width: containerWidth
        }
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.dockOuter}>
        {/* Native Blur Layer */}
        <BlurView
          intensity={65}
          tint="light"
          style={StyleSheet.absoluteFill}
          {...(Platform.OS === 'android' ? { experimentalBlurMethod: 'dimezisBlurView' } : {})}
        />

        {/* Top Water Sheen Line */}
        <LinearGradient
          colors={['rgba(255,255,255,0.60)', 'rgba(255,255,255,0.10)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.topSheen}
          pointerEvents="none"
        />

        {/* Tab Items */}
        <View style={styles.tabsRow}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key
              });
            };

            return (
              <TabItem
                key={route.key}
                route={route}
                isFocused={isFocused}
                onPress={onPress}
                onLongPress={onLongPress}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dockWrapper: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 999
  },
  dockOuter: {
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
    ...(Platform.OS === 'web'
      ? {
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)'
        }
      : {})
  },
  topSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 24
  },
  tabsRow: {
    flexDirection: 'row',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8
  },
  tabBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  activeOrbWrapper: {
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.38,
    shadowRadius: 10,
    elevation: 6
  },
  activeOrb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)'
  },
  orbSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 20,
    borderRadius: 22
  },
  inactiveIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2
  },
  inactiveLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b'
  }
});
