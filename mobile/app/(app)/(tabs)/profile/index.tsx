// Profile view — mirrors frontend/src/pages/Profile.jsx section order:
// Flight Totals → Personal Info → Licences → Medical → Type Ratings → ELP →
// Recurrent Training → Right to Work. Plus a mobile-only "My Applications"
// section (web has no pilot applications page). Read-only; edits happen on the
// pushed /profile/edit screen. Verify banner mounts from (app)/_layout.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../src/lib/api';
import { SecondaryButton } from '../../../../src/components/ui';
import CredentialModal from '../../../../src/components/CredentialModal';
import { CREDENTIALS } from '../../../../src/lib/credentialConfigs';
import { useAuth } from '../../../../src/context/AuthContext';
import {
  APP_STATUS, AUTHORITY_LABEL, EDUCATION_LABEL, LICENCE_LABEL, MEDICAL_LABEL, ROLE_LABEL,
  appliedAgo, daysUntil, formatDate,
} from '../../../../src/lib/profileLabels';
import { fontFamilies, fontSizes, pilot, semantic, spacing } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

const TOTAL_STATS: [string, string][] = [
  ['totalTime', 'Total Hours'], ['picTime', 'PIC Hours'], ['sicTime', 'SIC Hours'],
  ['multiEngineTime', 'Multi-Engine'], ['turbineTime', 'Turbine'], ['nightTime', 'Night'],
  ['instrumentTime', 'Instrument'],
];

