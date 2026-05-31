'use strict';

const prisma = require('../config/database');
const notificationService = require('./notificationService');
const logger = require('../config/logger');
const { EDU_RANK, parseElpLevel } = require('../lib/eduRank');

// ─── Medical hierarchy ────────────────────────────────────────────────────────

const MEDICAL_RANK = { CLASS_1: 3, CLASS_2: 2, CLASS_3: 1 };

/**
 * Returns true when at least one of the pilot's medical classes satisfies reqClass.
 * CLASS_1 satisfies any class; CLASS_2 satisfies CLASS_2/3; CLASS_3 satisfies CLASS_3 only.
 * Charitable null: no requirement → always passes.
 */
function medicalSatisfies(pilotClasses, reqClass) {
  if (!reqClass) return true;
  const req = MEDICAL_RANK[reqClass] ?? 0;
  return pilotClasses.some((c) => (MEDICAL_RANK[c] ?? 0) >= req);
}

/**
 * Returns the set of DB medical class values that the pilot qualifies for
 * (based on their best-ranked medical), for use in Prisma WHERE clauses.
 * Returns null when the pilot has no medicals on file (no restriction applied).
 */
function getQualifiedMedicalClasses(pilotMedicals) {
  if (!pilotMedicals || !pilotMedicals.length) return null;
  const bestRank = Math.max(...pilotMedicals.map((m) => MEDICAL_RANK[m.medicalClass] ?? 0));
  if (bestRank >= 3) return ['CLASS_1', 'CLASS_2', 'CLASS_3'];
  if (bestRank >= 2) return ['CLASS_2', 'CLASS_3'];
  return ['CLASS_3'];
}

// ─── Right-to-work helpers ────────────────────────────────────────────────────

const EU_COUNTRIES = new Set([
  'austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech republic',
  'denmark', 'estonia', 'finland', 'france', 'germany', 'greece',
  'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg',
  'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia',
  'slovenia', 'spain', 'sweden',
]);

/**
 * Returns true if pilot's rightToWork records satisfy reqWorkAuthorization.
 * Charitable null on the job side: no requirement → passes.
 * Null pilot data (empty array) → soft penalty (returns false) when req present.
 */
function rtwSatisfies(rightToWork, req) {
  if (!req) return true;
  if (!rightToWork || !rightToWork.length) return false;
  if (req === 'required') return true;
  return rightToWork.some((r) => {
    const country = r.country.toLowerCase().trim();
    if (req === 'EU') return EU_COUNTRIES.has(country);
    if (req === 'US') return ['united states', 'usa', 'us'].includes(country);
    if (req === 'UK') return ['united kingdom', 'uk', 'great britain'].includes(country);
    return country === req.toLowerCase();
  });
}

// ─── Cert normalisation (shared across all three scoring fns) ─────────────────

const normaliseCert = (t) => (t === 'ATP' ? ['ATP', 'ATPL'] : t === 'ATPL' ? ['ATPL', 'ATP'] : [t]);
const normaliseAuth = (a) =>
  a === 'CAA_UK' || a === 'CAA-UK' ? ['CAA', 'CAA_UK', 'CAA-UK']
  : a === 'CAA' ? ['CAA', 'CAA_UK', 'CAA-UK']
  : [a];

// ─── Alert score (lenient, 0–100+) ───────────────────────────────────────────

/**
 * Lenient score for alerts/notifications (0–100 base + up to 35 for new criteria).
 * Only cert type and authority are hard requirements.
 * Hours and ratings are proportional soft scores.
 */
