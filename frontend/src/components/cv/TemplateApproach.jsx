import React from 'react';
import {
  Document, Page, View, Text, StyleSheet, Svg, Path, Rect, Circle,
} from '@react-pdf/renderer';

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  navy:       '#0D1E35',
  navyLight:  '#1B2B4B',
  cyan:       '#00B4D8',
  cyanDim:    '#007A96',
  white:      '#FFFFFF',
  offWhite:   '#F4F8FB',
  textDark:   '#1A2535',
  textMid:    '#3A5070',
  textLight:  '#6A88A0',
  border:     '#D8E8F0',
  green:      '#2ECC71',
  amber:      '#F39C12',
};

const s = StyleSheet.create({
  page:     { flexDirection: 'row', fontFamily: 'Helvetica', fontSize: 9, color: C.textDark },
  // ── Sidebar ──
  sidebar:  { width: 180, backgroundColor: C.navy, padding: '32 18 24 18', flexDirection: 'column' },
  // Decorative altitude-tape bars at top of sidebar
  tapeRow:  { flexDirection: 'row', gap: 3, marginBottom: 20 },
  tape:     { height: 4, flex: 1, borderRadius: 2 },
  // Avatar circle
  avatar:   { width: 60, height: 60, borderRadius: 30, backgroundColor: C.navyLight, border: `2 solid ${C.cyan}`, alignItems: 'center', justifyContent: 'center', marginBottom: 8, alignSelf: 'center' },
  avatarTxt:{ fontFamily: 'Helvetica-Bold', fontSize: 20, color: C.cyan },
  sName:    { fontFamily: 'Helvetica-Bold', fontSize: 13, color: C.white, textAlign: 'center', marginBottom: 2, lineHeight: 1.3 },
  sRole:    { fontSize: 8, color: C.cyan, textAlign: 'center', marginBottom: 16, letterSpacing: 0.5 },
  sDivider: { height: 1, backgroundColor: C.navyLight, marginBottom: 12, marginTop: 4 },
  sSection: { marginBottom: 12 },
  sSectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.cyanDim, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 },
  sRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  sLabel:   { fontSize: 7.5, color: C.textLight, width: 58 },
  sValue:   { fontSize: 7.5, color: C.white, flex: 1 },
  sBadge:   { backgroundColor: C.navyLight, border: `1 solid ${C.cyanDim}`, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, marginBottom: 3 },
  sBadgeTxt:{ fontSize: 7.5, color: C.white },
  sBadgeSub:{ fontSize: 6.5, color: C.textLight },
  // ── Main ──
  main:     { flex: 1, backgroundColor: C.white, padding: '32 28 24 28', flexDirection: 'column' },
  mSection: { marginBottom: 16 },
  mTitle:   { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.navy, letterSpacing: 0.3, marginBottom: 6, paddingBottom: 4, borderBottom: `1.5 solid ${C.cyan}` },
  mRow:     { flexDirection: 'row', marginBottom: 3 },
  mLabel:   { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.textMid, width: 100 },
  mValue:   { fontSize: 8, color: C.textDark, flex: 1 },
  // Totals grid
  totalsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  totalBox:      { backgroundColor: C.offWhite, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 8, alignItems: 'center', minWidth: 60 },
  totalBoxVal:   { fontFamily: 'Helvetica-Bold', fontSize: 11, color: C.navy },
  totalBoxLabel: { fontSize: 6.5, color: C.textLight, marginTop: 1, letterSpacing: 0.4 },
  // Ratings list
  ratingRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.offWhite, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 4 },
  ratingType: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.navy, flex: 1 },
  ratingHrs:  { fontSize: 7.5, color: C.textLight },
  ratingExp:  { fontSize: 7, color: C.amber, marginLeft: 6 },
  // Bullet list
  bullet:     { flexDirection: 'row', marginBottom: 3 },
  bulletDot:  { fontSize: 8, color: C.cyan, marginRight: 5, marginTop: 0.5 },
  bulletText: { fontSize: 8, color: C.textDark, flex: 1 },
  // Skill pills
  pillRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  pill:       { backgroundColor: C.offWhite, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, border: `1 solid ${C.border}` },
  pillTxt:    { fontSize: 7.5, color: C.textMid },
  // Education
  eduEntry:   { marginBottom: 6 },
  eduDegree:  { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.textDark },
  eduSub:     { fontSize: 7.5, color: C.textLight },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => n ? Math.round(n).toLocaleString() : '0';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';
