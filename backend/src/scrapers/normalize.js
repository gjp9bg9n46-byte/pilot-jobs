'use strict';

/**
 * normalize.js — maps raw source payloads to NormalizedJob shapes.
 *
 * Requirement extraction is conservative: leave a field null rather than guess.
 * False positives in reqMinTotalHours etc. break matching badly (pilots get
 * marked as not meeting requirements they actually meet).
 */

const cheerio = require('cheerio');
const logger = require('../config/logger');

// ─── Requirement extraction (shared by all sources) ───────────────────────────

const AUTHORITY_KEYWORDS = ['FAA', 'EASA', 'GCAA', 'CAAC', 'DGCA', 'CASA', 'TCCA', 'ANAC', 'JCAB', 'CAA', 'SACAA'];

// Ordered most-specific first so ATPL isn't shadowed by ATP
const CERT_PATTERNS = [
  { type: 'ATPL', re: /\bATPL\b/i },
  { type: 'ATP',  re: /\bATP\b/i },
  { type: 'CPL',  re: /\bCPL\b/i },
  { type: 'MPL',  re: /\bMPL\b/i },
  { type: 'IR',   re: /\bIR\b|\binstrument\s+rating\b/i },
  { type: 'ME',   re: /\bmulti[-\s]engine\s+rating\b/i },
];

// Legacy fleet-mention patterns — kept to populate reqAircraftTypes EXACTLY as before
// (Option 3: the deployed search/facets/airline readers must stay untouched). A new
// trigger-gated field (reqTypeRatings) is what the new matcher reads.
const AIRCRAFT_PATTERNS = [
  /\b(B7\d{2})\b/i,
  /\b(A\d{3}(?:-\d+)?)\b/i,   // A320, A320-200, A220
  /\b(ATR[-\s]?\d+)\b/i,
  /\b(CRJ[-\s]?\d+)\b/i,
  /\b(E\d{3})\b/i,             // E190, E175
  /\b(DHC[-\s]?\d+)\b/i,
  /\b(Q[-\s]?400)\b/i,
  /\b(Dash[-\s]?8)\b/i,
  /\b(Saab[-\s]?340)\b/i,
  /\b(PC[-\s]?12)\b/i,
];

// A single aircraft-type token (B737/A320/ATR72/CRJ900/E190/DHC8/Q400/Dash8/Saab340/
// PC12) for contextual scans.
const AIRCRAFT_TOKEN = /\b(B7\d{2}|A\d{3}(?:-\d+)?|ATR[-\s]?\d+|CRJ[-\s]?\d+|E\d{3}|DHC[-\s]?\d+|Q[-\s]?400|Dash[-\s]?8|Saab[-\s]?340|PC[-\s]?12)\b/ig;

// A type rating is a REQUIREMENT only when the ad frames it as one. A bare mention
// in a fleet list ("our fleet: B777, A380 & A350") must NOT create a type-rating
// requirement (change #1). We only accept an aircraft token when a trigger phrase
// sits within a short window on either side of it.
const TYPE_RATING_TRIGGER = /type[-\s]?rat|type[-\s]?qualif|rating\s+(?:on|for)|rated\s+(?:on|for|in)|current\s+on|qualified\s+on|endorse|checked?\s+out\s+on|hold[^.]{0,25}\brating\b/i;

/**
 * Extract aircraft TYPES that the ad states as a type-rating requirement. Returns []
 * when the only aircraft mentions are descriptive (fleet lists, company blurb).
 */
function extractTypeRatings(text) {
  const out = [];
  const add = (raw) => { const n = raw.replace(/[-\s]+/g, '').toUpperCase(); if (!out.includes(n)) out.push(n); };
  AIRCRAFT_TOKEN.lastIndex = 0;
  let m;
  while ((m = AIRCRAFT_TOKEN.exec(text)) !== null) {
    const i = m.index;
    const j = i + m[0].length;
    // Windows clipped at sentence boundaries so a trigger can't bleed across a
    // full stop / newline from an adjacent sentence (fleet list next to a rated-on line).
    let before = text.slice(Math.max(0, i - 60), i);
    const lastBoundary = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf('\n'), before.lastIndexOf(';'));
    if (lastBoundary >= 0) before = before.slice(lastBoundary + 1);
    let after = text.slice(j, j + 60);
    const nextBoundary = after.search(/[.!?\n;]/);
    if (nextBoundary >= 0) after = after.slice(0, nextBoundary);
    if (TYPE_RATING_TRIGGER.test(before) || TYPE_RATING_TRIGGER.test(after)) add(m[1]);
  }
  return out;
}

