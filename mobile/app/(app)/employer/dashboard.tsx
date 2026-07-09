// Employer dashboard — mirrors frontend/src/pages/employer/EmployerDashboard.jsx.
// b2b cool-operator identity: header + profile card + your-jobs list with
// Edit/Repost/Delete + status badges + status banners.
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { useAuth, Employer } from '../../../src/context/AuthContext';
import VerifyEmailBanner from '../../../src/components/VerifyEmailBanner';
import { EmployerHeader, JobStatusBadge } from '../../../src/components/employer/EmployerChrome';
import { employer as emp, fontFamilies, fontSizes, semantic, spacing } from '../../../src/theme/tokens';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Job = Record<string, any>;
const TYPE_LABEL: Record<string, string> = { AIRLINE: 'Airline', CHARTER: 'Charter', CARGO: 'Cargo', EMS: 'EMS / Air Ambulance', FLIGHT_SCHOOL: 'Flight School', CORPORATE: 'Corporate', RECRUITER: 'Recruiter / Agency', OTHER: 'Other' };
const ROLE_LABEL: Record<string, string> = { CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', INSTRUCTOR: 'Instructor', FLIGHT_ENGINEER: 'Flight Engineer' };

export default function EmployerDashboard() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const e = user as Employer | null;
  const status = e?.status ?? 'PENDING';
  const approved = status === 'APPROVED';
  const { toast } = useLocalSearchParams<{ toast?: string }>();

  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showToast, setShowToast] = useState(!!toast);

  const load = useCallback(() => { api.get('/employers/jobs').then(({ data }) => setJobs(data)).catch(() => setJobs([])); }, []);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (toast) { const t = setTimeout(() => setShowToast(false), 4000); return () => clearTimeout(t); } }, [toast]);

  const onRefresh = useCallback(async () => { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 600); }, [load]);

  const repost = async (id: string) => { try { await api.post(`/employers/jobs/${id}/repost`); load(); } catch { /* ignore */ } };
  const confirmDelete = (job: Job) => Alert.alert(
    'Delete this job?',
    `"${job.title}" will be set to EXPIRED and removed from the public Jobs page. You can repost it later.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.delete(`/employers/jobs/${job.id}`); load(); } catch { /* ignore */ } } }],
  );

  if (!e) return null;

  return (
    <View style={styles.root}>
      <EmployerHeader companyName={e.companyName} status={status} onLogout={logout} />
      <VerifyEmailBanner />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={emp.navy} />}>

          {showToast && toast ? <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View> : null}
          {status === 'SUSPENDED' ? <View style={styles.warnBanner}><Text style={styles.warnText}>Your account is suspended. Existing listings stay live, but you cannot post or edit jobs. Contact support@cockpithire.com.</Text></View> : null}
          {status === 'REJECTED' ? <View style={styles.warnBanner}><Text style={styles.warnText}>Your account application was not approved. You cannot post jobs. Contact support@cockpithire.com.</Text></View> : null}

          {/* Profile card */}
          <View style={styles.profileCard}>
            <View style={styles.pcTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.pcName}>{e.companyName}</Text>
                <Text style={styles.pcMeta}>{TYPE_LABEL[e.companyType] || e.companyType} · {e.country}{e.headquartersCity ? ` · ${e.headquartersCity}` : ''}</Text>
              </View>
              <Pressable style={styles.editBtn} onPress={() => router.push('/employer/profile')}><Text style={styles.editBtnText}>Edit profile</Text></Pressable>
            </View>
            {e.website ? <Text style={styles.pcItem}><Text style={styles.pcK}>Website: </Text><Text style={styles.pcLink} onPress={() => Linking.openURL(String(e.website))}>{String(e.website)}</Text></Text> : null}
          </View>

          {/* Jobs header */}
          <View style={styles.jobsHead}>
            <Text style={styles.jobsTitle}>Your Jobs{jobs ? ` (${jobs.length})` : ''}</Text>
            <Pressable style={[styles.postBtn, !approved && styles.postBtnOff]} onPress={approved ? () => router.push('/employer/jobs/new') : undefined}>
              <Text style={styles.postBtnText}>+ Post New Job</Text>
            </Pressable>
          </View>

          {jobs === null ? <Text style={styles.muted}>Loading jobs…</Text>
            : jobs.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>You haven't posted any jobs yet.{approved ? ' ' : ''}</Text>
                {approved ? <Pressable onPress={() => router.push('/employer/jobs/new')}><Text style={styles.emptyLink}>Post your first job →</Text></Pressable> : null}
              </View>
            ) : jobs.map((j) => (
              <View key={j.id} style={styles.jobCard}>
                <View style={styles.jcTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.jcTitle}>{j.title}</Text>
                    <View style={styles.jcMeta}>
                      {j.role ? <Text style={styles.jcMetaItem}>{ROLE_LABEL[j.role] || j.role}</Text> : null}
                      <Text style={styles.jcMetaItem}>📍 {j.location || '—'}</Text>
                      <Text style={styles.jcMetaItem}>{new Date(j.postedAt).toLocaleDateString()}</Text>
                    </View>
                  </View>
                  <JobStatusBadge status={j.status} />
                </View>
                {j.status === 'ACTIVE' ? (
                  j.applicantsCount > 0
                    ? <Pressable onPress={() => router.push(`/employer/jobs/${j.id}/applicants`)}><Text style={styles.applicantsLink}>{j.applicantsCount} applicant{j.applicantsCount === 1 ? '' : 's'} →</Text></Pressable>
                    : <Text style={styles.applicantsNone}>No applicants yet</Text>
                ) : null}
                {approved ? (
                  <View style={styles.actions}>
                    <Pressable style={styles.act} onPress={() => router.push(`/employer/jobs/${j.id}/edit`)}><Text style={styles.actText}>Edit</Text></Pressable>
                    {j.status === 'EXPIRED' ? <Pressable style={styles.act} onPress={() => repost(j.id)}><Text style={styles.actText}>Repost</Text></Pressable> : null}
                    {j.status === 'ACTIVE' ? <Pressable style={[styles.act, styles.actDanger]} onPress={() => confirmDelete(j)}><Text style={styles.actDangerText}>Delete</Text></Pressable> : null}
                  </View>
                ) : null}
              </View>
            ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: emp.bg },
  content: { padding: spacing.xl, paddingBottom: 40 },
  muted: { color: emp.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.base },
  toast: { backgroundColor: semantic.successBg, borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 6, padding: 12, marginBottom: 16 },
  toastText: { color: semantic.success, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  warnBanner: { backgroundColor: semantic.warningBg, borderWidth: 1, borderColor: '#FDE68A', borderRadius: 6, padding: 14, marginBottom: 16 },
  warnText: { color: semantic.warning, fontFamily: fontFamilies.body, fontSize: fontSizes.sm, lineHeight: 20 },
  profileCard: { backgroundColor: emp.surface, borderWidth: 1, borderColor: emp.line, borderRadius: 8, padding: 20, marginBottom: 24 },
  pcTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  pcName: { fontSize: fontSizes.xl, fontFamily: fontFamilies.bodyBold, color: emp.ink, marginBottom: 4 },
  pcMeta: { color: emp.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.sm },
  pcItem: { fontSize: fontSizes.sm, marginTop: 12, fontFamily: fontFamilies.body, color: emp.muted },
  pcK: { color: emp.muted, fontFamily: fontFamilies.body },
  pcLink: { color: emp.navy, fontFamily: fontFamilies.bodySemiBold },
  editBtn: { backgroundColor: emp.surface, borderWidth: 1, borderColor: emp.line, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 9 },
  editBtnText: { color: emp.ink, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  jobsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  jobsTitle: { fontSize: fontSizes.lg, fontFamily: fontFamilies.bodyBold, color: emp.ink },
  postBtn: { backgroundColor: emp.navy, borderRadius: 4, paddingHorizontal: 16, paddingVertical: 11 },
  postBtnOff: { opacity: 0.4 },
  postBtnText: { color: '#fff', fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.base },
  empty: { backgroundColor: emp.surface, borderWidth: 1, borderColor: emp.line, borderStyle: 'dashed', borderRadius: 8, padding: 32, alignItems: 'center' },
  emptyText: { color: emp.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.base, textAlign: 'center' },
  emptyLink: { color: emp.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base, marginTop: 6 },
  jobCard: { backgroundColor: emp.surface, borderWidth: 1, borderColor: emp.line, borderRadius: 8, padding: 16, marginBottom: 12 },
  jcTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  jcTitle: { fontSize: fontSizes.md, fontFamily: fontFamilies.bodyBold, color: emp.ink },
  jcMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  jcMetaItem: { color: emp.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.xs },
  applicantsLink: { color: emp.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, marginTop: 10 },
  applicantsNone: { color: emp.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.xs, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  act: { borderWidth: 1, borderColor: emp.line, backgroundColor: emp.surface, borderRadius: 6, paddingHorizontal: 13, paddingVertical: 7 },
  actText: { color: emp.ink, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.xs },
  actDanger: { borderColor: '#FECACA' },
  actDangerText: { color: semantic.error, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.xs },
});