function computeAlertScore(pilot, pilotTotals, job) {
  const certTypes = [...new Set(
    pilot.certificates.filter((c) => c.type !== 'ELP').flatMap((c) => normaliseCert(c.type))
  )];
  const certAuthorities = [...new Set(
    pilot.certificates.filter((c) => c.type !== 'ELP').flatMap((c) => normaliseAuth(c.issuingAuthority))
  )];
  const ratingAircraft = pilot.ratings.map((r) => r.aircraftType.toLowerCase());

  let score = 0;

  // Hard: cert type
  if (job.reqCertificates.length > 0) {
    if (certTypes.length === 0 || !job.reqCertificates.some((rc) => certTypes.includes(rc))) return null;
    score += 40;
  } else {
    score += 40;
  }

  // Hard: authority
  if (job.reqAuthorities.length > 0 && certAuthorities.length > 0) {
    if (!job.reqAuthorities.some((a) => certAuthorities.includes(a))) return null;
    score += 20;
  } else {
    score += 20;
  }

  // Soft: total hours (proportional 0–20)
  if (job.reqMinTotalHours > 0) {
    score += Math.min(20, Math.round((pilotTotals.totalTime / job.reqMinTotalHours) * 20));
  } else {
    score += 20;
  }

  // Soft: PIC hours (proportional 0–10)
  if (job.reqMinPicHours > 0) {
    score += Math.min(10, Math.round((pilotTotals.picTime / job.reqMinPicHours) * 10));
  } else {
    score += 10;
  }

  // Soft: aircraft type (0 or 10)
  if (job.reqAircraftTypes.length > 0) {
    score += job.reqAircraftTypes.some((a) => ratingAircraft.includes(a.toLowerCase())) ? 10 : 0;
  } else {
    score += 10;
  }

  // ── New criteria (only evaluated + scored when job specifies them) ──────────

  // Instrument hours (proportional 0–5)
  if (job.reqMinInstrumentHours > 0) {
    score += Math.min(5, Math.round((pilotTotals.instrumentTime / job.reqMinInstrumentHours) * 5));
  }

  // Cross-country hours (proportional 0–5)
  if (job.reqMinCrossCountryHours > 0) {
    score += Math.min(5, Math.round((pilotTotals.crossCountryTime / job.reqMinCrossCountryHours) * 5));
  }

  // Work authorisation (0 or 10)
  if (job.reqWorkAuthorization) {
    score += rtwSatisfies(pilot.rightToWork, job.reqWorkAuthorization) ? 10 : 0;
  }

  // English level (0 or 5)
  if (job.reqEnglishLevel) {
    const elpCert = pilot.certificates.find((c) => c.type === 'ELP');
    const pilotLevel = parseElpLevel(elpCert?.englishLevel);
    score += (pilotLevel != null && pilotLevel >= job.reqEnglishLevel) ? 5 : 0;
  }

  // Education (0 or 5)
  if (job.reqEducation) {
    const pilotRank = EDU_RANK[pilot.education] ?? 0;
    const reqRank   = EDU_RANK[job.reqEducation] ?? 0;
    score += pilotRank >= reqRank ? 5 : 0;
  }

  // Willing to relocate (0 or 5)
  if (job.reqWillingToRelocate) {
    score += pilot.willingToRelocate ? 5 : 0;
  }

  return Math.round(score);
}

// ─── Match score (strict, 0–100, null = disqualified) ────────────────────────

/**
 * Strict score for the "Qualified only" filter.
 * Returns null if any hard requirement fails.
 * maxScore is dynamic: starts at 100, increases only when the job carries a new criterion.
 */
