'use strict';

// Job identity for duplicate detection. Two listings are the SAME job only when
// ALL of these match: resolved employer · rank · aircraft type(s) · base
// (city/airport) · variant (programme / eligibility group / rated-status).
// Anything uncertain is deliberately NOT merged (the caller lists it for review).
//
// Design rules (from review feedback):
//  - Base is a CITY/AIRPORT (ICAO or named city), never the airline's head office.
//    Country alone counts only when neither listing names a base.
//  - Aircraft type is read from title AND description, including manufacturer words
//    (Boeing/Airbus) and distinct variants (GV≠G600, Legacy 600≠650, CL604/605).
//  - Examiner ≠ Instructor. Cadet / accelerated-command / "for X pilots only" /
//    non-rated vs rated are separate variants and never merge.
//  - Employer is resolved to an airline ONLY when the title/description names it
//    explicitly; incidental word matches (airline names that are common phrases
//    like "Jet Time", "Level") are never used.

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normKey = (s) => fold(s).toLowerCase().replace(/[^a-z0-9]/g, '');
// Employer key for identity comparison: strip legal/business suffixes, slugs and
// language tags so "Jet Aviation" = "Jet Aviation Inc.", "Luxaviation Group" =
// "Luxaviation", "AirX Charter" = "airx". Does NOT strip aviation/air/airways
// (those are identity-bearing). Falls back to the raw key if stripping empties it.
const COMPANY_STRIP = /\b(incorporated|inc|llc|l\.l\.c|ltd|limited|gmbh|ag|sarl|sas|s\.?a\.?s|nv|bv|aps|a\/s|plc|pty|corp|corporation|co|company|holdings?|group|charter|english|french|francais|espanol|deutsch)\b/gi;
// Strict key: strip legal/business suffixes + language tags only. Used for airline
// RESOLUTION (exact company → airline) — never truncated, so it can't collapse a
// name to an abbreviation / lead token and mis-resolve (e.g. mislabelled "SAS
// Scandinavian Airlines" must NOT become an abbreviation hit).
function legalKey(company) {
  return normKey(fold(String(company || '')).toLowerCase().replace(/[-_/.,]/g, ' ').replace(COMPANY_STRIP, ' ')) || normKey(company) || '';
}
// Generic business words that trail a distinctive brand token. Used ONLY for the
// identity CLUSTERING key, so "Skyservice Business Aviation" and the slug
// "skyservice-english" collapse — never for resolution.
const GENERIC_TAIL = new Set(['business', 'aviation', 'aircraft', 'airline', 'airlines', 'airways', 'aero', 'flight', 'flights', 'services', 'executive', 'corporate', 'operations', 'worldwide', 'international', 'enterprises']);
function companyKey(company) {
  let toks = fold(String(company || '')).toLowerCase().replace(/[-_/.,]/g, ' ').replace(COMPANY_STRIP, ' ').split(/\s+/).filter(Boolean);
  const idx = toks.findIndex((t) => GENERIC_TAIL.has(t));
  if (idx > 0 && toks.slice(0, idx).some((t) => t.length >= 4 && !COMMON_TOKENS.has(t) && !GENERIC_TAIL.has(t))) toks = toks.slice(0, idx);
  return toks.join('') || legalKey(company);
}

// ── Rank ─────────────────────────────────────────────────────────────────────
function rankOf(title) {
  const t = ` ${fold(String(title)).toLowerCase()} `;
  if (/\b(examiner|tre|flight\s+examiner)\b/.test(t)) return 'EXAMINER';
  if (/\b(instructor|tri|flight\s+instructor|line\s+trainer)\b/.test(t)) return 'INSTRUCTOR';
  if (/\b(senior\s+first\s+officers?|sfo)\b/.test(t)) return 'SFO';
  if (/\b(first\s+officers?|1st\s+officers?|f\/o|co[- ]?pilots?)\b/.test(t)) return 'FO';
  if (/\bsecond\s+officers?\b/.test(t)) return 'SO';
  if (/\b(cadet|ab[- ]?initio|trainee\s+pilot)\b/.test(t)) return 'CADET';
  const senior = /\bsenior\b/.test(t);
  if (/\b(captains?|commanders?)\b/.test(t)) return senior ? 'SENIOR_CPT' : 'CPT';
  return senior ? 'SENIOR_PILOT' : 'PILOT'; // "Senior Commercial Pilot" ≠ "Commercial Pilot"
}

