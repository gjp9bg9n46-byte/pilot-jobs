// ── Haptics ──────────────────────────────────────────────────────────────────
// Touch feedback for the moments where something committed or a list changed
// under the user's thumb. Deliberately sparse: a buzz on everything is noise,
// and noise is worse than silence. Light impact for "this took effect",
// success notification for "your work is saved".
//
// No-ops on web and silently ignores a device without a taptic engine.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const on = Platform.OS === 'ios' || Platform.OS === 'android';

/** A filter changed, a segment switched, a row committed. */
export const tapLight = () => { if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
/** A sheet opened or a destructive confirm appeared. */
export const tapMedium = () => { if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };
/** Saved: a flight written, a scan accepted. */
export const notifySuccess = () => { if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };
/** The save failed and the user must do something about it. */
export const notifyError = () => { if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); };
