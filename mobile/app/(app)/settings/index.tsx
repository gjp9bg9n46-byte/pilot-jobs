// Settings — full page, mirrors frontend/src/pages/Settings.jsx section order:
// Profile completeness → Account (email/verify/change-password) → Job Preferences →
// Notifications → Privacy → Danger Zone (delete). Sign out at the foot.
//
// Divergences from web (flagged in the B-4 report):
//  - Notifications is a LINK to the existing /settings/notifications screen (built
//    in Phase 4b) instead of the inline matrix web renders — per the brief.
//  - Delete collects the password (backend deleteAccount requires it; web sends
//    none and 401s — mobile actually works).
//  - Web's "Data" export card is omitted — it calls /auth/export + /flight-logs/export,
//    which don't exist on the backend (broken on web too).
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import api from '../../../src/lib/api';
import { TextField, SelectField, PrimaryButton, Sheet } from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { buildCompleteness, completenessSubtitle, CompletenessItem } from '../../../src/lib/completeness';
import { fontFamilies, fontSizes, pilot, spacing } from '../../../src/theme/tokens';
import { ThemePalette, useTheme, useThemeColors, useThemedStyles } from '../../../src/theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

const CONTRACT_OPTIONS = ['Full-time', 'Part-time', 'Contract', 'ACMI', 'Wet Lease'];
const ROUTE_OPTIONS = ['Short-haul', 'Long-haul', 'Ultra-long-haul', 'Regional', 'Cargo', 'Charter'];
const CURRENCY_OPTS: [string, string][] = [['USD', 'USD'], ['EUR', 'EUR'], ['GBP', 'GBP'], ['AED', 'AED']];
const PERIOD_OPTS: [string, string][] = [['Per month', 'Per month'], ['Per year', 'Per year']];

function Ring({ pct }: { pct: number }) {
  const pilot = useThemeColors();
  const size = 64; const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pilot.line} strokeWidth={stroke} />
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pilot.navy} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <SvgText x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize={15} fontWeight="600" fill={pilot.ink} fontFamily={fontFamilies.mono}>{`${pct}%`}</SvgText>
    </Svg>
  );
}

