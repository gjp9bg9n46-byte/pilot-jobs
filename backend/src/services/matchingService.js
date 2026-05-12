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
      matched.push({ pilot, score });
    }
  }

  for (const { pilot, score } of matched) {
    try {
      const existing = await prisma.jobAlert.findUnique({
        where: { pilotId_jobId: { pilotId: pilot.id, jobId: job.id } },
      });
      if (existing) continue;

      const alert = await prisma.jobAlert.create({
        data: { pilotId: pilot.id, jobId: job.id, matchScore: score },
      });

      if (pilot.fcmToken) {
        await notificationService.sendJobAlert(pilot.fcmToken, job, score);
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

module.exports = { matchJobToAllPilots, runFullMatch, computeMatchScore, getPilotFlightTotals };
