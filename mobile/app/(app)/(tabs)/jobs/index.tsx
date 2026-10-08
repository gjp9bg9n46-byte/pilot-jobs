// Jobs list — data mirrors frontend/src/pages/Jobs.jsx (GET /jobs limit 1000 +
// client-side text filter; qualifiedOnly defaults OFF (all jobs), ?qualified=1 turns it on;
// sort defaults 'newest'; URL state via expo-router search params).
//
// LAYOUT (redesigned, Climbto350-style): padded header (title, search, sort +
// qualified toggle) above a flat, edge-to-edge list — full-width rows separated
// by hairline dividers, no cards, no gaps. Each row shows only title, company,
// posted-ago, and the requirements-met count; every spec detail lives on the
// job detail page (tap a row to open it).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../src/lib/api';
import JobCardContent from '../../../../src/components/JobCardShared';
import { SelectField, TextField } from '../../../../src/components/ui';
import { fetchAirlineMap, resolveAirline } from '../../../../src/lib/airlineLookup';
import { postedAgo, statusMeta } from '../../../../src/lib/jobMatch';
import { useTabBarClearance } from '../../../../src/theme/tabBar';
import { fontFamilies, fontSizes, pilot, spacing } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

// A#4 — signed-in pilots open on Best match. The server already groups by fit
// (jobController "best"); the client then orders within that by % and recency,
// and drops rows the pilot is barred from by nationality to the bottom.
const SORT_OPTIONS: [string, string][] = [
  ['best', 'Best match'],
  ['newest', 'Newest'],
  ['deadline', 'Deadline'],
];
const DEFAULT_SORT = 'best';

