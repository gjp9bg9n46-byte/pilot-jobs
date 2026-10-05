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
// "unknown" (migrated from the bogus "ICAO" authority) and blanks contribute NO
// authority — so a pilot who hasn't picked their authority yet reads as ? (unknown)
// against a job's required authority, never as an unmet/fail.
const normAuth = (a) => {
  const v = String(a ?? '').trim();
  if (!v || v.toLowerCase() === 'unknown') return [];
  return (v === 'CAA_UK' || v === 'CAA-UK' || v === 'CAA') ? ['CAA', 'CAA_UK', 'CAA-UK'] : [v];
};
const EU_RTW = new Set(['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech republic', 'czechia', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden', 'eu', 'european union']);

// Build a match context from an ALREADY-LOADED pilot (with certificates/ratings/
// medicals/rightToWork included) + totals. Pure — no DB. Used by the alert engine,
// which already has the pilot in hand, so matching never re-queries.
function contextFromPilot(pilot, totals) {
  if (!pilot) return null;
  const flightCerts = pilot.certificates.filter((c) => c.type !== 'ELP');
  return buildContextInner(pilot, flightCerts, totals);
}

const MATCH_TOTAL_KEYS = ['totalTime', 'picTime', 'sicTime', 'multiEngineTime', 'turbineTime', 'instrumentTime', 'crossCountryTime', 'nightTime'];
function totalsFromStored(d) {
  const out = {};
  for (const k of MATCH_TOTAL_KEYS) out[k] = Number(d?.[k]) || 0;
  // Carry the role-split-trust flag so PIC/SIC "known vs unknown" is authoritative
  // (change #4) rather than inferred from the hour values alone.
  if (typeof d?.picSicSplitValid === 'boolean') out.picSicSplitValid = d.picSicSplitValid;
  return out;
}

// Build the pilot's matching context once per request (reused across all jobs).
// The derived flight totals are denormalised on the pilot row (Pilot.derivedTotals),
// so ONE query loads the pilot + its relations + totals — no extra query and no
// per-request flight load. Falls back to a recompute only if a pilot has none yet.
async function buildMatchContext(pilotId, prisma) {
  const pilot = await prisma.pilot.findUnique({
    where: { id: pilotId },
    include: { certificates: true, ratings: true, medicals: true, rightToWork: true, instructorRatings: true },
  });
  if (!pilot) return null;
  const totals = pilot.derivedTotals
    ? totalsFromStored(pilot.derivedTotals)
    : await getPilotFlightTotals(pilotId); // self-heal path (recomputes + stores)
  return contextFromPilot(pilot, totals);
}

// Normalise a raw aircraft-category string to 'aeroplane' | 'helicopter' | null.
function normCategory(v) {
  const s = String(v || '').toLowerCase();
  if (/helic|rotor|rotary/.test(s)) return 'helicopter';
  if (/aero|aerop|airplane|aeroplane|\bplane\b|fixed[\s-]?wing|single[\s-]?engine|multi[\s-]?engine|\bsep\b|\bmep\b|\bse\b|\bme\b|land|sea/.test(s)) return 'aeroplane';
  return null;
}

const INSTRUCTOR_KINDS = new Set(['FI', 'CRI', 'IRI', 'TRI', 'SFI']);
const EXAMINER_KINDS = new Set(['TRE', 'SFE']);

// Pilot-licence hierarchy (change #2): a higher licence supersedes a lower one in
// the SAME category — ATPL satisfies a CPL or PPL requirement, CPL satisfies PPL.
// Non-level tokens (IR, ME, …) are ratings, not levels, and are not ranked here.
const LICENCE_RANK = { PPL: 1, MPL: 2, CPL: 2, ATP: 3, ATPL: 3 };

function buildContextInner(pilot, flightCerts, totals) {
  const now = Date.now();
  // An item is valid if it has no expiry OR its expiry is still in the future.
  const isValid = (x) => !x.expiryDate || new Date(x.expiryDate).getTime() > now;

  const certTypes = new Set(flightCerts.flatMap((c) => normCert(c.type)));
  // Only CURRENT licences satisfy a licence requirement (change #5 — expiry).
  const validCertTypes = new Set(flightCerts.filter(isValid).flatMap((c) => normCert(c.type)));
  // Latest expiry (ms) held per licence type — used to word "expired DD MMM YYYY"
  // when a required type is held but every instance of it has lapsed.
  const certExpiryByType = new Map();
  for (const c of flightCerts) {
    if (!c.expiryDate) continue;
    const exp = new Date(c.expiryDate).getTime();
    for (const t of normCert(c.type)) {
      if (!certExpiryByType.has(t) || exp > certExpiryByType.get(t)) certExpiryByType.set(t, exp);
    }
  }

  // Per-licence records for the hierarchy check — level, category (may be null),
  // expiry, and whether it's current. (change #2)
  const licences = flightCerts
    .filter((c) => LICENCE_RANK[c.type] != null)
    .map((c) => ({
      type: c.type,
      rank: LICENCE_RANK[c.type],
      category: normCategory(c.category),
      expiryMs: c.expiryDate ? new Date(c.expiryDate).getTime() : null,
      valid: isValid(c),
    }));

  const certAuthorities = new Set(flightCerts.flatMap((c) => normAuth(c.issuingAuthority)).filter(Boolean));
  const ratingTypes = new Set(pilot.ratings.map((r) => String(r.aircraftType).toUpperCase()));

  // Medical — expiry-aware (change #5). Only a CURRENT medical qualifies; a lapsed
  // one reads as "not met (expired)", not as a valid medical, and not as unknown.
  const medicals = pilot.medicals || [];
  const validMedicals = medicals.filter(isValid);
  const qualifiedMedicals = getQualifiedMedicalClasses(validMedicals); // from VALID only; null if none
  const medicalLatestExpiry = medicals.reduce((mx, m) => {
    const e = m.expiryDate ? new Date(m.expiryDate).getTime() : null;
    return e != null && (mx == null || e > mx) ? e : mx;
  }, null);

  // ELP — the English requirement is met only by a CURRENT ELP endorsement.
  const elpCert = pilot.certificates.find((c) => c.type === 'ELP');
  const elpLevel = parseElpLevel(elpCert?.englishLevel);
  const elpValid = elpCert ? isValid(elpCert) : false;
  const elpExpiry = elpCert?.expiryDate ? new Date(elpCert.expiryDate).getTime() : null;

  const rtwCountries = pilot.rightToWork.map((r) => String(r.country).toLowerCase().trim());

  // Aircraft category comes from the pilot's OWN data (ratings + licences). null
  // where nothing is set — treated as "Add aircraft category", NEVER as aeroplane.
  const pilotCategories = new Set(
    [...pilot.ratings.map((r) => r.category), ...flightCerts.map((c) => c.category)]
      .map(normCategory).filter(Boolean),
  );
  // Instructor/examiner privileges from PilotInstructorRating (non-expired).
  const instructorKinds = new Set((pilot.instructorRatings || [])
    .filter((r) => !r.expiry || new Date(r.expiry).getTime() > now)
    .map((r) => String(r.kind)));
  const hasInstructor = [...instructorKinds].some((k) => INSTRUCTOR_KINDS.has(k) || EXAMINER_KINDS.has(k)); // examiners can instruct
  const hasExaminer = [...instructorKinds].some((k) => EXAMINER_KINDS.has(k));

  // PIC/SIC hours are "known" only when the role split is actually recorded —
  // either the logbook logs PIC/SIC on the flights or the pilot entered a
  // carry-forward split (change #4). The authoritative signal is picSicSplitValid
  // (role time accounts for ≥50% of total); when it isn't carried (ad-hoc/tests)
  // fall back to "any PIC or SIC on file". A total-only import leaves PIC UNKNOWN —
  // never a known 0.
  const roleSplitKnown = (typeof totals?.picSicSplitValid === 'boolean')
    ? totals.picSicSplitValid
    : (((Number(totals?.picTime) || 0) + (Number(totals?.sicTime) || 0)) > 0);

  return {
    hasCerts: certTypes.size > 0, certTypes, validCertTypes, certExpiryByType, licences,
    hasAuthorities: certAuthorities.size > 0, certAuthorities,
    hasRatings: ratingTypes.size > 0, ratingTypes,
    hasCategory: pilotCategories.size > 0, pilotCategories,
    instructorKinds, hasAnyInstructorRating: instructorKinds.size > 0, hasInstructor, hasExaminer,
    qualifiedMedicals, hasMedical: Array.isArray(qualifiedMedicals) && qualifiedMedicals.length > 0,
    hasAnyMedical: medicals.length > 0,
    medicalAllExpired: medicals.length > 0 && validMedicals.length === 0,
    medicalLatestExpiry,
    elpPresent: !!elpCert, elpLevel, elpValid, elpExpiry,
    hasRtw: rtwCountries.length > 0, rtwCountries,
    education: pilot.education ?? null,
    role: pilot.role ?? null,
    willingToRelocate: !!pilot.willingToRelocate,
    totals: totals || {}, roleSplitKnown,
    country: pilot.country ?? null,
    // Empty-profile rule: with no licence AND no hours there is nothing to match on,
    // so the caller shows a "complete your profile" banner instead of fit groups.
    matchable: certTypes.size > 0 || ((totals && totals.totalTime) > 0),
  };
}

// ── Job classifiers (aircraft category + instructor/examiner role) ───────────
const ROTOR_TYPE = /\b(as3\d\d|aw1\d\d|ec1\d\d|h1[0-9]{2}|s-?(?:76|92|61)|b(?:206|407|412|429)|bk117|md5\d\d|md902|r22|r44|r66|nh90|uh-?60|a109|a119|mi-?\d|ka-?\d{2})\b/i;
const ROTOR_WORD = /\b(helicopter|rotor[\s-]?wing|rotary[\s-]?wing|rotorcraft|\bhems\b|offshore\s+helicopter)\b/i;
const FIXED_TYPE = /\b(a2[12]0|a3[0-8]0|b?7[0-9]7|crj\d*|erj\d*|e1\d\d|atr\s?\d{2}|dash\s?8|q400|dhc-?\d|cl[-\s]?\d{3}|challenger|global\s*\d|bd[-\s]?700|falcon|citation|gulfstream|g[2-7]\d0|king\s?air|pc-?\d\d|phenom|legacy|praetor|lineage|tbm|c\s?\d{3}|caravan|cessna|saab|embraer|boeing|airbus|f406|bn-?2|islander)\b/i;
const FIXED_WORD = /\b(aeroplane|airplane|fixed[\s-]?wing|airliner|airline\s+pilot)\b/i;
const EXAMINER_WORD = /\b(tre|sfe|examiner|flight\s+examiner|type\s+rating\s+examiner)\b/i;
const INSTRUCTOR_WORD = /\b(fi|cri|iri|tri|sfi|flight\s+instructor|simulator\s+instructor|instructor\s+pilot|type\s+rating\s+instructor|ground\s+instructor)\b/i;

function jobText(job) {
  return `${job.title || ''} ${job.titleEn || ''} ${job.role || ''} ${String(job.requirementsText || '').slice(0, 600)}`;
}
// 'helicopter' | 'aeroplane' | null (null = can't infer → no category requirement)
function jobAircraftCategory(job) {
  // Category is about what the job FLIES — use the display fleet (aircraftTypes),
  // falling back to legacy reqAircraftTypes / rated reqTypeRatings when absent.
  const types = (job.aircraftTypes?.length ? job.aircraftTypes
    : (job.reqAircraftTypes?.length ? job.reqAircraftTypes : (job.reqTypeRatings || []))).join(' ');
  const text = jobText(job);
  if (ROTOR_TYPE.test(types) || ROTOR_WORD.test(text)) return 'helicopter';
  if (FIXED_TYPE.test(types) || FIXED_WORD.test(text)) return 'aeroplane';
  return null;
}
// 'examiner' | 'instructor' | null.
// Decide the KIND from the title/role first — an instructor JD often mentions
// "examiner" as a progression path in its body, which must not turn it into an
// examiner requirement. Body text is only a fallback when title/role say nothing.
function jobInstructorKind(job) {
  const head = `${job.title || ''} ${job.titleEn || ''} ${job.role || ''}`;
  if (EXAMINER_WORD.test(head)) return 'examiner';
  if (INSTRUCTOR_WORD.test(head)) return 'instructor';
  const body = String(job.requirementsText || '').slice(0, 600);
  if (EXAMINER_WORD.test(body)) return 'examiner';
  if (INSTRUCTOR_WORD.test(body)) return 'instructor';
  return null;
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
// reason: an override explanation for an unmet row (e.g. "expired 30 Sep 2026").
function mk(key, label, group, status, reqText, pilotText, mustHave = false, reason = null) {
  return { key, label, group, status, reqText, pilotText, mustHave, reason };
}

// A career-hours check. `known` says whether the pilot's value is real data:
//   - omitted → known iff the value is > 0 (a 0 means "no data" → unknown).
//   - PIC/SIC pass the role-split signal, so a genuine 0 with a recorded split is a
//     known 0 (→ not met), while a total-only import with no split stays unknown.
function hoursReq(key, label, reqVal, pilotVal, known) {
  if (reqVal == null) return null;
  const req = `${Math.round(reqVal).toLocaleString()} h`;
  const isKnown = known === undefined ? ((pilotVal || 0) > 0) : !!known;
  if (!isKnown) return mk(key, label, 'hours', 'unknown', req, null);
  const pv = `${Math.round(pilotVal || 0).toLocaleString()} h`;
  return mk(key, label, 'hours', (pilotVal || 0) >= reqVal ? 'met' : 'unmet', req, pv);
}

// Evaluate every requirement the JOB states, against the pilot context.
// Returns { requirements, counts, fitGroup, unmetKeys, blocker }.
function matchJob(job, ctx) {
  const reqs = [];
  const push = (r) => { if (r) reqs.push(r); };
  const jobCat = jobAircraftCategory(job); // needed by the licence-category check below

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
    // Split the required certs into pilot-licence LEVELS (ranked) vs other tokens
    // (IR, ME — ratings, not levels). The licence row checks the level by hierarchy.
    const levelReqs = job.reqCertificates.filter((c) => LICENCE_RANK[c] != null);
    if (levelReqs.length) {
      const reqRank = Math.min(...levelReqs.map((c) => LICENCE_RANK[c])); // lowest accepted level
      // Candidate held licences: senior enough to supersede, same category (best-effort —
      // a null licence category doesn't exclude; the gate already blocks wrong-category jobs).
      const sameCat = (l) => !jobCat || l.category == null || l.category === jobCat;
      const candidates = ctx.licences.filter((l) => sameCat(l) && l.rank >= reqRank)
        .sort((a, b) => b.rank - a.rank || Number(b.valid) - Number(a.valid) || (b.expiryMs || 0) - (a.expiryMs || 0));
      let status, reason = null, pilotText = null;
      if (!ctx.hasCerts) status = 'unknown';
      else if (!candidates.length) status = 'unmet'; // holds no licence senior enough
      else {
        // Evaluate the HIGHEST held licence — a higher one supersedes a lower (so an
        // ATPL is evaluated, not a stale lower CPL). Current → met; lapsed → expired.
        const top = candidates[0];
        pilotText = top.type;
        if (top.valid) status = 'met';
        else { status = 'unmet'; reason = top.expiryMs ? `expired ${fmtDate(top.expiryMs)}` : null; }
      }
      push(mk('licence', 'Licence', 'must', status, levelReqs.join(', '), pilotText || (ctx.hasCerts ? [...ctx.certTypes].join(', ') : null), false, reason));
    } else {
      // No licence-level token (e.g. only IR) → fall back to "holds a current one of these".
      const req = job.reqCertificates;
      const status = !ctx.hasCerts ? 'unknown' : (req.some((c) => ctx.validCertTypes.has(c)) ? 'met' : 'unmet');
      push(mk('licence', 'Licence', 'must', status, req.join(', '), ctx.hasCerts ? [...ctx.certTypes].join(', ') : null));
    }
  }

  // ── Hours ──────────────────────────────────────────────────────────────
  push(hoursReq('totalHours', 'Total time', job.reqMinTotalHours, ctx.totals.totalTime));
  push(hoursReq('picHours', 'PIC time', job.reqMinPicHours, ctx.totals.picTime, ctx.roleSplitKnown));
  push(hoursReq('multiHours', 'Multi-engine', job.reqMinMultiEngineHours, ctx.totals.multiEngineTime));
  push(hoursReq('turbineHours', 'Turbine', job.reqMinTurbineHours, ctx.totals.turbineTime));
  push(hoursReq('instrumentHours', 'Instrument', job.reqMinInstrumentHours, ctx.totals.instrumentTime));
  push(hoursReq('ccHours', 'Cross-country', job.reqMinCrossCountryHours, ctx.totals.crossCountryTime));

  // ── Ratings & medical ──────────────────────────────────────────────────
  // Type-rating requirement reads reqTypeRatings (trigger-gated) — NOT the legacy
  // fleet-inclusive reqAircraftTypes, so a fleet mention never fails a pilot.
  if (job.reqTypeRatings?.length) {
    const status = !ctx.hasRatings ? 'unknown' : (job.reqTypeRatings.some((t) => ctx.ratingTypes.has(String(t).toUpperCase())) ? 'met' : 'unmet');
    push(mk('typeRating', 'Type rating', 'ratings', status, job.reqTypeRatings.join(', '), ctx.hasRatings ? [...ctx.ratingTypes].join(', ') : null));
  }
  if (job.reqMedicalClass) {
    let status, reason = null;
    if (!ctx.hasAnyMedical) status = 'unknown';
    else if (ctx.medicalAllExpired) { status = 'unmet'; reason = ctx.medicalLatestExpiry ? `expired ${fmtDate(ctx.medicalLatestExpiry)}` : null; }
    else status = ctx.qualifiedMedicals.includes(job.reqMedicalClass) ? 'met' : 'unmet';
    push(mk('medical', 'Medical', 'ratings', status, medicalLabel(job.reqMedicalClass), ctx.hasMedical ? medicalLabel(ctx.qualifiedMedicals[0]) : null, false, reason));
  }
  if (job.reqEnglishLevel != null) {
    let status, reason = null;
    if (!ctx.elpPresent) status = 'unknown';
    else if (!ctx.elpValid) { status = 'unmet'; reason = ctx.elpExpiry ? `expired ${fmtDate(ctx.elpExpiry)}` : null; }
    else status = (ctx.elpLevel != null && ctx.elpLevel >= job.reqEnglishLevel) ? 'met' : 'unmet';
    push(mk('english', 'English (ICAO)', 'ratings', status, `Level ${job.reqEnglishLevel}`, ctx.elpLevel != null ? `Level ${ctx.elpLevel}` : null, false, reason));
  }
  if (job.reqEducation) {
    const status = ctx.education == null ? 'unknown' : ((EDU_RANK[ctx.education] ?? 0) >= (EDU_RANK[job.reqEducation] ?? 0) ? 'met' : 'unmet');
    push(mk('education', 'Education', 'ratings', status, titleCaseWord(job.reqEducation), ctx.education ? titleCaseWord(ctx.education) : null));
  }

  // ── Instructor / examiner privilege (from PilotInstructorRating) ─────────
  const jobInstr = jobInstructorKind(job);
  if (jobInstr === 'examiner') {
    const status = !ctx.hasAnyInstructorRating ? 'unknown' : (ctx.hasExaminer ? 'met' : 'unmet');
    push(mk('examiner', 'Examiner rating', 'must', status, 'Examiner (TRE/SFE)', ctx.hasAnyInstructorRating ? [...ctx.instructorKinds].join(', ') : null, true));
  } else if (jobInstr === 'instructor') {
    const status = !ctx.hasAnyInstructorRating ? 'unknown' : (ctx.hasInstructor ? 'met' : 'unmet');
    push(mk('instructor', 'Instructor rating', 'must', status, 'Instructor (FI/TRI/…)', ctx.hasAnyInstructorRating ? [...ctx.instructorKinds].join(', ') : null, true));
  }

  // ── Aircraft category is a GATE, not a scored requirement (change #1/#2). It
  //    never adds to met/stated and never moves the %. A mismatch (the pilot flies
  //    a different category) parks the job as WRONG_CATEGORY with no %. An unknown
  //    category leaves the % untouched and only raises an "Add aircraft category"
  //    advisory. A match (or no category inferable) is transparent. ─────────────
  let categoryGate = 'n/a';
  if (jobCat) categoryGate = !ctx.hasCategory ? 'unknown' : (ctx.pilotCategories.has(jobCat) ? 'match' : 'mismatch');
  const category = {
    jobCategory: jobCat,
    gate: categoryGate,
    label: jobCat ? (jobCat === 'helicopter' ? 'Helicopter job' : 'Aeroplane job') : null,
    advisory: categoryGate === 'unknown' ? 'Add aircraft category' : null,
  };

  const counts = { met: 0, unmet: 0, unknown: 0 };
  const unmetKeys = [];
  const unknownKeys = [];
  for (const r of reqs) {
    counts[r.status] += 1;
    if (r.status === 'unmet') unmetKeys.push(r.key);
    if (r.status === 'unknown') unknownKeys.push(r.key);
    // Three display states (change #1): met · not_met (has data, falls short) · add
    // (unknown on profile). The % still counts 'add' against it, but the UI shows it
    // as "Add to profile", never as a red failure.
    r.state = r.status === 'met' ? 'met' : (r.status === 'unmet' ? 'not_met' : 'add');
    r.gap = gapPhrase(r);
  }

  // ── Match percentage: met ÷ stated. "unknown" counts against the %. 100% only
  //    when every stated requirement is met. No % when nothing is stated. ──────
  const stated = reqs.length;
  const notMet = counts.unmet;
  const addCount = counts.unknown;
  const pct = stated === 0 ? null : Math.round((counts.met / stated) * 100);

  // ── Status vocabulary (change #3) — single source of the fit label:
  //   QUALIFY        all stated requirements met
  //   CHECK          none failed, but ≥1 unknown ("Can't tell yet: add X")
  //   SHORT          exactly 1 not met
  //   NOT_MET        2+ not met
  //   WRONG_CATEGORY pilot flies a different aircraft category (no %)
  //   NO_REQUIREMENTS the job states nothing to match on (no %)
  let status;
  if (categoryGate === 'mismatch') status = 'WRONG_CATEGORY';
  else if (stated === 0) status = 'NO_REQUIREMENTS';
  else if (notMet >= 2) status = 'NOT_MET';
  else if (notMet === 1) status = 'SHORT';
  else if (addCount >= 1) status = 'CHECK';
  else status = 'QUALIFY';
  const pctOut = (status === 'WRONG_CATEGORY' || status === 'NO_REQUIREMENTS') ? null : pct;

  // One-line message tuned to the status.
  const notMetRows = reqs.filter((r) => r.state === 'not_met');
  const addRows = reqs.filter((r) => r.state === 'add');
  const addList = addRows.map((r) => ADD_LABEL[r.key] || r.label.toLowerCase()).join(', ');
  let shortfall = null;
  if (status === 'WRONG_CATEGORY') shortfall = category.label;              // "Helicopter job" / "Aeroplane job"
  else if (status === 'SHORT') { const r0 = notMetRows[0]; shortfall = r0.reason ? `${r0.label} ${r0.reason}` : r0.gap; }
  else if (status === 'NOT_MET') shortfall = `${notMetRows.length} requirements not met`;
  else if (status === 'CHECK') shortfall = `Can't tell yet: add ${addList}`;

  // A must-have that is unmet is a hard blocker (surfaced red on the detail).
  const blocker = reqs.find((r) => r.mustHave && r.status === 'unmet') || null;

  // Legacy compatibility shim — existing endpoints (jobController getJobs filter/
  // counts/sort, matchingService push runners, profileReadiness) still read
  // `.fitGroup` (qualify/incomplete/oneShort/few/other). Keep it mapped until those
  // consumers migrate to `.status` in the wiring step. TEMP — remove on wiring.
  const LEGACY_FIT = { QUALIFY: 'qualify', CHECK: 'incomplete', SHORT: 'oneShort', NOT_MET: 'other', WRONG_CATEGORY: 'other', NO_REQUIREMENTS: 'few' };

  return {
    requirements: reqs, counts, known: counts.met + counts.unmet,
    stated, met: counts.met, notMet, addCount,
    pct: pctOut, status, shortfall, category,
    unmetKeys, unknownKeys, blocker: blocker ? blocker.key : null,
    fitGroup: LEGACY_FIT[status], // TEMP shim; see note above
  };
}

// What to add / what's short, per requirement — drives the shortfall line.
const ADD_LABEL = {
  totalHours: 'total hours', picHours: 'PIC hours', multiHours: 'multi-engine hours',
  turbineHours: 'turbine hours', instrumentHours: 'instrument hours', ccHours: 'cross-country hours',
  typeRating: 'a type rating', medical: 'your medical', english: 'your English level',
  authority: 'your licence authority', licence: 'your licence', workAuth: 'work authorisation',
  education: 'your education', category: 'your licence category', instructor: 'an instructor rating', examiner: 'an examiner rating',
};
function gapPhrase(r) {
  if (r.status === 'met') return null;
  if (r.status === 'unmet') {
    if (r.reason) return r.reason; // "expired 30 Sep 2026" (change #5) — never a bare "not met"
    if (r.group === 'hours') return `need ${r.reqText} ${r.label.replace(/ time$/i, '')}`.trim();
    if (r.key === 'category') return `need a ${String(r.reqText).toLowerCase()} licence`;
    if (r.key === 'instructor' || r.key === 'examiner') return `need ${ADD_LABEL[r.key]}`;
    return `need ${r.reqText}`;
  }
  return `add ${ADD_LABEL[r.key] || r.label.toLowerCase()} to check`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "30 Sep 2026" — the wording appended to an expired item's reason.
function fmtDate(ms) {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
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
  jobAircraftCategory, jobInstructorKind, normCategory,
};
