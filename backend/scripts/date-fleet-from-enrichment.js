'use strict';

/**
 * Honest bulk-date for the FLEET field only.
 *
 * The structured `fleetDetail` on ~most airlines was parsed from Wikipedia by
 * scripts/enrich-airline-fleet-detail.js, off data/fleet-detail-dry-run.json.
 * That read happened at a KNOWN time — the dry-run file's git commit date. This
 * stamps AirlineFieldDate('fleet') with THAT date (source='enrichment'), so the
 * fact box reads "recorded from a public source on Jun 2026" — true, not now().
 *
 * Rules (per owner):
 *   - Only stamp airlines whose fleetDetail is present AND came from a PARSED
 *     dry-run entry. No fleetDetail, or fleet only as a community String[], or a
 *     NO_TABLE/unparsed entry → stays NULL (we can't claim we read it).
 *   - recordedAt = when the SOURCE was read (dry-run commit date), never now().
 *   - Never overwrite an existing fleet date — a contribution/reaffirm is more
 *     authoritative than the enrichment. create-if-absent only.
 *
 *   node scripts/date-fleet-from-enrichment.js           # dry-run (default)
 *   node scripts/date-fleet-from-enrichment.js --apply   # writes
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const prisma = require('../src/config/database');

const APPLY = process.argv.includes('--apply');
const DRY_FILE = path.join(__dirname, '../data/fleet-detail-dry-run.json');

// The date the source was READ = the dry-run file's git commit date (fallback:
// filesystem mtime). Deliberately NOT the date this script runs.
function sourceReadDate() {
  try {
    const iso = execSync('git log -1 --format=%aI -- data/fleet-detail-dry-run.json', { cwd: path.join(__dirname, '..') }).toString().trim();
    if (iso) return new Date(iso);
  } catch { /* not committed / no git — fall through */ }
  return fs.statSync(DRY_FILE).mtime;
}

(async () => {
  const recordedAt = sourceReadDate();
  const dry = JSON.parse(fs.readFileSync(DRY_FILE, 'utf8'));
  const parsedKeys = new Set(
    dry.filter((e) => e.outcome === 'PARSED' && e.rowsExtracted && e.rowsExtracted.length)
       .map((e) => e.iataCode || e.icaoCode),
  );

  const airlines = await prisma.airline.findMany({ select: { id: true, iataCode: true, icaoCode: true, fleetDetail: true } });
  const alreadyDated = new Set(
    (await prisma.airlineFieldDate.findMany({ where: { field: 'fleet' }, select: { airlineId: true } })).map((r) => r.airlineId),
  );

  let dated = 0, noStructuredFleet = 0, notFromEnrichment = 0, keptExistingDate = 0;
  for (const a of airlines) {
    if (!Array.isArray(a.fleetDetail) || !a.fleetDetail.length) { noStructuredFleet++; continue; } // NULL stays NULL
    if (!parsedKeys.has(a.iataCode || a.icaoCode)) { notFromEnrichment++; continue; }              // not our read → NULL
    if (alreadyDated.has(a.id)) { keptExistingDate++; continue; }                                   // contribution/reaffirm wins
    if (APPLY) {
      await prisma.airlineFieldDate.create({ data: { airlineId: a.id, field: 'fleet', recordedAt, source: 'enrichment' } });
    }
    dated++;
  }

  console.log(`\n=== fleet date ${APPLY ? 'APPLY' : 'DRY-RUN'} ===`);
  console.log(`source-read date (dry-run commit): ${recordedAt.toISOString()}`);
  console.log(`${APPLY ? 'DATED' : 'would date'}: ${dated} airlines' fleet (source='enrichment')`);
  console.log(`skipped — no structured fleetDetail (stays NULL): ${noStructuredFleet}`);
  console.log(`skipped — fleetDetail not from this enrichment (stays NULL): ${notFromEnrichment}`);
  console.log(`skipped — already had a fleet date, kept: ${keptExistingDate}`);
  if (!APPLY) console.log('\nDRY-RUN — no writes. Re-run with --apply.');
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
