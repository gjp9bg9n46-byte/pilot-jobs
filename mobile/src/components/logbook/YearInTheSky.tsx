// "Your year in the sky" — story-style deck, one figure per slide.
//
// Every number comes from the Reports endpoint the career cards read, so a
// year slide and a career card cannot disagree. Logged flights only:
// carry-forward has no date and belongs to no year.
//
// The share card is drawn in an off-screen WebView canvas at a fixed
// 1080×1920 or 1080×1350 — the same approach PF/PM uses, so no native module
// is added and the phone's pixel ratio has no say in the output.
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import RouteMap from './RouteMap';
import { num, num1 } from '../../lib/format';
import { yearCardHtml, STORY, FEED } from '../../lib/yearCardHtml';
import { tapLight, notifyError } from '../../lib/haptics';
import { fontFamilies, fontSizes, layout, radii, spacing } from '../../theme/tokens';
import { ThemePalette, useThemedStyles } from '../../theme/ThemeContext';

type Any = any;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (ym?: string) => (ym ? `${MONTHS[Number(ym.split('-')[1]) - 1]} ${ym.split('-')[0]}` : null);
const dateLabel = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
};

/** The slides, in order, with anything that has no data dropped. */
export function buildSlides(y: Any): Any[] {
  if (!y?.enough) return [];
  const s: Any[] = [];
  s.push({ key: 'intro', kind: 'intro', eyebrow: String(y.year), head: 'Your year in the sky',
    body: `From ${dateLabel(y.first)} to ${dateLabel(y.last)}.` });
  if (y.hours > 0) s.push({ key: 'hours', eyebrow: 'Hours flown', fig: num1(y.hours), unit: 'h', body: `Across ${num(y.sectors)} sector${y.sectors === 1 ? '' : 's'}.` });
  if (y.distance?.km > 0) s.push({ key: 'distance', eyebrow: 'Distance', fig: num(y.distance.km), unit: 'km', body: `${y.distance.moonPhrase}. ${num1(y.distance.earthLaps)} times around the Earth.` });
  if (y.places?.airportCount > 0) s.push({ key: 'places', kind: 'map', eyebrow: 'Places', fig: num(y.places.airportCount), unit: 'airports', body: `In ${num(y.places.countryCount)} countr${y.places.countryCount === 1 ? 'y' : 'ies'}.`, routes: y.places.routes });
  if (y.topAirport) s.push({ key: 'top', eyebrow: 'Most visited', fig: y.topAirport.code, mono: true, body: `${y.topAirport.name || y.topAirport.city || 'Your home field'} — ${num(y.topAirport.visits)} visits.` });
  if (y.distance?.longest) s.push({ key: 'longest', eyebrow: 'Longest flight', fig: `${y.distance.longest.from}–${y.distance.longest.to}`, mono: true, body: `${num(y.distance.longest.km)} km on ${dateLabel(y.distance.longest.date)}.` });
  if (y.favouriteTail) s.push({ key: 'tail', eyebrow: 'Favourite aircraft', fig: y.favouriteTail.registration, mono: true, body: `${num(y.favouriteTail.sectors)} sector${y.favouriteTail.sectors === 1 ? '' : 's'} on this one tail.` });
  if (y.sun && (y.sun.sunrises > 0 || y.sun.sunsets > 0)) s.push({ key: 'sun', eyebrow: 'Sunrises from the flight deck', fig: num(y.sun.sunrises), body: `And ${num(y.sun.sunsets)} sunset${y.sun.sunsets === 1 ? '' : 's'}, counted along your routes.` });
  if (y.night?.percent != null) s.push({ key: 'night', eyebrow: 'After dark', fig: `${y.night.percent}%`, body: `${num1(y.night.nightHours)} of your ${num1(y.night.totalHours)} hours were at night.` });
  if (y.busiestMonth) s.push({ key: 'busiest', eyebrow: 'Busiest month', fig: monthName(y.busiestMonth.month), small: true, body: `${num1(y.busiestMonth.hours)} hours in one month.` });
  s.push({ key: 'end', kind: 'end', eyebrow: 'Your year', head: `${y.year} in the sky` });
  return s;
}

