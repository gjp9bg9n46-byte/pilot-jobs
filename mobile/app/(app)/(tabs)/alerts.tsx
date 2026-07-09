// Alerts — pilot-facing job-match feed. Two tabs: Matches (job-match alerts)
// and Saved (bookmarked jobs). Saved Searches + Applications were removed from
// this screen by request (applications remain at /profile/applications).
//
// Endpoints:
//   Matches   GET   /jobs/alerts?filter&sort            → { alerts, total, pages }
//             POST  /jobs/alerts/run-match              (triggered once on mount)
//             PATCH /jobs/alerts/:id/read               (tap a card)
//             PATCH /jobs/alerts/read-all               (Mark all read)
//             POST/DELETE /jobs/:id/save                (save toggle)
//   Saved     GET   /jobs/saved                         → [job, …] with isSaved/isApplied
//
// Card tap navigates to the job detail page — inline expansion remains only as
// a fallback for alerts whose job record is gone.
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import AirlineLogo from '../../../src/components/AirlineLogo';
import { SelectField } from '../../../src/components/ui';
import { fetchAirlineMap, resolveAirline } from '../../../src/lib/airlineLookup';
import { matchStyle, postedAgo } from '../../../src/lib/jobMatch';
import { useUnread } from '../../../src/context/UnreadContext';
import { fontFamilies, fontSizes, pilot, spacing } from '../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../src/theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };

