import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useRiderAuth } from '../context/RiderAuthContext';
import { useDelivery } from '../context/DeliveryContext';
import { RiderLoginScreen } from '../screens/RiderLoginScreen';
import { DutyScreen } from '../screens/DutyScreen';
import { ActiveNavigationScreen } from '../screens/ActiveNavigationScreen';
import { EarningsScreen } from '../screens/EarningsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { OrderOfferModal } from '../components/OrderOfferModal';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const DeliveryTabs = () => {
  const { currentTask } = useDelivery();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#0284c7',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e2e8f0',
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 6
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700'
        },
        tabBarIcon: ({ color, size }) => {
          let iconName = 'bicycle-outline';
          if (route.name === 'Duty') iconName = 'speedometer-outline';
          else if (route.name === 'ActiveNavigation') iconName = 'navigate-outline';
          else if (route.name === 'Earnings') iconName = 'wallet-outline';
          else if (route.name === 'Profile') iconName = 'person-outline';
          return <Ionicons name={iconName} size={size || 22} color={color} />;
        }
      })}
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
          tabBarBadge: currentTask ? 'LIVE' : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#ea580c',
            color: '#ffffff',
            fontSize: 9,
            fontWeight: '800'
          }
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
        <ActivityIndicator size="large" color="#0284c7" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
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
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center'
  }
});
