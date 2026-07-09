// Expo push-notification registration. Deliberately NOT auto-prompted on first
// launch — `registerForPush(false)` (silent) runs on authed mount and only acquires
// a token if permission was ALREADY granted; the actual iOS permission prompt is
// triggered explicitly from Settings › Notifications ("Enable push"), which is the
// higher-grant-rate pattern (mirrors the web browser-push flow).
//
// An acquired token is PATCHed to /auth/fcm-token so the backend matching engine
// can push job alerts to this device (Expo tokens are routed via Expo's push API
// server-side). Everything is wrapped so a failure (Expo Go limitation, missing
// EAS projectId, web, denial) degrades gracefully, never crashes.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import api from './api';

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported' | 'error';
export interface PushResult { status: PushStatus; token: string | null; error?: string }

export async function getPushPermissionStatus(): Promise<PushStatus> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'error';
  }
}

export async function registerForPush(prompt: boolean): Promise<PushResult> {
  if (Platform.OS === 'web') return { status: 'unsupported', token: null };
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && prompt) {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') {
      return { status: status === 'denied' ? 'denied' : 'undetermined', token: null };
    }

    // Acquire an Expo push token (routed via Expo's push service). Needs an EAS
    // projectId in a dev/standalone build; in Expo Go it may be unavailable.
    let token: string | null = null;
    try {
      // Read the projectId lazily so a missing expo-constants never hard-fails import.
      const projectId =
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('expo-constants')?.default?.expoConfig?.extra?.eas?.projectId;
      const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      token = res.data;
    } catch (e: any) {
      console.log('[push] token acquisition failed (Expo Go / no EAS projectId):', e?.message);
      return { status: 'granted', token: null, error: e?.message };
    }

    // Store the token server-side so the matching engine can notify this device.
    if (token) {
      try {
        await api.patch('/auth/fcm-token', { fcmToken: token });
      } catch (e) {
        console.log('[push] failed to store token on backend:', (e as Error)?.message);
      }
    }
    return { status: 'granted', token };
  } catch (e: any) {
    return { status: 'error', token: null, error: e?.message };
  }
}
