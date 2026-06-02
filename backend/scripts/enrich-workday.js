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
 * Workday JSON-LD enrichment script.
 *
 * Targets active jobs whose applyUrl is a Workday domain and which have not
 * been enriched from Workday within the last 14 days.
 *
 * node scripts/enrich-workday.js [--dry-run] [--limit N] [--force]
 *
 * --dry-run   Fetch and parse but do not write to DB.
 * --limit N   Process at most N jobs.
 * --force     Ignore the 14-day skip guard (re-enriches all Workday jobs).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../src/config/database');
const { enrichWorkdayBatch } = require('../src/scrapers/workday-enrichment');

const args      = process.argv.slice(2);
const dryRun    = args.includes('--dry-run');
const force     = args.includes('--force');
const limitIdx  = args.indexOf('--limit');
const hardLimit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : null;

const SKIP_DAYS = 14;
const WORKDAY_PATTERN = '%myworkday%'; // matches myworkdayjobs.com and myworkdaysite.com

async function main() {
  if (dryRun) console.log('[dry-run] No DB writes will be made.\n');
  if (force)  console.log('[--force] Ignoring 14-day skip guard.\n');

  const cutoff = new Date(Date.now() - SKIP_DAYS * 24 * 60 * 60 * 1000);

  const rows = force
    ? await prisma.$queryRaw`
        SELECT id, title, company, "applyUrl", description, "contractType",
               "reqCertificates", "reqAuthorities", "reqAircraftTypes",
               "reqMedicalClass", "reqMinTotalHours", "reqMinPicHours",
               "reqMinMultiEngineHours", "reqMinTurbineHours", "reqMinInstrumentHours",
               "reqMinCrossCountryHours", "reqEducation", "reqWorkAuthorization",
               "reqEnglishLevel", "reqWillingToRelocate"
        FROM "Job"
        WHERE status = 'ACTIVE'
          AND "applyUrl" ILIKE ${WORKDAY_PATTERN}
        ORDER BY "lastEnrichedFromWorkdayAt" ASC NULLS FIRST
      `
    : await prisma.$queryRaw`
        SELECT id, title, company, "applyUrl", description, "contractType",
               "reqCertificates", "reqAuthorities", "reqAircraftTypes",
               "reqMedicalClass", "reqMinTotalHours", "reqMinPicHours",
               "reqMinMultiEngineHours", "reqMinTurbineHours", "reqMinInstrumentHours",
               "reqMinCrossCountryHours", "reqEducation", "reqWorkAuthorization",
               "reqEnglishLevel", "reqWillingToRelocate"
        FROM "Job"
        WHERE status = 'ACTIVE'
          AND "applyUrl" ILIKE ${WORKDAY_PATTERN}
          AND ("lastEnrichedFromWorkdayAt" IS NULL OR "lastEnrichedFromWorkdayAt" < ${cutoff})
        ORDER BY "lastEnrichedFromWorkdayAt" ASC NULLS FIRST
      `;

  const jobs = hardLimit ? rows.slice(0, hardLimit) : rows;

  console.log(`Workday jobs eligible      : ${rows.length}`);
  if (hardLimit) console.log(`Processing (limited to)    : ${hardLimit}`);
  console.log('');

  if (jobs.length === 0) {
    console.log('Nothing to enrich. Exiting.');
    return;
  }

  const results = await enrichWorkdayBatch(jobs, {
    onProgress(n, total) {
      process.stdout.write(`\r  Fetching Workday pages… ${n}/${total}`);
    },
  });
  console.log('\n');

  let withSalary = 0, withDates = 0, noJsonLd = 0, errors = 0, written = 0;
  const salaryRows = [];
  const noJsonLdRows = [];
  const errorRows = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const job = jobs[i];

    if (result.error) {
      errors++;
      errorRows.push({ job, reason: result.error });
      continue;
    }

    if (result.noJsonLd) {
      noJsonLd++;
      noJsonLdRows.push({ job, reason: result.reason });
      if (!dryRun) {
        // Still mark as attempted — won't retry for 14 days
        await prisma.job.update({
          where: { id: result.id },
          data: { lastEnrichedFromWorkdayAt: new Date() },
        });
      }
      continue;
    }

    const { updates } = result;
    const hasSalary = updates.salaryMin != null || updates.salaryMax != null;
    const hasDates  = updates.postedAt != null || updates.expiresAt != null;
    if (hasSalary) { withSalary++; salaryRows.push({ job, result }); }
    if (hasDates)  withDates++;

    if (!dryRun) {
      written++;
      await prisma.job.update({ where: { id: result.id }, data: updates });
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('── Results ──────────────────────────────────────────────────────');
  console.log(`  Processed            : ${jobs.length}`);
  console.log(`  Got salary data      : ${withSalary}`);
  console.log(`  Got dates            : ${withDates}`);
  console.log(`  No JSON-LD (logged)  : ${noJsonLd}`);
  console.log(`  Errors               : ${errors}`);
  console.log(`  Written to DB        : ${dryRun ? '[dry-run — 0]' : written}`);
  console.log('');

  if (salaryRows.length > 0) {
    console.log('── Jobs with salary data ─────────────────────────────────────────');
    salaryRows.forEach(({ job, result: { updates: u } }) => {
      const sal = [u.salaryMin, u.salaryMax].filter((n) => n != null).join('–');
      console.log(`  ${job.title} — ${job.company}`);
      console.log(`    Salary: ${u.salaryCurrency || '?'} ${sal} / ${u.salaryPeriod || '?'}`);
      if (u.expiresAt) console.log(`    Expires: ${u.expiresAt.toISOString().slice(0, 10)}`);
    });
    console.log('');
  }

  if (noJsonLdRows.length > 0) {
    console.log('── No JSON-LD found ──────────────────────────────────────────────');
    noJsonLdRows.slice(0, 10).forEach(({ job, reason }) =>
      console.log(`  ${job.title} — ${job.company}: ${reason}`));
    if (noJsonLdRows.length > 10) console.log(`  ... and ${noJsonLdRows.length - 10} more`);
    console.log('');
  }

  if (errorRows.length > 0) {
    console.log('── Errors ────────────────────────────────────────────────────────');
    errorRows.forEach(({ job, reason }) => console.log(`  ${job.title} — ${job.company}: ${reason}`));
    console.log('');
  }
}

main()
  .catch((err) => { console.error('\nFatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
