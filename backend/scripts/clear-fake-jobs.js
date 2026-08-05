#!/usr/bin/env node
'use strict';
/**
 * ⚠ DATABASE SAFETY
 * DO NOT use --force-reset. Use prisma migrate dev for development
 * and prisma migrate deploy for production.
 * Force-reset wipes ALL data with no recovery path.
 * Run scripts/backup-db.js before any destructive schema operation.
 */

/**
 * Remove seeded fake jobs AND legacy-scraper rows from the database.
 *
 * Targets rows with sourcePlatform = null, which covers:
 *   - fake jobs created by prisma/seed.js
 *   - rows written by the retired legacy scraper (src/services/scraperService.js
 *     pre-2026-08-05), which set only sourceUrl — these were invisible to
 *     every staleness sweep (expireUnseen skips sourcePlatform=null), so
 *     they lingered with dead apply links.
 *
 * Never touches:
 *   - scraped rows (sourcePlatform = 'LEVER' | 'GREENHOUSE' | ...)
 *   - first-party employer posts (sourcePlatform = 'EMPLOYER_DIRECT';
 *     postedByEmployerId guard below is belt-and-braces)
 *
 * Usage:
 *   node scripts/clear-fake-jobs.js            # DRY RUN — reports what would be deleted
 *   node scripts/clear-fake-jobs.js --apply    # actually delete
 *   railway run node scripts/clear-fake-jobs.js --apply
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

async function main() {
  const where = { sourcePlatform: null, postedByEmployerId: null };

  const targets = await prisma.job.findMany({
    where,
    select: { id: true, title: true, company: true, sourceUrl: true, status: true },
  });

  if (!targets.length) {
    console.log('No fake/legacy jobs found — nothing to do.');
    return;
  }

  const bySource = {};
  for (const j of targets) {
    const k = j.sourceUrl || '(no sourceUrl — seed)';
    bySource[k] = (bySource[k] || 0) + 1;
  }
  console.log(`Found ${targets.length} fake/legacy jobs:`);
  for (const [src, n] of Object.entries(bySource)) console.log(`  ${n.toString().padStart(5)}  ${src}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --apply to delete.');
    return;
  }

  const ids = targets.map((j) => j.id);
  console.log('Deleting dependants...');
  await Promise.all([
    prisma.jobAlert.deleteMany({ where: { jobId: { in: ids } } }),
    prisma.savedJob.deleteMany({ where: { jobId: { in: ids } } }),
    prisma.application.deleteMany({ where: { jobId: { in: ids } } }),
    prisma.jobReport.deleteMany({ where: { jobId: { in: ids } } }),
  ]);

  const { count } = await prisma.job.deleteMany({ where: { id: { in: ids } } });
  console.log(`Deleted ${count} fake/legacy jobs.`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
