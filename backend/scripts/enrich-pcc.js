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
 * PCC enrichment script — two modes:
 *
 * DEFAULT (fetch mode):
 *   Fetches PCC detail pages for every Job where char_length(description) < 300
 *   and updates the full requirement set + description.
 *   node scripts/enrich-pcc.js [--limit N] [--dry-run]
 *
 * REEXTRACT mode:
 *   For every already-enriched PCC job (char_length(description) >= 300),
 *   re-runs extractRequirements against the stored description text — no HTTP.
 *   Updates: reqEducation, reqWorkAuthorization, reqEnglishLevel,
 *            reqMinCrossCountryHours, reqMinMultiEngineHours, reqMinTurbineHours.
 *   Idempotent: safe to run multiple times.
 *   node scripts/enrich-pcc.js --reextract [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const prisma = require('../src/config/database');
const { enrichPccBatch } = require('../src/scrapers/sources/pilotcareercentre');
const { extractRequirements } = require('../src/scrapers/normalize');

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const reextract = args.includes('--reextract');
const limitIdx  = args.indexOf('--limit');
const hardLimit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : null;

const OUT_OF_RANGE_HOURS = 20000;

// ── Reextract mode ─────────────────────────────────────────────────────────────

async function runReextract() {
  if (dryRun) console.log('[dry-run] No DB writes will be made.\n');

  const rows = await prisma.$queryRaw`
    SELECT id, title, company, description,
           "reqMinMultiEngineHours", "reqMinTurbineHours",
           "reqEducation", "reqWorkAuthorization", "reqEnglishLevel", "reqMinCrossCountryHours"
    FROM "Job"
    WHERE "sourcePlatform" = 'PILOTCAREERCENTRE'
      AND description NOT ILIKE '% is recruiting %'
    ORDER BY id
  `;

  console.log(`Enriched PCC jobs to reprocess: ${rows.length}\n`);

  let withNewFields = 0;
  const changedHours = [];
  const newFieldSamples = [];   // up to 3 jobs that got at least one new field

  for (const row of rows) {
    const reqs = extractRequirements(row.description);

    const hasNew = reqs.reqEducation != null ||
                   reqs.reqWorkAuthorization != null ||
                   reqs.reqEnglishLevel != null ||
                   reqs.reqMinCrossCountryHours != null;
    if (hasNew) {
      withNewFields++;
      if (newFieldSamples.length < 3) newFieldSamples.push({ row, reqs });
    }

    // Track hours changes from expanded patterns
    const hoursFields = ['reqMinMultiEngineHours', 'reqMinTurbineHours'];
    const changes = hoursFields
      .filter((f) => reqs[f] !== (row[f] ?? null))
      .map((f) => ({ field: f, before: row[f] ?? null, after: reqs[f] }));
    if (changes.length > 0) changedHours.push({ row, changes });

    if (!dryRun) {
      await prisma.job.update({
        where: { id: row.id },
        data: {
          reqEducation:            reqs.reqEducation            ?? null,
          reqWorkAuthorization:    reqs.reqWorkAuthorization    ?? null,
          reqEnglishLevel:         reqs.reqEnglishLevel         ?? null,
          reqMinCrossCountryHours: reqs.reqMinCrossCountryHours ?? null,
          reqMinMultiEngineHours:  reqs.reqMinMultiEngineHours  ?? null,
          reqMinTurbineHours:      reqs.reqMinTurbineHours      ?? null,
        },
      });
    }
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  console.log('── Results ──────────────────────────────────────────────────────');
  console.log(`  Total processed         : ${rows.length}`);
  console.log(`  Got ≥1 new field        : ${withNewFields}`);
  console.log(`  Hours values changed    : ${changedHours.length}`);
  if (dryRun) console.log('  [dry-run — no writes]');
  console.log('');

  if (newFieldSamples.length > 0) {
    console.log('── Sample jobs with new fields (before → after) ─────────────────');
    for (const { row, reqs } of newFieldSamples) {
      console.log(`\n  ${row.title} — ${row.company}`);
      console.log(`    reqEducation            : ${row.reqEducation ?? 'null'} → ${reqs.reqEducation ?? 'null'}`);
      console.log(`    reqWorkAuthorization    : ${row.reqWorkAuthorization ?? 'null'} → ${reqs.reqWorkAuthorization ?? 'null'}`);
      console.log(`    reqEnglishLevel         : ${row.reqEnglishLevel ?? 'null'} → ${reqs.reqEnglishLevel ?? 'null'}`);
      console.log(`    reqMinCrossCountryHours : ${row.reqMinCrossCountryHours ?? 'null'} → ${reqs.reqMinCrossCountryHours ?? 'null'}`);
    }
  } else {
    console.log('  No jobs received new field values.');
  }

  if (changedHours.length > 0) {
    console.log('\n── Hours values changed by expanded patterns ────────────────────');
    for (const { row, changes } of changedHours) {
      console.log(`\n  ${row.title} — ${row.company}`);
      for (const { field, before, after } of changes) {
        console.log(`    ${field}: ${before ?? 'null'} → ${after ?? 'null'}`);
      }
    }
  } else {
    console.log('\n  No existing hours values changed.');
  }
}

// ── Fetch mode (original enrichment) ──────────────────────────────────────────

async function runFetch() {
  if (dryRun) console.log('[dry-run] No DB writes will be made.\n');

  const rows = await prisma.$queryRaw`
    SELECT id, title, company, "sourceUrl", "reqAircraftTypes", description
    FROM "Job"
    WHERE "sourcePlatform" = 'PILOTCAREERCENTRE'
      AND description ILIKE '% is recruiting %'
      AND char_length(description) < 200
    ORDER BY "createdAt" DESC
  `;

  const jobs = hardLimit ? rows.slice(0, hardLimit) : rows;

  console.log(`Unenriched PCC jobs in DB : ${rows.length}`);
  if (hardLimit) console.log(`Processing (limited to)   : ${hardLimit}`);
  console.log('');

  if (jobs.length === 0) {
    console.log('Nothing to enrich. Exiting.');
    return;
  }

  const enriched = await enrichPccBatch(jobs, {
    onProgress(n, total) {
      process.stdout.write(`\r  Fetching detail pages… ${n}/${total}`);
    },
  });
  console.log('\n');

  let fetchCount   = 0;  // pages that returned content (non-null result)
  let successCount = 0;  // rows actually written to DB (0 in dry-run)
  let failCount    = 0;
  const successRows = [];

  for (let i = 0; i < enriched.length; i++) {
    const result = enriched[i];
    if (!result) { failCount++; continue; }

    fetchCount++;
    successRows.push({ job: jobs[i], result });

    if (!dryRun) {
      successCount++;
      await prisma.job.update({
        where: { id: result.id },
        data: {
          description:             result.description,
          notes:                   result.notes                   ?? null,
          reqCertificates:         result.reqCertificates         ?? [],
          reqAuthorities:          result.reqAuthorities          ?? [],
          reqAircraftTypes:        result.reqAircraftTypes        ?? [],
          reqMedicalClass:         result.reqMedicalClass         ?? null,
          reqMinTotalHours:        result.reqMinTotalHours        ?? null,
          reqMinPicHours:          result.reqMinPicHours          ?? null,
          reqMinMultiEngineHours:  result.reqMinMultiEngineHours  ?? null,
          reqMinTurbineHours:      result.reqMinTurbineHours      ?? null,
          reqMinInstrumentHours:   result.reqMinInstrumentHours   ?? null,
          reqMinCrossCountryHours: result.reqMinCrossCountryHours ?? null,
          reqEducation:            result.reqEducation            ?? null,
          reqWorkAuthorization:    result.reqWorkAuthorization    ?? null,
          reqEnglishLevel:         result.reqEnglishLevel         ?? null,
          reqWillingToRelocate:    result.reqWillingToRelocate    ?? false,
        },
      });
    }
  }

  console.log('── Results ────────────────────────────────────────────────────');
  console.log(`  Processed   : ${jobs.length}`);
  console.log(`  Fetched OK  : ${fetchCount}`);
  console.log(`  Written     : ${dryRun ? '[dry-run — 0]' : successCount}`);
  console.log(`  Failed      : ${failCount}`);
  console.log('');

  const sample = successRows.slice().sort(() => Math.random() - 0.5).slice(0, 10);
  console.log('── Random sample (10 enriched jobs) ───────────────────────────');
  for (const { job, result } of sample) {
    console.log(`\n  ${job.title} — ${job.company}`);
    console.log(`    reqAuthorities      : ${JSON.stringify(result.reqAuthorities)}`);
    console.log(`    reqCertificates     : ${JSON.stringify(result.reqCertificates)}`);
    console.log(`    reqAircraftTypes    : ${JSON.stringify(result.reqAircraftTypes)}`);
    console.log(`    reqMedicalClass     : ${result.reqMedicalClass ?? 'null'}`);
    console.log(`    reqMinTotalHours    : ${result.reqMinTotalHours ?? 'null'}`);
    console.log(`    reqMinPicHours      : ${result.reqMinPicHours ?? 'null'}`);
    console.log(`    reqEducation        : ${result.reqEducation ?? 'null'}`);
    console.log(`    reqWorkAuthorization: ${result.reqWorkAuthorization ?? 'null'}`);
    console.log(`    reqEnglishLevel     : ${result.reqEnglishLevel ?? 'null'}`);
    console.log(`    reqMinCrossCountryH.: ${result.reqMinCrossCountryHours ?? 'null'}`);
  }

  const suspicious = successRows.filter(({ result }) =>
    result.reqMinTotalHours != null && result.reqMinTotalHours > OUT_OF_RANGE_HOURS,
  );
  if (suspicious.length > 0) {
    console.log('\n── Out-of-range reqMinTotalHours (> 20,000 h) ─────────────────');
    for (const { job, result } of suspicious) {
      console.log(`  [${result.reqMinTotalHours}h] ${job.title} — ${job.company}`);
    }
  } else {
    console.log('\n  No out-of-range hour values detected.');
  }
}

// ── Entry point ────────────────────────────────────────────────────────────────

(reextract ? runReextract() : runFetch())
  .catch((err) => {
    console.error('\nFatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
