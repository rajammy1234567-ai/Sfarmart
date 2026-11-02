import React from 'react';
import { StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

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
import { BrandTabBar } from './BrandTabBar';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MainTabs = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => <BrandTabBar {...props} />}
      screenOptions={{
        headerShown: false
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Catalog"
        component={CatalogScreen}
        options={{ tabBarLabel: 'Stores' }}
      />
      <Tab.Screen
        name="HomeRestro"
        component={HomeRestroScreen}
        options={{ tabBarLabel: 'Home Chef' }}
      />
      <Tab.Screen
        name="OrderTracking"
        component={OrderTrackingScreen}
        options={{ tabBarLabel: 'Orders' }}
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

const styles = StyleSheet.create({});
