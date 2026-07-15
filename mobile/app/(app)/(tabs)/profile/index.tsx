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
import Svg, { Circle } from 'react-native-svg';
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
  const [tab, setTab] = useState<'licences' | 'medical' | 'ratings' | 'training' | 'details'>('licences');

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
        {/* ── Instagram-style header: avatar + name / phone / role ─────────── */}
        <View style={styles.igHeader}>
          <View style={styles.igAvatar}>
            <Text style={styles.igAvatarText}>
              {((((profile?.firstName || ' ')[0] || '') + ((profile?.lastName || ' ')[0] || '')).toUpperCase().trim()) || 'P'}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.igName} numberOfLines={1}>
              {[profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'Pilot'}
            </Text>
            {profile?.phone ? <Text style={styles.igPhone}>{profile.phone}</Text> : null}
            {profile?.role ? (
              <View style={styles.igRolePill}>
                <Text style={styles.igRoleText}>
                  {String(profile.role).replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c: string) => c.toUpperCase())}
                </Text>
              </View>
            ) : null}
          </View>
          <Pressable style={styles.editBtn} onPress={() => router.push('/profile/edit')}>
            <Ionicons name="create-outline" size={16} color={pilot.navy} />
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>
        </View>

        {/* Hours — Instagram-style counters */}
        <View style={styles.igStatsRow}>
          {([['Total hours', totals?.totalTime], ['PIC', totals?.picTime], ['SIC', totals?.sicTime]] as [string, number][]).map(([label, v]) => (
            <View key={label} style={{ alignItems: 'center' }}>
              <Text style={styles.igStatNum}>{(Number(v) || 0).toFixed(0)}</Text>
              <Text style={styles.igStatLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Map + airport statistics popup trigger */}
        <Pressable
          style={({ pressed }) => [styles.mapBtn, pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }]}
          onPress={() => router.push('/profile/flight-map')}
        >
          <Ionicons name="map-outline" size={17} color="#FFFFFF" />
          <Text style={styles.mapBtnText}>Flight map & airports</Text>
        </Pressable>

        {/* Tab row — Licences is the default leftmost tab */}
        <View style={styles.igTabs}>
          {([['licences', 'Licences'], ['medical', 'Medical'], ['ratings', 'Ratings'], ['training', 'Training'], ['details', 'Details']] as const).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.igTab, tab === key && styles.igTabActive]}>
              <Text style={[styles.igTabText, tab === key && styles.igTabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'details' && (<>
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
        </>)}

        {tab === 'licences' && (<>
        <Section title="My Pilot Licences" subtitle="Add every licence you hold" onAdd={() => setActiveCred('licence')}>
          {licences.length === 0 ? <Empty text="No licences added yet." /> : licences.map((c: Any) => (
            <ItemRow key={c.id} title={LICENCE_LABEL[c.type] || c.type} onDelete={() => confirmDelete(CREDENTIALS.licence.deletePath(c.id))}
              sub={<>{AUTHORITY_LABEL[c.issuingAuthority] || c.issuingAuthority}{c.certificateNumber ? ` · #${c.certificateNumber}` : ''}{c.expiryDate ? ` · Exp ${formatDate(c.expiryDate)}` : ''}</>} />
          ))}
        </Section>

        {/* Medical */}
        </>)}

        {tab === 'medical' && (<>
        <Section title="Medical Certificate" subtitle="Required by most airlines" onAdd={() => setActiveCred('medical')}>
          {medicals.length === 0 ? <Empty text="No medical certificate added." /> : medicals.map((m: Any) => {
            const expired = new Date(m.expiryDate) < new Date();
            return <ItemRow key={m.id} title={MEDICAL_LABEL[m.medicalClass] || m.medicalClass} onDelete={() => confirmDelete(CREDENTIALS.medical.deletePath(m.id))}
              sub={<Text style={{ color: expired ? SEM.red : (expiryColor(m.expiryDate) || SEM.green) }}>{expired ? '⚠ Expired ' : 'Valid until '}{formatDate(m.expiryDate)}</Text>} />;
          })}
        </Section>

        {/* Type Ratings */}
        </>)}

        {tab === 'ratings' && (<>
        <Section title="Aircraft Type Ratings" subtitle="Aircraft you are rated to fly" onAdd={() => setActiveCred('rating')}>
          {ratings.length === 0 ? <Empty text="No type ratings added." /> : ratings.map((r: Any) => (
            <ItemRow key={r.id} title={r.aircraftType} onDelete={() => confirmDelete(CREDENTIALS.rating.deletePath(r.id))}
              sub={r.hoursOnType > 0 ? `${r.hoursOnType.toLocaleString()} hrs on type` : undefined} />
          ))}
        </Section>

        {/* ELP */}
        </>)}

        {tab === 'training' && (<>
        <Section title="English Language Proficiency" subtitle="ICAO ELP — required for all international operations" onAdd={() => setActiveCred('elp')}>
          {elp.length === 0 ? <Empty text="No ELP record added. ICAO Level 4 minimum is required by most airlines." /> : elp.map((i: Any) => (
            <ItemRow key={i.id} title={`ICAO ${i.level}`} onDelete={() => confirmDelete(CREDENTIALS.elp.deletePath(i.id))}
              sub={<>{i.endorsementNumber ? `#${i.endorsementNumber}` : ''}{i.expiryDate ? ` · Exp ${formatDate(i.expiryDate)}` : (i.noExpiry || i.level === 'Level 6' ? ' · No expiry' : '')}</>} />
          ))}
        </Section>

        </>)}

        {tab === 'training' && (<>
        {/* Recurrent Training */}
        <Section title="Recurrent Training" subtitle="Track your mandatory recurrent training" onAdd={() => setActiveCred('recurrent')}>
          {recurrent.length === 0 ? <Empty text="No recurrent training records." /> : recurrent.map((i: Any) => (
            <ItemRow key={i.id} title={i.trainingType} onDelete={() => confirmDelete(CREDENTIALS.recurrent.deletePath(i.id))}
              sub={<>{i.provider ? `${i.provider} · ` : ''}Completed: {formatDate(i.completionDate)}{i.expiryDate ? ` · Exp ${formatDate(i.expiryDate)}` : ''}</>} />
          ))}
        </Section>

        </>)}

        {tab === 'details' && (<>
        {/* Right to Work */}
        <Section title="Right to Work" subtitle="Countries where you have the right to work" onAdd={() => setActiveCred('rtw')}>
          {rtw.length === 0 ? <Empty text="No right-to-work documents added." /> : rtw.map((i: Any) => (
            <ItemRow key={i.id} title={i.country} onDelete={() => confirmDelete(CREDENTIALS.rtw.deletePath(i.id))}
              sub={<>{i.documentType}{i.documentNumber ? ` · #${i.documentNumber}` : ''}{i.noExpiry ? ' · No expiry' : i.expiryDate ? ` · Exp ${formatDate(i.expiryDate)}` : ''}</>} />
          ))}
        </Section>

        </>)}

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

// ── Flight experience dashboard: PIC/SIC donut + category proportion bars ────
// Mirrors the web Profile dashboard. Donut splits TOTAL time by role (PIC/SIC
// sum to the total); night/instrument/multi/turbine overlap each other, so
// they render as bars showing their share of total time instead.
export function FlightDashboard({ totals, styles, palette }: { totals: Any; styles: Any; palette: ThemePalette }) {
  const total = Number(totals?.totalTime) || 0;
  const pic = Number(totals?.picTime) || 0;
  const sic = Number(totals?.sicTime) || 0;
  const other = Math.max(0, total - pic - sic);
  const R = 46;
  const C = 2 * Math.PI * R;
  const segs = [
    { label: 'PIC', value: pic, color: palette.navy },
    { label: 'SIC', value: sic, color: palette.amber },
    { label: 'Other', value: other, color: palette.line },
  ].filter((x) => x.value > 0.05);
  let acc = 0;
  const arcs = segs.map((x) => {
    const frac = total > 0 ? x.value / total : 0;
    const arc = { ...x, dash: [frac * C, C] as [number, number], offset: -acc * C };
    acc += frac;
    return arc;
  });
  const bars = [
    { label: 'Night', value: Number(totals?.nightTime) || 0 },
    { label: 'Instrument', value: Number(totals?.instrumentTime) || 0 },
    { label: 'Multi-engine', value: Number(totals?.multiEngineTime) || 0 },
    { label: 'Turbine', value: Number(totals?.turbineTime) || 0 },
  ];
  return (
    <View>
      <View style={styles.dashTop}>
        <View style={styles.donutWrap}>
          <Svg width={124} height={124} viewBox="0 0 124 124">
            <Circle cx={62} cy={62} r={R} fill="none" stroke={palette.cream} strokeWidth={14} />
            {arcs.map((a) => (
              <Circle key={a.label} cx={62} cy={62} r={R} fill="none" stroke={a.color} strokeWidth={14}
                strokeDasharray={a.dash} strokeDashoffset={a.offset} transform="rotate(-90 62 62)" />
            ))}
          </Svg>
          <View style={styles.donutCenter}>
            <Text style={styles.donutNum}>{total.toFixed(0)}</Text>
            <Text style={styles.donutLabel}>Total hrs</Text>
          </View>
        </View>
        <View style={styles.legendCol}>
          {segs.map((x) => (
            <View key={x.label} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: x.color }]} />
              <Text style={styles.legendLabel}>{x.label}</Text>
              <Text style={styles.legendVal}>{x.value.toFixed(1)}</Text>
            </View>
          ))}
        </View>
      </View>
      {bars.map((bl) => {
        const pct = total > 0 ? Math.min(100, (bl.value / total) * 100) : 0;
        return (
          <View key={bl.label} style={styles.barBlock}>
            <View style={styles.barHead}>
              <Text style={styles.barLabel}>{bl.label}</Text>
              <Text style={styles.barVal}>{bl.value.toFixed(1)} h · {Math.round(pct)}%</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${pct}%` }]} />
            </View>
          </View>
        );
      })}
    </View>
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
  igHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18 },
  igAvatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: pilot.navy, alignItems: 'center', justifyContent: 'center' },
  igAvatarText: { color: '#FFFFFF', fontFamily: fontFamilies.display, fontSize: 28, fontWeight: '600' },
  igName: { fontFamily: fontFamilies.display, fontSize: 22, color: pilot.ink, fontWeight: '600' },
  igPhone: { fontSize: 13, fontFamily: fontFamilies.body, color: pilot.muted, marginTop: 2 },
  igRolePill: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,63,136,0.08)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  igRoleText: { fontSize: 12, fontFamily: fontFamilies.bodySemiBold, color: pilot.navy },
  igStatsRow: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderBottomWidth: 1, borderColor: pilot.line, paddingVertical: 12, marginBottom: 12 },
  igStatNum: { fontFamily: fontFamilies.mono, fontSize: 20, fontWeight: '800', color: pilot.ink },
  igStatLabel: { fontSize: 11, fontFamily: fontFamilies.bodyMedium, color: pilot.muted, marginTop: 2 },
  mapBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: pilot.navy, borderRadius: 10, paddingVertical: 12, marginBottom: 16 },
  mapBtnText: { color: '#FFFFFF', fontSize: 14, fontFamily: fontFamilies.bodySemiBold },
  igTabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: pilot.line, marginBottom: 16 },
  igTab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  igTabActive: { borderBottomColor: pilot.navy },
  igTabText: { fontSize: 11.5, fontFamily: fontFamilies.bodySemiBold, color: pilot.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  igTabTextActive: { color: pilot.navy },
  dashTop: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 16 },
  donutWrap: { width: 124, height: 124, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center' },
  donutNum: { fontFamily: fontFamilies.mono, fontSize: 21, fontWeight: '800', color: pilot.ink },
  donutLabel: { fontSize: 9, fontFamily: fontFamilies.bodySemiBold, color: pilot.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 },
  legendCol: { flex: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { fontSize: 13, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink, flex: 1 },
  legendVal: { fontFamily: fontFamilies.mono, fontSize: 12, color: pilot.muted },
  barBlock: { marginBottom: 10 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { fontSize: 12, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  barVal: { fontFamily: fontFamilies.mono, fontSize: 11, color: pilot.muted },
  barTrack: { height: 8, backgroundColor: pilot.cream, borderWidth: 1, borderColor: pilot.line, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: pilot.navy, borderRadius: 3 },
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
