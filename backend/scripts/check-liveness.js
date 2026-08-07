#!/usr/bin/env node
'use strict';

/**
 * Nightly apply-link liveness checker (launch-gate: apply-link trust).
 *
 * Probes every ACTIVE job's applyUrl (HEAD → GET fallback, through http.js so
 * UA / robots.txt / rate-limit all apply) and acts on the verdict:
 *   - dead     (404 / 410 / parked-domain page) → expire the job immediately.
 *   - transient(timeout / 5xx / connection error) → bump livenessFailures;
 *     expire only after 3 consecutive failures (a flapping ATS shouldn't wipe
 *     good rows on one bad night).
 *   - alive    (2xx/3xx, real content) → reset livenessFailures to 0.
 *   - skip     (robots-disallowed / 401 / 403 / 429 / anti-bot / unparseable)
 *     → we can't judge, so leave the row and its counter untouched.
 *
 * Every probed row gets lastLivenessCheckAt stamped (except robots-skip, which
 * we couldn't check at all). First-party employer posts are never swept — their
 * apply link is the employer's own and they're not scrape-managed.
 *
 *   node scripts/check-liveness.js [--limit N] [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../src/config/database');
const logger = require('../src/config/logger');
const { checkLiveness } = require('../src/scrapers/http');

const EXPIRE_AFTER = 3; // consecutive transient failures before expiry

async function checkActiveJobLiveness({ limit = 1000, dryRun = false } = {}) {
  // Oldest-checked first so a capped run still cycles through the whole set over
  // successive nights. Scraped rows only (never first-party employer posts).
  const jobs = await prisma.job.findMany({
    where: { status: 'ACTIVE', postedByEmployerId: null, applyUrl: { not: '' } },
    select: { id: true, applyUrl: true, company: true, title: true, livenessFailures: true },
    orderBy: [{ lastLivenessCheckAt: { sort: 'asc', nulls: 'first' } }],
    take: limit,
  });

  let expired = 0, alive = 0, transient = 0, skipped = 0, dead = 0;

  for (const j of jobs) {
    const { verdict, status, reason } = await checkLiveness(j.applyUrl, { source: 'LIVENESS' });
    const now = new Date();

    if (verdict === 'skip') {
      // Couldn't judge (robots/auth/anti-bot). Leave the row and counter as-is;
      // don't even stamp lastLivenessCheckAt for robots-disallowed (never checked).
      skipped++;
      if (status != null && !dryRun) {
        await prisma.job.update({ where: { id: j.id }, data: { lastLivenessCheckAt: now } });
      }
      continue;
    }

    if (verdict === 'alive') {
      alive++;
      if (!dryRun) await prisma.job.update({ where: { id: j.id }, data: { lastLivenessCheckAt: now, livenessFailures: 0 } });
      continue;
    }

    if (verdict === 'dead') {
      dead++; expired++;
      logger.warn({ source: 'LIVENESS', id: j.id, company: j.company, title: j.title, url: j.applyUrl, status, reason, msg: 'apply link dead — expiring' });
      if (!dryRun) await prisma.job.update({ where: { id: j.id }, data: { status: 'EXPIRED', lastLivenessCheckAt: now } });
      continue;
    }

    // transient
    transient++;
    const failures = (j.livenessFailures || 0) + 1;
    if (failures >= EXPIRE_AFTER) {
      expired++;
      logger.warn({ source: 'LIVENESS', id: j.id, company: j.company, url: j.applyUrl, status, reason, failures, msg: `apply link failed ${failures}x consecutively — expiring` });
      if (!dryRun) await prisma.job.update({ where: { id: j.id }, data: { status: 'EXPIRED', lastLivenessCheckAt: now, livenessFailures: failures } });
    } else {
      logger.info({ source: 'LIVENESS', id: j.id, url: j.applyUrl, status, reason, failures, msg: 'transient failure — will retry next run' });
      if (!dryRun) await prisma.job.update({ where: { id: j.id }, data: { lastLivenessCheckAt: now, livenessFailures: failures } });
    }
  }

  logger.info({ source: 'LIVENESS', considered: jobs.length, alive, dead, transient, skipped, expired, dryRun, msg: 'liveness check complete' });
  return { considered: jobs.length, alive, dead, transient, skipped, expired };
}

module.exports = { checkActiveJobLiveness };

if (require.main === module) {
  const li = process.argv.indexOf('--limit');
  const limit = li >= 0 ? parseInt(process.argv[li + 1], 10) : 1000;
  const dryRun = process.argv.includes('--dry-run');
  checkActiveJobLiveness({ limit, dryRun })
    .then((r) => { console.log(JSON.stringify(r)); return prisma.$disconnect(); })
    .then(() => process.exit(0))
    .catch((e) => { console.error('LIVENESS FAILED:', e.message); process.exit(1); });
}
