import React from 'react';
import {
  Document, Page, View, Text, StyleSheet,
  Svg, Image, Defs, ClipPath, Circle,
} from '@react-pdf/renderer';
import { ACCENT_MAP, DEFAULT_ACCENT } from './accentPalette';

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
  // ── Two-column hours table ──
  hoursTable:  { flexDirection: 'column', marginTop: 4 },
  hoursPair:   { flexDirection: 'row', borderBottom: `0.5 solid ${C.border}`, paddingVertical: 3 },
  hoursCell:   { flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 },
  hoursLabel:  { fontSize: 8, color: C.textLight },
  hoursVal:    { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.navy },
  // ── Recency ──
  recencyRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8, paddingTop: 8, borderTop: `0.5 solid ${C.border}` },
  recencyItem:  { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  recencyVal:   { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.navy },
  recencyLabel: { fontSize: 7, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.3 },
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
  // Profile / summary
  summaryText:   { fontSize: 9, color: C.textMid, lineHeight: 1.6 },
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

function Section({ title, children, accent }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={[s.sectionTitle, { color: accent }]}>{title}</Text>
        <View style={s.sectionLine} />
      </View>
      {children}
    </View>
  );
}

// ─── Document ─────────────────────────────────────────────────────────────────
export default function TemplateFinal({ data }) {
  const { pilot, certificates = [], ratings = [], medicals = [], training = [],
          rtw = [], totals = {}, recency = {}, aircraftTypes = [], cv = {} } = data;
  const { education = [], languages = [], skills = [], other = [], photoUrl } = cv;

  const accent      = cv.accentColor || DEFAULT_ACCENT;
  const accentLight = ACCENT_MAP[accent]?.light || '#1B2B4B';
  const T = {
    accentBg:      { backgroundColor: accent },
    accentLightBg: { backgroundColor: accentLight },
    accentColor:   { color: accent },
  };

  const cert = topCert(certificates);
  const elpCert = certificates.find(c => c.type === 'ELP');

  // Languages: ELP cert from profile, supplemented by cv.languages
  const displayLanguages = [...languages];
  if (elpCert && !displayLanguages.some(l => l.language?.toLowerCase() === 'english')) {
    displayLanguages.unshift({ language: 'English', level: `ICAO Level ${elpCert.englishLevel || '6'}` });
  }

  // Always render from profile
  const shownRatings = ratings;
  const profileLicences = certificates.filter(c => c.type !== 'ELP');

  // Hours two-column pairs
  const hasActualSim = (totals.instrumentActualTime ?? 0) > 0 || (totals.instrumentSimTime ?? 0) > 0;
  const hoursPairs = [
    ['Total',       fmt(totals.totalTime)            + 'h', 'PIC',      fmt(totals.picTime)             + 'h'],
    ['SIC',         fmt(totals.sicTime)              + 'h', 'Night',    fmt(totals.nightTime)           + 'h'],
    hasActualSim
      ? ['IFR Actual', fmt(totals.instrumentActualTime) + 'h', 'IFR Sim', fmt(totals.instrumentSimTime) + 'h']
      : ['Instrument', fmt(totals.instrumentTime)    + 'h', 'Multi',    fmt(totals.multiEngineTime)     + 'h'],
    hasActualSim
      ? ['Multi',     fmt(totals.multiEngineTime)    + 'h', 'Turbine',  fmt(totals.turbineTime)         + 'h']
      : ['Turbine',   fmt(totals.turbineTime)        + 'h', 'Cross-Cty',fmt(totals.crossCountryTime)   + 'h'],
    hasActualSim
      ? ['Cross-Cty', fmt(totals.crossCountryTime)  + 'h', 'Jet',      fmt(totals.jetTime)             + 'h']
      : ['Jet',       fmt(totals.jetTime)           + 'h', null,        null],
  ].filter(([, lv, , rv]) => lv !== '0h' || (rv && rv !== '0h'));

  // Aircraft Experience always shows all logbook aircraft (separate section from formal ratings)

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── HEADER ── */}
        <View style={[s.header, T.accentBg]}>
          <View style={s.headerAccent} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
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
                    <View style={[s.hStatDivider, T.accentLightBg]} />
                    <View style={s.hStat}>
                      <Text style={s.hStatVal}>{fmt(totals.picTime)}</Text>
                      <Text style={s.hStatLabel}>PIC HRS</Text>
                    </View>
                  </>
                )}
                {shownRatings.length > 0 && (
                  <>
                    <View style={[s.hStatDivider, T.accentLightBg]} />
                    <View style={s.hStat}>
                      <Text style={s.hStatVal}>{shownRatings.length}</Text>
                      <Text style={s.hStatLabel}>TYPE RATING{shownRatings.length !== 1 ? 'S' : ''}</Text>
                    </View>
                  </>
                )}
              </View>
            </View>
            {photoUrl && (
              <View style={{ marginLeft: 16, marginTop: 4 }}>
                <Svg viewBox="0 0 70 70" width={70} height={70}>
                  <Defs>
                    <ClipPath id="finalPhotoClip">
                      <Circle cx="35" cy="35" r="35" />
                    </ClipPath>
                  </Defs>
                  <Image href={photoUrl} x="0" y="0" width="70" height="70" clipPath="url(#finalPhotoClip)" />
                  <Circle cx="35" cy="35" r="34" fill="none" stroke={C.cyan} strokeWidth="2" />
                </Svg>
              </View>
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

          {/* Profile / Professional Summary */}
          {cv.summary?.trim() ? (
            <Section title="Profile" accent={accent}>
              <Text style={s.summaryText}>{cv.summary.trim()}</Text>
            </Section>
          ) : null}

          {/* Flight Hours — two-column table */}
          {hoursPairs.length > 0 && (
            <Section title="Flight Hours Summary" accent={accent}>
              <View style={s.hoursTable}>
                {hoursPairs.map(([ll, lv, rl, rv], i) => (
                  <View key={i} style={s.hoursPair}>
                    <View style={s.hoursCell}>
                      <Text style={s.hoursLabel}>{ll}</Text>
                      <Text style={[s.hoursVal, T.accentColor]}>{lv}</Text>
                    </View>
                    {rl && (
                      <View style={[s.hoursCell, { borderLeft: `0.5 solid ${C.border}` }]}>
                        <Text style={s.hoursLabel}>{rl}</Text>
                        <Text style={[s.hoursVal, T.accentColor]}>{rv}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
              {(recency.hours90d > 0 || recency.hours12m > 0) && (
                <View style={s.recencyRow}>
                  {recency.hours90d > 0 && (
                    <View style={s.recencyItem}>
                      <Text style={[s.recencyVal, T.accentColor]}>{fmt(recency.hours90d)}h</Text>
                      <Text style={s.recencyLabel}>last 90 days</Text>
                    </View>
                  )}
                  {recency.hours12m > 0 && (
                    <View style={s.recencyItem}>
                      <Text style={[s.recencyVal, T.accentColor]}>{fmt(recency.hours12m)}h</Text>
                      <Text style={s.recencyLabel}>last 12 months</Text>
                    </View>
                  )}
                  {recency.sectors90 > 0 && (
                    <View style={s.recencyItem}>
                      <Text style={[s.recencyVal, T.accentColor]}>{recency.sectors90}</Text>
                      <Text style={s.recencyLabel}>T/O · sectors (90d)</Text>
                    </View>
                  )}
                  {(recency.landingsDay90 > 0 || recency.landingsNight90 > 0) && (
                    <View style={s.recencyItem}>
                      <Text style={[s.recencyVal, T.accentColor]}>{(recency.landingsDay90 ?? 0) + (recency.landingsNight90 ?? 0)}</Text>
                      <Text style={s.recencyLabel}>landings (90d)</Text>
                    </View>
                  )}
                </View>
              )}
            </Section>
          )}

          {/* Licences & Medical — from profile */}
          {(profileLicences.length > 0 || !!medicals[0]) ? (
            <Section title="Licences & Medical" accent={accent}>
              <View style={s.twoCol}>
                {profileLicences.length > 0 && (
                  <View style={s.col}>
                    {profileLicences.map((c, i) => (
                      <View key={i} style={s.certBadge}>
                        <Text style={[s.certType, T.accentColor]}>{c.type}</Text>
                        <Text style={s.certAuth}>{c.issuingAuthority}{c.certificateNumber ? ` · #${c.certificateNumber}` : ''}</Text>
                        {c.expiryDate && <Text style={s.certExp}>Exp {fmtDate(c.expiryDate)}</Text>}
                      </View>
                    ))}
                  </View>
                )}
                {medicals[0] && (
                  <View style={s.col}>
                    <View style={s.medBadge}>
                      <Text style={s.medClass}>{medicals[0].medicalClass.replace('_', ' ')} Medical</Text>
                      <Text style={[s.medMeta, { color: C.textMid }]}>{medicals[0].issuingAuthority}</Text>
                      <Text style={s.medMeta}>Valid to {fmtDate(medicals[0].expiryDate)}</Text>
                    </View>
                  </View>
                )}
              </View>
            </Section>
          ) : null}

          {/* Right to Work — from profile */}
          {rtw.length > 0 && (
            <Section title="Right to Work" accent={accent}>
              <View style={s.twoCol}>
                {rtw.map((r, i) => (
                  <View key={i} style={s.certBadge}>
                    <Text style={[s.certType, T.accentColor]}>{r.country}</Text>
                    <Text style={s.certAuth}>{r.documentType}{r.documentNumber ? ` · #${r.documentNumber}` : ''}</Text>
                    {r.expiresAt && <Text style={s.certExp}>Valid to {fmtDate(r.expiresAt)}</Text>}
                  </View>
                ))}
              </View>
            </Section>
          )}

          {/* Type Ratings — from profile */}
          {shownRatings.length > 0 && (
            <Section title="Type Ratings" accent={accent}>
              {ratings.map((r, i) => (
                <View key={i} style={s.ratingCard}>
                  <Text style={[s.ratingType, T.accentColor]}>{r.aircraftType} ({r.capacity || r.category})</Text>
                  {r.hoursOnType ? <Text style={s.ratingMeta}>{fmt(r.hoursOnType)}h on type</Text> : null}
                  {r.expiryDate  ? <Text style={s.ratingExp}>Exp {fmtDate(r.expiryDate)}</Text> : null}
                </View>
              ))}
            </Section>
          )}

          {/* Aircraft Experience — all logbook aircraft with hours */}
          {aircraftTypes.length > 0 && (
            <Section title="Aircraft Experience" accent={accent}>
              {aircraftTypes.map((t, i) => (
                <View key={i} style={s.ratingCard}>
                  <Text style={[s.ratingType, T.accentColor]}>{t.type}</Text>
                  {t.hours > 0 && <Text style={s.ratingMeta}>{fmt(t.hours)}h</Text>}
                </View>
              ))}
            </Section>
          )}

          {/* Education + Languages side by side */}
          {(education.length > 0 || displayLanguages.length > 0) && (
            <Section title="Education & Languages" accent={accent}>
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
                {displayLanguages.length > 0 && (
                  <View style={s.col}>
                    {displayLanguages.map((l, i) => (
                      <View key={i} style={{ marginBottom: 4 }}>
                        <View style={s.langRow}>
                          <Text style={s.langName}>{l.language}</Text>
                          <Text style={s.langLevel}>{l.level}</Text>
                        </View>
                        {l.expiry && (
                          <Text style={{ fontSize: 7, color: C.amber, marginTop: -2 }}>Exp {fmtDate(l.expiry)}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </Section>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <Section title="Skills" accent={accent}>
              <View style={s.pillRow}>
                {skills.map((sk, i) => (
                  <View key={i} style={s.pill}><Text style={s.pillTxt}>{sk}</Text></View>
                ))}
              </View>
            </Section>
          )}

          {/* Recurrent training */}
          {training.length > 0 && (
            <Section title="Recurrent Training" accent={accent}>
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
            <Section key={i} title={sec.title || 'Additional Information'} accent={accent}>
              <Text style={s.otherContent}>{sec.content}</Text>
            </Section>
          ))}

        </View>
      </Page>
    </Document>
  );
}
