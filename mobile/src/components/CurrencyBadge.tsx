// CurrencyBadge — 90-day currency, mirrored from Logbook.jsx.
// Fetches the most-recent 50 flights SEPARATELY from the paginated table (page 1,
// limit 50) so the value is page-independent (commit 51bb777). Counts landings in
// the last 90 days; day/night current when >= 3. Renders "Currency (90 days)" +
// a Day badge + a Night badge, green (current) / red (not current) — matching web.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import api from '../lib/api';
import { computeCurrency } from '../lib/logbook';
import { fontFamilies, fontSizes, pilot, semantic } from '../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../theme/ThemeContext';

export default function CurrencyBadge({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const styles = useThemedStyles(createStyles);
  const [cur, setCur] = useState<{ dayCurrent: boolean; nightCurrent: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/flight-logs', { params: { page: 1, limit: 50 } });
      setCur(computeCurrency(data.logs || []));
    } catch {
      setCur(null);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshSignal]);

  const day = cur?.dayCurrent ?? false;
  const night = cur?.nightCurrent ?? false;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>CURRENCY (90 DAYS)</Text>
      <View style={styles.badges}>
        <Pill ok={day} label={day ? '✓ Day Current' : '✕ Day Not Current'} />
        <Pill ok={night} label={night ? '✓ Night Current' : '✕ Night Not Current'} />
      </View>
    </View>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.pill, { backgroundColor: ok ? semantic.successBg : semantic.errorBg }]}>
      <Text style={[styles.pillText, { color: ok ? semantic.success : semantic.error }]}>{label}</Text>
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  card: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 14, padding: 16, marginBottom: 16 },
  title: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyBold, color: pilot.muted, letterSpacing: 0.6, marginBottom: 10 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  pillText: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyBold },
});
