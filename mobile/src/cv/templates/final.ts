// Final CV template as HTML — 1:1 port of frontend/src/components/cv/TemplateFinal.jsx.
// Full-width accent header (name/role/stats/photo) + offWhite contact strip + stacked
// body blocks (profile, hours, licences&medical, RTW, ratings, aircraft, edu&langs,
// skills, training, custom).
import {
  ACCENT_MAP, C, CvData, DEFAULT_ACCENT, buildHoursPairs, buildLanguages, esc, fmt, fmtDate, fullName, htmlDoc, topCert,
} from '../shared';

const CSS = `
.fin{font-size:9pt;}
.header{padding:28pt 36pt 16pt;}
.headerAccent{height:3pt;background:${C.cyan};margin-bottom:14pt;}
.headerTop{display:flex;align-items:flex-start;}
.hName{font-weight:bold;font-size:22pt;color:${C.white};letter-spacing:-0.5pt;margin-bottom:3pt;}
.hRole{font-size:9pt;color:${C.cyan};letter-spacing:1pt;margin-bottom:10pt;}
.hStats{display:flex;gap:18pt;align-items:stretch;}
.hStat{display:flex;align-items:baseline;gap:4pt;}
.hStatVal{font-weight:bold;font-size:16pt;color:${C.white};}
.hStatLabel{font-size:8pt;color:${C.textLight};letter-spacing:0.5pt;}
.hStatDivider{width:1pt;align-self:stretch;}
.photo{width:70pt;height:70pt;border-radius:35pt;object-fit:cover;border:2pt solid ${C.cyan};margin-left:16pt;margin-top:4pt;display:block;}
.contactStrip{display:flex;flex-wrap:wrap;gap:16pt;background:${C.offWhite};padding:8pt 36pt;border-bottom:1pt solid ${C.border};}
.contactItem{display:flex;gap:4pt;align-items:center;}
.contactLabel{font-size:7pt;color:${C.textLight};font-weight:bold;letter-spacing:0.4pt;}
.contactValue{font-size:8pt;color:${C.textDark};}
.body{padding:20pt 36pt 24pt;}
.section{margin-bottom:16pt;}
.sectionHeader{display:flex;align-items:center;margin-bottom:8pt;gap:8pt;}
.sectionLine{flex:1;height:1pt;background:${C.border};}
.sectionTitle{font-weight:bold;font-size:8.5pt;letter-spacing:1pt;text-transform:uppercase;}
.hoursTable{display:flex;flex-direction:column;margin-top:4pt;}
.hoursPair{display:flex;border-bottom:0.5pt solid ${C.border};padding:3pt 0;}
.hoursCell{flex:1;display:flex;justify-content:space-between;padding:0 6pt;}
.hoursCellL{border-left:0.5pt solid ${C.border};}
.hoursLabel{font-size:8pt;color:${C.textLight};}
.hoursVal{font-weight:bold;font-size:8pt;}
.recencyRow{display:flex;flex-wrap:wrap;gap:14pt;margin-top:8pt;padding-top:8pt;border-top:0.5pt solid ${C.border};}
.recencyItem{display:flex;align-items:baseline;gap:3pt;}
.recencyVal{font-weight:bold;font-size:9pt;}
.recencyLabel{font-size:7pt;color:${C.textLight};text-transform:uppercase;letter-spacing:0.3pt;}
.twoCol{display:flex;gap:16pt;}
.col{flex:1;}
.ratingCard{display:flex;align-items:center;padding:6pt 10pt;border-radius:5pt;background:${C.offWhite};border:1pt solid ${C.border};margin-bottom:5pt;}
.ratingType{font-weight:bold;font-size:9pt;flex:1;}
.ratingMeta{font-size:7.5pt;color:${C.textLight};}
.ratingExp{font-size:7pt;color:${C.amber};margin-left:8pt;}
.certBadge{display:flex;align-items:center;padding:5pt 8pt;border:1pt solid ${C.border};border-radius:4pt;margin-bottom:4pt;background:${C.white};}
.certType{font-weight:bold;font-size:8.5pt;width:46pt;}
.certAuth{font-size:8pt;color:${C.textMid};flex:1;}
.certExp{font-size:7pt;color:${C.amber};}
.medBadge{padding:6pt 10pt;border-radius:4pt;background:rgba(46,204,113,0.08);border:1pt solid rgba(46,204,113,0.3);margin-bottom:4pt;}
.medClass{font-weight:bold;font-size:8.5pt;color:${C.textDark};}
.medMeta{font-size:7.5pt;color:${C.green};margin-top:1pt;}
.eduEntry{margin-bottom:6pt;}
.eduDegree{font-weight:bold;font-size:9pt;color:${C.textDark};}
.eduSub{font-size:7.5pt;color:${C.textLight};margin-top:1pt;}
.pillRow{display:flex;flex-wrap:wrap;gap:5pt;}
.pill{background:${C.offWhite};border:1pt solid ${C.border};border-radius:10pt;padding:3pt 8pt;}
.pillTxt{font-size:7.5pt;color:${C.textMid};}
.trainingRow{display:flex;align-items:center;padding:4pt 0;border-bottom:0.5pt solid ${C.border};}
.trainingType{font-size:8pt;color:${C.textDark};flex:1;}
.trainingDate{font-size:7.5pt;color:${C.textLight};width:70pt;}
.trainingExp{font-size:7pt;color:${C.amber};width:70pt;text-align:right;}
.langRow{display:flex;align-items:center;padding:3pt 0;}
.langName{font-weight:bold;font-size:8.5pt;color:${C.textDark};flex:1;}
.langLevel{font-size:8pt;color:${C.cyanDim};}
.otherContent{font-size:8pt;color:${C.textDark};line-height:1.5;}
.summaryText{font-size:9pt;color:${C.textMid};line-height:1.6;}`;

