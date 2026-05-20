'use strict';

/**
 * normalize.js — maps raw source payloads to NormalizedJob shapes.
 *
 * Requirement extraction is conservative: leave a field null rather than guess.
 * False positives in reqMinTotalHours etc. break matching badly (pilots get
 * marked as not meeting requirements they actually meet).
 */

const cheerio = require('cheerio');

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

/**
 * Extract a minimum hours figure from text near a keyword.
 * Conservative: requires a number directly adjacent to a known hours keyword.
 * Returns null if no confident match.
 *
 * @param {string} text
 * @param {string} keyword  regex fragment to anchor against
 * @returns {number|null}
 */
function extractHours(text, keyword) {
  // Pattern: "5,000 hours total time" or "total time: 5000 hours"
  const re = new RegExp(
    `(\\d[\\d,]*)\\s*(?:hours?|hrs?)[^.]*?${keyword}|${keyword}[^.]*?(\\d[\\d,]*)\\s*(?:hours?|hrs?)`,
    'i',
  );
  const m = text.match(re);
  if (!m) return null;
  const raw = (m[1] || m[2]).replace(/,/g, '');
  const val = parseFloat(raw);
  // Sanity bounds: ignore implausibly large or small values
  if (isNaN(val) || val < 10 || val > 50000) return null;
  return val;
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
      reqAuthorities: [], reqCertificates: [], reqAircraftTypes: [],
      reqMedicalClass: null, reqMinTotalHours: null, reqMinPicHours: null,
      reqMinMultiEngineHours: null, reqMinTurbineHours: null,
      reqMinInstrumentHours: null, reqWillingToRelocate: false,
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

  const reqAircraftTypes = [];
  for (const pattern of AIRCRAFT_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const normalised = m[1].replace(/[-\s]+/, '').toUpperCase();
      if (!reqAircraftTypes.includes(normalised)) reqAircraftTypes.push(normalised);
    }
  }

  const reqMedicalClass =
    /class\s*1\s+medical|first[-\s]class\s+medical|class\s+i\s+medical/i.test(text) ? 'CLASS_1' :
    /class\s*2\s+medical|second[-\s]class\s+medical|class\s+ii\s+medical/i.test(text) ? 'CLASS_2' : null;

  const reqMinTotalHours =
    extractHours(text, 'total') ||
    extractHours(text, 'flight\\s+time') ||
    extractHours(text, 'flying\\s+time');

  const reqMinPicHours =
    extractHours(text, 'PIC') ||
    extractHours(text, 'pilot[-\\s]+in[-\\s]+command') ||
    extractHours(text, 'command');

  const reqMinMultiEngineHours = extractHours(text, 'multi[-\\s]*engine');
  const reqMinTurbineHours     = extractHours(text, 'turbine');
  const reqMinInstrumentHours  = extractHours(text, 'instrument');

  const reqWillingToRelocate   = /reloca/i.test(text);

  return {
    reqAuthorities,
    reqCertificates,
    reqAircraftTypes,
    reqMedicalClass,
    reqMinTotalHours,
    reqMinPicHours,
    reqMinMultiEngineHours,
    reqMinTurbineHours,
    reqMinInstrumentHours,
    reqWillingToRelocate,
  };
}

// ─── HTML → plain text ────────────────────────────────────────────────────────

function htmlToText(html) {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('style, script').remove();
  return $.text().replace(/\s+/g, ' ').trim();
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
  };
}

/**
 * Normalize a raw job from any supported source.
 *
 * @param {import('./types').RawJob} raw
 * @param {object} empConfig
 * @returns {import('./types').NormalizedJob|null}  null if cannot be normalized
 */
function normalize(raw, empConfig) {
  try {
    switch (raw.sourcePlatform) {
      case 'LEVER':            return normalizeLever(raw, empConfig);
      case 'GREENHOUSE':       return normalizeGreenhouse(raw, empConfig);
      case 'WORKDAY':          return normalizeWorkday(raw, empConfig);
      case 'SMARTRECRUITERS':    return normalizeSmartRecruiters(raw, empConfig);
      case 'PILOTCAREERCENTRE':  return normalizePCC(raw, empConfig);
      default: return null;
    }
  } catch (err) {
    return null;
  }
}

module.exports = { normalize, extractRequirements, htmlToText };
