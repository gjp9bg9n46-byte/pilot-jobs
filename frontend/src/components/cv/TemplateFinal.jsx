import React from 'react';
import {
  Document, Page, View, Text, StyleSheet,
} from '@react-pdf/renderer';

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  navy:      '#0D1E35',
  navyLight: '#1B2B4B',
  cyan:      '#00B4D8',
  cyanDim:   '#007A96',
  white:     '#FFFFFF',
  offWhite:  '#F4F8FB',
  textDark:  '#1A2535',
  textMid:   '#3A5070',
  textLight: '#6A88A0',
  border:    '#D8E8F0',
  green:     '#2ECC71',
  amber:     '#F39C12',
};

const PAD = 36;

const s = StyleSheet.create({
  page:          { fontFamily: 'Helvetica', fontSize: 9, color: C.textDark, backgroundColor: C.white },
  // ── Header ──
  header:        { backgroundColor: C.navy, paddingHorizontal: PAD, paddingTop: 28, paddingBottom: 16 },
  headerAccent:  { height: 3, backgroundColor: C.cyan, marginBottom: 14 },
  hName:         { fontFamily: 'Helvetica-Bold', fontSize: 22, color: C.white, letterSpacing: -0.5, marginBottom: 3 },
  hRole:         { fontSize: 9, color: C.cyan, letterSpacing: 1, marginBottom: 10 },
  hStats:        { flexDirection: 'row', gap: 18 },
  hStat:         { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  hStatVal:      { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.white },
  hStatLabel:    { fontSize: 8, color: C.textLight, letterSpacing: 0.5 },
  hStatDivider:  { width: 1, backgroundColor: C.navyLight, alignSelf: 'stretch' },
  // ── Contact strip ──
  contactStrip:  { flexDirection: 'row', flexWrap: 'wrap', gap: 16, backgroundColor: C.offWhite, paddingHorizontal: PAD, paddingVertical: 8, borderBottom: `1 solid ${C.border}` },
  contactItem:   { flexDirection: 'row', gap: 4, alignItems: 'center' },
  contactLabel:  { fontSize: 7, color: C.textLight, fontFamily: 'Helvetica-Bold', letterSpacing: 0.4 },
  contactValue:  { fontSize: 8, color: C.textDark },
  // ── Body ──
  body:          { paddingHorizontal: PAD, paddingTop: 20, paddingBottom: 24 },
  section:       { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  sectionLine:   { flex: 1, height: 1, backgroundColor: C.border },
  sectionTitle:  { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.navy, letterSpacing: 1, textTransform: 'uppercase' },
  // ── Runway-dash divider (decorative) ──
  // Totals grid
  totalsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  totalBox:      { backgroundColor: C.offWhite, border: `1 solid ${C.border}`, borderRadius: 5, paddingVertical: 7, paddingHorizontal: 10, alignItems: 'center', minWidth: 64 },
  totalBoxVal:   { fontFamily: 'Helvetica-Bold', fontSize: 13, color: C.navy },
  totalBoxLabel: { fontSize: 6.5, color: C.textLight, marginTop: 1, letterSpacing: 0.5, textTransform: 'uppercase' },
  totalBoxSub:   { fontSize: 7, color: C.cyanDim, fontFamily: 'Helvetica-Bold' },
  // Two-column layout
  twoCol:        { flexDirection: 'row', gap: 16 },
  col:           { flex: 1 },
  // Rating card
  ratingCard:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 5, backgroundColor: C.offWhite, border: `1 solid ${C.border}`, marginBottom: 5 },
  ratingType:    { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.navy, flex: 1 },
  ratingMeta:    { fontSize: 7.5, color: C.textLight },
  ratingExp:     { fontSize: 7, color: C.amber, marginLeft: 8 },
  // Cert badge
  certBadge:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 8, border: `1 solid ${C.border}`, borderRadius: 4, marginBottom: 4, backgroundColor: C.white },
  certType:      { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.navy, width: 46 },
  certAuth:      { fontSize: 8, color: C.textMid, flex: 1 },
  certExp:       { fontSize: 7, color: C.amber },
  // Medical
  medBadge:      { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, backgroundColor: 'rgba(46,204,113,0.08)', border: `1 solid rgba(46,204,113,0.3)`, marginBottom: 4 },
  medClass:      { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.textDark },
  medMeta:       { fontSize: 7.5, color: C.green, marginTop: 1 },
  // Education
  eduEntry:      { marginBottom: 6 },
  eduDegree:     { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.textDark },
  eduSub:        { fontSize: 7.5, color: C.textLight, marginTop: 1 },
  // Skills
  pillRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  pill:          { backgroundColor: C.offWhite, border: `1 solid ${C.border}`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillTxt:       { fontSize: 7.5, color: C.textMid },
  // Training
  trainingRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottom: `0.5 solid ${C.border}` },
  trainingType:  { fontSize: 8, color: C.textDark, flex: 1 },
  trainingDate:  { fontSize: 7.5, color: C.textLight, width: 70 },
  trainingExp:   { fontSize: 7, color: C.amber, width: 70, textAlign: 'right' },
  // Language
  langRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  langName:      { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.textDark, flex: 1 },
  langLevel:     { fontSize: 8, color: C.cyanDim },
  // Other
  otherContent:  { fontSize: 8, color: C.textDark, lineHeight: 1.5 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => n ? Math.round(n).toLocaleString() : '0';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';
const fullName = (p) => `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim();

function topCert(certs) {
  const order = ['ATPL', 'MPL', 'CPL', 'PPL'];
  for (const t of order) {
    const c = certs.find(x => x.type === t);
    if (c) return c;
  }
  return null;
}

function Section({ title, children }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{title}</Text>
        <View style={s.sectionLine} />
      </View>
      {children}
    </View>
  );
}

// ─── Document ─────────────────────────────────────────────────────────────────
export default function TemplateFinal({ data }) {
  const { pilot, certificates = [], ratings = [], medicals = [], training = [],
          totals = {}, aircraftTypes = [], cv = {} } = data;
  const { education = [], languages = [], skills = [], other = [] } = cv;

  const cert = topCert(certificates);
  const medical = medicals[0];
  const elpCert = certificates.find(c => c.type === 'ELP');

  const allLanguages = [...languages];
  if (elpCert && !allLanguages.some(l => l.language?.toLowerCase() === 'english')) {
    allLanguages.unshift({ language: 'English', level: `ICAO Level ${elpCert.englishLevel || '6'}` });
  }

  const totalRows = [
    { label: 'Total',        value: fmt(totals.totalTime),       sub: 'hours' },
    { label: 'PIC',          value: fmt(totals.picTime),         sub: 'hours' },
    { label: 'SIC',          value: fmt(totals.sicTime),         sub: 'hours' },
    { label: 'Night',        value: fmt(totals.nightTime),       sub: 'hours' },
    { label: 'IFR',          value: fmt(totals.instrumentTime),  sub: 'hours' },
    { label: 'Multi-Engine', value: fmt(totals.multiEngineTime), sub: 'hours' },
    { label: 'Turbine',      value: fmt(totals.turbineTime),     sub: 'hours' },
  ].filter(r => r.value !== '0');

  const licences = certificates.filter(c => c.type !== 'ELP');

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── HEADER ── */}
        <View style={s.header}>
          <View style={s.headerAccent} />
          <Text style={s.hName}>{fullName(pilot)}</Text>
          <Text style={s.hRole}>
            {cert ? `${cert.type}(A) · ${cert.issuingAuthority || 'Commercial Pilot'}` : 'Commercial Pilot'}
          </Text>
          <View style={s.hStats}>
            {totals.totalTime > 0 && (
              <View style={s.hStat}>
                <Text style={s.hStatVal}>{fmt(totals.totalTime)}</Text>
                <Text style={s.hStatLabel}>TOTAL HRS</Text>
              </View>
            )}
            {totals.picTime > 0 && (
              <>
                <View style={s.hStatDivider} />
                <View style={s.hStat}>
                  <Text style={s.hStatVal}>{fmt(totals.picTime)}</Text>
                  <Text style={s.hStatLabel}>PIC HRS</Text>
                </View>
              </>
            )}
            {ratings.length > 0 && (
              <>
                <View style={s.hStatDivider} />
                <View style={s.hStat}>
                  <Text style={s.hStatVal}>{ratings.length}</Text>
                  <Text style={s.hStatLabel}>TYPE RATING{ratings.length !== 1 ? 'S' : ''}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* ── CONTACT STRIP ── */}
        <View style={s.contactStrip}>
          {pilot?.email       && <View style={s.contactItem}><Text style={s.contactLabel}>EMAIL</Text><Text style={s.contactValue}>{pilot.email}</Text></View>}
          {pilot?.phone       && <View style={s.contactItem}><Text style={s.contactLabel}>PHONE</Text><Text style={s.contactValue}>{pilot.phone}</Text></View>}
          {pilot?.nationality && <View style={s.contactItem}><Text style={s.contactLabel}>NATIONALITY</Text><Text style={s.contactValue}>{pilot.nationality}</Text></View>}
          {pilot?.city        && <View style={s.contactItem}><Text style={s.contactLabel}>BASE</Text><Text style={s.contactValue}>{[pilot.city, pilot.country].filter(Boolean).join(', ')}</Text></View>}
          {pilot?.dateOfBirth && <View style={s.contactItem}><Text style={s.contactLabel}>DOB</Text><Text style={s.contactValue}>{fmtDate(pilot.dateOfBirth)}</Text></View>}
        </View>

        {/* ── BODY ── */}
        <View style={s.body}>

          {/* Logbook totals */}
          {totalRows.length > 0 && (
            <Section title="Flight Hours Summary">
              <View style={s.totalsGrid}>
                {totalRows.map(r => (
                  <View key={r.label} style={s.totalBox}>
                    <Text style={s.totalBoxVal}>{r.value}</Text>
                    <Text style={s.totalBoxLabel}>{r.label}</Text>
                  </View>
                ))}
              </View>
            </Section>
          )}

          {/* Licences + Medical side by side */}
          {(licences.length > 0 || medical) && (
            <Section title="Licences & Medical">
              <View style={s.twoCol}>
                {licences.length > 0 && (
                  <View style={s.col}>
                    {licences.map((c, i) => (
                      <View key={i} style={s.certBadge}>
                        <Text style={s.certType}>{c.type}</Text>
                        <Text style={s.certAuth}>{c.issuingAuthority}{c.certificateNumber ? ` · #${c.certificateNumber}` : ''}</Text>
                        {c.expiryDate && <Text style={s.certExp}>Exp {fmtDate(c.expiryDate)}</Text>}
                      </View>
                    ))}
                  </View>
                )}
                {medical && (
                  <View style={s.col}>
                    <View style={s.medBadge}>
                      <Text style={s.medClass}>{medical.medicalClass.replace('_', ' ')} Medical</Text>
                      <Text style={[s.medMeta, { color: C.textMid }]}>{medical.issuingAuthority}</Text>
                      <Text style={s.medMeta}>Valid to {fmtDate(medical.expiryDate)}</Text>
                    </View>
                  </View>
                )}
              </View>
            </Section>
          )}

          {/* Aircraft experience */}
          {(ratings.length > 0 || aircraftTypes.length > 0) && (
            <Section title="Aircraft Experience">
              {ratings.map((r, i) => (
                <View key={i} style={s.ratingCard}>
                  <Text style={s.ratingType}>{r.aircraftType} ({r.category})</Text>
                  {r.hoursOnType ? <Text style={s.ratingMeta}>{fmt(r.hoursOnType)}h on type</Text> : null}
                  {r.expiryDate  ? <Text style={s.ratingExp}>Exp {fmtDate(r.expiryDate)}</Text> : null}
                </View>
              ))}
              {aircraftTypes.filter(t => !ratings.some(r => r.aircraftType === t)).map((t, i) => (
                <View key={i} style={s.ratingCard}>
                  <Text style={s.ratingType}>{t}</Text>
                </View>
              ))}
            </Section>
          )}

          {/* Education + Languages side by side */}
          {(education.length > 0 || allLanguages.length > 0) && (
            <Section title="Education & Languages">
              <View style={s.twoCol}>
                {education.length > 0 && (
                  <View style={s.col}>
                    {education.map((e, i) => (
                      <View key={i} style={s.eduEntry}>
                        <Text style={s.eduDegree}>{e.degree}{e.fieldOfStudy ? ` — ${e.fieldOfStudy}` : ''}</Text>
                        <Text style={s.eduSub}>{[e.institution, e.year].filter(Boolean).join(' · ')}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {allLanguages.length > 0 && (
                  <View style={s.col}>
                    {allLanguages.map((l, i) => (
                      <View key={i} style={s.langRow}>
                        <Text style={s.langName}>{l.language}</Text>
                        <Text style={s.langLevel}>{l.level}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </Section>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <Section title="Skills">
              <View style={s.pillRow}>
                {skills.map((sk, i) => (
                  <View key={i} style={s.pill}><Text style={s.pillTxt}>{sk}</Text></View>
                ))}
              </View>
            </Section>
          )}

          {/* Recurrent training */}
          {training.length > 0 && (
            <Section title="Recurrent Training">
              {training.slice(0, 8).map((t, i) => (
                <View key={i} style={s.trainingRow}>
                  <Text style={s.trainingType}>{t.type}{t.provider ? ` — ${t.provider}` : ''}</Text>
                  <Text style={s.trainingDate}>{fmtDate(t.completedAt)}</Text>
                  {t.expiresAt ? <Text style={s.trainingExp}>Exp {fmtDate(t.expiresAt)}</Text> : <Text style={s.trainingExp} />}
                </View>
              ))}
            </Section>
          )}

          {/* Custom sections */}
          {other.map((sec, i) => (
            <Section key={i} title={sec.title || 'Additional Information'}>
              <Text style={s.otherContent}>{sec.content}</Text>
            </Section>
          ))}

        </View>
      </Page>
    </Document>
  );
}
