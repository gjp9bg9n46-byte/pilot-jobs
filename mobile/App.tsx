import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { store, setAuth, setBootstrapped, loadUIPrefs, addAlert } from './src/store';
import AppNavigator, { navigationRef } from './src/navigation';
import { authApi } from './src/services/api';
import { registerPushToken } from './src/services/notifications';

// Keep the native splash visible until we finish restoring the session.
SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function AppInner() {
  useEffect(() => {
    store.dispatch(loadUIPrefs());

    // Restore session on launch
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('authToken');
        if (token) {
          const { data } = await authApi.me();
          store.dispatch(setAuth({ token, pilot: data }));
          registerPushToken(false);
        }
      } catch {
        await SecureStore.deleteItemAsync('authToken');
      } finally {
        store.dispatch(setBootstrapped());
      }
    })();

    // Foreground push: dispatch new alert into Redux (idempotent)
    const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as any;
      if (data?.type === 'MATCH_ALERT' && data.alert) {
        try {
          const parsed = typeof data.alert === 'string' ? JSON.parse(data.alert) : data.alert;
          store.dispatch(addAlert(parsed));
        } catch {}
      }
    });

    // Background tap: navigate to Alerts tab
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (data?.type === 'MATCH_ALERT') {
        if (navigationRef.isReady()) {
          (navigationRef as any).navigate('Main', { screen: 'Alerts' });
        }
      }
    });

    return () => {
      foregroundSub.remove();
      responseSub.remove();
    };
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  );
}

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider store={store}>
        <AppInner />
      </Provider>
    </GestureHandlerRootView>
  );
}

import { registerRootComponent } from 'expo';
registerRootComponent(App);
