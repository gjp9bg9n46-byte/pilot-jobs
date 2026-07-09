// Pilot notification settings — mirrors the Notifications card in
// frontend/src/pages/Settings.jsx (editorial-light). Master "All email notifications"
// switch + 6 per-category email toggles (disabled when master off) + quiet hours
// (native time pickers) + a push-notification enable row. Loads from GET /profile
// `preferences`; saves the EXACT web payload via PUT /profile/preferences.
//
// ⚠️ KNOWN BACKEND BUG: PUT /profile/preferences 500s — updatePreferences spreads
// req.body straight into prisma.pilotPreference.upsert, but the payload keys
// (allEmailOn, newJobMatch, quietFrom, …) don't match the schema columns
// (notifyEmail, notifyMatchesEmail, quietHoursStart, …). We wire the correct web
// payload, catch the 500, show a friendly toast, and log the request/response for
// the bug report. Do NOT touch backend here (separate follow-up).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../../../src/lib/api';
import { PrimaryButton } from '../../../src/components/ui';
import { getPushPermissionStatus, registerForPush, type PushStatus } from '../../../src/lib/push';
import { fontFamilies, fontSizes, pilot, semantic, spacing } from '../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../src/theme/ThemeContext';

const NOTIF_ROWS: [string, string, string?][] = [
  ['newJobMatch', 'New Job Match'],
  ['alertDigest', 'Alert Digest'],
  ['applicationUpdate', 'Application Update'],
  ['documentExpiry', 'Document Expiries', 'Alerts for licence, medical, and document expiry dates.'],
  ['productUpdates', 'Product Updates'],
];

// "HH:MM" ⇄ Date on today.
const timeToDate = (t: string) => { const [h, m] = (t || '00:00').split(':').map(Number); const d = new Date(); d.setHours(h || 0, m || 0, 0, 0); return d; };
const dateToTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.timeLabel}>{label}</Text>
      <Pressable style={styles.timeInput} onPress={() => Platform.OS !== 'web' && setOpen(true)} accessibilityLabel={`Quiet hours ${label}`}>
        <Text style={styles.timeValue}>{value}</Text>
        <Ionicons name="time-outline" size={16} color={pilot.muted} />
      </Pressable>
      {open ? (
        <DateTimePicker
          value={timeToDate(value)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_e, d) => { setOpen(Platform.OS === 'ios'); if (d) onChange(dateToTime(d)); }}
        />
      ) : null}
    </View>
  );
}

