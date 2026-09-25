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
const MIDDLE_EAST = new Set(['united arab emirates', 'uae', 'qatar', 'saudi arabia', 'ksa', 'bahrain', 'kuwait', 'oman', 'jordan', 'lebanon', 'israel', 'iraq', 'egypt', 'turkey', 'türkiye']);
const US = new Set(['united states', 'usa', 'us', 'u.s.', 'united states of america', 'america']);
const ASIA_PACIFIC = new Set(['china', 'hong kong', 'japan', 'south korea', 'korea', 'singapore', 'malaysia', 'thailand', 'vietnam', 'indonesia', 'philippines', 'india', 'pakistan', 'australia', 'new zealand', 'taiwan', 'cambodia', 'macau', 'brunei', 'sri lanka', 'bangladesh', 'nepal', 'maldives']);
const EUROPE = new Set(['united kingdom', 'uk', 'great britain', 'ireland', 'france', 'germany', 'spain', 'portugal', 'italy', 'netherlands', 'belgium', 'luxembourg', 'switzerland', 'austria', 'poland', 'czech republic', 'czechia', 'slovakia', 'hungary', 'romania', 'bulgaria', 'greece', 'croatia', 'slovenia', 'denmark', 'sweden', 'norway', 'finland', 'iceland', 'estonia', 'latvia', 'lithuania', 'malta', 'cyprus', 'serbia', 'ukraine', 'albania', 'north macedonia', 'montenegro', 'bosnia and herzegovina', 'moldova']);

const REGIONS = ['Middle East', 'Europe', 'United States', 'Asia-Pacific', 'Other'];

function regionForCountry(country) {
  const c = String(country || '').trim().toLowerCase();
  if (!c) return 'Other';
  if (US.has(c)) return 'United States';
  if (MIDDLE_EAST.has(c)) return 'Middle East';
  if (EUROPE.has(c)) return 'Europe';
  if (ASIA_PACIFIC.has(c)) return 'Asia-Pacific';
  return 'Other';
}

// Map a pilot's country/base to a default region (else null → "All regions").
function defaultRegionForPilot(country) {
  const r = country ? regionForCountry(country) : 'Other';
  return r === 'Other' ? null : r;
}

// ── Normalisation (mirrors the strict qualifiedOnly logic) ───────────────────
const normCert = (t) => (t === 'ATP' ? ['ATP', 'ATPL'] : t === 'ATPL' ? ['ATPL', 'ATP'] : [t]);
const normAuth = (a) => (a === 'CAA_UK' || a === 'CAA-UK' || a === 'CAA') ? ['CAA', 'CAA_UK', 'CAA-UK'] : [a];
const EU_RTW = new Set(['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech republic', 'czechia', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden', 'eu', 'european union']);

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

  const flightCerts = pilot.certificates.filter((c) => c.type !== 'ELP');
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
  for (const r of reqs) {
    counts[r.status] += 1;
    if (r.status === 'unmet') unmetKeys.push(r.key);
  }
  const known = counts.met + counts.unmet;
  const fitGroup = counts.unmet === 0 ? 'qualify' : counts.unmet === 1 ? 'oneShort' : 'other';
  // A must-have that is unmet is a hard blocker (surfaced red on the detail).
  const blocker = reqs.find((r) => r.mustHave && r.status === 'unmet') || null;

  return { requirements: reqs, counts, known, fitGroup, unmetKeys, blocker: blocker ? blocker.key : null };
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
  buildMatchContext, matchJob, medicalLabel, workAuthLabel,
};
