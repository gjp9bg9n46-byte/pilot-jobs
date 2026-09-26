// Display helpers for the Jobs redesign (list + detail). Pure, shared by web now
// and mirrored for the app later.

// ── Title case for ALL-CAPS titles (Part 0d) — display only, never overwrites
// the stored title. Only touches titles that are entirely uppercase; preserves
// acronyms and codes (FAA, ATP, A320, B737, ANG, 191st).
const KEEP_UPPER = /^(FAA|EASA|ATP|ATPL|CPL|MPL|PPL|IR|ME|ELP|ICAO|GCAA|GACA|CAA|DGCA|JAA|OSS|ANG|USAF|EU|UK|US|USA|UAE|KSA|II|III|IV|VI|VII|VIII|IX|XI|XII|PIC|SIC|FO|DEC|NTR|LST|IFR|VFR)$/;
function titleCaseWords(str) {
  return String(str).split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok) || tok === '') return tok;
    if (/\d/.test(tok)) return tok;                       // codes/ordinals: A320, B737-800, 191st
    if (tok === tok.toUpperCase() && (tok.length <= 4 || KEEP_UPPER.test(tok))) return tok; // acronyms
    return tok.split('-').map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p)).join('-');
  }).join('');
}
export function displayTitle(title) {
  // Trim trailing separators the source often leaves ("Jet First Officers —").
  const t = String(title || '').replace(/[\s–—-]+$/, '').trim();
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (!letters || t !== t.toUpperCase()) return t;        // not ALL-CAPS → leave as-is
  return titleCaseWords(t);
}

// Client mirror of the backend region taxonomy (jobMatch.regionForCountry), used to
// pick the pilot's default region tab BEFORE the first jobs fetch (no flicker).
const R_NA = new Set(['united states', 'usa', 'us', 'united states of america', 'america', 'canada', 'ca']);
const R_ME = new Set(['united arab emirates', 'uae', 'ae', 'qatar', 'qa', 'saudi arabia', 'ksa', 'sa', 'bahrain', 'bh', 'kuwait', 'kw', 'oman', 'om', 'jordan', 'jo', 'lebanon', 'lb', 'israel', 'il', 'iraq', 'iq', 'egypt', 'egitto', 'eg', 'turkey', 'türkiye', 'tr', 'syria', 'sy', 'yemen', 'ye', 'iran', 'ir']);
const R_AP = new Set(['china', 'cn', 'hong kong', 'hk', 'japan', 'jp', 'south korea', 'korea', 'kr', 'singapore', 'sg', 'malaysia', 'my', 'thailand', 'th', 'vietnam', 'vn', 'indonesia', 'id', 'philippines', 'ph', 'india', 'in', 'pakistan', 'pk', 'australia', 'au', 'new zealand', 'nz', 'taiwan', 'tw', 'sri lanka', 'lk', 'bangladesh', 'bd']);
const R_EU = new Set(['united kingdom', 'uk', 'gb', 'great britain', 'england', 'ireland', 'ie', 'france', 'fr', 'germany', 'de', 'spain', 'es', 'portugal', 'pt', 'italy', 'it', 'netherlands', 'nl', 'belgium', 'be', 'luxembourg', 'lu', 'switzerland', 'ch', 'austria', 'at', 'poland', 'pl', 'czech republic', 'czechia', 'cz', 'slovakia', 'sk', 'hungary', 'hu', 'romania', 'ro', 'bulgaria', 'bg', 'greece', 'gr', 'croatia', 'hr', 'slovenia', 'si', 'denmark', 'dk', 'sweden', 'se', 'norway', 'no', 'finland', 'fi', 'iceland', 'is', 'estonia', 'ee', 'latvia', 'lv', 'lithuania', 'lt', 'malta', 'mt', 'cyprus', 'cy', 'serbia', 'rs', 'ukraine', 'ua']);
export function defaultRegionForPilot(country) {
  const c = String(country || '').trim().toLowerCase();
  if (!c) return '';
  if (R_NA.has(c)) return 'North America';
  if (R_ME.has(c)) return 'Middle East';
  if (R_EU.has(c)) return 'Europe';
  if (R_AP.has(c)) return 'Asia-Pacific';
  return ''; // unknown → All regions
}

