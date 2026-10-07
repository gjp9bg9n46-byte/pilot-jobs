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

// Fit order for the client-side pass, mirroring the server's fitGroup ranking.
const STATUS_RANK: Record<string, number> = {
  QUALIFY: 0, CHECK: 1, SHORT: 2, NO_REQUIREMENTS: 3, NOT_MET: 4, WRONG_CATEGORY: 5,
};

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

  // Ordering (A#4). Two demotions always apply, in this order:
  //   1. a job whose nationality requirement the pilot cannot meet — they cannot
  //      be hired for it, so it never sits above a job they can take;
  //   2. evergreen rows (old posting date but still listed — rolling
  //      recruitment), which are reframed on the card rather than dated.
  // Within that, "Best match" sorts by fit, then % desc, then newest. The other
  // sorts keep the server's order (the fetch already asked for it).
  const { orderedJobs, freshCount, evergreenCount } = useMemo(() => {
    const barred = (j: Job) => ((j.match?.unmetKeys || []) as string[]).includes('nationality');
    const ever = (j: Job) => !!(j as any).evergreen;
    const decorated = filtered.map((j, i) => ({ j, i }));
    decorated.sort((a, b) => {
      const byBar = Number(barred(a.j)) - Number(barred(b.j));
      if (byBar) return byBar;
      const byEver = Number(ever(a.j)) - Number(ever(b.j));
      if (byEver) return byEver;
      if (sort === 'best') {
        const rank = (x: Job) => STATUS_RANK[x.match?.status as string] ?? 9;
        const byFit = rank(a.j) - rank(b.j);
        if (byFit) return byFit;
        const pct = (x: Job) => (typeof x.match?.pct === 'number' ? x.match.pct : -1);
        const byPct = pct(b.j) - pct(a.j);
        if (byPct) return byPct;
        const posted = (x: Job) => new Date(x.postedAt || 0).getTime();
        const byNew = posted(b.j) - posted(a.j);
        if (byNew) return byNew;
      }
      return a.i - b.i; // stable: keep the server's order otherwise
    });
    const ordered = decorated.map((d) => d.j);
    const everCount = ordered.filter(ever).length;
    return { orderedJobs: ordered, freshCount: ordered.length - everCount, evergreenCount: everCount };
  }, [filtered, sort]);

  const renderRow = ({ item: job, index }: { item: Job; index: number }) => {
    const eg = (job as any).evergreen as boolean | undefined;
    const seen = (job as any).lastSeenAt as string | null | undefined;
    const ago = eg ? null : postedAgo(job.postedAt);
    const ongoing = eg ? `↻ Ongoing · ${seen ? `confirmed listed ${postedAgo(seen)}` : 'still listed'}` : null;
    const showDivider = index === freshCount && evergreenCount > 0;
    // Server-computed match (services/jobMatch.js) — the SAME number web + Dashboard
    // show. statusMeta maps it to a label + tone colour; no client recompute.
    const meta = statusMeta((job as any).match);
    const toneBg = meta?.tone === 'green' ? '#DCFCE7' : meta?.tone === 'amber' ? '#FEF3C7' : pilot.cream;
    return (
      <>
        {showDivider ? (
          <Text style={styles.ongoingDivider}>Ongoing recruitment — open vacancies, not new postings</Text>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed, pressed && { transform: [{ scale: 0.985 }] }]}
          onPress={() => router.push(`/jobs/${slugFor(job)}`)}
        >
          <JobCardContent
            job={job}
            air={resolveAirline(airlineMap, job.company)}
            ago={ago}
            ongoing={ongoing}
            right={<Ionicons name="chevron-forward" size={18} color={pilot.line} />}
            footer={meta && meta.pct != null ? (
              <View style={[styles.matchPill, { backgroundColor: toneBg }]}>
                <Text style={[styles.matchPillText, { color: meta.color }]}>
                  {meta.pct}% match{meta.label ? ` · ${meta.label}` : ''}
                </Text>
              </View>
            ) : null}
          />
        </Pressable>
      </>
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
        data={loading ? [] : orderedJobs}
        keyExtractor={(j) => j.id}
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
  ongoingDivider: {
    fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyBold, letterSpacing: 0.4,
    color: pilot.muted, marginHorizontal: spacing.xl, marginTop: 6, marginBottom: 10,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: pilot.line,
  },
  rowTitle: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: pilot.ink, lineHeight: 21 },
  rowSub: { fontSize: fontSizes.sm, color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, marginTop: 3 },
  matchPill: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  matchPillText: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyBold },

  center: { alignItems: 'center', paddingVertical: 60, gap: 10, paddingHorizontal: spacing.xl },
  loadingText: { color: pilot.navy, fontSize: fontSizes.base, fontFamily: fontFamilies.body },
  emptyTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.xl, color: pilot.ink },
  emptyText: { fontSize: fontSizes.base, color: pilot.muted, fontFamily: fontFamilies.body, textAlign: 'center', lineHeight: 22 },
});
