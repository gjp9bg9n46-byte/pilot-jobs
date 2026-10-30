// Flight detail, as the mockup: the four times, what was derived from them,
// the duty facts, and the four things a line pilot does next. Block, airborne
// and night are labelled calculated so nobody hunts for a field to type them in.
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../src/lib/api';
import { getPendingFlight, setPendingFlight } from '../../../../src/lib/pendingFlight';
import {
  duration, greatCircleNm, landsNextDay, minutesToHHMM, routeNames, spanMinutes,
  type TimeFormat,
} from '../../../../src/lib/logbookFormat';
import RouteMap, { useAirportCoords } from '../../../../src/components/logbook/RouteMap';
import { useLogbook } from '../../../../src/hooks/queries';
import { fontFamilies, fontSizes, spacing, layout } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function FlightDetail() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [flight, setFlight] = useState<Any>(() => getPendingFlight());

  // Arriving from a deep link (or a reload) there is nothing stashed, so fall
  // back to the list endpoint rather than showing an empty screen.
  useEffect(() => {
    if (flight && flight.id === id) return;
    api.get('/flight-logs', { params: { page: 1, limit: 1000 } })
      .then(({ data }) => setFlight((data.logs || []).find((l: Any) => l.id === id) || null))
      .catch(() => setFlight(null));
  }, [id, flight]);

  // Both hooks run on EVERY render, before any early return: React counts
  // hooks by call order, and a return above them makes the next render see a
  // different number. That is React error #310, and preflight caught it.
  // hh:mm or decimal — the pilot's own setting, the same one the list uses.
  const { data: logbook } = useLogbook(1);
  const timeFormat: TimeFormat = (logbook?.prefs?.timeFormat as TimeFormat) ?? 'hhmm';
  const { data: air } = useAirportCoords();

  if (!flight) {
    return (
      <SafeAreaView style={styles.safe} edges={[]}>
        <View style={styles.bar}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}><Ionicons name="chevron-back" size={22} color={pilot.ink} /></Pressable>
          <Text style={styles.barTitle}>Flight</Text>
        </View>
        <Text style={styles.empty}>That flight is no longer in your logbook.</Text>
      </SafeAreaView>
    );
  }

  // A flight typed in as a block time alone has no OUT and no IN to span, so
  // the figure it was saved with is the block.
  const block = spanMinutes(flight.offBlocksTime, flight.onBlocksTime)
    ?? (flight.totalTime > 0 ? Math.round(flight.totalTime * 60) : null);
  const airborne = spanMinutes(flight.takeoffTime, flight.landingTime);
  const role = (flight.picTime || 0) > 0 ? 'PIC' : 'SIC';
  const roleHours = role === 'PIC' ? (flight.picTime || 0) : (flight.sicTime || 0);
  // An imported row often carries a block and no PIC/SIC split at all. Saying
  // "SIC auto 0:00" asserts the pilot logged none, which is a claim about
  // their hours that nothing in the row supports.
  const splitMissing = roleHours === 0 && (flight.totalTime || 0) > 0;
  const landings = (flight.landingsDay || 0) + (flight.landingsNight || 0);

  // The two ends of this sector, named and placed where we can. Nothing is
  // invented: an airport we cannot name contributes only its code, and a
  // missing coordinate hides the distance rather than guessing one.
  const at = (code?: string | null) =>
    (code && air?.byCode instanceof Map ? air.byCode.get(String(code).toUpperCase()) : undefined);
  const depAp = at(flight.departure);
  const arrAp = at(flight.arrival);
  const names = routeNames(
    { airport: depAp, code: flight.departure },
    { airport: arrAp, code: flight.arrival },
  );
  const distanceNm = greatCircleNm(depAp, arrAp);
  // 0 landings is an answer only when the source recorded landings at all.
  // On an import that had no landings column it is simply unknown.
  const landingsKnown = flight.landingsRecorded === true || landings > 0;
  // Imports wrote a literal "0" into remarks on hundreds of rows. It is not
  // a remark.
  const remarks = String(flight.remarks ?? '').trim();
  const hasRemarks = remarks !== '' && remarks !== '0';
  const date = new Date(`${String(flight.date).slice(0, 10)}T00:00:00Z`)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  // Return trip / Next leg / Duplicate all open the short manual form, filled in.
  const relog = (kind: 'return' | 'next' | 'duplicate') => {
    const base = {
      date: String(flight.date).slice(0, 10),
      aircraftType: flight.aircraftType || flight.displayType || '',
      registration: flight.registration || '',
      picName: flight.picName || '',
      offBlocksTime: '', takeoffTime: '', landingTime: '', onBlocksTime: '',
    };
    const prefill = kind === 'return'
      ? { ...base, departure: flight.arrival, arrival: flight.departure }
      : kind === 'next'
        ? { ...base, departure: flight.arrival, arrival: '' }
        : { ...base, departure: flight.departure, arrival: flight.arrival, flightNumber: flight.flightNumber };
    setPendingFlight(prefill as Any);
    router.push('/logbook/add');
  };

  const remove = () => Alert.alert('Delete flight?', "Remove this flight from your logbook? This can't be undone.", [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: async () => { await api.delete(`/flight-logs/${flight.id}`).catch(() => {}); router.back(); },
    },
  ]);

  const cell = (label: string, value: string) => (
    <View style={styles.cell} key={label}><Text style={styles.cellLabel}>{label}</Text><Text style={styles.cellValue}>{value}</Text></View>
  );
  const kv = (label: string, value: string, note?: string) => (
    <View style={styles.kvCell} key={label}>
      <Text style={styles.kvLabel}>{label}{note ? <Text style={styles.calc}> {note}</Text> : null}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}><Ionicons name="chevron-back" size={22} color={pilot.ink} /></Pressable>
        <Text style={styles.barTitle}>Flight</Text>
        <Pressable onPress={() => { setPendingFlight(flight); router.push(`/logbook/edit/${flight.id}`); }} hitSlop={10} style={{ marginLeft: 'auto' }}>
          <Text style={styles.edit}>Edit</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.pad}>
        {/* Codes and the block time read together: the route on the left, the
            number a pilot came for on the right. */}
        <View style={styles.hero}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.routeRow}>
              <Text style={styles.route}>{flight.departure || '—'}</Text>
              <Ionicons name="arrow-forward" size={20} color={pilot.faint} />
              <Text style={styles.route}>{flight.arrival || '—'}</Text>
            </View>
            {names ? <Text style={styles.names}>{names}</Text> : null}
          </View>
          {block != null ? (
            <View style={styles.blockBox}>
              <Text style={styles.blockValue}>{duration(block / 60, timeFormat)}</Text>
              <Text style={styles.blockLabel}>BLOCK</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.sub}>
          {[date, flight.flightNumber, flight.displayType || flight.aircraftType, flight.registration].filter(Boolean).join(' · ')}
        </Text>

        {/* This sector's own route. Drawn only when both ends can be placed. */}
        {flight.departure && flight.arrival ? (
          <RouteMap
            sectors={[{ from: flight.departure, to: flight.arrival }]}
            height={150}
            label="Route"
            scope="view"
            note={distanceNm != null ? `${distanceNm.toLocaleString()} nm great circle` : undefined}
            pinLabels
          />
        ) : null}

        <View style={styles.card}>
          <View style={styles.grid4}>
            {cell('Out', flight.offBlocksTime || '—')}
            {cell('Off', flight.takeoffTime || '—')}
            {cell('On', flight.landingTime || '—')}
            {cell('In', `${flight.onBlocksTime || '—'}${landsNextDay(flight.offBlocksTime, flight.onBlocksTime) ? ' +1' : ''}`)}
          </View>
          <View style={styles.kv}>
            {kv('Block', minutesToHHMM(block))}
            {kv('Airborne', minutesToHHMM(airborne))}
            {kv('Night', flight.nightTime == null ? '\u2014' : minutesToHHMM(Math.round(flight.nightTime * 60)), flight.nightSource === 'form' ? 'from the form' : 'calc.')}
            {kv(
              role,
              splitMissing ? '\u2014' : minutesToHHMM(Math.round(roleHours * 60)),
              splitMissing ? 'not recorded on this row' : 'auto',
            )}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.kv}>
            {kv('Role', role === 'PIC' ? 'Captain' : 'First Officer')}
            {kv('Duty', flight.pilotFlying === true ? 'Pilot flying' : flight.pilotFlying === false ? 'Monitoring' : '—')}
            {kv('Commander', flight.picName || '—')}
            {kv('Landings', landingsKnown ? `${landings}${flight.landingsNight ? ' night' : ' day'}` : '\u2014')}
            {kv('Approach', flight.approach || '—')}
            {kv('Remarks', hasRemarks ? remarks : '\u2014')}
          </View>
        </View>

        {flight.source === 'SCAN' ? (
          <View style={styles.src}>
            <Ionicons name="scan-outline" size={15} color={pilot.faint} />
            <Text style={styles.srcText}>From your voyage report scan, checked by you</Text>
          </View>
        ) : null}

        <View style={styles.acts}>
          <Pressable style={[styles.btn, styles.btnMain]} onPress={() => relog('return')}>
            <Ionicons name="repeat-outline" size={16} color="#fff" />
            <Text style={styles.btnMainText}>Return trip</Text>
          </Pressable>
          <Pressable style={styles.btn} onPress={() => relog('next')}>
            <Ionicons name="arrow-forward" size={16} color={pilot.navy} />
            <Text style={styles.btnText}>Next leg</Text>
          </Pressable>
        </View>
        <View style={[styles.acts, { marginTop: 10 }]}>
          <Pressable style={styles.btn} onPress={() => relog('duplicate')}><Text style={styles.btnText}>Duplicate</Text></Pressable>
          <Pressable style={styles.btn} onPress={remove}><Text style={[styles.btnText, { color: '#B42318' }]}>Delete</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  pad: { padding: layout.screenX, paddingBottom: 60 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: pilot.line, backgroundColor: pilot.surface },
  back: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  barTitle: { fontSize: 16, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  edit: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: 15 },
  empty: { padding: spacing.xl, color: pilot.muted, fontFamily: fontFamilies.body },

  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  names: { fontSize: 13, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 6 },
  blockBox: { alignItems: 'flex-end' },
  blockValue: { fontFamily: fontFamilies.mono, fontSize: 26, color: pilot.navy },
  blockLabel: { fontFamily: fontFamilies.bodyBold, fontSize: 11, letterSpacing: 0.8, color: pilot.faint, marginTop: 4 },
  route: { fontFamily: fontFamilies.display, fontSize: 28, color: pilot.ink },
  sub: { fontSize: 13, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 4 },

  card: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, overflow: 'hidden', marginTop: 14 },
  grid4: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: pilot.line },
  cell: { flex: 1, paddingVertical: 9, paddingHorizontal: 11, borderLeftWidth: 1, borderLeftColor: pilot.line },
  cellLabel: { fontSize: 10.5, color: pilot.faint, fontFamily: fontFamilies.bodySemiBold, textTransform: 'uppercase', letterSpacing: 0.4 },
  cellValue: { fontSize: 14.5, color: pilot.ink, fontFamily: fontFamilies.body, fontVariant: ['tabular-nums'] },
  kv: { flexDirection: 'row', flexWrap: 'wrap' },
  kvCell: { width: '50%', flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 8, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: '#F0F3F7' },
  kvLabel: { fontSize: 12.5, color: pilot.faint, fontFamily: fontFamilies.body },
  kvValue: { fontSize: 12.5, color: pilot.ink, fontFamily: fontFamilies.bodySemiBold, flexShrink: 1, textAlign: 'right' },
  calc: { fontSize: 10, color: pilot.faint },

  src: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  srcText: { fontSize: 12.5, color: pilot.muted, fontFamily: fontFamilies.body },

  acts: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 10, borderWidth: 1, borderColor: pilot.line, backgroundColor: pilot.surface },
  btnMain: { backgroundColor: pilot.navy, borderColor: pilot.navy },
  btnText: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: pilot.navy },
  btnMainText: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: '#fff' },
});