// "total" is the career total UNLESS it's an adjective of a more-specific field —
// "total night flying" (night), "total PIC" (command). So match bare "total" only
// when it is NOT immediately followed by such a field word; plus the explicit
// "flight/flying time|hours" phrasings. This catches "total time", "2,000 hours
// total", "total Fixed Wing time" while rejecting "total night flying". (change #3)
const TOTAL_RE = /\btotal\b(?!\s+(?:night|pic|p1|command|multi|twin|turbine|turbo|jet|instrument|ifr|cross|xc)\b)|\bflight\s*(?:time|hours)\b|\bflying\s*(?:time|hours)\b/i;
const HOUR_FIELDS = [
  ['total', TOTAL_RE],
  ['pic', /\bPIC\b|\bP1\b|pilot[-\s]?in[-\s]?command|\bPICUS\b|command\s+time/i],
  ['multi', /multi[-\s]?engine|\bMEL?\b|twin[-\s]?engine/i],
  ['turbine', /turbine|turbojet|turbo[-\s]?prop|jet\s*(?:time|hours)/i],
  ['instrument', /\binstrument\b|\bIFR\b/i],
  ['xc', /cross[-\s]?country|\bXC\b/i],
];
// Numbers in these contexts are pay/roster/recency figures, never career minima —
// "average of 85 flying hours", "within the last 12 months", salary packages.
const HOUR_NEG = /average|per\s+month|per\s+week|monthly|salary|take[-\s]?home|package|annual\s+leave|calendar\s+days|accommodation|within\s+the\s+(?:past|last)/i;

/**
 * Aircraft the job FLIES — for search, filter and display (condition B). Union of
 * aircraft tokens in the title (+ titleEn) and the rated requirement. Deliberately
 * NO description-body fleet parsing. `reqAircraftTypes` (rating required) stays the
 * matching-only field; this is the broader display/search field.
 */
function deriveAircraftTypes(title, reqAircraftTypes) {
  const out = [];
  const add = (raw) => { const n = String(raw).replace(/[-\s]+/g, '').toUpperCase(); if (n && !out.includes(n)) out.push(n); };
  AIRCRAFT_TOKEN.lastIndex = 0;
  let m;
  const t = String(title || '');
  while ((m = AIRCRAFT_TOKEN.exec(t)) !== null) add(m[1]);
  for (const r of (reqAircraftTypes || [])) add(r);
  return out;
}

/**
 * Extract minimum-hour requirements per field. Clause-scoped with NEAREST-keyword
 * assignment: each number is attached to the closest field keyword within a tight
 * window (label-before-number preferred), so a flattened bullet run like
 * "3000 hours total time 1000 hours PIC" splits correctly instead of letting one
 * field steal another's number. Conservative — a figure with no nearby keyword, or
 * out of the 10–20,000 sanity range, is dropped. First value per field wins.
 *
 * @param {string} text
 * @returns {{total:?number,pic:?number,multi:?number,turbine:?number,instrument:?number,xc:?number}}
 */
function extractHourRequirements(text) {
  const out = { total: null, pic: null, multi: null, turbine: null, instrument: null, xc: null };
  if (!text) return out;
  const clauses = text.replace(/\s+/g, ' ').split(/[.;\n•|]+|,(?=\s)/);
  for (const clause of clauses) {
    // 1. All field-keyword occurrences in the clause (a keyword may repeat).
    const kws = [];
    for (const [field, re] of HOUR_FIELDS) {
      const gre = new RegExp(re.source, 'ig');
      let mm;
      while ((mm = gre.exec(clause)) !== null) {
        if (mm[0] === '') { gre.lastIndex += 1; continue; }
        kws.push({ field, ks: mm.index, ke: mm.index + mm[0].length });
      }
    }
    // 2. Each number binds to a label. Lists are overwhelmingly "N hours LABEL"
    //    (label FOLLOWS), e.g. "3,500 hours total flight time 2,000 hours PIC"; the
    //    exception is a colon form "LABEL : N hours" (label PRECEDES). So: take the
    //    following label unless a colon separates a preceding label from the number.
    const reNum = /(\d[\d,]*)\s*\+?\s*(?:hours?|hrs?|h\b)?/ig;
    let m;
    while ((m = reNum.exec(clause)) !== null) {
      if (!m[0].trim()) { reNum.lastIndex += 1; continue; }
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (isNaN(val) || val < 10 || val > 20000) continue;
      // Skip digits that are part of an aircraft/type code — a letter immediately
      // abutting the digits (G600/A320/B737, or 20T/737NG). A letter right after the
      // digits only disqualifies when it's NOT an hours unit, so "100hrs" survives but
      // "20T" is dropped; a space or label after the digits ("500 Total") is fine.
      const s = m.index, e = s + m[1].length;
      const prevCh = clause[s - 1];
      const afterDigits = clause.slice(e);
      const nextCh = afterDigits[0];
      const isUnit = /^\s*(?:hours?|hrs?|h)\b/i.test(afterDigits);
      if ((prevCh && /[A-Za-z]/.test(prevCh)) || (nextCh && /[A-Za-z]/.test(nextCh) && !isUnit)) continue;
      if (HOUR_NEG.test(clause.slice(Math.max(0, s - 28), Math.min(clause.length, e + 28)))) continue;
      // Nearest preceding and following keyword.
      let pre = null, fol = null;
      for (const k of kws) {
        if (k.ke <= s) { const g = s - k.ke; if (!pre || g < pre.gap) pre = { field: k.field, gap: g, ke: k.ke }; }
        else if (k.ks >= e) { const g = k.ks - e; if (!fol || g < fol.gap) fol = { field: k.field, gap: g }; }
      }
      const preColon = pre && pre.gap <= 28 && /:/.test(clause.slice(pre.ke, s));
      let chosen = null;
      if (preColon) chosen = pre;              // "Total flight time : 3000 hours"
      else if (fol && fol.gap <= 25) chosen = fol; // "3,500 hours total flight time"
      else if (pre && pre.gap <= 28) chosen = pre;
      if (chosen && out[chosen.field] == null) out[chosen.field] = val;
    }
  }
  return out;
}

