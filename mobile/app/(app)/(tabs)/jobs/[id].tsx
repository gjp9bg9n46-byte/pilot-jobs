// Job detail — mirrors frontend/src/pages/JobDetail.jsx. Sections in the same
// order: header, salary, employer badge, expired banner, Your Match (score +
// requirement rows), description, notes. Sticky bottom Apply/Save.
//
// Apply = record-then-redirect (E1): open job.applyUrl externally AND POST
// /jobs/:id/apply to record. Idempotent server-side. No cover-letter field (web
// has none — apply opens the external posting).
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../src/lib/api';
import { makeTabBarStyle } from '../../../../src/theme/tabBar';
import {
  computeMatchCount, extractUuid, formatSalary, matchLabel, matchStyle, postedAgo,
} from '../../../../src/lib/jobMatch';
import { Requirement } from '../../../../src/lib/jobMatch';
import AirlineLogo from '../../../../src/components/AirlineLogo';
import { fetchAirlineMap, resolveAirline } from '../../../../src/lib/airlineLookup';
import { fontFamilies, fontSizes, pilot, semantic, spacing } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Job = Record<string, any>;

const ROLE_LABEL: Record<string, string> = { CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', INSTRUCTOR: 'Instructor', FLIGHT_ENGINEER: 'Flight Engineer' };

// Basic HTML → readable text (web renders sanitized HTML; RN has no HTML view, so
// we strip tags, keeping paragraph/list breaks). Rich formatting → plain text is a
// noted parity simplification.
function htmlToText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|li)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function ReqRow({ req }: { req: Requirement }) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.reqRow, !req.matched && styles.reqRowMiss]}>
      <Ionicons name={req.matched ? 'checkmark-circle' : 'close-circle'} size={16} color={req.matched ? SEM.green : SEM.red} />
      <Text style={styles.reqLabel}>{req.label}</Text>
      <Text style={[styles.reqValue, { color: req.matched ? pilot.ink : SEM.red }]}>{req.reqValue}</Text>
      <Text style={[styles.reqPilot, { color: req.matched ? SEM.green : pilot.muted }]}>{req.pilotValue ?? 'Not on profile'}</Text>
    </View>
  );
}