// ── Country → flag emoji (unknown → null, never a wrong flag). Kept from the old
// Jobs page so the location line keeps its flags.
const COUNTRY_ISO = {
  'united states': 'US', usa: 'US', 'united kingdom': 'GB', uk: 'GB', france: 'FR',
  germany: 'DE', italy: 'IT', spain: 'ES', netherlands: 'NL', poland: 'PL',
  austria: 'AT', switzerland: 'CH', canada: 'CA', australia: 'AU', 'new zealand': 'NZ',
  'south africa': 'ZA', uae: 'AE', 'united arab emirates': 'AE', qatar: 'QA',
  'saudi arabia': 'SA', kuwait: 'KW', oman: 'OM', bahrain: 'BH', egypt: 'EG',
  morocco: 'MA', tunisia: 'TN', algeria: 'DZ', libya: 'LY', ireland: 'IE',
  belgium: 'BE', portugal: 'PT', greece: 'GR', turkey: 'TR', norway: 'NO',
  sweden: 'SE', denmark: 'DK', finland: 'FI', iceland: 'IS', singapore: 'SG',
  'hong kong': 'HK', malaysia: 'MY', india: 'IN', japan: 'JP', china: 'CN',
  mexico: 'MX', brazil: 'BR', iraq: 'IQ', yemen: 'YE', jordan: 'JO', lebanon: 'LB',
  israel: 'IL', hungary: 'HU', 'czech republic': 'CZ', latvia: 'LV', lithuania: 'LT',
  estonia: 'EE', bulgaria: 'BG', romania: 'RO', croatia: 'HR', luxembourg: 'LU',
  malta: 'MT', syria: 'SY', cyprus: 'CY',
};
export function countryFlag(country) {
  const iso = COUNTRY_ISO[String(country || '').trim().toLowerCase()];
  if (!iso) return null;
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// ── slug for /jobs/:slugId
function slugify(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function slugFor(job) {
  return `${slugify(job.company)}-${slugify(job.role || job.title)}-${job.id}`;
}

// ── Role label
export const ROLE_LABEL = { CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', INSTRUCTOR: 'Instructor', FLIGHT_ENGINEER: 'Flight Engineer', SECOND_OFFICER: 'Second Officer' };
export const roleLabel = (r) => ROLE_LABEL[r] || (r ? titleCaseWords(String(r).replace(/_/g, ' ')) : null);

// ── Card chip row (aircraft, role, authority, contract) — visa handled separately.
export function jobChips(job) {
  const chips = [];
  (job.reqAircraftTypes || []).slice(0, 2).forEach((t) => chips.push({ text: t }));
  if (job.role) chips.push({ text: roleLabel(job.role) });
  (job.reqAuthorities || []).slice(0, 1).forEach((a) => chips.push({ text: a }));
  if (job.contractType) chips.push({ text: titleCaseWords(job.contractType) });
  if (job.isVisaSponsored || job.visaSponsored) chips.push({ text: 'Visa sponsored', visa: true });
  return chips;
}

// ── Compact checklist (up to `max`) from the shared match payload.
const HOURS_SUFFIX = { totalHours: '', picHours: ' PIC', multiHours: ' multi', turbineHours: ' turbine', instrumentHours: ' IFR', ccHours: ' XC' };
function reqShort(r) {
  if (r.key === 'typeRating') return `${r.reqText} type rating`;
  if (r.key === 'english') return `English ${r.reqText}`;
  if (r.key in HOURS_SUFFIX) return `${r.reqText}${HOURS_SUFFIX[r.key]}`;
  return r.reqText;
}
export function checklist(match, max = 4) {
  if (!match || !match.requirements) return [];
  const order = { unmet: 0, met: 1, unknown: 2 };
  const sorted = [...match.requirements].sort((a, b) => order[a.status] - order[b.status]);
  return sorted.slice(0, max).map((r) => ({
    status: r.status,
    text: r.status === 'unmet' ? `${reqShort(r)} (you: ${r.pilotText || '0'})` : reqShort(r),
  }));
}

// ── Direct-vs-via source line
const VIA_NAMES = { WHATJOBS: 'WhatJobs', ADZUNA: 'Adzuna', CAREERJET: 'Careerjet', JOOBLE: 'Jooble', REED: 'Reed', AVIATIONJOBSEARCH: 'AviationJobSearch' };
export function sourceInfo(job) {
  const direct = job.sourceType && job.sourceType !== 'aggregator';
  if (direct) return { direct: true, label: `Apply directly with ${job.company}` };
  const via = VIA_NAMES[job.sourcePlatform] || (job.sourcePlatform ? titleCaseWords(String(job.sourcePlatform).toLowerCase()) : 'aggregator');
  return { direct: false, label: `via ${via}` };
}
