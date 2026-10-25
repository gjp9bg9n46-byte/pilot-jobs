// Airlines — fact files, checked against the pilot's licence. Same design as
// the mobile web page at 390 px (docs/design/airlines-mockup.html).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../src/lib/api';
import { HiringPill, LogoTile } from '../../../../src/components/airlines/AirlineBits';
import { shortFleet } from '../../../../src/lib/airlineFacts';
import { useTabBarClearance } from '../../../../src/theme/tabBar';
import { fontFamilies, spacing, layout } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';
import { FlashList } from '@shopify/flash-list';
import { useAirlines } from '../../../../src/hooks/queries';
import { CardListSkeleton } from '../../../../src/components/Skeleton';
import PressableScale from '../../../../src/components/PressableScale';
import Segmented from '../../../../src/components/Segmented';
import { tapLight } from '../../../../src/lib/haptics';
import { withErrorBoundary } from '../../../../src/components/ErrorBoundary';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const REGIONS = ['All', 'Middle East', 'Europe', 'Asia-Pacific', 'Americas', 'Africa'];

function AirlinesList() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const clearance = useTabBarClearance();

  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { const t = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  // Search text and region are part of the cache key, so a search you ran a
  // moment ago comes back instantly while the fresh answer loads behind it.
  const query = useMemo(() => ({
    sort: 'openJobs', limit: 50,
    ...(search ? { q: search } : {}),
    ...(region !== 'All' ? { region } : {}),
  }), [search, region]);
  const { data: res, isPending, refetch } = useAirlines(query);
  const data: Any = res ?? { items: [], total: 0 };
  const loading = isPending;
  const onRefresh = useCallback(async () => { setRefreshing(true); tapLight(); await refetch(); setRefreshing(false); }, [refetch]);

  const hiring = useMemo(
    () => (data.items || []).filter((a: Any) => a.hiringStatus === 'ACTIVELY_HIRING').length,
    [data.items],
  );

  // The page header travels as the list header, so FlashList owns the scroll:
  // a list nested in a ScrollView cannot virtualise, which is what made a long
  // airline list stutter.
  const ListHeader = (
    <View>
      <Text style={styles.h1}>Airlines</Text>
      <Text style={styles.sub}>Fact files, checked against your licence</Text>

      {/* Jobs | Airlines — both live under the Jobs tab, so no sixth tab. */}
      <Segmented
        style={{ marginTop: 14 }}
        value="airlines"
        onChange={(v) => { if (v === 'jobs') router.replace('/jobs'); }}
        options={[{ value: 'jobs', label: 'Jobs' }, { value: 'airlines', label: 'Airlines' }]}
      />

      <View style={styles.search}>
        <Ionicons name="search" size={16} color={pilot.faint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Airline, country or aircraft type"
          placeholderTextColor={pilot.faint}
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ gap: 6 }}>
        {REGIONS.map((r) => (
          <Pressable key={r} onPress={() => { tapLight(); setRegion(r); }} style={[styles.chip, region === r && styles.chipOn]}>
            <Text style={[styles.chipText, region === r && styles.chipTextOn]}>{r}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.meta}>
        <Text style={styles.metaText}><Text style={styles.metaStrong}>Hiring now</Text> first</Text>
        <Text style={styles.metaText}>
          {loading && !(data.items || []).length ? 'Loading…' : `${data.total} airline${data.total === 1 ? '' : 's'}${hiring ? ` · ${hiring} hiring` : ''}`}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <FlashList
        data={(data.items || []) as Any[]}
        keyExtractor={(a: Any) => a.id}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: clearance, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pilot.navy} />}
        ListEmptyComponent={loading ? <CardListSkeleton rows={6} chips={false} /> : <Text style={styles.empty}>No airlines match that search.</Text>}
        renderItem={({ item: a }: { item: Any }) => {
          const jobs = a.jobs || { open: 0, qualify: 0, matchable: false };
          const fleet = shortFleet(a.fleet);
          return (
            <PressableScale style={styles.card} onPress={() => router.push(`/airlines/${a.id}`)}>
              <LogoTile logoUrl={a.logoUrl} iataCode={a.iataCode} name={a.name} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{a.name}</Text>
                <Text style={styles.country} numberOfLines={1}>{[a.country, fleet].filter(Boolean).join(' · ')}</Text>
                <View style={styles.jobLine}>
                  <HiringPill status={a.hiringStatus} />
                  <Text style={styles.jobText}>
                    {jobs.open === 0 ? 'no open jobs' : `${jobs.open} open · `}
                    {jobs.open > 0 && (jobs.qualify > 0
                      ? <Text style={styles.jobStrong}>you qualify for {jobs.qualify}</Text>
                      : jobs.matchable ? '0 for you yet' : 'add your licence to check')}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#B7C1CE" />
            </PressableScale>
          );
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  content: { padding: layout.screenX, paddingTop: 10 },
  h1: { fontFamily: fontFamilies.display, fontSize: 30, color: pilot.ink },
  sub: { fontSize: 13.5, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2 },

  seg: { flexDirection: 'row', backgroundColor: '#E7ECF2', borderRadius: 10, padding: 3, marginTop: 12 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  segOn: { backgroundColor: pilot.surface, shadowColor: '#0F1B2D', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 13.5, fontFamily: fontFamilies.bodySemiBold, color: pilot.muted },
  segTextOn: { color: pilot.ink },

  search: { marginTop: 12, height: 44, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 14, color: pilot.ink, fontFamily: fontFamilies.body, padding: 0 },
  chips: { marginTop: 10, flexGrow: 0 },
  chip: { borderWidth: 1, borderColor: pilot.line, backgroundColor: pilot.surface, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  chipOn: { backgroundColor: pilot.navy, borderColor: pilot.navy },
  chipText: { fontSize: 12.5, fontFamily: fontFamilies.bodySemiBold, color: pilot.muted },
  chipTextOn: { color: '#fff' },

  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  metaText: { fontSize: 12.5, color: pilot.faint, fontFamily: fontFamilies.body },
  metaStrong: { color: pilot.muted, fontFamily: fontFamilies.bodySemiBold },

  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 13, marginTop: 8 },
  name: { fontSize: 15, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  country: { fontSize: 12.5, color: pilot.faint, fontFamily: fontFamilies.body, marginTop: 2 },
  jobLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  jobText: { fontSize: 12.5, color: pilot.muted, fontFamily: fontFamilies.body },
  jobStrong: { color: '#15803D', fontFamily: fontFamilies.bodySemiBold },
  empty: { textAlign: 'center', color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 40, fontSize: 14 },
});

// A render error here shows "Something went wrong · Try again" instead of
// taking the whole app down with it.
export default withErrorBoundary(AirlinesList, 'Airlines');
