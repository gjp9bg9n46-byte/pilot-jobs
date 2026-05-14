const prisma = require('../config/database');
const notificationService = require('./notificationService');
const logger = require('../config/logger');

/**
 * Score how well a pilot matches a job (0–100).
 * Returns null if any hard requirement fails.
 */
function computeMatchScore(pilot, pilotTotals, job) {
  let score = 0;
  const maxScore = 100;

  const certTypes = pilot.certificates.map((c) => c.type);
  const certAuthorities = pilot.certificates.map((c) => c.issuingAuthority);
  const ratingAircraft = pilot.ratings.map((r) => r.aircraftType.toLowerCase());
  const medicalClasses = pilot.medicals.map((m) => m.medicalClass);

  // Hard requirement: certificate type
  if (job.reqCertificates.length > 0) {
    const hasRequiredCert = job.reqCertificates.some((rc) => certTypes.includes(rc));
    if (!hasRequiredCert) return null;
    score += 20;
  } else {
    score += 20;
  }

  // Hard requirement: issuing authority
  if (job.reqAuthorities.length > 0) {
    const hasAuthority = job.reqAuthorities.some((a) => certAuthorities.includes(a));
    if (!hasAuthority) return null;
    score += 20;
  } else {
    score += 20;
  }

  // Hard requirement: minimum total hours
  if (job.reqMinTotalHours && pilotTotals.totalTime < job.reqMinTotalHours) return null;
  score += job.reqMinTotalHours ? 10 : 10;

  // Hard requirement: minimum PIC hours
  if (job.reqMinPicHours && pilotTotals.picTime < job.reqMinPicHours) return null;
  score += job.reqMinPicHours ? 10 : 10;

  // Soft: multi-engine hours
  if (job.reqMinMultiEngineHours) {
    if (pilotTotals.multiEngineTime >= job.reqMinMultiEngineHours) score += 10;
    else score += Math.floor((pilotTotals.multiEngineTime / job.reqMinMultiEngineHours) * 10);
  } else {
    score += 10;
  }

  // Soft: turbine hours
  if (job.reqMinTurbineHours) {
    if (pilotTotals.turbineTime >= job.reqMinTurbineHours) score += 10;
    else score += Math.floor((pilotTotals.turbineTime / job.reqMinTurbineHours) * 10);
  } else {
    score += 10;
  }

  // Soft: aircraft type rating
  if (job.reqAircraftTypes.length > 0) {
    const hasRating = job.reqAircraftTypes.some((a) =>
      ratingAircraft.includes(a.toLowerCase())
    );
    score += hasRating ? 10 : 0;
  } else {
    score += 10;
  }

  // Soft: medical class
  if (job.reqMedicalClass) {
    score += medicalClasses.includes(job.reqMedicalClass) ? 10 : 0;
  } else {
    score += 10;
  }

  return Math.min(Math.round((score / maxScore) * 100), 100);
}

async function getPilotFlightTotals(pilotId) {
  const logs = await prisma.flightLog.findMany({ where: { pilotId } });
  return logs.reduce(
    (acc, log) => {
      acc.totalTime += log.totalTime;
      acc.picTime += log.picTime;
      acc.multiEngineTime += log.multiEngineTime;
      acc.turbineTime += log.turbineTime;
      acc.instrumentTime += log.instrumentTime;
      return acc;
    },
    { totalTime: 0, picTime: 0, multiEngineTime: 0, turbineTime: 0, instrumentTime: 0 }
  );
}

