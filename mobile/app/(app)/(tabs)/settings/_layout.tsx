// Settings lives inside the (tabs) group (hidden from the bar via href:null in
// the tabs layout) so the floating bottom tab bar stays visible on it. This
// Stack makes the directory register as ONE route named "settings" — without
// it, settings/index and settings/notifications would each become stray tabs.
import { Stack } from 'expo-router';
import { useThemeColors } from '../../../../src/theme/ThemeContext';

export default function SettingsStack() {
  const pilot = useThemeColors();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: pilot.cream } }} />;
}