function slugify(s: string) { return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

function expiryColor(dateStr?: string | null): string | null {
  const d = daysUntil(dateStr);
  if (d === null) return null;
  if (d < 30) return SEM.red;
  if (d < 90) return SEM.amber;
  return null;
}

function Section({ title, subtitle, onAdd, children }: { title: string; subtitle?: string; onAdd?: () => void; children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.card}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
        {onAdd ? (
          <Pressable style={styles.addBtn} onPress={onAdd} accessibilityLabel={`Add ${title}`}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  const styles = useThemedStyles(createStyles);
  return <Text style={styles.emptyNote}>{text}</Text>;
}

function ItemRow({ title, sub, onDelete }: { title: string; sub?: React.ReactNode; onDelete?: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.item}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.itemTitle}>{title}</Text>
        {sub ? <Text style={styles.itemSub}>{sub}</Text> : null}
      </View>
      {onDelete ? (
        <Pressable onPress={onDelete} hitSlop={8} style={styles.trashBtn} accessibilityLabel="Delete">
          <Ionicons name="trash-outline" size={16} color="#991B1B" />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function ProfileView() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { logout } = useAuth();
  const [profile, setProfile] = useState<Any | null>(null);
  const [totals, setTotals] = useState<Any | null>(null);
  const [elp, setElp] = useState<Any[]>([]);
  const [recurrent, setRecurrent] = useState<Any[]>([]);
  const [rtw, setRtw] = useState<Any[]>([]);
  const [apps, setApps] = useState<Any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      api.get('/profile'), api.get('/profile/totals'), api.get('/profile/elp'),
      api.get('/profile/recurrent'), api.get('/profile/rtw'), api.get('/jobs/applications'),
    ]);
    const [p, t, e, r, w, a] = results;
    if (p.status === 'fulfilled') setProfile(p.value.data);
    if (t.status === 'fulfilled') setTotals(t.value.data);
    if (e.status === 'fulfilled') setElp(e.value.data || []);
    if (r.status === 'fulfilled') setRecurrent(r.value.data || []);
    if (w.status === 'fulfilled') setRtw(w.value.data || []);
    if (a.status === 'fulfilled') setApps(a.value.data || []);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  // Full silent refetch on every focus — the tab stays mounted, so mount-only
  // fetches go stale. This keeps totals in sync with the logbook, credentials
  // in sync with edits, and applications current.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const [activeCred, setActiveCred] = useState<string | null>(null);
  const confirmDelete = (path: string) => Alert.alert(
    'Delete record?',
    "This permanently removes the record and can't be undone.",
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.delete(path); await load(); } catch { /* ignore */ } } },
    ],
  );

  if (loading) {
    return <SafeAreaView style={styles.safe} edges={[]}><View style={styles.center}><ActivityIndicator color={pilot.navy} /><Text style={styles.loadingText}>Loading your profile...</Text></View></SafeAreaView>;
  }

  const licences = (profile?.certificates || []).filter((c: Any) => c.type !== 'ELP');
  const medicals = profile?.medicals || [];
  const ratings = profile?.ratings || [];
  const allZero = !totals || TOTAL_STATS.every(([k]) => !totals[k]);

  const jobSlug = (job: Any) => `${slugify(job.company)}-${slugify(job.role || job.title)}-${job.id}`;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pilot.navy} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.h1}>Profile</Text>
            <Text style={styles.subtitle}>Your career record — keep it current.</Text>
          </View>
          <Pressable style={styles.editBtn} onPress={() => router.push('/profile/edit')}>
            <Ionicons name="create-outline" size={16} color={pilot.navy} />
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>
        </View>

        {/* Flight Experience Totals */}
        <Section title="Flight Experience Totals" subtitle="Aggregated from your logbook">
          {allZero ? (
            <Empty text="Log flights in your logbook to see your totals here." />
          ) : (
            <View style={styles.statGrid}>
              {TOTAL_STATS.map(([key, label]) => (
                <View key={key} style={styles.statTile}>
                  <Text style={styles.statNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                    {(Number(totals?.[key]) || 0).toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        {/* Personal Information (read-only; edit via /profile/edit) */}
        <Section title="Personal Information" subtitle="Basic details on your account">
          <ItemRow title="Name" sub={[profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || '—'} />
          <ItemRow title="Phone" sub={profile?.phone || '—'} />
          <ItemRow title="Location" sub={[profile?.city, profile?.country].filter(Boolean).join(', ') || '—'} />
          <ItemRow title="Education" sub={profile?.education ? EDUCATION_LABEL[profile.education] || profile.education : '—'} />
          <ItemRow title="Role" sub={profile?.role ? ROLE_LABEL[profile.role] || profile.role : '—'} />
          <ItemRow title="Passport Expiry" sub={profile?.passportExpiry ? formatDate(profile.passportExpiry) : '—'} />
        </Section>

        {/* Licences */}
        <Section title="My Pilot Licences" subtitle="Add every licence you hold" onAdd={() => setActiveCred('licence')}>
          {licences.length === 0 ? <Empty text="No licences added yet." /> : licences.map((c: Any) => (
            <ItemRow key={c.id} title={LICENCE_LABEL[c.type] || c.type} onDelete={() => confirmDelete(CREDENTIALS.licence.deletePath(c.id))}
              sub={<>{AUTHORITY_LABEL[c.issuingAuthority] || c.issuingAuthority}{c.certificateNumber ? ` · #${c.certificateNumber}` : ''}{c.expiryDate ? ` · Exp ${formatDate(c.expiryDate)}` : ''}</>} />
          ))}
        </Section>

        {/* Medical */}
        <Section title="Medical Certificate" subtitle="Required by most airlines" onAdd={() => setActiveCred('medical')}>
          {medicals.length === 0 ? <Empty text="No medical certificate added." /> : medicals.map((m: Any) => {
            const expired = new Date(m.expiryDate) < new Date();
            return <ItemRow key={m.id} title={MEDICAL_LABEL[m.medicalClass] || m.medicalClass} onDelete={() => confirmDelete(CREDENTIALS.medical.deletePath(m.id))}
              sub={<Text style={{ color: expired ? SEM.red : (expiryColor(m.expiryDate) || SEM.green) }}>{expired ? '⚠ Expired ' : 'Valid until '}{formatDate(m.expiryDate)}</Text>} />;
          })}
        </Section>

        {/* Type Ratings */}
        <Section title="Aircraft Type Ratings" subtitle="Aircraft you are rated to fly" onAdd={() => setActiveCred('rating')}>
          {ratings.length === 0 ? <Empty text="No type ratings added." /> : ratings.map((r: Any) => (
            <ItemRow key={r.id} title={r.aircraftType} onDelete={() => confirmDelete(CREDENTIALS.rating.deletePath(r.id))}
              sub={r.hoursOnType > 0 ? `${r.hoursOnType.toLocaleString()} hrs on type` : undefined} />
          ))}
        </Section>

        {/* ELP */}
        <Section title="English Language Proficiency" subtitle="ICAO ELP — required for all international operations" onAdd={() => setActiveCred('elp')}>
          {elp.length === 0 ? <Empty text="No ELP record added. ICAO Level 4 minimum is required by most airlines." /> : elp.map((i: Any) => (
            <ItemRow key={i.id} title={`ICAO ${i.level}`} onDelete={() => confirmDelete(CREDENTIALS.elp.deletePath(i.id))}
              sub={<>{i.endorsementNumber ? `#${i.endorsementNumber}` : ''}{i.expiryDate ? ` · Exp ${formatDate(i.expiryDate)}` : (i.noExpiry || i.level === 'Level 6' ? ' · No expiry' : '')}</>} />
          ))}
        </Section>

        {/* Recurrent Training */}
        <Section title="Recurrent Training" subtitle="Track your mandatory recurrent training" onAdd={() => setActiveCred('recurrent')}>
          {recurrent.length === 0 ? <Empty text="No recurrent training records." /> : recurrent.map((i: Any) => (
            <ItemRow key={i.id} title={i.trainingType} onDelete={() => confirmDelete(CREDENTIALS.recurrent.deletePath(i.id))}
              sub={<>{i.provider ? `${i.provider} · ` : ''}Completed: {formatDate(i.completionDate)}{i.expiryDate ? ` · Exp ${formatDate(i.expiryDate)}` : ''}</>} />
          ))}
        </Section>

        {/* Right to Work */}
        <Section title="Right to Work" subtitle="Countries where you have the right to work" onAdd={() => setActiveCred('rtw')}>
          {rtw.length === 0 ? <Empty text="No right-to-work documents added." /> : rtw.map((i: Any) => (
            <ItemRow key={i.id} title={i.country} onDelete={() => confirmDelete(CREDENTIALS.rtw.deletePath(i.id))}
              sub={<>{i.documentType}{i.documentNumber ? ` · #${i.documentNumber}` : ''}{i.noExpiry ? ' · No expiry' : i.expiryDate ? ` · Exp ${formatDate(i.expiryDate)}` : ''}</>} />
          ))}
        </Section>

        {/* My Applications (mobile-only surface for GET /jobs/applications) */}
        <Section title="My Applications" subtitle={`${apps.length} application${apps.length === 1 ? '' : 's'}`}>
          {apps.length === 0 ? <Empty text="You haven't applied to any jobs yet." /> : (
            <>
              {apps.slice(0, 5).map((a: Any) => {
                const st = APP_STATUS[a.status] || { label: a.status, color: pilot.muted, bg: '#F1F1F1' };
                return (
                  <Pressable key={a.id} style={styles.appItem} onPress={() => router.push(`/jobs/${jobSlug(a.job)}`)}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.itemTitle} numberOfLines={1}>{a.job.title}</Text>
                      <Text style={styles.itemSub}>{a.job.company} · {appliedAgo(a.appliedAt)}</Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: st.bg }]}><Text style={[styles.statusPillText, { color: st.color }]}>{st.label}</Text></View>
                  </Pressable>
                );
              })}
              {apps.length > 5 ? (
                <Pressable onPress={() => router.push('/profile/applications')}><Text style={styles.viewAll}>View all {apps.length} applications →</Text></Pressable>
              ) : null}
            </>
          )}
        </Section>

        <Section title="Settings">
          <Pressable style={styles.settingsRow} onPress={() => router.push('/settings/notifications')} accessibilityLabel="Notifications settings">
            <Ionicons name="notifications-outline" size={18} color={pilot.navy} />
            <Text style={styles.settingsRowText}>Notifications</Text>
            <Ionicons name="chevron-forward" size={18} color={pilot.muted} />
          </Pressable>
        </Section>

        <View style={{ marginTop: 8 }}>
          <SecondaryButton label="Log out" onPress={logout} />
        </View>
      </ScrollView>
      <CredentialModal config={activeCred ? CREDENTIALS[activeCred] : null} visible={!!activeCred} onClose={() => setActiveCred(null)} onAdded={load} />
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  content: { padding: spacing.xl, paddingBottom: 116 /* clears floating tab bar */ },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 80 },
  loadingText: { color: pilot.muted, fontFamily: fontFamilies.body },

  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  settingsRowText: { flex: 1, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.base, color: pilot.ink },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes['3xl'], color: pilot.ink },
  subtitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, marginTop: 4 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: pilot.navy, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 8, marginTop: 4 },
  editBtnText: { color: pilot.navy, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },

  card: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 20, marginBottom: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.lg, color: pilot.ink },
  cardSubtitle: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2 },
  addBtn: { borderWidth: 1, borderColor: pilot.navy, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  trashBtn: { padding: 6 },
  emptyNote: { color: pilot.muted, fontSize: fontSizes.sm, fontStyle: 'italic', fontFamily: fontFamilies.body },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statTile: { width: '31%', backgroundColor: pilot.cream, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center' },
  // fontSize 16 so 5–6 digit totals fit the tile width without truncation;
  // adjustsFontSizeToFit shrinks further on device for anything larger.
  statNum: { fontFamily: fontFamilies.mono, fontSize: 16, color: pilot.navy, fontWeight: '800' },
  statLabel: { fontSize: 9.5, fontFamily: fontFamilies.bodySemiBold, color: pilot.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 5, textAlign: 'center' },

  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: pilot.line },
  itemTitle: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  itemSub: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 3 },

  appItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: pilot.line },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontFamily: fontFamilies.bodyBold },
  viewAll: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, marginTop: 12 },
});
