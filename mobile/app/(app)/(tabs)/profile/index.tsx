// Profile — the mobile twin of the redesigned web Profile (frontend ProfileRedesign).
// Phone layout IS the shared spec: hero → application readiness → snapshot +
// strength → cards (Licences & ratings, Checks, Medical, Training, Right to work
// & passport, Job preferences, Personal details). Each row opens a per-item edit
// sheet. Mobile-only chrome (My Applications, Settings link, Log out) sits last.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../src/lib/api';
import { SecondaryButton } from '../../../../src/components/ui';
import { useTabBarClearance } from '../../../../src/theme/tabBar';
import ProfileEditSheet, { EditSpec, pilotNationalities } from '../../../../src/components/ProfileEditSheet';
import { useAuth } from '../../../../src/context/AuthContext';
import {
  APP_STATUS, EDUCATION_LABEL, ROLE_LABEL, appliedAgo, formatDate,
} from '../../../../src/lib/profileLabels';
import { fontFamilies, fontSizes, spacing } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';
import { hours } from '../../../../src/lib/format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOT = { r: '#D92D20', a: '#F79009', g: '#16A34A', n: '#C4BFB4' };
const TXT = { r: '#B42318', a: '#92400E', g: '#166534', n: '#8592A3' };

function fmtDue(d?: any) { if (!d) return ''; const t = new Date(d); return `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`; }
function properCase(s?: string) {
  return String(s || '').split(/\s+/).map((w) => w.split('-').map((p) => {
    if (!p) return p;
    if (/\d/.test(p)) return p.toUpperCase();
    if (p === p.toUpperCase() && p.length <= 4) return p;
    return p[0].toUpperCase() + p.slice(1).toLowerCase();
  }).join(' ')).join(' ').trim();
}
const medicalLabel = (c?: string) => `Class ${String(c || '').replace(/^CLASS[_\s-]?/i, '')}`;
const normType = (t?: string) => String(t || '').toUpperCase().split(/[\s\-/]+/)[0];
const notExpired = (d?: any) => !d || new Date(d) >= new Date();
const TRAINING_VALIDITY: Record<string, number> = { CRM: 12, DGR: 24, 'FIRST AID': 24, SMS: 12 };
function trainingDue(t: Any) {
  if (t.expiresAt) return new Date(t.expiresAt);
  const m = TRAINING_VALIDITY[String(t.type || '').trim().toUpperCase()];
  if (!m || !t.completedAt) return null;
  const d = new Date(t.completedAt); d.setMonth(d.getMonth() + m); return d;
}
function dueLevel(due: any) { if (!due) return 'g'; const days = Math.floor((new Date(due).getTime() - Date.now()) / 86400000); if (days <= 7) return 'r'; if (days <= 90) return 'a'; return 'g'; }
const LICENCE_RANK = ['ATPL', 'ATP', 'MPL', 'CPL', 'PPL'];
const LICENCE_NAME: Record<string, string> = { ATPL: 'Airline Transport Pilot', ATP: 'Airline Transport Pilot', MPL: 'Multi-crew Pilot', CPL: 'Commercial Pilot', PPL: 'Private Pilot' };
const rankOf = (t?: string) => { const i = LICENCE_RANK.indexOf(t || ''); return i === -1 ? 99 : i; };

