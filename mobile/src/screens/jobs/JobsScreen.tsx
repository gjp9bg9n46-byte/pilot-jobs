import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl, Modal,
  ScrollView, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jobApi } from '../../services/api';
import { setJobs, appendJobs, setSavedIds, toggleSavedId } from '../../store';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { timeAgo, formatSalary } from '../../utils/format';
import {
  type Job, type SortOption, type FilterState,
  DEFAULT_FILTERS, SORT_LABELS, activeFilterCount,
  COMMON_AUTHORITIES, REGIONS, ROLES, CONTRACT_TYPES, POSTED_WITHIN,
} from '../../types/job';

const HISTORY_KEY = '@pilotjobs/search_history';
const SORT_KEY = '@pilotjobs/jobs_sort';

// ─── Filter sheet ─────────────────────────────────────────────────────────────

function FilterSheet({
  visible, initial, onApply, onClose,
}: {
  visible: boolean;
  initial: FilterState;
  onApply: (f: FilterState) => void;
  onClose: () => void;
}) {
  const [tmp, setTmp] = useState<FilterState>(initial);

  useEffect(() => { if (visible) setTmp(initial); }, [visible]);

  const toggleAuthority = (a: string) => {
    setTmp((f) => ({
      ...f,
      authorities: f.authorities.includes(a) ? f.authorities.filter((x) => x !== a) : [...f.authorities, a],
    }));
  };

  const pick = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    setTmp((f) => ({ ...f, [key]: f[key] === value ? (Array.isArray(value) ? [] : '') as FilterState[K] : value }));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={fs.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={fs.sheet}>
            {/* Header */}
            <View style={fs.header}>
              <Text style={fs.title}>Filters</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color="#7A8CA0" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              {/* Authority */}
              <Text style={fs.label}>Authority</Text>
              <View style={fs.chipRow}>
                {COMMON_AUTHORITIES.map((a) => (
                  <TouchableOpacity
                    key={a}
                    style={[fs.chip, tmp.authorities.includes(a) && fs.chipActive]}
                    onPress={() => toggleAuthority(a)}
                  >
                    <Text style={[fs.chipText, tmp.authorities.includes(a) && fs.chipTextActive]}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Aircraft type */}
              <Text style={fs.label}>Aircraft Type</Text>
              <TextInput
                style={fs.input}
                value={tmp.aircraft}
                onChangeText={(v) => setTmp((f) => ({ ...f, aircraft: v }))}
                placeholder="e.g. B737, A320"
                placeholderTextColor="#4A6080"
              />

              {/* Region */}
              <Text style={fs.label}>Region</Text>
              <View style={fs.chipRow}>
                {REGIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[fs.chip, tmp.region === r && fs.chipActive]}
                    onPress={() => pick('region', r)}
                  >
                    <Text style={[fs.chipText, tmp.region === r && fs.chipTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Role */}
              <Text style={fs.label}>Role</Text>
              <View style={fs.chipRow}>
                {ROLES.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[fs.chip, tmp.role === r && fs.chipActive]}
                    onPress={() => pick('role', r)}
                  >
                    <Text style={[fs.chipText, tmp.role === r && fs.chipTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Contract type */}
              <Text style={fs.label}>Contract Type</Text>
              <View style={fs.chipRow}>
                {CONTRACT_TYPES.map(({ value, label }) => (
                  <TouchableOpacity
                    key={value}
                    style={[fs.chip, tmp.contractType === value && fs.chipActive]}
                    onPress={() => pick('contractType', value)}
                  >
                    <Text style={[fs.chipText, tmp.contractType === value && fs.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Max hours required */}
              <Text style={fs.label}>Max hours required by job</Text>
              <TextInput
                style={fs.input}
                value={tmp.maxReqHours}
                onChangeText={(v) => setTmp((f) => ({ ...f, maxReqHours: v.replace(/\D/g, '') }))}
                placeholder="e.g. 5000"
                placeholderTextColor="#4A6080"
                keyboardType="number-pad"
              />

              {/* Min salary */}
              <Text style={fs.label}>Minimum salary (USD/year)</Text>
              <TextInput
                style={fs.input}
                value={tmp.salaryMin}
                onChangeText={(v) => setTmp((f) => ({ ...f, salaryMin: v.replace(/\D/g, '') }))}
                placeholder="e.g. 80000"
                placeholderTextColor="#4A6080"
                keyboardType="number-pad"
              />

              {/* Posted within */}
              <Text style={fs.label}>Posted within</Text>
              <View style={fs.chipRow}>
                {POSTED_WITHIN.map(({ value, label }) => (
                  <TouchableOpacity
                    key={value}
                    style={[fs.chip, tmp.postedWithin === value && fs.chipActive]}
                    onPress={() => setTmp((f) => ({ ...f, postedWithin: value }))}
                  >
                    <Text style={[fs.chipText, tmp.postedWithin === value && fs.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={fs.footer}>
              <TouchableOpacity style={fs.clearBtn} onPress={() => setTmp(DEFAULT_FILTERS)}>
                <Text style={fs.clearBtnText}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={fs.applyBtn} onPress={() => onApply(tmp)}>
                <Text style={fs.applyBtnText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Sort dropdown ─────────────────────────────────────────────────────────────

function SortDropdown({
  visible, current, onChange, onClose,
}: {
  visible: boolean;
  current: SortOption;
  onChange: (s: SortOption) => void;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={sd.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={sd.dropdown}>
        {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
          <TouchableOpacity
            key={opt}
            style={sd.row}
            onPress={() => { onChange(opt); onClose(); }}
          >
            {current === opt && <Ionicons name="checkmark" size={16} color="#00B4D8" style={{ marginRight: 8 }} />}
            {current !== opt && <View style={{ width: 24 }} />}
            <Text style={[sd.rowText, current === opt && sd.rowTextActive]}>{SORT_LABELS[opt]}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}

// ─── Job card ─────────────────────────────────────────────────────────────────

function JobCard({
  job, savedIds, onPress, onSave,
}: {
  job: Job;
  savedIds: string[];
  onPress: () => void;
  onSave: () => void;
}) {
  const isSaved = savedIds.includes(job.id);
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod);
  const authorities = job.reqAuthorities?.join(', ');

  return (
    <TouchableOpacity style={jc.card} onPress={onPress} activeOpacity={0.8}>
      <View style={jc.topRow}>
        <Text style={jc.title} numberOfLines={2}>{job.title}</Text>
        <TouchableOpacity onPress={onSave} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={22} color={isSaved ? '#FF4757' : '#4A6080'} />
        </TouchableOpacity>
      </View>

      <Text style={jc.company}>{job.company}</Text>

      <View style={jc.metaRow}>
        {(job.location || job.country) ? (
          <View style={jc.metaItem}>
            <Ionicons name="location-outline" size={13} color="#7A8CA0" />
            <Text style={jc.metaText} numberOfLines={1}>{job.location || job.country}</Text>
          </View>
        ) : null}
        {job.reqMinTotalHours ? (
          <View style={jc.metaItem}>
            <Ionicons name="time-outline" size={13} color="#7A8CA0" />
            <Text style={jc.metaText}>Min {job.reqMinTotalHours.toLocaleString()} hrs</Text>
          </View>
        ) : null}
      </View>

      <View style={jc.bottomRow}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {authorities ? (
            <View style={jc.badge}>
              <Text style={jc.badgeText}>{authorities}</Text>
            </View>
          ) : null}
          {salary ? (
            <View style={[jc.badge, jc.salaryBadge]}>
              <Text style={[jc.badgeText, jc.salaryText]}>{salary}</Text>
            </View>
          ) : null}
          {job.isApplied ? (
            <View style={[jc.badge, jc.appliedBadge]}>
              <Ionicons name="checkmark-circle" size={11} color="#2ECC71" />
              <Text style={[jc.badgeText, jc.appliedText]}>Applied</Text>
            </View>
          ) : null}
        </View>
        <Text style={jc.postedAgo}>{timeAgo(job.postedAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function JobsScreen({ navigation }: any) {
  const dispatch = useAppDispatch();
  const jobs = useAppSelector((s) => s.jobs.list) as Job[];
  const total = useAppSelector((s) => s.jobs.total);
  const savedIds = useAppSelector((s) => s.jobs.savedIds);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>('newest');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const filterCount = activeFilterCount(filters);

  // Load persisted sort on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HISTORY_KEY);
        if (raw) setHistory(JSON.parse(raw));
        const saved = await AsyncStorage.getItem(SORT_KEY);
        if (saved) setSort(saved as SortOption);
      } catch {}
    })();
  }, []);

  // Debounce search input 250 ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Fetch on any filter/sort/search change
  useEffect(() => { fetchJobs(1, false, false); }, [debouncedQ, qualifiedOnly, sort, filters]);

  const buildParams = (targetPage: number) => {
    const p: Record<string, any> = { page: targetPage, limit: 20, sort };
    if (debouncedQ) p.q = debouncedQ;
    if (qualifiedOnly) p.qualifiedOnly = 'true';
    if (filters.authorities.length) p.authority = filters.authorities.join(',');
    if (filters.aircraft) p.aircraft = filters.aircraft;
    if (filters.region) p.region = filters.region;
    if (filters.role) p.role = filters.role;
    if (filters.contractType) p.contractType = filters.contractType;
    if (filters.maxReqHours) p.maxReqHours = filters.maxReqHours;
    if (filters.salaryMin) p.salaryMin = filters.salaryMin;
    if (filters.postedWithin) p.postedWithin = filters.postedWithin;
    return p;
  };

  const fetchJobs = async (targetPage: number, append = false, refresh = false) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (refresh) setRefreshing(true);
    else if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');

    // Animate progress bar for non-append loads
    if (!append) {
      progressAnim.setValue(0);
      Animated.timing(progressAnim, { toValue: 0.85, duration: 800, useNativeDriver: false }).start();
    }

    try {
      const { data } = await jobApi.list(buildParams(targetPage), ctrl.signal);

      if (append) {
        dispatch(appendJobs({ jobs: data.jobs, total: data.total }));
      } else {
        dispatch(setJobs({ jobs: data.jobs, total: data.total }));
        // Seed saved IDs from first page
        const newSavedIds = data.jobs.filter((j: Job) => j.isSaved).map((j: Job) => j.id);
        if (newSavedIds.length) dispatch(setSavedIds(newSavedIds));
      }

      setPage(targetPage);
      setHasMore(targetPage < data.pages);

      if (!append && debouncedQ.trim()) saveHistory(debouncedQ.trim());
    } catch (err: any) {
      const isCanceled = err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';
      if (!isCanceled) setError('Could not load jobs. Pull down to retry.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
      Animated.timing(progressAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    }
  };

  const saveHistory = async (term: string) => {
    try {
      const next = [term, ...history.filter((h) => h !== term)].slice(0, 8);
      setHistory(next);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {}
  };

  const handleSortChange = async (s: SortOption) => {
    setSort(s);
    await AsyncStorage.setItem(SORT_KEY, s).catch(() => {});
  };

  const handleSaveToggle = async (job: Job) => {
    dispatch(toggleSavedId(job.id));
    try {
      if (savedIds.includes(job.id)) await jobApi.unsaveJob(job.id);
      else await jobApi.saveJob(job.id);
    } catch {
      dispatch(toggleSavedId(job.id)); // revert on error
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && !loading && hasMore) fetchJobs(page + 1, true, false);
  };

  const suggestions = q
    ? history.filter((h) => h.toLowerCase().startsWith(q.toLowerCase()) && h !== q)
    : history;

  const activeChips: { key: string; label: string; clear: () => void }[] = [
    ...filters.authorities.map((a) => ({
      key: `auth_${a}`,
      label: a,
      clear: () => setFilters((f) => ({ ...f, authorities: f.authorities.filter((x) => x !== a) })),
    })),
    ...(filters.aircraft ? [{ key: 'aircraft', label: `Aircraft: ${filters.aircraft}`, clear: () => setFilters((f) => ({ ...f, aircraft: '' })) }] : []),
    ...(filters.region ? [{ key: 'region', label: `Region: ${filters.region}`, clear: () => setFilters((f) => ({ ...f, region: '' })) }] : []),
    ...(filters.role ? [{ key: 'role', label: `Role: ${filters.role}`, clear: () => setFilters((f) => ({ ...f, role: '' })) }] : []),
    ...(filters.contractType ? [{ key: 'ct', label: CONTRACT_TYPES.find((c) => c.value === filters.contractType)?.label ?? filters.contractType, clear: () => setFilters((f) => ({ ...f, contractType: '' })) }] : []),
    ...(filters.maxReqHours ? [{ key: 'hrs', label: `≤${filters.maxReqHours} hrs req.`, clear: () => setFilters((f) => ({ ...f, maxReqHours: '' })) }] : []),
    ...(filters.salaryMin ? [{ key: 'sal', label: `Salary ≥${Number(filters.salaryMin).toLocaleString()}`, clear: () => setFilters((f) => ({ ...f, salaryMin: '' })) }] : []),
    ...(filters.postedWithin ? [{ key: 'pw', label: POSTED_WITHIN.find((p) => p.value === filters.postedWithin)?.label ?? `Last ${filters.postedWithin}d`, clear: () => setFilters((f) => ({ ...f, postedWithin: '' })) }] : []),
  ];

  const renderFooter = () => {
    if (loadingMore) return <ActivityIndicator color="#00B4D8" style={{ marginVertical: 20 }} />;
    if (!hasMore && jobs.length > 0) return <Text style={s.endText}>All {total} jobs loaded</Text>;
    return null;
  };

  return (
    <View style={s.container}>
      {/* Search bar */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={18} color="#4A6080" style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder="Airlines, aircraft, country..."
          placeholderTextColor="#4A6080"
          value={q}
          onChangeText={(v) => { setQ(v); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          returnKeyType="search"
          onSubmitEditing={() => { setShowSuggestions(false); if (q.trim()) saveHistory(q.trim()); }}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {q ? (
          <TouchableOpacity onPress={() => { setQ(''); setDebouncedQ(''); }}>
            <Ionicons name="close-circle" size={18} color="#4A6080" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Suggestions panel */}
      {showSuggestions && suggestions.length > 0 && (
        <View style={s.suggestions}>
          {suggestions.map((h) => (
            <TouchableOpacity
              key={h}
              style={s.suggRow}
              onPress={() => { setQ(h); setDebouncedQ(h); setShowSuggestions(false); }}
            >
              <Ionicons name="time-outline" size={14} color="#4A6080" />
              <Text style={s.suggText}>{h}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Toolbar row */}
      <View style={s.toolbar}>
        <TouchableOpacity style={[s.toolBtn, qualifiedOnly && s.toolBtnActive]} onPress={() => setQualifiedOnly((v) => !v)}>
          <Ionicons name="checkmark-circle-outline" size={15} color={qualifiedOnly ? '#0A1628' : '#7A8CA0'} />
          <Text style={[s.toolBtnText, qualifiedOnly && s.toolBtnTextActive]}>Qualified</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity style={s.toolBtn} onPress={() => setShowSort(true)}>
          <Ionicons name="swap-vertical-outline" size={15} color="#7A8CA0" />
          <Text style={s.toolBtnText}>{SORT_LABELS[sort].split(':')[0]}</Text>
          <Ionicons name="chevron-down" size={12} color="#7A8CA0" />
        </TouchableOpacity>

        <TouchableOpacity style={[s.toolBtn, filterCount > 0 && s.toolBtnActive]} onPress={() => setShowFilters(true)}>
          <Ionicons name="options-outline" size={15} color={filterCount > 0 ? '#0A1628' : '#7A8CA0'} />
          <Text style={[s.toolBtnText, filterCount > 0 && s.toolBtnTextActive]}>
            Filters{filterCount > 0 ? ` (${filterCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsScroll} contentContainerStyle={s.chips}>
          {activeChips.map((chip) => (
            <TouchableOpacity key={chip.key} style={s.activeChip} onPress={chip.clear}>
              <Text style={s.activeChipText}>{chip.label}</Text>
              <Ionicons name="close" size={12} color="#00B4D8" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Progress bar */}
      {loading && (
        <Animated.View style={[s.progressBar, { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      )}

      {/* List */}
      {loading && jobs.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator color="#00B4D8" size="large" />
          <Text style={s.centerText}>Finding jobs for you...</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Ionicons name="cloud-offline-outline" size={44} color="#4A6080" />
          <Text style={s.centerTitle}>Connection error</Text>
          <Text style={s.centerSub}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => fetchJobs(1, false, false)}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchJobs(1, false, true)} tintColor="#00B4D8" />
          }
          renderItem={({ item }) => (
            <JobCard
              job={item}
              savedIds={savedIds}
              onPress={() => navigation.navigate('JobDetail', { job: item })}
              onSave={() => handleSaveToggle(item)}
            />
          )}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="search-outline" size={44} color="#4A6080" />
              <Text style={s.centerTitle}>No jobs found</Text>
              <Text style={s.centerSub}>
                {filterCount > 0 || q ? 'Try adjusting your search or filters.' : 'Complete your profile to see matching jobs.'}
              </Text>
              {(filterCount > 0 || q) && (
                <TouchableOpacity style={s.retryBtn} onPress={() => { setFilters(DEFAULT_FILTERS); setQ(''); }}>
                  <Text style={s.retryText}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}

      {/* Modals */}
      <FilterSheet
        visible={showFilters}
        initial={filters}
        onApply={(f) => { setFilters(f); setShowFilters(false); }}
        onClose={() => setShowFilters(false)}
      />
      <SortDropdown
        visible={showSort}
        current={sort}
        onChange={handleSortChange}
        onClose={() => setShowSort(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#0A1628' },
  searchWrap:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1B2B4B', borderRadius: 10, marginHorizontal: 16, marginTop: 16, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchIcon:    {},
  searchInput:   { flex: 1, color: '#fff', fontSize: 14, padding: 0 },
  suggestions:   { backgroundColor: '#1B2B4B', marginHorizontal: 16, borderRadius: 10, overflow: 'hidden', zIndex: 10 },
  suggRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#243050' },
  suggText:      { color: '#C0CDE0', fontSize: 13 },
  toolbar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 10, gap: 8 },
  toolBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1B2B4B', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  toolBtnActive: { backgroundColor: '#00B4D8' },
  toolBtnText:   { color: '#7A8CA0', fontSize: 12, fontWeight: '600' },
  toolBtnTextActive: { color: '#0A1628' },
  chipsScroll:   { maxHeight: 44 },
  chips:         { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  activeChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0D2040', borderWidth: 1, borderColor: '#00B4D8', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  activeChipText: { color: '#00B4D8', fontSize: 11, fontWeight: '600' },
  progressBar:   { height: 2, backgroundColor: '#00B4D8', marginTop: 6 },
  center:        { alignItems: 'center', marginTop: 60, paddingHorizontal: 32, gap: 10 },
  centerTitle:   { color: '#fff', fontSize: 17, fontWeight: '700' },
  centerText:    { color: '#7A8CA0', fontSize: 14, marginTop: 8 },
  centerSub:     { color: '#7A8CA0', fontSize: 13, textAlign: 'center' },
  retryBtn:      { marginTop: 8, backgroundColor: '#1B2B4B', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText:     { color: '#00B4D8', fontWeight: '700', fontSize: 14 },
  endText:       { color: '#4A6080', fontSize: 12, textAlign: 'center', padding: 20 },
});

const jc = StyleSheet.create({
  card:      { backgroundColor: '#1B2B4B', borderRadius: 14, padding: 16, marginHorizontal: 16, marginTop: 10 },
  topRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  title:     { flex: 1, color: '#fff', fontWeight: '700', fontSize: 15, lineHeight: 21 },
  company:   { color: '#00B4D8', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  metaRow:   { flexDirection: 'row', gap: 14, marginBottom: 10 },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:  { color: '#7A8CA0', fontSize: 12 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#0A2040', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  badgeText: { color: '#00B4D8', fontSize: 11, fontWeight: '700' },
  salaryBadge: { backgroundColor: '#0D2A10' },
  salaryText:  { color: '#2ECC71' },
  appliedBadge: { backgroundColor: '#0D2A10' },
  appliedText:  { color: '#2ECC71' },
  postedAgo: { color: '#4A6080', fontSize: 11 },
});

const fs = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:    { backgroundColor: '#0E1E34', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#243050' },
  title:    { color: '#fff', fontSize: 17, fontWeight: '700' },
  label:    { color: '#7A8CA0', fontSize: 12, fontWeight: '600', marginTop: 20, marginBottom: 8, paddingHorizontal: 20 },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 },
  chip:     { borderRadius: 8, borderWidth: 1, borderColor: '#243050', paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: '#00B4D8', borderColor: '#00B4D8' },
  chipText: { color: '#7A8CA0', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#0A1628' },
  input:    { backgroundColor: '#1B2B4B', color: '#fff', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginHorizontal: 20 },
  footer:   { flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1, borderTopColor: '#243050' },
  clearBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#243050', padding: 14, alignItems: 'center' },
  clearBtnText: { color: '#7A8CA0', fontWeight: '700', fontSize: 14 },
  applyBtn: { flex: 2, backgroundColor: '#00B4D8', borderRadius: 10, padding: 14, alignItems: 'center' },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

const sd = StyleSheet.create({
  backdrop:  { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  dropdown:  { position: 'absolute', top: 130, right: 16, backgroundColor: '#1B2B4B', borderRadius: 12, paddingVertical: 6, minWidth: 200, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  row:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  rowText:   { color: '#C0CDE0', fontSize: 14 },
  rowTextActive: { color: '#00B4D8', fontWeight: '700' },
});
