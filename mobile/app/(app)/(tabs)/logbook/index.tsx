// Logbook list.
// - Totals grid (from /profile/totals) + CurrencyBadge (separate recent-50 fetch).
// - Flights render as route cards in the app's own editorial style: calendar
//   tile left, display-font airport codes with off/on-block times, block
//   duration over a dashed navy track, and a foot row of pills (flight no,
//   type, registration) + actions (edit / clone / delete).
// - 20 cards per page with ellipsis pagination, ?page= URL state.
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../src/lib/api';
import CurrencyBadge from '../../../../src/components/CurrencyBadge';
import CarryForwardPanel from '../../../../src/components/CarryForwardPanel';
import { setPendingFlight } from '../../../../src/lib/pendingFlight';
import { pageWindow, timeToMinutes } from '../../../../src/lib/logbook';
import { fontFamilies, fontSizes, pilot, spacing } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Log = Record<string, any>;
const PAGE_SIZE = 20;

// Card palette — same layout as the reference screenshot, recoloured to the
// app's editorial-light theme (surface card, navy accents, cream header band).
const makeCard = (pilot: ThemePalette) => ({
  bg: pilot.surface,
  band: 'rgba(0,63,136,0.06)',
  line: pilot.line,
  text: pilot.ink,
  muted: pilot.muted,
  accent: pilot.navy,
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TOTALS_DISPLAY: [string, string][] = [
  ['totalTime', 'Block Hours'], ['picTime', 'PIC Hours'], ['sicTime', 'SIC Hours'],
  ['multiEngineTime', 'Multi-Engine'], ['turbineTime', 'Turbine'], ['instrumentTime', 'Instrument'], ['nightTime', 'Night'],
];

// Block duration as "HH:MMh" from off/on-blocks (midnight-wrap safe), falling
// back to totalTime hours.
function blockHMM(log: Log): string {
  const off = timeToMinutes(log.offBlocksTime);
  const on = timeToMinutes(log.onBlocksTime);
  let mins: number | null = null;
  if (off !== null && on !== null) mins = on >= off ? on - off : 1440 - off + on;
  else if (log.totalTime > 0) mins = Math.round(log.totalTime * 60);
  if (mins === null) return '--:--';
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}h`;
}

function FlightCard({ log, onEdit, onClone, onDelete }: {
  log: Log; onEdit: () => void; onClone: () => void; onDelete: () => void;
}) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const CARD = makeCard(pilot);
  const d = new Date(log.date);
  const valid = !Number.isNaN(d.getTime());
  return (
    <View style={styles.fcard}>
      {/* Main row: calendar tile | route */}
      <View style={styles.fcBody}>
        <View style={styles.dateTile}>
          <Text style={styles.dateMon}>{valid ? MONTHS[d.getMonth()].toUpperCase() : '—'}</Text>
          <Text style={styles.dateDay}>{valid ? d.getDate() : '—'}</Text>
          <Text style={styles.dateYear}>{valid ? d.getFullYear() : ''}</Text>
        </View>
        <View style={styles.leg}>
          <View style={styles.endCol}>
            <Text style={styles.endCode} numberOfLines={1} adjustsFontSizeToFit>{log.departure || '----'}</Text>
            <Text style={styles.endTime}>{log.offBlocksTime || '--:--'}</Text>
          </View>
          <View style={styles.midCol}>
            <Text style={styles.durText}>{blockHMM(log)}</Text>
            <View style={styles.track}>
              <View style={styles.trackDash} />
              <Ionicons name="airplane" size={14} color={CARD.accent} style={{ marginHorizontal: 4 }} />
              <View style={styles.trackDash} />
            </View>
          </View>
          <View style={styles.endCol}>
            <Text style={styles.endCode} numberOfLines={1} adjustsFontSizeToFit>{log.arrival || '----'}</Text>
            <Text style={styles.endTime}>{log.onBlocksTime || '--:--'}</Text>
          </View>
        </View>
      </View>

      {/* Foot: flight pills left, actions right */}
      <View style={styles.fcFoot}>
        <View style={styles.fcPills}>
          {log.flightNumber ? <Text style={styles.pillNavy}>{log.flightNumber}</Text> : null}
          {log.aircraftType ? <Text style={styles.pillPlain}>{log.aircraftType}</Text> : null}
          {log.registration ? <Text style={styles.pillPlain}>{log.registration}</Text> : null}
        </View>
        <View style={styles.fcActions}>
          <Pressable accessibilityLabel="Edit flight" onPress={onEdit} hitSlop={6} style={styles.fcActBtn}><Ionicons name="pencil" size={15} color={CARD.accent} /></Pressable>
          <Pressable accessibilityLabel="Clone flight" onPress={onClone} hitSlop={6} style={styles.fcActBtn}><Ionicons name="copy-outline" size={15} color={CARD.muted} /></Pressable>
          <Pressable accessibilityLabel="Delete flight" onPress={onDelete} hitSlop={6} style={styles.fcActBtn}><Ionicons name="trash-outline" size={15} color="#991B1B" /></Pressable>
        </View>
      </View>
    </View>
  );
}

export default function LogbookList() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ page?: string }>();
  const [page, setPage] = useState(Math.max(1, Number(params.page) || 1));
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<Log | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currencySignal, setCurrencySignal] = useState(0);

  const loadPage = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const { data } = await api.get('/flight-logs', { params: { page: p, limit: PAGE_SIZE } });
      setLogs(data.logs || []);
      setTotal(data.total ?? 0);
      setError(null);
    } catch (err) {
      // Surface the failure instead of silently rendering "0 flights" (which is
      // indistinguishable from an empty account). e.g. a 401 or network error.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((err as any)?.response?.data?.error || (err as any)?.message || 'Failed to load flights');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPage(page); }, [page, loadPage]);
  useEffect(() => { api.get('/profile/totals').then(({ data }) => setTotals(data)).catch(() => {}); }, []);
  // Refetch when returning from add/import.
  useFocusEffect(useCallback(() => {
    loadPage(page);
    api.get('/profile/totals').then(({ data }) => setTotals(data)).catch(() => {});
    setCurrencySignal((s) => s + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = (p: number) => {
    const clamped = Math.min(Math.max(1, p), totalPages);
    setPage(clamped);
    router.setParams(clamped === 1 ? { page: undefined } : { page: String(clamped) });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPage(page);
    api.get('/profile/totals').then(({ data }) => setTotals(data)).catch(() => {});
    setCurrencySignal((s) => s + 1);
    setRefreshing(false);
  }, [page, loadPage]);

  // Edit / Clone → stash the log in the module holder (no GET /flight-logs/:id),
  // then navigate. Edit prefills as-is (→ PATCH); clone clears the date (→ POST).
  const editFlight = (log: Log) => { setPendingFlight(log); router.push(`/logbook/edit/${log.id}`); };
  const cloneFlight = (log: Log) => { setPendingFlight(log); router.push(`/logbook/clone/${log.id}`); };

  // Card delete → confirm → DELETE /flight-logs/:id → reload page + refetch currency + totals.
  const deleteFlight = (id: string) => Alert.alert(
    'Delete flight?',
    "Remove this flight from your logbook? This can't be undone.",
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/flight-logs/${id}`);
            await loadPage(page);
            api.get('/profile/totals').then(({ data }) => setTotals(data)).catch(() => {});
            setCurrencySignal((s) => s + 1);
          } catch { /* ignore */ }
        },
      },
    ],
  );

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pilot.navy} />}
      >
        <Text style={styles.h1}>Logbook</Text>
        <Text style={styles.subtitle}>Hours flown, sectors logged, currency tracked.</Text>

        {/* Totals */}
        <View style={styles.totalsGrid}>
          {TOTALS_DISPLAY.map(([key, label]) => (
            <View key={key} style={styles.totalCard}>
              <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{(Number(totals?.[key]) || 0).toFixed(1)}</Text>
              <Text style={styles.totalLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Carry-forward hours (starting balances; folded into /profile/totals) */}
        <CarryForwardPanel onSaved={() => {
          api.get('/profile/totals').then(({ data }) => setTotals(data)).catch(() => {});
          setCurrencySignal((s) => s + 1);
        }} />

        {/* Currency */}
        <CurrencyBadge refreshSignal={currencySignal} />

        {/* Toolbar */}
        <View style={styles.toolbar}>
          <Pressable style={({ pressed }) => [styles.primaryBtn, pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 }]} onPress={() => router.push('/logbook/add')}>
            <Text style={styles.primaryBtnText}>+ Log a Flight</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.push('/logbook/import')}>
            <Ionicons name="cloud-upload-outline" size={15} color={pilot.navy} />
            <Text style={styles.secondaryBtnText}> Import</Text>
          </Pressable>
          <Text style={styles.count}>{total} {total === 1 ? 'flight' : 'flights'}</Text>
        </View>

        {/* Flight cards */}
        {error && !loading ? (
          <Text style={styles.empty}>Could not load your logbook.{'\n'}{error}{'\n'}Pull to refresh to try again.</Text>
        ) : logs.length === 0 && !loading ? (
          <Text style={styles.empty}>No flights logged yet. Tap "Log a Flight" to get started.</Text>
        ) : (
          logs.map((log) => (
            <FlightCard
              key={log.id}
              log={log}
              onEdit={() => editFlight(log)}
              onClone={() => cloneFlight(log)}
              onDelete={() => deleteFlight(log.id)}
            />
          ))
        )}

        {/* Pagination */}
        {totalPages > 1 ? (
          <View style={styles.pagination}>
            <Text style={styles.pageCounter}>Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + logs.length} of {total} flights</Text>
            <View style={styles.pageBtns}>
              <PageBtn label="‹" disabled={page <= 1} onPress={() => goToPage(page - 1)} />
              {pageWindow(page, totalPages).map((p, i) => p === '…'
                ? <Text key={`e${i}`} style={styles.ellipsis}>…</Text>
                : <PageBtn key={p} label={String(p)} active={p === page} onPress={() => goToPage(p)} />)}
              <PageBtn label="›" disabled={page >= totalPages} onPress={() => goToPage(page + 1)} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PageBtn({ label, active, disabled, onPress }: { label: string; active?: boolean; disabled?: boolean; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={[styles.pageBtn, active && styles.pageBtnActive, disabled && styles.pageBtnDisabled]}>
      <Text style={[styles.pageBtnText, active && styles.pageBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (pilot: ThemePalette) => { const CARD = makeCard(pilot); return StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  content: { padding: spacing.xl, paddingBottom: 116 /* clears floating tab bar */ },
  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes['3xl'], color: pilot.ink, marginBottom: 4 },
  subtitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, marginBottom: 20 },

  totalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  totalCard: { width: '31%', backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center' },
  totalValue: { fontFamily: fontFamilies.mono, fontSize: 18, color: pilot.navy, fontWeight: '800' },
  totalLabel: { fontSize: 9.5, fontFamily: fontFamilies.bodySemiBold, color: pilot.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 5, textAlign: 'center' },

  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
  primaryBtn: { backgroundColor: pilot.navy, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 16 },
  primaryBtnText: { color: '#fff', fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: pilot.navy, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 14 },
  secondaryBtnText: { color: pilot.navy, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },
  count: { marginLeft: 'auto', color: pilot.muted, fontSize: fontSizes.sm, fontFamily: fontFamilies.body },

  empty: { color: pilot.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.base, textAlign: 'center', paddingVertical: 48, lineHeight: 22 },

  // ── Flight card (same info as the reference, styled to the app's editorial
  //    language: calendar tile, display-font codes, dashed navy track, pills) ──
  fcard: { backgroundColor: CARD.bg, borderWidth: 1, borderColor: CARD.line, borderRadius: 16, marginBottom: 14, padding: 14 },
  fcBody: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dateTile: {
    width: 62, alignItems: 'center', paddingVertical: 8, borderRadius: 10,
    backgroundColor: pilot.cream, borderWidth: 1, borderColor: CARD.line,
  },
  dateMon: { color: CARD.accent, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.5 },
  dateDay: { color: CARD.text, fontFamily: fontFamilies.display, fontSize: 26, lineHeight: 30, marginVertical: 1 },
  dateYear: { color: CARD.muted, fontFamily: fontFamilies.body, fontSize: 11 },

  leg: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  endCol: { alignItems: 'center', minWidth: 60 },
  endCode: { color: CARD.text, fontFamily: fontFamilies.display, fontSize: 23, letterSpacing: 0.5 },
  endTime: { color: CARD.muted, fontFamily: fontFamilies.mono, fontSize: 13, marginTop: 3 },
  midCol: { alignItems: 'center', flex: 1, paddingHorizontal: 6 },
  durText: { color: CARD.accent, fontFamily: fontFamilies.mono, fontSize: 16, fontWeight: '700', marginBottom: 5 },
  track: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  trackDash: { flex: 1, height: 0, borderBottomWidth: 1.5, borderColor: CARD.accent, borderStyle: 'dashed', opacity: 0.55 },

  fcFoot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: CARD.line, marginTop: 12, paddingTop: 10, gap: 8,
  },
  fcPills: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  pillNavy: {
    fontSize: 11, fontFamily: fontFamilies.bodyBold, color: CARD.accent, backgroundColor: 'rgba(0,63,136,0.08)',
    borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden', letterSpacing: 0.5,
  },
  pillPlain: {
    fontSize: 11, fontFamily: fontFamilies.bodyMedium, color: CARD.muted, backgroundColor: pilot.cream,
    borderWidth: 1, borderColor: CARD.line, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3,
    overflow: 'hidden', letterSpacing: 0.5,
  },
  fcActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  fcActBtn: { padding: 6 },

  pagination: { marginTop: 20, alignItems: 'center', gap: 10 },
  pageCounter: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body },
  pageBtns: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  pageBtn: { minWidth: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: pilot.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, backgroundColor: pilot.surface },
  pageBtnActive: { backgroundColor: pilot.navy, borderColor: pilot.navy },
  pageBtnDisabled: { opacity: 0.45 },
  pageBtnText: { fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm, color: pilot.ink },
  pageBtnTextActive: { color: '#fff', fontFamily: fontFamilies.bodyBold },
  ellipsis: { color: pilot.muted, paddingHorizontal: 4 },
}); };
