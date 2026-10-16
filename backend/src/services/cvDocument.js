'use strict';

/**
 * The CV document — ONE source of truth for the web builder, the app, the PDF
 * and the public share page. Everything here is derived from the pilot's
 * Profile and Logbook; the only CV-only text is the summary.
 *
 * Nothing is invented. If a fact is not on the profile it is omitted, and the
 * "Before you send" check tells the pilot where to add it.
 */

const SECTION_KEYS = ['experience', 'licences', 'medical', 'training', 'employment', 'rtw', 'education', 'photo'];
const SECTION_LABEL = {
  experience: 'Flight experience',
  licences: 'Licences & ratings',
  medical: 'Medical & English',
  training: 'Training',
  employment: 'Employment history',
  rtw: 'Right to work',
  education: 'Education & languages',
  photo: 'Photo',
};
// Where each section's content is edited — every section links to Profile.
const SECTION_SOURCE = {
  experience: '/logbook', licences: '/profile', medical: '/profile', training: '/profile',
  employment: '/profile', rtw: '/profile', education: '/profile', photo: '/profile',
};
const DEFAULT_SECTIONS = SECTION_KEYS.map((key) => ({ key, visible: key !== 'employment' && key !== 'photo' }));

const TEMPLATES = ['classic', 'modern'];
// Four sober accents, from the palette tokens (design-tokens.css / theme tokens).
const ACCENTS = {
  navy: { label: 'Navy', hex: '#0B1F3A' },
  charcoal: { label: 'Charcoal', hex: '#2E3440' },
  slate: { label: 'Slate', hex: '#3B5672' },
  forest: { label: 'Forest', hex: '#24453A' },
};