// ── Aircraft type(s) ─────────────────────────────────────────────────────────
// Read from the TITLE first; only fall back to the description when the title
// names no type. A description's fleet list ("...our A320/A330/A350...") would
// otherwise pollute a job whose actual type is in the title.
function typesFrom(text) {
  const t = ` ${fold(String(text)).toLowerCase()} `;
  const out = new Set();
  const scan = (pat, fn) => { const r = new RegExp(pat, 'gi'); let m; while ((m = r.exec(t))) { const v = fn(m); if (v) out.add(v); } };
  // Gulfstream — GV distinct from G###
  scan('\\bg[-\\s]?v\\b', () => 'GV');
  scan('\\bgulfstream\\s+v\\b', () => 'GV');
  scan('\\bg[-\\s]?(\\d{3})\\b', (m) => 'G' + m[1]);
  scan('\\bgulfstream\\s+g?(\\d{3})\\b', (m) => 'G' + m[1]);
  // Embraer Lineage (1000) / Praetor (500/600) / Legacy (450/500/600/650)
  scan('\\blineage(?:\\s*1000)?\\b', () => 'LINEAGE');
  scan('\\bpraetor\\s*(500|600)\\b', (m) => 'PRAETOR' + m[1]);
  if (!out.has('PRAETOR500') && !out.has('PRAETOR600')) scan('\\bpraetor\\b', () => 'PRAETOR');
  scan('\\blegacy\\s+(\\d{3})\\b', (m) => 'LEGACY' + m[1]);
  // Bombardier Challenger
  scan('\\bchallenger\\s+(\\d{3})\\b', (m) => 'CL' + m[1]);
  scan('\\bcl[-\\s]?(\\d{3})\\b', (m) => 'CL' + m[1]);
  // Global
  scan('\\bglobal\\s+(\\d{4})\\b', (m) => 'GLOBAL' + m[1]);
  scan('\\bbd[-\\s]?700\\b', () => 'GLOBAL');
  // Dassault Falcon
  scan('\\bfalcon\\s+(\\d[\\da-z]*)\\b', (m) => 'FALCON' + m[1].toUpperCase());
  // Cessna Citation — C525/CJ family, plus named variants
  scan('\\bc\\s?525\\b', () => 'CITATION_CJ');
  scan('\\bcj\\s?([1-4])\\b', () => 'CITATION_CJ');
  scan('\\bcitation\\s+([a-z0-9+]+)\\b', (m) => 'CITATION_' + m[1].toUpperCase());
  // Embraer regional / ERJ / E-jets / EMB type-certs
  scan('\\be(1[79][05])\\b', (m) => 'E' + m[1]);
  scan('\\bembraer\\s+(\\d{3})\\b', (m) => 'E' + m[1]);
  scan('\\berj\\s?(\\d{3})\\b', (m) => 'ERJ' + m[1]);
  scan('\\bcrj\\s?(\\d{3})\\b', (m) => 'CRJ' + m[1]);
  if (!out.has('PRAETOR500') && !out.has('PRAETOR600')) scan('\\bemb[-\\s]?(5[0-9]5|5[0-9]0)\\b', (m) => 'E' + m[1]);
  scan('\\batr\\s?(\\d{2})\\b', (m) => 'ATR' + m[1]);
  scan('\\bsaab\\s?(340|2000)\\b', (m) => 'SAAB' + m[1]);
  scan('\\b(?:dash\\s?8|q400|dhc[-\\s]?8)\\b', () => 'DASH8');
  scan('\\bbn[-\\s]?2\\b', () => 'BN2');
  scan('\\bislander\\b', () => 'BN2');
  // Cessna piston / turboprop (Caravan family, Conquest, Skyhawk, utility twins)
  scan('\\bc\\s?208\\b', () => 'C208');
  scan('\\b(?:grand\\s+caravan|supervan|caravan)\\b', () => 'C208');
  scan('\\bc\\s?425\\b', () => 'C425');
  scan('\\b(?:c\\s?172|cessna\\s+172|skyhawk)\\b', () => 'C172');
  scan('\\bf\\s?406\\b', () => 'F406');
  // Pilatus / King Air / Phenom / TBM
  scan('\\bpc[-\\s]?(12|24)\\b', (m) => 'PC' + m[1]);
  scan('\\bking\\s?air\\s*(\\d{2,3})\\b', (m) => 'KINGAIR' + m[1]);
  scan('\\bphenom\\s+(\\d{3})\\b', (m) => 'PHENOM' + m[1]);
  scan('\\btbm\\s*(\\d{3})\\b', (m) => 'TBM' + m[1]);
  // Bombardier Global Express (BD-700, same family as Global 6000/7500)
  scan('\\bglobal\\s+express\\b', () => 'GLOBALEXPRESS');
  // Airbus / Boeing families (variant suffixes — neo/ceo, NG/MAX/-800 — fold to family)
  scan('\\ba[-\\s]?(2[12]0|3[1-8]0)(?:\\s?(?:neo|ceo))?\\b', (m) => 'A' + m[1]);
  scan('\\bairbus\\s+a?(2[12]0|3[1-8]0)(?:\\s?(?:neo|ceo))?\\b', (m) => 'A' + m[1]);
  scan('\\b(?:b|boeing\\s*)?(7[0-9]7)(?:[-\\s]?(?:ng|max|er|lr|[0-9]{2,3}))?\\b', (m) => 'B' + m[1]);
  // Manufacturer-only fallbacks (a model from that maker wasn't found)
  const has = (re) => [...out].some((x) => re.test(x));
  if (/\bboeing\b/.test(t) && !has(/^B\d/)) out.add('BOEING');
  if (/\bairbus\b/.test(t) && !has(/^A\d/)) out.add('AIRBUS');
  if (/\bgulfstream\b/.test(t) && !has(/^G/)) out.add('GULFSTREAM');
  if (/\bcitation\b/.test(t) && !has(/^CITATION/)) out.add('CITATION');
  if (/\bking\s?air\b/.test(t) && !has(/^KINGAIR/)) out.add('KINGAIR');
  return [...out].sort();
}
function typesOf(title, desc) {
  const fromTitle = typesFrom(title);
  return fromTitle.length ? fromTitle : typesFrom(desc || '');
}

