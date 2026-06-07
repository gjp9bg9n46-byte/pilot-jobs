'use strict';
/**
 * STEP C — Apply fleetDetail from the Step B dry-run (no Wikipedia re-fetch).
 *   node scripts/enrich-airline-fleet-detail.js            # dry-run (default)
 *   node scripts/enrich-airline-fleet-detail.js --apply    # writes to DB
 *
 * Safety:
 *   - ONLY writes `fleetDetail` (whitelist; throws if any other key appears).
 *   - Skips airlines whose fleetDetail is already non-null (re-runnable).
 *   - Skips entries whose outcome !== 'PARSED' (the NO_TABLE rows stay null).
 *   - Never touches `fleet` String[] or any community-only field.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/database');

const APPLY = process.argv.includes('--apply');
const ENRICHABLE = ['fleetDetail'];                // the ONLY field this script may write
const FORBIDDEN = ['fleet', 'payRanges', 'rosterPattern', 'hiringStatus', 'hiringFrequency', 'contractType', 'avgResponseDays', 'interviewStages', 'simType', 'upgradeTimeMinYears', 'upgradeTimeMaxYears', 'notes', 'workAuthRequired', 'verifiedContributors'];

(async () => {
  const dry = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/fleet-detail-dry-run.json'), 'utf8'));

  const dbRows = await prisma.airline.findMany({ select: { id: true, name: true, iataCode: true, icaoCode: true, fleetDetail: true } });
  const keyOf = (r) => r.iataCode || r.icaoCode;
  const byKey = new Map(dbRows.map((r) => [keyOf(r), r]));

  const patches = [];
  let skippedNotParsed = 0, skippedExisting = 0, missing = 0;

  for (const e of dry) {
    if (e.outcome !== 'PARSED' || !e.rowsExtracted || !e.rowsExtracted.length) { skippedNotParsed++; continue; }
    const db = byKey.get(e.iataCode || e.icaoCode);
    if (!db) { missing++; continue; }
    if (db.fleetDetail != null) { skippedExisting++; continue; }   // idempotent
    const patch = { fleetDetail: e.rowsExtracted };
    // Whitelist enforcement — abort the whole run if anything unexpected appears.
    for (const k of Object.keys(patch)) {
      if (!ENRICHABLE.includes(k)) throw new Error(`FATAL: non-whitelisted field '${k}' for ${e.name}`);
      if (FORBIDDEN.includes(k)) throw new Error(`FATAL: forbidden field '${k}' for ${e.name}`);
    }
    patches.push({ id: db.id, name: e.name, key: e.iataCode || e.icaoCode, rows: e.rowsExtracted.length, patch });
  }

  fs.writeFileSync(path.join(__dirname, '../data/fleet-detail-apply-preview.json'),
    JSON.stringify({ mode: APPLY ? 'APPLY' : 'DRY-RUN', willPatch: patches.length, skippedExisting, skippedNotParsed, missing, patches: patches.map((p) => ({ name: p.name, key: p.key, rows: p.rows })) }, null, 2));

  console.log(`\n=== fleetDetail ${APPLY ? 'APPLY' : 'DRY-RUN'} ===`);
  console.log(`Would patch (fleetDetail null -> rows): ${patches.length}`);
  console.log(`Skipped — already non-null (idempotent): ${skippedExisting}`);
  console.log(`Skipped — outcome != PARSED:             ${skippedNotParsed}`);
  console.log(`Unmatched dry-run entries:               ${missing}`);
  console.log(`Whitelist: only [${ENRICHABLE.join(', ')}] — fleet & community fields never in patch.`);

  if (!APPLY) { console.log('\nDRY-RUN — no writes. Re-run with --apply.'); await prisma.$disconnect(); return; }

  let updated = 0;
  for (const p of patches) { await prisma.airline.update({ where: { id: p.id }, data: p.patch }); updated++; }
  console.log(`\nAPPLIED: ${updated} fleetDetail updates.`);
  await prisma.$disconnect();
})();
