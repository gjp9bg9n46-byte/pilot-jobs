// Logbook Reports — phase 1.
//
// Every number comes from GET /logbook/reports, the same payload the web page
// reads. Nothing is computed here: a figure that differed between the two
// would be a bug a pilot could not explain.
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLogbookReports } from '../../../src/hooks/queries';
import { num, num1 } from '../../../src/lib/format';
import { fontFamilies, fontSizes, layout, radii, spacing } from '../../../src/theme/tokens';
import { ThemePalette, useThemedStyles, useThemeColors } from '../../../src/theme/ThemeContext';
import { useTabBarClearance } from '../../../src/theme/tabBar';

type Any = any;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (ym?: string | null) => {
  if (!ym) return null;
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
};
const dateLabel = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
};

/** A value the logbook never recorded is not zero, and must not read as zero. */
function Stat({ k, v, styles }: { k: string; v: number | null; styles: Any }) {
  return (
    <View style={styles.cell}>
      <Text style={v == null ? styles.svMissing : styles.sv}>{v == null ? 'Not recorded' : num1(v)}</Text>
      <Text style={styles.sk}>{k}</Text>
    </View>
  );
}

function Limit({ label, hours, limit, styles }: { label: string; hours: number; limit: number; styles: Any }) {
  const pct = limit > 0 ? Math.min(100, (hours / limit) * 100) : 0;
  const over = hours > limit;
  return (
    <View style={styles.lim}>
      <View style={styles.limRow}>
        <Text style={styles.limK}>{label}</Text>
        <Text style={styles.limV}>{num1(hours)} of {num(limit)} h</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }, pct < 50 && styles.fillSoft, over && styles.fillOver]} />
      </View>
      <Text style={styles.limLeft}>{over ? `${num1(hours - limit)} h over` : `${num1(limit - hours)} h remaining`}</Text>
    </View>
  );
}

