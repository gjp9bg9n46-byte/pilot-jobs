// Dashboard — the pilot's home tab (replaces Alerts as the landing screen).
// Mirrors the web Dashboard (frontend/src/pages/Dashboard.jsx) section-for-section:
// a blocker bar, "New jobs for you" with All matches / You qualify / 1 short tabs,
// "Your applications" with the Did-you-apply prompt, and profile / alerts / saved-
// search cards. One GET /api/dashboard call powers all of it; the match % + status
// come straight from the server (services/jobMatch.js) via statusMeta — the SAME
// number web shows, never recomputed on the client.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { statusMeta } from '../../../src/lib/jobMatch';
import { companyName, locationName } from '../../../src/lib/displayNames';
import { useUnread } from '../../../src/context/UnreadContext';
import { fontFamilies, fontSizes, spacing } from '../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../src/theme/ThemeContext';
import { hours } from '../../../src/lib/format';
import { useTabBarClearance } from '../../../src/theme/tabBar';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

const SEM = { green: '#15803D', greenbg: '#ECF7EF', amber: '#B45309', amberbg: '#FEF6E7', red: '#B42318', redbg: '#FDEEEC' };
const STATUS_DOT: Record<string, string> = { OPENED: '#8592A3', APPLIED: '#003F88', INTERVIEW: SEM.green, OFFER: SEM.green, NOT_SELECTED: SEM.red, CLOSED: '#CBD3DD' };
const STATUS_LABEL: Record<string, string> = { OPENED: 'Opened', APPLIED: 'Applied', INTERVIEW: 'Interview', OFFER: 'Offer', NOT_SELECTED: 'Not selected', CLOSED: 'Closed' };

const ago = (d?: string | null) => {
  if (!d) return null;
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  if (days <= 0) return 'today'; if (days === 1) return '1 day ago'; return `${days} days ago`;
};
const weekday = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-US', { weekday: 'long' }) : null);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtD = (iso?: string | null) => { if (!iso) return null; const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const daysSince = (iso?: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : Infinity);

