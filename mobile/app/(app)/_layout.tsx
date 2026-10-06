// Authenticated-area layout. Account-type aware:
//  - Pilot: themed (editorial-light or dark navy). Owns the top safe-area inset
//    and mounts the persistent brand-navy top header (logo + bell + settings
//    gear) above the Stack. Primary navigation is the bottom Tabs (inside the
//    (tabs) screen); Settings (which contains Support, Airlines, admin links,
//    and the theme toggle) is reached from the header gear. VerifyEmailBanner
//    sits just under the header.
//  - Employer: cool-operator grey; each employer screen renders its own
//    EmployerHeader (+ its own banner), so this layout skips the pilot chrome.
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import VerifyEmailBanner from '../../src/components/VerifyEmailBanner';
import AppHeader from '../../src/components/AppHeader';
import { useAuth } from '../../src/context/AuthContext';
import { UnreadProvider } from '../../src/context/UnreadContext';
import { useThemeColors } from '../../src/theme/ThemeContext';
import { employer as emp, pilot as pilotStatic } from '../../src/theme/tokens';

// Route a tapped push to the right screen. The backend sends data.jobId on a
// MATCH_ALERT (notificationService.sendJobAlert) — a job push opens that job, any
// other match/alert push lands on the Dashboard. Handles cold start (the tap that
// launched the app) and taps while running. No-op when nothing routable is present.
function useNotificationRouting() {
  const router = useRouter();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const route = (resp: Notifications.NotificationResponse | null) => {
      if (!resp || resp.notification.request.identifier === handled.current) return;
      handled.current = resp.notification.request.identifier;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (resp.notification.request.content.data || {}) as any;
      if (data.jobId) router.push(`/jobs/${data.jobId}`);
      else if (data.type) router.push('/dashboard');
    };
    Notifications.getLastNotificationResponseAsync().then(route).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(route);
    return () => sub.remove();
  }, [router]);
}

export default function AppLayout() {
  const { accountType } = useAuth();
  const pilot = useThemeColors();
  const isEmployer = accountType === 'employer';
  useNotificationRouting();

  if (isEmployer) {
    return (
      <View style={{ flex: 1, backgroundColor: emp.bg }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: emp.bg } }} />
      </View>
    );
  }

  // UnreadProvider wraps header + Stack so the bell badge, the Alerts tab badge,
  // and the Alerts screen's Matches badge all share one count (live across screens).
  return (
    <UnreadProvider>
      <View style={{ flex: 1, backgroundColor: pilot.cream }}>
        {/* The header bar is brand navy in BOTH themes, so the status bar text is
            always light here (auth screens fall back to the root's themed bar). */}
        <StatusBar style="light" />
        <SafeAreaView edges={['top']} style={{ backgroundColor: pilotStatic.navy }}>
          <AppHeader />
        </SafeAreaView>
        <VerifyEmailBanner />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: pilot.cream } }} />
      </View>
    </UnreadProvider>
  );
}
