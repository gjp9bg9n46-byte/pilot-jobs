import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { useAppSelector } from '../hooks/useAppDispatch';
import type { RootStackParamList, JobsStackParamList, LogbookStackParamList } from './types';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import JobsScreen from '../screens/jobs/JobsScreen';
import JobDetailScreen from '../screens/jobs/JobDetailScreen';
import AlertsScreen from '../screens/jobs/AlertsScreen';
import LogbookScreen from '../screens/logbook/LogbookScreen';
import AddLogScreen from '../screens/logbook/AddLogScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';

export const navigationRef = createNavigationContainerRef();

const RootStack = createNativeStackNavigator<RootStackParamList>();
const JobsNav = createNativeStackNavigator<JobsStackParamList>();
const LogbookNav = createNativeStackNavigator<LogbookStackParamList>();
const Tab = createBottomTabNavigator();

const COLORS = { primary: '#0A1628', accent: '#00B4D8', tab: '#1B2B4B' };

function BootSplash() {
  return (
    <View style={bs.container}>
      <ActivityIndicator color="#00B4D8" size="large" />
    </View>
  );
}

const bs = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628', justifyContent: 'center', alignItems: 'center' },
});

function MainTabs() {
  const unreadCount = useAppSelector((s) =>
    s.jobs.alerts.filter((a: any) => !a.readAt && !a.dismissedAt).length
  );

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: COLORS.tab, borderTopColor: '#243050' },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: '#7A8CA0',
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, [string, string]> = {
            Jobs: ['briefcase', 'briefcase-outline'],
            Alerts: ['notifications', 'notifications-outline'],
            Logbook: ['book', 'book-outline'],
            Profile: ['person', 'person-outline'],
            Settings: ['settings', 'settings-outline'],
          };
          const [active, inactive] = icons[route.name] || ['ellipse', 'ellipse-outline'];
          return <Ionicons name={(focused ? active : inactive) as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Jobs" component={JobsStack} />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{ tabBarBadge: unreadCount || undefined }}
      />
      <Tab.Screen name="Logbook" component={LogbookStack} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function JobsStack() {
  return (
    <JobsNav.Navigator screenOptions={{ headerStyle: { backgroundColor: COLORS.primary }, headerTintColor: '#fff' }}>
      <JobsNav.Screen name="JobsList" component={JobsScreen} options={{ title: 'Job Openings' }} />
      <JobsNav.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'Job Details' }} />
    </JobsNav.Navigator>
  );
}

function LogbookStack() {
  return (
    <LogbookNav.Navigator screenOptions={{ headerStyle: { backgroundColor: COLORS.primary }, headerTintColor: '#fff' }}>
      <LogbookNav.Screen name="LogbookList" component={LogbookScreen} options={{ title: 'Flight Logbook' }} />
      <LogbookNav.Screen
        name="AddLog"
        component={AddLogScreen}
        options={({ route }: any) => ({
          title: route.params?.mode === 'edit'    ? 'Edit Flight'
               : route.params?.mode === 'clone'   ? 'Duplicate Flight'
               : route.params?.mode === 'reverse' ? 'Return Leg'
               : 'Log a Flight',
        })}
      />
    </LogbookNav.Navigator>
  );
}

export default function AppNavigator() {
  const { token, bootstrapping } = useAppSelector((s) => s.auth);

  useEffect(() => {
    if (!bootstrapping) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [bootstrapping]);

  if (bootstrapping) {
    return <BootSplash />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {token ? (
          <RootStack.Screen name="Main" component={MainTabs} />
        ) : (
          <>
            <RootStack.Screen name="Login" component={LoginScreen} />
            <RootStack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
