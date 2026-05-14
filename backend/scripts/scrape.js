#!/usr/bin/env node
'use strict';

/**
 * CLI for manual ingestion runs.
 *
 * Usage:
 *   node scripts/scrape.js                             # full pass
 *   node scripts/scrape.js --source LEVER              # one source
 *   node scripts/scrape.js --employer joby-aviation    # one employer slug
 *   node scripts/scrape.js --dry-run                   # fetch + normalize, print counts, no DB writes
 *   node scripts/scrape.js --source GREENHOUSE --dry-run
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { runIngestion } = require('../src/scrapers/index');

const args = process.argv.slice(2);

function flag(name) {
  return args.includes(name);
}

function option(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const source   = option('--source');
const employer = option('--employer');
const dryRun   = flag('--dry-run');

if (dryRun) {
  console.log('[dry-run] No writes to the database will be made.\n');
}

runIngestion({ source, employer, dryRun })
  .then((stats) => {
    console.log('\n── Ingestion summary ──────────────────────────');
    for (const s of stats) {
      console.log(
        `  ${s.source} / ${s.employer}: ` +
        `fetched=${s.fetched} kept=${s.keptAfterFilter} ` +
        (dryRun ? '' : `upserted=${s.upserted} inactive=${s.markedInactive} `) +
        `errors=${s.errors}`,
      );
    }
    const totals = stats.reduce(
      (a, s) => ({ fetched: a.fetched + s.fetched, kept: a.kept + s.keptAfterFilter }),
      { fetched: 0, kept: 0 },
    );
    console.log(`\n  Total: fetched=${totals.fetched} aviation-roles=${totals.kept}`);
    if (dryRun) console.log('\n  [dry-run] No changes written.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });
