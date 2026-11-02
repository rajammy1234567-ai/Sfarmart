import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useRiderAuth } from '../context/RiderAuthContext';
import { useDelivery } from '../context/DeliveryContext';
import { RiderLoginScreen } from '../screens/RiderLoginScreen';
import { DutyScreen } from '../screens/DutyScreen';
import { ActiveNavigationScreen } from '../screens/ActiveNavigationScreen';
import { EarningsScreen } from '../screens/EarningsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { OrderOfferModal } from '../components/OrderOfferModal';
import { BrandTabBar } from './BrandTabBar';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const DeliveryTabs = () => {
  const { currentTask } = useDelivery();

  return (
    <Tab.Navigator
      tabBar={(props) => <BrandTabBar {...props} />}
      screenOptions={{
        headerShown: false
      }}
    >
      <Tab.Screen
        name="Duty"
        component={DutyScreen}
        options={{ tabBarLabel: 'Duty Queue' }}
      />
      <Tab.Screen
        name="ActiveNavigation"
        component={ActiveNavigationScreen}
        options={{
          tabBarLabel: 'Active Trip',
          tabBarBadge: currentTask ? 'LIVE' : undefined
        }}
      />
      <Tab.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{ tabBarLabel: 'Payouts' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

export const DeliveryNavigator = () => {
  const { isAuthenticated, isLoading } = useRiderAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="RiderLogin" component={RiderLoginScreen} />
        ) : (
          <Stack.Screen name="DeliveryTabs" component={DeliveryTabs} />
        )}
      </Stack.Navigator>

      {/* Global incoming order 20s offer chime modal */}
      {isAuthenticated && <OrderOfferModal />}
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center'
  }
});