const ROLE_LABELS: Record<string, string> = { CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', FLIGHT_ENGINEER: 'Flight Engineer', INSTRUCTOR: 'Instructor' };
const CT_LABELS: Record<string, string> = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', acmi: 'ACMI', permanent: 'Permanent' };

function slugify(s: string) { return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function slugFor(j: Any) { return `${slugify(j.company)}-${slugify(j.role || j.title)}-${j.id}`; }

function pillColor(key: string, pilot: ThemePalette, structured?: Any): { color: string; bg: string } {
  const s = structured?.[key];
  if (s === 'matched') return { color: SEM.green, bg: '#DCFCE7' };
  if (s === 'missing') return { color: SEM.red, bg: '#FEE2E2' };
  if (s === 'marginal') return { color: SEM.amber, bg: '#FEF3C7' };
  return { color: pilot.muted, bg: pilot.cream };
}

// Requirement pills built from the alert's job + structured breakdown.
// Fixed, organised order (no more random colour jumble):
//   1. Job info first — role, contract type, salary (neutral/navy pills).
//   2. Requirements grouped by status — matched (green) → marginal (amber) →
//      missing (red) → unspecified (grey) — with a stable category order inside
//      each group: aircraft, certificates, total hrs, PIC, multi-eng, turbine,
//      medical. Takes the active palette so pills follow the theme.
function buildPills(job: Any, pilot: ThemePalette, structured?: Any): { key: string; text: string; color: string; bg: string }[] {
  if (!job) return [];
  const info: { key: string; text: string; color: string; bg: string }[] = [];
  if (job.role) info.push({ key: 'role', text: ROLE_LABELS[job.role] || job.role, color: pilot.navy, bg: 'rgba(0,63,136,0.08)' });
  if (job.contractType) info.push({ key: 'ct', text: CT_LABELS[job.contractType] || job.contractType, color: pilot.muted, bg: pilot.cream });
  if (job.salaryMin && job.salaryMax) info.push({ key: 'sal', text: `${job.salaryCurrency || 'USD'} ${job.salaryMin.toLocaleString()}–${job.salaryMax.toLocaleString()}`, color: SEM.green, bg: '#DCFCE7' });
  else if (job.salaryMin) info.push({ key: 'sal', text: `${job.salaryCurrency || 'USD'} ${job.salaryMin.toLocaleString()}+`, color: SEM.green, bg: '#DCFCE7' });

  const STATUS_RANK: Record<string, number> = { matched: 0, marginal: 1, missing: 2 };
  const rankOf = (key: string) => STATUS_RANK[structured?.[key] as string] ?? 3;
  const reqs: { key: string; text: string; color: string; bg: string; rank: number }[] = [];
  (job.reqAircraftTypes || []).forEach((a: string) => reqs.push({ key: `ac-${a}`, text: a, rank: rankOf('aircraftType'), ...pillColor('aircraftType', pilot, structured) }));
  (job.reqCertificates || []).forEach((c: string) => reqs.push({ key: `cert-${c}`, text: c, rank: rankOf('certificate'), ...pillColor('certificate', pilot, structured) }));
  if (job.reqMinTotalHours) reqs.push({ key: 'th', text: `${job.reqMinTotalHours.toLocaleString()} hrs total`, rank: rankOf('totalHours'), ...pillColor('totalHours', pilot, structured) });
  if (job.reqMinPicHours) reqs.push({ key: 'pic', text: `${job.reqMinPicHours.toLocaleString()} PIC`, rank: rankOf('picHours'), ...pillColor('picHours', pilot, structured) });
  if (job.reqMinMultiEngineHours) reqs.push({ key: 'me', text: `${job.reqMinMultiEngineHours.toLocaleString()} multi-eng`, rank: rankOf('multiEngineHours'), ...pillColor('multiEngineHours', pilot, structured) });
  if (job.reqMinTurbineHours) reqs.push({ key: 'turb', text: `${job.reqMinTurbineHours.toLocaleString()} turbine`, rank: rankOf('turbineHours'), ...pillColor('turbineHours', pilot, structured) });
  if (job.reqMedicalClass) reqs.push({ key: 'med', text: String(job.reqMedicalClass).replace('CLASS_', 'Class '), rank: rankOf('medical'), ...pillColor('medical', pilot, structured) });
  reqs.sort((a, b) => a.rank - b.rank); // stable → category order preserved within each status group

  return [...info, ...reqs];
}

function MatchBadge({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' }) {
  const m = matchStyle(score);
  return (
    <View style={{ alignItems: 'flex-end', minWidth: 62 }}>
      <Text style={{ fontFamily: fontFamilies.mono, fontSize: size === 'lg' ? 30 : 22, fontWeight: '700', color: m.color, lineHeight: size === 'lg' ? 32 : 24 }}>
        {Math.min(Math.round(score), 100)}%
      </Text>
      <Text style={{ fontSize: 9.5, fontWeight: '700', color: m.color, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2, textAlign: 'right' }}>{m.label}</Text>
    </View>
  );
}

function MatchBreakdown({ breakdown }: { breakdown?: Any }) {
  const pilot = useThemeColors();
  if (!breakdown) return null;
  const cols = [
    { label: 'MATCHED', items: breakdown.matched ?? [], color: SEM.green, bg: '#F0FDF4', icon: '✓' },
    { label: 'MARGINAL', items: breakdown.marginal ?? [], color: SEM.amber, bg: '#FFFBEB', icon: '~' },
    { label: 'MISSING', items: breakdown.missing ?? [], color: SEM.red, bg: '#FEF2F2', icon: '✗' },
  ];
  return (
    <View style={{ gap: 8, marginBottom: 12 }}>
      {cols.map((c) => (
        <View key={c.label} style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, padding: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: c.color, letterSpacing: 1, marginBottom: 6 }}>{c.icon} {c.label}</Text>
          {c.items.length === 0
            ? <Text style={{ fontSize: 12, color: pilot.muted }}>—</Text>
            : c.items.map((it: string) => <Text key={it} style={{ fontSize: 12, color: pilot.ink, marginBottom: 3 }}>{it}</Text>)}
        </View>
      ))}
    </View>
  );
}

// ─── Match card ───────────────────────────────────────────────────────────────

function AlertCard({ alert, expanded, saved, air, onPress, onToggleSave, onViewJob }: {
  alert: Any; expanded: boolean; saved: boolean; air: Any | null;
  onPress: () => void; onToggleSave: () => void; onViewJob: () => void;
}) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const job = alert.job;
  const isUnread = !alert.readAt;
  const structured = alert.breakdown?.structured;
  const pills = buildPills(job, pilot, structured);
  const location = job?.location ?? alert.location;

  return (
    <View style={{ marginBottom: 14 }}>
      <Pressable
        onPress={onPress}
        style={[styles.card, isUnread && styles.cardUnread, expanded && styles.cardOpen]}
      >
        <AirlineLogo logoUrl={air?.logoUrl} iataCode={air?.iataCode} name={job?.company ?? alert.company} box={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {isUnread ? <Text style={styles.unreadDot}>● </Text> : null}
            {job?.title ?? alert.jobTitle ?? '—'}
          </Text>
          <Text style={styles.cardCompany}>{job?.company ?? alert.company ?? '—'}</Text>
          <View style={styles.metaRow}>
            {location ? <Text style={styles.meta}><Ionicons name="location-outline" size={11} color={pilot.muted} /> {location}</Text> : null}
            {job?.reqAuthorities?.[0] ? <Text style={styles.meta}>{job.reqAuthorities[0]}</Text> : null}
          </View>
          {pills.length > 0 ? (
            <View style={styles.pillWrap}>
              {pills.map((p) => (
                <Text key={p.key} style={[styles.pill, { color: p.color, backgroundColor: p.bg }]}>{p.text}</Text>
              ))}
            </View>
          ) : null}
        </View>
        <View style={styles.cardRight}>
          <Pressable onPress={onToggleSave} hitSlop={8} style={styles.saveBtn} accessibilityLabel={saved ? 'Unsave job' : 'Save job'}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={22} color={saved ? pilot.navy : pilot.muted} />
          </Pressable>
          <MatchBadge score={alert.matchScore} />
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.expand}>
          <MatchBreakdown breakdown={alert.breakdown} />
          {job?.description ? (
            <Text style={styles.desc}>{String(job.description).slice(0, 320)}{String(job.description).length > 320 ? '…' : ''}</Text>
          ) : null}
          <View style={styles.expandActions}>
            <Pressable style={styles.viewJobBtn} onPress={onViewJob}>
              <Text style={styles.viewJobText}>View full job →</Text>
            </Pressable>
            {job?.applyUrl ? (
              <Pressable style={styles.applyBtn} onPress={() => Linking.openURL(job.applyUrl)}>
                <Text style={styles.applyText}>Apply ↗</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ─── Matches tab ──────────────────────────────────────────────────────────────

// No 'saved' chip — saved jobs have their own tab at the top of the screen.
const CHIPS: [string, string][] = [['all', 'All'], ['unread', 'Unread'], ['dismissed', 'Dismissed'], ['noreq', 'No requirements']];
const SORTS: [string, string][] = [['newest', 'Newest'], ['score', 'Best Match'], ['deadline', 'Deadline']];

function MatchesTab({ header }: { header?: ReactNode }) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { setUnread, refresh } = useUnread();
  const [alerts, setAlerts] = useState<Any[]>([]);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});
  const [markingAll, setMarkingAll] = useState(false);
  const [airlineMap, setAirlineMap] = useState<Awaited<ReturnType<typeof fetchAirlineMap>> | null>(null);
  const didTrigger = useRef(false);

  useEffect(() => { fetchAirlineMap().then(setAirlineMap).catch(() => {}); }, []);

  const load = useCallback(async (f: string, s: string) => {
    setLoading(true); setError(null);
    try {
      const { data } = await api.get('/jobs/alerts', { params: { filter: f, sort: s, limit: 200 } });
      setAlerts(data.alerts ?? []);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((err as any)?.response?.data?.error || (err as any)?.message || 'Failed to load alerts');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!didTrigger.current) {
      didTrigger.current = true;
      api.post('/jobs/alerts/run-match').catch(() => {}).finally(() => { load(filter, sort).then(refresh); });
    } else {
      load(filter, sort);
    }
  }, [filter, sort, load, refresh]);

  // Silent reload on every focus — the tab stays mounted, so alerts created
  // while the pilot was elsewhere (new jobs, profile/logbook changes) show up
  // without a manual pull-to-refresh.
  useFocusEffect(useCallback(() => {
    if (didTrigger.current) { load(filter, sort); refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sort, load, refresh]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await api.post('/jobs/alerts/run-match').catch(() => {});
    await load(filter, sort);
    refresh();
    setRefreshing(false);
  }, [filter, sort, load, refresh]);

  // Tap = mark read (fire-and-forget) + open the full job detail page. The old
  // inline expansion is kept only as a fallback for alerts whose job was removed.
  const onCardPress = (alert: Any) => {
    if (!alert.readAt) {
      api.patch(`/jobs/alerts/${alert.id}/read`).catch(() => { /* ignore */ });
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, readAt: new Date().toISOString() } : a)));
      refresh();
    }
    if (alert.job) router.push(`/jobs/${slugFor(alert.job)}`);
    else setExpanded((prev) => (prev === alert.id ? null : alert.id));
  };

  const onToggleSave = async (jobId?: string) => {
    if (!jobId) return;
    const wasSaved = savedMap[jobId];
    setSavedMap((prev) => ({ ...prev, [jobId]: !wasSaved }));
    try {
      if (wasSaved) await api.delete(`/jobs/${jobId}/save`);
      else await api.post(`/jobs/${jobId}/save`);
      if (filter === 'saved') load(filter, sort);
    } catch {
      setSavedMap((prev) => ({ ...prev, [jobId]: wasSaved }));
    }
  };

  const onMarkAll = async () => {
    setMarkingAll(true);
    try {
      await api.patch('/jobs/alerts/read-all');
      setAlerts((prev) => prev.map((a) => ({ ...a, readAt: a.readAt ?? new Date().toISOString() })));
      setUnread(0);
    } finally { setMarkingAll(false); }
  };

  const localUnread = alerts.filter((a) => !a.readAt).length;

  const Header = (
    <View>
      {header}
      <View style={styles.controls}>
      <View style={styles.chipRow}>
        {CHIPS.map(([key, label]) => (
          <Pressable key={key} onPress={() => setFilter(key)} style={[styles.chip, filter === key && styles.chipActive]}>
            <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.sortRow}>
        <View style={{ flex: 1 }}>
          <SelectField label="" value={sort} options={SORTS} onSelect={setSort} />
        </View>
        {localUnread > 0 ? (
          <Pressable style={styles.markAllBtn} onPress={onMarkAll} disabled={markingAll}>
            <Text style={styles.markAllText}>{markingAll ? 'Marking…' : 'Mark all read'}</Text>
          </Pressable>
        ) : null}
      </View>
      </View>
    </View>
  );

  return (
    <FlatList
      data={loading ? [] : alerts}
      keyExtractor={(a) => a.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={Header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pilot.navy} />}
      renderItem={({ item: alert }) => {
        const air = resolveAirline(airlineMap, alert.job?.company ?? alert.company);
        return (
          <AlertCard
            alert={alert}
            expanded={expanded === alert.id}
            saved={!!savedMap[alert.job?.id]}
            air={air}
            onPress={() => onCardPress(alert)}
            onToggleSave={() => onToggleSave(alert.job?.id)}
            onViewJob={() => alert.job && router.push(`/jobs/${slugFor(alert.job)}`)}
          />
        );
      }}
      ListEmptyComponent={
        loading ? <View style={styles.center}><ActivityIndicator color={pilot.navy} /><Text style={styles.dim}>Loading your alerts…</Text></View>
          : error ? <View style={styles.center}><Text style={styles.emptyTitle}>Could not load alerts</Text><Text style={styles.dim}>{error}</Text></View>
            : (
              <View style={styles.center}>
                <Ionicons name="notifications-outline" size={48} color={pilot.muted} />
                <Text style={styles.emptyTitle}>No alerts yet</Text>
                <Text style={styles.dim}>Complete your pilot profile — licences, ratings, and flight hours — and we'll match you to open positions and notify you here.</Text>
              </View>
            )
      }
    />
  );
}

// ─── Saved jobs tab ───────────────────────────────────────────────────────────
// GET /jobs/saved → jobs the pilot bookmarked (from job pages or match cards).
// Tap → job detail; the filled bookmark unsaves (optimistic, reloads on failure).

function SavedJobsTab({ header }: { header?: ReactNode }) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [jobs, setJobs] = useState<Any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [airlineMap, setAirlineMap] = useState<Awaited<ReturnType<typeof fetchAirlineMap>> | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const { data } = await api.get('/jobs/saved'); setJobs(Array.isArray(data) ? data : []); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    catch (err) { setError((err as any)?.response?.data?.error || (err as any)?.message || 'Failed to load saved jobs'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); fetchAirlineMap().then(setAirlineMap).catch(() => {}); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const unsave = async (jobId: string) => {
    setJobs((prev) => (prev ?? []).filter((j) => j.id !== jobId));
    try { await api.delete(`/jobs/${jobId}/save`); } catch { load(); }
  };

  return (
    <FlatList
      data={loading ? [] : (jobs ?? [])}
      keyExtractor={(j) => j.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={header ? <View>{header}</View> : null}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pilot.navy} />}
      renderItem={({ item: j }) => {
        const air = resolveAirline(airlineMap, j.company);
        const ago = postedAgo(j.postedAt);
        return (
          <Pressable style={styles.appCard} onPress={() => router.push(`/jobs/${slugFor(j)}`)}>
            <AirlineLogo logoUrl={air?.logoUrl} iataCode={air?.iataCode} name={j.company} box={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardTitle} numberOfLines={2}>{j.title ?? '—'}</Text>
              <Text style={styles.cardCompany}>{j.company ?? '—'}</Text>
              <View style={styles.metaRow}>
                {j.location ? <Text style={styles.meta}><Ionicons name="location-outline" size={11} color={pilot.muted} /> {j.location}</Text> : null}
                {ago ? <Text style={styles.meta}>{ago}</Text> : null}
              </View>
            </View>
            <Pressable onPress={() => unsave(j.id)} hitSlop={8} style={styles.saveBtn} accessibilityLabel="Remove from saved">
              <Ionicons name="bookmark" size={22} color={pilot.navy} />
            </Pressable>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        loading ? <View style={styles.center}><ActivityIndicator color={pilot.navy} /><Text style={styles.dim}>Loading saved jobs…</Text></View>
          : error ? <View style={styles.center}><Text style={styles.emptyTitle}>Could not load saved jobs</Text><Text style={styles.dim}>{error}</Text></View>
            : (
              <View style={styles.center}>
                <Ionicons name="bookmark-outline" size={48} color={pilot.muted} />
                <Text style={styles.emptyTitle}>No saved jobs yet</Text>
                <Text style={styles.dim}>Tap the bookmark on any job to keep it here for later.</Text>
              </View>
            )
      }
    />
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AlertsScreen() {
  const styles = useThemedStyles(createStyles);
  const { unread } = useUnread();
  const [tab, setTab] = useState<'matches' | 'saved'>('matches');

  const TABS: { key: typeof tab; label: string; badge: number }[] = [
    { key: 'matches', label: 'Matches', badge: unread },
    { key: 'saved', label: 'Saved', badge: 0 },
  ];

  // Head scrolls away with the list (it's each tab's ListHeaderComponent, not a
  // fixed bar): title + subtitle, then a full-width segmented Matches|Saved
  // control — two equal halves, no leftover gap.
  const head = (
    <View style={styles.head}>
      <Text style={styles.h1}>Alerts</Text>
      <Text style={styles.subtitle}>Cockpit roles, matched to your profile.</Text>
      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, active && styles.tabActive]}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              {t.badge > 0 ? (
                <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{t.badge > 99 ? '99+' : t.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      {tab === 'matches' ? <MatchesTab header={head} /> : <SavedJobsTab header={head} />}
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  // Head lives inside each tab's list header — horizontal padding comes from
  // listContent, so it only handles its own vertical rhythm.
  head: { marginBottom: 14 },
  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes['3xl'], color: pilot.ink, marginBottom: 4 },
  subtitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, marginBottom: 12 },

  // Full-width segmented control: two equal halves, centred labels.
  tabBar: { flexDirection: 'row', gap: 4, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 50, padding: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 50 },
  tabActive: { backgroundColor: pilot.navy },
  tabText: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, color: pilot.muted },
  tabTextActive: { color: '#fff' },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: pilot.navy, alignItems: 'center', justifyContent: 'center' },
  tabBadgeActive: { backgroundColor: '#fff' },
  tabBadgeText: { fontSize: 10, fontFamily: fontFamilies.bodyBold, color: '#fff' },
  tabBadgeTextActive: { color: pilot.navy },

  listContent: { padding: spacing.xl, paddingTop: spacing.lg, paddingBottom: 116 /* clears floating tab bar */ },
  controls: { marginBottom: 12 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: pilot.line, backgroundColor: pilot.surface },
  chipActive: { borderColor: pilot.navy, backgroundColor: 'rgba(0,63,136,0.06)' },
  chipText: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.bodyMedium },
  chipTextActive: { color: pilot.navy },
  sortRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  markAllBtn: { borderWidth: 1, borderColor: pilot.navy, borderRadius: 4, paddingHorizontal: 14, justifyContent: 'center', minHeight: 46 },
  markAllText: { color: pilot.navy, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },

  card: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderLeftWidth: 4, borderLeftColor: pilot.line, borderRadius: 14, padding: 14 },
  cardUnread: { borderColor: pilot.navy, borderLeftColor: pilot.navy },
  cardOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  cardTitle: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: pilot.ink, lineHeight: 21 },
  unreadDot: { color: pilot.navy, fontSize: 10 },
  cardCompany: { fontSize: fontSizes.sm, color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, marginTop: 3 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  meta: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pill: { fontSize: 11, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3, fontFamily: fontFamilies.bodySemiBold, overflow: 'hidden' },
  cardRight: { alignItems: 'flex-end', gap: 8 },
  saveBtn: { padding: 2 },

  expand: { backgroundColor: pilot.cream, borderWidth: 1, borderColor: pilot.line, borderTopWidth: 0, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, padding: 16 },
  desc: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, lineHeight: 21, marginBottom: 14 },
  expandActions: { flexDirection: 'row', gap: 10 },
  viewJobBtn: { backgroundColor: pilot.navy, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 16 },
  viewJobText: { color: '#fff', fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },
  applyBtn: { borderWidth: 1, borderColor: pilot.navy, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 16 },
  applyText: { color: pilot.navy, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },

  ssRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 14, marginBottom: 10 },
  ssName: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodyBold, color: pilot.ink, marginBottom: 5 },
  ssMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  ssMetaText: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body },
  ssIconBtn: { padding: 6 },
  newBtn: { backgroundColor: pilot.navy, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 16 },
  newBtnText: { color: '#fff', fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },

  appCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 14, padding: 14, marginBottom: 12 },
  statusPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 8 },
  statusPillText: { fontSize: 11, fontFamily: fontFamilies.bodyBold },

  center: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20, gap: 10 },
  emptyTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.xl, color: pilot.ink, textAlign: 'center' },
  dim: { fontSize: fontSizes.base, color: pilot.muted, fontFamily: fontFamilies.body, textAlign: 'center', lineHeight: 22 },
});