export default function LogbookReportsScreen() {
  const styles = useThemedStyles(createStyles);
  const pilot = useThemeColors();
  const router = useRouter();
  const bottom = useTabBarClearance();

  const { data, isPending, error, refetch, isRefetching } = useLogbookReports();

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  if (isPending) {
    return (
      <SafeAreaView edges={[]} style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={pilot.navy} /><Text style={styles.dim}>Working out your numbers…</Text></View>
      </SafeAreaView>
    );
  }
  if (error || !data) {
    return (
      <SafeAreaView edges={[]} style={styles.safe}>
        <View style={styles.center}><Text style={styles.dim}>Could not load your reports.</Text></View>
      </SafeAreaView>
    );
  }

  const { basis, limits, recency, totals: t, milestone, jobsUnlocked, command, almostThere } = data;

  return (
    <SafeAreaView edges={[]} style={styles.safe}>
      <View style={styles.navrow}>
        <Pressable style={styles.back} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={18} color={pilot.navy} />
          <Text style={styles.backText}>Logbook</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={pilot.navy} />}
      >
        <Text style={styles.h1}>Reports</Text>
        <Text style={styles.lead}>What your logbook says about where you are and what you can fly next.</Text>
        <Text style={styles.basis}>
          Based on {num(basis.flightCount)} logged flight{basis.flightCount === 1 ? '' : 's'}
          {basis.firstFlight ? `\n${dateLabel(basis.firstFlight)} – ${dateLabel(basis.lastFlight)}` : ''}
        </Text>

        {limits ? (
          <View style={styles.card}>
            <Text style={styles.h2}>Flight time</Text>
            <Text style={styles.sub}>Block hours against the EASA ORO.FTL.210 ceilings. A helper for your own planning — your operator holds the official record.</Text>
            <Limit label="Last 28 days" hours={limits.last28Days.hours} limit={limits.last28Days.limit} styles={styles} />
            <Limit label={`Calendar year ${limits.calendarYear.year}`} hours={limits.calendarYear.hours} limit={limits.calendarYear.limit} styles={styles} />
            <Limit label="Last 12 months" hours={limits.last12Months.hours} limit={limits.last12Months.limit} styles={styles} />
            <Text style={styles.note}>Carry-forward hours are excluded — these windows count logged flights only.</Text>
          </View>
        ) : null}

        {recency ? (
          <View style={styles.card}>
            <Text style={styles.h2}>Recency</Text>
            <Text style={styles.sub}>Take-offs and landings in the last {recency.windowDays} days, by type.</Text>
            {!recency.trackable ? (
              <>
                <Text style={styles.flag}>Landings aren&rsquo;t recorded on most of your flights. Add them to track recency.</Text>
                <Text style={styles.note}>{num(recency.flightsWithLandings)} of your {num(recency.flightCount)} flights have landings recorded.</Text>
              </>
            ) : recency.byType.length === 0 ? (
              <Text style={styles.flag}>No landings in the last {recency.windowDays} days.</Text>
            ) : (
              <>
                {recency.byType.map((r: Any) => (
                  <View key={r.type}>
                    <View style={styles.row}>
                      <Text style={styles.rowN} numberOfLines={1}>{r.type} · day landings</Text>
                      <Text style={styles.rowH}>{num(r.day.count)}</Text>
                      <Text style={r.day.current ? styles.ok : styles.no}>{r.day.current ? '· current' : '· not current'}</Text>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.rowN} numberOfLines={1}>{r.type} · night landings</Text>
                      <Text style={styles.rowH}>{num(r.night.count)}</Text>
                      <Text style={r.night.current ? styles.ok : styles.no}>{r.night.current ? '· current' : '· not current'}</Text>
                    </View>
                  </View>
                ))}
                <View style={styles.strip}>
                  <View style={styles.cell}><Text style={styles.svSm}>{dateLabel(recency.byType[0].day.lapsesOn) || '—'}</Text><Text style={styles.sk}>Day lapses</Text></View>
                  <View style={styles.cell}><Text style={styles.svSm}>{dateLabel(recency.byType[0].night.lapsesOn) || '—'}</Text><Text style={styles.sk}>Night lapses</Text></View>
                </View>
              </>
            )}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.h2}>Totals</Text>
          <Text style={styles.sub}>Every hour in your logbook, split the way an application form asks for it.</Text>
          <Text style={styles.kcap}>Total time</Text>
          <Text style={styles.big}>{num1(t.totalTime)}<Text style={styles.bu}> h</Text></Text>
          <View style={styles.strip}>
            <Stat k="PIC" v={t.picTime} styles={styles} /><Stat k="SIC" v={t.sicTime} styles={styles} /><Stat k="Other" v={t.otherTime} styles={styles} />
          </View>
          <View style={styles.strip}>
            <Stat k="Night" v={t.nightTime} styles={styles} /><Stat k="IFR" v={t.instrumentTime} styles={styles} />
            <Stat k="Multi" v={t.multiEngineTime} styles={styles} /><Stat k="Turbine" v={t.turbineTime} styles={styles} /><Stat k="Jet" v={t.jetTime} styles={styles} />
          </View>
          {t.byType?.length ? (
            <>
              <Text style={styles.kcap}>By type</Text>
              {t.byType.map((r: Any) => (
                <View style={styles.row} key={r.type}>
                  <Text style={styles.rowN} numberOfLines={1}>{r.type}</Text>
                  <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.max(4, (r.hours / (t.byType[0].hours || 1)) * 100)}%` }]} /></View>
                  <Text style={styles.rowH}>{num1(r.hours)} h</Text>
                </View>
              ))}
            </>
          ) : null}
          <Text style={styles.note}>
            Carry-forward hours are included here, because these are career totals.
            {t.carryForward > 0 ? ` ${num1(t.carryForward)} h of your total was carried forward.` : ''}
          </Text>
        </View>

        {milestone ? (
          <View style={styles.card}>
            <Text style={styles.h2}>Next milestone</Text>
            <Text style={styles.sub}>Your pace over the last {milestone.paceWindowMonths || 12} calendar months, carried forward.</Text>
            <Text style={styles.kcap}>{num(milestone.next)} hours</Text>
            <Text style={styles.big}>{num1(milestone.remaining)}<Text style={styles.bu}> h to go</Text></Text>
            <View style={[styles.track, { marginTop: spacing.md }]}>
              <View style={[styles.fill, { width: `${Math.min(100, (milestone.current / milestone.next) * 100)}%` }]} />
            </View>
            <Text style={styles.limLeft}>{num1(milestone.current)} of {num(milestone.next)} h</Text>
            {milestone.pace
              ? <Text style={styles.flag}>At {num1(milestone.pace)} hours a month, you reach {num(milestone.next)} hours around {monthName(milestone.eta)}.</Text>
              : <Text style={styles.note}>Too few months of flying in the last year to project a date.</Text>}
          </View>
        ) : null}

        {jobsUnlocked ? (
          <View style={styles.card}>
            <Text style={styles.h2}>Jobs unlocked this year</Text>
            <Text style={styles.sub}>Live jobs you qualify for today that your hours on 1 January would not have reached.</Text>
            <Text style={styles.kcap}>Since {dateLabel(jobsUnlocked.since)}</Text>
            <Text style={styles.big}>{jobsUnlocked.delta >= 0 ? '+' : ''}{num(jobsUnlocked.delta)}<Text style={styles.bu}> jobs</Text></Text>
            <View style={styles.strip}>
              <View style={styles.cell}><Text style={styles.sv}>{num(jobsUnlocked.onJan1)}</Text><Text style={styles.sk}>On 1 Jan</Text></View>
              <View style={styles.cell}><Text style={styles.sv}>{num(jobsUnlocked.today)}</Text><Text style={styles.sk}>Today</Text></View>
              <View style={styles.cell}><Text style={styles.sv}>{num(jobsUnlocked.activeJobs)}</Text><Text style={styles.sk}>Live jobs</Text></View>
            </View>
            <Text style={styles.note}>The same matching rules the Jobs tab uses, re-run against your totals as they stood on 1 January.</Text>
          </View>
        ) : null}

        {command ? (
          <View style={styles.card}>
            <Text style={styles.h2}>Command</Text>
            <Text style={styles.sub}>
              Where you stand against the stated minimums in our live{command.type ? ` ${command.type}` : ''} Captain vacancies.
              Median of {num(command.sampleSize)} job{command.sampleSize === 1 ? '' : 's'}, not a rule of thumb.
            </Text>
            {command.medianTotalHours ? <Limit label="Total time" hours={command.yourTotalHours} limit={command.medianTotalHours} styles={styles} /> : null}
            {command.medianPicHours ? <Limit label="PIC time" hours={command.yourPicHours} limit={command.medianPicHours} styles={styles} /> : null}
            <Text style={styles.note}>A median, so half those vacancies ask for less.</Text>
          </View>
        ) : null}

        {almostThere?.length ? (
          <View style={styles.card}>
            <Text style={styles.h2}>Almost there</Text>
            <Text style={styles.sub}>Live jobs you meet on every requirement but one.</Text>
            {almostThere.map((j: Any) => (
              <Pressable key={j.id} style={styles.row} onPress={() => router.push(`/jobs/${j.id}`)}>
                <Text style={styles.rowN} numberOfLines={1}>{j.title}{j.company ? ` — ${j.company}` : ''}</Text>
                <Text style={styles.gap}>{j.gapHours != null ? `+${num(j.gapHours)} h` : j.shortfall}</Text>
              </Pressable>
            ))}
            <Text style={styles.note}>Ordered by how close the gap is. Fixed-wing roles only.</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 80 },
  navrow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.screenX, paddingVertical: 11,
    backgroundColor: pilot.surface, borderBottomWidth: 1, borderBottomColor: pilot.line },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { color: pilot.navy, fontSize: fontSizes.base, fontFamily: fontFamilies.bodyMedium },
  content: { paddingHorizontal: layout.screenX, paddingTop: spacing.lg, gap: 12 },

  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes['2xl'], color: pilot.ink },
  lead: { color: pilot.muted, fontSize: fontSizes.base, lineHeight: 21, marginTop: 5 },
  basis: { fontFamily: fontFamilies.mono, fontSize: fontSizes.xs, color: pilot.muted, marginTop: 9, lineHeight: 17 },

  card: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: radii.lg, padding: layout.cardPad },
  h2: { fontFamily: fontFamilies.display, fontSize: fontSizes.lg, color: pilot.ink },
  sub: { color: pilot.muted, fontSize: fontSizes.sm, marginTop: 4, lineHeight: 20 },
  note: { color: pilot.muted, fontSize: fontSizes.xs, marginTop: 13, lineHeight: 18, borderTopWidth: 1, borderTopColor: pilot.line, paddingTop: 11 },
  flag: { marginTop: 13, fontSize: fontSizes.sm, color: pilot.muted, backgroundColor: '#F2F5F9', borderWidth: 1,
    borderColor: pilot.line, borderLeftWidth: 3, borderLeftColor: pilot.navy, borderRadius: 8, padding: 11, lineHeight: 20 },
  dim: { color: pilot.muted, fontSize: fontSizes.base },

  lim: { marginTop: spacing.md },
  limRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  limK: { fontSize: fontSizes.sm, color: pilot.muted, flexShrink: 1 },
  limV: { fontFamily: fontFamilies.mono, fontSize: fontSizes.sm, color: pilot.ink },
  track: { height: 7, backgroundColor: '#EDF1F6', borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: pilot.navy, borderRadius: 4 },
  fillSoft: { backgroundColor: '#8FB3E0' },
  fillOver: { backgroundColor: '#B42318' },
  limLeft: { fontFamily: fontFamilies.mono, fontSize: fontSizes.xs, color: pilot.muted, marginTop: 5 },

  kcap: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: pilot.muted,
    fontFamily: fontFamilies.bodySemiBold, marginTop: spacing.md, marginBottom: 6 },
  big: { fontFamily: fontFamilies.display, fontSize: 32, color: pilot.ink },
  bu: { fontSize: fontSizes.base, color: pilot.muted, fontFamily: fontFamilies.body },

  strip: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: pilot.surface, borderWidth: 1,
    borderColor: pilot.line, borderRadius: 10, overflow: 'hidden', marginTop: spacing.md },
  cell: { flexGrow: 1, flexBasis: 92, minWidth: 0, padding: 11,
    borderLeftWidth: 1, borderTopWidth: 1, borderColor: pilot.line, marginLeft: -1, marginTop: -1 },
  sv: { fontFamily: fontFamilies.mono, fontSize: fontSizes.md, color: pilot.ink },
  svSm: { fontFamily: fontFamilies.mono, fontSize: fontSizes.sm, color: pilot.ink },
  svMissing: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body },
  sk: { fontSize: 11, color: pilot.muted, marginTop: 3 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: pilot.line },
  rowN: { flex: 1, minWidth: 0, color: pilot.muted, fontSize: fontSizes.sm },
  rowH: { fontFamily: fontFamilies.mono, fontSize: fontSizes.xs, color: pilot.ink },
  ok: { color: '#15803D', fontSize: fontSizes.xs },
  no: { color: pilot.muted, fontSize: fontSizes.xs },
  gap: { fontFamily: fontFamilies.mono, fontSize: fontSizes.xs, color: pilot.navy },
  bar: { width: 62, height: 5, backgroundColor: '#EDF1F6', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: pilot.navy },
});
