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
  extractUuid, formatSalary, postedAgo, statusMeta,
} from '../../../../src/lib/jobMatch';
import AirlineLogo from '../../../../src/components/AirlineLogo';
import { fetchAirlineMap, resolveAirline } from '../../../../src/lib/airlineLookup';
import { jobRequirements, parseDescriptionBlocks } from '../../../../src/lib/jobRequirements';
import { displayTitle, locationName } from '../../../../src/lib/displayNames';
import { fontFamilies, fontSizes, pilot, semantic, spacing } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Job = Record<string, any>;

const ROLE_LABEL: Record<string, string> = { CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', INSTRUCTOR: 'Instructor', FLIGHT_ENGINEER: 'Flight Engineer' };

const AGGREGATOR_SOURCES = ['ADZUNA', 'CAREERJET', 'JOOBLE', 'REED'];

// Requirement grouping — same labels and order as web's JobDetailPanel.
const GROUP_LABEL: Record<string, string> = { must: 'Must-haves', hours: 'Hours', ratings: 'Ratings & medical' };
const GROUP_ORDER = ['must', 'hours', 'ratings'];

// Web's verdict sentence (JobDetailPanel). Shown under the %, so the two
// platforms say the same thing about the same match.
function verdictText(m: Job): string | null {
  if (!m) return null;
  const known = (m.counts?.met ?? 0) + (m.counts?.unmet ?? 0);
  if (m.blocker) {
    const b = (m.requirements || []).find((r: Job) => r.key === m.blocker);
    return `Blocker: ${b?.label}. This is a must-have and your profile doesn't meet it.`;
  }
  if ((m.counts?.unmet ?? 0) > 0) {
    return `${m.counts.met} of ${known} known requirements met. ${m.counts.unmet} still short${m.counts.unknown ? `, ${m.counts.unknown} not on your profile yet` : ''}.`;
  }
  const knownPhrase = known === 1 ? 'the known requirement' : known === 2 ? 'both known requirements' : `all ${known} known requirements`;
  return `You meet ${knownPhrase}.${m.counts?.unknown ? ` ${m.counts.unknown} item${m.counts.unknown > 1 ? "s aren't" : " isn't"} on your profile yet — add ${m.counts.unknown > 1 ? 'them' : 'it'} to confirm your match.` : ''}`;
}

// Short whole-sentence excerpt (≤ ~320 chars) for aggregator postings where we
// don't reproduce the full third-party text.
function toExcerpt(text: string, maxChars = 320): string {
  const t = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const lastEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return lastEnd > 80 ? cut.slice(0, lastEnd + 1) : `${cut.trim()}…`;
}

// A server match requirement (services/jobMatch.js), three display states:
//   met → green tick · not_met → red (has data, falls short) · add → grey
//   (unknown on the profile, "add X to check"). The % counts 'add' against it
//   but it is never shown as a red failure — matches web's three-state rows.
// Where an unknown ("add") requirement's row takes the pilot — mirrors the web
// ADD_LINK map in JobDetailPanel.jsx.
const ADD_LINK: Record<string, string> = {
  authority: '/profile', licence: '/profile', medical: '/profile', typeRating: '/profile',
  english: '/profile', workAuth: '/profile', education: '/profile',
  nationality: '/profile', clearance: '/profile',
  totalHours: '/logbook', picHours: '/logbook', multiHours: '/logbook',
  turbineHours: '/logbook', instrumentHours: '/logbook', ccHours: '/logbook',
};

function ReqRow({ req }: { req: Job }) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const color = req.state === 'met' ? SEM.green : req.state === 'not_met' ? SEM.red : pilot.muted;
  const icon = req.state === 'met' ? 'checkmark-circle' : req.state === 'not_met' ? 'close-circle' : 'ellipse-outline';
  const pilotText = req.state === 'add' ? (req.gap || 'Add to profile') : (req.reason || req.pilotText || '—');
  const addTo = req.state === 'add' ? (ADD_LINK[req.key] || '/profile') : null;
  const body = (
    <>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={styles.reqLabel}>{req.label}</Text>
      <Text style={[styles.reqValue, { color: req.state === 'met' ? pilot.ink : color }]}>{req.reqText}</Text>
      <Text style={[styles.reqPilot, addTo ? styles.reqPilotAdd : { color }]}>{pilotText}</Text>
    </>
  );
  if (addTo) {
    return (
      <Pressable onPress={() => router.push(addTo as never)} style={[styles.reqRow, styles.reqRowMiss]} accessibilityRole="button" accessibilityLabel={`${req.label} — ${pilotText}`}>
        {body}
      </Pressable>
    );
  }
  return <View style={[styles.reqRow, req.state !== 'met' && styles.reqRowMiss]}>{body}</View>;
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
  const [saved, setSaved] = useState(false);
  const [applied, setApplied] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [applyNote, setApplyNote] = useState<string | null>(null);
  // Resolve the job's company → airline factfile (scraped company strings vary
  // from canonical names, so job.airlineId is usually null → use the name map).
  const [airline, setAirline] = useState<{ id: string; name: string; logoUrl?: string | null; iataCode?: string | null; domain?: string | null } | null>(null);
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

  // Server-computed match (job.match from GET /jobs/:id) — identical to web +
  // Dashboard. statusMeta → label + tone colour; requirements carry three states.
  const m = job.match;
  const meta = statusMeta(m);
  const reqs: Job[] = m?.requirements || [];
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
            <Text style={styles.jobTitle}>{displayTitle(job.titleEn || job.title)}</Text>
            {roleLabel ? <Text style={styles.roleChip}>{roleLabel}</Text> : null}
            <View style={styles.metaRow}>
              {(job.location || job.country) ? <Text style={styles.meta}><Ionicons name="location-outline" size={12} color={pilot.muted} /> {locationName(job.location || job.country)}</Text> : null}
              {job.reqAircraftTypes?.[0] ? <Text style={styles.meta}>{job.reqAircraftTypes.join(', ')}</Text> : null}
              {ago ? <Text style={styles.meta}>{ago}</Text> : null}
              {airline?.domain ? (
                <Text
                  style={[styles.meta, { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold }]}
                  onPress={() => Linking.openURL(`https://${String(airline.domain).replace(/^https?:\/\//, '')}`)}
                >
                  Official careers site ↗
                </Text>
              ) : null}
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
          {meta ? (
            <>
              <View style={styles.matchHead}>
                {m.pct != null ? (
                  <View>
                    <Text style={[styles.matchScoreNum, { color: meta.color }]}>{m.pct}%</Text>
                    <Text style={[styles.matchScoreLabel, { color: meta.color }]}>{meta.label || 'Match'}</Text>
                  </View>
                ) : (
                  <Text style={styles.mutedBody}>{m.status === 'WRONG_CATEGORY' ? (m.category?.label || 'Different aircraft category') : 'No requirements stated'}</Text>
                )}
                {meta.shortfall ? (
                  <View style={[styles.badge, { backgroundColor: meta.tone === 'green' ? semantic.successBg : meta.tone === 'amber' ? semantic.warningBg : pilot.cream }]}>
                    <Text style={[styles.badgeText, { color: meta.color }]}>{meta.shortfall}</Text>
                  </View>
                ) : m.pct === 100 ? (
                  <View style={[styles.badge, { backgroundColor: semantic.successBg }]}>
                    <Text style={[styles.badgeText, { color: semantic.success }]}>You qualify</Text>
                  </View>
                ) : null}
              </View>
              {verdictText(m) ? <Text style={styles.verdict}>{verdictText(m)}</Text> : null}
              {reqs.length ? (
                <View style={{ marginTop: 8 }}>
                  <View style={styles.reqRow}>
                    <View style={{ width: 16 }} />
                    <Text style={[styles.reqLabel, { fontFamily: fontFamilies.bodySemiBold, color: pilot.muted }]}>Requirement</Text>
                    <Text style={[styles.reqValue, { color: pilot.muted, fontSize: fontSizes.xs }]}>Needed</Text>
                    <Text style={[styles.reqPilot, { color: pilot.muted }]}>You</Text>
                  </View>
                  {GROUP_ORDER.map((g) => {
                    const rows = reqs.filter((r: Job) => r.group === g);
                    if (!rows.length) return null;
                    return (
                      <View key={g}>
                        <Text style={styles.reqGroup}>{GROUP_LABEL[g]}</Text>
                        {rows.map((r: Job) => <ReqRow key={r.key} req={r} />)}
                      </View>
                    );
                  })}
                  {/* any row the server groups differently still shows */}
                  {reqs.filter((r: Job) => !GROUP_ORDER.includes(r.group)).map((r: Job) => <ReqRow key={r.key} req={r} />)}
                </View>
              ) : null}
              {m.category?.advisory ? <Text style={[styles.mutedBody, { marginTop: 8 }]}>{m.category.advisory}</Text> : null}
            </>
          ) : (
            <Text style={styles.mutedBody}>Complete your pilot profile to see your match against this role.</Text>
          )}
        </View>

        {/* Requirements — verbatim block if found, else structured fields,
            else an honesty message instead of sparse junk. */}
        {(() => {
          const verbatim = String(job.requirementsText || '').split('\n').map((l: string) => l.replace(/^•\s*/, '').trim()).filter(Boolean);
          const synth = jobRequirements(job);
          const hasFullDesc = !job.descriptionIsExcerpt && String(job.description || '').length >= 300;
          // Drop the synth list when the match rows above already cover it (#5) —
          // only the verbatim posting block is worth showing alongside the rows.
          if (verbatim.length < 2 && reqs.length) return null;
          const showSynth = synth.length >= 2 || (synth.length >= 1 && hasFullDesc);
          return (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>REQUIREMENTS</Text>
              {verbatim.length >= 2 ? verbatim.map((b, i) => (
                <View key={i} style={styles.bulletRow}><Text style={styles.bulletDot}>•</Text><Text style={styles.bulletText}>{b}</Text></View>
              )) : showSynth ? synth.map((r) => (
                <View key={r.label} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}><Text style={styles.reqFieldLabel}>{r.label}: </Text>{r.value}</Text>
                </View>
              )) : (
                <Text style={styles.excerptNote}>Requirements not listed — see the full posting.</Text>
              )}
            </View>
          );
        })()}

        {/* Description — structured (paragraphs + bullets); long ones collapse */}
        {job.description ? (() => {
          const isAggregator = AGGREGATOR_SOURCES.includes(job.sourcePlatform);
          const verbatim = String(job.requirementsText || '').split('\n').map((l: string) => l.replace(/^•\s*/, '').trim()).filter(Boolean);
          const synth = jobRequirements(job);
          const hasFullDesc = !job.descriptionIsExcerpt && String(job.description || '').length >= 300;
          const hasRealReqs = verbatim.length >= 2 || synth.length >= 2 || (synth.length >= 1 && hasFullDesc);

          // Aggregator posting WITH real requirements → excerpt + prominent link
          // out, no full third-party text. Others keep the full display.
          if (isAggregator && hasRealReqs) {
            return (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>JOB DESCRIPTION</Text>
                <Text style={styles.paraText}>{toExcerpt(String(job.description))}</Text>
                {job.applyUrl ? (
                  <Pressable onPress={() => Linking.openURL(job.applyUrl).catch(() => {})} style={styles.viewFullLink}>
                    <Text style={styles.viewFullLinkText}>View full posting{job.applyVia ? ` on ${job.applyVia}` : ''} →</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }

          const blocks = parseDescriptionBlocks(job.description);
          const collapsible = blocks.length > 3;
          const shown = collapsible && !descExpanded ? blocks.slice(0, 3) : blocks;
          return (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>JOB DESCRIPTION</Text>
              {job.descriptionIsExcerpt ? (
                <Text style={styles.excerptNote}>Excerpt — see the full posting on the official careers site.</Text>
              ) : null}
              {shown.map((b, i) => b.type === 'ul' ? (
                <View key={i} style={{ marginBottom: 8 }}>
                  {b.items.map((it, j) => (
                    <View key={j} style={styles.bulletRow}><Text style={styles.bulletDot}>•</Text><Text style={styles.bulletText}>{it}</Text></View>
                  ))}
                </View>
              ) : (
                <Text key={i} style={styles.paraText}>{b.text}</Text>
              ))}
              {collapsible ? (
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
            <Pressable style={styles.applyBtn} onPress={handleApply}><Text style={styles.applyBtnText}>Apply on the source ↗</Text></Pressable>
          )}
          <Pressable style={styles.saveBtn} onPress={toggleSave}><Text style={styles.saveBtnText}>{saved ? '✓ Saved' : 'Save'}</Text></Pressable>
        </View>
        {applied ? <Text style={styles.appliedNote}>✓ Applied</Text> : null}
        {job.applyIsDirect ? (
          <Text style={styles.applyTrustDirect}>✓ Apply directly with the airline/operator</Text>
        ) : job.applyVia ? (
          <Text style={styles.applyTrustVia}>Listed via {job.applyVia} — you'll be redirected to apply.</Text>
        ) : null}
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
  reqGroup: { fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: pilot.muted, fontFamily: fontFamilies.bodyBold, marginTop: 10, marginBottom: 2, paddingHorizontal: 8 },
  verdict: { fontSize: fontSizes.sm, color: pilot.ink, fontFamily: fontFamilies.body, lineHeight: 19, marginTop: 8 },
  roleChip: { alignSelf: 'flex-start', marginTop: 8, fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.bodySemiBold, backgroundColor: pilot.cream, borderWidth: 1, borderColor: pilot.line, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  reqPilotAdd: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, textDecorationLine: 'underline' },

  bodyText: { fontSize: fontSizes.base, color: pilot.ink, fontFamily: fontFamilies.body, lineHeight: 24 },
  paraText: { fontSize: fontSizes.base, color: pilot.ink, fontFamily: fontFamilies.body, lineHeight: 24, marginBottom: 10 },
  excerptNote: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, fontStyle: 'italic', marginBottom: 10 },
  viewFullLink: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 9, paddingHorizontal: 16, borderWidth: 1, borderColor: pilot.navy, borderRadius: 6, backgroundColor: 'rgba(0,63,136,0.04)' },
  viewFullLinkText: { color: pilot.navy, fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.sm },
  bulletRow: { flexDirection: 'row', marginBottom: 5, paddingRight: 4 },
  bulletDot: { fontSize: fontSizes.base, color: pilot.navy, marginRight: 8, lineHeight: 22 },
  bulletText: { flex: 1, fontSize: fontSizes.base, color: pilot.ink, fontFamily: fontFamilies.body, lineHeight: 22 },
  reqFieldLabel: { color: pilot.muted, fontFamily: fontFamilies.bodySemiBold },
  showMoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4 },
  showMoreText: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  notesBox: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 8, padding: 12 },

  bottomBar: { borderTopWidth: 1, borderTopColor: pilot.line, backgroundColor: pilot.cream, paddingHorizontal: spacing.xl, paddingTop: 12, paddingBottom: 8, gap: 6 },
  ctaRow: { flexDirection: 'row', gap: 12 },
  // Inventory 5.5 — one CTA on both platforms: brand navy, "Apply on the
  // source ↗". Green stays a STATUS colour (met / qualify), never a button.
  applyBtn: { flex: 1, backgroundColor: pilot.navy, borderRadius: 4, paddingVertical: 13, alignItems: 'center' },
  applyBtnDisabled: { opacity: 0.5 },
  applyBtnText: { color: '#fff', fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.base },
  saveBtn: { borderWidth: 1, borderColor: pilot.navy, borderRadius: 4, paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center' },
  saveBtnText: { color: pilot.navy, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.base },
  appliedNote: { color: SEM.green, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  applyTrustDirect: { color: '#166534', fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  applyTrustVia: { color: pilot.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.sm },
  warnNote: { color: SEM.amber, fontFamily: fontFamilies.body, fontSize: fontSizes.sm },
  disclaimer: { fontSize: fontSizes.xs, fontStyle: 'italic', color: pilot.muted, fontFamily: fontFamilies.body },

  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes.xl, color: pilot.ink },
  emptyText: { fontSize: fontSizes.base, color: pilot.muted, fontFamily: fontFamilies.body, textAlign: 'center', lineHeight: 22 },
});