export default function JobDetail() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const navigation = useNavigation();
  const { id: slugId } = useLocalSearchParams<{ id: string }>();
  const jobId = extractUuid(slugId);

  // The floating tab bar would sit on top of this screen's sticky Apply CTA, so
  // hide it while the detail page is mounted and restore it on the way out.
  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => parent?.setOptions({ tabBarStyle: makeTabBarStyle(pilot) });
  }, [navigation, pilot]);

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<Job | null>(null);
  const [totals, setTotals] = useState<Job | null>(null);
  const [saved, setSaved] = useState(false);
  const [applied, setApplied] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [applyNote, setApplyNote] = useState<string | null>(null);
  // Resolve the job's company → airline factfile (scraped company strings vary
  // from canonical names, so job.airlineId is usually null → use the name map).
  const [airline, setAirline] = useState<{ id: string; name: string; logoUrl?: string | null; iataCode?: string | null } | null>(null);
  useEffect(() => {
    if (!job?.company) return;
    let alive = true;
    fetchAirlineMap().then((map) => { if (alive) setAirline(resolveAirline(map, job.company)); }).catch(() => {});
    return () => { alive = false; };
  }, [job?.company]);

  useEffect(() => {
    if (!jobId) { setNotFound(true); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    api.get(`/jobs/${jobId}`)
      .then(({ data }) => { if (alive) { setJob(data); setSaved(!!data.isSaved); setApplied(!!data.isApplied); } })
      .catch(() => { if (alive) setNotFound(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [jobId]);

  useEffect(() => {
    Promise.all([api.get('/profile'), api.get('/profile/totals')])
      .then(([p, t]) => { setProfile(p.data); setTotals(t.data); })
      .catch(() => {});
  }, []);

  const toggleSave = useCallback(async () => {
    const was = saved;
    setSaved(!was);
    try {
      if (was) await api.delete(`/jobs/${jobId}/save`);
      else await api.post(`/jobs/${jobId}/save`);
    } catch { setSaved(was); }
  }, [saved, jobId]);

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={pilot.navy} /><Text style={styles.loadingText}>Loading job…</Text></View></SafeAreaView>;
  }
  if (notFound || !job) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.h1}>Job not found</Text>
          <Text style={styles.emptyText}>This role may have been removed or the link is incorrect.</Text>
          <Pressable onPress={() => router.replace('/jobs')}><Text style={styles.link}>← Back to jobs</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const mc = profile && totals ? computeMatchCount(job, profile, totals) : null;
  const hasReqs = !!mc && mc.total > 0;
  const serverMatch = matchLabel(job.matchScore);
  const roleLabel = job.role ? (ROLE_LABEL[job.role] || job.role) : null;
  const expired =
    (job.status && ['CLOSED', 'EXPIRED', 'INACTIVE', 'ARCHIVED'].includes(String(job.status).toUpperCase())) ||
    job.isActive === false ||
    (job.expiresAt && new Date(job.expiresAt).getTime() < Date.now());
  const ago = postedAgo(job.postedAt);
  const salaryStr = formatSalary(job);

  const handleApply = () => {
    if (job.applyUrl) Linking.openURL(job.applyUrl).catch(() => {});
    api.post(`/jobs/${jobId}/apply`).then(() => { setApplied(true); setApplyNote(null); }).catch(() => setApplyNote('warn'));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.replace('/jobs')} style={styles.backRow}>
          <Ionicons name="arrow-back" size={14} color={pilot.navy} />
          <Text style={styles.link}> Back to jobs</Text>
        </Pressable>

        {/* Header */}
        <View style={styles.headerRow}>
          {airline?.logoUrl ? (
            <AirlineLogo logoUrl={airline.logoUrl} iataCode={airline.iataCode} name={job.company} box={72} />
          ) : (
            <View style={styles.logoBox}><Text style={styles.logoInitials}>{String(job.company || '?').split(/\s+/).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}</Text></View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.company}>{job.company}</Text>
            <Text style={styles.jobTitle}>{roleLabel || job.title}</Text>
            <View style={styles.metaRow}>
              {job.location ? <Text style={styles.meta}><Ionicons name="location-outline" size={12} color={pilot.muted} /> {job.location}</Text> : null}
              {job.reqAircraftTypes?.[0] ? <Text style={styles.meta}>{job.reqAircraftTypes.join(', ')}</Text> : null}
              {ago ? <Text style={styles.meta}>{ago}</Text> : null}
            </View>
          </View>
        </View>

        {salaryStr ? <Text style={styles.salary}>$ {salaryStr}</Text> : null}
        {job.sourcePlatform === 'EMPLOYER_DIRECT' ? <Text style={styles.employerBadge}>Posted directly by employer</Text> : null}
        {(airline?.id || job.airlineId) ? (
          <Pressable style={styles.factfileLink} onPress={() => router.push(`/airlines/${airline?.id || job.airlineId}`)}>
            <Text style={styles.factfileText}>View {airline?.name || job.company} factfile →</Text>
          </Pressable>
        ) : null}
        {expired ? (
          <View style={styles.expiredBanner}><Text style={styles.expiredText}>⚠ This role is no longer accepting applications.</Text></View>
        ) : null}

        {/* Your Match */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>YOUR MATCH</Text>
          {mc ? (
            <>
              <View style={styles.matchHead}>
                {serverMatch ? (
                  <View>
                    <Text style={[styles.matchScoreNum, { color: matchStyle(job.matchScore).color }]}>{job.matchScore}%</Text>
                    <Text style={[styles.matchScoreLabel, { color: matchStyle(job.matchScore).color }]}>{matchStyle(job.matchScore).label}</Text>
                  </View>
                ) : null}
                {mc.total > 0 ? (
                  <View style={[styles.badge, { backgroundColor: mc.matched === mc.total ? semantic.successBg : semantic.warningBg }]}>
                    <Text style={[styles.badgeText, { color: mc.matched === mc.total ? semantic.success : semantic.warning }]}>{mc.matched}/{mc.total} requirements matched</Text>
                  </View>
                ) : <Text style={styles.mutedBody}>No requirements specified</Text>}
              </View>
              {hasReqs ? <View style={{ marginTop: 8 }}>{mc.requirements.map((r) => <ReqRow key={r.label} req={r} />)}</View> : null}
            </>
          ) : (
            <Text style={styles.mutedBody}>Complete your pilot profile to see your match against this role.</Text>
          )}
        </View>

        {/* Description — long ones collapse to 3 lines with a Show more toggle */}
        {job.description ? (() => {
          const descText = htmlToText(job.description);
          const isLong = descText.length > 220;
          return (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>JOB DESCRIPTION</Text>
              <Text style={styles.bodyText} numberOfLines={isLong && !descExpanded ? 3 : undefined}>{descText}</Text>
              {isLong ? (
                <Pressable onPress={() => setDescExpanded((v) => !v)} hitSlop={8} style={styles.showMoreBtn}>
                  <Text style={styles.showMoreText}>{descExpanded ? 'Show less' : 'Show more'}</Text>
                  <Ionicons name={descExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={pilot.navy} />
                </Pressable>
              ) : null}
            </View>
          );
        })() : null}

        {/* Notes / Benefits */}
        {job.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>NOTES / BENEFITS</Text>
            <View style={styles.notesBox}><Text style={styles.bodyText}>{job.notes}</Text></View>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View style={styles.bottomBar}>
        {applyNote === 'warn' ? <Text style={styles.warnNote}>Couldn't record your application (it still opened in a new tab).</Text> : null}
        <View style={styles.ctaRow}>
          {expired ? (
            <View style={[styles.applyBtn, styles.applyBtnDisabled]}><Text style={styles.applyBtnText}>Applications closed</Text></View>
          ) : (
            <Pressable style={styles.applyBtn} onPress={handleApply}><Text style={styles.applyBtnText}>View Full Posting &amp; Apply →</Text></Pressable>
          )}
          <Pressable style={styles.saveBtn} onPress={toggleSave}><Text style={styles.saveBtnText}>{saved ? '✓ Saved' : 'Save'}</Text></Pressable>
        </View>
        {applied ? <Text style={styles.appliedNote}>✓ Applied</Text> : null}
        <Text style={styles.disclaimer}>Never share bank or credit card details when applying.</Text>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  content: { padding: spacing.xl, paddingBottom: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  loadingText: { color: pilot.navy, fontFamily: fontFamilies.body },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  link: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },

  headerRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginBottom: 14 },
  logoBox: { width: 56, height: 56, borderRadius: 8, backgroundColor: 'rgba(0,63,136,0.06)', alignItems: 'center', justifyContent: 'center' },
  logoInitials: { fontFamily: fontFamilies.bodyBold, fontSize: 18, color: pilot.navy },
  company: { fontSize: fontSizes.base, color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },
  jobTitle: { fontFamily: fontFamilies.bodyBold, fontSize: 26, color: pilot.ink, marginVertical: 6, letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  meta: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body },
  salary: { alignSelf: 'flex-start', backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold, color: SEM.amber, marginBottom: 14, overflow: 'hidden' },
  employerBadge: { alignSelf: 'flex-start', fontSize: fontSizes.xs, fontFamily: fontFamilies.bodySemiBold, color: pilot.muted, borderWidth: 1, borderColor: pilot.line, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 14, overflow: 'hidden' },
  factfileLink: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,63,136,0.06)', borderWidth: 1, borderColor: 'rgba(0,63,136,0.2)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 14 },
  factfileText: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  expiredBanner: { backgroundColor: semantic.errorBg, borderWidth: 1, borderColor: '#FECACA', borderRadius: 8, padding: 12, marginBottom: 14 },
  expiredText: { color: SEM.red, fontSize: fontSizes.sm, fontFamily: fontFamilies.body },

  section: { marginBottom: 24 },
  card: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 18, marginBottom: 24 },
  sectionLabel: { fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.bodySemiBold, letterSpacing: 1, marginBottom: 8 },
  matchHead: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  matchScoreNum: { fontFamily: fontFamilies.mono, fontSize: 28 },
  matchScoreLabel: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: fontFamilies.bodyBold },
  mutedBody: { fontSize: fontSizes.base, color: pilot.muted, fontFamily: fontFamilies.body, lineHeight: 22 },

  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 6, flexWrap: 'wrap' },
  reqRowMiss: { backgroundColor: '#FEF2F2' },
  reqLabel: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, minWidth: 80 },
  reqValue: { flex: 1, minWidth: 80, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold },
  reqPilot: { fontSize: fontSizes.xs, fontFamily: fontFamilies.body, textAlign: 'right' },

  bodyText: { fontSize: fontSizes.base, color: pilot.ink, fontFamily: fontFamilies.body, lineHeight: 24 },
  showMoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4 },
  showMoreText: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  notesBox: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 8, padding: 12 },

  bottomBar: { borderTopWidth: 1, borderTopColor: pilot.line, backgroundColor: pilot.cream, paddingHorizontal: spacing.xl, paddingTop: 12, paddingBottom: 8, gap: 6 },
  ctaRow: { flexDirection: 'row', gap: 12 },
  applyBtn: { flex: 1, backgroundColor: pilot.navy, borderRadius: 4, paddingVertical: 13, alignItems: 'center' },
  applyBtnDisabled: { opacity: 0.5 },
  applyBtnText: { color: '#fff', fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.base },
  saveBtn: { borderWidth: 1, borderColor: pilot.navy, borderRadius: 4, paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center' },
  saveBtnText: { color: pilot.navy, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.base },
  appliedNote: { color: SEM.green, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  warnNote: { color: SEM.amber, fontFamily: fontFamilies.body, fontSize: fontSizes.sm },
  disclaimer: { fontSize: fontSizes.xs, fontStyle: 'italic', color: pilot.muted, fontFamily: fontFamilies.body },

  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes.xl, color: pilot.ink },
  emptyText: { fontSize: fontSizes.base, color: pilot.muted, fontFamily: fontFamilies.body, textAlign: 'center', lineHeight: 22 },
});