const initials = (p) => `${p?.firstName?.[0] ?? ''}${p?.lastName?.[0] ?? ''}`.toUpperCase();
const fullName = (p) => `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim();

function topCert(certs) {
  const order = ['ATPL', 'MPL', 'CPL', 'PPL'];
  for (const t of order) {
    const c = certs.find(x => x.type === t);
    if (c) return c;
  }
  return null;
}

// ─── Sidebar section wrapper ──────────────────────────────────────────────────
function SSection({ title, children }) {
  return (
    <View style={s.sSection}>
      <Text style={s.sSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ─── Main section wrapper ─────────────────────────────────────────────────────
function MSection({ title, children }) {
  return (
    <View style={s.mSection}>
      <Text style={s.mTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ─── Document ─────────────────────────────────────────────────────────────────
export default function TemplateApproach({ data }) {
  const { pilot, certificates = [], ratings = [], medicals = [], training = [],
          totals = {}, aircraftTypes = [], cv = {} } = data;
  const { education = [], languages = [], skills = [], other = [] } = cv;

  const cert = topCert(certificates);
  const medical = medicals[0];
  const elpCert = certificates.find(c => c.type === 'ELP');

  // Merge ELP cert into languages display
  const allLanguages = [...languages];
  if (elpCert && !allLanguages.some(l => l.language?.toLowerCase() === 'english')) {
    allLanguages.unshift({ language: 'English', level: `ICAO Level ${elpCert.englishLevel || '6'}` });
  }

  const totalRows = [
    { label: 'TOTAL', value: fmt(totals.totalTime) + 'h' },
    { label: 'PIC', value: fmt(totals.picTime) + 'h' },
    { label: 'SIC', value: fmt(totals.sicTime) + 'h' },
    { label: 'NIGHT', value: fmt(totals.nightTime) + 'h' },
    { label: 'IFR', value: fmt(totals.instrumentTime) + 'h' },
    { label: 'MULTI', value: fmt(totals.multiEngineTime) + 'h' },
    { label: 'TURB', value: fmt(totals.turbineTime) + 'h' },
  ].filter(r => r.value !== '0h');

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── SIDEBAR ── */}
        <View style={s.sidebar}>
          {/* Altitude-tape decoration */}
          <View style={s.tapeRow}>
            <View style={[s.tape, { backgroundColor: C.cyan }]} />
            <View style={[s.tape, { backgroundColor: C.cyanDim }]} />
            <View style={[s.tape, { backgroundColor: C.navyLight }]} />
            <View style={[s.tape, { backgroundColor: '#0A3050' }]} />
          </View>

          {/* Avatar */}
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{initials(pilot)}</Text>
          </View>
          <Text style={s.sName}>{fullName(pilot)}</Text>
          <Text style={s.sRole}>
            {cert ? `${cert.type}(A) — ${cert.issuingAuthority || ''}` : 'Commercial Pilot'}
          </Text>

          <View style={s.sDivider} />

          {/* Contact */}
          <SSection title="Contact">
            {pilot?.email    && <View style={s.sRow}><Text style={s.sLabel}>Email</Text><Text style={s.sValue}>{pilot.email}</Text></View>}
            {pilot?.phone    && <View style={s.sRow}><Text style={s.sLabel}>Phone</Text><Text style={s.sValue}>{pilot.phone}</Text></View>}
            {pilot?.city     && <View style={s.sRow}><Text style={s.sLabel}>Based</Text><Text style={s.sValue}>{[pilot.city, pilot.country].filter(Boolean).join(', ')}</Text></View>}
            {pilot?.nationality && <View style={s.sRow}><Text style={s.sLabel}>Nationality</Text><Text style={s.sValue}>{pilot.nationality}</Text></View>}
            {pilot?.dateOfBirth && <View style={s.sRow}><Text style={s.sLabel}>DOB</Text><Text style={s.sValue}>{fmtDate(pilot.dateOfBirth)}</Text></View>}
          </SSection>

          <View style={s.sDivider} />

          {/* Licences */}
          {certificates.filter(c => c.type !== 'ELP').length > 0 && (
            <SSection title="Licences">
              {certificates.filter(c => c.type !== 'ELP').map((c, i) => (
                <View key={i} style={[s.sBadge, { marginBottom: 4 }]}>
                  <Text style={s.sBadgeTxt}>{c.type} — {c.issuingAuthority}</Text>
                  {c.certificateNumber && <Text style={s.sBadgeSub}>#{c.certificateNumber}</Text>}
                  {c.expiryDate && <Text style={[s.sBadgeSub, { color: C.amber }]}>Exp {fmtDate(c.expiryDate)}</Text>}
                </View>
              ))}
            </SSection>
          )}

          {/* Medical */}
          {medical && (
            <>
              <View style={s.sDivider} />
              <SSection title="Medical">
                <View style={s.sBadge}>
                  <Text style={s.sBadgeTxt}>{medical.medicalClass.replace('_', ' ')} — {medical.issuingAuthority}</Text>
                  <Text style={[s.sBadgeSub, { color: C.green }]}>Valid to {fmtDate(medical.expiryDate)}</Text>
                </View>
              </SSection>
            </>
          )}

          {/* Languages */}
          {allLanguages.length > 0 && (
            <>
              <View style={s.sDivider} />
              <SSection title="Languages">
                {allLanguages.map((l, i) => (
                  <View key={i} style={s.sRow}>
                    <Text style={s.sLabel}>{l.language}</Text>
                    <Text style={s.sValue}>{l.level}</Text>
                  </View>
                ))}
              </SSection>
            </>
          )}
        </View>

        {/* ── MAIN CONTENT ── */}
        <View style={s.main}>

          {/* Logbook totals */}
          <MSection title="Logbook Summary">
            <View style={s.totalsGrid}>
              {totalRows.map(r => (
                <View key={r.label} style={s.totalBox}>
                  <Text style={s.totalBoxVal}>{r.value}</Text>
                  <Text style={s.totalBoxLabel}>{r.label}</Text>
                </View>
              ))}
            </View>
            {(totals.landingsDay || totals.landingsNight) ? (
              <View style={[s.mRow, { marginTop: 8 }]}>
                <Text style={s.mLabel}>Landings</Text>
                <Text style={s.mValue}>
                  {totals.landingsDay ?? 0} day / {totals.landingsNight ?? 0} night
                </Text>
              </View>
            ) : null}
          </MSection>

          {/* Type ratings / aircraft experience */}
          {(ratings.length > 0 || aircraftTypes.length > 0) && (
            <MSection title="Aircraft Experience">
              {ratings.map((r, i) => (
                <View key={i} style={s.ratingRow}>
                  <Text style={s.ratingType}>{r.aircraftType} ({r.category})</Text>
                  {r.hoursOnType ? <Text style={s.ratingHrs}>{fmt(r.hoursOnType)}h on type</Text> : null}
                  {r.expiryDate  ? <Text style={s.ratingExp}>Exp {fmtDate(r.expiryDate)}</Text> : null}
                </View>
              ))}
              {aircraftTypes.filter(t => !ratings.some(r => r.aircraftType === t)).map((t, i) => (
                <View key={i} style={s.ratingRow}>
                  <Text style={s.ratingType}>{t}</Text>
                </View>
              ))}
            </MSection>
          )}

          {/* Education */}
          {education.length > 0 && (
            <MSection title="Education">
              {education.map((e, i) => (
                <View key={i} style={s.eduEntry}>
                  <Text style={s.eduDegree}>{e.degree}{e.fieldOfStudy ? ` — ${e.fieldOfStudy}` : ''}</Text>
                  <Text style={s.eduSub}>{[e.institution, e.year].filter(Boolean).join(' · ')}</Text>
                </View>
              ))}
            </MSection>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <MSection title="Skills">
              <View style={s.pillRow}>
                {skills.map((sk, i) => (
                  <View key={i} style={s.pill}><Text style={s.pillTxt}>{sk}</Text></View>
                ))}
              </View>
            </MSection>
          )}

          {/* Recurrent training */}
          {training.length > 0 && (
            <MSection title="Recurrent Training">
              {training.slice(0, 8).map((t, i) => (
                <View key={i} style={s.bullet}>
                  <Text style={s.bulletDot}>›</Text>
                  <Text style={s.bulletText}>
                    {t.type}{t.provider ? ` — ${t.provider}` : ''}{t.completedAt ? `  (${fmtDate(t.completedAt)})` : ''}
                    {t.expiresAt ? `  Exp ${fmtDate(t.expiresAt)}` : ''}
                  </Text>
                </View>
              ))}
            </MSection>
          )}

          {/* Custom sections */}
          {other.map((sec, i) => (
            <MSection key={i} title={sec.title || 'Additional Information'}>
              <Text style={{ fontSize: 8, color: C.textDark, lineHeight: 1.5 }}>{sec.content}</Text>
            </MSection>
          ))}
        </View>

      </Page>
    </Document>
  );
}
