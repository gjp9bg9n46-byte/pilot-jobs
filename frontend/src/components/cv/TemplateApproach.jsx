import React from 'react';
import {
  Document, Page, View, Text, StyleSheet, Svg, Path, Rect, Circle,
  Image, Defs, ClipPath,
} from '@react-pdf/renderer';
import { ACCENT_MAP, DEFAULT_ACCENT } from './accentPalette';

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
  // Two-column hours table
  hoursTable: { flexDirection: 'column', marginTop: 4 },
  hoursPair:  { flexDirection: 'row', borderBottom: `0.5 solid ${C.border}`, paddingVertical: 3 },
  hoursCell:  { flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  hoursLabel: { fontSize: 7.5, color: C.textLight },
  hoursVal:   { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: C.navy },
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
  // Profile / summary
  summaryText: { fontSize: 8.5, color: C.textMid, lineHeight: 1.6 },
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
function MSection({ title, children, accent }) {
  return (
    <View style={s.mSection}>
      <Text style={[s.mTitle, { color: accent }]}>{title}</Text>
      {children}
    </View>
  );
}

// ─── Document ─────────────────────────────────────────────────────────────────
export default function TemplateApproach({ data }) {
  const { pilot, certificates = [], ratings = [], medicals = [], training = [],
          totals = {}, recency = {}, aircraftTypes = [], cv = {} } = data;
  const { education = [], languages = [], skills = [], other = [], photoUrl } = cv;

  const accent      = cv.accentColor || DEFAULT_ACCENT;
  const accentLight = ACCENT_MAP[accent]?.light || '#1B2B4B';
  const accentDark  = ACCENT_MAP[accent]?.dark  || '#07101E';
  const T = {
    accentBg:      { backgroundColor: accent },
    accentLightBg: { backgroundColor: accentLight },
    accentDarkBg:  { backgroundColor: accentDark },
    accentColor:   { color: accent },
  };

  const cert = topCert(certificates);
  const elpCert = certificates.find(c => c.type === 'ELP');

  // Override logic: cv fields take precedence over profile data
  const licencesToShow = cv.licenses?.length > 0 ? 'cv' : 'profile';
  const medicalToShow  = cv.medical             ? 'cv' : 'profile';
  const ratingsSource  = cv.typeRatings?.length > 0 ? 'cv' : 'profile';

  // Languages: cv.icaoEnglish overrides ELP cert + manual languages
  let displayLanguages;
  if (cv.icaoEnglish) {
    displayLanguages = [
      { language: 'English', level: `ICAO Level ${cv.icaoEnglish.level}`, expiry: cv.icaoEnglish.expiryDate },
      ...(cv.icaoEnglish.otherLanguages ?? []).map(l => ({ language: l.language, level: l.proficiency })),
    ];
  } else {
    displayLanguages = [...languages];
    if (elpCert && !displayLanguages.some(l => l.language?.toLowerCase() === 'english')) {
      displayLanguages.unshift({ language: 'English', level: `ICAO Level ${elpCert.englishLevel || '6'}` });
    }
  }

  // Hours: two-column paired table
  const hasActualSim = (totals.instrumentActualTime ?? 0) > 0 || (totals.instrumentSimTime ?? 0) > 0;
  const hoursPairs = [
    ['Total',   fmt(totals.totalTime)            + 'h', 'PIC',     fmt(totals.picTime)             + 'h'],
    ['SIC',     fmt(totals.sicTime)              + 'h', 'Night',   fmt(totals.nightTime)           + 'h'],
    hasActualSim
      ? ['IFR Act', fmt(totals.instrumentActualTime) + 'h', 'IFR Sim', fmt(totals.instrumentSimTime) + 'h']
      : ['Instr', fmt(totals.instrumentTime)     + 'h', 'Multi',   fmt(totals.multiEngineTime)     + 'h'],
    hasActualSim
      ? ['Multi', fmt(totals.multiEngineTime)    + 'h', 'Turbine', fmt(totals.turbineTime)         + 'h']
      : ['Turb',  fmt(totals.turbineTime)        + 'h', 'Cross',   fmt(totals.crossCountryTime)    + 'h'],
    hasActualSim
      ? ['Cross', fmt(totals.crossCountryTime)   + 'h', 'Jet',     fmt(totals.jetTime)             + 'h']
      : ['Jet',   fmt(totals.jetTime)            + 'h', null,      null],
  ].filter(([, lv, , rv]) => lv !== '0h' || (rv && rv !== '0h'));

  // Type ratings for PDF: cv overrides profile
  const shownRatings = ratingsSource === 'cv' ? cv.typeRatings : ratings;
  // Aircraft Experience always shows all logbook aircraft with hours (separate from formal ratings)

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── SIDEBAR ── */}
        <View style={[s.sidebar, T.accentBg]}>
          {/* Altitude-tape decoration */}
          <View style={s.tapeRow}>
            <View style={[s.tape, { backgroundColor: C.cyan }]} />
            <View style={[s.tape, { backgroundColor: C.cyanDim }]} />
            <View style={[s.tape, T.accentLightBg]} />
            <View style={[s.tape, T.accentDarkBg]} />
          </View>

          {/* Avatar — photo or initials fallback */}
          {photoUrl ? (
            <View style={{ alignSelf: 'center', marginBottom: 8 }}>
              <Svg viewBox="0 0 60 60" width={60} height={60}>
                <Defs>
                  <ClipPath id="approachPhotoClip">
                    <Circle cx="30" cy="30" r="30" />
                  </ClipPath>
                </Defs>
                <Image href={photoUrl} x="0" y="0" width="60" height="60" clipPath="url(#approachPhotoClip)" />
                <Circle cx="30" cy="30" r="29" fill="none" stroke={C.cyan} strokeWidth="2" />
              </Svg>
            </View>
          ) : (
            <View style={[s.avatar, T.accentLightBg]}>
              <Text style={s.avatarTxt}>{initials(pilot)}</Text>
            </View>
          )}
          <Text style={s.sName}>{fullName(pilot)}</Text>
          <Text style={s.sRole}>
            {cert ? `${cert.type}(A) — ${cert.issuingAuthority || ''}` : 'Commercial Pilot'}
          </Text>

          <View style={[s.sDivider, T.accentLightBg]} />

          {/* Contact */}
          <SSection title="Contact">
            {pilot?.email    && <View style={s.sRow}><Text style={s.sLabel}>Email</Text><Text style={s.sValue}>{pilot.email}</Text></View>}
            {pilot?.phone    && <View style={s.sRow}><Text style={s.sLabel}>Phone</Text><Text style={s.sValue}>{pilot.phone}</Text></View>}
            {pilot?.city     && <View style={s.sRow}><Text style={s.sLabel}>Based</Text><Text style={s.sValue}>{[pilot.city, pilot.country].filter(Boolean).join(', ')}</Text></View>}
            {pilot?.nationality && <View style={s.sRow}><Text style={s.sLabel}>Nationality</Text><Text style={s.sValue}>{pilot.nationality}</Text></View>}
            {pilot?.dateOfBirth && <View style={s.sRow}><Text style={s.sLabel}>DOB</Text><Text style={s.sValue}>{fmtDate(pilot.dateOfBirth)}</Text></View>}
          </SSection>

          <View style={s.sDivider} />

          {/* Licences — cv.licenses overrides profile certs */}
          {(licencesToShow === 'cv'
            ? cv.licenses.length > 0
            : certificates.filter(c => c.type !== 'ELP').length > 0
          ) && (
            <SSection title="Licences">
              {licencesToShow === 'cv'
                ? cv.licenses.map((l, i) => (
                    <View key={i} style={[s.sBadge, T.accentLightBg, { marginBottom: 4 }]}>
                      <Text style={s.sBadgeTxt}>{l.type} — {l.authority}</Text>
                      {l.number && <Text style={s.sBadgeSub}>#{l.number}</Text>}
                      {l.issueDate && <Text style={s.sBadgeSub}>{fmtDate(l.issueDate)}</Text>}
                    </View>
                  ))
                : certificates.filter(c => c.type !== 'ELP').map((c, i) => (
                    <View key={i} style={[s.sBadge, T.accentLightBg, { marginBottom: 4 }]}>
                      <Text style={s.sBadgeTxt}>{c.type} — {c.issuingAuthority}</Text>
                      {c.certificateNumber && <Text style={s.sBadgeSub}>#{c.certificateNumber}</Text>}
                      {c.expiryDate && <Text style={[s.sBadgeSub, { color: C.amber }]}>Exp {fmtDate(c.expiryDate)}</Text>}
                    </View>
                  ))
              }
            </SSection>
          )}

          {/* Medical — cv.medical overrides profile medicals */}
          {(medicalToShow === 'cv' ? !!cv.medical : !!medicals[0]) && (
            <>
              <View style={[s.sDivider, T.accentLightBg]} />
              <SSection title="Medical">
                {medicalToShow === 'cv' ? (
                  <View style={[s.sBadge, T.accentLightBg]}>
                    <Text style={s.sBadgeTxt}>Class {cv.medical.class} — {cv.medical.country}</Text>
                    {cv.medical.expiryDate && <Text style={[s.sBadgeSub, { color: C.green }]}>Valid to {fmtDate(cv.medical.expiryDate)}</Text>}
                    {cv.medical.issueDate  && <Text style={s.sBadgeSub}>Issued {fmtDate(cv.medical.issueDate)}</Text>}
                  </View>
                ) : (
                  <View style={[s.sBadge, T.accentLightBg]}>
                    <Text style={s.sBadgeTxt}>{medicals[0].medicalClass.replace('_', ' ')} — {medicals[0].issuingAuthority}</Text>
                    <Text style={[s.sBadgeSub, { color: C.green }]}>Valid to {fmtDate(medicals[0].expiryDate)}</Text>
                  </View>
                )}
              </SSection>
            </>
          )}

          {/* Languages — cv.icaoEnglish overrides ELP cert + manual languages */}
          {displayLanguages.length > 0 && (
            <>
              <View style={[s.sDivider, T.accentLightBg]} />
              <SSection title="Languages">
                {displayLanguages.map((l, i) => (
                  <View key={i}>
                    <View style={s.sRow}>
                      <Text style={s.sLabel}>{l.language}</Text>
                      <Text style={s.sValue}>{l.level}</Text>
                    </View>
                    {l.expiry && (
                      <View style={[s.sRow, { marginTop: -2, marginBottom: 2 }]}>
                        <Text style={s.sLabel} />
                        <Text style={[s.sValue, { fontSize: 6.5, color: C.amber }]}>Exp {fmtDate(l.expiry)}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </SSection>
            </>
          )}
        </View>

        {/* ── MAIN CONTENT ── */}
        <View style={s.main}>

          {/* Profile / Professional Summary */}
          {cv.summary?.trim() ? (
            <MSection title="Profile" accent={accent}>
              <Text style={s.summaryText}>{cv.summary.trim()}</Text>
            </MSection>
          ) : null}

          {/* Logbook summary — two-column hours table */}
          <MSection title="Logbook Summary" accent={accent}>
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
            {(totals.landingsDay || totals.landingsNight) ? (
              <View style={[s.mRow, { marginTop: 6 }]}>
                <Text style={s.mLabel}>Landings</Text>
                <Text style={s.mValue}>{totals.landingsDay ?? 0} day / {totals.landingsNight ?? 0} night</Text>
              </View>
            ) : null}
            {(recency.hours90d > 0 || recency.hours12m > 0) && (
              <View style={[s.mRow, { marginTop: 4 }]}>
                <Text style={s.mLabel}>Recency</Text>
                <Text style={s.mValue}>
                  {recency.hours90d > 0 ? `${fmt(recency.hours90d)}h/90d` : ''}
                  {recency.hours90d > 0 && recency.hours12m > 0 ? '  ·  ' : ''}
                  {recency.hours12m > 0 ? `${fmt(recency.hours12m)}h/12m` : ''}
                  {recency.sectors90 > 0 ? `  ·  ${recency.sectors90} T/O` : ''}
                </Text>
              </View>
            )}
          </MSection>

          {/* Type Ratings — cv.typeRatings overrides profile ratings */}
          {(shownRatings.length > 0) && (
            <MSection title="Type Ratings" accent={accent}>
              {ratingsSource === 'cv'
                ? cv.typeRatings.map((r, i) => (
                    <View key={i} style={s.ratingRow}>
                      <Text style={[s.ratingType, T.accentColor]}>{r.aircraftType} ({r.capacity})</Text>
                      {r.expiryDate && <Text style={s.ratingExp}>Exp {fmtDate(r.expiryDate)}</Text>}
                    </View>
                  ))
                : ratings.map((r, i) => (
                    <View key={i} style={s.ratingRow}>
                      <Text style={[s.ratingType, T.accentColor]}>{r.aircraftType} ({r.capacity || r.category})</Text>
                      {r.hoursOnType ? <Text style={s.ratingHrs}>{fmt(r.hoursOnType)}h</Text> : null}
                      {r.expiryDate  ? <Text style={s.ratingExp}>Exp {fmtDate(r.expiryDate)}</Text> : null}
                    </View>
                  ))
              }
            </MSection>
          )}

          {/* Aircraft Experience — all logbook aircraft with hours */}
          {aircraftTypes.length > 0 && (
            <MSection title="Aircraft Experience" accent={accent}>
              {aircraftTypes.map((t, i) => (
                <View key={i} style={s.ratingRow}>
                  <Text style={[s.ratingType, T.accentColor]}>{t.type}</Text>
                  {t.hours > 0 && <Text style={s.ratingHrs}>{fmt(t.hours)}h</Text>}
                </View>
              ))}
            </MSection>
          )}

          {/* Education */}
          {education.length > 0 && (
            <MSection title="Education" accent={accent}>
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
            <MSection title="Skills" accent={accent}>
              <View style={s.pillRow}>
                {skills.map((sk, i) => (
                  <View key={i} style={s.pill}><Text style={s.pillTxt}>{sk}</Text></View>
                ))}
              </View>
            </MSection>
          )}

          {/* Recurrent training */}
          {training.length > 0 && (
            <MSection title="Recurrent Training" accent={accent}>
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
            <MSection key={i} title={sec.title || 'Additional Information'} accent={accent}>
              <Text style={{ fontSize: 8, color: C.textDark, lineHeight: 1.5 }}>{sec.content}</Text>
            </MSection>
          ))}
        </View>

      </Page>
    </Document>
  );
}
