// ── The flight row ───────────────────────────────────────────────────────────
// Built around the one thing only CockpitHire shows: the four-point
// OUT · OFF · ON · IN track, so taxi time and airborne time are readable at a
// glance. Grey ends are the gate, the navy segment is airborne.
//
//   MSC 2934   A320              ☾ 3:05   PF
//   HRG                 5:17                 HAJ
//   19:36      ●──●━━━━━━━━━━●──●         00:53⁺¹
//   SU-BWO                      ⇄ Return from 17 Oct
//
// Night is a duration, not just an icon — an hour of night is information, the
// icon alone is decoration. Kept from the old row: day headers, +1 arrivals,
// the overnight link (now in the footer), PF/PM, and tap-to-open.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import PressableScale from '../PressableScale';
import { duration, landsNextDay, TimeFormat } from '../../lib/logbookFormat';
import { ThemePalette, useThemedStyles } from '../../theme/ThemeContext';
import { fontFamilies } from '../../theme/tokens';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Log = Record<string, any>;

const toMin = (s?: string | null) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};
// Minutes from a to b, allowing one wrap past midnight.
const span = (a: number | null, b: number | null) =>
  (a == null || b == null) ? null : (b >= a ? b - a : 1440 - a + b);

/**
 * Where OFF and ON sit along the OUT→IN line, as percentages.
 * Returns null when the middle two times are missing — then the row draws the
 * gate-to-gate line only, rather than inventing a taxi time.
 */
export function trackPoints(log: Log) {
  const out = toMin(log.offBlocksTime), off = toMin(log.takeoffTime);
  const on = toMin(log.landingTime), inn = toMin(log.onBlocksTime);
  const block = span(out, inn);
  if (!block || off == null || on == null) return null;
  const toOff = span(out, off), toIn = span(on, inn);
  if (toOff == null || toIn == null) return null;
  const left = Math.min(45, Math.max(0, (toOff / block) * 100));
  const right = Math.min(45, Math.max(0, (toIn / block) * 100));
  return { left, right };
}

export default function FlightRow({
  log, timeFormat, overnightFrom, overlap, onPress,
}: {
  log: Log;
  timeFormat: TimeFormat;
  overnightFrom?: string | null;
  overlap?: string | null;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const pts = trackPoints(log);
  const night = Number(log.nightTime) || 0;
  const role = log.pilotFlying === true ? 'PF' : log.pilotFlying === false ? 'PM' : null;
  const plus1 = landsNextDay(log.offBlocksTime, log.onBlocksTime);

  return (
    <PressableScale style={styles.card} onPress={onPress} accessibilityRole="button">
      {/* Flight number, type, night and role — the strip across the top. */}
      <View style={styles.meta}>
        <Text style={styles.flightNo}>{log.flightNumber || '—'}</Text>
        {log.displayType || log.aircraftType ? (
          <Text style={styles.type}>{log.displayType || log.aircraftType}</Text>
        ) : null}
        <View style={styles.metaRight}>
          {night > 0 ? (
            <View style={styles.night}>
              <Ionicons name="moon-outline" size={12} color={styles.nightText.color as string} />
              <Text style={styles.nightText}>{duration(night, timeFormat)}</Text>
            </View>
          ) : null}
          {role ? <Text style={[styles.tag, role === 'PF' ? styles.tagPf : styles.tagPm]}>{role}</Text> : null}
        </View>
      </View>

      {/* Departure · block over the track · arrival. */}
      <View style={styles.route}>
        <View style={styles.ap}>
          <Text style={styles.code}>{log.departure || '—'}</Text>
          <Text style={styles.tm}>{log.offBlocksTime || '—'}</Text>
        </View>

        <View style={styles.mid}>
          <Text style={styles.blk}>{duration(log.totalTime, timeFormat)}</Text>
          <View style={styles.track} accessibilityLabel="Out, off, on and in">
            <View style={styles.base} />
            <View style={[styles.air, pts ? { left: `${pts.left}%`, right: `${pts.right}%` } : { left: 0, right: 0 }]} />
            <View style={[styles.dot, styles.dotGate, { left: 0 }]} />
            {pts ? <View style={[styles.dot, { left: `${pts.left}%`, marginLeft: -4 }]} /> : null}
            {pts ? <View style={[styles.dot, { right: `${pts.right}%`, marginRight: -4 }]} /> : null}
            <View style={[styles.dot, styles.dotGate, { right: 0 }]} />
          </View>
        </View>

        <View style={[styles.ap, styles.apEnd]}>
          <Text style={styles.code}>{log.arrival || '—'}</Text>
          <Text style={styles.tm}>
            {log.onBlocksTime || '—'}{plus1 ? <Text style={styles.plus1}>+1</Text> : null}
          </Text>
        </View>
      </View>

      {/* Registration, and the overnight link or an overlap warning. */}
      <View style={styles.foot}>
        <Text style={styles.reg}>{log.registration || ''}</Text>
        {overlap ? (
          <Text style={styles.overlap} numberOfLines={1}>{overlap}</Text>
        ) : overnightFrom ? (
          <View style={styles.night}>
            <Ionicons name="swap-horizontal" size={12} color={styles.reg.color as string} />
            <Text style={styles.reg}>Return from {overnightFrom}</Text>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  card: {
    backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line,
    borderRadius: 14, padding: 14, marginBottom: 10,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flightNo: { fontFamily: fontFamilies.mono, fontSize: 13, fontWeight: '600', color: pilot.ink },
  type: { fontFamily: fontFamilies.body, fontSize: 12.5, color: pilot.muted },
  metaRight: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  night: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nightText: { fontFamily: fontFamilies.mono, fontSize: 12, color: pilot.muted },
  tag: { fontFamily: fontFamilies.bodyBold, fontSize: 10.5, letterSpacing: 0.4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  tagPf: { backgroundColor: pilot.accentSoft ?? '#DCE7F5', color: pilot.navy },
  tagPm: { backgroundColor: '#EEF1F5', color: pilot.faint },

  route: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, gap: 10 },
  ap: { minWidth: 56 },
  apEnd: { alignItems: 'flex-end' },
  code: { fontFamily: fontFamilies.display, fontSize: 20, color: pilot.ink, lineHeight: 24 },
  tm: { fontFamily: fontFamilies.mono, fontSize: 13, color: pilot.muted, marginTop: 2 },
  plus1: { fontFamily: fontFamilies.bodyBold, fontSize: 10, color: '#B45309' },

  mid: { flex: 1, alignItems: 'center', paddingBottom: 2 },
  blk: { fontFamily: fontFamilies.mono, fontSize: 15, fontWeight: '600', color: pilot.navy },
  track: { height: 14, alignSelf: 'stretch', marginTop: 4 },
  base: { position: 'absolute', left: 0, right: 0, top: 6, height: 2, borderRadius: 1, backgroundColor: pilot.line },
  air: { position: 'absolute', top: 6, height: 2, borderRadius: 1, backgroundColor: pilot.navy },
  dot: { position: 'absolute', top: 3, width: 8, height: 8, borderRadius: 4, backgroundColor: pilot.surface, borderWidth: 2, borderColor: pilot.navy },
  dotGate: { borderColor: '#B7C3D3' },

  foot: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#EEF1F5',
  },
  reg: { fontFamily: fontFamilies.mono, fontSize: 12, color: pilot.faint },
  overlap: { flex: 1, textAlign: 'right', fontFamily: fontFamilies.body, fontSize: 12, color: '#B42318' },
});
