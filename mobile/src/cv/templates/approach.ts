// Approach CV template as HTML — 1:1 port of frontend/src/components/cv/TemplateApproach.jsx.
// Two-column: accent sidebar (photo/contact/licences/medical/languages/RTW) + white main
// (profile/logbook/ratings/aircraft/education/skills/training/custom).
import {
  ACCENT_MAP, C, CvData, DEFAULT_ACCENT, buildHoursPairs, buildLanguages, esc, fmt, fmtDate, fullName, htmlDoc, initials, topCert,
} from '../shared';

const CSS = `
.appr{display:flex;flex-direction:row;min-height:841pt;font-size:9pt;}
.sidebar{width:180pt;padding:32pt 18pt 24pt;display:flex;flex-direction:column;}
.tapeRow{display:flex;gap:3pt;margin-bottom:20pt;}
.tape{height:4pt;flex:1;border-radius:2pt;}
.avatar{width:60pt;height:60pt;border-radius:30pt;border:2pt solid ${C.cyan};display:flex;align-items:center;justify-content:center;margin:0 auto 8pt;}
.avatarImg{width:60pt;height:60pt;border-radius:30pt;object-fit:cover;border:2pt solid ${C.cyan};display:block;margin:0 auto 8pt;}
.avatarTxt{font-weight:bold;font-size:20pt;color:${C.cyan};}
.sName{font-weight:bold;font-size:13pt;color:${C.white};text-align:center;margin-bottom:2pt;line-height:1.3;}
.sRole{font-size:8pt;color:${C.cyan};text-align:center;margin-bottom:16pt;letter-spacing:0.5pt;}
.sDivider{height:1pt;margin:4pt 0 12pt;}
.sSection{margin-bottom:12pt;}
.sSectionTitle{font-weight:bold;font-size:7pt;color:${C.cyanDim};letter-spacing:1pt;text-transform:uppercase;margin-bottom:5pt;}
.sRow{display:flex;align-items:flex-start;margin-bottom:4pt;}
.sLabel{font-size:7.5pt;color:${C.textLight};width:58pt;flex-shrink:0;}
.sValue{font-size:7.5pt;color:${C.white};flex:1;word-break:break-word;}
.sBadge{border-radius:4pt;padding:2pt 5pt;margin-bottom:3pt;}
.sBadgeTxt{font-size:7.5pt;color:${C.white};}
.sBadgeSub{font-size:6.5pt;color:${C.textLight};}
.main{flex:1;background:${C.white};padding:32pt 28pt 24pt;display:flex;flex-direction:column;}
.mSection{margin-bottom:16pt;}
.mTitle{font-weight:bold;font-size:10pt;letter-spacing:0.3pt;margin-bottom:6pt;padding-bottom:4pt;border-bottom:1.5pt solid ${C.cyan};}
.mRow{display:flex;margin-bottom:3pt;}
.mLabel{font-weight:bold;font-size:8pt;color:${C.textMid};width:100pt;}
.mValue{font-size:8pt;color:${C.textDark};flex:1;}
.hoursTable{display:flex;flex-direction:column;margin-top:4pt;}
.hoursPair{display:flex;border-bottom:0.5pt solid ${C.border};padding:3pt 0;}
.hoursCell{flex:1;display:flex;justify-content:space-between;padding:0 4pt;}
.hoursCellL{border-left:0.5pt solid ${C.border};}
.hoursLabel{font-size:7.5pt;color:${C.textLight};}
.hoursVal{font-weight:bold;font-size:7.5pt;}
.ratingRow{display:flex;align-items:center;background:${C.offWhite};border-radius:5pt;padding:5pt 8pt;margin-bottom:4pt;}
.ratingType{font-weight:bold;font-size:8.5pt;flex:1;}
.ratingHrs{font-size:7.5pt;color:${C.textLight};}
.ratingExp{font-size:7pt;color:${C.amber};margin-left:6pt;}
.bullet{display:flex;margin-bottom:3pt;}
.bulletDot{font-size:8pt;color:${C.cyan};margin-right:5pt;}
.bulletText{font-size:8pt;color:${C.textDark};flex:1;}
.pillRow{display:flex;flex-wrap:wrap;gap:4pt;}
.pill{background:${C.offWhite};border-radius:10pt;padding:3pt 7pt;border:1pt solid ${C.border};}
.pillTxt{font-size:7.5pt;color:${C.textMid};}
.eduEntry{margin-bottom:6pt;}
.eduDegree{font-weight:bold;font-size:8.5pt;color:${C.textDark};}
.eduSub{font-size:7.5pt;color:${C.textLight};}
.summaryText{font-size:8.5pt;color:${C.textMid};line-height:1.6;}`;

