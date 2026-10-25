// One airline's fact file, in the order a pilot asks the questions: can I apply
// here, what do they want, what is it like, how does hiring go — then what
// nobody has recorded yet. Matches the web page at 390 px.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../src/lib/api';
import { HiringPill, LogoTile, RequirementRow } from '../../../../src/components/airlines/AirlineBits';
import { formatFieldDate, hashStage, resolveFieldDate } from '../../../../src/lib/fieldDates';
import {
  aircraftTotal, contractLabel, fleetRows, missingFacts, parseStages, readPay, upgradeLabel,
} from '../../../../src/lib/airlineFacts';
import { useTabBarClearance } from '../../../../src/theme/tabBar';
import { fontFamilies, spacing, layout } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function AirlineFactFile() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const clearance = useTabBarClearance();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [airline, setAirline] = useState<Any>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    api.get(`/airlines/${id}`).then(({ data }) => setAirline(data)).catch(() => setGone(true));
  }, [id]);

  const header = (
    <View style={styles.bar}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="chevron-back" size={20} color={pilot.navy} />
        <Text style={styles.backText}>Airlines</Text>
      </Pressable>
    </View>
  );

  if (gone) {
    return <SafeAreaView style={styles.safe} edges={[]}>{header}<Text style={styles.empty}>That airline is no longer listed.</Text></SafeAreaView>;
  }
  if (!airline) {
    return <SafeAreaView style={styles.safe} edges={[]}>{header}<ActivityIndicator color={pilot.navy} style={{ marginTop: 30 }} /></SafeAreaView>;
  }

  const fd = airline.fieldDates || {};
  const jobs = airline.jobs || { open: 0, qualify: 0, close: 0, matchable: false };
  const checks = airline.requirementChecks || [];
  const derived = airline.derivedRequirements;
  const pay = readPay(airline.payRanges);
  const fleet = fleetRows(airline);
  const stages = parseStages(airline.interviewStages);
  const gaps = missingFacts(airline);
  const aircraft = aircraftTotal(airline);
  const bases = (airline.bases || []).length;
  const simStage = stages.findIndex((s) => /sim/i.test(s.title));

  const dateNote = (logical: string, item?: string) => {
    const d = resolveFieldDate(fd, logical, item);
    return d ? `recorded ${formatFieldDate(d)}` : null;
  };

  const tiles = [
    aircraft ? { v: String(aircraft), l: 'Aircraft' } : null,
    bases ? { v: String(bases), l: bases === 1 ? 'Base' : 'Bases' } : null,
    airline.avgResponseDays ? { v: `~${airline.avgResponseDays} d`, l: 'Reply time' } : null,
  ].filter(Boolean) as { v: string; l: string }[];

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: clearance }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <LogoTile logoUrl={airline.logoUrl} iataCode={airline.iataCode} name={airline.name} size={64} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name}>{airline.name}</Text>
            <Text style={styles.sub}>
              {[airline.iataCode, airline.icaoCode, airline.headquarters || airline.country].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        <View style={styles.status}>
          <HiringPill status={airline.hiringStatus} long />
          {resolveFieldDate(fd, 'hiringStatus')
            ? <Text style={styles.statusDate}>checked {formatFieldDate(resolveFieldDate(fd, 'hiringStatus'))}</Text>
            : null}
        </View>

        {jobs.open > 0 ? (
          <Pressable style={styles.cta} onPress={() => router.push(`/jobs?company=${encodeURIComponent(airline.name)}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>{jobs.open} open job{jobs.open === 1 ? '' : 's'}</Text>
              <Text style={styles.ctaSub}>
                {jobs.matchable
                  ? `You qualify for ${jobs.qualify}${jobs.close ? ` · ${jobs.close} more are close` : ''}`
                  : 'Add your licence and hours to see which are open to you'}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        ) : null}

        {tiles.length > 0 ? (
          <View style={styles.quick}>
            {tiles.map((t) => (
              <View key={t.l} style={styles.quickCell}><Text style={styles.quickNum}>{t.v}</Text><Text style={styles.quickLabel}>{t.l}</Text></View>
            ))}
          </View>
        ) : null}

        {checks.length > 0 ? (
          <View style={styles.box}>
            <View style={styles.boxHead}>
              <Text style={styles.boxTitle}>What they ask for</Text>
              {derived?.vacancyCount ? <Text style={styles.boxEm}>from {derived.vacancyCount} current job{derived.vacancyCount === 1 ? '' : 's'}</Text> : null}
            </View>
            {checks.map((c: Any, i: number) => <RequirementRow key={i} label={c.label} status={c.status} you={c.you} />)}
            <Text style={styles.note}>Worked out from the airline&apos;s current job ads, not typed in by hand.</Text>
          </View>
        ) : null}

        {pay.length > 0 ? (
          <View style={styles.box}>
            <View style={styles.boxHead}>
              <Text style={styles.boxTitle}>Pay</Text>
              <Text style={styles.boxEm}>{pay.some((x) => x.usd) ? 'US dollars, converted' : 'as recorded'}</Text>
            </View>
            {pay.map((p) => (
              <View key={p.key} style={styles.kv}>
                <Text style={styles.kvK}>{p.label}</Text>
                <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                  <Text style={styles.kvV}>{p.usd || p.recorded}</Text>
                  {p.usd ? <Text style={styles.kvD}>recorded {p.recorded} · converted at {p.convertedAt} rate</Text> : null}
                  <Text style={styles.kvD}>{dateNote('payRanges', p.key) || 'no date recorded'}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {fleet.length > 0 ? (
          <View style={styles.box}>
            <View style={styles.boxHead}>
              <Text style={styles.boxTitle}>Fleet</Text>
              {dateNote('fleet') ? <Text style={styles.boxEm}>{dateNote('fleet')}</Text> : null}
            </View>
            <View style={styles.fleetHead}>
              <Text style={[styles.fleetTh, { flex: 1, textAlign: 'left' }]}>Type</Text>
              <Text style={styles.fleetTh}>In service</Text>
              <Text style={styles.fleetTh}>On order</Text>
            </View>
            {fleet.map((f) => (
              <View key={f.type} style={styles.fleetRow}>
                <Text style={[styles.fleetCell, { flex: 1, textAlign: 'left' }]}>{f.type}</Text>
                <Text style={styles.fleetCell}>{f.inService ?? '—'}</Text>
                <Text style={styles.fleetCell}>{f.ordered ?? '—'}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {(bases > 0 || airline.contractType || airline.rosterPattern
          || airline.upgradeTimeMinYears != null || airline.upgradeTimeMaxYears != null) ? (
            <View style={styles.box}>
              <View style={styles.boxHead}><Text style={styles.boxTitle}>Contract and roster</Text></View>
              {bases > 0 ? <Row k="Bases" v={airline.bases.join(', ')} d={dateNote('bases')} styles={styles} /> : null}
              {contractLabel(airline.contractType) ? <Row k="Contract" v={contractLabel(airline.contractType) as string} d={dateNote('contractType')} styles={styles} /> : null}
              {airline.rosterPattern ? <Row k="Roster" v={airline.rosterPattern} d={dateNote('rosterPattern')} styles={styles} /> : null}
              {upgradeLabel(airline.upgradeTimeMinYears, airline.upgradeTimeMaxYears)
                ? <Row k="Upgrade to Captain" v={upgradeLabel(airline.upgradeTimeMinYears, airline.upgradeTimeMaxYears) as string} d={dateNote('upgradeTime')} styles={styles} />
                : null}
            </View>
          ) : null}

        {(stages.length > 0 || airline.simType) ? (
          <View style={styles.box}>
            <View style={styles.boxHead}><Text style={styles.boxTitle}>Hiring process</Text></View>
            {stages.map((s, i) => (
              <View key={`${s.title}-${i}`} style={styles.stage}>
                <View style={styles.stageNum}><Text style={styles.stageNumText}>{i + 1}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.stageText}>
                    {s.title}{i === simStage && airline.simType ? ` · ${airline.simType}` : ''}
                  </Text>
                  {s.points.length > 0 ? <Text style={styles.stagePoints}>{s.points.join(' · ')}</Text> : null}
                  {dateNote('interviewStages', hashStage(s.title))
                    ? <Text style={styles.stageDate}>{dateNote('interviewStages', hashStage(s.title))}</Text>
                    : null}
                </View>
              </View>
            ))}
            {airline.simType && simStage === -1 ? (
              <View style={styles.stage}>
                <View style={styles.stageNum}><Text style={styles.stageNumText}>{stages.length + 1}</Text></View>
                <Text style={[styles.stageText, { flex: 1 }]}>Simulator: {airline.simType}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {gaps.length > 0 ? (
          <View style={styles.unknown}>
            <Text style={styles.unknownText}>
              <Text style={styles.unknownStrong}>Not recorded yet:</Text> {gaps.join(', ')}. Flown for them?{' '}
              <Text style={styles.link} onPress={() => router.push(`/airlines/${id}/contribute`)}>Add what you know</Text>
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ k, v, d, styles }: { k: string; v: string; d: string | null; styles: Any }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvK}>{k}</Text>
      <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
        <Text style={styles.kvV}>{v}</Text>
        {d ? <Text style={styles.kvD}>{d}</Text> : null}
      </View>
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  content: { padding: layout.screenX, paddingTop: 4 },
  bar: { paddingHorizontal: 12, paddingVertical: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { color: pilot.navy, fontSize: 14, fontFamily: fontFamilies.body },
  empty: { padding: spacing.xl, color: pilot.muted, fontFamily: fontFamilies.body },

  hero: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 10 },
  name: { fontFamily: fontFamilies.display, fontSize: 26, color: pilot.ink, lineHeight: 30 },
  sub: { fontSize: 13, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  statusDate: { fontSize: 12, color: pilot.faint, fontFamily: fontFamilies.body },

  cta: { marginTop: 14, backgroundColor: pilot.navy, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  ctaTitle: { color: '#fff', fontSize: 15, fontFamily: fontFamilies.bodySemiBold },
  ctaSub: { color: '#fff', opacity: 0.82, fontSize: 12.5, fontFamily: fontFamilies.body, marginTop: 2 },

  quick: { flexDirection: 'row', gap: 8, marginTop: 12 },
  quickCell: { flex: 1, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  quickNum: { fontFamily: fontFamilies.display, fontSize: 19, color: pilot.ink },
  quickLabel: { fontSize: 11.5, color: pilot.faint, fontFamily: fontFamilies.body },

  box: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 14, marginTop: 12 },
  boxHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 4 },
  boxTitle: { fontSize: 12, fontFamily: fontFamilies.bodyBold, letterSpacing: 0.8, textTransform: 'uppercase', color: '#6B778A' },
  boxEm: { fontSize: 11.5, color: pilot.faint, fontFamily: fontFamilies.body },
  note: { fontSize: 12, color: pilot.faint, fontFamily: fontFamilies.body, marginTop: 8, lineHeight: 17 },

  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#EEF1F5' },
  kvK: { fontSize: 13.5, color: pilot.muted, fontFamily: fontFamilies.body },
  kvV: { fontSize: 13.5, color: pilot.ink, fontFamily: fontFamilies.bodySemiBold, textAlign: 'right' },
  kvD: { fontSize: 11.5, color: pilot.faint, fontFamily: fontFamilies.body, marginTop: 2 },

  fleetHead: { flexDirection: 'row', gap: 10, paddingBottom: 4 },
  fleetTh: { width: 68, textAlign: 'right', fontSize: 11, color: pilot.faint, fontFamily: fontFamilies.bodySemiBold },
  fleetRow: { flexDirection: 'row', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#EEF1F5' },
  fleetCell: { width: 68, textAlign: 'right', fontSize: 13.5, color: pilot.ink, fontFamily: fontFamilies.body, fontVariant: ['tabular-nums'] },

  stage: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 7 },
  stageNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#EEF2F7', alignItems: 'center', justifyContent: 'center' },
  stageNumText: { fontSize: 11.5, fontFamily: fontFamilies.bodyBold, color: pilot.navy },
  stageText: { fontSize: 13.5, color: pilot.ink, fontFamily: fontFamilies.body, lineHeight: 19 },
  stagePoints: { fontSize: 12.5, color: pilot.faint, fontFamily: fontFamilies.body, marginTop: 3, lineHeight: 18 },
  stageDate: { fontSize: 11.5, color: pilot.faint, fontFamily: fontFamilies.body, marginTop: 2 },

  unknown: { marginTop: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C9D2DD', borderRadius: 12, padding: 13 },
  unknownText: { fontSize: 13, color: pilot.muted, fontFamily: fontFamilies.body, lineHeight: 20 },
  unknownStrong: { color: pilot.ink, fontFamily: fontFamilies.bodySemiBold },
  link: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },
});
