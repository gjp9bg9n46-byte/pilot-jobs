// Logbook hours dashboard (mobile app) — the phone (<768) layout from
// docs/design/logbook-totals-mockup.html, rebuilt with RN primitives + the app's
// theme tokens. Renders entirely from the /logbook/summary payload; no
// placeholder numbers. Total + Milestone are always visible; a "Types, limits &
// night/IFR" toggle reveals the categories line, Hours-by-type and Limits.
// Currency renders below the card (always visible), owned by the screen.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fontFamilies, pilot as pilotTokens, semantic } from '../../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../theme/ThemeContext';
import { duration, TimeFormat } from '../../lib/logbookFormat';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Summary = Record<string, any>;

const SIC = '#7FA3CF';
const OTHER = '#C7D3E2';   // neither PIC nor SIC: dual, simulator, imported without a role
const FAINT = '#8592A3';
const TRACK_BG = '#E3E8EF';

// Manual number formatting — Hermes Intl grouping is unreliable across SDKs.
function group(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
// Superseded by the format-aware formatter inside the component.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function fmtHDecimal(n: number | null | undefined): string {
  if (n == null) return '—';
  const v = Number(n);
  const neg = v < 0 ? '-' : '';
  const a = Math.abs(v);
  const whole = Math.floor(a);
  const dec = Math.round((a - whole) * 10);
  const w = dec === 10 ? whole + 1 : whole;
  const d = dec === 10 ? 0 : dec;
  return `${neg}${group(String(w))}.${d}`;
}
function fmtInt(n: number | null | undefined): string {
  return group(String(Math.round(Number(n || 0))));
}
function monthYear(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
function dayMon(iso?: string): string {
  const d = new Date((iso || '') + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function LogbookDashboard({ summary, onEditCarryForward, timeFormat = 'hhmm' }: {
  summary: Summary | null; onEditCarryForward?: () => void; timeFormat?: TimeFormat;
}) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  // Hours are written the way the pilot chose on the page above; every figure
  // in this card goes through one formatter so the toggle cannot miss any.
  const fmtH = (n: number | null | undefined) => (n == null ? '—' : duration(Number(n), timeFormat));
  const hUnit = timeFormat === 'decimal' ? ' h' : '';
  if (!summary) return null;
  const { totals, byType, limits, currency } = summary;
  // A payload without a milestone (an older backend, or a pilot with no hours
  // yet) must not take the screen down — the card is skipped instead.
  const milestone = summary.milestone || null;

  const cf = totals.carryForward || 0;
  const split = totals.picSicSplitValid;
  // The bar shows all three parts against the TOTAL, so it adds up to what the
  // card says above it.
  const barBase = Math.max(totals.total, totals.pic + totals.sic) || 1;
  const picPct = split ? (totals.pic / barBase) * 100 : 0;
  const sicPct = split ? (totals.sic / barBase) * 100 : 0;
  const otherPct = split ? Math.max(0, 100 - picPct - sicPct) : 0;

  const cats: [string, number][] = ([
    ['Multi-engine', totals.multiEngine], ['Turbine', totals.turbine],
    ['Night', totals.night], ['IFR', totals.ifr], ['Landings', totals.landings],
  ] as [string, number][]).filter(([, v]) => v > 0);

  // Rounded to the minute before comparing: a float total minus two float
  // parts leaves a few seconds of noise that would show as "Other 0:00".
  const other = Math.max(0, Math.round((totals.total - totals.pic - totals.sic) * 60) / 60);
  const next = milestone ? milestone.next : null;
  const scale = next || (milestone ? milestone.current : 0) || 1;
  const pos = (h: number) => Math.min(99.5, Math.max(0, (h / scale) * 100));
  const youPct = Math.min(100, Math.max(0, ((milestone ? milestone.current : 0) / scale) * 100));
  const ticks = [
    ...((milestone && milestone.passed) || []).map((p: Summary) => ({ hours: p.hours, top: group(String(p.hours)), bot: p.label, done: true, isNext: false })),
    ...(next ? [{ hours: next, top: group(String(next)), bot: 'Next', done: false, isNext: true }] : []),
  ];
  const lastPassedWithDate = [...((milestone && milestone.passed) || [])].reverse().find((p: Summary) => p.date);
  const topType = byType[0]?.hours || 1;

  return (
    <View>
      <View style={styles.card}>
        {/* 1 · TOTAL TIME */}
        <View style={styles.section}>
          <Text style={styles.label}>Total time</Text>
          <View style={styles.bigRow}>
            <Text style={styles.bigNum}>{fmtH(totals.total)}</Text>
            <Text style={styles.bigUnit}>{timeFormat === 'decimal' ? 'hours' : 'hh:mm'}</Text>
          </View>
          <Text style={styles.fine}>
            {cf > 0 ? `Includes ${fmtH(cf)} h carried forward · ` : 'Add previous / carry-forward hours · '}
            <Text style={styles.link} onPress={() => onEditCarryForward?.()}>Edit</Text>
          </Text>

          {split ? (
            <>
              <View style={styles.split}>
                <View style={{ width: `${picPct}%`, backgroundColor: pilot.navy }} />
                <View style={{ width: `${sicPct}%`, backgroundColor: SIC }} />
                {otherPct > 0 ? <View style={{ width: `${otherPct}%`, backgroundColor: OTHER }} /> : null}
              </View>
              <View style={styles.legend}>
                <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: pilot.navy }]} /><Text style={styles.legendText}>PIC <Text style={styles.legendVal}>{fmtH(totals.pic)}</Text></Text></View>
                <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: SIC }]} /><Text style={styles.legendText}>SIC <Text style={styles.legendVal}>{fmtH(totals.sic)}</Text></Text></View>
                {/* Whatever is left over. PIC + SIC did not add up to the total
                    and the difference was simply missing from the page, which
                    makes a logbook look wrong even when it is right. */}
                {other > 0 ? (
                  <View style={styles.legendItem}>
                    <View style={[styles.dot, { backgroundColor: OTHER }]} />
                    <Text style={styles.legendText}>Other <Text style={styles.legendVal}>{fmtH(other)}</Text></Text>
                  </View>
                ) : null}
              </View>
              {other > 0 ? (
                <Text style={styles.otherNote}>
                  Other is flying with no PIC or SIC against it — dual, simulator, or flights that came in without a role.
                </Text>
              ) : null}
            </>
          ) : null}

          {open && cats.length > 0 ? (
            <View style={styles.conds}>
              {cats.map(([lab, val]) => (
                <Text key={lab} style={styles.condItem}>{lab} <Text style={styles.condVal}>{lab === 'Landings' ? fmtInt(val) : fmtH(val)}</Text></Text>
              ))}
            </View>
          ) : null}
        </View>

        {/* 2 · NEXT MILESTONE */}
        {milestone ? (
        <View style={[styles.section, styles.sectionDivider]}>
          <Text style={styles.label}>Next milestone</Text>
          {next ? (
            <Text style={styles.msTitle}><Text style={styles.msNum}>{fmtH(milestone.remaining)}{hUnit}</Text> to {group(String(next))} hours</Text>
          ) : (
            <Text style={styles.msTitle}>Top of the ladder reached</Text>
          )}
          {lastPassedWithDate ? (
            <Text style={styles.fine}>You passed the {lastPassedWithDate.label} mark in {monthYear(lastPassedWithDate.date)}.</Text>
          ) : null}

          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${youPct}%` }]} />
            {ticks.map((t) => (
              <View key={t.hours} style={[styles.tick, t.done && styles.tickDone, { left: `${pos(t.hours)}%` }]} />
            ))}
            <View style={[styles.you, { left: `${youPct}%` }]}><Text style={styles.youText}>You · {fmtH(milestone.current)}</Text></View>
          </View>
          <View style={styles.trackLabels}>
            {ticks.map((t) => (
              <View key={t.hours} style={[styles.tickLabelWrap, { left: `${pos(t.hours)}%` }, t.isNext && styles.tickLabelWrapEnd]}>
                <Text style={[styles.tickLabel, t.done && styles.tickLabelDone]}>{t.top}</Text>
                <Text style={[styles.tickLabel, t.done && styles.tickLabelDone]}>{t.bot}</Text>
              </View>
            ))}
          </View>

          {milestone.jobsUnlocked > 0 && next ? (
            <View style={styles.jobs}>
              <Text style={styles.jobsText}><Text style={styles.jobsBig}>+{milestone.jobsUnlocked}</Text>  more jobs on CockpitHire ask for {group(String(next))} h</Text>
            </View>
          ) : null}
        </View>
        ) : null}

        {/* 3 · HOURS BY TYPE (revealed) */}
        {open ? (
          <View style={[styles.section, styles.sectionDivider]}>
            <Text style={styles.label}>Hours by aircraft type</Text>
            {byType.length === 0 ? <Text style={[styles.fine, { marginTop: 8 }]}>No typed flights yet</Text> : null}
            {byType.map((t: Summary) => {
              const regLine = t.regs && t.regs.length
                ? `${t.regs.slice(0, 2).join(', ')}${t.regs.length > 2 ? ` +${t.regs.length - 2}` : ''}`
                : (t.note || '');
              return (
                <View key={t.type} style={styles.typeRow}>
                  <View style={styles.typeName}>
                    <Text style={styles.typeT}>{t.type}</Text>
                    {regLine ? <Text style={styles.typeSub}>{regLine}</Text> : null}
                  </View>
                  <View style={styles.typeBar}><View style={[styles.typeBarFill, { width: `${Math.max(2, (t.hours / topType) * 100)}%` }]} /></View>
                  <Text style={styles.typeH}>{fmtH(t.hours)}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* 4 · LIMITS (revealed) */}
        {open && limits ? (
          <View style={[styles.section, styles.sectionDivider]}>
            <Text style={styles.label}>Flight time limits (EASA ORO.FTL)</Text>
            <Gauge fmtH={fmtH} hUnit={hUnit} value={limits.last28Days.hours} limit={limits.last28Days.limit} cap="Last 28 days" styles={styles} />
            <Gauge fmtH={fmtH} hUnit={hUnit} value={limits.calendarYear.hours} limit={limits.calendarYear.limit} cap={`Calendar year ${new Date().getFullYear()}`} styles={styles} />
            <Gauge fmtH={fmtH} hUnit={hUnit} value={limits.last12Months.hours} limit={limits.last12Months.limit}
              cap={`Last 12 months · ${fmtH(Math.max(0, limits.last12Months.limit - limits.last12Months.hours))}${hUnit} left`} styles={styles} />
          </View>
        ) : null}

        {/* Expand toggle */}
        <Pressable style={styles.expand} onPress={() => setOpen((v) => !v)} accessibilityRole="button">
          <Text style={styles.expandText}>Types, limits &amp; night/IFR</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={pilot.navy} />
        </Pressable>
      </View>

      {/* 5 · CURRENCY (always visible) */}
      <View style={[styles.card, styles.currencyCard]}>
        <Text style={styles.label}>Currency · last 90 days</Text>
        {!currency.landingsLogged ? (
          <View style={styles.curLine}>
            <View style={[styles.curIc, { backgroundColor: TRACK_BG }]}><Text style={{ color: FAINT, fontSize: 11 }}>·</Text></View>
            <Text style={[styles.curText, { color: pilot.muted }]}>Add landings to your flights to track currency</Text>
          </View>
        ) : (
          <>
            {/* The landings line used to live here too, word for word the
                same as the strip at the top of the page. One of them had to
                go, and the strip is the one a pilot sees first. */}
            <CurrencyLine role="Night" data={currency.night} styles={styles} currency={currency}
              applies={currency.rule ? currency.rule.nightApplies : false} />
            {/* The authority note belongs to the strip at the top, behind
                its ⓘ — printing it twice is what made this card long.
                `rule.note` was printed here too: our own working note about a
                rule we have not verified. The server no longer sends it. */}
          </>
        )}
      </View>
    </View>
  );
}

function Gauge({ value, limit, cap, styles, fmtH, hUnit }: { value: number; limit: number; cap: string; styles: Summary; fmtH: (n: number | null | undefined) => string; hUnit: string }) {
  const pct = Math.min(100, (value / limit) * 100);
  const warn = pct >= 85;
  return (
    <View style={styles.gauge}>
      <Text style={styles.gaugeV}><Text style={styles.gaugeNum}>{fmtH(value)}</Text> / {group(String(limit))}{hUnit || ' h'}</Text>
      <View style={styles.gaugeBar}><View style={[styles.gaugeBarFill, { width: `${pct}%`, backgroundColor: warn ? pilotTokens.amber : semantic.success }]} /></View>
      <Text style={styles.gaugeCap}>{cap}</Text>
    </View>
  );
}

// `applies` is what separates a requirement from a fact. When it is false the
// line states the count and nothing else: no "needed", no amber.
function CurrencyLine({ role, data, styles, currency, applies = true }: { role: string; data: Summary; styles: Summary; currency: Summary; applies?: boolean }) {
  if (!applies) {
    const n = data.landings || 0;
    return (
      <View style={styles.curLine}>
        <View style={styles.curIc}><Text style={{ fontSize: 11 }}>·</Text></View>
        <Text style={styles.curText}>{role}: <Text style={styles.curB}>{n} landing{n === 1 ? '' : 's'}</Text><Text style={styles.curM}> · for information</Text></Text>
      </View>
    );
  }
  if (data.currentUntil) {
    return (
      <View style={styles.curLine}>
        <View style={[styles.curIc, { backgroundColor: semantic.successBg }]}><Text style={{ color: semantic.success, fontSize: 11, fontWeight: '700' }}>✓</Text></View>
        <Text style={styles.curText}>{role}: current until <Text style={styles.curB}>{dayMon(data.currentUntil)}</Text> <Text style={styles.curM}>· {data.landings} landings</Text></Text>
      </View>
    );
  }
  // Landings missing from the window means the count is a floor, not a verdict.
  if (currency?.incomplete) {
    return (
      <View style={styles.curLine}>
        <View style={styles.curIc}><Text style={{ fontSize: 11, fontWeight: '700' }}>–</Text></View>
        <Text style={styles.curText}>
          {role}: <Text style={styles.curB}>not known</Text>
          <Text style={styles.curM}> · landings missing from {currency.flightsWithoutLandings} of {currency.flightsInWindow} flights</Text>
        </Text>
      </View>
    );
  }
  const need = Math.max(0, data.required - data.landings);
  return (
    <View style={styles.curLine}>
      <View style={[styles.curIc, { backgroundColor: semantic.warningBg }]}><Text style={{ color: semantic.warning, fontSize: 11, fontWeight: '700' }}>!</Text></View>
      <Text style={styles.curText}>{role}: <Text style={styles.curB}>{need} more landing{need === 1 ? '' : 's'}</Text> needed <Text style={styles.curM}>· {data.landings} of {data.required} logged</Text></Text>
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  card: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 16, marginBottom: 12 },
  section: { padding: 16 },
  sectionDivider: { borderTopWidth: 1, borderTopColor: pilot.line, borderStyle: 'dashed' },
  label: { fontSize: 11, fontFamily: fontFamilies.bodyBold, letterSpacing: 0.6, textTransform: 'uppercase', color: pilot.muted },

  bigRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, marginBottom: 4 },
  bigNum: { fontFamily: fontFamilies.display, fontSize: 44, lineHeight: 46, color: pilot.ink, letterSpacing: -1 },
  bigUnit: { fontSize: 14, color: pilot.muted, marginLeft: 8, marginBottom: 6 },
  fine: { fontSize: 12.5, color: pilot.muted, lineHeight: 18, marginTop: 2 },
  link: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },

  split: { height: 10, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', marginTop: 14, marginBottom: 8, backgroundColor: '#EEE' },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 2, marginRight: 6 },
  legendText: { fontSize: 12.5, color: pilot.muted },
  otherNote: { marginTop: 6, fontSize: 11.5, lineHeight: 16, color: pilot.faint, fontFamily: fontFamilies.body },
  legendVal: { fontFamily: fontFamilies.mono, color: pilot.ink },

  conds: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: pilot.line, borderStyle: 'dashed', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  condItem: { fontSize: 12.5, color: pilot.muted, marginRight: 16 },
  condVal: { fontFamily: fontFamilies.mono, color: pilot.ink },

  msTitle: { fontSize: 15, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink, marginTop: 10, marginBottom: 2 },
  msNum: { color: pilot.navy, fontFamily: fontFamilies.mono },

  track: { position: 'relative', height: 8, borderRadius: 5, backgroundColor: TRACK_BG, marginTop: 34, marginBottom: 8, marginRight: 8 },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5, backgroundColor: pilot.navy },
  tick: { position: 'absolute', top: -4, width: 2, height: 16, backgroundColor: '#CFCAC0' },
  tickDone: { backgroundColor: pilot.navy },
  you: { position: 'absolute', top: -30, marginLeft: -34, backgroundColor: pilot.ink, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  youText: { color: '#fff', fontSize: 10.5, fontFamily: fontFamilies.bodyBold },
  trackLabels: { position: 'relative', height: 30 },
  tickLabelWrap: { position: 'absolute', top: 0, width: 60, marginLeft: -30, alignItems: 'center' },
  tickLabelWrapEnd: { alignItems: 'flex-end', marginLeft: -56, width: 56 },
  tickLabel: { fontSize: 10.5, color: FAINT, textAlign: 'center', lineHeight: 13 },
  tickLabelDone: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },

  jobs: { marginTop: 8, backgroundColor: semantic.successBg, borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11 },
  jobsText: { fontSize: 12.5, color: semantic.success, lineHeight: 18 },
  jobsBig: { fontSize: 16, fontFamily: fontFamilies.mono, color: semantic.success },

  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  typeName: { width: 92 },
  typeT: { fontFamily: fontFamilies.bodySemiBold, fontSize: 13.5, color: pilot.ink },
  typeSub: { fontSize: 11, color: FAINT },
  typeBar: { flex: 1, height: 6, backgroundColor: TRACK_BG, borderRadius: 4, overflow: 'hidden' },
  typeBarFill: { height: '100%', backgroundColor: pilot.navy, borderRadius: 4 },
  typeH: { width: 64, textAlign: 'right', fontFamily: fontFamilies.mono, fontSize: 13, color: pilot.ink },

  gauge: { marginTop: 14 },
  gaugeV: { fontSize: 13, color: pilot.muted, marginBottom: 8 },
  gaugeNum: { fontFamily: fontFamilies.mono, fontSize: 20, color: pilot.ink },
  gaugeBar: { height: 6, borderRadius: 4, backgroundColor: TRACK_BG, overflow: 'hidden' },
  gaugeBarFill: { height: '100%', borderRadius: 4 },
  gaugeCap: { fontSize: 11.5, color: FAINT, marginTop: 6 },

  expand: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, minHeight: 46, borderTopWidth: 1, borderTopColor: pilot.line },
  expandText: { fontFamily: fontFamilies.bodySemiBold, fontSize: 13, color: pilot.navy },

  currencyCard: { padding: 16 },
  curLine: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'flex-start' },
  curIc: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  curText: { flex: 1, fontSize: 13.5, color: pilot.ink, lineHeight: 19 },
  curB: { fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  curM: { color: pilot.muted },
});
