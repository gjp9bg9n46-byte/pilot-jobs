// The pieces the Airlines list and the fact file share — the app's half of
// frontend/src/components/airlines/AirlineBits.jsx, so the two platforms
// cannot drift.
import { StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../lib/api';
import { fontFamilies } from '../../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../theme/ThemeContext';

export const GREEN = '#15803D';
export const AMBER = '#B45309';
export const RED = '#B42318';

const HIRING: Record<string, { tone: 'g' | 'a' | 'r' | 'n'; label: string; long: string }> = {
  ACTIVELY_HIRING: { tone: 'g', label: 'Hiring', long: 'Actively hiring' },
  OCCASIONAL: { tone: 'a', label: 'Occasional', long: 'Hires occasionally' },
  PAUSED: { tone: 'r', label: 'Paused', long: 'Hiring paused' },
  UNKNOWN: { tone: 'n', label: 'Status unknown', long: 'Status unknown' },
};

export function HiringPill({ status, long = false }: { status?: string | null; long?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const h = HIRING[status || 'UNKNOWN'] || HIRING.UNKNOWN;
  return (
    <View style={[styles.pill, styles[`pill_${h.tone}` as 'pill_g']]}>
      {h.tone !== 'n' ? <View style={[styles.dot, styles[`dot_${h.tone}` as 'dot_g']]} /> : null}
      <Text style={[styles.pillText, styles[`text_${h.tone}` as 'text_g']]}>{long ? h.long : h.label}</Text>
    </View>
  );
}

// Wikimedia 403s non-browser clients, so those logos go through our proxy.
const proxied = (url: string) => (url.includes('upload.wikimedia.org')
  ? `${API_URL}/logo?src=${encodeURIComponent(url)}` : url);

export function LogoTile({ logoUrl, iataCode, name, size = 48 }: {
  logoUrl?: string | null; iataCode?: string | null; name?: string | null; size?: number;
}) {
  const styles = useThemedStyles(createStyles);
  const initials = (iataCode && iataCode.slice(0, 3).toUpperCase())
    || String(name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '—';
  return (
    <View style={[styles.tile, { height: size, minWidth: size, maxWidth: size * 1.5, borderRadius: size > 56 ? 12 : 8 }]}>
      {logoUrl
        ? <ExpoImage source={{ uri: proxied(logoUrl) }} contentFit="contain" cachePolicy="memory-disk" transition={150} style={{ width: size * 1.33, height: size * 0.84 }} />
        : <Text style={styles.initials}>{initials}</Text>}
    </View>
  );
}

export function RequirementRow({ label, status, you }: { label: string; status: string; you?: string | null }) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const icon = status === 'met' ? 'checkmark' : status === 'not-met' ? 'close' : 'help-circle-outline';
  const colour = status === 'met' ? GREEN : status === 'not-met' ? RED : AMBER;
  return (
    <View style={styles.req}>
      <Ionicons name={icon as 'checkmark'} size={15} color={colour} style={{ marginTop: 2 }} />
      <Text style={styles.reqLabel}>{label}</Text>
      {you ? <Text style={styles.reqYou}>{you}</Text> : null}
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  pill_g: { backgroundColor: '#ECF7EF' }, pill_a: { backgroundColor: '#FFF8EC' },
  pill_r: { backgroundColor: '#FDF0EF' }, pill_n: { backgroundColor: '#EEF2F7' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dot_g: { backgroundColor: GREEN }, dot_a: { backgroundColor: AMBER }, dot_r: { backgroundColor: RED }, dot_n: { backgroundColor: pilot.muted },
  pillText: { fontSize: 11.5, fontFamily: fontFamilies.bodySemiBold },
  text_g: { color: GREEN }, text_a: { color: AMBER }, text_r: { color: RED }, text_n: { color: pilot.muted },

  tile: { backgroundColor: '#EEF2F7', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, overflow: 'hidden' },
  initials: { fontFamily: fontFamilies.bodyBold, fontSize: 13, color: pilot.navy, letterSpacing: 0.4 },

  req: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#EEF1F5' },
  reqLabel: { flex: 1, fontSize: 13.5, color: pilot.ink, fontFamily: fontFamilies.body, lineHeight: 19 },
  reqYou: { fontSize: 12.5, color: pilot.faint, fontFamily: fontFamilies.body, textAlign: 'right' },
});