function StatusGlyph({ done }: { done: boolean }) {
  const pilot = useThemeColors();
  return done
    ? <Ionicons name="checkmark-circle" size={20} color={pilot.navy} />
    : <Ionicons name="ellipse-outline" size={20} color={pilot.line} />;
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardSub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function TagInput({ value, onChangeText, tags, onAdd, onRemove, placeholder }: {
  value: string; onChangeText: (v: string) => void; tags: string[]; onAdd: () => void; onRemove: (t: string) => void; placeholder: string;
}) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <TextField label="" value={value} onChangeText={onChangeText} placeholder={placeholder} onSubmitEditing={onAdd} returnKeyType="done" autoCapitalize="characters" />
        </View>
        <Pressable style={styles.addBtn} onPress={onAdd}><Text style={styles.addBtnText}>Add</Text></Pressable>
      </View>
      {tags.length > 0 ? (
        <View style={styles.tagWrap}>
          {tags.map((t) => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagText}>{t}</Text>
              <Pressable onPress={() => onRemove(t)} hitSlop={6}><Ionicons name="close" size={13} color={pilot.navy} /></Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function SettingsScreen() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const { mode, setMode } = useTheme();
  const router = useRouter();
  const { user, logout } = useAuth();
  const p = user as Any;

  const [profile, setProfile] = useState<Any | null>(null);
  const [cv, setCv] = useState<Any | null>(null);
  const [totals, setTotals] = useState<Any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Change password
  const [curPw, setCurPw] = useState(''); const [newPw, setNewPw] = useState(''); const [confPw, setConfPw] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null); const [pwErr, setPwErr] = useState<string | null>(null); const [pwLoading, setPwLoading] = useState(false);
  const [verifySending, setVerifySending] = useState(false); const [verifyResend, setVerifyResend] = useState<{ ok: boolean; text: string } | null>(null);

  // Job preferences
  const [countryInput, setCountryInput] = useState(''); const [preferredCountries, setPreferredCountries] = useState<string[]>([]);
  const [aircraftInput, setAircraftInput] = useState(''); const [preferredAircraft, setPreferredAircraft] = useState<string[]>([]);
  const [contractTypes, setContractTypes] = useState<string[]>([]); const [routePreferences, setRoutePreferences] = useState<string[]>([]);
  const [minSalary, setMinSalary] = useState(''); const [salaryCurrency, setSalaryCurrency] = useState('USD'); const [salaryPeriod, setSalaryPeriod] = useState('Per month');
  const [salaryNegotiable, setSalaryNegotiable] = useState(false); const [prefLoading, setPrefLoading] = useState(false); const [prefSaved, setPrefSaved] = useState(false);

  // Privacy
  const [visibleToRecruiters, setVisibleToRecruiters] = useState(true);
  const [anonymousBrowsing, setAnonymousBrowsing] = useState(false);
  const [showSeniority, setShowSeniority] = useState(true);

  // Notifications summary + delete
  const [allEmailOn, setAllEmailOn] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false); const [deletePw, setDeletePw] = useState(''); const [deleteErr, setDeleteErr] = useState<string | null>(null); const [deleting, setDeleting] = useState(false);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    const [pr, cvr] = await Promise.allSettled([api.get('/profile'), api.get('/cv')]);
    if (pr.status === 'fulfilled') {
      const data = pr.value.data; setProfile(data);
      const pref = data?.preferences || {};
      setPreferredCountries(pref.preferredCountries || []); setPreferredAircraft(pref.preferredAircraft || []);
      setContractTypes(pref.contractTypes || []); setRoutePreferences(pref.routePreferences || []);
      setMinSalary(pref.minSalary != null ? String(pref.minSalary) : ''); setSalaryCurrency(pref.salaryCurrency || 'USD');
      setSalaryPeriod(pref.salaryPeriod || 'Per month'); setSalaryNegotiable(!!pref.salaryNegotiable);
      setAllEmailOn(pref.allEmailOn !== false);
      setVisibleToRecruiters(pref.visibleToRecruiters !== false); setAnonymousBrowsing(!!pref.anonymousBrowsing); setShowSeniority(pref.showSeniority !== false);
    }
    if (cvr.status === 'fulfilled') { setCv(cvr.value.data?.cv ?? null); setTotals(cvr.value.data?.totals ?? null); }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const addTag = (val: string, list: string[], setList: (v: string[]) => void, clear: () => void) => {
    const v = val.trim(); if (v && !list.includes(v)) setList([...list, v]); clear();
  };
  const toggleChip = (val: string, list: string[], setList: (v: string[]) => void) =>
    setList(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);

  const changePassword = async () => {
    setPwMsg(null); setPwErr(null);
    if (newPw.length < 8) { setPwErr('New password must be at least 8 characters.'); return; }
    if (newPw !== confPw) { setPwErr('New passwords do not match.'); return; }
    setPwLoading(true);
    try {
      await api.patch('/auth/change-password', { currentPassword: curPw, newPassword: newPw });
      setPwMsg('Password changed successfully.'); setCurPw(''); setNewPw(''); setConfPw('');
    } catch (err) { setPwErr((err as Any)?.response?.data?.message || (err as Any)?.response?.data?.error || 'Failed to change password.'); }
    finally { setPwLoading(false); }
  };

  const resendVerify = async () => {
    setVerifySending(true); setVerifyResend(null);
    try { const { data } = await api.post('/auth/resend-verification'); setVerifyResend({ ok: true, text: data?.message || 'Verification link sent — check your email.' }); }
    catch (err) { setVerifyResend({ ok: false, text: (err as Any)?.response?.status === 429 ? 'Too many requests. Wait an hour and try again.' : 'Could not send. Try again later.' }); }
    finally { setVerifySending(false); }
  };

  const savePreferences = async () => {
    setPrefLoading(true);
    try {
      await api.put('/profile/preferences', {
        preferredCountries, preferredAircraft, contractTypes, routePreferences,
        minSalary: salaryNegotiable ? null : (minSalary === '' ? null : Number(minSalary)),
        salaryCurrency, salaryPeriod, salaryNegotiable,
      });
      setPrefSaved(true); setTimeout(() => setPrefSaved(false), 2000);
    } catch { showToast('Failed to save preferences.'); }
    finally { setPrefLoading(false); }
  };

  const privacyToggle = (key: string, value: boolean) => {
    if (key === 'visibleToRecruiters') setVisibleToRecruiters(value);
    if (key === 'anonymousBrowsing') setAnonymousBrowsing(value);
    if (key === 'showSeniority') setShowSeniority(value);
    api.put('/profile/preferences', { [key]: value }).catch(() => {});
  };

  const confirmDelete = async () => {
    setDeleteErr(null); setDeleting(true);
    try { await api.delete('/auth/account', { data: { password: deletePw } }); await logout(); router.replace('/(auth)/login'); }
    catch (err) { setDeleteErr((err as Any)?.response?.data?.error || (err as Any)?.response?.data?.message || 'Failed to delete account.'); }
    finally { setDeleting(false); }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe} edges={['bottom']}><View style={styles.center}><ActivityIndicator color={pilot.navy} /></View></SafeAreaView>;
  }

  const { core, recommended, pct } = buildCompleteness(profile, cv, totals);
  const emailVerified = p?.emailVerified;

  const CompRow = ({ item }: { item: CompletenessItem }) => (
    <Pressable style={styles.compRow} onPress={() => router.push(item.to as never)}>
      <StatusGlyph done={item.done} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.compLabel}>{item.label}</Text>
        <Text style={styles.compHint}>{item.hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={pilot.muted} />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pilot.navy} />}>
        <Text style={styles.h1}>Settings</Text>
        <Text style={styles.subtitle}>Manage your account, preferences, notifications, and data.</Text>

        {/* Profile completeness */}
        <View style={styles.card}>
          <View style={styles.compHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Profile completeness</Text>
              <Text style={styles.cardSub}>{completenessSubtitle(pct)}</Text>
            </View>
            <Ring pct={pct} />
          </View>
          {core.map((item) => <CompRow key={item.key} item={item} />)}
          <Text style={styles.recLabel}>Recommended</Text>
          {recommended.map((item) => <CompRow key={item.key} item={item} />)}
        </View>

        {/* Appearance — instant theme toggle, persisted across launches */}
        <Card title="Appearance" subtitle="Switch between the light and dark look.">
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.toggleLabel}>Dark theme</Text>
              <Text style={styles.compHint}>Navy background across the whole app</Text>
            </View>
            <Switch
              value={mode === 'dark'}
              onValueChange={(v) => setMode(v ? 'dark' : 'light')}
              trackColor={{ true: pilot.navy, false: pilot.line }}
            />
          </View>
        </Card>

        {/* Account */}
        <Card title="Account" subtitle="Your login credentials and security settings.">
          <TextField label="Email Address" value={p?.email || ''} editable={false} style={{ opacity: 0.6 }} />
          <View style={{ marginTop: 6, marginBottom: 16 }}>
            {emailVerified
              ? <Text style={styles.verified}>✓ Email verified</Text>
              : verifyResend
                ? <Text style={[styles.hint, { color: verifyResend.ok ? '#166534' : '#991B1B' }]}>{verifyResend.text}</Text>
                : <Pressable onPress={resendVerify} disabled={verifySending}><Text style={styles.linkText}>⚠ Email not verified. {verifySending ? 'Sending…' : 'Resend verification link'}</Text></Pressable>}
          </View>
          <View style={styles.divider} />
          <Text style={styles.subhead}>Change Password</Text>
          <TextField label="Current Password" value={curPw} onChangeText={setCurPw} secureTextEntry placeholder="Enter current password" />
          <TextField label="New Password" value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="At least 8 characters" />
          <TextField label="Confirm New Password" value={confPw} onChangeText={setConfPw} secureTextEntry placeholder="Repeat new password" />
          {pwMsg ? <Text style={styles.successBanner}>{pwMsg}</Text> : null}
          {pwErr ? <Text style={styles.errorBanner}>{pwErr}</Text> : null}
          <View style={{ marginTop: 12 }}><PrimaryButton label={pwLoading ? 'Saving…' : 'Update Password'} onPress={changePassword} loading={pwLoading} /></View>
        </Card>

        {/* Job Preferences */}
        <Card title="Job Preferences" subtitle="Tell us what kinds of opportunities you are looking for.">
          <Text style={styles.fieldLabel}>Preferred Countries</Text>
          <TagInput value={countryInput} onChangeText={setCountryInput} tags={preferredCountries} placeholder="e.g. UAE, Germany, USA"
            onAdd={() => addTag(countryInput, preferredCountries, setPreferredCountries, () => setCountryInput(''))}
            onRemove={(t) => setPreferredCountries(preferredCountries.filter((x) => x !== t))} />
          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>Preferred Aircraft Types</Text>
          <TagInput value={aircraftInput} onChangeText={setAircraftInput} tags={preferredAircraft} placeholder="e.g. B737, A320, B777"
            onAdd={() => addTag(aircraftInput, preferredAircraft, setPreferredAircraft, () => setAircraftInput(''))}
            onRemove={(t) => setPreferredAircraft(preferredAircraft.filter((x) => x !== t))} />
          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>Contract Types</Text>
          <View style={styles.chipRow}>{CONTRACT_OPTIONS.map((o) => <Chip key={o} label={o} active={contractTypes.includes(o)} onPress={() => toggleChip(o, contractTypes, setContractTypes)} />)}</View>
          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>Route Preferences</Text>
          <View style={styles.chipRow}>{ROUTE_OPTIONS.map((o) => <Chip key={o} label={o} active={routePreferences.includes(o)} onPress={() => toggleChip(o, routePreferences, setRoutePreferences)} />)}</View>
          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>Minimum Salary</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1.2 }}><TextField label="" value={minSalary} onChangeText={setMinSalary} editable={!salaryNegotiable} keyboardType="numeric" placeholder="Amount" /></View>
            <View style={{ flex: 1 }}><SelectField label="" value={salaryCurrency} options={CURRENCY_OPTS} onSelect={setSalaryCurrency} /></View>
          </View>
          <View style={{ marginTop: 8 }}><SelectField label="" value={salaryPeriod} options={PERIOD_OPTS} onSelect={setSalaryPeriod} /></View>
          <Pressable style={styles.checkRow} onPress={() => setSalaryNegotiable((v) => !v)}>
            <Ionicons name={salaryNegotiable ? 'checkbox' : 'square-outline'} size={20} color={salaryNegotiable ? pilot.navy : pilot.muted} />
            <Text style={styles.checkLabel}>Negotiable</Text>
          </Pressable>
          <View style={{ marginTop: 12 }}><PrimaryButton label={prefSaved ? 'Saved ✓' : prefLoading ? 'Saving…' : 'Save Preferences'} onPress={savePreferences} loading={prefLoading} /></View>
        </Card>

        {/* Notifications — links to the dedicated screen */}
        <Card title="Notifications" subtitle="Choose what emails you receive from CockpitHire.">
          <Pressable style={styles.linkRow} onPress={() => router.push('/settings/notifications')}>
            <Ionicons name="notifications-outline" size={20} color={pilot.navy} />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkRowTitle}>Email notifications</Text>
              <Text style={styles.compHint}>{allEmailOn ? 'All email notifications on' : 'Email notifications off'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={pilot.muted} />
          </Pressable>
        </Card>

        {/* Help & more — Support moved here from the old drawer; Airlines link
            keeps the directory reachable now that it's off the tab bar. */}
        <Card title="Help & More" subtitle="Support and other sections.">
          <Pressable style={styles.linkRow} onPress={() => router.push('/support')}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={pilot.navy} />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkRowTitle}>Support</Text>
              <Text style={styles.compHint}>FAQs and contact options</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={pilot.muted} />
          </Pressable>
          <Pressable style={styles.linkRow} onPress={() => router.push('/airlines')}>
            <Ionicons name="airplane-outline" size={20} color={pilot.navy} />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkRowTitle}>Airlines Directory</Text>
              <Text style={styles.compHint}>Browse airlines and hiring status</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={pilot.muted} />
          </Pressable>
        </Card>

        {/* Admin — visible to admin accounts only (moved here from the old drawer) */}
        {p?.isAdmin === true ? (
          <Card title="Admin" subtitle="Moderation and platform tools.">
            {[
              { label: 'Admin Dashboard', route: '/admin/dashboard' },
              { label: 'Airline Moderation', route: '/admin/moderation' },
              { label: 'Employer Moderation', route: '/admin/employers' },
            ].map((item) => (
              <Pressable key={item.route} style={styles.linkRow} onPress={() => router.push(item.route as never)}>
                <Ionicons name="shield-checkmark-outline" size={20} color={pilot.navy} />
                <Text style={[styles.linkRowTitle, { flex: 1 }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={pilot.muted} />
              </Pressable>
            ))}
          </Card>
        ) : null}

        {/* Privacy */}
        <Card title="Privacy" subtitle="Control how your profile and activity are visible.">
          {[
            { key: 'visibleToRecruiters', value: visibleToRecruiters, label: 'Profile visible to recruiters', desc: 'Allow airlines and recruiters to view your profile' },
            { key: 'anonymousBrowsing', value: anonymousBrowsing, label: 'Anonymous browsing', desc: 'Browse jobs without leaving a trace' },
            { key: 'showSeniority', value: showSeniority, label: 'Show seniority publicly', desc: 'Display your total hours and seniority on your public profile' },
          ].map((item, i, arr) => (
            <View key={item.key} style={[styles.toggleRow, i < arr.length - 1 && styles.toggleRowBorder]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.toggleLabel}>{item.label}</Text>
                <Text style={styles.compHint}>{item.desc}</Text>
              </View>
              <Switch value={item.value} onValueChange={(v) => privacyToggle(item.key, v)} trackColor={{ true: pilot.navy, false: pilot.line }} />
            </View>
          ))}
        </Card>

        {/* Danger Zone */}
        <View style={styles.dangerCard}>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <Text style={styles.dangerSub}>Permanent and irreversible actions.</Text>
          <View style={styles.dangerRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.dangerLabel}>Delete Account</Text>
              <Text style={styles.dangerHint}>Permanently remove your account and all associated data.</Text>
            </View>
            <Pressable style={styles.deleteBtn} onPress={() => { setDeleteErr(null); setDeletePw(''); setDeleteOpen(true); }}><Text style={styles.deleteBtnText}>Delete</Text></Pressable>
          </View>
        </View>

        <Pressable style={styles.signOut} onPress={logout}><Ionicons name="log-out-outline" size={18} color={pilot.muted} /><Text style={styles.signOutText}>Sign Out</Text></Pressable>
      </ScrollView>

      <Sheet visible={deleteOpen} title="Delete account?" onClose={() => setDeleteOpen(false)}>
        <Text style={styles.dim}>This permanently removes your account and all data. This cannot be undone. Enter your password to confirm.</Text>
        <View style={{ height: 12 }} />
        <TextField label="Password" value={deletePw} onChangeText={setDeletePw} secureTextEntry placeholder="Your password" />
        {deleteErr ? <Text style={styles.errorBanner}>{deleteErr}</Text> : null}
        <View style={{ height: 8 }} />
        <Pressable style={[styles.deleteConfirm, (deleting || !deletePw) && { opacity: 0.5 }]} onPress={confirmDelete} disabled={deleting || !deletePw}>
          <Text style={styles.deleteConfirmText}>{deleting ? 'Deleting…' : 'Delete account'}</Text>
        </Pressable>
      </Sheet>

      {toast ? <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View> : null}
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  content: { padding: spacing.xl, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes['3xl'], color: pilot.ink, marginBottom: 4 },
  subtitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, marginBottom: 20 },
  dim: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, lineHeight: 20 },

  card: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 20, marginBottom: 16 },
  cardTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.lg, color: pilot.ink },
  cardSub: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 3, marginBottom: 12, lineHeight: 18 },

  compHead: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 10 },
  compRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  compLabel: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  compHint: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 1 },
  recLabel: { fontSize: 11, fontFamily: fontFamilies.bodyBold, color: pilot.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: pilot.line },

  divider: { borderTopWidth: 1, borderTopColor: pilot.line, marginVertical: 16 },
  subhead: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink, marginBottom: 12 },
  fieldLabel: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.bodySemiBold, marginBottom: 8 },
  verified: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body },
  linkText: { fontSize: fontSizes.sm, color: pilot.navy, fontFamily: fontFamilies.bodyMedium },
  hint: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body },
  successBanner: { backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 6, padding: 10, color: '#166534', fontSize: fontSizes.sm, marginTop: 12, fontFamily: fontFamilies.body, overflow: 'hidden' },
  errorBanner: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 6, padding: 10, color: '#991B1B', fontSize: fontSizes.sm, marginTop: 12, fontFamily: fontFamilies.body, overflow: 'hidden' },

  addBtn: { backgroundColor: pilot.navy, borderRadius: 4, paddingHorizontal: 16, minHeight: 46, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,63,136,0.08)', borderWidth: 1, borderColor: pilot.navy, borderRadius: 20, paddingLeft: 12, paddingRight: 8, paddingVertical: 4 },
  tagText: { fontSize: fontSizes.sm, color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: pilot.line, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: pilot.surface },
  chipActive: { borderColor: pilot.navy, backgroundColor: 'rgba(0,63,136,0.08)' },
  chipText: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.bodyMedium },
  chipTextActive: { color: pilot.navy },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  checkLabel: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  linkRowTitle: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  toggleRowBorder: { borderBottomWidth: 1, borderBottomColor: pilot.line },
  toggleLabel: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },

  dangerCard: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, padding: 20, marginBottom: 16 },
  dangerTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.lg, color: '#991B1B' },
  dangerSub: { fontSize: fontSizes.xs, color: '#991B1B', opacity: 0.85, marginTop: 3, marginBottom: 14 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dangerLabel: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodyBold, color: '#991B1B' },
  dangerHint: { fontSize: fontSizes.xs, color: '#991B1B', opacity: 0.85, marginTop: 2, lineHeight: 16 },
  deleteBtn: { backgroundColor: '#991B1B', borderRadius: 6, paddingVertical: 10, paddingHorizontal: 16 },
  deleteBtnText: { color: '#fff', fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },

  deleteConfirm: { backgroundColor: '#991B1B', borderRadius: 6, paddingVertical: 13, alignItems: 'center' },
  deleteConfirmText: { color: '#fff', fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base },

  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: pilot.line, borderRadius: 8, paddingVertical: 13, marginTop: 4 },
  signOutText: { color: pilot.muted, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base },

  toast: { position: 'absolute', bottom: 40, left: 24, right: 24, backgroundColor: '#0F1419', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
  toastText: { color: '#fff', fontSize: fontSizes.sm, fontFamily: fontFamilies.body, textAlign: 'center' },
});
