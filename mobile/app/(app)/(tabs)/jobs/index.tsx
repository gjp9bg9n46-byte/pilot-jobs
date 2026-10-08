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
  ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../src/lib/api';
import JobCardContent from '../../../../src/components/JobCardShared';
import { SelectField, TextField } from '../../../../src/components/ui';
import { fetchAirlineMap, resolveAirline } from '../../../../src/lib/airlineLookup';
import { postedAgo, roleLabel } from '../../../../src/lib/jobMatch';
import { num } from '../../../../src/lib/format';
import { useTabBarClearance } from '../../../../src/theme/tabBar';
import { fontFamilies, fontSizes, pilot, spacing } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

// A#4 — signed-in pilots open on Best match. The server already groups by fit
// (jobController "best"); the client then orders within that by % and recency,
// and drops rows the pilot is barred from by nationality to the bottom.
// Same four as web (frontend/src/pages/Jobs.jsx SORT_OPTIONS).
const SORT_OPTIONS: [string, string][] = [
  ['best', 'Best match'],
  ['newest', 'Newest'],
  ['salary_high', 'Salary'],
  ['deadline', 'Deadline'],
];
// "All regions" FIRST, like web — on a narrow screen the default must be
// visible and obviously active rather than scrolled off the right end.
const REGION_TABS = ['All', 'Middle East', 'Europe', 'North America', 'Asia-Pacific'];
const ROLE_OPTS: [string, string][] = [['', 'Any role'], ['CAPTAIN', 'Captain'], ['FIRST_OFFICER', 'First Officer'], ['INSTRUCTOR', 'Instructor']];
const POSTED_OPTS: [string, string][] = [['', 'Any time'], ['1', 'Last 24 hours'], ['7', 'Last 7 days'], ['30', 'Last 30 days']];
const CONTRACT_OPTS: [string, string][] = [['', 'Any contract'], ['FULL_TIME', 'Full time'], ['CONTRACT', 'Contract'], ['PART_TIME', 'Part time']];
const HOURS_OPTS: [string, string][] = [['', 'Hours'], ['500', 'Up to 500 h'], ['1000', 'Up to 1,000 h'], ['1500', 'Up to 1,500 h'], ['3000', 'Up to 3,000 h'], ['5000', 'Up to 5,000 h']];
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

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
  const params = useLocalSearchParams<{ q?: string; sort?: string; qualified?: string; region?: string }>();

  const [search, setSearch] = useState(typeof params.q === 'string' ? params.q : '');
  const [sort, setSort] = useState(typeof params.sort === 'string' ? params.sort : DEFAULT_SORT);
  const [qualifiedOnly, setQualifiedOnly] = useState(params.qualified === '1');
  // Filter state — the same params web sends (no app-only logic, handoff rule B).
  const [region, setRegion] = useState(typeof params.region === 'string' ? params.region : '');
  const [maxReqHours, setMaxReqHours] = useState('');
  const [aircraftType, setAircraftType] = useState('');
  const [role, setRole] = useState('');
  const [authority, setAuthority] = useState('');
  const [contractType, setContractType] = useState('');
  const [postedWithin, setPostedWithin] = useState('');
  const [visaOnly, setVisaOnly] = useState(false);
  const [ntrOnly, setNtrOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [regionCounts, setRegionCounts] = useState<Record<string, number> | null>(null);
  const [facets, setFacets] = useState<Any>({});
  const [qualifyCount, setQualifyCount] = useState<number | null>(null);
  const [emptyProfile, setEmptyProfile] = useState(false);

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
      if (region) query.region = region;
      if (maxReqHours) query.maxReqHours = maxReqHours;
      if (aircraftType) query.aircraft = aircraftType;
      if (role) query.role = role;
      if (authority) query.authority = authority;
      if (contractType) query.contractType = contractType;
      if (postedWithin) query.postedWithin = postedWithin;
      if (visaOnly) query.visa = 'true';
      if (ntrOnly) query.typeRating = 'ntr';
      const { data } = await api.get('/jobs', { params: query });
      setJobs(data.jobs || []);
      setTotal(data.total ?? (data.jobs?.length || 0));
      // These come back at the TOP level of the response, not under `meta`.
      setRegionCounts(data.regionCounts || null);
      setFacets(data.facetCounts || {});
      setQualifyCount(data.qualifyCount ?? null);
      setEmptyProfile(!!data.emptyProfile);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((err as any)?.response?.data?.error || 'Failed to load jobs');
    }
  }, [sort, qualifiedOnly, region, maxReqHours, aircraftType, role, authority, contractType, postedWithin, visaOnly, ntrOnly]);

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
    if (region) next.region = region;
    router.setParams(next);
  }, [search, sort, qualifiedOnly, region, router]);

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
    // Inventory 4.1 (default-to-web): the card carries web's per-requirement
    // verdict chips, not a % pill — web shows no percentage on a card, and a
    // "0% match · 1 short" pill next to a green "Apply direct" read as noise.
    // The % still leads the job detail and the Dashboard match rows.
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
        />
      </Pressable>
    );
  };

  const facetOpts = (obj: Any): [string, string][] => Object.entries(obj || {})
    .sort((a: Any, b: Any) => b[1] - a[1]).slice(0, 12).map(([k]) => [k, k] as [string, string]);
  const anySheetFilter = !!(aircraftType || role || authority || contractType || postedWithin || ntrOnly);
  const applied: { key: string; label: string; clear: () => void }[] = [
    region ? { key: 'region', label: region, clear: () => setRegion('') } : null,
    maxReqHours ? { key: 'hours', label: `Up to ${num(maxReqHours)} h`, clear: () => setMaxReqHours('') } : null,
    aircraftType ? { key: 'ac', label: aircraftType, clear: () => setAircraftType('') } : null,
    role ? { key: 'role', label: roleLabel(role), clear: () => setRole('') } : null,
    authority ? { key: 'auth', label: authority, clear: () => setAuthority('') } : null,
    contractType ? { key: 'ct', label: contractType.replace(/_/g, ' ').toLowerCase(), clear: () => setContractType('') } : null,
    postedWithin ? { key: 'pw', label: `Last ${postedWithin} d`, clear: () => setPostedWithin('') } : null,
    visaOnly ? { key: 'visa', label: 'Visa sponsored', clear: () => setVisaOnly(false) } : null,
    ntrOnly ? { key: 'ntr', label: 'No type rating', clear: () => setNtrOnly(false) } : null,
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];
  const clearAll = () => {
    setRegion(''); setMaxReqHours(''); setAircraftType(''); setRole(''); setAuthority('');
    setContractType(''); setPostedWithin(''); setVisaOnly(false); setNtrOnly(false);
  };

  const ListHeader = (
    <View>
      <View style={styles.header}>
        <Text style={styles.h1}>Jobs</Text>
        {/* A#5 wording, plus web's qualify count (inventory 1.3). */}
        <Text style={styles.subtitle}>All cockpit roles, with your match on each.</Text>
        <Text style={styles.count}>
          {num(regionCounts?.All ?? total)} cockpit jobs worldwide
          {qualifyCount != null ? <Text style={styles.countStrong}>{`  ·  ${qualifyCount} you qualify for`}</Text> : null}
        </Text>
      </View>

      {/* Region tabs — web's primary navigation, with the server's counts. */}
      {regionCounts ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.regionRow}>
          {REGION_TABS.map((r) => {
            const active = r === 'All' ? !region : region === r;
            const count = r === 'All' ? regionCounts.All : regionCounts[r];
            return (
              <Pressable key={r} onPress={() => setRegion(r === 'All' ? '' : r)} style={[styles.regionTab, active && styles.regionTabOn]}>
                <Text style={[styles.regionText, active && styles.regionTextOn]}>{r === 'All' ? 'All regions' : r}</Text>
                <Text style={[styles.regionCount, active && styles.regionCountOn]}>{count ?? 0}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.headerPad}>
        <TextField
          label=""
          placeholder="Search jobs…"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={{ marginBottom: 10 }}
        />
      </View>

      {/* Filter rail — same controls as web's phone bar. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railRow}>
        <Pressable onPress={() => setFiltersOpen(true)} style={[styles.chip, !!maxReqHours && styles.chipOn]}>
          <Text style={[styles.chipText, !!maxReqHours && styles.chipTextOn]}>{maxReqHours ? `Up to ${num(maxReqHours)} h` : 'Hours'}</Text>
        </Pressable>
        <Pressable onPress={() => setFiltersOpen(true)} style={[styles.chip, anySheetFilter && styles.chipOn]}>
          <Ionicons name="options-outline" size={13} color={anySheetFilter ? '#FFFFFF' : pilot.muted} />
          <Text style={[styles.chipText, anySheetFilter && styles.chipTextOn]}>  Filters</Text>
        </Pressable>
        <Pressable onPress={() => setVisaOnly((v) => !v)} style={[styles.chip, visaOnly && styles.chipOn]}>
          <Text style={[styles.chipText, visaOnly && styles.chipTextOn]}>{visaOnly ? '✓ ' : ''}Visa</Text>
        </Pressable>
        <Pressable onPress={() => setQualifiedOnly((v) => !v)} style={[styles.chip, qualifiedOnly && styles.chipOn]}>
          <Text style={[styles.chipText, qualifiedOnly && styles.chipTextOn]}>{qualifiedOnly ? '✓ ' : ''}Qualified only</Text>
        </Pressable>
        <View style={styles.sortWrap}>
          <Text style={styles.sortLabel}>Sort:</Text>
          <View style={{ minWidth: 132 }}>
            <SelectField label="" value={sort} options={SORT_OPTIONS} onSelect={setSort} />
          </View>
        </View>
      </ScrollView>

      {applied.length > 0 ? (
        <View style={styles.appliedRow}>
          {applied.map((a) => (
            <Pressable key={a.key} onPress={a.clear} style={styles.appliedChip}>
              <Text style={styles.appliedText}>{a.label}</Text>
              <Ionicons name="close" size={12} color={pilot.navy} />
            </Pressable>
          ))}
          <Pressable onPress={clearAll}><Text style={styles.clearAll}>Clear all</Text></Pressable>
        </View>
      ) : null}

      {emptyProfile ? (
        <View style={styles.emptyProf}>
          <Text style={styles.emptyProfText}>
            <Text style={{ fontFamily: fontFamilies.bodyBold }}>Complete your profile to see which jobs you qualify for.</Text>
            {' '}Add your licence and your hours and we’ll check every job against them.
          </Text>
        </View>
      ) : null}
    </View>
  );

  const FiltersSheet = (
    <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
      <Pressable style={styles.sheetBackdrop} onPress={() => setFiltersOpen(false)}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetGrip} />
          <Text style={styles.sheetTitle}>Filters</Text>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
            <SelectField label="Max required hours" value={maxReqHours} options={HOURS_OPTS} onSelect={setMaxReqHours} />
            <SelectField label="Aircraft" value={aircraftType} options={[['', 'Any aircraft'], ...facetOpts(facets.aircraft)]} onSelect={setAircraftType} />
            <SelectField label="Role" value={role} options={ROLE_OPTS} onSelect={setRole} />
            <SelectField label="Licence authority" value={authority} options={[['', 'Any authority'], ...facetOpts(facets.authority)]} onSelect={setAuthority} />
            <SelectField label="Contract" value={contractType} options={CONTRACT_OPTS} onSelect={setContractType} />
            <SelectField label="Posted within" value={postedWithin} options={POSTED_OPTS} onSelect={setPostedWithin} />
            <Pressable onPress={() => setNtrOnly((v) => !v)} style={[styles.chip, styles.chipWide, ntrOnly && styles.chipOn]}>
              <Text style={[styles.chipText, ntrOnly && styles.chipTextOn]}>{ntrOnly ? '✓ ' : ''}No type rating required</Text>
            </Pressable>
          </ScrollView>
          <View style={styles.sheetFoot}>
            <Pressable onPress={clearAll}><Text style={styles.clearAll}>Clear all</Text></Pressable>
            <Pressable onPress={() => setFiltersOpen(false)} style={styles.sheetDone}><Text style={styles.sheetDoneText}>Show {num(filtered.length)} jobs</Text></Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <View style={styles.safe}>
      {FiltersSheet}
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
  headerPad: { paddingHorizontal: spacing.xl },
  count: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2, marginBottom: 12 },
  countStrong: { color: '#166534', fontFamily: fontFamilies.bodyBold },
  regionRow: { paddingHorizontal: spacing.xl, gap: 8, paddingBottom: 12 },
  regionTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: pilot.line, backgroundColor: pilot.surface },
  regionTabOn: { backgroundColor: pilot.navy, borderColor: pilot.navy },
  regionText: { fontSize: fontSizes.sm, color: pilot.ink, fontFamily: fontFamilies.bodySemiBold },
  regionTextOn: { color: '#FFFFFF' },
  regionCount: { fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.body },
  regionCountOn: { color: 'rgba(255,255,255,0.8)' },
  railRow: { paddingHorizontal: spacing.xl, gap: 8, paddingBottom: 10, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: pilot.line, backgroundColor: pilot.surface },
  chipWide: { justifyContent: 'center', paddingVertical: 11 },
  chipOn: { backgroundColor: pilot.navy, borderColor: pilot.navy },
  chipText: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.bodyMedium },
  chipTextOn: { color: '#FFFFFF' },
  sortWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortLabel: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body },
  appliedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: spacing.xl, paddingBottom: 10 },
  appliedChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: pilot.navy, backgroundColor: 'rgba(0,63,136,0.06)' },
  appliedText: { fontSize: 12, color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },
  clearAll: { fontSize: 12.5, color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },
  emptyProf: { marginHorizontal: spacing.xl, marginBottom: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#F5E0B8', backgroundColor: '#FEF9EC' },
  emptyProfText: { fontSize: fontSizes.sm, color: pilot.ink, fontFamily: fontFamilies.body, lineHeight: 19 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: pilot.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.xl, maxHeight: '85%' },
  sheetGrip: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: pilot.line, marginBottom: 12 },
  sheetTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.xl, color: pilot.ink, marginBottom: 14 },
  sheetFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: pilot.line, marginTop: 4 },
  sheetDone: { backgroundColor: pilot.navy, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 },
  sheetDoneText: { color: '#FFFFFF', fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: 18, paddingBottom: 6 },
  groupLabel: { fontSize: 11.5, letterSpacing: 0.6, color: pilot.ink, fontFamily: fontFamilies.bodyBold, textTransform: 'uppercase' },
  groupHint: { fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.body },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: 4 },
  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes['3xl'], color: pilot.ink, marginBottom: 4 },
  subtitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, marginTop: 2 },


  // stretch → the toggle is always exactly as tall as the select beside it.
  // A#8 — a filter CHIP (pill, like the region/segment chips elsewhere), not the
  // old square button that read as a form control.

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

  center: { alignItems: 'center', paddingVertical: 60, gap: 10, paddingHorizontal: spacing.xl },
  loadingText: { color: pilot.navy, fontSize: fontSizes.base, fontFamily: fontFamilies.body },
  emptyTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.xl, color: pilot.ink },
  emptyText: { fontSize: fontSizes.base, color: pilot.muted, fontFamily: fontFamilies.body, textAlign: 'center', lineHeight: 22 },
});
