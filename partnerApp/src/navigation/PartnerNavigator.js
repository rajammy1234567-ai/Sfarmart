import React from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { VendorDashboardScreen } from '../screens/VendorDashboardScreen';
import { AddProductScreen, InventoryScreen, SettlementsScreen } from '../screens/AddProductScreen';
import { PartnerAccountScreen } from '../screens/PartnerAccountScreen';
import { GlassTabBar } from './GlassTabBar';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const OrdersScreenWrapper = (props) => (
  <VendorDashboardScreen {...props} initialSection="orders" />
);

const getInitialTab = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    try {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab && ['Dashboard', 'Orders', 'Inventory', 'Reports', 'Account'].includes(tab)) {
        return tab;
      }
    } catch {}
  }
  return 'Dashboard';
};

const getInitialStack = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    try {
      const screen = new URLSearchParams(window.location.search).get('screen');
      if (screen === 'AddProduct') return 'AddProduct';
    } catch {}
  }
  return 'PartnerTabs';
};

const PartnerTabs = () => {
  return (
    <Tab.Navigator
      initialRouteName={getInitialTab()}
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={VendorDashboardScreen}
        options={{ tabBarLabel: 'Dashboard' }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreenWrapper}
        options={{ tabBarLabel: 'Orders' }}
      />
      <Tab.Screen
        name="Inventory"
        component={InventoryScreen}
        options={{ tabBarLabel: 'Inventory' }}
      />
      <Tab.Screen
        name="Reports"
        component={SettlementsScreen}
        options={{ tabBarLabel: 'Reports' }}
      />
      <Tab.Screen
        name="Account"
        component={PartnerAccountScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

export const PartnerNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName={getInitialStack()}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 250,
        gestureEnabled: true,
        fullScreenGestureEnabled: true
      }}
    >
      <Stack.Screen name="PartnerTabs" component={PartnerTabs} />
      <Stack.Screen name="AddProduct" component={AddProductScreen} />
    </Stack.Navigator>
  );
};