// ── display helpers ─────────────────────────────────────────────────────────
// Names and cities are stored however the pilot typed them ("cairo", "mohamed");
// the CV always shows them capitalised. Short all-caps codes and anything with a
// digit are left alone (A320, ATPL, YYZ).
function titleCase(s) {
  return String(s || '').split(/\s+/).filter(Boolean).map((w) => w.split('-').map((p) => {
    if (!p) return p;
    if (/\d/.test(p)) return p.toUpperCase();
    if (p.length <= 4 && p === p.toUpperCase()) return p;
    return p[0].toUpperCase() + p.slice(1).toLowerCase();
  }).join('-')).join(' ');
}
const num = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d) { if (!d) return null; const x = new Date(d); return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`; }
function fmtMonth(d) { if (!d) return null; const x = new Date(d); return `${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`; }
const daysUntil = (d) => (d ? Math.round((new Date(d).getTime() - Date.now()) / 86400000) : null);

// Contact details are masked everywhere EXCEPT the downloaded PDF.
function maskPhone(p) {
  const s = String(p || '').trim(); if (!s) return null;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 4 ? `${s.slice(0, 3)} ••• ••• ${digits.slice(-4)}` : '•••';
}
function maskEmail(e) {
  const s = String(e || '').trim(); if (!s) return null;
  const [u, d] = s.split('@'); if (!d) return '•••';
  return `${u.slice(0, 1)}•••@${d}`;
}

// A higher licence supersedes the lower ones — a CPL under an ATPL is noise on a
// CV, so it is hidden (same rank order the profile and matcher use).
const LICENCE_RANK = ['ATPL', 'ATP', 'MPL', 'CPL', 'PPL'];
const rankOf = (t) => { const i = LICENCE_RANK.indexOf(String(t || '').toUpperCase()); return i === -1 ? 99 : i; };
function visibleLicences(certificates) {
  const licences = (certificates || []).filter((c) => !['ELP', 'IR', 'ME', 'SE'].includes(c.type));
  if (!licences.length) return [];
  const top = Math.min(...licences.map((c) => rankOf(c.type)));
  return licences.filter((c) => rankOf(c.type) === top);
}



// Per-type hours and sector count come from computeDerivedTotals — the ONE
// canonical derivation, stored on Pilot.derivedTotals and read by the Profile
// and the matcher. The CV must not derive its own: this pilot's 501 flights
// carry a blank aircraftType and their A320 hours are inferred from the
// registration, so a naive groupBy on aircraftType returns nothing and the CV
// would silently disagree with the Profile.
function flightFacts(raw) {
  const d = (raw.pilot && raw.pilot.derivedTotals) || {};
  const byType = (Array.isArray(d.byType) ? d.byType : [])
    .filter((t) => t && t.type && Number(t.hours) > 0)
    .map((t) => ({ type: t.type, hours: Number(t.hours), inferred: /inferred/i.test(t.note || '') }))
    .sort((a, b) => b.hours - a.hours);
  const totals = raw.totals || {};
  const landings = (totals.landingsDay || 0) + (totals.landingsNight || 0);
  // "Sectors" means flights flown. Landings are only logged by some pilots, so
  // fall back to the flight count rather than printing a misleading 0.
  const sectors = landings > 0 ? landings : (Number(d.flightCount) || 0);
  return { byType, main: byType[0] || null, sectors };
}

// ── Build the document ──────────────────────────────────────────────────────
// `raw` is exactly what GET /cv returns (profile + logbook + CvData).
// `audience`: 'pdf' shows contact details; 'preview' and 'share' mask them.
function buildCvDocument(raw, { audience = 'preview' } = {}) {
  const p = raw.pilot || {};
  const cv = raw.cv || {};
  const totals = raw.totals || {};
  const showContact = audience === 'pdf';

  const licences = visibleLicences(raw.certificates);
  const elp = (raw.certificates || []).find((c) => c.type === 'ELP') || null;
  const medical = (raw.medicals || [])[0] || null;
  const typeRatings = (raw.ratings || []);
  const { byType, main: mainType, sectors } = flightFacts(raw);

  const name = titleCase(`${p.firstName || ''} ${p.lastName || ''}`.trim()) || 'Your name';
  const roleLabel = { CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', INSTRUCTOR: 'Instructor' }[p.role] || null;
  const topLicence = licences[0] ? String(licences[0].type).toUpperCase() : null;
  const headline = [roleLabel, mainType ? titleCase(mainType.type) : null, topLicence].filter(Boolean).join(' · ');
  const base = [titleCase(p.city), titleCase(p.country)].filter(Boolean).join(', ') || null;

  const header = {
    name,
    headline: headline || null,
    base,
    phone: showContact ? (p.phone || null) : maskPhone(p.phone),
    email: showContact ? (p.email || null) : maskEmail(p.email),
    contactMasked: !showContact,
    photoUrl: cv.photoUrl || null,
  };

  const sections = {
    experience: {
      stats: [
        { value: num(totals.totalTime), label: 'Total time (h)' },
        mainType ? { value: num(mainType.hours), label: `${titleCase(mainType.type)} (h)` } : null,
        { value: num(sectors), label: 'Sectors' },
      ].filter(Boolean),
      byType: byType.slice(0, 6).map((t) => ({ type: titleCase(t.type), hours: num(t.hours) })),
      note: mainType && mainType.inferred ? 'From CockpitHire logbook; type inferred from aircraft registration.' : 'From CockpitHire logbook.',
    },
    licences: {
      items: [
        ...licences.map((c) => {
          const d = daysUntil(c.expiryDate);
          return { k: `${String(c.type).toUpperCase()}${c.issuingAuthority && !['unknown', 'icao'].includes(String(c.issuingAuthority).toLowerCase()) ? ` · ${c.issuingAuthority}` : ''}`,
            v: c.expiryDate ? (d < 0 ? `Expired ${fmtDate(c.expiryDate)}` : `Valid to ${fmtMonth(c.expiryDate)}`) : 'No expiry',
            flag: c.expiryDate ? (d < 0 ? 'red' : (d <= 90 ? 'amber' : null)) : null };
        }),
        // "{Type} rating" is the Profile's own wording. Asserting "type" vs
        // "class" from PilotRating.category gets it wrong on real data (this
        // pilot's C172 is stored as Multi-Engine), and a CV must not state a
        // qualification the profile does not actually evidence.
        ...typeRatings.map((r) => {
          const hrs = byType.find((t) => String(t.type).toLowerCase() === String(r.aircraftType).toLowerCase());
          return { k: `${titleCase(r.aircraftType)} rating`, v: hrs ? `${num(hrs.hours)} h` : '' };
        }),
      ],
    },
    medical: {
      items: [
        medical ? (() => { const d = daysUntil(medical.expiryDate); return {
          k: `Class ${String(medical.medicalClass).replace('CLASS_', '')} medical`,
          v: medical.expiryDate ? (d < 0 ? `Expired ${fmtDate(medical.expiryDate)}` : `Valid to ${fmtMonth(medical.expiryDate)}`) : 'No expiry',
          flag: medical.expiryDate ? (d < 0 ? 'red' : (d <= 90 ? 'amber' : null)) : null }; })() : null,
        elp ? (() => { const d = daysUntil(elp.expiryDate); return {
          k: 'ICAO English',
          v: `${elp.englishLevel || 'Level —'}${elp.expiryDate ? (d < 0 ? ` · expired ${fmtDate(elp.expiryDate)}` : ` · to ${fmtMonth(elp.expiryDate)}`) : ''}`,
          flag: elp.expiryDate ? (d < 0 ? 'red' : (d <= 90 ? 'amber' : null)) : null }; })() : null,
      ].filter(Boolean),
    },
    training: { items: (raw.training || []).map((t) => ({ k: t.type, v: fmtMonth(t.completedAt) || '' })) },
    employment: { items: [] },
    rtw: { items: (raw.rtw || []).map((w) => ({ k: titleCase(w.country), v: w.documentType || 'Right to work' })) },
    education: {
      items: [
        ...((cv.education || []).filter((e) => e.degree || e.institution).map((e) => ({
          k: [e.degree, e.institution].filter(Boolean).map(titleCase).join(' · '), v: e.year ? String(e.year) : '' }))),
        ...((cv.languages || []).filter((l) => l.language).map((l) => ({ k: titleCase(l.language), v: l.level || '' }))),
      ],
    },
    photo: { url: cv.photoUrl || null },
  };

  const order = normaliseSections(cv.sections);
  return {
    header,
    summary: cv.summary || null,
    template: TEMPLATES.includes(cv.template) ? cv.template : 'classic',
    accent: ACCENTS[cv.accent] ? cv.accent : 'navy',
    accentHex: (ACCENTS[cv.accent] || ACCENTS.navy).hex,
    order,
    sections,
    counts: {
      licences: sections.licences.items.length,
      training: sections.training.items.length,
      rtw: sections.rtw.items.length,
      education: sections.education.items.length,
    },
    audience,
    generatedAt: new Date().toISOString(),
  };
}

// Stored order may be stale (a key added or removed since) — rebuild it so the
// UI never loses a section or renders one twice.
function normaliseSections(stored) {
  const saved = Array.isArray(stored) ? stored.filter((s) => s && SECTION_KEYS.includes(s.key)) : [];
  const seen = new Set();
  const out = [];
  for (const s of saved) { if (seen.has(s.key)) continue; seen.add(s.key); out.push({ key: s.key, visible: s.visible !== false }); }
  for (const d of DEFAULT_SECTIONS) if (!seen.has(d.key)) out.push({ ...d });
  return out;
}


// ── "Before you send" ───────────────────────────────────────────────────────
// What a recruiter would notice. Every item carries the exact place that fixes
// it, so the panel is never a dead end.
//   red   = expired (a factual error on the CV)
//   amber = missing or expiring (incomplete, not wrong)
//   green = a passed check worth stating; NOT counted in "things to fix"
const EXPIRING_DAYS = 90;

function validateCv(raw) {
  const issues = [];
  const add = (level, text, fixLabel, fixTo) => issues.push({ level, text, fixLabel, fixTo });
  const licences = visibleLicences(raw.certificates);
  const elp = (raw.certificates || []).find((c) => c.type === 'ELP') || null;
  const medical = (raw.medicals || [])[0] || null;
  const totals = raw.totals || {};

  // 1. Licence — expired or expiring, and the authority behind it
  if (!licences.length) add('amber', 'No licence on your profile. A CV without a licence will not pass a first screen.', 'Add licence', '/profile#licences');
  for (const c of licences) {
    const d = daysUntil(c.expiryDate);
    const type = String(c.type).toUpperCase();
    if (d != null && d < 0) add('red', `${type} shows as expired (${fmtDate(c.expiryDate)}). Airlines will see this.`, 'Update', '/profile#licences');
    else if (d != null && d <= EXPIRING_DAYS) add('amber', `${type} expires in ${d} days (${fmtDate(c.expiryDate)}).`, 'Update', '/profile#licences');
    if (!c.issuingAuthority || ['unknown', 'icao'].includes(String(c.issuingAuthority).toLowerCase())) {
      add('amber', 'Licence authority is missing.', 'Add', '/profile#licences');
    }
  }

  // 2. English (ICAO) — an expired ELP is as hard a bar as a licence
  if (!elp) add('amber', 'No ICAO English level on your profile.', 'Add', '/profile#english');
  else {
    const d = daysUntil(elp.expiryDate);
    if (d != null && d < 0) add('red', `ICAO English shows as expired (${fmtDate(elp.expiryDate)}). Airlines will see this.`, 'Update', '/profile#english');
    else if (d != null && d <= EXPIRING_DAYS) add('amber', `ICAO English expires in ${d} days (${fmtDate(elp.expiryDate)}).`, 'Update', '/profile#english');
  }

  // 3. Medical
  if (!medical) add('amber', 'No medical on your profile.', 'Add', '/profile#medical');
  else {
    const d = daysUntil(medical.expiryDate);
    if (d != null && d < 0) add('red', `Class ${String(medical.medicalClass).replace('CLASS_', '')} medical shows as expired (${fmtDate(medical.expiryDate)}).`, 'Update', '/profile#medical');
    else if (d != null && d <= EXPIRING_DAYS) add('amber', `Medical expires in ${d} days (${fmtDate(medical.expiryDate)}).`, 'Update', '/profile#medical');
  }

  // 4. Empty key sections
  if (!(totals.totalTime > 0)) add('amber', 'No flight hours logged. Flight experience is the first thing a recruiter reads.', 'Open logbook', '/logbook');
  if (!(raw.ratings || []).length) add('amber', 'No type or class ratings on your profile.', 'Add', '/profile#ratings');
  if (!(raw.rtw || []).length) add('amber', 'No right to work on your profile. Airlines filter on it.', 'Add', '/profile#rtw');

  // 5. A summary that contradicts the profile
  issues.push(...summaryContradictions(raw));
  return issues;
}

// The summary is free text, so it is the one place the CV can disagree with the
// logbook. Two checks a recruiter would make: does the stated licence match the
// one on file, and are the stated hours within 20% of the logbook?
function summaryContradictions(raw) {
  const out = [];
  const text = String((raw.cv || {}).summary || '');
  if (!text.trim()) return out;
  const totals = raw.totals || {};
  const licences = visibleLicences(raw.certificates);
  const held = new Set(licences.map((c) => String(c.type).toUpperCase()));

  // claimed licence
  const claimed = [...new Set((text.toUpperCase().match(/\b(ATPL|MPL|CPL|PPL)\b/g) || []))];
  const wrong = claimed.filter((c) => !held.has(c));
  if (wrong.length && held.size) {
    out.push({ level: 'red', text: `Your summary says ${wrong.join(' and ')} but your profile holds ${[...held].join(', ')}.`,
      fixLabel: 'Fix summary', fixTo: '#summary' });
  }

  // claimed hours — "1,515 hours", "around 200 hrs", "1500h"
  const m = text.match(/([\d][\d,.]{1,8})\s*(?:\+)?\s*(?:total\s+)?(?:flight\s+)?(?:hours|hrs|h)\b/i);
  if (m) {
    const claimedHrs = Number(String(m[1]).replace(/[,\s]/g, ''));
    const actual = Number(totals.totalTime || 0);
    if (claimedHrs > 0 && actual > 0) {
      const off = Math.abs(claimedHrs - actual) / actual;
      if (off > 0.2) {
        out.push({ level: 'red', text: `Your summary says ${num(claimedHrs)} hours but your logbook shows ${num(actual)}.`,
          fixLabel: 'Fix summary', fixTo: '#summary' });
      }
    }
  }
  return out;
}

// ── "Rewrite from my profile" ───────────────────────────────────────────────
// Built ONLY from facts already on the profile and logbook. No adjectives that
// imply experience the pilot has not recorded, no invented employers, no
// ambitions the pilot never stated. If a fact is missing, the sentence that
// would have carried it is dropped.
function generateSummary(raw) {
  const p = raw.pilot || {};
  const totals = raw.totals || {};
  const licences = visibleLicences(raw.certificates);
  const elp = (raw.certificates || []).find((c) => c.type === 'ELP') || null;
  const medical = (raw.medicals || [])[0] || null;
  const { main } = flightFacts(raw);
  const role = { CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', INSTRUCTOR: 'Instructor' }[p.role] || 'Pilot';
  const city = titleCase(p.city);

  const first = [];
  first.push(role);
  if (totals.totalTime > 0) first.push(`with ${num(totals.totalTime)} hours total time`);
  if (main) first.push(`${totals.totalTime > 0 ? 'including' : 'with'} ${num(main.hours)} hours on the ${titleCase(main.type)}`);
  if (city) first.push(`based in ${city}`);
  const s1 = `${first.join(' ')}.`;

  const creds = [];
  if (licences.length) creds.push(`${String(licences[0].type).toUpperCase()} holder`);
  if (medical) creds.push(`Class ${String(medical.medicalClass).replace('CLASS_', '')} medical`);
  if (elp && elp.englishLevel) creds.push(`ICAO English ${String(elp.englishLevel).replace(/^Level\s*/i, 'Level ')}`);
  const training = (raw.training || []).map((t) => t.type).filter(Boolean).slice(0, 3);
  if (training.length) creds.push(`current ${training.join(', ')} training`);
  const s2 = creds.length ? `${creds.join(', ').replace(/,([^,]*)$/, ' and$1')}.` : '';

  const rtw = (raw.rtw || []).map((w) => titleCase(w.country)).filter(Boolean);
  const s3 = rtw.length ? `Right to work in ${rtw.join(', ')}.` : '';

  return [s1, s2, s3].filter(Boolean).join(' ').slice(0, 600);
}

module.exports = {
  buildCvDocument, normaliseSections, validateCv, summaryContradictions, generateSummary, EXPIRING_DAYS,
  SECTION_KEYS, SECTION_LABEL, SECTION_SOURCE, DEFAULT_SECTIONS, TEMPLATES, ACCENTS,
  titleCase, num, fmtDate, fmtMonth, daysUntil, maskPhone, maskEmail, visibleLicences, rankOf,
};