/**
 * Extract structured requirements from a plain-text job description.
 *
 * @param {string} text
 * @returns {Partial<import('./types').NormalizedJob>}
 */
function extractRequirements(text) {
  if (!text) {
    return {
      reqAuthorities: [], reqCertificates: [], reqAircraftTypes: [], reqTypeRatings: [],
      reqMedicalClass: null, reqMinTotalHours: null, reqMinPicHours: null,
      reqMinMultiEngineHours: null, reqMinTurbineHours: null,
      reqMinInstrumentHours: null, reqMinCrossCountryHours: null,
      reqEducation: null, reqWorkAuthorization: null, reqEnglishLevel: null,
      reqWillingToRelocate: false,
    };
  }

  const upper = text.toUpperCase();

  const reqAuthorities = AUTHORITY_KEYWORDS.filter((a) => {
    // Match whole-word to avoid "GCAA" matching "GCAA-style" or partial tokens
    return new RegExp(`\\b${a}\\b`).test(upper);
  });

  const reqCertificates = CERT_PATTERNS
    .filter(({ re }) => re.test(text))
    .map(({ type }) => type);

  // LEGACY field, unchanged behaviour — fleet-list mentions included (deployed
  // search/facets/airline pages read this; do not alter). First match per pattern.
  const reqAircraftTypes = [];
  for (const pattern of AIRCRAFT_PATTERNS) {
    const mm = text.match(pattern);
    if (mm) {
      const normalised = mm[1].replace(/[-\s]+/, '').toUpperCase();
      if (!reqAircraftTypes.includes(normalised)) reqAircraftTypes.push(normalised);
    }
  }
  // NEW field — only type ratings the ad states as a REQUIREMENT (trigger-gated, #1).
  // The new matcher reads this; never fleet-list mentions.
  const reqTypeRatings = extractTypeRatings(text);

  const reqMedicalClass =
    /class\s*1\s+medical|first[-\s]class\s+medical|class\s+i\s+medical|1st\s+class\s+medical/i.test(text) ? 'CLASS_1' :
    /class\s*2\s+medical|second[-\s]class\s+medical|class\s+ii\s+medical|2nd\s+class\s+medical/i.test(text) ? 'CLASS_2' : null;

  // Minimum-hour requirements — nearest-keyword, clause-scoped (change #3).
  const hours = extractHourRequirements(text);
  const reqMinTotalHours = hours.total;
  const reqMinPicHours = hours.pic;
  const reqMinMultiEngineHours = hours.multi;
  const reqMinTurbineHours = hours.turbine;
  const reqMinInstrumentHours = hours.instrument;
  const reqMinCrossCountryHours = hours.xc;

  // Education: bachelor → high_school (most-specific first to avoid shadowing)
  const reqEducation =
    /bachelor'?s?\s+degree|university\s+degree|college\s+degree|higher\s+education|degree\s+required/i.test(text) ? 'bachelor' :
    /high\s+school\s+(?:diploma|graduate|education)|secondary\s+school\s+diploma|\bGED\b/i.test(text) ? 'high_school' :
    /technical\s+(?:diploma|certificate)|vocational\s+training|trade\s+school/i.test(text) ? 'technical' :
    null;

  // US citizenship / federal-service eligibility — these ARE a US work-authorisation
  // requirement (condition #1). Only US-SPECIFIC markers: Title 32 / National Guard /
  // excepted service / USAJobs "open continuous announcement" / US Reserve components /
  // explicit US-citizen wording. NOT bare "citizenship required" (could be any country).
  const US_ELIGIBILITY = /u\.?s\.?\s*citizen|united\s+states\s+citizen|must\s+be\s+a\s+u\.?s\.?\s+citizen|\btitle\s*32\b|national\s+guard|dual[-\s]?status|excepted\s+service|open\s+continuous\s+announcement|air\s+(?:force\s+)?reserve|army\s+reserve|air\s+reserve\s+technician/i;
  // "security clearance" is ambiguous (Gulf/UK/AU ads say "subject to security
  // clearance"; an Australia role may accept "UK, US, or Canada" candidates) — count
  // it as US ONLY when US-CITIZEN wording sits in the same clause (A), never a bare
  // "US" that might be one item in a multi-country list.
  const US_CLEARANCE_CTX = /security\s+clearance[^.;\n]{0,70}(?:u\.?s\.?|united\s+states)\s+citizen|(?:u\.?s\.?|united\s+states)\s+citizen[^.;\n]{0,70}security\s+clearance/i;

  // Work authorization — ordered EU/US/UK first, generic "required" as last resort
  const reqWorkAuthorization =
    /right\s+to\s+(?:live\s+and\s+)?work\s+in\s+(?:the\s+)?eu\b|unrestricted\s+right.{0,30}\beu\b|eu\s+work\s+(?:auth|permit)/i.test(text) ? 'EU' :
    /right\s+to\s+work\s+in\s+(?:the\s+)?(?:united\s+states|u\.?s\.?a?)\b|auth(?:orization)?\s+to\s+work\s+in\s+(?:the\s+)?(?:united\s+states|u\.?s\.?)\b|eligible\s+to\s+work\s+in\s+(?:the\s+)?u\.?s\.?\b|without\s+visa\s+sponsorship/i.test(text) ? 'US' :
    (US_ELIGIBILITY.test(text) || US_CLEARANCE_CTX.test(text)) ? 'US' :
    /right\s+to\s+(?:live\s+and\s+)?work\s+in\s+(?:the\s+)?uk\b|uk\s+work\s+(?:auth|permit)/i.test(text) ? 'UK' :
    /\bright\s+to\s+work\b|work\s+(?:permit|authoris?ation)\s+required|must\s+(?:be\s+)?(?:authoris?ed|eligible)\s+to\s+work/i.test(text) ? 'required' :
    null;

  // ICAO English level — "ICAO Level 4", "ICAO Language Proficiency English - Minimum Level 4",
  // "ICAO Language Proficiency English (at least ICAO level 4)", etc.
  // Primary: any "ICAO ... level N" within the same line/sentence.
  // Fallback: "English [Language] Proficiency ... level N" without an explicit ICAO marker.
  const englishMatch =
    text.match(/ICAO[^.\n]{0,120}?level\s+(\d)/i) ||
    text.match(/english\s+(?:language\s+)?proficiency[^.\n]{0,80}?level\s+(\d)/i);
  const reqEnglishLevel = englishMatch ? (() => {
    const lvl = parseInt(englishMatch[1]);
    return (lvl >= 1 && lvl <= 6) ? lvl : null;
  })() : null;

  const reqWillingToRelocate = /reloca/i.test(text);

  return {
    reqAuthorities,
    reqCertificates,
    reqAircraftTypes,
    reqTypeRatings,
    reqMedicalClass,
    reqMinTotalHours,
    reqMinPicHours,
    reqMinMultiEngineHours,
    reqMinTurbineHours,
    reqMinInstrumentHours,
    reqMinCrossCountryHours,
    reqEducation,
    reqWorkAuthorization,
    reqEnglishLevel,
    reqWillingToRelocate,
  };
}

