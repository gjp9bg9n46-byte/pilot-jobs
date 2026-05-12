import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { authApi } from './api';

/**
 * allowPrompt = true  → may show the iOS/Android permission dialog (call after sign-in)
 * allowPrompt = false → only registers if permission already granted (call on session restore)
 */
export async function registerPushToken(allowPrompt: boolean): Promise<void> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (!allowPrompt && existing !== 'granted') return;

    const { status } = allowPrompt
      ? await Notifications.requestPermissionsAsync()
      : { status: existing };

    if (status !== 'granted') return;

    const { data: fcmToken } = await Notifications.getExpoPushTokenAsync();
    const authToken = await SecureStore.getItemAsync('authToken');
    if (authToken && fcmToken) {
      authApi.updateFcmToken(fcmToken).catch(() => {});
    }
  } catch {
    // Non-fatal — push registration failure should never block the UI.
  }
}
