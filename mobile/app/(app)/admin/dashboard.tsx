// Admin dashboard — mirrors frontend/src/pages/AdminDashboard.jsx. Dark operator
// surface. GET /admin/stats → { actionQueues, platform, recent30d }. Action-required
// tiles deep-link to the Employers / Moderation tabs. "Send test email" hits
// POST /admin/notifications/test (Resend health check) → { sentTo, messageId }.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { useAuth } from '../../../src/context/AuthContext';
import { admin, fontFamilies, fontSizes, spacing } from '../../../src/theme/tokens';

type Stats = {
  actionQueues: { pendingContributions: number; pendingEmployers: number };
  platform: { activePilots: number; activeEmployers: number; activeAirlines: number };
  recent30d: { jobsPosted: number; applicationsSubmitted: number; newContributions: number };
};

function Tile({ value, label, color = admin.ink, onPress }: { value: string | number; label: string; color?: string; onPress?: () => void }) {
  const inner = (
    <>
      <Text style={[styles.tileNum, { color }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {onPress ? <Text style={styles.tileArrow}>Review →</Text> : null}
    </>
  );
  return onPress
    ? <Pressable style={styles.tile} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value} — review`}>{inner}</Pressable>
    : <View style={styles.tile}>{inner}</View>;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { logout } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    api.get('/admin/stats')
      .then(({ data }) => setStats(data))
      .catch((err) => {
        if (err?.response?.status === 404 || err?.response?.status === 401) router.replace('/jobs');
        else setError(true);
      })
      .finally(() => setLoading(false));
  }, [router]);
  useEffect(() => { load(); }, [load]);

  // Send-test-email — one-tap Resend health check.
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const sendTest = async () => {
    setTestSending(true);
    setTestMsg(null);
    if (timer.current) clearTimeout(timer.current);
    try {
      const { data } = await api.post('/admin/notifications/test');
      setTestMsg({ ok: true, text: `Test email sent — check ${data.sentTo}. Message ID: ${data.messageId}` });
      timer.current = setTimeout(() => setTestMsg(null), 8000);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Unknown error';
      setTestMsg({ ok: false, text: `Failed to send test email: ${msg}. Check Resend dashboard.` });
    } finally {
      setTestSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={admin.accent} />}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Admin Dashboard</Text>
            <Text style={styles.sub}>Queues, platform health, and the last 30 days at a glance.</Text>
          </View>
          <Pressable onPress={logout} hitSlop={8} accessibilityLabel="Sign out">
            <Ionicons name="log-out-outline" size={22} color={admin.muted} />
          </Pressable>
        </View>

        {loading && !stats ? <View style={styles.center}><ActivityIndicator color={admin.accent} /></View> : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Failed to load admin stats.</Text>
            <Pressable onPress={load}><Text style={styles.retry}>Retry</Text></Pressable>
          </View>
        ) : null}

        {stats ? (
          <>
            <Text style={styles.sectionLabel}>ACTION REQUIRED</Text>
            <View style={styles.grid}>
              <Tile value={stats.actionQueues.pendingContributions} label="Pending contributions" color={stats.actionQueues.pendingContributions > 0 ? admin.queue : admin.ink} onPress={() => router.push('/admin/moderation')} />
              <Tile value={stats.actionQueues.pendingEmployers} label="Pending employers" color={stats.actionQueues.pendingEmployers > 0 ? admin.queue : admin.ink} onPress={() => router.push('/admin/employers')} />
            </View>

            <Text style={styles.sectionLabel}>PLATFORM</Text>
            <View style={styles.grid}>
              <Tile value={stats.platform.activePilots.toLocaleString()} label="Pilots" />
              <Tile value={stats.platform.activeEmployers.toLocaleString()} label="Approved employers" />
              <Tile value={stats.platform.activeAirlines.toLocaleString()} label="Airlines" />
            </View>

            <Text style={styles.sectionLabel}>LAST 30 DAYS</Text>
            <View style={styles.grid}>
              <Tile value={stats.recent30d.jobsPosted.toLocaleString()} label="Jobs posted" />
              <Tile value={stats.recent30d.applicationsSubmitted.toLocaleString()} label="Applications submitted" />
              <Tile value={stats.recent30d.newContributions.toLocaleString()} label="New contributions" />
            </View>

            <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
            <View style={styles.notifCard}>
              <Pressable
                style={[styles.testBtn, testSending && styles.testBtnDim]}
                onPress={sendTest}
                disabled={testSending}
                accessibilityLabel="Send test email"
              >
                <Ionicons name="send" size={15} color={testSending ? admin.muted : admin.onAccent} />
                <Text style={[styles.testBtnText, testSending && { color: admin.muted }]}>{testSending ? 'Sending…' : 'Send test email'}</Text>
              </Pressable>
              <Text style={styles.notifHint}>Sends a test email to your admin address to verify the Resend integration.</Text>
              {testMsg ? (
                <View style={[styles.testMsg, { backgroundColor: testMsg.ok ? 'rgba(52,211,153,0.1)' : 'rgba(231,76,60,0.1)', borderColor: testMsg.ok ? 'rgba(52,211,153,0.35)' : 'rgba(231,76,60,0.35)' }]}>
                  <Text style={[styles.testMsgText, { color: testMsg.ok ? admin.success : admin.dangerBright }]}>{testMsg.text}</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: admin.bg },
  content: { padding: spacing.xl, paddingBottom: 40 },
  center: { paddingVertical: 60, alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  h1: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.xl, color: admin.ink },
  sub: { fontSize: fontSizes.xs, color: admin.dim, marginTop: 4, fontFamily: fontFamilies.body },
  sectionLabel: { fontSize: 11, fontFamily: fontFamilies.bodyBold, letterSpacing: 1, color: admin.muted, marginTop: 24, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, flexBasis: '45%', backgroundColor: admin.surface, borderWidth: 1, borderColor: admin.line, borderRadius: 12, padding: 18 },
  tileNum: { fontFamily: fontFamilies.mono, fontSize: 30, color: admin.ink },
  tileLabel: { fontSize: fontSizes.sm, color: admin.muted, marginTop: 6, fontFamily: fontFamilies.body },
  tileArrow: { fontSize: fontSizes.xs, color: admin.accent, marginTop: 8, fontFamily: fontFamilies.bodySemiBold },
  notifCard: { backgroundColor: admin.surface, borderWidth: 1, borderColor: admin.line, borderRadius: 12, padding: 18 },
  testBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: admin.accent, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  testBtnDim: { backgroundColor: admin.surfaceAlt },
  testBtnText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold, color: admin.onAccent },
  notifHint: { fontSize: fontSizes.xs, color: admin.muted, marginTop: 10, fontFamily: fontFamilies.body, lineHeight: 18 },
  testMsg: { marginTop: 12, padding: 12, borderRadius: 8, borderWidth: 1 },
  testMsgText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.body, lineHeight: 20 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(231,76,60,0.1)', borderWidth: 1, borderColor: 'rgba(231,76,60,0.3)', borderRadius: 10, padding: 14, marginTop: 12 },
  errorText: { color: admin.danger, fontSize: fontSizes.sm, fontFamily: fontFamilies.body },
  retry: { color: admin.accent, fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.sm },
});
