// Logbook list.
// - Totals grid (from /profile/totals) + CurrencyBadge (separate recent-50 fetch).
// - Flights render as route cards in the app's own editorial style: calendar
//   tile left, display-font airport codes with off/on-block times, block
//   duration over a dashed navy track, and a foot row of pills (flight no,
//   type, registration) + actions (edit / clone / delete).
// - 20 cards per page with ellipsis pagination, ?page= URL state.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../src/lib/api';
import CarryForwardPanel from '../../../../src/components/CarryForwardPanel';
import LogbookDashboard from '../../../../src/components/logbook/LogbookDashboard';
import { setPendingFlight } from '../../../../src/lib/pendingFlight';
import { pageWindow, timeToMinutes } from '../../../../src/lib/logbook';
import { duration, findOverlaps, groupBy, Grouping, overlapLabel, overnightReturnOf, recencyLine, TimeFormat } from '../../../../src/lib/logbookFormat';
import AddFlightSheet from '../../../../src/components/logbook/AddFlightSheet';
import { setPendingFlight as stashFlight } from '../../../../src/lib/pendingFlight';
import { fontFamilies, fontSizes, pilot, spacing } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';
import { useTabBarClearance } from '../../../../src/theme/tabBar';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { useLogbook } from '../../../../src/hooks/queries';
import { LogbookSkeleton } from '../../../../src/components/Skeleton';
import { notifySuccess, tapLight } from '../../../../src/lib/haptics';
import PressableScale from '../../../../src/components/PressableScale';
import Segmented from '../../../../src/components/Segmented';
import FlightRow from '../../../../src/components/logbook/FlightRow';
import { withErrorBoundary } from '../../../../src/components/ErrorBoundary';

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
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS_FULL[+m - 1]} ${y}`; };

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

function LogbookList() {
  // The + floats above the tab bar, so the list must clear both.
  const tabBarClearance = useTabBarClearance(72);
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ page?: string }>();
  const [page, setPage] = useState(Math.max(1, Number(params.page) || 1));
  const [cfOpenSignal, setCfOpenSignal] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  // Month is the default: "how much did I fly in October" is the everyday
  // question; a day group is usually one or two sectors.
  // Month unless this pilot has chosen Day; the choice is stored in logbook
  // prefs, so web and app agree and it survives a reinstall.
  const [groupingOverride, setGroupingOverride] = useState<Grouping | null>(null);
  const qc = useQueryClient();

  // ONE call for prefs + scan quota + totals + this page (GET /logbook/bootstrap),
  // served from the on-device cache first. The four separate fetches this
  // replaced each cost a round trip, and the page one re-ran on every focus
  // with a spinner over data we already had.
  const { data, isPending, isFetching, refetch, error: queryError } = useLogbook(page);
  const logs: Log[] = useMemo(() => data?.flights?.logs ?? [], [data]);
  const total: number = data?.flights?.total ?? 0;
  const summary = data?.summary ?? null;
  const scansLeft: number | null = data?.scanQuota?.left ?? null;
  const scanEnabled = !!data?.scanQuota?.enabled;
  const error = queryError ? ((queryError as Log)?.response?.data?.error || (queryError as Log)?.message || 'Failed to load flights') : null;
  const loading = isPending;
  const [refreshing, setRefreshing] = useState(false);

  // How durations are written is a profile preference, shared with the web.
  // Applied locally at once, then written; the bundle carries the stored value.
  const [timeFormatOverride, setTimeFormatOverride] = useState<TimeFormat | null>(null);
  const timeFormat: TimeFormat = timeFormatOverride ?? (data?.prefs?.timeFormat as TimeFormat) ?? 'hhmm';
  const grouping: Grouping = groupingOverride ?? (data?.prefs?.grouping as Grouping) ?? 'month';
  const setGrouping = (g: Grouping) => {
    if (g === grouping) return;
    tapLight();
    setGroupingOverride(g);
    api.put('/logbook/prefs', { grouping: g })
      .then(() => qc.invalidateQueries({ queryKey: ['logbook'] }))
      .catch(() => {});
  };
  const setTimeFormat = (fmt: TimeFormat) => {
    if (fmt === timeFormat) return;
    tapLight();
    setTimeFormatOverride(fmt);
    api.put('/logbook/prefs', { timeFormat: fmt })
      .then(() => qc.invalidateQueries({ queryKey: ['logbook'] }))
      .catch(() => {});
  };

  // Returning from add / import / a scan: refresh behind the list. The cached
  // page stays on screen while it runs — no spinner over data we already have.
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const lastFlightStr = summary?.totals?.lastFlightDate
    ? new Date(summary.totals.lastFlightDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const goToPage = (p: number) => {
    const clamped = Math.min(Math.max(1, p), totalPages);
    setPage(clamped);
    router.setParams(clamped === 1 ? { page: undefined } : { page: String(clamped) });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    tapLight();
    await refetch();
    setRefreshing(false);
  }, [refetch]);

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
            notifySuccess();
            await refetch();
          } catch { /* ignore */ }
        },
      },
    ],
  );

  // Group the current page's flights into month sections. Subtotals come from
  // summary.months (server truth), never from summing the loaded rows — the list
  // is paginated, so a month can be split across pages.
  const sections = useMemo(() => {
    const idx: Record<string, Log> = {};
    (summary?.months || []).forEach((m: Log) => { idx[m.month] = m; });
    const out: { ym: string; title: string; hours: number | null; flights: number | null; data: Log[] }[] = [];
    let cur: (typeof out)[number] | null = null;
    for (const log of logs) {
      const d = new Date(log.date);
      const ym = Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 7);
      if (!cur || cur.ym !== ym) {
        const m: Log | undefined = idx[ym];
        cur = { ym, title: monthLabel(ym), hours: m ? m.hours : null, flights: m ? m.flights : null, data: [] };
        out.push(cur);
      }
      cur.data.push(log);
    }
    return out;
  }, [logs, summary]);

  const cur = summary?.currency?.day;
  // Two flights cannot be in the air at once; where they are, both say so.
  const overlaps = useMemo(() => findOverlaps(logs), [logs]);

  const daySections = useMemo(
    () => groupBy(logs, grouping).map((d) => ({ ym: d.date, title: d.label, hours: d.hours, data: d.flights })),
    [logs, grouping],
  );

  const ListHeader = (
    <View>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Logbook</Text>
          <Text style={styles.subtitle}>
            {(summary?.totals?.flightCount ?? total)} flights{lastFlightStr ? ` · last ${lastFlightStr}` : ''}
          </Text>
        </View>
        <View style={{ gap: 6, alignItems: 'flex-end' }}>
          <Segmented
            compact
            style={{ minWidth: 148 }}
            value={timeFormat}
            onChange={(f) => setTimeFormat(f as TimeFormat)}
            options={[{ value: 'hhmm', label: 'hh:mm' }, { value: 'decimal', label: 'decimal' }]}
          />
          <Segmented
            compact
            style={{ minWidth: 148 }}
            value={grouping}
            onChange={(g) => setGrouping(g as Grouping)}
            options={[{ value: 'month', label: 'Month' }, { value: 'day', label: 'Day' }]}
          />
        </View>
      </View>

      {/* Totals, then landings in the last 90 days and the day currency lapses */}
      {summary ? (
        <>
          <View style={styles.tot}>
            <View style={styles.totCard}>
              <Text style={styles.totNum}>{duration(summary.totals.total, timeFormat)}</Text>
              <Text style={styles.totLabel}>Total</Text>
            </View>
            <View style={styles.totCard}>
              <Text style={styles.totNum}>{duration(Math.max(summary.totals.pic, summary.totals.sic), timeFormat)}</Text>
              <Text style={styles.totLabel}>{summary.totals.pic > summary.totals.sic ? 'PIC' : 'SIC'}</Text>
            </View>
            <View style={styles.totCard}>
              <Text style={styles.totNum}>{duration(summary.totals.night, timeFormat)}</Text>
              <Text style={styles.totLabel}>Night</Text>
            </View>
          </View>
          {summary.currency && (summary.currency.landingsLogged || summary.currency.flightsInWindow > 0) ? (() => {
            const r = recencyLine(summary.currency);
            if (!r) return null;
            return (
              <View style={styles.rec}>
                <View style={[styles.dot, r.tone === 'short' && styles.dotWarn, r.tone === 'unknown' && styles.dotGrey]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.recText}><Text style={styles.recStrong}>{r.text}</Text></Text>
                  {r.note ? <Text style={styles.recNote}>{r.note}</Text> : null}
                </View>
              </View>
            );
          })() : null}
        </>
      ) : null}

      {/* Hours dashboard (real data from /logbook/summary) */}
      <LogbookDashboard summary={summary} onEditCarryForward={() => setCfOpenSignal((s) => s + 1)} timeFormat={timeFormat} />

      {/* Carry-forward editor — opened by the dashboard's "Edit" link */}
      <CarryForwardPanel openSignal={cfOpenSignal} onSaved={() => { void refetch(); }} />
    </View>
  );

  const ListFooter = totalPages > 1 ? (
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
  ) : null;

  const ListEmpty = (error && !loading)
    ? <Text style={styles.empty}>Could not load your logbook.{'\n'}{error}{'\n'}Pull to refresh to try again.</Text>
    : (!loading ? <Text style={styles.empty}>No flights logged yet. Tap "Log a Flight" to get started.</Text> : null);

  // FlashList takes ONE flat array, so the day headers travel in the list with
  // the sectors they head. Same shape on screen as the SectionList it replaces,
  // but only the visible rows are mounted — a 500-flight logbook scrolls at the
  // same cost as a 20-flight one.
  type Row = { kind: 'day'; key: string; title: string; hours: number; count: number }
           | { kind: 'leg'; key: string; log: Log; first: boolean; last: boolean };
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const d of daySections) {
      out.push({ kind: 'day', key: `d:${d.ym}`, title: d.title, hours: d.hours, count: d.data.length });
      d.data.forEach((log: Log, i: number) => {
        out.push({ kind: 'leg', key: log.id, log, first: i === 0, last: i === d.data.length - 1 });
      });
    }
    return out;
  }, [daySections]);

  // Nothing cached yet: a skeleton shaped like the logbook, not a spinner.
  if (loading && !data) {
    return <SafeAreaView style={styles.safe} edges={[]}><LogbookSkeleton /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <FlashList
        data={rows}
        keyExtractor={(r) => r.key}
        getItemType={(r) => r.kind}
        contentContainerStyle={{ paddingBottom: tabBarClearance, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pilot.navy} />}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={ListEmpty}
        renderItem={({ item }) => {
          if (item.kind === 'day') {
            return (
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{item.title}</Text>
                <Text style={styles.dayHours}>
                  {duration(item.hours, timeFormat)}
                  <Text style={styles.dayCount}>  ·  {item.count} {item.count === 1 ? 'flight' : 'flights'}</Text>
                </Text>
              </View>
            );
          }
          const log = item.log;
          return (
            <FlightRow
              log={log}
              timeFormat={timeFormat}
              overnightFrom={overnightReturnOf(log, logs)}
              overlap={overlaps.has(log.id) ? overlapLabel(overlaps.get(log.id)) : null}
              showDate={grouping === 'month'}
              onPress={() => { stashFlight(log); router.push(`/logbook/flight/${log.id}`); }}
            />
          );
        }}
      />
      <Pressable style={styles.fab} onPress={() => setAddOpen(true)} accessibilityLabel="Add a flight">
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>

      <AddFlightSheet
        visible={addOpen}
        scanEnabled={scanEnabled}
        scansLeft={scansLeft}
        onClose={() => setAddOpen(false)}
        onScan={() => router.push('/logbook/scan')}
        onManual={() => router.push('/logbook/add')}
        onImport={() => router.push('/logbook/import')}
      />
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
  // ── The rebuilt list (mockup): header, totals, recency, day groups, FAB ──
  headRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  seg: { flexDirection: 'row', borderWidth: 1, borderColor: pilot.line, borderRadius: 8, overflow: 'hidden', backgroundColor: pilot.surface },
  segBtn: { paddingHorizontal: 9, paddingVertical: 5 },
  segOn: { backgroundColor: '#0B1F3A' },
  segText: { fontSize: 12, fontFamily: fontFamilies.bodySemiBold, color: pilot.muted },
  segTextOn: { color: '#fff' },
  tot: { flexDirection: 'row', gap: 8, marginTop: 14 },
  totCard: { flex: 1, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  totNum: { fontFamily: fontFamilies.display, fontSize: 20, color: pilot.ink },
  totLabel: { fontSize: 11.5, color: pilot.faint, fontFamily: fontFamilies.body, marginTop: 2 },
  rec: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, marginTop: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#15803D' },
  dotWarn: { backgroundColor: '#B45309' },
  dotGrey: { backgroundColor: pilot.faint },
  recText: { flex: 1, fontSize: 13, color: pilot.ink, fontFamily: fontFamilies.body },
  recStrong: { fontFamily: fontFamilies.bodySemiBold },
  // Why the night leg does or doesn't apply — stated, never implied.
  recNote: { marginTop: 2, fontSize: 12, lineHeight: 16, color: pilot.muted, fontFamily: fontFamilies.body },
  recDrop: { fontSize: 12, color: pilot.faint, fontFamily: fontFamilies.body },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, marginBottom: 6 },
  dayLabel: { fontSize: 11.5, fontFamily: fontFamilies.bodyBold, letterSpacing: 0.9, textTransform: 'uppercase', color: pilot.faint },
  dayCount: { fontFamily: fontFamilies.body, color: pilot.faint },
  dayHours: { fontSize: 12.5, fontFamily: fontFamilies.body, color: pilot.faint, fontVariant: ['tabular-nums'] },
  dayLeg: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pilot.surface, borderColor: pilot.line, borderWidth: 1, borderTopWidth: 0, paddingVertical: 12, paddingHorizontal: 14 },
  legFirst: { borderTopWidth: 1, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  legLast: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  legTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legRoute: { fontSize: 14, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  legSub: { fontSize: 12, color: pilot.faint, fontFamily: fontFamilies.body, marginTop: 2 },
  legLink: { fontSize: 11.5, color: pilot.faint, fontFamily: fontFamilies.body, marginTop: 3 },
  legOverlap: { fontSize: 11.5, color: '#B42318', fontFamily: fontFamilies.bodySemiBold, marginTop: 3 },
  plus1: { fontSize: 10.5, fontFamily: fontFamilies.bodyBold, color: pilot.muted, backgroundColor: '#EEF1F5', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, overflow: 'hidden' },
  legHours: { fontSize: 14, fontFamily: fontFamilies.body, color: pilot.ink, fontVariant: ['tabular-nums'] },
  pf: { fontSize: 10.5, fontFamily: fontFamilies.bodyBold, color: pilot.navy, backgroundColor: '#E3ECF8', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  fab: { position: 'absolute', right: 20, bottom: 104, width: 58, height: 58, borderRadius: 29, backgroundColor: pilot.navy, alignItems: 'center', justifyContent: 'center', shadowColor: '#003F88', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },

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

  // Month section header — name left, "{hours} h · {n} flights" right, small
  // uppercase muted (scrolls with the list; stickySectionHeadersEnabled=false).
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 8, paddingBottom: 8, paddingHorizontal: 4 },
  sectionMonth: { fontFamily: fontFamilies.bodyBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: pilot.muted },
  sectionMeta: { fontFamily: fontFamilies.body, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: pilot.muted },

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

// A render error here shows "Something went wrong · Try again" instead of
// taking the whole app down with it.
export default withErrorBoundary(LogbookList, 'Logbook');