export function renderFinal(data: CvData, accentColor?: string): string {
  const { pilot, certificates = [], ratings = [], medicals = [], training = [], rtw = [], totals = {}, recency = {}, aircraftTypes = [], cv = {} } = data;
  const { education = [], languages = [], skills = [], other = [], photoUrl } = cv;

  const accent = accentColor || cv.accentColor || DEFAULT_ACCENT;
  const aLight = ACCENT_MAP[accent]?.light || '#1B2B4B';

  const cert = topCert(certificates);
  const elp = certificates.find((c: CvData) => c.type === 'ELP');
  const licences = certificates.filter((c: CvData) => c.type !== 'ELP');
  const langs = buildLanguages(languages, elp);
  const hoursPairs = buildHoursPairs(totals, true);

  const section = (title: string, inner: string) =>
    `<div class="section"><div class="sectionHeader"><div class="sectionTitle" style="color:${accent}">${esc(title)}</div><div class="sectionLine"></div></div>${inner}</div>`;

  // ── Header ──
  const stats: string[] = [];
  if (totals.totalTime > 0) stats.push(`<div class="hStat"><span class="hStatVal">${fmt(totals.totalTime)}</span><span class="hStatLabel">TOTAL HRS</span></div>`);
  if (totals.picTime > 0) stats.push(`<div class="hStatDivider" style="background:${aLight}"></div><div class="hStat"><span class="hStatVal">${fmt(totals.picTime)}</span><span class="hStatLabel">PIC HRS</span></div>`);
  if (ratings.length > 0) stats.push(`<div class="hStatDivider" style="background:${aLight}"></div><div class="hStat"><span class="hStatVal">${ratings.length}</span><span class="hStatLabel">TYPE RATING${ratings.length !== 1 ? 'S' : ''}</span></div>`);

  const header = `<div class="header" style="background:${accent}">
    <div class="headerAccent"></div>
    <div class="headerTop">
      <div style="flex:1">
        <div class="hName">${esc(fullName(pilot))}</div>
        <div class="hRole">${cert ? `${esc(cert.type)}(A) · ${esc(cert.issuingAuthority || 'Commercial Pilot')}` : 'Commercial Pilot'}</div>
        <div class="hStats">${stats.join('')}</div>
      </div>
      ${photoUrl ? `<img class="photo" src="${esc(photoUrl)}" />` : ''}
    </div>
  </div>`;

  // ── Contact strip ──
  const contactItems = [
    pilot?.email ? ['EMAIL', pilot.email] : null,
    pilot?.phone ? ['PHONE', pilot.phone] : null,
    pilot?.nationality ? ['NATIONALITY', pilot.nationality] : null,
    pilot?.city ? ['BASE', [pilot.city, pilot.country].filter(Boolean).join(', ')] : null,
    pilot?.dateOfBirth ? ['DOB', fmtDate(pilot.dateOfBirth)] : null,
  ].filter(Boolean) as [string, string][];
  const contactStrip = `<div class="contactStrip">${contactItems.map(([l, v]) => `<div class="contactItem"><span class="contactLabel">${esc(l)}</span><span class="contactValue">${esc(v)}</span></div>`).join('')}</div>`;

  // ── Body ──
  const summaryBlock = cv.summary?.trim() ? section('Profile', `<div class="summaryText">${esc(cv.summary.trim())}</div>`) : '';

  const hoursHtml = `<div class="hoursTable">${hoursPairs.map(([ll, lv, rl, rv]) =>
    `<div class="hoursPair"><div class="hoursCell"><span class="hoursLabel">${esc(ll)}</span><span class="hoursVal" style="color:${accent}">${esc(lv)}</span></div>${rl ? `<div class="hoursCell hoursCellL"><span class="hoursLabel">${esc(rl)}</span><span class="hoursVal" style="color:${accent}">${esc(rv)}</span></div>` : ''}</div>`).join('')}</div>`;
  const recRow: string[] = [];
  if (recency.hours90d > 0) recRow.push(`<div class="recencyItem"><span class="recencyVal" style="color:${accent}">${fmt(recency.hours90d)}h</span><span class="recencyLabel">last 90 days</span></div>`);
  if (recency.hours12m > 0) recRow.push(`<div class="recencyItem"><span class="recencyVal" style="color:${accent}">${fmt(recency.hours12m)}h</span><span class="recencyLabel">last 12 months</span></div>`);
  if (recency.sectors90 > 0) recRow.push(`<div class="recencyItem"><span class="recencyVal" style="color:${accent}">${recency.sectors90}</span><span class="recencyLabel">T/O · sectors (90d)</span></div>`);
  if ((recency.landingsDay90 ?? 0) + (recency.landingsNight90 ?? 0) > 0) recRow.push(`<div class="recencyItem"><span class="recencyVal" style="color:${accent}">${(recency.landingsDay90 ?? 0) + (recency.landingsNight90 ?? 0)}</span><span class="recencyLabel">landings (90d)</span></div>`);
  const hoursBlock = hoursPairs.length ? section('Flight Hours Summary', hoursHtml + (recRow.length ? `<div class="recencyRow">${recRow.join('')}</div>` : '')) : '';

  const licMed = (licences.length || medicals[0])
    ? section('Licences & Medical', `<div class="twoCol">${licences.length ? `<div class="col">${licences.map((c: CvData) =>
        `<div class="certBadge"><span class="certType" style="color:${accent}">${esc(c.type)}</span><span class="certAuth">${esc(c.issuingAuthority)}${c.certificateNumber ? ` · #${esc(c.certificateNumber)}` : ''}</span>${c.expiryDate ? `<span class="certExp">Exp ${esc(fmtDate(c.expiryDate))}</span>` : ''}</div>`).join('')}</div>` : ''}${medicals[0] ? `<div class="col"><div class="medBadge"><div class="medClass">${esc(String(medicals[0].medicalClass).replace('_', ' '))} Medical</div><div class="medMeta" style="color:${C.textMid}">${esc(medicals[0].issuingAuthority)}</div><div class="medMeta">Valid to ${esc(fmtDate(medicals[0].expiryDate))}</div></div></div>` : ''}</div>`)
    : '';

  const rtwBlock = rtw.length
    ? section('Right to Work', `<div class="twoCol">${rtw.map((r: CvData) =>
        `<div class="certBadge"><span class="certType" style="color:${accent}">${esc(r.country)}</span><span class="certAuth">${esc(r.documentType)}${r.documentNumber ? ` · #${esc(r.documentNumber)}` : ''}</span>${r.expiresAt ? `<span class="certExp">Valid to ${esc(fmtDate(r.expiresAt))}</span>` : ''}</div>`).join('')}</div>`)
    : '';

  const ratingsBlock = ratings.length
    ? section('Type Ratings', ratings.map((r: CvData) =>
        `<div class="ratingCard"><span class="ratingType" style="color:${accent}">${esc(r.aircraftType)} (${esc(r.capacity || r.category)})</span>${r.hoursOnType ? `<span class="ratingMeta">${fmt(r.hoursOnType)}h on type</span>` : ''}${r.expiryDate ? `<span class="ratingExp">Exp ${esc(fmtDate(r.expiryDate))}</span>` : ''}</div>`).join('')) : '';

  const acBlock = aircraftTypes.length
    ? section('Aircraft Experience', aircraftTypes.map((t: CvData) =>
        `<div class="ratingCard"><span class="ratingType" style="color:${accent}">${esc(t.type)}</span>${t.hours > 0 ? `<span class="ratingMeta">${fmt(t.hours)}h</span>` : ''}</div>`).join('')) : '';

  const eduLang = (education.length || langs.length)
    ? section('Education & Languages', `<div class="twoCol">${education.length ? `<div class="col">${education.map((e: CvData) =>
        `<div class="eduEntry"><div class="eduDegree">${esc(e.degree)}${e.fieldOfStudy ? ` — ${esc(e.fieldOfStudy)}` : ''}</div><div class="eduSub">${esc([e.institution, e.year].filter(Boolean).join(' · '))}</div></div>`).join('')}</div>` : ''}${langs.length ? `<div class="col">${langs.map((l: CvData) =>
        `<div class="langRow"><span class="langName">${esc(l.language)}</span><span class="langLevel">${esc(l.level)}</span></div>`).join('')}</div>` : ''}</div>`)
    : '';

  const skillsBlock = skills.length
    ? section('Skills', `<div class="pillRow">${skills.map((sk: string) => `<span class="pill"><span class="pillTxt">${esc(sk)}</span></span>`).join('')}</div>`) : '';

  const trainingBlock = training.length
    ? section('Recurrent Training', training.slice(0, 8).map((t: CvData) =>
        `<div class="trainingRow"><span class="trainingType">${esc(t.type)}${t.provider ? ` — ${esc(t.provider)}` : ''}</span><span class="trainingDate">${esc(fmtDate(t.completedAt))}</span><span class="trainingExp">${t.expiresAt ? `Exp ${esc(fmtDate(t.expiresAt))}` : ''}</span></div>`).join('')) : '';

  const customBlock = other.map((sec: CvData) =>
    section(sec.title || 'Additional Information', `<div class="otherContent">${esc(sec.content)}</div>`)).join('');

  const body = `<div class="body">${summaryBlock}${hoursBlock}${licMed}${rtwBlock}${ratingsBlock}${acBlock}${eduLang}${skillsBlock}${trainingBlock}${customBlock}</div>`;

  return htmlDoc(CSS, `<div class="fin">${header}${contactStrip}${body}</div>`);
}