function computeMatchScore(pilot, pilotTotals, job) {
  let score = 0;
  let maxScore = 100;

  const certTypes = [...new Set(
    pilot.certificates.filter((c) => c.type !== 'ELP').flatMap((c) => normaliseCert(c.type))
  )];
  const certAuthorities = [...new Set(
    pilot.certificates.filter((c) => c.type !== 'ELP').flatMap((c) => normaliseAuth(c.issuingAuthority))
  )];
  const ratingAircraft = pilot.ratings.map((r) => r.aircraftType.toLowerCase());
  const medicalClasses = pilot.medicals.map((m) => m.medicalClass);

  // Hard: certificate type
  if (job.reqCertificates.length > 0) {
    if (!job.reqCertificates.some((rc) => certTypes.includes(rc))) return null;
    score += 20;
  } else {
    score += 20;
  }

  // Hard: issuing authority
  if (job.reqAuthorities.length > 0) {
    if (!job.reqAuthorities.some((a) => certAuthorities.includes(a))) return null;
    score += 20;
  } else {
    score += 20;
  }

  // Hard: minimum total hours
  if (job.reqMinTotalHours && pilotTotals.totalTime < job.reqMinTotalHours) return null;
  score += 10;

  // Hard: minimum PIC hours
  if (job.reqMinPicHours && pilotTotals.picTime < job.reqMinPicHours) return null;
  score += 10;

  // Soft: multi-engine hours (0–10)
  if (job.reqMinMultiEngineHours) {
    score += pilotTotals.multiEngineTime >= job.reqMinMultiEngineHours
      ? 10
      : Math.floor((pilotTotals.multiEngineTime / job.reqMinMultiEngineHours) * 10);
  } else {
    score += 10;
  }

  // Soft: turbine hours (0–10)
  if (job.reqMinTurbineHours) {
    score += pilotTotals.turbineTime >= job.reqMinTurbineHours
      ? 10
      : Math.floor((pilotTotals.turbineTime / job.reqMinTurbineHours) * 10);
  } else {
    score += 10;
  }

  // Soft: aircraft type rating (0 or 10)
  if (job.reqAircraftTypes.length > 0) {
    score += job.reqAircraftTypes.some((a) => ratingAircraft.includes(a.toLowerCase())) ? 10 : 0;
  } else {
    score += 10;
  }

  // Soft: medical class — hierarchy via shared helper (0 or 10)
  if (job.reqMedicalClass) {
    score += medicalSatisfies(medicalClasses, job.reqMedicalClass) ? 10 : 0;
  } else {
    score += 10;
  }

  // ── New criteria: dynamic maxScore (only counted when job specifies them) ───

  // Instrument hours (proportional 0–5)
  if (job.reqMinInstrumentHours > 0) {
    maxScore += 5;
    score += pilotTotals.instrumentTime >= job.reqMinInstrumentHours
      ? 5
      : Math.floor((pilotTotals.instrumentTime / job.reqMinInstrumentHours) * 5);
  }

  // Cross-country hours (proportional 0–5)
  if (job.reqMinCrossCountryHours > 0) {
    maxScore += 5;
    score += pilotTotals.crossCountryTime >= job.reqMinCrossCountryHours
      ? 5
      : Math.floor((pilotTotals.crossCountryTime / job.reqMinCrossCountryHours) * 5);
  }

  // Work authorisation (0 or 10)
  if (job.reqWorkAuthorization) {
    maxScore += 10;
    score += rtwSatisfies(pilot.rightToWork, job.reqWorkAuthorization) ? 10 : 0;
  }

  // English level (0 or 5)
  if (job.reqEnglishLevel) {
    maxScore += 5;
    const elpCert = pilot.certificates.find((c) => c.type === 'ELP');
    const pilotLevel = parseElpLevel(elpCert?.englishLevel);
    score += (pilotLevel != null && pilotLevel >= job.reqEnglishLevel) ? 5 : 0;
  }

  // Education (0 or 5)
  if (job.reqEducation) {
    maxScore += 5;
    const pilotRank = EDU_RANK[pilot.education] ?? 0;
    const reqRank   = EDU_RANK[job.reqEducation] ?? 0;
    score += pilotRank >= reqRank ? 5 : 0;
  }

  // Willing to relocate (0 or 5)
  if (job.reqWillingToRelocate) {
    maxScore += 5;
    score += pilot.willingToRelocate ? 5 : 0;
  }

  return Math.min(Math.round((score / maxScore) * 100), 100);
}

// ─── Flight totals (with carry-forward) ──────────────────────────────────────

/**
 * Returns aggregated flight hours for a pilot, including carry-forward values.
 * Always returns a complete zero-filled object — never null — so downstream
 * evaluations never crash on a clean profile.
 */
async function getPilotFlightTotals(pilotId) {
  const [logs, pilot] = await Promise.all([
    prisma.flightLog.findMany({ where: { pilotId } }),
    prisma.pilot.findUnique({ where: { id: pilotId }, select: { carryForward: true } }),
  ]);

  const cf = (pilot?.carryForward) ?? {};

  const totals = logs.reduce(
    (acc, log) => {
      acc.totalTime        += log.totalTime        ?? 0;
      acc.picTime          += log.picTime          ?? 0;
      acc.sicTime          += log.sicTime          ?? 0;
      acc.multiEngineTime  += log.multiEngineTime  ?? 0;
      acc.turbineTime      += log.turbineTime      ?? 0;
      acc.instrumentTime   += log.instrumentTime   ?? 0;
      acc.crossCountryTime += log.crossCountryTime ?? 0;
      acc.nightTime        += log.nightTime        ?? 0;
      return acc;
    },
    {
      totalTime: 0, picTime: 0, sicTime: 0,
      multiEngineTime: 0, turbineTime: 0,
      instrumentTime: 0, crossCountryTime: 0, nightTime: 0,
    }
  );

  for (const key of Object.keys(totals)) {
    totals[key] += (cf[key] ?? 0);
  }

  return totals;
}

// ─── Match breakdown (per-criterion buckets) ─────────────────────────────────