async function matchJobToAllPilots(job) {
  const pilots = await prisma.pilot.findMany({
    include: { certificates: true, ratings: true, medicals: true },
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
        data: {
          pilotId: pilot.id,
          jobId: job.id,
          matchScore: score,
          breakdown,
        },
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

/**
 * Returns terse per-criterion strings in three buckets.
 * Called after we know the pilot qualifies (score !== null).
 */
function computeMatchBreakdown(pilot, pilotTotals, job) {
  const matched = [];
  const missing = [];
  const marginal = [];

  const certTypes = pilot.certificates.map((c) => c.type);
  const certAuthorities = pilot.certificates.map((c) => c.issuingAuthority);
  const ratingAircraft = pilot.ratings.map((r) => r.aircraftType.toLowerCase());
  const medicalClasses = pilot.medicals.map((m) => m.medicalClass);
  const fmt = (n) => Math.round(n).toLocaleString();

  // Certificates
  if (job.reqCertificates.length > 0) {
    const met = job.reqCertificates.filter((rc) => certTypes.includes(rc));
    if (met.length) matched.push(`${met.join(', ')} certificate`);
    else missing.push(`${job.reqCertificates.join(' or ')} certificate required`);
  }

  // Authorities
  if (job.reqAuthorities.length > 0) {
    const met = job.reqAuthorities.filter((a) => certAuthorities.includes(a));
    if (met.length) matched.push(`${met.join(', ')} authority`);
    else missing.push(`${job.reqAuthorities.join(' or ')} authority required`);
  }

  // Total hours
  if (job.reqMinTotalHours) {
    if (pilotTotals.totalTime >= job.reqMinTotalHours) {
      matched.push(`${fmt(pilotTotals.totalTime)} total hrs · req. ${fmt(job.reqMinTotalHours)}`);
    } else if (pilotTotals.totalTime >= job.reqMinTotalHours * 0.9) {
      marginal.push(`Total hrs: ${fmt(pilotTotals.totalTime)} of ${fmt(job.reqMinTotalHours)}`);
    } else {
      missing.push(`Total hrs: ${fmt(pilotTotals.totalTime)} of ${fmt(job.reqMinTotalHours)} req.`);
    }
  } else if (pilotTotals.totalTime > 0) {
    matched.push(`${fmt(pilotTotals.totalTime)} total hrs`);
  }

  // PIC hours
  if (job.reqMinPicHours) {
    if (pilotTotals.picTime >= job.reqMinPicHours) {
      matched.push(`${fmt(pilotTotals.picTime)} PIC hrs · req. ${fmt(job.reqMinPicHours)}`);
    } else if (pilotTotals.picTime >= job.reqMinPicHours * 0.9) {
      marginal.push(`PIC hrs: ${fmt(pilotTotals.picTime)} of ${fmt(job.reqMinPicHours)}`);
    } else {
      missing.push(`PIC hrs: ${fmt(pilotTotals.picTime)} of ${fmt(job.reqMinPicHours)} req.`);
    }
  }

  // Multi-engine
  if (job.reqMinMultiEngineHours) {
    const ratio = job.reqMinMultiEngineHours ? pilotTotals.multiEngineTime / job.reqMinMultiEngineHours : 1;
    if (ratio >= 1) matched.push(`${fmt(pilotTotals.multiEngineTime)} multi-engine hrs`);
    else if (ratio >= 0.8) marginal.push(`Multi-engine hrs: ${fmt(pilotTotals.multiEngineTime)} of ${fmt(job.reqMinMultiEngineHours)}`);
    else missing.push(`Multi-engine hrs: ${fmt(pilotTotals.multiEngineTime)} of ${fmt(job.reqMinMultiEngineHours)} req.`);
  }

  // Turbine
  if (job.reqMinTurbineHours) {
    const ratio = job.reqMinTurbineHours ? pilotTotals.turbineTime / job.reqMinTurbineHours : 1;
    if (ratio >= 1) matched.push(`${fmt(pilotTotals.turbineTime)} turbine hrs`);
    else if (ratio >= 0.8) marginal.push(`Turbine hrs: ${fmt(pilotTotals.turbineTime)} of ${fmt(job.reqMinTurbineHours)}`);
    else missing.push(`Turbine hrs: ${fmt(pilotTotals.turbineTime)} of ${fmt(job.reqMinTurbineHours)} req.`);
  }

  // Aircraft type rating
  if (job.reqAircraftTypes.length > 0) {
    const met = job.reqAircraftTypes.filter((a) => ratingAircraft.includes(a.toLowerCase()));
    if (met.length) matched.push(`${met.join(', ')} type rating`);
    else marginal.push(`No ${job.reqAircraftTypes.join(' or ')} type rating`);
  }

  // Medical
  if (job.reqMedicalClass) {
    if (medicalClasses.includes(job.reqMedicalClass)) {
      matched.push(`${job.reqMedicalClass.replace('_', ' ')} medical`);
    } else {
      missing.push(`${job.reqMedicalClass.replace('_', ' ')} medical required`);
    }
  }

  return { matched, missing, marginal };
}

module.exports = { matchJobToAllPilots, runFullMatch, computeMatchScore, getPilotFlightTotals, computeMatchBreakdown };
