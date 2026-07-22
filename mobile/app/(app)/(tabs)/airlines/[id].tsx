// Airline factfile — mirrors frontend/src/pages/AirlineDetail.jsx. Pilot
// editorial-light. GET /airlines/:id + GET /airlines/:id/job-count. Read-only;
// "Suggest an edit" (any authed user) → the moderated contribution flow.
// Sections in web order: Hero → Operations → Compensation → Career →
// Application Process → Notes → trust footer.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../src/lib/api';
import AirlineLogo from '../../../../src/components/AirlineLogo';
import { EMPTY_FIELD, contractLabel, hiringFreqLabel, hiringMeta, relativeDate } from '../../../../src/lib/airlineFormat';
import { fontFamilies, fontSizes, pilot, spacing } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Airline = Record<string, any>;

function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children != null && children !== false ? <View style={styles.fieldValue}>{children}</View> : <Text style={styles.emptyField}>{EMPTY_FIELD}</Text>}
    </View>
  );
}
function Tags({ items }: { items: string[] }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.tags}>{items.map((t) => <Text key={t} style={styles.tag}>{t}</Text>)}</View>;
}
function Val({ children }: { children: string }) {
  const styles = useThemedStyles(createStyles); return <Text style={styles.valText}>{children}</Text>; }

export default function AirlineDetail() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [airline, setAirline] = useState<Airline | null>(null);
  const [jobCount, setJobCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get(`/airlines/${id}`), api.get(`/airlines/${id}/job-count`)])
      .then(([a, j]) => { setAirline(a.data); setJobCount(j.data.count); })
      .catch(() => router.replace('/airlines'))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={pilot.navy} /></View></SafeAreaView>;
  if (!airline) return null;

  const a = airline;
  const badge = hiringMeta(a.hiringStatus);
  const pay = a.payRanges;
  const payStr = (p: Airline) => `${p.min?.toLocaleString() ?? '?'} – ${p.max?.toLocaleString() ?? '?'} ${p.currency ?? ''} / ${p.period ?? 'year'}`;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.replace('/airlines')} style={styles.backRow}><Text style={styles.back}>← Back to Airlines</Text></Pressable>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', gap: 14 }}>
              {a.logoUrl ? (
                <AirlineLogo logoUrl={a.logoUrl} iataCode={a.iataCode} name={a.name} box={56} />
              ) : (
                <View style={styles.logo}><Text style={styles.logoText}>{String(a.name).split(/\s+/).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}</Text></View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroName}>{a.name}</Text>
                <View style={styles.codes}>
                  {a.iataCode ? <Text style={[styles.codeChip, styles.codeAccent]}>IATA: {a.iataCode}</Text> : null}
                  {a.icaoCode ? <Text style={styles.codeChip}>ICAO: {a.icaoCode}</Text> : null}
                </View>
                <Text style={styles.heroMeta}>{a.country} · {a.region}{a.headquarters ? ` · ${a.headquarters}` : ''}</Text>
                {a.domain ? (
                  <Pressable
                    onPress={() => Linking.openURL(`https://${String(a.domain).replace(/^https?:\/\//, '')}`)}
                    hitSlop={8}
                    style={styles.websiteLink}
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${a.name} official website`}
                  >
                    <Ionicons name="globe-outline" size={13} color={pilot.navy} />
                    <Text style={styles.websiteText}>{String(a.domain).replace(/^https?:\/\//, '').replace(/\/$/, '')}</Text>
                    <Ionicons name="open-outline" size={12} color={pilot.navy} />
                  </Pressable>
                ) : null}
              </View>
            </View>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}><Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text></View>
          </View>
          <Pressable style={styles.suggestBtn} onPress={() => router.push(`/airlines/${id}/contribute`)}>
            <Ionicons name="create-outline" size={14} color={pilot.navy} />
            <Text style={styles.suggestText}> Suggest an edit</Text>
          </Pressable>
          {a.description ? <Text style={styles.desc}>{a.description}</Text> : null}
          <Pressable style={styles.jobsLink} onPress={() => router.push({ pathname: '/jobs', params: { q: a.name } })}>
            <Text style={styles.jobsLinkText}>Open jobs at {a.name}{jobCount !== null ? ` (${jobCount})` : ''} →</Text>
          </Pressable>
        </View>

        {/* Operations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OPERATIONS</Text>
          {a.fleetDetail?.length > 0 ? (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Fleet</Text>
              {a.fleetDetail.map((r: Airline, i: number) => {
                const segs: string[] = [];
                if (r.inService != null) segs.push(`${r.inService} in service`);
                if (r.ordered != null) segs.push(`${r.ordered} on order`);
                if (r.retired != null) segs.push(`${r.retired} retired`);
                return <View key={r.type + i} style={styles.fleetCard}><Text style={styles.fleetType}>{r.type}</Text><Text style={styles.fleetLine}>{segs.join(' · ') || '—'}</Text></View>;
              })}
            </View>
          ) : (
            <Field label="Fleet">{a.fleet?.length > 0 ? <Tags items={a.fleet} /> : null}</Field>
          )}
          <Field label="Bases">{a.bases?.length > 0 ? <Tags items={a.bases} /> : null}</Field>
          <Field label="Contract Type">{a.contractType ? <Val>{contractLabel(a.contractType)}</Val> : null}</Field>
          <Field label="Roster Pattern">{a.rosterPattern ? <Val>{a.rosterPattern}</Val> : null}</Field>
          <Field label="Work Auth Required">{a.workAuthRequired?.length > 0 ? <Tags items={a.workAuthRequired} /> : null}</Field>
        </View>

        {/* Compensation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>COMPENSATION</Text>
          <Field label="Captain Pay">{pay?.captain ? <Val>{payStr(pay.captain)}</Val> : null}</Field>
          <Field label="First Officer Pay">{pay?.fo ? <Val>{payStr(pay.fo)}</Val> : null}</Field>
        </View>

        {/* Career */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CAREER</Text>
          <Field label="Hiring Status"><View style={[styles.badge, { backgroundColor: badge.bg, alignSelf: 'flex-start' }]}><Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text></View></Field>
          <Field label="Hiring Frequency">{hiringFreqLabel(a.hiringFrequency) ? <Val>{hiringFreqLabel(a.hiringFrequency) as string}</Val> : null}</Field>
          <Field label="Upgrade Timeline">{(a.upgradeTimeMinYears != null || a.upgradeTimeMaxYears != null) ? <Val>{`${a.upgradeTimeMinYears ?? '?'} – ${a.upgradeTimeMaxYears ?? '?'} years`}</Val> : null}</Field>
        </View>

        {/* Application Process */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>APPLICATION PROCESS</Text>
          <Field label="Avg Response Time">{a.avgResponseDays != null ? <Val>{`~${a.avgResponseDays} day${a.avgResponseDays !== 1 ? 's' : ''}`}</Val> : null}</Field>
          <Field label="Interview Stages">{a.interviewStages?.length > 0 ? (
            <View>{a.interviewStages.map((s: string, i: number) => (
              <View key={i} style={styles.stageRow}><Text style={styles.stageNum}>{i + 1} </Text><Text style={styles.valText}>{s}</Text></View>
            ))}</View>
          ) : null}</Field>
          <Field label="Sim Type">{a.simType ? <Val>{a.simType}</Val> : null}</Field>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTES</Text>
          {a.notes ? <Text style={styles.notes}>{a.notes}</Text> : <Text style={styles.emptyField}>{EMPTY_FIELD}</Text>}
        </View>

        {/* Trust footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Submitted by {a.verifiedContributors} pilot{a.verifiedContributors !== 1 ? 's' : ''}</Text>
          <Text style={styles.footerText}>Last updated {relativeDate(a.lastUpdatedAt)}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, paddingBottom: 40 },
  backRow: { marginBottom: 16 },
  back: { color: pilot.muted, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },
  hero: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 14, padding: 22, marginBottom: 16 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  logo: { width: 52, height: 52, borderRadius: 10, backgroundColor: 'rgba(0,63,136,0.06)', alignItems: 'center', justifyContent: 'center' },
  logoText: { fontFamily: fontFamilies.bodyBold, fontSize: 16, color: pilot.navy },
  heroName: { fontFamily: fontFamilies.display, fontSize: fontSizes['2xl'], color: pilot.ink, letterSpacing: -0.3 },
  codes: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  codeChip: { fontSize: 11, fontFamily: fontFamilies.mono, fontWeight: '700', color: pilot.muted, backgroundColor: pilot.cream, borderWidth: 1, borderColor: pilot.line, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  codeAccent: { color: pilot.navy, backgroundColor: 'rgba(0,63,136,0.08)', borderColor: 'rgba(0,63,136,0.2)' },
  heroMeta: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 12 },
  websiteLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-start' },
  websiteText: { fontSize: fontSizes.sm, color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontFamily: fontFamilies.bodyBold },
  suggestBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: pilot.navy, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 9, marginTop: 16 },
  suggestText: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  desc: { marginTop: 14, fontSize: fontSizes.base, color: pilot.muted, fontFamily: fontFamilies.body, lineHeight: 24 },
  jobsLink: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,63,136,0.06)', borderWidth: 1, borderColor: 'rgba(0,63,136,0.2)', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, marginTop: 14 },
  jobsLinkText: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base },
  section: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 20, marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontFamily: fontFamilies.bodyBold, color: pilot.muted, letterSpacing: 1, marginBottom: 16 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.bodySemiBold, marginBottom: 6 },
  fieldValue: {},
  valText: { fontSize: fontSizes.base, color: pilot.ink, fontFamily: fontFamilies.body, lineHeight: 22 },
  emptyField: { fontSize: fontSizes.sm, color: pilot.muted, fontStyle: 'italic', fontFamily: fontFamilies.body },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { fontSize: fontSizes.xs, color: pilot.navy, backgroundColor: 'rgba(0,63,136,0.08)', borderWidth: 1, borderColor: 'rgba(0,63,136,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  fleetCard: { backgroundColor: pilot.cream, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, padding: 12, marginBottom: 8 },
  fleetType: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodyBold, color: pilot.ink, marginBottom: 4 },
  fleetLine: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.mono },
  stageRow: { flexDirection: 'row', marginBottom: 4 },
  stageNum: { color: pilot.navy, fontSize: 11, fontFamily: fontFamilies.bodyBold, paddingTop: 3 },
  notes: { fontSize: fontSizes.base, color: pilot.ink, fontFamily: fontFamilies.body, lineHeight: 26 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 6, borderTopWidth: 1, borderTopColor: pilot.line, paddingTop: 16 },
  footerText: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body },
});
