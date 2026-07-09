// Authenticated-area layout. Account-type aware:
//  - Pilot: themed (editorial-light or dark navy). Owns the top safe-area inset
//    and mounts the persistent brand-navy top header (logo + bell + settings
//    gear) above the Stack. Primary navigation is the bottom Tabs (inside the
//    (tabs) screen); Settings (which contains Support, Airlines, admin links,
//    and the theme toggle) is reached from the header gear. VerifyEmailBanner
//    sits just under the header.
//  - Employer: cool-operator grey; each employer screen renders its own
//    EmployerHeader (+ its own banner), so this layout skips the pilot chrome.
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import VerifyEmailBanner from '../../src/components/VerifyEmailBanner';
import AppHeader from '../../src/components/AppHeader';
import { useAuth } from '../../src/context/AuthContext';
import { UnreadProvider } from '../../src/context/UnreadContext';
import { useThemeColors } from '../../src/theme/ThemeContext';
import { employer as emp, pilot as pilotStatic } from '../../src/theme/tokens';

export default function AppLayout() {
  const { accountType } = useAuth();
  const pilot = useThemeColors();
  const isEmployer = accountType === 'employer';

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