// ─── Salary extraction ───────────────────────────────────────────────────────

const _MAX_ANNUAL = 1_000_000;

function _parseNum(s) {
  const clean = s.replace(/,/g, '').trim();
  if (/[kK]$/.test(clean)) return parseFloat(clean) * 1000;
  return parseFloat(clean);
}

function _detectCurrency(prefix) {
  const p = (prefix || '').trim();
  if (/^C\$/.test(p) || /^CAD/i.test(p)) return 'CAD';
  if (/^A\$/.test(p) || /^AUD/i.test(p)) return 'AUD';
  if (/^S\$/.test(p) || /^SGD/i.test(p)) return 'SGD';
  if (/^€/.test(p)   || /^EUR/i.test(p)) return 'EUR';
  if (/^£/.test(p)   || /^GBP/i.test(p)) return 'GBP';
  return 'USD';
}

function _detectPeriod(ctx) {
  if (/\/(year|yr|annum)\b|per\s+(year|yr|annum)\b|annually\b|per\s+annum\b/i.test(ctx)) return 'year';
  if (/\/month\b|per\s+month\b|monthly\b/i.test(ctx)) return 'month';
  if (/\/hour\b|per\s+hour\b|hourly\b/i.test(ctx))   return 'hour';
  return 'year';
}

/**
 * Extract salary from plain-text job description.
 * Conservative: returns null when no confident match.
 * Sanity cap: rejects any value > $1M/year equivalent.
 *
 * Handles: $280k–$302k  $250,000 – $290,000  €60,000  £50k  CAD 80k
 *          up to $150k  from $80,000  starting at $100k/year
 *
 * @param {string} text
 * @returns {{ salaryMin: number|null, salaryMax: number|null, salaryCurrency: string, salaryPeriod: string }|null}
 */