export default function DashboardScreen() {
  const tabBarClearance = useTabBarClearance();
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { refresh } = useUnread();
  const [data, setData] = useState<Any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'allNew' | 'qualify' | 'oneShort'>('allNew');
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const res = await api.get('/dashboard'); setData(res.data); setErr(null); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    catch (e: any) { setErr(e?.response?.data?.error || 'Could not load your dashboard.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Reload on every focus (bell/tab return) so counts + "new" stay fresh.
  useFocusEffect(useCallback(() => { load().then(refresh); }, [load, refresh]));

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); refresh(); setRefreshing(false); }, [load, refresh]);

  const setStatus = async (id: string, status: string) => {
    setData((d: Any) => ({ ...d, applications: d.applications.map((a: Any) => (a.id === id ? { ...a, status } : a)) }));
    try { await api.patch(`/jobs/applications/${id}/status`, { status }); } catch { /* optimistic; server reconciles next load */ }
  };

  if (err) return <SafeAreaView style={styles.safe} edges={[]}><View style={styles.center}><Text style={styles.emptyTitle}>Could not load dashboard</Text><Text style={styles.dim}>{err}</Text></View></SafeAreaView>;
  if (!data) return <SafeAreaView style={styles.safe} edges={[]}><View style={styles.center}><ActivityIndicator color={pilot.navy} /><Text style={styles.dim}>Loading your dashboard…</Text></View></SafeAreaView>;

  const nj = data.newJobs;
  // New items first (stable — keeps the server's match%/recency order within each group).
  const list: Any[] = [...((nj && (nj[tab] || nj.allNew)) || [])].sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
  const newCount = nj?.newSinceLastVisit ?? 0;
  const lastDay = weekday(nj?.lastVisit);
  const prof = data.profile || {};
  const al = data.alertSettings;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pilot.navy} />}
      >
        {/* Header */}
        <Text style={styles.h1}>Dashboard</Text>
        <Text style={styles.subtitle}>
          {newCount > 0
            ? `${newCount} new job${newCount === 1 ? '' : 's'}${lastDay ? ` since your last visit on ${lastDay}` : ' for you'}.`
            : 'No new jobs since your last visit.'}
        </Text>

        {/* Blocker bar — one line per item (#4): red=expired, amber=expiring */}
        {data.blockers?.count > 0 && data.blockers.items.map((i: Any) => {
          const expired = i.days != null && i.days < 0;
          const c = expired ? { bg: SEM.redbg, bd: '#F4CFCB', fg: SEM.red } : { bg: SEM.amberbg, bd: '#F5E0B8', fg: SEM.amber };
          return (
            <Pressable key={i.type} onPress={() => router.push('/profile')} style={[styles.blocker, { backgroundColor: c.bg, borderColor: c.bd }]}>
              <Ionicons name="warning-outline" size={16} color={c.fg} style={{ marginTop: 1 }} />
              <Text style={[styles.blockerText, { flex: 1 }]}>
                <Text style={{ fontFamily: fontFamilies.bodyBold, color: c.fg }}>{i.label} {expired ? 'expired' : 'expires'} {fmtD(i.date)}</Text>
              </Text>
              <Text style={[styles.link, { color: pilot.navy }]}>Update</Text>
            </Pressable>
          );
        })}

        {/* New jobs for you */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Your matches</Text>
            <Pressable onPress={() => router.push('/jobs')}><Text style={styles.link}>All matching jobs</Text></Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segRow}>
            {([['allNew', 'All', nj.counts.all], ['qualify', 'You qualify', nj.counts.qualify], ['oneShort', '1 short', nj.counts.oneShort]] as [typeof tab, string, number][]).map(([k, lbl, n]) => {
              const active = tab === k;
              return (
                <Pressable key={k} onPress={() => setTab(k)} style={[styles.seg, active && styles.segActive]}>
                  <Text style={[styles.segText, active && styles.segTextActive]}>{lbl} <Text style={styles.segCount}>{n}</Text></Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {list.length === 0
            ? <Text style={styles.emptyRow}>No jobs in this group yet.</Text>
            : list.map((j) => <JobRow key={j.id} job={j} styles={styles} pilot={pilot} onView={() => router.push(`/jobs/${j.id}`)} />)}
          <Text style={styles.footNote}>Match % = stated requirements you meet ÷ stated requirements. Requirements the airline didn't state are shown, not counted. Same number as on the Jobs page.</Text>
        </View>

        {/* Your applications */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Your applications</Text>
            <Pressable onPress={() => router.push({ pathname: '/jobs', params: { view: 'applications' } })}><Text style={styles.link}>Show all {data.applications.length}</Text></Pressable>
          </View>
          {data.applications.length === 0
            ? <Text style={styles.emptyRow}>No applications yet. Opening a job's apply link tracks it here.</Text>
            : data.applications.slice(0, 6).map((a: Any) => {
              // Prompt only on a RECENT (≤30d) open of a LIVE job (#10) — stale/closed
              // ones just show their status pill.
              const live = a.job?.status === 'ACTIVE' || !!a.replacement;
              const showPrompt = a.status === 'OPENED' && !dismissed[a.id] && live && daysSince(a.appliedAt) <= 30;
              return (
                <View key={a.id} style={styles.appRow}>
                  <Text style={styles.appTitle} numberOfLines={2}>{a.job?.title || '—'}</Text>
                  <Text style={styles.appSub} numberOfLines={1}>
                    {companyName(a.job?.company)}{a.appliedAt ? ` · opened ${ago(a.appliedAt)}` : ''}{a.job && a.job.status !== 'ACTIVE' && !a.replacement ? ' · job closed' : ''}{a.replacement ? ' · still live' : ''}
                  </Text>
                  <View style={styles.appActionRow}>
                    {showPrompt ? (
                      <View style={styles.applyAsk}>
                        <Text style={styles.appSub}>Did you apply?</Text>
                        <Pressable onPress={() => setStatus(a.id, 'APPLIED')} style={styles.ynBtn} hitSlop={6}><Text style={styles.ynText}>Yes</Text></Pressable>
                        <Pressable onPress={() => setDismissed((d) => ({ ...d, [a.id]: true }))} style={styles.ynBtn} hitSlop={6}><Text style={styles.ynText}>No</Text></Pressable>
                      </View>
                    ) : (
                      <View style={styles.statusPill}>
                        <View style={[styles.statusDot, { backgroundColor: STATUS_DOT[a.status] || pilot.muted }]} />
                        <Text style={[styles.statusPillText, { color: a.status === 'CLOSED' ? pilot.muted : pilot.ink }]}>{STATUS_LABEL[a.status] || a.status}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          <Text style={styles.footNote}>Statuses: Opened · Applied · Interview · Offer · Not selected · Closed</Text>
        </View>

        {/* Your profile */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Your profile</Text>
            <Pressable onPress={() => router.push('/profile')}><Text style={styles.link}>Open</Text></Pressable>
          </View>
          <View style={styles.cardBody}>
            <KV label="Total time" value={hours(prof.totalHours || 0)} styles={styles} />
            <KV label="Flights logged" value={String(prof.flights || 0)} styles={styles} />
            {prof.medicalDaysLeft != null && <KV label="Medical" value={`${prof.medicalDaysLeft} days left`} valueColor={prof.medicalDaysLeft < 60 ? SEM.amber : pilot.ink} styles={styles} />}
            {prof.strength && (
              <View style={{ marginTop: 10 }}>
                <View style={styles.kvRow}><Text style={styles.kvLabel}>Profile strength</Text><Text style={styles.kvValue}>{prof.strength.pct}%</Text></View>
                <View style={styles.bar}><View style={[styles.barFill, { width: `${prof.strength.pct}%` }]} /></View>
              </View>
            )}
            {prof.nudge?.fields?.length > 0 && (
              <Text style={[styles.dim, { marginTop: 8 }]}>Add <Text style={{ fontFamily: fontFamilies.bodyBold, color: pilot.ink }}>{prof.nudge.fields[0].field}</Text> to check {prof.nudge.fields[0].jobs} more jobs.</Text>
            )}
          </View>
        </View>

        {/* Alerts (display mirror of web — managed in Settings › Notifications) */}
        <View style={styles.card}>
          <View style={styles.cardHead}><Text style={styles.cardTitle}>Alerts</Text>
            <Pressable onPress={() => router.push('/settings')}><Text style={styles.link}>Manage</Text></Pressable>
          </View>
          <View style={styles.cardBody}>
            <Toggle label="Push when I qualify for a new job" sub="Phone app" on={al ? al.matchesPush : true} styles={styles} pilot={pilot} />
            <Toggle label="Also when I'm one requirement short" on={al ? al.alertsPush : true} styles={styles} pilot={pilot} />
            <Toggle label="Weekly email summary" sub={al && al.emailVerified ? undefined : 'Verify your email to turn on'} on={al ? al.matchesEmail && al.emailVerified : false} styles={styles} pilot={pilot} last />
          </View>
        </View>

        {/* Saved searches */}
        <View style={styles.card}>
          <View style={styles.cardHead}><Text style={styles.cardTitle}>Saved searches</Text>
            <Pressable onPress={() => router.push('/jobs')}><Text style={styles.link}>New</Text></Pressable>
          </View>
          <View style={styles.cardBody}>
            {data.savedSearches?.some((s: Any) => !s.suggestion)
              ? data.savedSearches.filter((s: Any) => !s.suggestion).map((s: Any) => (
                <View key={s.id} style={styles.kvRow}><Text style={styles.kvLabel}>{s.name}</Text></View>
              ))
              : (
                <>
                  <Text style={styles.dim}>None yet. Save a search to get alerts beyond your profile matches.</Text>
                  <View style={styles.chipWrap}>
                    {(data.savedSearches || []).filter((s: Any) => s.suggestion).map((s: Any, i: number) => (
                      <Pressable key={i} onPress={() => router.push('/jobs')} style={styles.suggestChip}><Text style={styles.suggestChipText}>+ {s.name}</Text></Pressable>
                    ))}
                  </View>
                </>
              )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function JobRow({ job, onView, styles, pilot }: { job: Any; onView: () => void; styles: Any; pilot: ThemePalette }) {
  const m = job.match;
  const meta = statusMeta(m);
  const pill = m && (m.status === 'QUALIFY' ? { t: 'You qualify', bg: SEM.greenbg, c: SEM.green }
    : (m.status === 'SHORT' || m.status === 'CHECK') ? { t: m.status === 'SHORT' ? '1 short' : 'Check', bg: SEM.amberbg, c: SEM.amber } : null);
  const sub = [companyName(job.company), locationName(job.location || job.country), ago(job.postedAt), job.sourceType && job.sourceType !== 'aggregator' ? 'Direct apply' : null].filter(Boolean).join(' · ');
  const isQualify = m?.status === 'QUALIFY';
  return (
    <View style={styles.jobRow}>
      <View style={styles.jobTop}>
        <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
          <Text style={styles.jobTitle}>
            {job.isNew && <Text style={{ color: pilot.navy }}>● </Text>}{job.title}
          </Text>
          <Text style={styles.jobSub} numberOfLines={1}>{sub}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {meta && m.pct != null ? (
            <>
              <Text style={[styles.pct, { color: meta.color }]}>{m.pct}%<Text style={styles.pctSuffix}> match</Text></Text>
              {m.stated > 0 ? <Text style={styles.metLine}>{m.met} of {m.stated} met</Text> : null}
            </>
          ) : <Text style={styles.notStated}>{m?.status === 'NO_REQUIREMENTS' ? 'No requirements stated' : 'Not stated'}</Text>}
          <Pressable onPress={onView} style={[styles.viewBtn, isQualify && styles.viewBtnPrimary]}>
            <Text style={[styles.viewBtnText, isQualify && { color: '#fff' }]}>View</Text>
          </Pressable>
        </View>
      </View>
      {(pill || meta?.shortfall || m?.category?.advisory) && (
        <View style={styles.jobMetaRow}>
          {pill && <Text style={[styles.jobPill, { backgroundColor: pill.bg, color: pill.c }]}>{pill.t}</Text>}
          {meta?.shortfall && <Text style={styles.jobShort}>{meta.shortfall}</Text>}
          {m?.category?.advisory && <Text style={styles.jobAdvisory}>· {m.category.advisory}</Text>}
        </View>
      )}
    </View>
  );
}

function KV({ label, value, valueColor, styles }: { label: string; value: string; valueColor?: string; styles: Any }) {
  return <View style={styles.kvRow}><Text style={styles.kvLabel}>{label}</Text><Text style={[styles.kvValue, valueColor ? { color: valueColor } : null]}>{value}</Text></View>;
}

function Toggle({ label, sub, on, last, styles, pilot }: { label: string; sub?: string; on: boolean; last?: boolean; styles: Any; pilot: ThemePalette }) {
  return (
    <View style={[styles.toggleRow, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {sub && <Text style={styles.toggleSub}>{sub}</Text>}
      </View>
      <View style={[styles.track, { backgroundColor: on ? pilot.navy : '#CBD3DD' }]}>
        <View style={[styles.knob, on ? { right: 2 } : { left: 2 }]} />
      </View>
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  content: { padding: spacing.xl, paddingTop: spacing.lg, paddingBottom: 116 },
  center: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: 20, gap: 10 },
  emptyTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.xl, color: pilot.ink, textAlign: 'center' },
  dim: { fontSize: fontSizes.base, color: pilot.muted, fontFamily: fontFamilies.body, lineHeight: 21 },

  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes['3xl'], color: pilot.ink, marginBottom: 4 },
  subtitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, marginBottom: 16 },

  blocker: { flexDirection: 'row', gap: 12, backgroundColor: SEM.redbg, borderWidth: 1, borderColor: '#F4CFCB', borderRadius: 12, padding: 14, marginBottom: 18 },
  blockerText: { fontSize: fontSizes.sm, color: pilot.ink, fontFamily: fontFamilies.body, lineHeight: 20 },
  blockerLinks: { flexDirection: 'row', gap: 16, marginTop: 8 },

  card: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 14, marginBottom: 18 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 0 },
  cardTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.lg, color: pilot.ink },
  cardBody: { padding: 16, paddingTop: 12 },
  link: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold, color: pilot.navy },
  linkBold: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold, color: pilot.navy },

  segRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  seg: { borderWidth: 1, borderColor: pilot.line, backgroundColor: pilot.surface, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 13 },
  segActive: { borderColor: pilot.ink, backgroundColor: pilot.ink },
  segText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold, color: pilot.muted },
  segTextActive: { color: '#fff' },
  segCount: { fontFamily: fontFamilies.bodyMedium, opacity: 0.75 },

  emptyRow: { padding: 16, color: pilot.muted, fontSize: fontSizes.base, fontFamily: fontFamilies.body },
  footNote: { padding: 14, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: pilot.line, fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, lineHeight: 18 },

  jobRow: { borderTopWidth: 1, borderTopColor: pilot.line, paddingHorizontal: 16, paddingVertical: 10 },
  jobTop: { flexDirection: 'row', alignItems: 'flex-start' },
  jobTitle: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.md, color: pilot.ink, lineHeight: 20 },
  jobSub: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2 },
  pct: { fontFamily: fontFamilies.display, fontSize: 22, lineHeight: 24 },
  pctSuffix: { fontFamily: fontFamilies.body, fontSize: 11, color: pilot.muted },
  metLine: { fontFamily: fontFamilies.body, fontSize: 11, color: pilot.muted, marginTop: 2, textAlign: 'right' },
  notStated: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body },
  viewBtn: { marginTop: 6, height: 34, paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderColor: pilot.line, backgroundColor: pilot.surface, alignItems: 'center', justifyContent: 'center' },
  viewBtnPrimary: { borderColor: pilot.navy, backgroundColor: pilot.navy },
  viewBtnText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  jobMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  jobPill: { fontSize: 11, fontFamily: fontFamilies.bodySemiBold, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  jobShort: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body },
  jobAdvisory: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body },

  appRow: { borderTopWidth: 1, borderTopColor: pilot.line, paddingHorizontal: 16, paddingVertical: 10 },
  appTitle: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base, color: pilot.ink },
  appSub: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2 },
  appActionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  applyAsk: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ynBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  ynText: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.base, color: pilot.navy },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: pilot.line, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold },

  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: pilot.line },
  kvLabel: { fontSize: fontSizes.base, color: pilot.muted, fontFamily: fontFamilies.body },
  kvValue: { fontSize: fontSizes.base, color: pilot.ink, fontFamily: fontFamilies.bodySemiBold },
  bar: { height: 6, backgroundColor: '#E3E8EF', borderRadius: 4, marginTop: 8 },
  barFill: { height: 6, backgroundColor: pilot.navy, borderRadius: 4 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: pilot.line },
  toggleLabel: { fontSize: fontSizes.base, color: pilot.ink, fontFamily: fontFamilies.body },
  toggleSub: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2 },
  track: { width: 34, height: 20, borderRadius: 12, justifyContent: 'center' },
  knob: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  suggestChip: { borderWidth: 1, borderColor: '#BCC6D3', borderStyle: 'dashed', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  suggestChipText: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body },
});
