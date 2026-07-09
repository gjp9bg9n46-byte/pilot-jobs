// Employer applicants for a job — mirrors frontend/src/pages/employer/EmployerApplicants.jsx.
// GET /employers/jobs/:id/applicants → { job, applicants } (ranked by match desc).
// Filter pills by status; tap a card → detail (web uses a side drawer; mobile
// presents a full-screen modal with the same content). Status is a FREE-transition
// control (APPLIED/REVIEWED/SHORTLISTED/HIRED, any→any) → PATCH
// /employers/applications/:id/status (optimistic). Applicant data is redacted by
// the API (name = "First L.", no contact info) — nothing to gate.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../../src/lib/api';
import { matchStyle } from '../../../../../src/lib/jobMatch';
import { employer as emp, fontFamilies, fontSizes, semantic, spacing } from '../../../../../src/theme/tokens';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type App = Record<string, any>;
const STATUS_ORDER = ['APPLIED', 'REVIEWED', 'SHORTLISTED', 'HIRED'];
const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  APPLIED: { label: 'Applied', fg: emp.muted, bg: '#F1F1F1' },
  REVIEWED: { label: 'Reviewed', fg: '#1E40AF', bg: semantic.infoBg },
  SHORTLISTED: { label: 'Shortlisted', fg: '#1E40AF', bg: semantic.infoBg },
  HIRED: { label: 'Hired', fg: semantic.success, bg: semantic.successBg },
};
const ROLE_LABEL: Record<string, string> = { CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', INSTRUCTOR: 'Instructor', FLIGHT_ENGINEER: 'Flight Engineer' };
const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };

function appliedAgo(iso?: string): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const m = Math.floor(days / 30);
  return m === 1 ? '1 month ago' : `${m} months ago`;
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] || STATUS.APPLIED;
  return <View style={[styles.pill, { backgroundColor: s.bg }]}><Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text></View>;
}
function Score({ score, size = 'sm' }: { score: number | null; size?: 'sm' | 'lg' }) {
  if (score == null) return <Text style={styles.noScore}>—</Text>;
  const st = matchStyle(score);
  return (
    <View style={{ alignItems: size === 'lg' ? 'flex-start' : 'center' }}>
      <Text style={[styles.scoreNum, { color: st.color, fontSize: size === 'lg' ? 26 : 18 }]}>{score}%</Text>
      {size === 'lg' ? <Text style={[styles.scoreLabel, { color: st.color }]}>{st.label}</Text> : null}
    </View>
  );
}

