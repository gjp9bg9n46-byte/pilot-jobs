// Flight map & airport statistics — full screen (was a Sheet popup, which
// stuttered no matter how the mount was deferred; native stack navigation
// animates smoothly by design). Reached from the Profile header button.
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../src/lib/api';
import FlightMap from '../../../../src/components/FlightMap';
import { FlightDashboard } from './index';
import { TAB_BAR_CLEARANCE } from '../../../../src/theme/tabBar';
import { fontFamilies, fontSizes, spacing } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

export default function FlightMapScreen() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [totals, setTotals] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    api.get('/profile/totals').then(({ data }) => setTotals(data)).catch(() => {});
  }, []);

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn} accessibilityLabel="Back to profile">
            <Ionicons name="chevron-back" size={22} color={pilot.navy} />
          </Pressable>
          <View>
            <Text style={styles.h1}>Flight map & airports</Text>
            <Text style={styles.subtitle}>Every airport recorded in your logbook</Text>
          </View>
        </View>
        {totals && Number(totals.totalTime) > 0 ? (
          <View style={{ marginBottom: 18 }}>
            <FlightDashboard totals={totals} styles={styles} palette={pilot} />
          </View>
        ) : null}
        <FlightMap />
      </ScrollView>
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  content: { padding: spacing.xl, paddingBottom: TAB_BAR_CLEARANCE },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes['2xl'], color: pilot.ink },
  subtitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.sm, color: pilot.muted, marginTop: 2 },
  dashTop: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 16 },
  donutWrap: { width: 124, height: 124, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center' },
  donutNum: { fontFamily: fontFamilies.mono, fontSize: 21, fontWeight: '800', color: pilot.ink },
  donutLabel: { fontSize: 9, fontFamily: fontFamilies.bodySemiBold, color: pilot.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 },
  legendCol: { flex: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { fontSize: 13, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink, flex: 1 },
  legendVal: { fontFamily: fontFamilies.mono, fontSize: 12, color: pilot.muted },
  barBlock: { marginBottom: 10 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { fontSize: 12, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  barVal: { fontFamily: fontFamilies.mono, fontSize: 11, color: pilot.muted },
  barTrack: { height: 8, backgroundColor: pilot.cream, borderWidth: 1, borderColor: pilot.line, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: pilot.navy, borderRadius: 3 },
});
