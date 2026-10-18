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
import { fontFamilies, spacing } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const REGIONS = ['All', 'Middle East', 'Europe', 'Asia-Pacific', 'Americas', 'Africa'];

export default function AirlinesList() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const clearance = useTabBarClearance();

  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('All');
  const [data, setData] = useState<Any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { const t = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    try {
      const { data: res } = await api.get('/airlines', {
        params: { sort: 'openJobs', limit: 50, ...(search ? { q: search } : {}), ...(region !== 'All' ? { region } : {}) },
      });
      setData(res);
    } catch { /* leave the last good list on screen */ }
    finally { setLoading(false); }
  }, [search, region]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const hiring = useMemo(
    () => (data.items || []).filter((a: Any) => a.hiringStatus === 'ACTIVELY_HIRING').length,
    [data.items],
  );

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: clearance }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pilot.navy} />}
      >
        <Text style={styles.h1}>Airlines</Text>
        <Text style={styles.sub}>Fact files, checked against your licence</Text>

        {/* Jobs | Airlines — both live under the Jobs tab, so no sixth tab. */}
        <View style={styles.seg}>
          <Pressable style={styles.segBtn} onPress={() => router.replace('/jobs')}>
            <Text style={styles.segText}>Jobs</Text>
          </Pressable>
          <Pressable style={[styles.segBtn, styles.segOn]}>
            <Text style={[styles.segText, styles.segTextOn]}>Airlines</Text>
          </Pressable>
        </View>

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
            <Pressable key={r} onPress={() => setRegion(r)} style={[styles.chip, region === r && styles.chipOn]}>
              <Text style={[styles.chipText, region === r && styles.chipTextOn]}>{r}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.meta}>
          <Text style={styles.metaText}><Text style={styles.metaStrong}>Hiring now</Text> first</Text>
          <Text style={styles.metaText}>
            {loading ? 'Loading…' : `${data.total} airline${data.total === 1 ? '' : 's'}${hiring ? ` · ${hiring} hiring` : ''}`}
          </Text>
        </View>

        {loading && !(data.items || []).length ? <ActivityIndicator color={pilot.navy} style={{ marginTop: 24 }} /> : null}

        {(data.items || []).map((a: Any) => {
          const jobs = a.jobs || { open: 0, qualify: 0, matchable: false };
          const fleet = shortFleet(a.fleet);
          return (
            <Pressable key={a.id} style={styles.card} onPress={() => router.push(`/airlines/${a.id}`)}>
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
            </Pressable>
          );
        })}

        {!loading && !(data.items || []).length ? (
          <Text style={styles.empty}>No airlines match that search.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  content: { padding: spacing.xl, paddingTop: 10 },
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