// ── Base (city / airport) ────────────────────────────────────────────────────
const ICAO_STOP = new Set(['ONLY', 'CREW', 'BASE', 'TEAM', 'WORK', 'TIME', 'FULL', 'PART', 'HOME', 'LEAD', 'POOL', 'GROW', 'FLEET', 'JETS']);
// Countries with a single commercial pilot base — different city LABELS (e.g.
// Bahrain's "Manama"/"Muharraq", both Bahrain International) are the same base.
// Multi-airport countries (US, UK, UAE…) keep city/ICAO granularity.
const SINGLE_AIRPORT_COUNTRIES = new Set(['bahrain', 'qatar', 'kuwait', 'luxembourg', 'malta', 'singapore', 'hongkong', 'macau', 'brunei', 'maldives', 'iceland', 'cyprus', 'jersey', 'guernsey', 'gibraltar', 'monaco', 'liechtenstein', 'andorra']);
// Words that look like a place but are not a base, or sentence words a greedy
// capture can trail into. A captured place is cleaned of these from the right.
const BASE_STOP = new Set(['home', 'open', 'remote', 'field', 'various', 'multiple', 'flexible', 'anywhere', 'nationwide', 'worldwide', 'the', 'as', 'we', 'this', 'our', 'an', 'and', 'join', 'your', 'you', 'a', 'with', 'for', 'easa', 'faa', 'icao', 'uk', 'usa', 'us', 'eu', 'part', 'to', 'of', 'on', 'at', 'in', 'is', 'be', 'strong', 'stable', 'career', 'roster', 'licensed', 'licenced', 'based', 'first', 'second', 'officer', 'officers', 'captain', 'captains', 'pilot', 'pilots', 'fo', 'crew', 'aircraft', 'fleet', 'position', 'role', 'vacancy', 'opportunity', 'type', 'rated', 'ltd', 'inc', 'llc']);
function cleanPlace(raw) {
  let words = String(raw).split(/[-\s]+/).filter(Boolean);
  while (words.length && BASE_STOP.has(words[words.length - 1].toLowerCase())) words.pop(); // trim trailing sentence/non-place words
  if (!words.length) return null;
  if (BASE_STOP.has(words[0].toLowerCase())) return null; // "Home", "Open", "Remote"…
  const p = words.join(' ');
  return p.length >= 3 ? p : null;
}
function baseOf(title, desc, location, country) {
  const T = `${title}  ${desc || ''}`;
  const ck = normKey(country);
  // 1. ICAO airport codes (K### US, CY## Canada) named in the ad/location
  const icao = (`${T} ${location || ''}`.match(/\b(?:K[A-Z]{3}|C[YZ][A-Z]{2})\b/g) || []).filter((x) => !ICAO_STOP.has(x));
  if (icao.length) return { base: icao.sort()[0].toUpperCase(), named: true, kind: 'icao' };
  // 2. single-airport country → the country IS the base (city label is noise)
  if (ck && SINGLE_AIRPORT_COUNTRIES.has(ck)) return { base: ck, named: true, kind: 'single-airport', label: country };
  // 3. explicit "based in X" / "X-based" / "X base" phrasings (title first).
  //    X is a clean place token (1-3 Title-case words); "Home"/"Open"/"Remote"
  //    and sentence words are NOT bases.
  let m;
  if ((m = title.match(/\b([A-Z][a-zÀ-ÿ]+(?:[- ][A-Z][a-zÀ-ÿ]+){0,2})[-\s]Based\b/))) { const p = cleanPlace(m[1]); if (p) return { base: normKey(p), named: true, kind: 'city', label: p }; }
  if ((m = T.match(/\bbased\s+(?:in|at|out\s+of)\s+([A-Z][a-zÀ-ÿ]+(?:[- ][A-Z][a-zÀ-ÿ]+){0,2})/))) { const p = cleanPlace(m[1]); if (p) return { base: normKey(p), named: true, kind: 'city', label: p }; }
  if ((m = title.match(/\b([A-Z][a-zÀ-ÿ]+)\s+[Bb]ase\b/))) { const p = cleanPlace(m[1]); if (p) return { base: normKey(p), named: true, kind: 'city', label: p }; }
  // 4. location's own city (always distinct — different towns are different jobs)
  const locFirst = fold(String(location || '')).split(',')[0].trim();
  const locCity = (locFirst.match(/[a-z]+/gi) || []).join('');
  if (locCity && normKey(locCity) !== ck) return { base: normKey(locCity), named: true, kind: 'loccity', label: locFirst };
  // 5. country only (NOT a named base)
  return { base: ck || normKey(locCity) || '', named: false, kind: 'country', label: country || '' };
}

