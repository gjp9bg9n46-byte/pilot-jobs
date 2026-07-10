// Airlines list — mirrors frontend/src/pages/Airlines.jsx. Pilot editorial-light.
// GET /airlines { q, region, hiringStatus, sort, page, limit:24 } →
// { items, total, page, totalPages }. Search + region + hiring + sort + pagination.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import api from '../../../src/lib/api';
import AirlineLogo from '../../../src/components/AirlineLogo';
import { SelectField, TextField } from '../../../src/components/ui';
import { HIRING_STATUSES, REGIONS, SORT_OPTIONS, hiringMeta } from '../../../src/lib/airlineFormat';
import { fontFamilies, fontSizes, pilot, spacing } from '../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../src/theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Airline = Record<string, any>;
const REGION_OPTS: [string, string][] = [['', 'All Regions'], ...REGIONS.map((r) => [r, r] as [string, string])];

export default function Airlines() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const [hiringStatus, setHiringStatus] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Airline[]; total: number; page: number; totalPages: number }>({ items: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  const fetchAirlines = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { sort, page, limit: 24 };
      if (q) params.q = q;
      if (region) params.region = region;
      if (hiringStatus) params.hiringStatus = hiringStatus;
      const { data: res } = await api.get('/airlines', { params });
      setData(res);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [q, region, hiringStatus, sort, page]);

  useEffect(() => { fetchAirlines(); }, [fetchAirlines]);
  useEffect(() => { setPage(1); }, [q, region, hiringStatus, sort]);

  const renderCard = ({ item: a }: { item: Airline }) => {
    // No badge when hiring status is unknown — grey "Unknown" pills are noise.
    const known = a.hiringStatus && a.hiringStatus !== 'UNKNOWN';
    const badge = known ? hiringMeta(a.hiringStatus) : null;
    return (
      <Pressable style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 }]} onPress={() => router.push(`/airlines/${a.id}`)}>
        <View style={styles.cardHead}>
          <View style={styles.cardHeadLeft}>
            <AirlineLogo logoUrl={a.logoUrl} iataCode={a.iataCode} name={a.name} box={56} bare />
            <Text style={styles.name} numberOfLines={2}>{a.name}</Text>
          </View>
          {a.iataCode ? <Text style={styles.iata}>{a.iataCode}</Text> : null}
        </View>
        <View style={styles.meta}>
          <Text style={styles.metaItem}>{a.country}</Text>
          <Text style={styles.metaItem}>· {a.region}</Text>
          {a.fleet?.length > 0 ? <Text style={styles.metaItem}>· {a.fleet.length} type{a.fleet.length !== 1 ? 's' : ''}</Text> : null}
        </View>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: badge.bg }]}><Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text></View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={loading ? [] : data.items}
        keyExtractor={(a) => a.id}
        renderItem={renderCard}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Text style={styles.h1}>Airlines</Text>
            <Text style={styles.subtitle}>Who's hiring, what they fly, what they pay.</Text>
            <TextField label="" placeholder="Search airlines…" value={q} onChangeText={setQ} autoCapitalize="none" containerStyle={{ marginBottom: 10 }} />
            <View style={styles.filters}>
              <View style={{ flex: 1 }}><SelectField label="" value={region} options={REGION_OPTS} placeholder="All Regions" onSelect={setRegion} /></View>
              <View style={{ flex: 1 }}><SelectField label="" value={hiringStatus} options={HIRING_STATUSES} placeholder="All Statuses" onSelect={setHiringStatus} /></View>
              <View style={{ flex: 1 }}><SelectField label="" value={sort} options={SORT_OPTIONS} onSelect={setSort} /></View>
            </View>
            {!loading && data.total > 0 ? <Text style={styles.count}>{data.total} airline{data.total !== 1 ? 's' : ''}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? <View style={styles.center}><ActivityIndicator color={pilot.navy} /></View>
            : <View style={styles.center}><Text style={styles.empty}>No airlines found.</Text></View>
        }
        ListFooterComponent={
          !loading && data.totalPages > 1 ? (
            <View style={styles.pager}>
              <Pressable disabled={page <= 1} style={[styles.pageBtn, page <= 1 && styles.pageBtnOff]} onPress={() => setPage((p) => p - 1)}><Text style={styles.pageBtnText}>← Previous</Text></Pressable>
              <Text style={styles.pageInfo}>Page {data.page} of {data.totalPages}</Text>
              <Pressable disabled={page >= data.totalPages} style={[styles.pageBtn, page >= data.totalPages && styles.pageBtnOff]} onPress={() => setPage((p) => p + 1)}><Text style={styles.pageBtnText}>Next →</Text></Pressable>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  list: { padding: spacing.xl, paddingBottom: 40 },
  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes['3xl'], color: pilot.ink, marginBottom: 4 },
  subtitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, marginBottom: 20 },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  count: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginBottom: 12, marginTop: 4 },
  center: { alignItems: 'center', paddingVertical: 60 },
  empty: { color: pilot.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.base },
  card: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 18, marginBottom: 14, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  name: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodyBold, color: pilot.ink, flex: 1, lineHeight: 20 },
  iata: { fontSize: 11, fontFamily: fontFamilies.mono, fontWeight: '700', color: pilot.navy, backgroundColor: 'rgba(0,63,136,0.08)', borderWidth: 1, borderColor: 'rgba(0,63,136,0.2)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaItem: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: fontFamilies.bodyBold },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
  pageBtn: { borderWidth: 1, borderColor: pilot.navy, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 9 },
  pageBtnOff: { opacity: 0.4, borderColor: pilot.line },
  pageBtnText: { color: pilot.navy, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },
  pageInfo: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body },
});