export function renderApproach(data: CvData, accentColor?: string): string {
  const { pilot, certificates = [], ratings = [], medicals = [], training = [], rtw = [], totals = {}, recency = {}, aircraftTypes = [], cv = {} } = data;
  const { education = [], languages = [], skills = [], other = [], photoUrl } = cv;

  const accent = accentColor || cv.accentColor || DEFAULT_ACCENT;
  const aLight = ACCENT_MAP[accent]?.light || '#1B2B4B';
  const aDark = ACCENT_MAP[accent]?.dark || '#07101E';

  const cert = topCert(certificates);
  const elp = certificates.find((c: CvData) => c.type === 'ELP');
  const licences = certificates.filter((c: CvData) => c.type !== 'ELP');
  const langs = buildLanguages(languages, elp);
  const hoursPairs = buildHoursPairs(totals, false);

  const mSection = (title: string, inner: string) =>
    `<div class="mSection"><div class="mTitle" style="color:${accent}">${esc(title)}</div>${inner}</div>`;
  const sSection = (title: string, inner: string) =>
    `<div class="sSection"><div class="sSectionTitle">${esc(title)}</div>${inner}</div>`;

  // ── Sidebar ──
  const avatar = photoUrl
    ? `<img class="avatarImg" src="${esc(photoUrl)}" />`
    : `<div class="avatar" style="background:${aLight}"><span class="avatarTxt">${esc(initials(pilot))}</span></div>`;

  const contact = sSection('Contact', [
    pilot?.email ? `<div class="sRow"><div class="sLabel">Email</div><div class="sValue">${esc(pilot.email)}</div></div>` : '',
    pilot?.phone ? `<div class="sRow"><div class="sLabel">Phone</div><div class="sValue">${esc(pilot.phone)}</div></div>` : '',
    pilot?.city ? `<div class="sRow"><div class="sLabel">Based</div><div class="sValue">${esc([pilot.city, pilot.country].filter(Boolean).join(', '))}</div></div>` : '',
    pilot?.nationality ? `<div class="sRow"><div class="sLabel">Nationality</div><div class="sValue">${esc(pilot.nationality)}</div></div>` : '',
    pilot?.dateOfBirth ? `<div class="sRow"><div class="sLabel">DOB</div><div class="sValue">${esc(fmtDate(pilot.dateOfBirth))}</div></div>` : '',
  ].join(''));

  const licBlock = licences.length
    ? sSection('Licences', licences.map((c: CvData) =>
        `<div class="sBadge" style="background:${aLight};border:1pt solid ${C.cyanDim};margin-bottom:4pt"><div class="sBadgeTxt">${esc(c.type)} — ${esc(c.issuingAuthority)}</div>${c.certificateNumber ? `<div class="sBadgeSub">#${esc(c.certificateNumber)}</div>` : ''}${c.expiryDate ? `<div class="sBadgeSub" style="color:${C.amber}">Exp ${esc(fmtDate(c.expiryDate))}</div>` : ''}</div>`).join(''))
    : '';

  const medBlock = medicals[0]
    ? `<div class="sDivider" style="background:${aLight}"></div>` + sSection('Medical',
        `<div class="sBadge" style="background:${aLight}"><div class="sBadgeTxt">${esc(String(medicals[0].medicalClass).replace('_', ' '))} — ${esc(medicals[0].issuingAuthority)}</div><div class="sBadgeSub" style="color:${C.green}">Valid to ${esc(fmtDate(medicals[0].expiryDate))}</div></div>`)
    : '';

  const langBlock = langs.length
    ? `<div class="sDivider" style="background:${aLight}"></div>` + sSection('Languages', langs.map((l: CvData) =>
        `<div class="sRow"><div class="sLabel">${esc(l.language)}</div><div class="sValue">${esc(l.level)}</div></div>`).join(''))
    : '';

  const rtwBlock = rtw.length
    ? `<div class="sDivider" style="background:${aLight}"></div>` + sSection('Right to Work', rtw.map((r: CvData) =>
        `<div class="sBadge" style="background:${aLight};margin-bottom:4pt"><div class="sBadgeTxt">${esc(r.country)}</div><div class="sBadgeSub">${esc(r.documentType)}${r.documentNumber ? ` · #${esc(r.documentNumber)}` : ''}</div>${r.expiresAt ? `<div class="sBadgeSub" style="color:${C.green}">Valid to ${esc(fmtDate(r.expiresAt))}</div>` : ''}</div>`).join(''))
    : '';

  const sidebar = `<div class="sidebar" style="background:${accent}">
    <div class="tapeRow"><div class="tape" style="background:${C.cyan}"></div><div class="tape" style="background:${C.cyanDim}"></div><div class="tape" style="background:${aLight}"></div><div class="tape" style="background:${aDark}"></div></div>
    ${avatar}
    <div class="sName">${esc(fullName(pilot))}</div>
    <div class="sRole">${cert ? `${esc(cert.type)}(A) — ${esc(cert.issuingAuthority || '')}` : 'Commercial Pilot'}</div>
    <div class="sDivider" style="background:${aLight}"></div>
    ${contact}
    <div class="sDivider" style="background:${C.navyLight}"></div>
    ${licBlock}${medBlock}${langBlock}${rtwBlock}
  </div>`;

  // ── Main ──
  const summaryBlock = cv.summary?.trim() ? mSection('Profile', `<div class="summaryText">${esc(cv.summary.trim())}</div>`) : '';

  const hoursHtml = `<div class="hoursTable">${hoursPairs.map(([ll, lv, rl, rv]) =>
    `<div class="hoursPair"><div class="hoursCell"><span class="hoursLabel">${esc(ll)}</span><span class="hoursVal" style="color:${accent}">${esc(lv)}</span></div>${rl ? `<div class="hoursCell hoursCellL"><span class="hoursLabel">${esc(rl)}</span><span class="hoursVal" style="color:${accent}">${esc(rv)}</span></div>` : ''}</div>`).join('')}</div>`;
  const landings = (totals.landingsDay || totals.landingsNight)
    ? `<div class="mRow" style="margin-top:6pt"><div class="mLabel">Landings</div><div class="mValue">${totals.landingsDay ?? 0} day / ${totals.landingsNight ?? 0} night</div></div>` : '';
  const recencyLine = (recency.hours90d > 0 || recency.hours12m > 0)
    ? `<div class="mRow" style="margin-top:4pt"><div class="mLabel">Recency</div><div class="mValue">${recency.hours90d > 0 ? `${fmt(recency.hours90d)}h/90d` : ''}${recency.hours90d > 0 && recency.hours12m > 0 ? '  ·  ' : ''}${recency.hours12m > 0 ? `${fmt(recency.hours12m)}h/12m` : ''}${recency.sectors90 > 0 ? `  ·  ${recency.sectors90} T/O` : ''}</div></div>` : '';
  const logbook = mSection('Logbook Summary', hoursHtml + landings + recencyLine);

  const ratingsBlock = ratings.length
    ? mSection('Type Ratings', ratings.map((r: CvData) =>
        `<div class="ratingRow"><span class="ratingType" style="color:${accent}">${esc(r.aircraftType)} (${esc(r.capacity || r.category)})</span>${r.hoursOnType ? `<span class="ratingHrs">${fmt(r.hoursOnType)}h</span>` : ''}${r.expiryDate ? `<span class="ratingExp">Exp ${esc(fmtDate(r.expiryDate))}</span>` : ''}</div>`).join('')) : '';

  const acBlock = aircraftTypes.length
    ? mSection('Aircraft Experience', aircraftTypes.map((t: CvData) =>
        `<div class="ratingRow"><span class="ratingType" style="color:${accent}">${esc(t.type)}</span>${t.hours > 0 ? `<span class="ratingHrs">${fmt(t.hours)}h</span>` : ''}</div>`).join('')) : '';

  const eduBlock = education.length
    ? mSection('Education', education.map((e: CvData) =>
        `<div class="eduEntry"><div class="eduDegree">${esc(e.degree)}${e.fieldOfStudy ? ` — ${esc(e.fieldOfStudy)}` : ''}</div><div class="eduSub">${esc([e.institution, e.year].filter(Boolean).join(' · '))}</div></div>`).join('')) : '';

  const skillsBlock = skills.length
    ? mSection('Skills', `<div class="pillRow">${skills.map((sk: string) => `<span class="pill"><span class="pillTxt">${esc(sk)}</span></span>`).join('')}</div>`) : '';

  const trainingBlock = training.length
    ? mSection('Recurrent Training', training.slice(0, 8).map((t: CvData) =>
        `<div class="bullet"><span class="bulletDot">›</span><span class="bulletText">${esc(t.type)}${t.provider ? ` — ${esc(t.provider)}` : ''}${t.completedAt ? `  (${esc(fmtDate(t.completedAt))})` : ''}${t.expiresAt ? `  Exp ${esc(fmtDate(t.expiresAt))}` : ''}</span></div>`).join('')) : '';

  const customBlock = other.map((sec: CvData) =>
    mSection(sec.title || 'Additional Information', `<div style="font-size:8pt;color:${C.textDark};line-height:1.5">${esc(sec.content)}</div>`)).join('');

  const main = `<div class="main">${summaryBlock}${logbook}${ratingsBlock}${acBlock}${eduBlock}${skillsBlock}${trainingBlock}${customBlock}</div>`;

  return htmlDoc(CSS, `<div class="appr">${sidebar}${main}</div>`);
}
