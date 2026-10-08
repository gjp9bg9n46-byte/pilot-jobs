// Shared job-card content — the SINGLE source of truth for how a job listing
// looks in the app (owner directive: Browse and Matches must be identical).
// Ports the web Jobs-page upgrade (PilotsGlobal benchmark): 2-line title
// clamp, visa/NTR badges, country flag, compact spec strip, aircraft chips.
// Screens wrap this in their own Pressable container and pass their extras
// (match badge, save button, breakdown pills) via `right` / `footer`.
import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AirlineLogo from './AirlineLogo';
import { displayTitle, locationName } from '../lib/displayNames';
import { num } from '../lib/format';
import { checklist, jobChips, matchPill, sourceInfo } from '../lib/jobMatch';
import { fontFamilies, fontSizes } from '../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// (The country-flag map lived here for C#1; flags were dropped from the card —
// location is keyed on the posting, not the airline's HQ — so it is gone.)

export default function JobCardContent({ job, air, ago, right, footer, ongoing }: {
  job: Any;
  air?: Any | null;
  ago?: string | null;
  right?: ReactNode;   // screen-specific right column (save button, match badge)
  footer?: ReactNode;  // screen-specific bottom row (breakdown pills, etc.)
  ongoing?: string | null;  // evergreen reframe: shown instead of a stale posting date
}) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const locText = locationName(job?.location || job?.country); // deduped, no HQ flag (C#1)

  // Mirror of web's JobCard: title · meta line (company · location · time) ·
  // chips · requirement checklist · source/salary footer. Web is the reference
  // design (handoff rule B) — the helpers are shared twins in src/lib/jobMatch.
  const chips = jobChips(job);
  const checks = checklist(job?.match, 4);
  const src = sourceInfo(job);
  const checked = job?.lastSeenAt ? new Date(job.lastSeenAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
  const timeLine = job?.evergreen
    ? `Ongoing${checked ? ` · link checked ${checked}` : ''}`
    : (ongoing || ago || '');
  const metaLine = [locText, timeLine].filter(Boolean).join('  ·  ');
  const sal = salaryText(job);
  const pill = matchPill(job?.match);

  return (
    <>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.jcTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.jcTitle} numberOfLines={2}>{displayTitle(job?.titleEn || job?.title) || '—'}</Text>
            <Text style={styles.jcMeta} numberOfLines={2}>
              <Text style={styles.jcCompany}>{job?.company ?? '—'}</Text>{metaLine ? `  ·  ${metaLine}` : ''}
            </Text>
          </View>
          <AirlineLogo hideIfMissing logoUrl={air?.logoUrl} iataCode={air?.iataCode} name={job?.company} box={42} />
        </View>

        {chips.length > 0 ? (
          <View style={styles.jcChipRow}>
            {chips.map((c, i) => (
              <Text key={`${c.text}-${i}`} style={[styles.jcChip, c.visa && styles.jcChipVisa]}>{c.text}</Text>
            ))}
          </View>
        ) : null}

        {pill ? (
          <View style={[styles.mpill, pill.tone === 'green' ? styles.mpillGreen : pill.tone === 'amber' ? styles.mpillAmber : styles.mpillGrey]}>
            <Text style={[styles.mpillText, { color: pill.color }]}>{pill.text}</Text>
          </View>
        ) : null}

        {checks.length > 0 ? (
          <View style={styles.jcCheckRow}>
            {checks.map((c, i) => (
              <View key={`${c.text}-${i}`} style={styles.jcCheckItem}>
                <Ionicons
                  name={c.status === 'met' ? 'checkmark' : c.status === 'unmet' ? 'close' : 'help-circle-outline'}
                  size={13}
                  color={c.status === 'met' ? SEM_OK : c.status === 'unmet' ? SEM_NO : pilot.muted}
                />
                <Text style={[styles.jcCheckText, { color: c.status === 'met' ? SEM_OK : c.status === 'unmet' ? SEM_NO : pilot.muted }]} numberOfLines={1}>{c.text}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {(src.direct || sal) ? (
          <View style={styles.jcSrcRow}>
            {src.direct ? (
              <Text style={styles.jcDirect}>
                <Ionicons name="checkmark" size={12} color={SEM_OK} /> Apply direct
              </Text>
            ) : <View />}
            {sal ? <Text style={styles.jcSal}>{sal}</Text> : null}
          </View>
        ) : null}

        {footer}
      </View>
      {right}
    </>
  );
}

// Light-AA semantic shades, same values web uses for met/unmet on a card.
const SEM_OK = '#166534';
const SEM_NO = '#991B1B';

// "USD 90,000–120,000 / yr" — mirrors web's formatSalary(job, true).
function salaryText(job: Any): string | null {
  const cur = job?.salaryCurrency || 'USD';
  const per = job?.salaryPeriod === 'MONTHLY' ? '/mo' : job?.salaryPeriod === 'HOURLY' ? '/hr' : '/yr';
  if (job?.salaryMin && job?.salaryMax) return `${cur} ${num(job.salaryMin)}–${num(job.salaryMax)} ${per}`;
  if (job?.salaryMin) return `${cur} ${num(job.salaryMin)}+ ${per}`;
  if (job?.salaryMax) return `${cur} up to ${num(job.salaryMax)} ${per}`;
  return null;
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  jcTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  jcTitle: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: pilot.ink, lineHeight: 21 },
  jcMeta: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 3, lineHeight: 18 },
  jcCompany: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },
  mpill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 8 },
  mpillGreen: { backgroundColor: '#DCFCE7' },
  mpillAmber: { backgroundColor: '#FEF3C7' },
  mpillGrey: { backgroundColor: pilot.cream },
  mpillText: { fontSize: 12, fontFamily: fontFamilies.bodyBold },
  jcChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  jcChip: {
    fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.bodySemiBold,
    backgroundColor: pilot.cream, borderWidth: 1, borderColor: pilot.line,
    borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden',
  },
  jcChipVisa: { color: '#166534', backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  jcCheckRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginTop: 8 },
  jcCheckItem: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '100%' },
  jcCheckText: { fontSize: fontSizes.xs, fontFamily: fontFamilies.body, flexShrink: 1 },
  jcSrcRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopColor: pilot.line },
  jcDirect: { fontSize: fontSizes.xs, color: '#166534', fontFamily: fontFamilies.bodySemiBold },
  jcSal: { fontSize: fontSizes.xs, color: pilot.ink, fontFamily: fontFamilies.bodySemiBold },
});
