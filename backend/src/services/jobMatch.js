'use strict';

// Shared job↔pilot match — the single source of truth used by the jobs list, the
// job detail, the "Qualified only" filter, the Alerts matcher and the Logbook
// milestone hook, so the numbers agree everywhere (guardrail 1).
//
// The core rule (Part 0c): three-state per requirement.
//   met     — the pilot has a real value that satisfies the job's requirement
//   unmet   — the pilot has a real value that FALLS SHORT
//   unknown — the pilot has NO data for it (never logged / not on profile);
//             NOT a failure. Missing data is never counted as unmet.
// fitGroup: qualify = 0 unmet (unknowns allowed), oneShort = exactly 1 unmet,
// other = everything else.

const { getPilotFlightTotals, getQualifiedMedicalClasses } = require('./matchingService');
const { EDU_RANK, parseElpLevel } = require('../lib/eduRank');

// ── Region (derived from the job's country) ──────────────────────────────────
const MIDDLE_EAST = new Set(['united arab emirates', 'uae', 'ae', 'qatar', 'qa', 'saudi arabia', 'ksa', 'sa', 'bahrain', 'bh', 'kuwait', 'kw', 'oman', 'om', 'jordan', 'jo', 'lebanon', 'lb', 'israel', 'il', 'iraq', 'iq', 'egypt', 'egitto', 'egypte', 'eg', 'turkey', 'türkiye', 'tr', 'syria', 'sy', 'yemen', 'ye', 'iran', 'ir']);
// North America = US + Canada (merged tab; no separate "United States").
const NORTH_AMERICA = new Set(['united states', 'usa', 'us', 'u.s.', 'united states of america', 'america', 'canada', 'ca']);
const ASIA_PACIFIC = new Set(['china', 'cn', 'hong kong', 'hk', 'japan', 'jp', 'south korea', 'korea', 'kr', 'singapore', 'sg', 'malaysia', 'my', 'thailand', 'th', 'vietnam', 'vn', 'indonesia', 'id', 'philippines', 'ph', 'india', 'in', 'pakistan', 'pk', 'australia', 'au', 'new zealand', 'nz', 'taiwan', 'tw', 'cambodia', 'kh', 'macau', 'mo', 'brunei', 'bn', 'sri lanka', 'lk', 'bangladesh', 'bd', 'nepal', 'np', 'maldives', 'mv']);
const EUROPE = new Set(['united kingdom', 'uk', 'gb', 'great britain', 'england', 'scotland', 'wales', 'ireland', 'ie', 'france', 'fr', 'germany', 'de', 'spain', 'es', 'portugal', 'pt', 'italy', 'it', 'netherlands', 'nl', 'belgium', 'be', 'luxembourg', 'lu', 'switzerland', 'ch', 'austria', 'at', 'poland', 'pl', 'czech republic', 'czechia', 'cz', 'slovakia', 'sk', 'hungary', 'hu', 'romania', 'ro', 'bulgaria', 'bg', 'greece', 'gr', 'croatia', 'hr', 'slovenia', 'si', 'denmark', 'dk', 'sweden', 'se', 'norway', 'no', 'finland', 'fi', 'iceland', 'is', 'estonia', 'ee', 'latvia', 'lv', 'lithuania', 'lt', 'malta', 'mt', 'cyprus', 'cy', 'serbia', 'rs', 'ukraine', 'ua', 'albania', 'al', 'north macedonia', 'mk', 'montenegro', 'me', 'bosnia and herzegovina', 'ba', 'moldova', 'md']);

// Tabbed regions only — there is NO "Other" tab. Countries outside these four
// (South Africa, etc.) still classify as 'Other' for counting but appear only under
// the "All regions" tab.
const REGIONS = ['Middle East', 'Europe', 'North America', 'Asia-Pacific'];

