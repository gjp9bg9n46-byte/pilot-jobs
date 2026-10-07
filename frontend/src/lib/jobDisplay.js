// Display helpers for the Jobs redesign (list + detail). Pure, shared by web now
// and mirrored for the app later.

// ── Title case for SHOUTED / lowercased titles (Part 0d, A#8) — display only,
// never overwrites the stored title. Preserves genuine acronyms and codes
// (FAA, ATPL, A320, B737-800, 191st). Mobile keeps an identical copy in
// mobile/src/lib/displayNames.ts — the two must agree, or the same job reads
// differently on web and app.
const KEEP_UPPER = /^(FAA|EASA|ATP|ATPL|CPL|MPL|PPL|IR|ME|SE|ELP|ICAO|GCAA|GACA|QCAA|BCAA|CARC|CAA|DGCA|CASA|TCCA|CAAC|JAA|AOC|ATO|FTO|OSS|ANG|USAF|RAF|EU|UK|US|USA|UAE|KSA|II|III|IV|VI|VII|VIII|IX|XI|XII|PIC|SIC|FO|SO|DEC|NTR|LST|IFR|VFR|TRI|TRE|SFI|SFE|LPC|OPC|CRM|MCC|JOC|AQP|RHS|LHS|HEMS|EMS|SAR|VIP|VVIP|PF|PM|QRH|SOP|GA|MPA|SEP|MEP)$/;
// Title-case one hyphen-joined part, skipping leading punctuation so "(TITLE"
// capitalises the letter and not the bracket (which left "(title 32)").
const tcPart = (p) => (p ? p.toLowerCase().replace(/^([^a-z]*)([a-z])/, (_m, pre, ch) => pre + ch.toUpperCase()) : p);
function titleCaseWords(str) {
  return String(str).split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok) || tok === '') return tok;
    // Codes/ordinals keep their shape — but a lowercase aircraft code ("a320",
    // "b737-800") is a code shouting quietly, so uppercase its leading letters.
    // Ordinals ("191st") start with digits and are left alone.
    if (/\d/.test(tok)) return /^[a-z]+\d/.test(tok) ? tok.replace(/^[a-z]+/, (m) => m.toUpperCase()) : tok;
    const letters = tok.replace(/[^A-Za-z]/g, '');
    // Keep a SHOUTED token only when it is a genuine abbreviation: a known
    // aviation/geo acronym, or 1–2 letters (US, UK, MI, FO). The old rule kept
    // ANY token of ≤4 characters, which left "NON TYPE" shouting.
    if (tok === tok.toUpperCase() && (KEEP_UPPER.test(letters) || letters.length <= 2)) return tok;
    return tok.split('-').map(tcPart).join('-');
  }).join('');
}
export function displayTitle(title) {
  // Trim trailing separators the source often leaves ("Jet First Officers —").
  const t = String(title || '').replace(/[\s–—-]+$/, '').trim();
  const upper = (t.match(/[A-Z]/g) || []).length;
  const lower = (t.match(/[a-z]/g) || []).length;
  // No capitals at all ("a320 non type rated first officers") reads as badly as
  // a shouted one — title-case it too.
  if (!upper) return lower ? titleCaseWords(t) : t;
  // "Shouty" = uppercase-dominant, not strictly ALL-CAPS: a stray lowercase
  // ordinal ("191st") shouldn't stop us title-casing the rest. Normal
  // mixed-case titles ("A320 Captain") stay untouched.
  const shouty = lower <= Math.max(2, upper * 0.15);
  if (!shouty) return t;
  return titleCaseWords(t);
}

// Stated requirements for the LOGGED-OUT job page — the job's own requirement
// fields as plain "needed" rows, WITHOUT any pilot match (no ✓/✗). Logged-in
// users get the richer match table from the server instead.
export function statedRequirements(job) {
  if (!job) return [];
  const hrs = (n) => `${Number(n).toLocaleString()} h`;
  const list = (a) => (Array.isArray(a) ? a.filter(Boolean) : []);
  const rows = [];
  const add = (label, text) => { if (text) rows.push({ label, text }); };
  add('Licence authority', list(job.reqAuthorities).join(', '));
  add('Certificate', list(job.reqCertificates).join(', '));
  add('Type rating', list(job.reqAircraftTypes).join(', '));
  add('Work authorisation', job.reqWorkAuthorization);
  if (job.reqMinTotalHours != null) add('Total time', hrs(job.reqMinTotalHours));
  if (job.reqMinPicHours != null) add('PIC time', hrs(job.reqMinPicHours));
  if (job.reqMinMultiEngineHours != null) add('Multi-engine', hrs(job.reqMinMultiEngineHours));
  if (job.reqMinTurbineHours != null) add('Turbine', hrs(job.reqMinTurbineHours));
  if (job.reqMinInstrumentHours != null) add('Instrument', hrs(job.reqMinInstrumentHours));
  if (job.reqMinCrossCountryHours != null) add('Cross-country', hrs(job.reqMinCrossCountryHours));
  if (job.reqMedicalClass != null) add('Medical', `Class ${String(job.reqMedicalClass).replace(/^CLASS[_\s-]?/i, '').replace(/_/g, ' ')}`);
  add('English (ICAO)', job.reqEnglishLevel ? String(job.reqEnglishLevel).replace(/^ICAO[_\s-]?(LEVEL[_\s-]?)?/i, '').replace(/_/g, ' ') : '');
  add('Education', job.reqEducation);
  return rows;
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
  const name = VIA_NAMES[job.sourcePlatform] || (job.sourcePlatform ? titleCaseWords(String(job.sourcePlatform).toLowerCase()) : 'the source');
  const isAdzuna = job.sourcePlatform === 'ADZUNA';
  // `name` is the plain source name (e.g. "Adzuna", "WhatJobs") for the Apply
  // button; `label` kept for back-compat with any older callers.
  if (direct) return { direct: true, name, isAdzuna: false, label: `Apply directly with ${job.company}` };
  return { direct: false, name, isAdzuna, label: `via ${name}` };
}
