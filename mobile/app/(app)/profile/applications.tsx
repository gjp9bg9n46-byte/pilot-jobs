// My Applications — full list from GET /jobs/applications (sorted appliedAt desc
// by the server). Pushed above the tab bar. FlatList; tap a row → job detail.
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { APP_STATUS, appliedAgo } from '../../../src/lib/profileLabels';
import { fontFamilies, fontSizes, pilot, spacing } from '../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../src/theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;
function slugify(s: string) { return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

export default function Applications() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [apps, setApps] = useState<Any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/jobs/applications').then(({ data }) => setApps(data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const renderItem = ({ item: a }: { item: Any }) => {
    const st = APP_STATUS[a.status] || { label: a.status, color: pilot.muted, bg: '#F1F1F1' };
    const slug = `${slugify(a.job.company)}-${slugify(a.job.role || a.job.title)}-${a.job.id}`;
    return (
      <Pressable style={styles.card} onPress={() => router.push(`/jobs/${slug}`)}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>{a.job.title}</Text>
          <Text style={styles.company}>{a.job.company}</Text>
          {a.job.location ? <Text style={styles.meta}>{a.job.location}</Text> : null}
          <Text style={styles.ago}>{appliedAgo(a.appliedAt)}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: st.bg }]}><Text style={[styles.statusPillText, { color: st.color }]}>{st.label}</Text></View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}><Ionicons name="close" size={22} color={pilot.ink} /></Pressable>
        <Text style={styles.topTitle}>My Applications</Text>
        <View style={{ width: 32 }} />
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={pilot.navy} /></View>
      ) : (
        <FlatList
          data={apps}
          keyExtractor={(a) => a.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.center}><Text style={styles.empty}>You haven't applied to any jobs yet.</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: pilot.line },
  backBtn: { width: 32 },
  topTitle: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.md, color: pilot.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  empty: { color: pilot.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.base, textAlign: 'center' },
  list: { padding: spacing.xl },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 16, marginBottom: 12 },
  title: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.base, color: pilot.ink, lineHeight: 20 },
  company: { fontSize: fontSizes.sm, color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, marginTop: 3 },
  meta: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2 },
  ago: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 4 },
  statusPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  statusPillText: { fontSize: 11, fontFamily: fontFamilies.bodyBold },
});