/**
 * Returns terse per-criterion strings in three buckets: matched, marginal, missing.
 * Called after we know the pilot qualifies (score !== null).
 */
function computeMatchBreakdown(pilot, pilotTotals, job) {
  const matched  = [];
  const missing  = [];
  const marginal = [];

  // structured: O(1) lookup for the card pill renderer (card uses this; detail uses the arrays)
  const structured = {
    certificate: 'unchecked', authority: 'unchecked',
    totalHours: 'unchecked', picHours: 'unchecked',
    multiEngineHours: 'unchecked', turbineHours: 'unchecked',
    instrumentHours: 'unchecked', crossCountryHours: 'unchecked',
    aircraftType: 'unchecked', medical: 'unchecked',
    workAuthorization: 'unchecked', englishLevel: 'unchecked',
    education: 'unchecked', willingToRelocate: 'unchecked',
  };

  // ELP filter + ATP/ATPL normalisation — consistent with computeMatchScore
  const certTypes = [...new Set(
    pilot.certificates.filter((c) => c.type !== 'ELP').flatMap((c) => normaliseCert(c.type))
  )];
  const certAuthorities = [...new Set(
    pilot.certificates.filter((c) => c.type !== 'ELP').flatMap((c) => normaliseAuth(c.issuingAuthority))
  )];
  const ratingAircraft = pilot.ratings.map((r) => r.aircraftType.toLowerCase());
  const medicalClasses = pilot.medicals.map((m) => m.medicalClass);
  const fmt = (n) => Math.round(n).toLocaleString();

  // Certificates
  if (job.reqCertificates.length > 0) {
    const met = job.reqCertificates.filter((rc) => certTypes.includes(rc));
    if (met.length) { matched.push(`${met.join(', ')} certificate`); structured.certificate = 'matched'; }
    else            { missing.push(`${job.reqCertificates.join(' or ')} certificate required`); structured.certificate = 'missing'; }
  }

  // Authorities
  if (job.reqAuthorities.length > 0) {
    const met = job.reqAuthorities.filter((a) => certAuthorities.includes(a));
    if (met.length) { matched.push(`${met.join(', ')} authority`); structured.authority = 'matched'; }
    else            { missing.push(`${job.reqAuthorities.join(' or ')} authority required`); structured.authority = 'missing'; }
  }

  // Total hours
  if (job.reqMinTotalHours) {
    if (pilotTotals.totalTime >= job.reqMinTotalHours) {
      matched.push(`${fmt(pilotTotals.totalTime)} total hrs · req. ${fmt(job.reqMinTotalHours)}`); structured.totalHours = 'matched';
    } else if (pilotTotals.totalTime >= job.reqMinTotalHours * 0.9) {
      marginal.push(`Total hrs: ${fmt(pilotTotals.totalTime)} of ${fmt(job.reqMinTotalHours)}`); structured.totalHours = 'marginal';
    } else {
      missing.push(`Total hrs: ${fmt(pilotTotals.totalTime)} of ${fmt(job.reqMinTotalHours)} req.`); structured.totalHours = 'missing';
    }
  } else if (pilotTotals.totalTime > 0) {
    matched.push(`${fmt(pilotTotals.totalTime)} total hrs`);
  }

  // PIC hours
  if (job.reqMinPicHours) {
    if (pilotTotals.picTime >= job.reqMinPicHours) {
      matched.push(`${fmt(pilotTotals.picTime)} PIC hrs · req. ${fmt(job.reqMinPicHours)}`); structured.picHours = 'matched';
    } else if (pilotTotals.picTime >= job.reqMinPicHours * 0.9) {
      marginal.push(`PIC hrs: ${fmt(pilotTotals.picTime)} of ${fmt(job.reqMinPicHours)}`); structured.picHours = 'marginal';
    } else {
      missing.push(`PIC hrs: ${fmt(pilotTotals.picTime)} of ${fmt(job.reqMinPicHours)} req.`); structured.picHours = 'missing';
    }
  }

  // Multi-engine
  if (job.reqMinMultiEngineHours) {
    const ratio = pilotTotals.multiEngineTime / job.reqMinMultiEngineHours;
    if (ratio >= 1)        { matched.push(`${fmt(pilotTotals.multiEngineTime)} multi-engine hrs`); structured.multiEngineHours = 'matched'; }
    else if (ratio >= 0.8) { marginal.push(`Multi-engine hrs: ${fmt(pilotTotals.multiEngineTime)} of ${fmt(job.reqMinMultiEngineHours)}`); structured.multiEngineHours = 'marginal'; }
    else                   { missing.push(`Multi-engine hrs: ${fmt(pilotTotals.multiEngineTime)} of ${fmt(job.reqMinMultiEngineHours)} req.`); structured.multiEngineHours = 'missing'; }
  }

  // Turbine
  if (job.reqMinTurbineHours) {
    const ratio = pilotTotals.turbineTime / job.reqMinTurbineHours;
    if (ratio >= 1)        { matched.push(`${fmt(pilotTotals.turbineTime)} turbine hrs`); structured.turbineHours = 'matched'; }
    else if (ratio >= 0.8) { marginal.push(`Turbine hrs: ${fmt(pilotTotals.turbineTime)} of ${fmt(job.reqMinTurbineHours)}`); structured.turbineHours = 'marginal'; }
    else                   { missing.push(`Turbine hrs: ${fmt(pilotTotals.turbineTime)} of ${fmt(job.reqMinTurbineHours)} req.`); structured.turbineHours = 'missing'; }
  }

  // Instrument hours
  if (job.reqMinInstrumentHours) {
    const ratio = pilotTotals.instrumentTime / job.reqMinInstrumentHours;
    if (ratio >= 1)        { matched.push(`${fmt(pilotTotals.instrumentTime)} instrument hrs`); structured.instrumentHours = 'matched'; }
    else if (ratio >= 0.8) { marginal.push(`Instrument hrs: ${fmt(pilotTotals.instrumentTime)} of ${fmt(job.reqMinInstrumentHours)}`); structured.instrumentHours = 'marginal'; }
    else                   { missing.push(`Instrument hrs: ${fmt(pilotTotals.instrumentTime)} of ${fmt(job.reqMinInstrumentHours)} req.`); structured.instrumentHours = 'missing'; }
  }

  // Cross-country hours
  if (job.reqMinCrossCountryHours) {
    const ratio = pilotTotals.crossCountryTime / job.reqMinCrossCountryHours;
    if (ratio >= 1)        { matched.push(`${fmt(pilotTotals.crossCountryTime)} cross-country hrs`); structured.crossCountryHours = 'matched'; }
    else if (ratio >= 0.8) { marginal.push(`Cross-country hrs: ${fmt(pilotTotals.crossCountryTime)} of ${fmt(job.reqMinCrossCountryHours)}`); structured.crossCountryHours = 'marginal'; }
    else                   { missing.push(`Cross-country hrs: ${fmt(pilotTotals.crossCountryTime)} of ${fmt(job.reqMinCrossCountryHours)} req.`); structured.crossCountryHours = 'missing'; }
  }

  // Aircraft type rating
  if (job.reqAircraftTypes.length > 0) {
    const met = job.reqAircraftTypes.filter((a) => ratingAircraft.includes(a.toLowerCase()));
    if (met.length) { matched.push(`${met.join(', ')} type rating`); structured.aircraftType = 'matched'; }
    else            { marginal.push(`No ${job.reqAircraftTypes.join(' or ')} type rating`); structured.aircraftType = 'marginal'; }
  }

  // Medical (hierarchy)
  if (job.reqMedicalClass) {
    if (medicalSatisfies(medicalClasses, job.reqMedicalClass)) {
      matched.push(`${job.reqMedicalClass.replace('_', ' ')} medical`); structured.medical = 'matched';
    } else {
      missing.push(`${job.reqMedicalClass.replace('_', ' ')} medical required`); structured.medical = 'missing';
    }
  }

  // Work authorisation
  if (job.reqWorkAuthorization) {
    if (rtwSatisfies(pilot.rightToWork, job.reqWorkAuthorization)) {
      matched.push(`Right to work: ${job.reqWorkAuthorization}`); structured.workAuthorization = 'matched';
    } else {
      missing.push(`Right to work (${job.reqWorkAuthorization}) required`); structured.workAuthorization = 'missing';
    }
  }

  // English level
  if (job.reqEnglishLevel) {
    const elpCert = pilot.certificates.find((c) => c.type === 'ELP');
    const pilotLevel = parseElpLevel(elpCert?.englishLevel);
    if (pilotLevel != null && pilotLevel >= job.reqEnglishLevel) {
      matched.push(`ICAO Level ${pilotLevel} English`); structured.englishLevel = 'matched';
    } else {
      missing.push(`ICAO Level ${job.reqEnglishLevel} English required`); structured.englishLevel = 'missing';
    }
  }

  // Education
  if (job.reqEducation) {
    const pilotRank = EDU_RANK[pilot.education] ?? 0;
    const reqRank   = EDU_RANK[job.reqEducation] ?? 0;
    if (pilotRank >= reqRank) {
      matched.push(`${pilot.education?.replace('_', ' ')} education`); structured.education = 'matched';
    } else {
      missing.push(`${job.reqEducation.replace('_', ' ')} education required`); structured.education = 'missing';
    }
  }

  // Willing to relocate
  if (job.reqWillingToRelocate) {
    if (pilot.willingToRelocate) { matched.push('Willing to relocate'); structured.willingToRelocate = 'matched'; }
    else                         { marginal.push('Job prefers willing to relocate'); structured.willingToRelocate = 'marginal'; }
  }

  return { matched, missing, marginal, structured };
}

