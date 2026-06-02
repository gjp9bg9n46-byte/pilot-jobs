'use strict';
/**
 * ⚠ DATABASE SAFETY
 * DO NOT use --force-reset. Use prisma migrate dev for development
 * and prisma migrate deploy for production.
 * Force-reset wipes ALL data with no recovery path.
 * Run scripts/backup-db.js before any destructive schema operation.
 */


/**
 * One-time script: recompute all job alerts against current pilot profiles.
 * - Stale alerts (score null or < threshold after recompute) are deleted.
 * - Live alerts get updated score + breakdown.
 * Run: node scripts/recompute-alerts.js
 */

const prisma = require('../src/config/database');
const {
  computeMatchScore,
  computeAlertScore,
  computeMatchBreakdown,
  getPilotFlightTotals,
} = require('../src/services/matchingService');

// An alert was created via matchJobToAllPilots (strict, threshold 60) OR
// runMatchForPilot (lenient, threshold 40). We recompute using the lenient
// alert score for retention (same as runMatchForPilot), delete if null or < 40.
const RETAIN_THRESHOLD = 40;

async function main() {
  const allAlerts = await prisma.jobAlert.findMany({
    include: {
      job: true,
      pilot: {
        include: { certificates: true, ratings: true, medicals: true, rightToWork: true },
      },
    },
  });

  console.log(`\nTotal alerts before: ${allAlerts.length}`);

  const totalsCache = new Map();
  async function getTotals(pilotId) {
    if (!totalsCache.has(pilotId)) {
      totalsCache.set(pilotId, await getPilotFlightTotals(pilotId));
    }
    return totalsCache.get(pilotId);
  }

  let deleted = 0;
  let updated = 0;
  let errors = 0;

  for (const alert of allAlerts) {
    try {
      const { pilot, job } = alert;
      if (!pilot || !job) {
        await prisma.jobAlert.delete({ where: { id: alert.id } });
        deleted++;
        continue;
      }

      const totals = await getTotals(pilot.id);
      const score = computeAlertScore(pilot, totals, job);

      if (score === null || score < RETAIN_THRESHOLD) {
        await prisma.jobAlert.delete({ where: { id: alert.id } });
        deleted++;
      } else {
        const breakdown = computeMatchBreakdown(pilot, totals, job);
        await prisma.jobAlert.update({
          where: { id: alert.id },
          data: { matchScore: score, breakdown },
        });
        updated++;
      }
    } catch (err) {
      console.error(`Alert ${alert.id}: ${err.message}`);
      errors++;
    }
  }

  const remaining = await prisma.jobAlert.count();
  console.log(`\nRecompute complete:`);
  console.log(`  Updated  : ${updated}`);
  console.log(`  Deleted  : ${deleted}`);
  console.log(`  Errors   : ${errors}`);
  console.log(`  Remaining: ${remaining}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