function regionForCountry(country) {
  const c = String(country || '').trim().toLowerCase();
  if (!c) return 'Other';
  if (NORTH_AMERICA.has(c)) return 'North America';
  if (MIDDLE_EAST.has(c)) return 'Middle East';
  if (EUROPE.has(c)) return 'Europe';
  if (ASIA_PACIFIC.has(c)) return 'Asia-Pacific';
  return 'Other'; // untabbed (e.g. South Africa) — reachable only via "All regions"
}

// Map a pilot's country/base to a default region (else null → "All regions").
function defaultRegionForPilot(country) {
  const r = country ? regionForCountry(country) : 'Other';
  return REGIONS.includes(r) ? r : null;
}

// ── Normalisation (mirrors the strict qualifiedOnly logic) ───────────────────
const normCert = (t) => (t === 'ATP' ? ['ATP', 'ATPL'] : t === 'ATPL' ? ['ATPL', 'ATP'] : [t]);
const normAuth = (a) => (a === 'CAA_UK' || a === 'CAA-UK' || a === 'CAA') ? ['CAA', 'CAA_UK', 'CAA-UK'] : [a];
const EU_RTW = new Set(['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech republic', 'czechia', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden', 'eu', 'european union']);

// Build a match context from an ALREADY-LOADED pilot (with certificates/ratings/
// medicals/rightToWork included) + totals. Pure — no DB. Used by the alert engine,
// which already has the pilot in hand, so matching never re-queries.
function contextFromPilot(pilot, totals) {
  if (!pilot) return null;
  const flightCerts = pilot.certificates.filter((c) => c.type !== 'ELP');
  return buildContextInner(pilot, flightCerts, totals);
}

// Build the pilot's matching context once per request (reused across all jobs).
async function buildMatchContext(pilotId, prisma) {
  const [pilot, totals] = await Promise.all([
    prisma.pilot.findUnique({
      where: { id: pilotId },
      include: { certificates: true, ratings: true, medicals: true, rightToWork: true },
    }),
    getPilotFlightTotals(pilotId),
  ]);
  if (!pilot) return null;
  return contextFromPilot(pilot, totals);
}

function buildContextInner(pilot, flightCerts, totals) {
  const certTypes = new Set(flightCerts.flatMap((c) => normCert(c.type)));
  const certAuthorities = new Set(flightCerts.flatMap((c) => normAuth(c.issuingAuthority)).filter(Boolean));
  const ratingTypes = new Set(pilot.ratings.map((r) => String(r.aircraftType).toUpperCase()));
  const qualifiedMedicals = getQualifiedMedicalClasses(pilot.medicals); // array or null
  const elpCert = pilot.certificates.find((c) => c.type === 'ELP');
  const elpLevel = parseElpLevel(elpCert?.englishLevel);
  const rtwCountries = pilot.rightToWork.map((r) => String(r.country).toLowerCase().trim());

  return {
    hasCerts: certTypes.size > 0, certTypes,
    hasAuthorities: certAuthorities.size > 0, certAuthorities,
    hasRatings: ratingTypes.size > 0, ratingTypes,
    qualifiedMedicals, hasMedical: Array.isArray(qualifiedMedicals) && qualifiedMedicals.length > 0,
    elpLevel,
    hasRtw: rtwCountries.length > 0, rtwCountries,
    education: pilot.education ?? null,
    role: pilot.role ?? null,
    willingToRelocate: !!pilot.willingToRelocate,
    totals: totals || {},
    country: pilot.country ?? null,
    // Empty-profile rule: with no licence AND no hours there is nothing to match on,
    // so the caller shows a "complete your profile" banner instead of fit groups.
    matchable: certTypes.size > 0 || ((totals && totals.totalTime) > 0),
  };
}

// Does the pilot's right-to-work satisfy a job's workAuthorization requirement?
function rtwSatisfies(ctx, req) {
  if (req === 'required') return true; // any RTW on file counts as "authorised somewhere"
  const c = ctx.rtwCountries;
  if (req === 'EU') return c.some((x) => EU_RTW.has(x));
  if (req === 'US') return c.some((x) => ['united states', 'usa', 'us'].includes(x));
  if (req === 'UK') return c.some((x) => ['united kingdom', 'uk', 'great britain'].includes(x));
  // Unknown/other requirement string → treat any RTW as satisfying (charitable).
  return c.length > 0;
}

// One requirement descriptor. group drives the detail table sections.
function mk(key, label, group, status, reqText, pilotText, mustHave = false) {
  return { key, label, group, status, reqText, pilotText, mustHave };
}

// A career-hours check: 0 pilot hours = no data = unknown (never a failure).
function hoursReq(key, label, reqVal, pilotVal) {
  if (reqVal == null) return null;
  const req = `${Math.round(reqVal).toLocaleString()} h`;
  if (!(pilotVal > 0)) return mk(key, label, 'hours', 'unknown', req, null);
  const pv = `${Math.round(pilotVal).toLocaleString()} h`;
  return mk(key, label, 'hours', pilotVal >= reqVal ? 'met' : 'unmet', req, pv);
}

// Evaluate every requirement the JOB states, against the pilot context.
// Returns { requirements, counts, fitGroup, unmetKeys, blocker }.
function matchJob(job, ctx) {
  const reqs = [];
  const push = (r) => { if (r) reqs.push(r); };

  // ── Must-haves ─────────────────────────────────────────────────────────
  if (job.reqWorkAuthorization) {
    const status = !ctx.hasRtw ? 'unknown' : (rtwSatisfies(ctx, job.reqWorkAuthorization) ? 'met' : 'unmet');
    push(mk('workAuth', 'Work authorisation', 'must', status, workAuthLabel(job.reqWorkAuthorization), ctx.hasRtw ? ctx.rtwCountries.map(titleCaseWord).join(', ') : null, true));
  }
  if (job.reqAuthorities?.length) {
    const status = !ctx.hasAuthorities ? 'unknown' : (job.reqAuthorities.some((a) => ctx.certAuthorities.has(a)) ? 'met' : 'unmet');
    push(mk('authority', 'Licence authority', 'must', status, job.reqAuthorities.join(', '), ctx.hasAuthorities ? [...ctx.certAuthorities].filter((a) => !a.includes('_') && a !== 'CAA-UK').join(', ') : null, true));
  }
  if (job.reqCertificates?.length) {
    const status = !ctx.hasCerts ? 'unknown' : (job.reqCertificates.some((c) => ctx.certTypes.has(c)) ? 'met' : 'unmet');
    push(mk('licence', 'Licence', 'must', status, job.reqCertificates.join(', '), ctx.hasCerts ? [...ctx.certTypes].filter((c) => c !== 'ATP' || !ctx.certTypes.has('ATPL')).join(', ') : null));
  }

  // ── Hours ──────────────────────────────────────────────────────────────
  push(hoursReq('totalHours', 'Total time', job.reqMinTotalHours, ctx.totals.totalTime));
  push(hoursReq('picHours', 'PIC time', job.reqMinPicHours, ctx.totals.picTime));
  push(hoursReq('multiHours', 'Multi-engine', job.reqMinMultiEngineHours, ctx.totals.multiEngineTime));
  push(hoursReq('turbineHours', 'Turbine', job.reqMinTurbineHours, ctx.totals.turbineTime));
  push(hoursReq('instrumentHours', 'Instrument', job.reqMinInstrumentHours, ctx.totals.instrumentTime));
  push(hoursReq('ccHours', 'Cross-country', job.reqMinCrossCountryHours, ctx.totals.crossCountryTime));

  // ── Ratings & medical ──────────────────────────────────────────────────
  if (job.reqAircraftTypes?.length) {
    const status = !ctx.hasRatings ? 'unknown' : (job.reqAircraftTypes.some((t) => ctx.ratingTypes.has(String(t).toUpperCase())) ? 'met' : 'unmet');
    push(mk('typeRating', 'Type rating', 'ratings', status, job.reqAircraftTypes.join(', '), ctx.hasRatings ? [...ctx.ratingTypes].join(', ') : null));
  }
  if (job.reqMedicalClass) {
    const status = !ctx.hasMedical ? 'unknown' : (ctx.qualifiedMedicals.includes(job.reqMedicalClass) ? 'met' : 'unmet');
    push(mk('medical', 'Medical', 'ratings', status, medicalLabel(job.reqMedicalClass), ctx.hasMedical ? medicalLabel(ctx.qualifiedMedicals[0]) : null));
  }
  if (job.reqEnglishLevel != null) {
    const status = ctx.elpLevel == null ? 'unknown' : (ctx.elpLevel >= job.reqEnglishLevel ? 'met' : 'unmet');
    push(mk('english', 'English (ICAO)', 'ratings', status, `Level ${job.reqEnglishLevel}`, ctx.elpLevel != null ? `Level ${ctx.elpLevel}` : null));
  }
  if (job.reqEducation) {
    const status = ctx.education == null ? 'unknown' : ((EDU_RANK[ctx.education] ?? 0) >= (EDU_RANK[job.reqEducation] ?? 0) ? 'met' : 'unmet');
    push(mk('education', 'Education', 'ratings', status, titleCaseWord(job.reqEducation), ctx.education ? titleCaseWord(ctx.education) : null));
  }

  const counts = { met: 0, unmet: 0, unknown: 0 };
  const unmetKeys = [];
  const unknownKeys = [];
  for (const r of reqs) {
    counts[r.status] += 1;
    if (r.status === 'unmet') unmetKeys.push(r.key);
    if (r.status === 'unknown') unknownKeys.push(r.key);
  }
  const known = counts.met + counts.unmet;

  // fitGroup (strict qualify — a meaningful "you qualify" number):
  //   qualify    = 0 unmet AND all must-haves KNOWN AND ≤1 other unknown
  //   incomplete = 0 unmet but too much unknown to be sure ("complete your profile")
  //   oneShort   = exactly 1 unmet
  //   other      = ≥2 unmet
  //   few  = job states <2 requirements → too little to be a real "qualify"
  //          (neutral group after oneShort). Applies only to the 0-unmet side;
  //          a 1-requirement job you FAIL is still oneShort.
  const mustHaveUnknown = reqs.some((r) => r.mustHave && r.status === 'unknown');
  const otherUnknown = reqs.filter((r) => !r.mustHave && r.status === 'unknown').length;
  let fitGroup;
  if (counts.unmet >= 2) fitGroup = 'other';
  else if (counts.unmet === 1) fitGroup = 'oneShort';
  else if (reqs.length < 2) fitGroup = 'few';
  else if (!mustHaveUnknown && otherUnknown <= 1) fitGroup = 'qualify';
  else fitGroup = 'incomplete';

  // A must-have that is unmet is a hard blocker (surfaced red on the detail).
  const blocker = reqs.find((r) => r.mustHave && r.status === 'unmet') || null;

  return { requirements: reqs, counts, known, fitGroup, unmetKeys, unknownKeys, blocker: blocker ? blocker.key : null };
}

// ── Small label helpers (shared display truths) ──────────────────────────────
function medicalLabel(v) {
  const s = String(v || '').toUpperCase().replace(/[^0-9]/g, '');
  return s ? `Class ${s}` : String(v);
}
function workAuthLabel(v) {
  const m = { EU: 'EU work authorisation', US: 'US work authorisation', UK: 'UK work authorisation', REQUIRED: 'Work authorisation required' };
  return m[String(v).toUpperCase()] || `${String(v)} work authorisation`;
}
function titleCaseWord(s) {
  return String(s || '').split(/[\s_]+/).map((w) => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(' ');
}

module.exports = {
  regionForCountry, defaultRegionForPilot, REGIONS,
  buildMatchContext, contextFromPilot, matchJob, medicalLabel, workAuthLabel,
};