// ─── Match runners ────────────────────────────────────────────────────────────

async function matchJobToAllPilots(job) {
  const pilots = await prisma.pilot.findMany({
    include: { certificates: true, ratings: true, medicals: true, rightToWork: true },
  });

  const matched = [];
  for (const pilot of pilots) {
    const totals = await getPilotFlightTotals(pilot.id);
    const score = computeMatchScore(pilot, totals, job);
    if (score !== null && score >= 60) {
      matched.push({ pilot, score, totals });
    }
  }

  for (const { pilot, score, totals } of matched) {
    try {
      const existing = await prisma.jobAlert.findUnique({
        where: { pilotId_jobId: { pilotId: pilot.id, jobId: job.id } },
      });
      if (existing) continue;

      const breakdown = computeMatchBreakdown(pilot, totals, job);
      const alert = await prisma.jobAlert.create({
        data: { pilotId: pilot.id, jobId: job.id, matchScore: score, breakdown },
        include: { job: true },
      });

      if (pilot.fcmToken) {
        await notificationService.sendJobAlert(pilot.fcmToken, job, score, alert);
        await prisma.jobAlert.update({
          where: { id: alert.id },
          data: { notifiedAt: new Date() },
        });
      }
    } catch (err) {
      logger.error(`Failed to create alert for pilot ${pilot.id}: ${err.message}`);
    }
  }

  logger.info(`Job ${job.id} matched ${matched.length} pilots`);
}