export default function NotificationsSettings() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [allEmailOn, setAllEmailOn] = useState(true);
  const [matrix, setMatrix] = useState<Record<string, boolean>>({
    newJobMatch: true, alertDigest: true, applicationUpdate: true,
    documentExpiry: true, productUpdates: false,
  });
  const [quietHours, setQuietHours] = useState(false);
  const [quietFrom, setQuietFrom] = useState('22:00');
  const [quietTo, setQuietTo] = useState('07:00');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const [pushStatus, setPushStatus] = useState<PushStatus>('undetermined');
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    api.get('/profile').then((res) => {
      const p = res.data?.preferences || {};
      setAllEmailOn(p.allEmailOn !== false);
      setMatrix({
        newJobMatch: p.newJobMatch !== false, alertDigest: p.alertDigest !== false,
        applicationUpdate: p.applicationUpdate !== false,
        // Fold any legacy split keys into the merged toggle (true if either was on).
        documentExpiry: p.documentExpiry !== undefined
          ? p.documentExpiry !== false
          : (p.certificateExpiry !== false || p.medicalExpiry !== false),
        productUpdates: !!p.productUpdates,
      });
      setQuietHours(!!p.quietHours);
      setQuietFrom(p.quietFrom || '22:00');
      setQuietTo(p.quietTo || '07:00');
    }).catch(() => {});
    getPushPermissionStatus().then(setPushStatus);
  }, []);

  const showToast = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 5000); };

  const save = async () => {
    setSaving(true);
    // Exact payload the web app sends (handleSaveNotifications).
    const payload = { allEmailOn, ...matrix, quietHours, quietFrom, quietTo };
    try {
      await api.put('/profile/preferences', payload);
      showToast(true, 'Notification preferences saved.');
    } catch (err: any) {
      // Log the precise request/response for the backend bug report — never surface raw.
      console.log('[prefs] PUT /profile/preferences FAILED', {
        request: payload,
        status: err?.response?.status,
        response: err?.response?.data,
      });
      showToast(false, 'Something went wrong saving your preferences — please try again shortly.');
    } finally {
      setSaving(false);
    }
  };

  const enablePush = async () => {
    setPushBusy(true);
    const res = await registerForPush(true);
    setPushStatus(res.status);
    setPushToken(res.token);
    setPushBusy(false);
  };

  const pushLabel = pushBusy ? 'Requesting…'
    : pushStatus === 'granted' ? 'Push enabled ✓'
    : pushStatus === 'denied' ? 'Enable in iOS Settings'
    : pushStatus === 'unsupported' ? 'Not available on web'
    : 'Enable push notifications';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Text style={styles.back}>← Back</Text></Pressable>
        <Text style={styles.topTitle}>Notifications</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sub}>Choose what emails you receive from CockpitHire.</Text>

        {/* Master toggle */}
        <View style={styles.masterCard}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.masterTitle}>All email notifications</Text>
            <Text style={styles.masterDesc}>Master switch — disabling this overrides all per-category settings</Text>
          </View>
          <Switch value={allEmailOn} onValueChange={setAllEmailOn} trackColor={{ true: pilot.navy, false: '#D8D3C8' }} thumbColor="#fff" ios_backgroundColor="#D8D3C8" />
        </View>

        {/* Per-category matrix */}
        <View style={styles.card}>
          <View style={styles.matrixHead}>
            <Text style={styles.matrixHeadCat}>CATEGORY</Text>
            <Text style={styles.matrixHeadEmail}>EMAIL</Text>
          </View>
          {NOTIF_ROWS.map(([key, label, desc]) => (
            <View key={key} style={styles.matrixRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.matrixLabel, !allEmailOn && styles.dim]}>{label}</Text>
                {desc ? <Text style={[styles.matrixDesc, !allEmailOn && styles.dim]}>{desc}</Text> : null}
              </View>
              <Switch
                value={matrix[key]}
                disabled={!allEmailOn}
                onValueChange={(v) => setMatrix((m) => ({ ...m, [key]: v }))}
                trackColor={{ true: pilot.navy, false: '#D8D3C8' }}
                thumbColor="#fff"
                ios_backgroundColor="#D8D3C8"
                style={!allEmailOn ? { opacity: 0.4 } : undefined}
              />
            </View>
          ))}
        </View>

        {/* Quiet hours */}
        <View style={styles.card}>
          <View style={styles.quietHead}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.masterTitle}>Enable quiet hours</Text>
              <Text style={styles.masterDesc}>Pause notifications during specified hours</Text>
            </View>
            <Switch value={quietHours} onValueChange={setQuietHours} trackColor={{ true: pilot.navy, false: '#D8D3C8' }} thumbColor="#fff" ios_backgroundColor="#D8D3C8" />
          </View>
          {quietHours ? (
            <View style={styles.timeRow}>
              <TimeField label="From" value={quietFrom} onChange={setQuietFrom} />
              <TimeField label="To" value={quietTo} onChange={setQuietTo} />
            </View>
          ) : null}
        </View>

        {/* Push notifications */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Push notifications</Text>
          <Text style={styles.masterDesc}>Get alerts on this device for new matches and application updates.</Text>
          <Pressable style={[styles.pushBtn, (pushStatus === 'granted' || pushStatus === 'unsupported') && styles.pushBtnDone]} onPress={enablePush} disabled={pushBusy || pushStatus === 'granted' || pushStatus === 'unsupported'} accessibilityLabel="Enable push notifications">
            <Ionicons name={pushStatus === 'granted' ? 'checkmark-circle' : 'notifications'} size={16} color={pushStatus === 'granted' ? semantic.success : pilot.navy} />
            <Text style={[styles.pushBtnText, pushStatus === 'granted' && { color: semantic.success }]}>{pushLabel}</Text>
          </Pressable>
          {pushStatus === 'denied' ? <Text style={styles.pushHint}>Push permission was denied. Re-enable it from the iOS Settings app.</Text> : null}
          {pushToken ? <Text style={styles.pushToken} numberOfLines={2}>Token: {pushToken}</Text> : null}
        </View>

        <PrimaryButton label={saving ? 'Saving…' : 'Save Notification Preferences'} onPress={save} loading={saving} accessibilityLabel="Save Notification Preferences" />
      </ScrollView>

      {toast ? (
        <View style={[styles.toast, { backgroundColor: toast.ok ? semantic.successBg : semantic.errorBg, borderColor: toast.ok ? '#BBF7D0' : '#FECACA' }]}>
          <Text style={[styles.toastText, { color: toast.ok ? semantic.success : semantic.error }]}>{toast.msg}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: pilot.line },
  back: { color: pilot.navy, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.base },
  topTitle: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.md, color: pilot.ink },
  content: { padding: spacing.xl, paddingBottom: 48 },
  sub: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, marginBottom: 20 },
  masterCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, padding: 16, marginBottom: 14 },
  masterTitle: { fontSize: fontSizes.base, color: pilot.ink, fontFamily: fontFamilies.bodyBold },
  masterDesc: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 3, lineHeight: 17 },
  card: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: fontSizes.base, color: pilot.ink, fontFamily: fontFamilies.bodyBold, marginBottom: 4 },
  matrixHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: pilot.line },
  matrixHeadCat: { fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.bodyBold, letterSpacing: 1 },
  matrixHeadEmail: { fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.bodyBold, letterSpacing: 1 },
  matrixRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: pilot.line },
  matrixLabel: { fontSize: fontSizes.base, color: pilot.ink, fontFamily: fontFamilies.body },
  matrixDesc: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2, lineHeight: 16 },
  dim: { opacity: 0.4 },
  quietHead: { flexDirection: 'row', alignItems: 'center' },
  timeRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  timeLabel: { fontSize: fontSizes.sm, color: pilot.ink, fontFamily: fontFamilies.bodyMedium, marginBottom: 6 },
  timeInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: pilot.line, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: pilot.surface },
  timeValue: { fontSize: fontSizes.md, color: pilot.ink, fontFamily: fontFamilies.mono },
  pushBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: pilot.navy, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 10, marginTop: 12 },
  pushBtnDone: { borderColor: '#BBF7D0', backgroundColor: semantic.successBg },
  pushBtnText: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  pushHint: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 8, lineHeight: 17 },
  pushToken: { fontSize: 10, color: pilot.muted, fontFamily: fontFamilies.mono, marginTop: 8 },
  toast: { position: 'absolute', bottom: 24, left: 20, right: 20, borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18 },
  toastText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold, textAlign: 'center' },
});
