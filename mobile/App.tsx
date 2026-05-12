import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { store, setAuth, setBootstrapped, loadUIPrefs } from './src/store';
import AppNavigator from './src/navigation';
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
          // Token was valid — register push without prompting (permission may
          // already be granted; if not, don't bother the user until they sign in).
          registerPushToken(false);
        }
      } catch {
        await SecureStore.deleteItemAsync('authToken');
      } finally {
        // Always mark bootstrap done, whether we restored a session or not.
        store.dispatch(setBootstrapped());
      }
    })();
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
    <Provider store={store}>
      <AppInner />
    </Provider>
  );
}

import { registerRootComponent } from 'expo';
registerRootComponent(App);