async function runFullMatch() {
  logger.info('Running full matching pass...');
  const jobs = await prisma.job.findMany({ where: { status: 'ACTIVE' } });
  for (const job of jobs) {
    await matchJobToAllPilots(job);
  }
  logger.info('Full matching pass complete');
}

async function runMatchForPilot(pilotId) {
  const pilot = await prisma.pilot.findUnique({
    where: { id: pilotId },
    include: { certificates: true, ratings: true, medicals: true, rightToWork: true },
  });
  if (!pilot) return 0;

  const totals = await getPilotFlightTotals(pilotId);
  const jobs = await prisma.job.findMany({ where: { status: 'ACTIVE' } });

  let matched = 0;
  for (const job of jobs) {
    const score = computeAlertScore(pilot, totals, job);
    if (score === null || score < 40) continue;
    try {
      const exists = await prisma.jobAlert.findUnique({
        where: { pilotId_jobId: { pilotId, jobId: job.id } },
      });
      if (exists) {
        const breakdown = computeMatchBreakdown(pilot, totals, job);
        await prisma.jobAlert.update({
          where: { pilotId_jobId: { pilotId, jobId: job.id } },
          data: { matchScore: score, breakdown },
        });
        continue;
      }
      const breakdown = computeMatchBreakdown(pilot, totals, job);
      await prisma.jobAlert.create({
        data: { pilotId, jobId: job.id, matchScore: score, breakdown },
      });
      matched++;
    } catch (err) {
      logger.error(`runMatchForPilot alert error: ${err.message}`);
    }
  }
  logger.info(`Pilot ${pilotId}: ${matched} new alerts created`);
  return matched;
}

module.exports = {
  matchJobToAllPilots,
  runFullMatch,
  runMatchForPilot,
  computeMatchScore,
  computeAlertScore,
  getPilotFlightTotals,
  computeMatchBreakdown,
  medicalSatisfies,
  getQualifiedMedicalClasses,
};
