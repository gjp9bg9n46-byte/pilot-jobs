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
import { fontFamilies, fontSizes } from '../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// Country → flag emoji (mirror of the web map). Unknown → no flag, never a wrong one.
const COUNTRY_ISO: Record<string, string> = {
  'united states': 'US', usa: 'US', 'united kingdom': 'GB', uk: 'GB', france: 'FR',
  germany: 'DE', italy: 'IT', spain: 'ES', netherlands: 'NL', poland: 'PL',
  austria: 'AT', switzerland: 'CH', schweiz: 'CH', canada: 'CA', australia: 'AU',
  'new zealand': 'NZ', 'south africa': 'ZA', uae: 'AE', 'united arab emirates': 'AE',
  qatar: 'QA', 'saudi arabia': 'SA', kuwait: 'KW', oman: 'OM', bahrain: 'BH',
  egypt: 'EG', morocco: 'MA', tunisia: 'TN', algeria: 'DZ', libya: 'LY',
  ireland: 'IE', belgium: 'BE', portugal: 'PT', greece: 'GR', turkey: 'TR',
  norway: 'NO', sweden: 'SE', denmark: 'DK', finland: 'FI', iceland: 'IS',
  singapore: 'SG', 'hong kong': 'HK', malaysia: 'MY', india: 'IN', japan: 'JP',
  china: 'CN', mexico: 'MX', brazil: 'BR', iraq: 'IQ', yemen: 'YE', jordan: 'JO',
  lebanon: 'LB', israel: 'IL', hungary: 'HU', 'czech republic': 'CZ', latvia: 'LV',
  lithuania: 'LT', estonia: 'EE', bulgaria: 'BG', romania: 'RO', croatia: 'HR',
  luxembourg: 'LU', malta: 'MT', mauritania: 'MR',
};
export function countryFlag(country?: string | null): string | null {
  const iso = COUNTRY_ISO[String(country || '').trim().toLowerCase()];
  if (!iso) return null;
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export default function JobCardContent({ job, air, ago, right, footer }: {
  job: Any;
  air?: Any | null;
  ago?: string | null;
  right?: ReactNode;   // screen-specific right column (save button, match badge)
  footer?: ReactNode;  // screen-specific bottom row (breakdown pills, etc.)
}) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const flag = countryFlag(job?.country);

  const specRows: [string, string][] = [];
  if (job?.reqMinTotalHours) specRows.push(['Total time', `${Number(job.reqMinTotalHours).toLocaleString()} hrs`]);
  if (job?.reqMinPicHours) specRows.push(['PIC time', `${Number(job.reqMinPicHours).toLocaleString()} hrs`]);
  if (job?.reqCertificates?.length) specRows.push(['Licence', job.reqCertificates.slice(0, 2).join(' / ')]);
  if (job?.reqAuthorities?.length) specRows.push(['Authority', job.reqAuthorities.slice(0, 2).join(' / ')]);
  const showSpec = specRows.length >= 2;

  return (
    <>
      <AirlineLogo hideIfMissing logoUrl={air?.logoUrl} iataCode={air?.iataCode} name={job?.company} box={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.jcTitle} numberOfLines={2}>{job?.title ?? '—'}</Text>
        <Text style={styles.jcCompany}>{job?.company ?? '—'}{ago ? `  ·  ${ago}` : ''}</Text>

        {(job?.visaSponsorship || job?.typeRatingStatus === 'NTR') ? (
          <View style={styles.jcBadgeRow}>
            {job.visaSponsorship ? <Text style={[styles.jcBadge, styles.jcBadgeVisa]}>VISA SPONSORSHIP</Text> : null}
            {job.typeRatingStatus === 'NTR' ? <Text style={[styles.jcBadge, styles.jcBadgeNtr]}>NO TYPE RATING REQUIRED</Text> : null}
          </View>
        ) : null}

        <View style={styles.jcMetaRow}>
          {job?.location ? (
            <Text style={styles.jcMeta} numberOfLines={1}>
              <Ionicons name="location-outline" size={11} color={pilot.muted} /> {flag ? `${flag} ` : ''}{job.location}
            </Text>
          ) : null}
        </View>

        {showSpec ? (
          <View style={styles.jcSpec}>
            {specRows.map(([label, value]) => (
              <View key={label} style={styles.jcSpecItem}>
                <Text style={styles.jcSpecLabel}>{label}</Text>
                <Text style={styles.jcSpecVal} numberOfLines={1}>{value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {job?.reqAircraftTypes?.length ? (
          <View style={styles.jcChipRow}>
            {job.reqAircraftTypes.slice(0, 3).map((a: string) => (
              <Text key={a} style={styles.jcChip}>{a}</Text>
            ))}
          </View>
        ) : null}

        {footer}
      </View>
      {right}
    </>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  jcTitle: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: pilot.ink, lineHeight: 21 },
  jcCompany: { fontSize: fontSizes.sm, color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, marginTop: 3 },
  jcBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  jcBadge: { fontSize: 9.5, fontFamily: fontFamilies.bodyBold, letterSpacing: 0.4, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden', borderWidth: 1 },
  jcBadgeVisa: { color: '#166534', backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  jcBadgeNtr: { color: '#92400E', backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  jcMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  jcMeta: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body },
  jcSpec: {
    flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4,
    backgroundColor: pilot.cream, borderWidth: 1, borderColor: pilot.line,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 8,
  },
  jcSpecItem: { flexDirection: 'row', alignItems: 'baseline', gap: 6, minWidth: '44%', flexGrow: 1, justifyContent: 'space-between' },
  jcSpecLabel: { fontSize: 10, color: pilot.muted, fontFamily: fontFamilies.body },
  jcSpecVal: { fontSize: 11, color: pilot.ink, fontFamily: fontFamilies.bodyBold, flexShrink: 1, textAlign: 'right' },
  jcChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  jcChip: {
    fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.bodySemiBold,
    backgroundColor: pilot.cream, borderWidth: 1, borderColor: pilot.line,
    borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden',
  },
});