export default function ProfileView() {
  const tabBarClearance = useTabBarClearance(12);
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();

  const [profile, setProfile] = useState<Any | null>(null);
  const [readiness, setReadiness] = useState<Any | null>(null);
  const [summary, setSummary] = useState<Any | null>(null);
  const [apps, setApps] = useState<Any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<EditSpec>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [photoOk, setPhotoOk] = useState(true);
  const [otwSaving, setOtwSaving] = useState(false);

  const load = useCallback(async () => {
    const [p, rd, s, a] = await Promise.allSettled([
      api.get('/profile'), api.get('/profile/readiness'), api.get('/logbook/summary'), api.get('/jobs/applications'),
    ]);
    if (p.status === 'fulfilled') setProfile(p.value.data);
    if (rd.status === 'fulfilled') setReadiness(rd.value.data);
    if (s.status === 'fulfilled') setSummary(s.value.data);
    if (a.status === 'fulfilled') setApps(a.value.data || []);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const byTypeHours = useMemo(() => {
    const m = new Map<string, number>();
    (summary?.byType || []).forEach((b: Any) => m.set(normType(b.type), b.hours));
    return m;
  }, [summary]);

  const openEdit = (kind: string, id?: string | null) => () => setEditing({ kind, id });

  const toggleOtw = async () => {
    if (otwSaving || !profile) return;
    const next = !profile.openToWork;
    setProfile((p: Any) => ({ ...p, openToWork: next }));
    setOtwSaving(true);
    try { await api.patch('/profile', { openToWork: next }); } catch { setProfile((p: Any) => ({ ...p, openToWork: !next })); }
    finally { setOtwSaving(false); }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe} edges={[]}><View style={styles.center}><ActivityIndicator color={pilot.navy} /><Text style={styles.loadingText}>Loading your profile…</Text></View></SafeAreaView>;
  }
  if (!profile) {
    return <SafeAreaView style={styles.safe} edges={[]}><View style={styles.center}><Text style={styles.loadingText}>Couldn’t load your profile.</Text></View></SafeAreaView>;
  }

  const certs: Any[] = profile.certificates || [];
  const licences = certs.filter((c) => !['ELP', 'IR', 'ME', 'SE'].includes(c.type));
  const supportingCerts = certs.filter((c) => ['IR', 'ME', 'SE'].includes(c.type));
  const elp = certs.find((c) => c.type === 'ELP');
  const ratings: Any[] = profile.ratings || [];
  const medicals: Any[] = [...(profile.medicals || [])].sort((a, b) => new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime());
  const training: Any[] = profile.trainingRecords || [];
  const rtw: Any[] = profile.rightToWork || [];
  const prefs = profile.preferences || null;
  const totals = summary?.totals || null;
  const mainType = summary?.byType?.[0]?.type || ratings[0]?.aircraftType || null;

  const highest = LICENCE_RANK.map((t) => licences.find((c) => c.type === t)).find(Boolean) || licences[0] || null;
  const highestRank = highest ? rankOf(highest.type) : 99;
  const nullRatings = ratings.filter((r) => !r.licenceId);

  const name = properCase(`${profile.firstName || ''} ${profile.lastName || ''}`.trim());
  const initials = (`${(profile.firstName || '')[0] || ''}${(profile.lastName || '')[0] || ''}`).toUpperCase();
  const place = [profile.city, profile.country].filter(Boolean).map(properCase).join(', ');
  const nationalities = pilotNationalities(profile);
  const headline = [profile.role && ROLE_LABEL[profile.role], mainType && properCase(mainType), place || null].filter(Boolean).join(' · ');

  const activeLicence = LICENCE_RANK.map((t) => licences.find((c) => c.type === t && notExpired(c.expiryDate))).find(Boolean) || null;
  const chips: string[] = [];
  if (activeLicence) chips.push(activeLicence.issuingAuthority && activeLicence.issuingAuthority.toLowerCase() !== 'unknown' ? `${activeLicence.type} · ${activeLicence.issuingAuthority}` : activeLicence.type);
  if (medicals[0] && notExpired(medicals[0].expiryDate)) chips.push(`${medicalLabel(medicals[0].medicalClass)} medical`);
  if (rtw[0]) chips.push(`Right to work: ${properCase(rtw[0].country)}`);
  if (elp?.englishLevel && notExpired(elp.expiryDate)) chips.push(`English: ${elp.englishLevel}`);

  const otwParts: string[] = [];
  if (prefs?.preferredCountries?.length) otwParts.push(prefs.preferredCountries.map(properCase).join(', '));
  if (prefs?.preferredAircraft?.length) otwParts.push(prefs.preferredAircraft.join(', '));
  const otwSummary = otwParts.join(' · ');

  const items: Any[] = readiness?.items || [];
  const strength = readiness?.strength || null;
  const nudge = readiness?.nudge || null;
  const lv = { expired: 0, due: 0, missing: 0 };
  items.forEach((it) => { if (it.level === 'expired' || it.level === 'expiring') lv.expired++; else if (it.level === 'due') lv.due++; else if (it.level === 'missing') lv.missing++; });
  const attnHeader = [lv.expired && `${lv.expired} expired`, lv.due && `${lv.due} due soon`, lv.missing && `${lv.missing} to add`].filter(Boolean).join(' · ');

  const readinessText = (it: Any): { cls: keyof typeof DOT; txt: string } => {
    if (it.level === 'expired') return { cls: 'r', txt: it.date ? `Expired ${formatDate(it.date)}` : 'Expired' };
    if (it.level === 'expiring') return { cls: 'r', txt: it.days === 0 ? 'Expires today' : `Expires in ${it.days} day${it.days === 1 ? '' : 's'}` };
    if (it.level === 'due') return { cls: 'a', txt: `${it.days} days left` };
    return { cls: 'n', txt: it.type === 'authority' ? 'Pick authority' : it.type === 'passport' ? 'Add date' : 'Add' };
  };

  // English proficiency status comes from the SAME readiness item the dashboard
  // blocker reads (ELP certificate expiryDate) — never a second, hand-rolled
  // "valid until" that can disagree with it.
  const elpItem = items.find((x: Any) => x.type === 'english');
  // No readiness item (service says ok, or it failed to load) → still read the
  // stored date rather than assuming "valid", same as the licence rows.
  const elpSt = elpItem ? readinessText(elpItem)
    : (elp?.expiryDate
      ? (notExpired(elp.expiryDate)
        ? { cls: 'g' as const, txt: `Valid until ${formatDate(elp.expiryDate)}` }
        : { cls: 'r' as const, txt: `Expired ${formatDate(elp.expiryDate)}` })
      : null);

  const St = ({ cls, children }: { cls: keyof typeof DOT; children: React.ReactNode }) => (
    <View style={styles.stRow}><View style={[styles.dot, { backgroundColor: DOT[cls] }]} /><Text style={[styles.stText, { color: TXT[cls] }]} numberOfLines={1}>{children}</Text></View>
  );
  const Row = ({ onPress, children, nested }: { onPress?: () => void; children: React.ReactNode; nested?: boolean }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, nested && styles.rowNested, pressed && onPress && styles.rowPressed]}>
      {children}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={pilot.muted} style={{ marginLeft: 2 }} /> : null}
    </Pressable>
  );
  const AddLink = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} hitSlop={6}><Text style={styles.addLink}>{label}</Text></Pressable>
  );

  const slug = (job: Any) => `${String(job.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${String(job.role || job.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${job.id}`;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pilot.navy} />}
      >
        {/* ── HERO (phone/email never here) ───────────────────────────────── */}
        <View style={styles.hero}>
          {profile.photoUrl && photoOk
            ? <Image source={{ uri: profile.photoUrl }} style={styles.avatar} onError={() => setPhotoOk(false)} />
            : <View style={[styles.avatar, styles.avatarInit]}><Text style={styles.avatarInitText}>{initials || 'P'}</Text></View>}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={2}>{name || 'Pilot'}</Text>
            {headline ? <Text style={styles.headline} numberOfLines={2}>{headline}</Text> : null}
          </View>
        </View>

        {chips.length > 0 && (
          <View style={styles.chips}>{chips.map((c, i) => <View key={i} style={styles.chip}><Text style={styles.chipText}>{c}</Text></View>)}</View>
        )}

        <View style={styles.otw}>
          <Switch value={!!profile.openToWork} onValueChange={toggleOtw} trackColor={{ true: '#16A34A', false: '#CBD3DD' }} thumbColor="#fff" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.otwTitle}>Open to work</Text>
            <Text style={styles.otwSub} numberOfLines={1}>{profile.openToWork ? (otwSummary || 'Visible to airlines') : 'Not visible to airlines'}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => router.push('/cv-builder')}><Ionicons name="download-outline" size={16} color={pilot.navy} /><Text style={styles.btnGhostText}>Download CV</Text></Pressable>
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => setEditing({ kind: 'personal' })}><Ionicons name="pencil-outline" size={16} color="#fff" /><Text style={styles.btnPrimaryText}>Edit profile</Text></Pressable>
        </View>

        {/* ── APPLICATION READINESS ───────────────────────────────────────── */}
        {items.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.attnLabel}>READINESS{attnHeader ? ` · ${attnHeader}` : ''}</Text>
            <View style={{ marginTop: 6 }}>
              {items.map((it, i) => {
                const s = readinessText(it);
                const right = it.date && (it.level === 'expiring' || it.level === 'due') ? `${s.txt} · ${formatDate(it.date)}` : s.txt;
                return (
                  <View key={i} style={styles.attnRow}>
                    <View style={styles.attnLeft}><View style={[styles.dot, { backgroundColor: DOT[s.cls] }]} /><Text style={styles.attnName} numberOfLines={1}>{it.label}</Text></View>
                    <Text style={[styles.attnRight, { color: TXT[s.cls] }]} numberOfLines={1}>{right}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── SNAPSHOT + STRENGTH ─────────────────────────────────────────── */}
        {totals && (
          <View style={styles.snap}>
            <View style={styles.snapCell}><Text style={styles.snapV}>{Math.round(totals.total).toLocaleString()}<Text style={styles.snapU}> h</Text></Text><Text style={styles.snapK}>Total time</Text></View>
            {mainType && byTypeHours.has(normType(mainType)) && <View style={[styles.snapCell, styles.snapBorderL]}><Text style={styles.snapV}>{Math.round(byTypeHours.get(normType(mainType)) || 0).toLocaleString()}<Text style={styles.snapU}> h</Text></Text><Text style={styles.snapK}>On {properCase(mainType)}</Text></View>}
            <View style={[styles.snapCell, styles.snapBorderT]}><Text style={styles.snapV}>{(totals.flightCount || 0).toLocaleString()}</Text><Text style={styles.snapK}>Flights logged</Text></View>
            {ratings.length > 0 && <View style={[styles.snapCell, styles.snapBorderT, styles.snapBorderL]}><Text style={styles.snapV}>{ratings.length}</Text><Text style={styles.snapK}>Rating{ratings.length === 1 ? '' : 's'}</Text></View>}
          </View>
        )}
        {strength && (
          <View style={styles.card}>
            <View style={styles.strengthTop}><Text style={styles.strengthLabel}>Profile strength</Text><Text style={styles.strengthPct}>{strength.pct}%</Text></View>
            <View style={styles.bar}><View style={[styles.barFill, { width: `${strength.pct}%` }]} /></View>
            {nudge?.fields?.length > 0 && (
              <Text style={styles.hint}>Add <Text style={styles.hintB}>{nudge.fields.slice(0, 2).map((f: Any) => f.field).join(' and ')}</Text> to check {nudge.incompleteJobs} more job{nudge.incompleteJobs === 1 ? '' : 's'}. <Text style={styles.hintLink} onPress={() => router.push('/jobs')}>See jobs</Text></Text>
            )}
          </View>
        )}

        {/* ── LICENCES & RATINGS ──────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Licences & ratings</Text>
          {licences.length === 0 && ratings.length === 0 ? <Text style={styles.empty}>No licences added yet.</Text> : licences.map((c) => {
            const superseded = highest && c.id !== highest.id && rankOf(c.type) > highestRank;
            const isHighest = highest && c.id === highest.id;
            const item = items.find((x) => x.type === 'licence' && x.itemId === c.id);
            let st: { cls: keyof typeof DOT; txt: string } | null = null;
            if (superseded) st = { cls: 'n', txt: `Superseded by ${highest.type}` };
            else if (item) st = readinessText(item);
            else if (c.expiryDate) st = { cls: notExpired(c.expiryDate) ? 'g' : 'r', txt: notExpired(c.expiryDate) ? `Valid until ${formatDate(c.expiryDate)}` : `Expired ${formatDate(c.expiryDate)}` };
            const nested = isHighest ? [...ratings.filter((r) => r.licenceId === c.id), ...nullRatings] : ratings.filter((r) => r.licenceId === c.id);
            return (
              <View key={c.id}>
                <Row onPress={openEdit('licence', c.id)}>
                  <View style={styles.rowMain}><Text style={[styles.rowN, superseded && styles.rowNFaint]}>{c.type} · {LICENCE_NAME[c.type] || 'Licence'}</Text>{c.issuingAuthority && c.issuingAuthority.toLowerCase() !== 'unknown' ? <Text style={styles.rowD}>{c.issuingAuthority}</Text> : null}</View>
                  {st ? <St cls={st.cls}>{st.txt}</St> : null}
                </Row>
                {(nested.length > 0 || (isHighest && supportingCerts.length > 0)) && (
                  <View style={styles.nest}>
                    {nested.map((r) => {
                      const h = byTypeHours.get(normType(r.aircraftType));
                      return (
                        <Row key={r.id} nested onPress={openEdit('rating', r.id)}>
                          <View style={styles.rowMain}><Text style={styles.rowNnest}>{properCase(r.aircraftType)} {r.category && /single|multi/i.test(r.category) ? 'rating' : 'type rating'}</Text>{h != null ? <Text style={styles.rowD}>Hours from your logbook</Text> : null}</View>
                          {h != null ? <Text style={styles.rowH}>{hours(Math.round(h))}</Text> : null}
                        </Row>
                      );
                    })}
                    {isHighest && supportingCerts.map((sc) => (
                      <Row key={sc.id} nested>
                        <View style={styles.rowMain}><Text style={styles.rowNnest}>{sc.type === 'IR' ? 'Instrument rating (IR)' : sc.type === 'ME' ? 'Multi-engine (MEP)' : 'Single-engine (SEP)'}</Text></View>
                        <St cls="g">{sc.expiryDate ? `Valid until ${formatDate(sc.expiryDate)}` : 'Valid'}</St>
                      </Row>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
          {/* English proficiency is a licence endorsement, not training */}
          <Row onPress={openEdit('elp', elp?.id)}>
            <View style={styles.rowMain}><Text style={styles.rowN}>English proficiency (ICAO)</Text><Text style={styles.rowD}>{elp?.englishLevel || 'Required for international operations'}</Text></View>
            {elpSt ? <St cls={elpSt.cls}>{elpSt.txt}</St> : null}
            {!elp?.englishLevel ? <Text style={styles.linkSm}>Add level</Text> : null}
          </Row>
          <View style={styles.addRow}><AddLink label="+ Add licence" onPress={() => setEditing({ kind: 'licence' })} /><AddLink label="+ Add rating" onPress={() => setEditing({ kind: 'rating' })} /></View>
        </View>

        {/* ── MEDICAL ─────────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Medical</Text>
          {medicals.length === 0 ? <Text style={styles.empty}>No medical on file.</Text> : medicals.map((m) => {
            const item = items.find((x) => x.type === 'medical');
            const st = item ? readinessText(item) : { cls: 'g' as const, txt: `Valid until ${formatDate(m.expiryDate)}` };
            return (
              <Row key={m.id} onPress={openEdit('medical', m.id)}>
                <View style={styles.rowMain}><Text style={styles.rowN}>{medicalLabel(m.medicalClass)}</Text><Text style={styles.rowD}>Valid until {formatDate(m.expiryDate)}</Text></View>
                <St cls={st.cls}>{st.txt}</St>
              </Row>
            );
          })}
          <View style={styles.addRow}><AddLink label="+ Add medical" onPress={() => setEditing({ kind: 'medical' })} /></View>
        </View>

        {/* ── TRAINING ────────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Training</Text>
          {training.length === 0 ? <Text style={styles.empty}>No training records yet.</Text> : null}
          {training.map((t) => {
            const due = trainingDue(t);
            const cls = dueLevel(due) as keyof typeof DOT;
            const months = TRAINING_VALIDITY[String(t.type || '').trim().toUpperCase()];
            const item = items.find((x) => x.type === 'training' && x.itemId === t.id);
            const st = item ? readinessText(item) : null;
            return (
              <Row key={t.id} onPress={openEdit('training', t.id)}>
                <View style={styles.rowMain}><Text style={styles.rowN}>{t.type}</Text><Text style={styles.rowD}>Completed {formatDate(t.completedAt)}{months && !t.expiresAt ? ` · due every ${months} months` : ''}</Text></View>
                {due ? (st && (st.cls === 'r' || st.cls === 'a') ? <St cls={st.cls}>{st.txt}</St> : <St cls={cls}>Due {fmtDue(due)}</St>) : null}
              </Row>
            );
          })}
          <View style={styles.addRow}><AddLink label="+ Add training" onPress={() => setEditing({ kind: 'training' })} /></View>
        </View>

        {/* ── RIGHT TO WORK & PASSPORT ────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Right to work & passport</Text>
          {rtw.map((w) => (
            <Row key={w.id} onPress={openEdit('rtw', w.id)}>
              <View style={styles.rowMain}><Text style={styles.rowN}>{properCase(w.country)}</Text>{w.documentType ? <Text style={styles.rowD}>{properCase(w.documentType)}</Text> : null}</View>
              <St cls="g">{w.expiresAt ? `Until ${formatDate(w.expiresAt)}` : 'No expiry'}</St>
            </Row>
          ))}
          <Row onPress={openEdit('passport')}>
            <View style={styles.rowMain}><Text style={styles.rowN}>Passport</Text><Text style={styles.rowD}>Used for expiry reminders</Text></View>
            {profile.passportExpiry ? <St cls="g">{formatDate(profile.passportExpiry)}</St> : <Text style={styles.linkSm}>Add expiry</Text>}
          </Row>
          <View style={styles.addRow}><AddLink label="+ Add right to work" onPress={() => setEditing({ kind: 'rtw' })} /></View>
        </View>

        {/* ── JOB PREFERENCES ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHead}><Text style={styles.cardTitle}>Job preferences</Text><Pressable onPress={() => setEditing({ kind: 'prefs' })}><Text style={styles.editLink}>Edit</Text></Pressable></View>
          {(!prefs || (!prefs.preferredCountries?.length && !prefs.preferredAircraft?.length && !prefs.preferredContractTypes?.length)) ? <Text style={styles.empty}>No preferences set yet.</Text> : (
            <View style={{ gap: 10, marginTop: 6 }}>
              {prefs.preferredCountries?.length > 0 && <View style={styles.kv}><Text style={styles.kvK}>Regions</Text><View style={styles.tags}>{prefs.preferredCountries.map((c: string, i: number) => <View key={i} style={styles.tag}><Text style={styles.tagText}>{properCase(c)}</Text></View>)}</View></View>}
              {prefs.preferredAircraft?.length > 0 && <View style={styles.kv}><Text style={styles.kvK}>Aircraft</Text><View style={styles.tags}>{prefs.preferredAircraft.map((a: string, i: number) => <View key={i} style={styles.tag}><Text style={styles.tagText}>{a}</Text></View>)}</View></View>}
              {prefs.preferredContractTypes?.length > 0 && <View style={styles.kv}><Text style={styles.kvK}>Contract</Text><Text style={styles.kvV}>{prefs.preferredContractTypes.map(properCase).join(', ')}</Text></View>}
              <View style={styles.kv}><Text style={styles.kvK}>Relocate</Text><Text style={styles.kvV}>{profile.willingToRelocate ? 'Yes' : 'No'}</Text></View>
            </View>
          )}
        </View>

        {/* ── PERSONAL DETAILS ────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHead}><Text style={styles.cardTitle}>Personal details</Text><Pressable onPress={() => setEditing({ kind: 'personal' })}><Text style={styles.editLink}>Edit</Text></Pressable></View>
          <View style={{ gap: 10, marginTop: 6 }}>
            {place ? <View style={styles.kv}><Text style={styles.kvK}>Location</Text><Text style={styles.kvV}>{place}</Text></View> : null}
            {nationalities.length > 0 ? <View style={styles.kv}><Text style={styles.kvK}>{nationalities.length > 1 ? 'Nationalities' : 'Nationality'}</Text><Text style={styles.kvV}>{nationalities.map((n) => properCase(n)).join(', ')}</Text></View> : null}
            {profile.phone ? <View style={styles.kv}><Text style={styles.kvK}>Phone</Text><Text style={styles.kvV}>{profile.phone}</Text></View> : null}
            {profile.education ? <View style={styles.kv}><Text style={styles.kvK}>Education</Text><Text style={styles.kvV}>{EDUCATION_LABEL[profile.education] || profile.education}</Text></View> : null}
          </View>
        </View>

        {/* ── Mobile-only chrome ──────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>My applications</Text>
          {apps.length === 0 ? <Text style={styles.empty}>You haven’t applied to any jobs yet.</Text> : (
            <View style={{ marginTop: 6 }}>
              {apps.slice(0, 5).map((a: Any) => {
                const st = APP_STATUS[a.status] || { label: a.status, color: pilot.muted, bg: '#F1F1F1' };
                return (
                  <Row key={a.id} onPress={() => router.push(`/jobs/${slug(a.job)}`)}>
                    <View style={styles.rowMain}><Text style={styles.rowN} numberOfLines={1}>{a.job.title}</Text><Text style={styles.rowD}>{a.job.company} · {appliedAgo(a.appliedAt)}</Text></View>
                    <View style={[styles.statusPill, { backgroundColor: st.bg }]}><Text style={[styles.statusPillText, { color: st.color }]}>{st.label}</Text></View>
                  </Row>
                );
              })}
              {apps.length > 5 ? <Pressable onPress={() => router.push('/profile/applications')}><Text style={styles.addLink}>View all {apps.length} applications →</Text></Pressable> : null}
            </View>
          )}
        </View>

        <Pressable style={styles.settingsRow} onPress={() => router.push('/settings/notifications')}>
          <Ionicons name="notifications-outline" size={18} color={pilot.navy} /><Text style={styles.settingsRowText}>Notifications</Text><Ionicons name="chevron-forward" size={18} color={pilot.muted} />
        </Pressable>
        <View style={{ marginTop: 12 }}><SecondaryButton label="Log out" onPress={logout} /></View>
      </ScrollView>

      {editing && (
        <ProfileEditSheet
          edit={editing}
          profile={profile}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setToast(msg); load(); setTimeout(() => setToast(null), 2200); }}
        />
      )}
      {toast && <View style={styles.toast}><Ionicons name="checkmark-circle" size={16} color="#7BE0A0" /><Text style={styles.toastText}>{toast}</Text></View>}
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  content: { paddingHorizontal: 16, paddingTop: spacing.xl, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 80 },
  loadingText: { color: pilot.muted, fontFamily: fontFamilies.body },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarInit: { backgroundColor: pilot.navy, alignItems: 'center', justifyContent: 'center' },
  avatarInitText: { color: '#fff', fontFamily: fontFamilies.display, fontSize: 26, fontWeight: '600' },
  name: { fontFamily: fontFamilies.display, fontSize: 23, color: pilot.ink, fontWeight: '600' },
  headline: { fontSize: 13, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 3 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 4 },
  chipText: { fontSize: 12, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },

  otw: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  otwTitle: { fontSize: 13.5, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  otwSub: { fontSize: 12.5, color: pilot.muted, fontFamily: fontFamilies.body },

  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 44, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnGhost: { borderWidth: 1, borderColor: pilot.line, backgroundColor: pilot.surface },
  btnGhostText: { color: pilot.ink, fontFamily: fontFamilies.bodySemiBold, fontSize: 13.5 },
  btnPrimary: { backgroundColor: pilot.navy },
  btnPrimaryText: { color: '#fff', fontFamily: fontFamilies.bodySemiBold, fontSize: 13.5 },

  card: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 14, padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontFamily: fontFamilies.display, fontSize: 16, color: pilot.ink, fontWeight: '600' },
  editLink: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: 13 },
  empty: { fontSize: 13, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 6 },

  attnLabel: { fontSize: 11, fontFamily: fontFamilies.bodyBold, letterSpacing: 0.5, color: pilot.muted, textTransform: 'uppercase' },
  attnRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#E3E8EF' },
  attnLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  attnName: { fontSize: 13.5, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink, flexShrink: 1 },
  attnRight: { fontSize: 12.5, fontFamily: fontFamilies.bodySemiBold },

  snap: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 14, overflow: 'hidden' },
  snapCell: { width: '50%', paddingVertical: 12, alignItems: 'center' },
  snapBorderL: { borderLeftWidth: 1, borderLeftColor: pilot.line },
  snapBorderT: { borderTopWidth: 1, borderTopColor: pilot.line },
  snapV: { fontFamily: fontFamilies.display, fontSize: 20, color: pilot.ink, fontWeight: '600' },
  snapU: { fontFamily: fontFamilies.body, fontSize: 12, color: pilot.muted, fontWeight: '400' },
  snapK: { fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2 },

  strengthTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  strengthLabel: { fontSize: 12.5, fontFamily: fontFamilies.bodyMedium, color: pilot.ink },
  strengthPct: { fontSize: 12.5, fontFamily: fontFamilies.mono, color: pilot.ink, fontWeight: '700' },
  bar: { height: 6, borderRadius: 4, backgroundColor: '#E3E8EF', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: pilot.navy, borderRadius: 4 },
  hint: { fontSize: 12.5, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 8, lineHeight: 18 },
  hintB: { color: pilot.ink, fontFamily: fontFamilies.bodySemiBold },
  hintLink: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#E3E8EF', marginHorizontal: -4, paddingHorizontal: 4, borderRadius: 8 },
  rowNested: {},
  rowPressed: { backgroundColor: 'rgba(0,63,136,0.06)' },
  rowMain: { flex: 1, minWidth: 0 },
  rowN: { fontFamily: fontFamilies.bodySemiBold, fontSize: 14, color: pilot.ink },
  rowNFaint: { color: pilot.muted, fontFamily: fontFamilies.bodyMedium },
  rowNnest: { fontFamily: fontFamilies.bodyMedium, fontSize: 13.5, color: pilot.ink },
  rowD: { fontSize: 12.5, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2 },
  rowH: { fontFamily: fontFamilies.body, fontSize: 13, color: pilot.ink, fontWeight: '700' },
  nest: { marginLeft: 12, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: '#E3E8EF' },

  stRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  stText: { fontSize: 12.5, fontFamily: fontFamilies.bodySemiBold },
  dot: { width: 9, height: 9, borderRadius: 5 },

  addRow: { flexDirection: 'row', gap: 18, marginTop: 10 },
  addLink: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: 13 },
  linkSm: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: 12.5 },

  kv: { flexDirection: 'row', gap: 12 },
  kvK: { width: 92, color: pilot.muted, fontSize: 13.5, fontFamily: fontFamilies.body },
  kvV: { flex: 1, fontSize: 13.5, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  tags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: 'rgba(0,63,136,0.07)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 3 },
  tagText: { fontSize: 12.5, fontFamily: fontFamilies.bodySemiBold, color: pilot.navy },

  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontFamily: fontFamilies.bodyBold },

  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  settingsRowText: { flex: 1, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.base, color: pilot.ink },

  toast: { position: 'absolute', bottom: 90, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#14301C', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24 },
  toastText: { color: '#fff', fontSize: 13.5, fontFamily: fontFamilies.bodySemiBold },
});

// ── Flight experience dashboard (PIC/SIC donut + category bars) — used by the
// Flight-map screen, which passes its own `styles`. Kept here for that import.
export function FlightDashboard({ totals, styles, palette }: { totals: Any; styles: Any; palette: ThemePalette }) {
  const total = Number(totals?.totalTime) || 0;
  const pic = Number(totals?.picTime) || 0;
  const sic = Number(totals?.sicTime) || 0;
  const other = Math.max(0, total - pic - sic);
  const R = 46;
  const C = 2 * Math.PI * R;
  const segs = [
    { label: 'PIC', value: pic, color: palette.navy },
    { label: 'SIC', value: sic, color: palette.accentSoft },
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