function extractSalary(text) {
  if (!text || typeof text !== 'string') return null;

  const N   = '\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?[kK]?|\\d+[kK]';
  const C   = '(?:C\\$|A\\$|S\\$|CAD\\s*|AUD\\s*|SGD\\s*|EUR\\s*|GBP\\s*|[€£\\$])';
  const SEP = '\\s*(?:–|—|to|-)\\s*';
  const DIR = '(?:(up\\s+to|from|starting\\s+(?:at|from))\\s+)?';
  const re  = new RegExp(`${DIR}(${C})(${N})(?:${SEP}(?:${C})?(${N}))?`, 'gi');

  let best = null;
  let m;
  while ((m = re.exec(text)) !== null) {
    const dir      = (m[1] || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const currency = _detectCurrency(m[2]);
    const v1       = _parseNum(m[3]);
    const v2       = m[4] ? _parseNum(m[4]) : null;
    if (isNaN(v1) || (v2 !== null && isNaN(v2))) continue;

    let salaryMin = null, salaryMax = null;
    if (dir.includes('up to'))                               { salaryMax = v1; }
    else if (dir.includes('from') || dir.includes('starting')) { salaryMin = v1; }
    else if (v2 != null)                                     { salaryMin = Math.min(v1, v2); salaryMax = Math.max(v1, v2); }
    else                                                     { salaryMin = v1; salaryMax = v1; }

    const ctx    = text.slice(Math.max(0, m.index - 20), Math.min(text.length, m.index + m[0].length + 80));
    const period = _detectPeriod(ctx);

    const refVal = salaryMax ?? salaryMin;
    const annual = period === 'month' ? refVal * 12 : period === 'hour' ? refVal * 2000 : refVal;
    if (annual < 10_000 || annual > _MAX_ANNUAL) continue;

    const isRange    = v2 != null;
    const prevRange  = best && best.salaryMin != null && best.salaryMax != null;
    if (!best || (isRange && !prevRange)) {
      best = { salaryMin, salaryMax, salaryCurrency: currency, salaryPeriod: period };
    }
  }
  return best;
}

// ─── HTML → plain text ────────────────────────────────────────────────────────

// Convert HTML to STRUCTURED plain text — preserves paragraph breaks and bullet
// lists (as "• ") instead of collapsing everything to one blob. The old version
// did .replace(/\s+/g,' '), which ran headings into body ("OverviewThe Flight
// Test Pilot...") and flattened every list. Output is newline-delimited plain
// text; the clients render blank-line-separated paragraphs and "• " lines as
// bullet lists (no HTML stored, no sanitisation surface).
function htmlToText(html) {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('style, script, noscript').remove();
  $('li').each((_, el) => { $(el).prepend('• ').append('\n'); });
  $('br').replaceWith('\n');
  $('p, div, ul, ol, tr, h1, h2, h3, h4, h5, h6, section, article, header, footer, blockquote')
    .each((_, el) => { $(el).append('\n'); });
  return $.text()
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')   // collapse spaces/tabs, but NOT newlines
    .replace(/ *\n */g, '\n')        // trim whitespace around line breaks
    .replace(/\n{3,}/g, '\n\n')      // at most one blank line between blocks
    .trim();
}

// ─── Country extraction ───────────────────────────────────────────────────────

function guessCountry(location) {
  if (!location) return null;
  const parts = location.split(',').map((p) => p.trim());
  return parts[parts.length - 1] || null;
}

// ─── Per-source normalizers ───────────────────────────────────────────────────

/**
 * @param {object}  raw        Lever posting object
 * @param {object}  empConfig  Employer config entry
 * @returns {import('./types').NormalizedJob}
 */
function normalizeLever(raw, empConfig) {
  const descHtml = [raw.description, ...(raw.lists || []).map((l) => l.content)].join(' ');
  const description = htmlToText(descHtml);
  const location = raw.categories?.location || '';

  return {
    sourcePlatform: 'LEVER',
    externalId: raw.id,
    title: (raw.text || '').trim(),
    company: empConfig.company,
    location,
    country: guessCountry(location),
    description,
    applyUrl: raw.hostedUrl,
    sourceUrl: raw.hostedUrl,
    postedAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
    expiresAt: null,
    role: null,
    contractType: null,
    region: raw.categories?.team || null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    ...extractRequirements(description),
    ...(extractSalary(description) || {}),
  };
}

/**
 * @param {object}  raw        Greenhouse job object
 * @param {object}  empConfig
 * @returns {import('./types').NormalizedJob}
 */
function normalizeGreenhouse(raw, empConfig) {
  // Greenhouse updated_at is used because created_at is not always present on
  // the /v1/boards/{slug}/jobs endpoint — see note in sources/greenhouse.js.
  const description = htmlToText(raw.content || '');
  const location = raw.location?.name || '';

  return {
    sourcePlatform: 'GREENHOUSE',
    externalId: String(raw.id),
    title: (raw.title || '').trim(),
    company: empConfig.company,
    location,
    country: guessCountry(location),
    description,
    applyUrl: raw.absolute_url,
    sourceUrl: raw.absolute_url,
    postedAt: raw.updated_at ? new Date(raw.updated_at) : new Date(),
    expiresAt: null,
    role: null,
    contractType: null,
    region: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    ...extractRequirements(description),
    ...(extractSalary(description) || {}),
  };
}

/**
 * @param {object}  raw        Workday job object (list-scrape, minimal fields)
 * @param {object}  empConfig
 * @returns {import('./types').NormalizedJob}
 */
function normalizeWorkday(raw, empConfig) {
  // Workday list scrapes typically don't visit detail pages, so description
  // is empty or minimal — matching quality will be lower for these jobs.
  const description = (raw.description || '').trim();
  const location = (raw.location || '').trim();

  return {
    sourcePlatform: 'WORKDAY',
    externalId: raw.externalId || raw.id,
    title: (raw.title || '').trim(),
    company: empConfig.company,
    location,
    country: guessCountry(location),
    description,
    applyUrl: raw.applyUrl,
    sourceUrl: raw.applyUrl,
    postedAt: raw.postedAt ? new Date(raw.postedAt) : new Date(),
    expiresAt: null,
    role: null,
    contractType: null,
    region: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    ...extractRequirements(description),
  };
}

/**
 * @param {object}  raw        PilotCareerCentre raw object
 * @param {object}  empConfig
 * @returns {import('./types').NormalizedJob}
 */
function normalizePCC(raw, empConfig) {
  const { _position, _aircraftRaw, _airline, _urlRegion, _applyUrl, _detailUrl } = raw;

  // Parse aircraft field: "Boeing 787 - Schiphol" → { aircraft: "Boeing 787", city: "Schiphol" }
  const idx = (_aircraftRaw || '').lastIndexOf(' - ');
  const aircraftStr = idx >= 0 ? _aircraftRaw.slice(0, idx).trim() : (_aircraftRaw || '').trim();
  const city        = idx >= 0 ? _aircraftRaw.slice(idx + 3).trim() : '';

  // Try to extract a standard aircraft code
  const normAircraft = normaliseAircraft(aircraftStr);
  const reqAircraftTypes = normAircraft ? [normAircraft] : [];

  // Region → our label
  const REGION_MAP = {
    'europe-uk': 'Europe', 'usa': 'Americas', 'mena': 'Middle East',
    'apac': 'Asia Pacific', 'africa': 'Africa', 'latin-america': 'Latin America',
  };
  const region = REGION_MAP[(_urlRegion || '').toLowerCase()] || null;

  // Location: "City, Region" or just the city
  const location = city ? (region ? `${city}, ${region}` : city) : (region || '');

  // Role from position text
  const posLower = (_position || '').toLowerCase();
  let role = null;
  if (posLower.includes('captain') || posLower.includes('command') || posLower.includes('pic')) role = 'CAPTAIN';
  else if (posLower.includes('first officer') || posLower.includes('f/o') || posLower.includes(' fo') || posLower.includes('sic') || posLower.includes('second') || posLower.includes('copilot') || posLower.includes('co-pilot')) role = 'FIRST_OFFICER';
  else if (posLower.includes('instructor') || posLower.includes('training')) role = 'INSTRUCTOR';

  // Synthesise description from structured fields
  const description = [
    `${_airline} is recruiting ${_position}.`,
    aircraftStr ? `Aircraft: ${aircraftStr}.` : '',
    city ? `Base: ${city}.` : '',
    region ? `Region: ${region}.` : '',
  ].filter(Boolean).join(' ');

  return {
    sourcePlatform: 'PILOTCAREERCENTRE',
    externalId: raw.externalId,
    title: `${_position} – ${aircraftStr || _airline}`,
    company: _airline,
    location,
    country: guessCountry(location),
    description,
    applyUrl: _applyUrl || _detailUrl,   // real airline URL, falls back to PCC detail
    sourceUrl: _detailUrl,               // always the PCC page for attribution
    postedAt: new Date(),
    expiresAt: null,
    role,
    contractType: null,
    region,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    reqCertificates: [],
    reqAuthorities: [],
    reqAircraftTypes,
    reqMedicalClass: null,
    reqMinTotalHours: null,
    reqMinPicHours: null,
    reqMinMultiEngineHours: null,
    reqMinTurbineHours: null,
    reqMinInstrumentHours: null,
    reqWillingToRelocate: false,
  };
}

// Aircraft normaliser used by normalizePCC
function normaliseAircraft(aircraft) {
  const t = (aircraft || '').toUpperCase().replace(/[-\s]/g, '');
  const a = (aircraft || '').toUpperCase();
  if (/BOEING\s*7[0-9]{2}/.test(a) || /B7[0-9]{2}/.test(t)) {
    const m = (a + t).match(/7([0-9]{2})/);
    return m ? `B7${m[1]}` : null;
  }
  if (/A[23][0-9]{2}/.test(t)) { const m = t.match(/(A[23][0-9]{2})/); return m ? m[1] : null; }
  if (/ATR/.test(t)) { const m = t.match(/ATR[\s-]?(\d+)/i); return m ? `ATR${m[1]}` : 'ATR'; }
  if (/E[0-9]{3}/.test(t)) { const m = t.match(/(E[0-9]{3})/); return m ? m[1] : null; }
  return null;
}

/**
 * @param {object}  raw        SmartRecruiters raw object (has _summary and _detail)
 * @param {object}  empConfig
 * @returns {import('./types').NormalizedJob}
 */
function normalizeSmartRecruiters(raw, empConfig) {
  const summary = raw._summary || {};
  const detail  = raw._detail  || {};

  // Description comes from jobAd sections (HTML)
  const sections = detail.jobAd?.sections || {};
  const descParts = [
    sections.companyDescription?.text,
    sections.jobDescription?.text,
    sections.qualifications?.text,
    sections.additionalInformation?.text,
  ].filter(Boolean);
  const description = htmlToText(descParts.join('\n'));

  const loc = summary.location || {};
  // SR uses ISO 2-letter country codes; keep the city+country string for display
  const locationParts = [loc.city, loc.region, loc.country].filter(Boolean);
  const location = locationParts.join(', ');

  // Map SR employment type labels to our ContractType enum values
  const typeLabel = (summary.typeOfEmployment?.label || '').toLowerCase();
  let contractType = null;
  if (typeLabel.includes('permanent') || typeLabel.includes('full')) contractType = 'PERMANENT';
  else if (typeLabel.includes('contract') || typeLabel.includes('fixed')) contractType = 'CONTRACT';
  else if (typeLabel.includes('freelance') || typeLabel.includes('self')) contractType = 'FREELANCE';
  else if (typeLabel.includes('part')) contractType = 'PART_TIME';

  const applyUrl = summary.applyUrl || `https://jobs.smartrecruiters.com/${empConfig.slug}/${raw.externalId}`;

  return {
    sourcePlatform: 'SMARTRECRUITERS',
    externalId: raw.externalId,
    title: (summary.name || detail.name || '').trim(),
    company: empConfig.company,
    location,
    country: loc.country || guessCountry(location),
    description,
    applyUrl,
    sourceUrl: applyUrl,
    postedAt: summary.releasedDate ? new Date(summary.releasedDate) : new Date(),
    expiresAt: null,
    role: null,
    contractType,
    region: summary.department?.label || null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    ...extractRequirements(description),
    ...(extractSalary(description) || {}),
  };
}

/**
 * Normalize a raw job from any supported source.
 *
 * @param {import('./types').RawJob} raw
 * @param {object} empConfig
 * @returns {import('./types').NormalizedJob|null}  null if cannot be normalized
 */
// Sources whose fetchers ALREADY emit NormalizedJob shapes → pass straight
// through. EVERY source in runner.js dispatch needs a home here (this set or
// NORMALIZERS below) or its jobs are silently dropped before upsert — the bug
// that zeroed WhatJobs + 10 others. normalize-coverage.test.js asserts this.
const PRENORMALIZED = new Set([
  'WORKDAY_REST', 'MAGELLAN', 'USAJOBS', 'ADZUNA', 'JOOBLE', 'CAREERJET',
  'AVIATIONJOBSEARCH', 'ICIMS', 'AVATURE', 'JIBE', 'TALEO', 'PHENOM',
  'RECRUITEE', 'TEAMTAILOR', 'ASHBY', 'BAMBOOHR', 'PERSONIO', 'BREEZY',
  'TRAFFIT', 'REED', 'WHATJOBS',
]);
// Sources needing a real field-mapping normaliser.
const NORMALIZERS = {
  LEVER: normalizeLever,
  GREENHOUSE: normalizeGreenhouse,
  WORKDAY: normalizeWorkday,
  SMARTRECRUITERS: normalizeSmartRecruiters,
  PILOTCAREERCENTRE: normalizePCC,
};

// Loud, once-per-source record of any sourcePlatform with NO handling path. The
// runner drains this into the zero-result alert (email + warn) so an unmapped
// source can never AGAIN silently discard every job it fetched.
const _unmappedSources = new Set();
function takeUnmappedSources() { const a = [..._unmappedSources]; _unmappedSources.clear(); return a; }
/** Every source normalize() can handle — used by the coverage test. */
function normalizeHandledSources() { return new Set([...PRENORMALIZED, ...Object.keys(NORMALIZERS)]); }

function normalize(raw, empConfig) {
  const sp = raw && raw.sourcePlatform;
  try {
    if (PRENORMALIZED.has(sp)) return raw;
    if (NORMALIZERS[sp]) return NORMALIZERS[sp](raw, empConfig);
  } catch (err) {
    return null; // a mapper threw on one malformed row — drop just that row
  }
  // No handling path for this source → its jobs would be silently dropped.
  const key = sp || '(none)';
  if (!_unmappedSources.has(key)) {
    _unmappedSources.add(key);
    logger.error({ source: key, msg: `normalize: no case for source ${key} — jobs would be dropped. Add it to PRENORMALIZED or NORMALIZERS in normalize.js.` });
  }
  return null;
}


/** True when a normalized/stored job carries at least one structured requirement. */
function hasAnyRequirement(job) {
  return (
    (job.reqCertificates?.length || 0) > 0 ||
    (job.reqAuthorities?.length || 0) > 0 ||
    (job.reqAircraftTypes?.length || 0) > 0 ||
    job.reqMinTotalHours != null || job.reqMinPicHours != null ||
    job.reqMinMultiEngineHours != null || job.reqMinTurbineHours != null ||
    job.reqMinInstrumentHours != null || job.reqMinCrossCountryHours != null ||
    job.reqMedicalClass != null || job.reqEducation != null ||
    job.reqWorkAuthorization != null || job.reqEnglishLevel != null
  );
}

// ─── Verbatim requirements block ────────────────────────────────────────────
// Find the posting's OWN requirements/qualifications section in a full,
// structured description and return it verbatim (heading dropped, bullets kept).
// Preferred over regex-synthesised fields on the job page. Returns null when no
// real (≥2-item) block is present — the honesty gate then applies.
const REQ_HEADING = new RegExp(
  '^(?:the\\s+)?(?:minimum|preferred|specific|essential|basic|general|key|mandatory)?\\s*'
  + '(?:requirements?|qualifications?|eligibility|criteria)\\b'
  + '|^(?:to\\s+be\\s+(?:eligible|considered)|what\\s+you\'?ll\\s+need|what\\s+we\'?re\\s+looking\\s+for'
  + '|you\\s+(?:will|must)\\s+(?:need|have|possess)|candidate\\s+profile|who\\s+you\\s+are|about\\s+you'
  + '|skills\\s*(?:&|and|/)?\\s*(?:experience|talents)?)\\b'
  + '|must\\s+meet\\s+all\\s+the\\s+following',
  'i',
);
const REQ_HEADING_EXCLUDE = /responsibilit|duties|benefit|what\s+we\s+offer|overview|about\s+(?:us|the\s+(?:company|role|team|position))|the\s+company|package|why\s+/i;
// A short title-ish line = a new section boundary.
const SECTION_HEADING = /^[A-Z0-9][A-Za-z0-9 /&'’,()+-]{1,48}:?\s*$/;

function extractRequirementsBlock(description) {
  const text = String(description || '');
  if (text.length < 200) return null; // need a real (non-snippet) description
  const lines = text.split('\n').map((l) => l.replace(/<[^>]+>/g, '').trim());

  const isBullet = (l) => /^[•\-–—*·▪◦‣]\s+/.test(l) || /^\d+[.)]\s+/.test(l);
  const norm = (l) => l.replace(/^[•\-–—*·▪◦‣]\s+/, '• ').replace(/^\d+[.)]\s+/, '• ');

  for (let i = 0; i < lines.length; i++) {
    const head = lines[i];
    if (!head || head.length > 60) continue;
    if (!REQ_HEADING.test(head) || REQ_HEADING_EXCLUDE.test(head)) continue;

    // Skip blanks, then the section MUST begin with a bullet — otherwise it's a
    // prose section, not a real requirements list; keep looking for a better one.
    let k = i + 1;
    while (k < lines.length && !lines[k]) k++;
    if (k >= lines.length || !isBullet(lines[k])) continue;

    // Collect the consecutive bullet list (allowing a wrapped continuation line
    // that clearly belongs to the previous bullet — short, lower-case start).
    const block = [];
    for (; k < lines.length && block.length < 30; k++) {
      const l = lines[k];
      if (!l) break;
      if (isBullet(l)) { block.push(norm(l)); continue; }
      if (block.length && l.length < 90 && /^[a-z(]/.test(l)) { block[block.length - 1] += ` ${l}`; continue; }
      break; // first real non-bullet line ends the list
    }
    if (block.length >= 2) return block.join('\n');
  }
  return null;
}

module.exports = {
  hasAnyRequirement, normalize, extractRequirements, extractSalary, htmlToText,
  extractRequirementsBlock, normalizeHandledSources, takeUnmappedSources,
  deriveAircraftTypes };
