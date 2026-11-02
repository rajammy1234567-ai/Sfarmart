import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Keyboard,
  Easing,
  AccessibilityInfo,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TAB_BAR_HEIGHT, getDockBottomOffset } from '../theme/layout';

const TAB_META = {
  Home: { active: 'home', inactive: 'home-outline', defaultLabel: 'Home' },
  Catalog: { active: 'grid', inactive: 'grid-outline', defaultLabel: 'Stores' },
  HomeRestro: { active: 'restaurant', inactive: 'restaurant-outline', defaultLabel: 'Home Chef' },
  OrderTracking: { active: 'cube', inactive: 'cube-outline', defaultLabel: 'Orders' },
  ProfileWallet: { active: 'person', inactive: 'person-outline', defaultLabel: 'Profile' }
};

const TabItem = ({
  route,
  index,
  isFocused,
  onPress,
  onLongPress,
  options,
  onLayoutTab,
  reduceMotion
}) => {
  const meta = TAB_META[route.name] || {
    active: 'ellipse',
    inactive: 'ellipse-outline',
    defaultLabel: route.name
  };

  const label =
    options.tabBarLabel !== undefined
      ? options.tabBarLabel
      : options.title !== undefined
      ? options.title
      : meta.defaultLabel;

  const badge = options.tabBarBadge;

  // Icon press feedback scale animation
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!reduceMotion) {
      Animated.timing(scaleAnim, {
        toValue: 0.90,
        duration: 70,
        useNativeDriver: true
      }).start();
    }
  };

  const handlePressOut = () => {
    if (!reduceMotion) {
      Animated.timing(scaleAnim, {
        toValue: 1.0,
        duration: 130,
        useNativeDriver: true
      }).start();
    }
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={`${label} Tab`}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.88}
      onLayout={(e) => onLayoutTab(index, e.nativeEvent.layout)}
      style={styles.tabBtn}
    >
      <Animated.View style={[styles.tabContent, { transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={isFocused ? meta.active : meta.inactive}
            size={19}
            color={isFocused ? '#15803d' : '#64748b'}
          />
          {badge !== undefined && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.tabLabel,
            isFocused ? styles.tabLabelActive : styles.tabLabelInactive
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

export const BrandTabBar = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Tab button layout metrics for the shared animated sliding indicator
  const tabLayoutsRef = useRef([]);
  const [layoutsReady, setLayoutsReady] = useState(false);

  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;
  const isInitialMount = useRef(true);

  // Check reduced-motion setting
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => sub?.remove?.();
  }, []);

  // Keyboard handling
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Update sliding indicator position
  const animateToTab = useCallback((index) => {
    const layout = tabLayoutsRef.current[index];
    if (!layout) return;

    const targetW = Math.max(layout.width - 8, 48);
    const targetX = layout.x + (layout.width - targetW) / 2;

    if (isInitialMount.current || reduceMotion) {
      indicatorX.setValue(targetX);
      indicatorW.setValue(targetW);
      isInitialMount.current = false;
      setLayoutsReady(true);
    } else {
      Animated.parallel([
        Animated.timing(indicatorX, {
          toValue: targetX,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false
        }),
        Animated.timing(indicatorW, {
          toValue: targetW,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false
        })
      ]).start();
    }
  }, [indicatorX, indicatorW, reduceMotion]);

  useEffect(() => {
    animateToTab(state.index);
  }, [state.index, animateToTab]);

  const handleTabLayout = (index, layout) => {
    tabLayoutsRef.current[index] = layout;
    if (tabLayoutsRef.current.length === state.routes.length) {
      animateToTab(state.index);
    }
  };

  if (isKeyboardVisible) {
    return null;
  }

  const isTablet = width > 600;
  const containerWidth = isTablet ? 500 : Math.min(width - (width < 360 ? 16 : 24), 480);
  const bottomOffset = getDockBottomOffset(insets);

  return (
    <View
      style={[
        styles.dockWrapper,
        {
          bottom: bottomOffset,
          left: (width - containerWidth) / 2,
          width: containerWidth
        }
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.dockCard}>
        {/* Animated Sliding Mint Pill Indicator */}
        <Animated.View
          style={[
            styles.slidingPill,
            {
              left: indicatorX,
              width: indicatorW,
              opacity: layoutsReady ? 1 : 0
            }
          ]}
          pointerEvents="none"
        />

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
                index={index}
                isFocused={isFocused}
                onPress={onPress}
                onLongPress={onLongPress}
                options={options}
                onLayoutTab={handleTabLayout}
                reduceMotion={reduceMotion}
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
  dockCard: {
    height: TAB_BAR_HEIGHT,
    borderRadius: 31,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
    position: 'relative',
    overflow: 'hidden'
  },
  slidingPill: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    backgroundColor: '#dcfce7',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#86efac',
    zIndex: 0
  },
  tabsRow: {
    flexDirection: 'row',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
    zIndex: 1
  },
  tabBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    minHeight: 44
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 24
  },
  tabLabel: {
    fontSize: 10.5,
    marginTop: 1.5,
    textAlign: 'center',
    includeFontPadding: false
  },
  tabLabelActive: {
    fontWeight: '800',
    color: '#15803d'
  },
  tabLabelInactive: {
    fontWeight: '500',
    color: '#64748b'
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#ea580c',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700'
  }
});

export default BrandTabBar;
