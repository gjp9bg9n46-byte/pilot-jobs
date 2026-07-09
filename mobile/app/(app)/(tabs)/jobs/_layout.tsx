import { Stack } from 'expo-router';
import { pilot } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

export default function JobsStack() {
  const pilot = useThemeColors();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: pilot.cream } }} />
  );
}
