// Jobs list — data mirrors frontend/src/pages/Jobs.jsx (GET /jobs limit 1000 +
// client-side text filter; qualifiedOnly defaults ON, ?qualified=0 turns it off;
// sort defaults 'newest'; URL state via expo-router search params).
//
// LAYOUT (redesigned, Climbto350-style): padded header (title, search, sort +
// qualified toggle) above a flat, edge-to-edge list — full-width rows separated
// by hairline dividers, no cards, no gaps. Each row shows only title, company,
// posted-ago, and the requirements-met count; every spec detail lives on the
// job detail page (tap a row to open it).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../src/lib/api';
import JobCardContent from '../../../../src/components/JobCardShared';
import AlertsScreen from '../alerts';
import { useUnread } from '../../../../src/context/UnreadContext';
import { SelectField, TextField } from '../../../../src/components/ui';
import { fetchAirlineMap, resolveAirline } from '../../../../src/lib/airlineLookup';
import { computeMatchCount, postedAgo } from '../../../../src/lib/jobMatch';
import { TAB_BAR_CLEARANCE } from '../../../../src/theme/tabBar';
import { fontFamilies, fontSizes, pilot, spacing } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

const SORT_OPTIONS: [string, string][] = [
  ['newest', 'Newest'],
  ['relevant', 'Most Relevant'],
  ['deadline', 'Deadline'],
];
const SEM = { green: '#166534', amber: '#92400E' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Job = Record<string, any>;

function slugify(str: string) {
  return String(str || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function slugFor(job: Job) {
  return `${slugify(job.company)}-${slugify(job.role || job.title)}-${job.id}`;
}

function JobsBrowse() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; sort?: string; qualified?: string }>();

  const [search, setSearch] = useState(typeof params.q === 'string' ? params.q : '');
  const [sort, setSort] = useState(typeof params.sort === 'string' ? params.sort : 'newest');
  const [qualifiedOnly, setQualifiedOnly] = useState(params.qualified !== '0');

  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<Job | null>(null);
  const [totals, setTotals] = useState<Job | null>(null);
  // Airline logo lookup: jobs carry only a scraped `company` string (no logoUrl),
  // so we fetch the airline list once and resolve company → airline → logoUrl.
  const [airlineMap, setAirlineMap] = useState<Awaited<ReturnType<typeof fetchAirlineMap>> | null>(null);

  useEffect(() => {
    Promise.all([api.get('/profile'), api.get('/profile/totals')])
      .then(([p, t]) => { setProfile(p.data); setTotals(t.data); })
      .catch(() => {});
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
  // go stale. Keeps the list, match counts (profile + logbook totals) current
  // after edits elsewhere in the app.
  useFocusEffect(useCallback(() => {
    fetchJobs();
    Promise.all([api.get('/profile'), api.get('/profile/totals')])
      .then(([p, t]) => { setProfile(p.data); setTotals(t.data); })
      .catch(() => {});
  }, [fetchJobs]));

  // Persist URL state (omit defaults) like web.
  useEffect(() => {
    const next: Record<string, string> = {};
    if (search) next.q = search;
    if (sort !== 'newest') next.sort = sort;
    if (!qualifiedOnly) next.qualified = '0';
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

  const renderRow = ({ item: job }: { item: Job }) => {
    const ago = postedAgo(job.postedAt);
    const mc = profile && totals ? computeMatchCount(job, profile, totals) : null;
    const full = !!mc && mc.total > 0 && mc.matched === mc.total;
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed, pressed && { transform: [{ scale: 0.985 }] }]}
        onPress={() => router.push(`/jobs/${slugFor(job)}`)}
      >
        <JobCardContent
          job={job}
          air={resolveAirline(airlineMap, job.company)}
          ago={ago}
          right={<Ionicons name="chevron-forward" size={18} color={pilot.line} />}
          footer={mc && mc.total > 0 ? (
            <View style={[styles.matchPill, { backgroundColor: full ? '#DCFCE7' : '#FEF3C7' }]}>
              <Text style={[styles.matchPillText, { color: full ? SEM.green : SEM.amber }]}>
                {mc.matched}/{mc.total} requirements met
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
      <Text style={styles.subtitle}>Cockpit roles, filtered to your profile.</Text>

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
        <Pressable
          onPress={() => setQualifiedOnly((v) => !v)}
          style={[styles.toggle, qualifiedOnly && styles.toggleActive]}
        >
          <Text style={[styles.toggleText, qualifiedOnly && styles.toggleTextActive]}>
            {qualifiedOnly ? '✓ ' : ''}Qualified only
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.safe}>
      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={(j) => j.id}
        renderItem={renderRow}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.listContent}
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

// ─── Merged Jobs screen: Browse (job board) + Matches (former Alerts page) ────
export default function JobsScreen() {
  const pilotColors = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const { unread } = useUnread();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<'browse' | 'matches'>(params.view === 'matches' ? 'matches' : 'browse');

  useEffect(() => {
    if (params.view === 'matches') setView('matches');
  }, [params.view]);

  return (
    <View style={{ flex: 1, backgroundColor: pilotColors.cream }}>
      <View style={styles.segmentWrap}>
        {([['browse', 'Browse'], ['matches', 'Matches']] as const).map(([key, label]) => {
          const active = view === key;
          return (
            <Pressable key={key} onPress={() => setView(key)} style={[styles.segment, active && styles.segmentActive]}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
              {key === 'matches' && unread > 0 ? (
                <View style={[styles.segBadge, active && styles.segBadgeActive]}>
                  <Text style={[styles.segBadgeText, active && styles.segBadgeTextActive]}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {view === 'browse' ? <JobsBrowse /> : <AlertsScreen />}
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  // Rows run edge-to-edge; only the header block is inset.
  listContent: { paddingBottom: TAB_BAR_CLEARANCE },
  segmentWrap: { flexDirection: 'row', marginHorizontal: spacing.xl, marginTop: 10, marginBottom: 6, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 3, gap: 3 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 9 },
  segmentActive: { backgroundColor: pilot.navy },
  segmentText: { fontSize: 13, fontFamily: fontFamilies.bodySemiBold, color: pilot.muted },
  segmentTextActive: { color: '#FFFFFF' },
  segBadge: { backgroundColor: pilot.navy, borderRadius: 9, minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, alignItems: 'center' },
  segBadgeActive: { backgroundColor: '#FFFFFF' },
  segBadgeText: { color: '#FFFFFF', fontSize: 10, fontFamily: fontFamilies.bodyBold },
  segBadgeTextActive: { color: pilot.navy },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: 4 },
  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes['3xl'], color: pilot.ink, marginBottom: 4 },
  subtitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, marginBottom: 20 },

  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  count: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 4 },
  refreshText: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.bodyMedium },

  // stretch → the toggle is always exactly as tall as the select beside it.
  controlsRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch', marginBottom: 8 },
  toggle: {
    borderWidth: 1, borderColor: pilot.line, borderRadius: 6, paddingHorizontal: 14,
    justifyContent: 'center', backgroundColor: pilot.surface,
  },
  toggleActive: { borderColor: pilot.navy, backgroundColor: 'rgba(0,63,136,0.06)' },
  toggleText: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.bodyMedium },
  toggleTextActive: { color: pilot.navy },

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