export default function Applicants() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ job: App; applicants: App[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [confirm, setConfirm] = useState('');

  const load = useCallback(() => {
    setError('');
    return api.get(`/employers/jobs/${id}/applicants`)
      .then(({ data: d }) => setData(d))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .catch((err: any) => setError(err.response?.status === 403 ? 'You do not have access to this job.' : (err.response?.data?.error || 'Could not load applicants.')))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const ranked = useMemo(() => [...(data?.applicants || [])].sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1)), [data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: ranked.length };
    STATUS_ORDER.forEach((s) => { c[s] = ranked.filter((a) => a.status === s).length; });
    return c;
  }, [ranked]);
  const visible = filter === 'ALL' ? ranked : ranked.filter((a) => a.status === filter);
  const openApp = ranked.find((a) => a.applicationId === openId) || null;

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const changeStatus = async (applicationId: string, next: string) => {
    setConfirm(''); setSavingStatus(true);
    const prev = data;
    setData((d) => (d ? { ...d, applicants: d.applicants.map((a) => (a.applicationId === applicationId ? { ...a, status: next } : a)) } : d));
    try {
      await api.patch(`/employers/applications/${applicationId}/status`, { status: next });
      setConfirm(`✓ Marked as ${STATUS[next].label}`);
      setTimeout(() => setConfirm(''), 2000);
    } catch {
      setData(prev); // revert
    } finally { setSavingStatus(false); }
  };

  const renderCard = ({ item: a }: { item: App }) => {
    const snap = a.snapshot || {};
    return (
      <Pressable style={styles.card} onPress={() => { setConfirm(''); setOpenId(a.applicationId); }}>
        <View style={styles.cardScore}><Score score={a.matchScore} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name}>{a.pilotName}</Text>
          <View style={styles.meta}>
            <Text style={styles.metaItem}>{ROLE_LABEL[snap.role] || snap.role || '—'}</Text>
            <Text style={styles.metaItem}>{(snap.totalHours ?? 0).toLocaleString()} hrs</Text>
            {snap.licences?.[0] ? <Text style={styles.metaItem}>{snap.licences.join(', ')}</Text> : null}
            {snap.elpLevel ? <Text style={styles.metaItem}>ELP {snap.elpLevel}</Text> : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <StatusPill status={a.status} />
          <Text style={styles.ago}>{appliedAgo(a.appliedAt)}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← Dashboard</Text></Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>Applicants</Text>
        <View style={{ width: 80 }} />
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={emp.navy} /></View>
        : error ? <View style={styles.center}><Text style={styles.emptyText}>{error}</Text></View>
          : (
            <FlatList
              data={visible}
              keyExtractor={(a) => a.applicationId}
              renderItem={renderCard}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={emp.navy} />}
              ListHeaderComponent={
                <View>
                  <Text style={styles.h1}>Applicants{data?.job ? ` for ${data.job.title}` : ''}</Text>
                  <Text style={styles.sub}>{ranked.length} applicant{ranked.length === 1 ? '' : 's'} · ranked by match</Text>
                  {ranked.length > 0 ? (
                    <View style={styles.filters}>
                      {['ALL', ...STATUS_ORDER].map((s) => {
                        const on = filter === s;
                        return (
                          <Pressable key={s} style={[styles.filterPill, on && styles.filterPillOn]} onPress={() => setFilter(s)}>
                            <Text style={[styles.filterText, on && styles.filterTextOn]}>{s === 'ALL' ? 'All' : STATUS[s].label}</Text>
                            <View style={[styles.countBadge, on && styles.countBadgeOn]}><Text style={[styles.countText, on && styles.countTextOn]}>{counts[s] ?? 0}</Text></View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              }
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>{ranked.length === 0 ? 'No applicants yet — share the job link to attract candidates.' : 'No applicants in this status.'}</Text>
                </View>
              }
            />
          )}

      {/* Applicant detail (full-screen modal — web uses a side drawer) */}
      <Modal visible={!!openApp} animationType="slide" onRequestClose={() => setOpenId(null)} presentationStyle="pageSheet">
        {openApp ? (
          <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.topBar}>
              <View style={{ width: 40 }} />
              <Text style={styles.topTitle}>Applicant</Text>
              <Pressable onPress={() => setOpenId(null)} hitSlop={8} style={{ width: 40, alignItems: 'flex-end' }}><Ionicons name="close" size={22} color={emp.ink} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.drawerName}>{openApp.pilotName}</Text>
              <Text style={styles.drawerApplied}>Applied {appliedAgo(openApp.appliedAt)}</Text>
              <View style={styles.drawerHead}>
                <Score score={openApp.matchScore} size="lg" />
                <StatusPill status={openApp.status} />
              </View>

              <Text style={styles.sectionLabel}>MATCH BREAKDOWN</Text>
              {(openApp.matchBreakdown?.matched?.length || openApp.matchBreakdown?.marginal?.length || openApp.matchBreakdown?.missing?.length) ? (
                <View>
                  <Bucket items={openApp.matchBreakdown.matched} color={SEM.green} glyph="✓" />
                  <Bucket items={openApp.matchBreakdown.marginal} color={SEM.amber} glyph="~" />
                  <Bucket items={openApp.matchBreakdown.missing} color={SEM.red} glyph="✗" />
                </View>
              ) : <Text style={styles.muted}>No requirement breakdown captured.</Text>}

              <Text style={styles.sectionLabel}>PILOT SNAPSHOT</Text>
              {(() => { const s = openApp.snapshot || {}; return (
                <View style={styles.snapGrid}>
                  <Snap k="Role" v={ROLE_LABEL[s.role] || s.role || '—'} />
                  <Snap k="Total hours" v={(s.totalHours ?? 0).toLocaleString()} />
                  <Snap k="PIC hours" v={(s.picHours ?? 0).toLocaleString()} />
                  <Snap k="Licences" v={s.licences?.length ? s.licences.join(', ') : '—'} />
                  <Snap k="Type ratings" v={s.ratings?.length ? s.ratings.join(', ') : '—'} />
                  <Snap k="Medical" v={s.medicalClass ? String(s.medicalClass).replace('CLASS_', 'Class ') : '—'} />
                  <Snap k="ELP" v={s.elpLevel || '—'} />
                  <Snap k="Right to work" v={s.rightToWork?.length ? s.rightToWork.join(', ') : '—'} />
                </View>
              ); })()}

              <Text style={styles.sectionLabel}>STATUS</Text>
              <View style={styles.statusRow}>
                {STATUS_ORDER.map((s) => {
                  const on = openApp.status === s;
                  return (
                    <Pressable key={s} accessibilityLabel={`Set ${STATUS[s].label}`} disabled={savingStatus || on} style={[styles.statusBtn, on && styles.statusBtnOn]} onPress={() => changeStatus(openApp.applicationId, s)}>
                      <Text style={[styles.statusBtnText, on && styles.statusBtnTextOn]}>{STATUS[s].label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {confirm ? <Text style={styles.confirm}>{confirm}</Text> : null}

              {data?.job?.applyUrl ? (
                <Pressable onPress={() => Linking.openURL(String(data.job.applyUrl))} style={{ marginTop: 22 }}>
                  <Text style={styles.atsLink}>Open in external ATS →</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

function Bucket({ items, color, glyph }: { items?: string[]; color: string; glyph: string }) {
  if (!items || items.length === 0) return null;
  return <View style={{ marginBottom: 8 }}>{items.map((t, i) => (
    <View key={i} style={styles.bucketRow}><Text style={{ color, fontFamily: fontFamilies.bodyBold }}>{glyph} </Text><Text style={styles.bucketText}>{t}</Text></View>
  ))}</View>;
}
function Snap({ k, v }: { k: string; v: string }) {
  return <View style={styles.snapItem}><Text style={styles.snapK}>{k}: </Text><Text style={styles.snapV}>{v}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: emp.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: emp.line, backgroundColor: emp.surface },
  back: { color: emp.muted, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },
  topTitle: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: emp.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  list: { padding: spacing.xl },
  h1: { fontSize: fontSizes.xl, fontFamily: fontFamilies.bodyBold, color: emp.ink, marginBottom: 4 },
  sub: { fontSize: fontSizes.sm, color: emp.muted, fontFamily: fontFamilies.body, marginBottom: 20 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  filterPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: emp.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: emp.surface },
  filterPillOn: { borderColor: emp.navy, backgroundColor: 'rgba(0,63,136,0.08)' },
  filterText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold, color: emp.muted },
  filterTextOn: { color: emp.navy },
  countBadge: { backgroundColor: emp.line, borderRadius: 10, paddingHorizontal: 6, minWidth: 18, alignItems: 'center' },
  countBadgeOn: { backgroundColor: emp.navy },
  countText: { fontSize: 11, fontFamily: fontFamilies.bodyBold, color: emp.muted },
  countTextOn: { color: '#fff' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: emp.surface, borderWidth: 1, borderColor: emp.line, borderRadius: 12, padding: 16, marginBottom: 12 },
  cardScore: { minWidth: 56, alignItems: 'center' },
  name: { fontSize: fontSizes.md, fontFamily: fontFamilies.bodyBold, color: emp.ink },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 3 },
  metaItem: { fontSize: fontSizes.xs, color: emp.muted, fontFamily: fontFamilies.body },
  ago: { fontSize: fontSizes.xs, color: emp.muted, fontFamily: fontFamilies.body },
  noScore: { fontSize: fontSizes.sm, color: emp.muted, fontFamily: fontFamilies.body },
  scoreNum: { fontFamily: fontFamilies.mono, fontWeight: '700' },
  scoreLabel: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.xs, marginTop: 2 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontFamily: fontFamilies.bodyBold },
  empty: { backgroundColor: emp.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: emp.line, borderRadius: 12, padding: 32, alignItems: 'center' },
  emptyText: { color: emp.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.base, textAlign: 'center', lineHeight: 22 },

  drawerContent: { padding: spacing.xl, paddingBottom: 48 },
  drawerName: { fontSize: fontSizes.xl, fontFamily: fontFamilies.bodyBold, color: emp.ink },
  drawerApplied: { fontSize: fontSizes.sm, color: emp.muted, fontFamily: fontFamilies.body, marginTop: 2 },
  drawerHead: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 16 },
  sectionLabel: { fontSize: 11, fontFamily: fontFamilies.bodyBold, letterSpacing: 0.8, color: emp.muted, marginTop: 22, marginBottom: 10 },
  muted: { fontSize: fontSizes.sm, color: emp.muted, fontFamily: fontFamilies.body },
  bucketRow: { flexDirection: 'row', marginBottom: 4 },
  bucketText: { color: emp.ink, fontFamily: fontFamilies.body, fontSize: fontSizes.sm, flex: 1 },
  snapGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  snapItem: { width: '50%', marginBottom: 10, flexDirection: 'row' },
  snapK: { color: emp.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.sm },
  snapV: { color: emp.ink, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, flexShrink: 1 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: { borderWidth: 1, borderColor: emp.line, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: emp.surface },
  statusBtnOn: { borderColor: emp.navy, backgroundColor: emp.navy },
  statusBtnText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold, color: emp.muted },
  statusBtnTextOn: { color: '#fff' },
  confirm: { color: SEM.green, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, marginTop: 8 },
  atsLink: { color: emp.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base },
});
