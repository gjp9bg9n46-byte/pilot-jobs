'use strict';
/**
 * ⚠ DATABASE SAFETY
 * DO NOT use --force-reset. Use prisma migrate dev for development
 * and prisma migrate deploy for production.
 * Force-reset wipes ALL data with no recovery path.
 * Run scripts/backup-db.js before any destructive schema operation.
 */

#!/usr/bin/env node
'use strict';

/**
 * Remove seeded fake jobs from the database.
 *
 * Fake jobs created by prisma/seed.js have sourcePlatform = null.
 * Real scraped jobs always have a sourcePlatform set (LEVER, GREENHOUSE, etc.).
 *
 * Usage:
 *   node scripts/clear-fake-jobs.js
 *   railway run node scripts/clear-fake-jobs.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // First delete dependent records that reference the fake jobs
  const fakeJobIds = (
    await prisma.job.findMany({ where: { sourcePlatform: null }, select: { id: true } })
  ).map((j) => j.id);

  if (!fakeJobIds.length) {
    console.log('No fake jobs found — nothing to do.');
    return;
  }

  console.log(`Found ${fakeJobIds.length} fake jobs. Deleting dependants...`);

  await Promise.all([
    prisma.jobAlert.deleteMany({ where: { jobId: { in: fakeJobIds } } }),
    prisma.savedJob.deleteMany({ where: { jobId: { in: fakeJobIds } } }),
    prisma.application.deleteMany({ where: { jobId: { in: fakeJobIds } } }),
    prisma.jobReport.deleteMany({ where: { jobId: { in: fakeJobIds } } }),
  ]);

  const { count } = await prisma.job.deleteMany({ where: { sourcePlatform: null } });
  console.log(`Deleted ${count} fake jobs.`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