export default function YearInTheSky({ year, years = [], onYearChange }: { year: Any; years?: number[]; onYearChange?: (y: number) => void }) {
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const [i, setI] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<{ w: number; h: number } | null>(null);

  const slides = useMemo(() => buildSlides(year), [year]);
  const at = slides[Math.min(i, Math.max(0, slides.length - 1))];

  const share = useCallback((size: { w: number; h: number }) => {
    tapLight(); setNote('Making the card…'); setPending(size);
  }, []);

  const onCard = useCallback(async (dataUrl: string) => {
    setPending(null);
    try {
      if (!dataUrl?.startsWith('data:image/png;base64,')) throw new Error('the card did not render');
      const base64 = dataUrl.split(',')[1];
      const uri = `${FileSystem.cacheDirectory}cockpithire-${year.year}-year.png`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `My ${year.year} in the sky`, UTI: 'public.png' });
        setNote(null);
      } else { setNote(`Saved to ${uri}`); }
    } catch (e) {
      notifyError();
      setNote(`Could not make the card: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [year]);

  if (!year) return null;

  const picker = years.length > 1 ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.years}>
      {years.map((yr) => (
        <Pressable key={yr} onPress={() => { setI(0); onYearChange?.(yr); }} style={[styles.yearChip, yr === year.year && styles.yearChipOn]}>
          <Text style={[styles.yearChipT, yr === year.year && styles.yearChipTOn]}>{yr}</Text>
        </Pressable>
      ))}
    </ScrollView>
  ) : null;

  if (!year.enough) {
    return (
      <View style={styles.card}>
        {picker}
        <Text style={styles.h2}>Your {year.year} in the sky</Text>
        <Text style={styles.sub}>
          {year.flightCount === 0
            ? `No flights logged in ${year.year} yet. Once you have a few, this becomes your year in review.`
            : `Only ${num(year.flightCount)} flight${year.flightCount === 1 ? '' : 's'} logged in ${year.year} so far — too few to make a year of it. Come back after ${num(year.minFlights)}.`}
        </Text>
      </View>
    );
  }

  const navy = at.kind === 'intro' || at.kind === 'end';
  const last = i === slides.length - 1;

  return (
    <View style={styles.card}>
      {picker}

      <View style={styles.rail}>
        {slides.map((s, n) => (
          <Pressable key={s.key} onPress={() => setI(n)} style={styles.pipHit} accessibilityLabel={`Slide ${n + 1}`}>
            <View style={[styles.pip, n === i && styles.pipOn]} />
          </Pressable>
        ))}
      </View>

      <View style={[styles.slide, navy && styles.slideNavy, { minHeight: Math.min(380, width * 0.92) }]}>
        <Text style={[styles.eyebrow, navy && styles.eyebrowNavy]}>{at.eyebrow}</Text>
        {navy ? (
          <Text style={styles.head}>{at.head}</Text>
        ) : (
          <Text style={[styles.fig, at.mono && styles.figMono, at.small && styles.figSmall]}>
            {at.fig}{at.unit ? <Text style={styles.unit}> {at.unit}</Text> : null}
          </Text>
        )}
        {at.kind === 'map' && at.routes?.length ? (
          <View style={styles.map}>
            <RouteMap sectors={at.routes.map((r: Any) => ({ from: r.from, to: r.to }))} height={150} scope="all" />
          </View>
        ) : null}
        {at.body ? <Text style={[styles.body, navy && styles.bodyNavy]}>{at.body}</Text> : null}
        <Text style={[styles.brand, navy && styles.brandNavy]}>CockpitHire</Text>
      </View>

      <View style={styles.nav}>
        <Pressable onPress={() => setI((c) => Math.max(0, c - 1))} disabled={i === 0} hitSlop={8}>
          <Text style={[styles.arrow, i === 0 && styles.arrowOff]}>← Back</Text>
        </Pressable>
        <Text style={styles.count}>{i + 1} of {slides.length}</Text>
        <Pressable onPress={() => setI((c) => Math.min(slides.length - 1, c + 1))} disabled={last} hitSlop={8}>
          <Text style={[styles.arrow, last && styles.arrowOff]}>Next →</Text>
        </Pressable>
      </View>

      {last ? (
        <View style={styles.shareRow}>
          <Pressable style={styles.shareBtn} onPress={() => share(STORY)} disabled={!!pending}>
            <Text style={styles.shareBtnT}>{pending ? 'Making the card…' : 'Share — story'}</Text>
          </Pressable>
          <Pressable style={[styles.shareBtn, styles.shareGhost]} onPress={() => share(FEED)} disabled={!!pending}>
            <Text style={[styles.shareBtnT, styles.shareGhostT]}>Feed</Text>
          </Pressable>
        </View>
      ) : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}

      <Text style={styles.note}>
        Based on {num(year.flightCount)} logged flight{year.flightCount === 1 ? '' : 's'} in {year.year}.
        {year.basis?.withoutAirports ? ` ${num(year.basis.withoutAirports)} without airports aren’t included in the distance or the map.` : ''}
      </Text>

      {/* Off-screen, and mounted only while a card is being drawn. */}
      {pending ? (
        <View style={styles.offscreen} pointerEvents="none">
          <WebView
            originWhitelist={['*']}
            source={{ html: yearCardHtml(year, pending) }}
            onMessage={(e) => onCard(e.nativeEvent.data)}
            javaScriptEnabled
          />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  card: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: radii.lg, padding: layout.cardPad },
  h2: { fontFamily: fontFamilies.display, fontSize: fontSizes.lg, color: pilot.ink },
  sub: { color: pilot.muted, fontSize: fontSizes.sm, marginTop: 4, lineHeight: 20 },
  note: { color: pilot.muted, fontSize: fontSizes.xs, marginTop: 12, lineHeight: 18 },

  years: { flexDirection: 'row', gap: 6, paddingBottom: spacing.md },
  yearChip: { borderWidth: 1, borderColor: pilot.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  yearChipOn: { backgroundColor: pilot.navy, borderColor: pilot.navy },
  yearChipT: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.bodySemiBold },
  yearChipTOn: { color: '#fff' },

  rail: { flexDirection: 'row', gap: 4, marginBottom: spacing.md },
  pipHit: { flex: 1, paddingVertical: 6 },
  pip: { height: 3, borderRadius: 2, backgroundColor: pilot.line },
  pipOn: { backgroundColor: pilot.navy },

  slide: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: radii.lg, padding: layout.cardPad, justifyContent: 'flex-end' },
  slideNavy: { backgroundColor: '#0B1F3A', borderColor: '#0B1F3A' },
  eyebrow: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: pilot.muted, fontFamily: fontFamilies.bodySemiBold },
  eyebrowNavy: { color: '#8FB3E0' },
  fig: { fontFamily: fontFamilies.display, fontSize: 46, color: pilot.ink, marginTop: 'auto' },
  figMono: { fontFamily: fontFamilies.mono, fontSize: 34 },
  figSmall: { fontSize: 30 },
  unit: { fontFamily: fontFamilies.body, fontSize: fontSizes.lg, color: pilot.muted },
  head: { fontFamily: fontFamilies.display, fontSize: 32, color: '#fff', marginTop: 'auto' },
  body: { fontSize: fontSizes.base, lineHeight: 22, color: pilot.muted, marginTop: 12 },
  bodyNavy: { color: '#C4D2E4' },
  map: { marginTop: spacing.md },
  brand: { fontFamily: fontFamilies.display, fontSize: fontSizes.sm, color: pilot.muted, marginTop: spacing.lg },
  brandNavy: { color: '#8FB3E0' },

  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  arrow: { fontSize: fontSizes.base, color: pilot.navy, fontFamily: fontFamilies.bodyMedium },
  arrowOff: { color: pilot.muted },
  count: { fontFamily: fontFamilies.mono, fontSize: fontSizes.xs, color: pilot.muted },

  shareRow: { flexDirection: 'row', gap: 10, marginTop: spacing.md },
  shareBtn: { flex: 1, backgroundColor: pilot.navy, borderWidth: 1, borderColor: pilot.navy, borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  shareGhost: { flex: 0, paddingHorizontal: 18, backgroundColor: pilot.surface },
  shareBtnT: { color: '#fff', fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold },
  shareGhostT: { color: pilot.navy },

  offscreen: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999, top: -9999 },
});
