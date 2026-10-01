import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Platform, Animated } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { HomeScreen } from '../screens/Customer/HomeScreen';
import { CategoryVendorsScreen } from '../screens/Customer/CategoryVendorsScreen';
import { VendorStoreScreen } from '../screens/Customer/VendorStoreScreen';
import { CatalogScreen } from '../screens/Customer/CatalogScreen';
import { HomeRestroScreen } from '../screens/Customer/HomeRestroScreen';
import { CartScreen } from '../screens/Customer/CartScreen';
import { OrderTrackingScreen } from '../screens/Customer/OrderTrackingScreen';
import { ProfileWalletScreen } from '../screens/Customer/ProfileWalletScreen';
import { ProductDetailsScreen } from '../screens/Customer/ProductDetailsScreen';
import { CheckoutScreen } from '../screens/Customer/CheckoutScreen';
import { RazorpayCheckoutWebView } from '../screens/Customer/RazorpayCheckoutWebView';
import { FarmerDashboardScreen, AddHarvestScreen } from '../screens/Farmer/FarmerDashboardScreen';
import { LoginScreen } from '../screens/Auth/LoginScreen';
import { SignupScreen } from '../screens/Auth/SignupScreen';
import { useApp } from '../context/AppContext';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const tabIcons = {
  Home: { active: 'home', inactive: 'home-outline' },
  Catalog: { active: 'grid', inactive: 'grid-outline' },
  HomeRestro: { active: 'restaurant', inactive: 'restaurant-outline' },
  OrderTracking: { active: 'cube', inactive: 'cube-outline' },
  ProfileWallet: { active: 'person', inactive: 'person-outline' }
};

const AnimatedTabIcon = ({ focused, icons, color }) => {
  const scaleAnim = useRef(new Animated.Value(1.0)).current;

  useEffect(() => {
    if (focused) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.08,
          duration: 100,
          useNativeDriver: Platform.OS !== 'web'
        }),
        Animated.spring(scaleAnim, {
          toValue: 1.0,
          friction: 4,
          tension: 200,
          useNativeDriver: Platform.OS !== 'web'
        })
      ]).start();
    }
  }, [focused]);

  return (
    <Animated.View
      style={[
        styles.tabIconWrapper,
        focused ? styles.tabIconWrapperFocused : null,
        { transform: [{ scale: scaleAnim }] }
      ]}
    >
      <Ionicons name={focused ? icons.active : icons.inactive} size={20} color={color} />
    </Animated.View>
  );
};

const MainTabs = () => {
  const insets = useSafeAreaInsets();
  // Safe-area bottom padding tuned for Android 3-button (minimal 6dp cushion) vs gesture / iOS
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'ios' ? 20 : 6);
  const tabContentHeight = 54;
  const tabTotalHeight = tabContentHeight + bottomPadding;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarAllowFontScaling: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 1,
          marginBottom: 1,
          lineHeight: 13,
          includeFontPadding: false
        },
        tabBarItemStyle: {
          paddingVertical: 2,
          justifyContent: 'center',
          alignItems: 'center'
        },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: tabTotalHeight,
          paddingBottom: bottomPadding,
          paddingTop: 4,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 6
        },
        tabBarIcon: ({ color, focused }) => {
          const icons = tabIcons[route.name] || tabIcons.Home;
          return <AnimatedTabIcon focused={focused} icons={icons} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Catalog" component={CatalogScreen} options={{ tabBarLabel: 'Stores' }} />
      <Tab.Screen
        name="HomeRestro"
        component={HomeRestroScreen}
        options={{ tabBarLabel: 'Home Chef' }}
      />
      <Tab.Screen
        name="OrderTracking"
        component={OrderTrackingScreen}
        options={{ tabBarLabel: 'Live Tracker' }}
      />
      <Tab.Screen
        name="ProfileWallet"
        component={ProfileWalletScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

export const RootNavigator = () => {
  const { isAuthenticated } = useApp();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 250,
        gestureEnabled: true,
        fullScreenGestureEnabled: true
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="CategoryVendors" component={CategoryVendorsScreen} />
      <Stack.Screen name="VendorStore" component={VendorStoreScreen} />
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
      <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
      <Stack.Screen name="FarmerDashboard" component={FarmerDashboardScreen} />
      <Stack.Screen name="AddHarvest" component={AddHarvestScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen
        name="RazorpayCheckout"
        component={RazorpayCheckoutWebView}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  tabIconWrapper: {
    height: 28,
    minWidth: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent'
  },
  tabIconWrapperFocused: {
    backgroundColor: colors.primaryLight
  }
});
