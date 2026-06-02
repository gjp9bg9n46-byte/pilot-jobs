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
 * One-time salary backfill — regex-extracts salaries from existing job descriptions.
 *
 * Targets active jobs that have a description but no salary data yet.
 * Structured Workday baseSalary already wins (those rows already have salary populated);
 * this script only fills in rows where salary is null.
 *
 * node scripts/backfill-salaries.js [--dry-run] [--limit N]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../src/config/database');
const { extractSalary } = require('../src/scrapers/normalize');

const args     = process.argv.slice(2);
const dryRun   = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit    = limitIdx !== -1 ? Number(args[limitIdx + 1]) : null;

async function main() {
  if (dryRun) console.log('[dry-run] No DB writes will be made.\n');

  const rows = await prisma.job.findMany({
    where: {
      status: 'ACTIVE',
      salaryMin: null,
      salaryMax: null,
      description: { gt: '' },
    },
    select: { id: true, title: true, company: true, description: true },
    orderBy: { createdAt: 'desc' },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`Active jobs with no salary, with description : ${rows.length}\n`);

  let found = 0, written = 0;
  const samples = [];

  for (const row of rows) {
    const sal = extractSalary(row.description);
    if (!sal) continue;
    found++;

    if (samples.length < 3) samples.push({ row, sal });

    if (!dryRun) {
      await prisma.job.update({
        where: { id: row.id },
        data: {
          salaryMin:      sal.salaryMin,
          salaryMax:      sal.salaryMax,
          salaryCurrency: sal.salaryCurrency,
          salaryPeriod:   sal.salaryPeriod,
        },
      });
      written++;
    }
  }

  console.log(`── Results ───────────────────────────────────────────`);
  console.log(`  Candidates scanned  : ${rows.length}`);
  console.log(`  Salary found        : ${found}`);
  console.log(`  Written to DB       : ${dryRun ? '[dry-run — 0]' : written}`);
  console.log('');

  if (samples.length > 0) {
    console.log('── Sample extractions ────────────────────────────────');
    for (const { row, sal } of samples) {
      const range = [sal.salaryMin, sal.salaryMax]
        .filter((n) => n != null)
        .join(' – ');
      console.log(`  ${row.title} — ${row.company}`);
      console.log(`    Salary: ${sal.salaryCurrency} ${range} / ${sal.salaryPeriod}`);
      // Find and print the matching snippet from the description
      const snippet = (row.description || '').match(/.{0,60}[\d,k€£$].{0,60}/i)?.[0]?.trim();
      if (snippet) console.log(`    Source: "…${snippet}…"`);
      console.log('');
    }
  }
}

main()
  .catch((err) => { console.error('\nFatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