// Fit groups — the SAME list, order and labels as web (frontend/src/pages/Jobs.jsx
// FIT_GROUPS). Web is the reference design: the app groups identically so the
// two read the same way.
const FIT_GROUPS: { key: string; label: string; hint: string }[] = [
  { key: 'qualify', label: 'You qualify', hint: 'best match first' },
  { key: 'incomplete', label: 'Complete your profile to check', hint: '' },
  { key: 'oneShort', label: 'One requirement short', hint: "shows what's missing" },
  { key: 'few', label: 'Few requirements stated', hint: '' },
  { key: 'other', label: 'Everything else', hint: '' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Job = Record<string, any>;

function slugify(str: string) {
  return String(str || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function slugFor(job: Job) {
  return `${slugify(job.company)}-${slugify(job.role || job.title)}-${job.id}`;
}

function JobsBrowse() {
  const tabBarClearance = useTabBarClearance();
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; sort?: string; qualified?: string }>();

  const [search, setSearch] = useState(typeof params.q === 'string' ? params.q : '');
  const [sort, setSort] = useState(typeof params.sort === 'string' ? params.sort : DEFAULT_SORT);
  const [qualifiedOnly, setQualifiedOnly] = useState(params.qualified === '1');

  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Airline logo lookup: jobs carry only a scraped `company` string (no logoUrl),
  // so we fetch the airline list once and resolve company → airline → logoUrl.
  const [airlineMap, setAirlineMap] = useState<Awaited<ReturnType<typeof fetchAirlineMap>> | null>(null);

  useEffect(() => {
    fetchAirlineMap().then(setAirlineMap).catch(() => {});
  }, []);

  const fetchJobs = useCallback(async () => {
    setError(null);
    try {
      const query: Record<string, unknown> = { limit: 1000, sort };
      if (qualifiedOnly) query.qualifiedOnly = true;
      const { data } = await api.get('/jobs', { params: query });
      setJobs(data.jobs || []);
      setTotal(data.total ?? (data.jobs?.length || 0));
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((err as any)?.response?.data?.error || 'Failed to load jobs');
    }
  }, [sort, qualifiedOnly]);

  useEffect(() => {
    setLoading(true);
    fetchJobs().finally(() => setLoading(false));
  }, [fetchJobs]);

  // Silent refetch on every focus — the tab stays mounted, so mount-only fetches
  // go stale. The server recomputes each job's match against the pilot on every
  // GET /jobs, so the % stays current after edits elsewhere without a client recompute.
  useFocusEffect(useCallback(() => {
    fetchJobs();
  }, [fetchJobs]));

  // Persist URL state (omit defaults) like web.
  useEffect(() => {
    const next: Record<string, string> = {};
    if (search) next.q = search;
    if (sort !== DEFAULT_SORT) next.sort = sort;
    if (qualifiedOnly) next.qualified = '1';
    router.setParams(next);
  }, [search, sort, qualifiedOnly, router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  }, [fetchJobs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return jobs.filter((j) =>
      j.title?.toLowerCase().includes(q) || j.company?.toLowerCase().includes(q) || j.location?.toLowerCase().includes(q),
    );
  }, [jobs, search]);

  // Ordering — identical to web's orderRank (frontend/src/pages/Jobs.jsx):
  // barred → fresh → direct → newest, applied WITHIN each fit group. The
  // nationality demotion came from the real-device pass (A#4) and now runs on
  // both platforms.
  const THIRTY_DAYS = 30 * 86400000;
  const rows = useMemo(() => {
    const isFresh = (j: Job) => !j.evergreen && j.postedAt && (Date.now() - new Date(j.postedAt).getTime()) <= THIRTY_DAYS;
    const isBarred = (j: Job) => ((j.match?.unmetKeys || []) as string[]).includes('nationality');
    const rank = (j: Job) => [
      isBarred(j) ? 1 : 0,
      isFresh(j) ? 0 : 1,
      (j.sourceType && j.sourceType !== 'aggregator') ? 0 : 1,
      -(new Date(j.postedAt || 0).getTime()),
    ];
    const byRank = (a: Job, b: Job) => {
      const ra = rank(a); const rb = rank(b);
      for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i] - rb[i];
      return 0;
    };
    const ordered = [...filtered].sort(byRank);
    const showGroups = sort === 'best' && ordered.some((j) => j.match);
    if (!showGroups) return ordered.map((job) => ({ type: 'job' as const, job, key: job.id }));
    // Flatten groups into one list so a single FlatList renders headers + rows.
    const out: ({ type: 'head'; label: string; hint: string; count: number; key: string } | { type: 'job'; job: Job; key: string })[] = [];
    for (const g of FIT_GROUPS) {
      const inGroup = ordered.filter((j) => j.match?.fitGroup === g.key);
      if (!inGroup.length) continue;
      out.push({ type: 'head', label: g.label, hint: g.hint, count: inGroup.length, key: `h-${g.key}` });
      for (const job of inGroup) out.push({ type: 'job', job, key: job.id });
    }
    // Jobs with no match object at all (logged-out shape) still get listed.
    for (const job of ordered.filter((j) => !j.match)) out.push({ type: 'job', job, key: job.id });
    return out;
  }, [filtered, sort]);

  const renderRow = ({ item }: { item: any }) => {
    if (item.type === 'head') {
      return (
        <View style={styles.groupHead}>
          <Text style={styles.groupLabel}>{item.label} · {item.count}</Text>
          {item.hint ? <Text style={styles.groupHint}>{item.hint}</Text> : null}
        </View>
      );
    }
    const job = item.job as Job;
    const eg = (job as any).evergreen as boolean | undefined;
    const seen = (job as any).lastSeenAt as string | null | undefined;
    const ago = eg ? null : postedAgo(job.postedAt);
    const ongoing = eg ? `↻ Ongoing · ${seen ? `confirmed listed ${postedAgo(seen)}` : 'still listed'}` : null;
    // Server-computed match (services/jobMatch.js) — the SAME number web + Dashboard
    // show. statusMeta maps it to a label + tone colour; no client recompute.
    const meta = statusMeta((job as any).match);
    const toneBg = meta?.tone === 'green' ? '#DCFCE7' : meta?.tone === 'amber' ? '#FEF3C7' : pilot.cream;
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed, pressed && { transform: [{ scale: 0.985 }] }]}
        onPress={() => router.push(`/jobs/${slugFor(job)}`)}
      >
        <JobCardContent
          job={job}
          air={resolveAirline(airlineMap, job.company)}
          ago={ago}
          ongoing={ongoing}
          footer={meta && meta.pct != null ? (
            <View style={[styles.matchPill, { backgroundColor: toneBg }]}>
              <Text style={[styles.matchPillText, { color: meta.color }]}>
                {meta.pct}% match{meta.label ? ` · ${meta.label}` : ''}
              </Text>
            </View>
          ) : null}
        />
      </Pressable>
    );
  };

  const ListHeader = (
    <View style={styles.header}>
      <Text style={styles.h1}>Jobs</Text>
      <Text style={styles.subtitle}>All cockpit roles, with your match on each.</Text>

      <View style={styles.statusRow}>
        <Text style={styles.count}>{filtered.length} of {total} jobs</Text>
        <Pressable onPress={onRefresh} style={styles.refreshBtn} accessibilityLabel="Refresh jobs">
          <Ionicons name="refresh" size={14} color={pilot.muted} />
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      <TextField
        label=""
        placeholder="Search by title, airline, or location..."
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        containerStyle={{ marginBottom: 12 }}
      />

      <View style={styles.controlsRow}>
        <View style={{ flex: 1 }}>
          <SelectField label="" value={sort} options={SORT_OPTIONS} onSelect={setSort} />
        </View>
      </View>
      {/* Horizontal filter rail — same swipeable pattern as the Matches chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRail} contentContainerStyle={styles.chipRailRow}>
        <Pressable
          onPress={() => setQualifiedOnly((v) => !v)}
          style={[styles.toggle, qualifiedOnly && styles.toggleActive]}
        >
          <Text style={[styles.toggleText, qualifiedOnly && styles.toggleTextActive]}>
            {qualifiedOnly ? '✓ ' : ''}Qualified only
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.safe}>
      <FlatList
        data={loading ? [] : rows}
        keyExtractor={(r: any) => r.key}
        renderItem={renderRow}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarClearance }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pilot.navy} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}><ActivityIndicator color={pilot.navy} /><Text style={styles.loadingText}>Loading jobs from around the world...</Text></View>
          ) : error ? (
            <View style={styles.center}><Text style={styles.emptyTitle}>Could not load jobs</Text><Text style={styles.emptyText}>{error}</Text></View>
          ) : (
            <View style={styles.center}><Text style={styles.emptyTitle}>No jobs found</Text><Text style={styles.emptyText}>Try adjusting your search or filters.{'\n'}New jobs added daily.</Text></View>
          )
        }
      />
    </View>
  );
}

// ─── Jobs screen ─────────────────────────────────────────────────────────────
// A#6 — the Browse/Matches segmented control is gone: matches live on the Home
// (dashboard) tab, which also owns the single unread badge (A#1). Alerts are
// still reachable from the drawer (/alerts).
export default function JobsScreen() {
  const pilotColors = useThemeColors();
  return (
    <View style={{ flex: 1, backgroundColor: pilotColors.cream }}>
      <JobsBrowse />
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  // Rows run edge-to-edge; only the header block is inset.
  listContent: {}, // bottom padding comes from useTabBarClearance()
  groupHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: 18, paddingBottom: 6 },
  groupLabel: { fontSize: 11.5, letterSpacing: 0.6, color: pilot.ink, fontFamily: fontFamilies.bodyBold, textTransform: 'uppercase' },
  groupHint: { fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.body },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: 4 },
  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes['3xl'], color: pilot.ink, marginBottom: 4 },
  subtitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, marginBottom: 20 },

  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  count: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 4 },
  refreshText: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.bodyMedium },

  // stretch → the toggle is always exactly as tall as the select beside it.
  controlsRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch', marginBottom: 8 },
  chipRail: { marginBottom: 8, flexGrow: 0 },
  chipRailRow: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingRight: 12 },
  // A#8 — a filter CHIP (pill, like the region/segment chips elsewhere), not the
  // old square button that read as a form control.
  toggle: {
    borderWidth: 1, borderColor: pilot.line, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 7,
    justifyContent: 'center', backgroundColor: pilot.surface,
  },
  toggleActive: { borderColor: pilot.navy, backgroundColor: pilot.navy },
  toggleText: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.bodyMedium },
  toggleTextActive: { color: '#FFFFFF' },

  // Card rows — identical treatment to the Matches (alerts) cards.
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line,
    borderLeftWidth: 4, borderLeftColor: pilot.line, borderRadius: 14,
    padding: 14, marginHorizontal: spacing.xl, marginBottom: 12,
  },
  rowPressed: { backgroundColor: 'rgba(0,63,136,0.04)' },
  rowTitle: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: pilot.ink, lineHeight: 21 },
  rowSub: { fontSize: fontSizes.sm, color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, marginTop: 3 },
  matchPill: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  matchPillText: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyBold },

  center: { alignItems: 'center', paddingVertical: 60, gap: 10, paddingHorizontal: spacing.xl },
  loadingText: { color: pilot.navy, fontSize: fontSizes.base, fontFamily: fontFamilies.body },
  emptyTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.xl, color: pilot.ink },
  emptyText: { fontSize: fontSizes.base, color: pilot.muted, fontFamily: fontFamilies.body, textAlign: 'center', lineHeight: 22 },
});
