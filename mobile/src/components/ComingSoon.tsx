// Placeholder for nav destinations that land in later Track-B steps (Alerts B-2,
// CV Builder B-3, Settings/Support B-4). Wires the drawer route up now so the
// nav shell is complete; the real screen replaces this file later.
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fontFamilies, fontSizes, pilot, spacing } from '../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../theme/ThemeContext';

export default function ComingSoon({
  title,
  note,
  icon = 'construct-outline',
}: {
  title: string;
  note: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={30} color={pilot.navy} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.note}>{note}</Text>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,63,136,0.06)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title: { fontFamily: fontFamilies.display, fontSize: fontSizes['2xl'], color: pilot.ink, textAlign: 'center' },
  note: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, textAlign: 'center', lineHeight: 22 },
});