// ── Variant: programme · eligibility group · rated-status ────────────────────
function variantOf(title, desc) {
  // Programme / eligibility are role designations → read from the TITLE only
  // (a passing "cadet programme available" in a description must not retag a
  // straight line job).
  const t = fold(String(title)).toLowerCase();
  const parts = [];
  if (/\baccelerated\s+command\b/.test(t)) parts.push('accel-command');
  if (/\b(cadet|ab[- ]?initio)\b/.test(t)) parts.push('cadet');
  if (/\bpath\s+to\s+command\b/.test(t)) parts.push('path-to-command');
  if (/\bcommand\s+(?:upgrade|course|programme|program)\b/.test(t)) parts.push('command-prog');
  // NB: "direct entry" is deliberately NOT a variant — it is a near-ubiquitous
  // "experienced hire" phrase, not a distinct programme, and would split real dups.
  let m;
  if ((m = t.match(/\bfor\s+(non[- ]?)?([a-z][a-z /&.'-]{1,30}?)\s+pilots?\s+only\b/))) parts.push('only:' + (m[1] ? 'non-' : '') + normKey(m[2]));
  // Rated status from the TITLE only — if the title doesn't state it, the status
  // is UNKNOWN (no token), so it will not merge with a row that states one. Bare
  // "rated" is not a signal (matches "highly rated employer").
  const nr = /\bnon[- ]?type[- ]?rated\b|\bnon[- ]?rated\b|\bnot\s+type[- ]?rated\b|\bntr\b/.test(t);
  // Test "rated" on text with the non-rated phrases removed, so "non-type rated"
  // (which contains the substring "type rated") is not also read as rated.
  const tr = t.replace(/\bnon[- ]?type[- ]?rated\b|\bnon[- ]?rated\b|\bnot\s+type[- ]?rated\b/g, ' ');
  const rr = /\btype[- ]?rated\b|\brated\s+on\s+type\b|\bcurrent\s+on\s+type\b/.test(tr);
  if (nr && !rr) parts.push('non-rated');
  else if (rr && !nr) parts.push('rated');
  return parts.sort().join('|');
}

// ── Employer resolver (conservative, title/description must NAME the airline) ─
// Airline names that are also common words/phrases are NEVER text-matched — only
// an exact company-name match resolves them. Returns a resolver with an audit log.
const COMMON_TOKENS = new Set(['jet', 'jets', 'time', 'air', 'airline', 'airlines', 'airways', 'aviation', 'global', 'flight', 'flights', 'crew', 'pool', 'group', 'services', 'service', 'charter', 'private', 'international', 'national', 'european', 'europe', 'world', 'fly', 'flying', 'first', 'second', 'officer', 'captain', 'pilot', 'pilots', 'the', 'and', 'of', 'for', 'new', 'go', 'now', 'sun', 'play', 'level', 'spirit', 'flair', 'breeze', 'norse', 'scoot', 'jazz', 'swoop', 'wizz', 'express', 'star', 'blue', 'red', 'wings', 'line', 'lines', 'travel', 'holdings', 'company', 'co', 'inc', 'ltd', 'llc', 'gmbh', 'sa', 'as']);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function makeResolver(airlines) {
  const byKey = new Map();
  const matchers = [];
  for (const a of airlines) {
    const base = (a.bases && a.bases[0]) || a.headquarters || null;
    const entry = { name: a.name, country: a.country || null, base };
    for (const k of new Set([normKey(a.name), legalKey(a.name)])) {
      if (k && k.length >= 3 && !COMMON_TOKENS.has(k) && !byKey.has(k)) byKey.set(k, entry); // never a bare common word like "jet"
    }
    const nm = String(a.name || '').trim();
    const tokens = fold(nm).toLowerCase().split(/\s+/);
    const distinctive = tokens.filter((w) => w.length >= 3 && !COMMON_TOKENS.has(w));
    if (nm.length >= 3 && distinctive.length >= 1) matchers.push({ entry, re: new RegExp('\\b' + esc(nm) + '\\b', 'i'), len: nm.length });
  }
  matchers.sort((x, y) => y.len - x.len);
  const audit = new Map(); // company → { airline, via }

  // `text` is the TITLE only — resolution must come from an airline named in the
  // title, never an incidental mention in the description (e.g. a "Pilot
  // Assessments" ad that references KLM in its body is NOT a KLM job). No partial
  // / prefix matching — "Silver Air, LLC" must never resolve to "Silver Airways".
  function resolve(company, text) {
    const ck = byKey.get(normKey(company)) || byKey.get(legalKey(company));
    if (ck) { audit.set(company, { airline: ck.name, via: 'company' }); return { ...ck, via: 'company' }; }
    const hit = matchers.find((mm) => mm.re.test(text));
    if (hit) { audit.set(company, { airline: hit.entry.name, via: 'title names airline' }); return { ...hit.entry, via: 'text' }; }
    return { name: company || '(unknown)', country: null, base: null, via: 'company-asis' };
  }
  return { resolve, audit };
}

// ── Recruiters / auto-merge safety gate ─────────────────────────────────────
// Agencies that post for MANY client airlines — two of their ads with the same
// type + country are NOT necessarily the same job (could be different clients).
const RECRUITER_RX = /\b(pilot\s*assessments|aviation\s*job\s*search|jobsearch|joinimagine|zenon|aeroprofessional|resource\s+group|rishworth|parc\s+aviation|brookfield|storm\s+aviation|climb\s+aviation|aviation\s+recruit\w*|recruit\w*\s+aviation|unknown\s+employer|confidential|undisclosed)\b/i;
function isRecruiter(company) { return RECRUITER_RX.test(fold(String(company || ''))); }

// Decide whether an identity cluster (array of { company, ident }) is safe to
// auto-merge. Certain = a member states an aircraft type OR resolved to an
// airline. NEVER auto-merge when every listing is a recruiter AND they do not
// share a hard airport (ICAO) base — different client airlines are possible.
function shouldAutoMerge(members) {
  const resolvedOp = members.some((m) => m.ident.employer.via && m.ident.employer.via !== 'company-asis');
  const anyType = members.some((m) => m.ident.types.length);
  if (!anyType && !resolvedOp) return false; // uncertain → leave live
  const allRecruiter = !resolvedOp && members.every((m) => isRecruiter(m.company));
  const hardBase = members.every((m) => m.ident.base.kind === 'icao');
  if (allRecruiter && !hardBase) return false; // recruiter-only + soft base → hold
  return true;
}

// ── Full identity ────────────────────────────────────────────────────────────
function identityOf(job, resolver) {
  const title = job.titleEn || job.title || '';
  const desc = (job.descriptionEn || job.description || '').slice(0, 800);
  const emp = resolver ? resolver.resolve(job.company, title) : { name: job.company, country: null, base: null, via: 'company-asis' };
  const rank = rankOf(title);
  // Identity type comes from the TITLE only. A job with no type in its title is
  // uncertain (→ never merged with a typed job); the description is too noisy for
  // identity (fleet lists), though baseOf may still read a base from it.
  const types = typesOf(title, '');
  const base = baseOf(title, desc, job.location, job.country);
  const variant = variantOf(title, desc);
  const key = [companyKey(emp.name), rank, types.join('+') || '?', base.base || '?', variant].join('|');
  return { employer: emp, rank, types, base, variant, key };
}

module.exports = { rankOf, typesOf, baseOf, variantOf, makeResolver, identityOf, normKey, companyKey, isRecruiter, shouldAutoMerge };
