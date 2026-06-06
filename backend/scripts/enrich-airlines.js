'use strict';
/**
 * STEP C — Additive airline enrichment.
 *   node scripts/enrich-airlines.js            # dry-run (default, no DB writes)
 *   node scripts/enrich-airlines.js --apply    # writes to the DB
 *
 * Rules (Phase 3):
 *   - ENRICHABLE = ['headquarters','bases','fleet']. Country fills only if null.
 *   - Additive only: a field is written ONLY if currently empty/default.
 *     Community-contributed (non-empty) values are never overwritten.
 *   - Community-only fields never appear in any patch (whitelist enforced).
 *   - SKIP map suppresses known-wrong Wikidata resolutions (leave empty instead).
 *   - Re-runnable: a second run finds fields non-empty and skips them.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/database');

const APPLY = process.argv.includes('--apply');
const ENRICHABLE = ['headquarters', 'bases', 'fleet'];
const COMMUNITY_ONLY = ['payRanges', 'rosterPattern', 'hiringStatus', 'hiringFrequency', 'contractType', 'avgResponseDays', 'interviewStages', 'simType', 'upgradeTimeMinYears', 'upgradeTimeMaxYears', 'notes', 'workAuthRequired'];
const isEmpty = (v) => v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'string' && v.trim() === '');

// Known-wrong Wikidata resolutions → suppress these fields (leave empty).
const SKIP = {
  'PSA Airlines':      ['headquarters'],            // matched "Comair" (Erlanger)
  'Piedmont Airlines': ['headquarters', 'bases'],   // matched "West Atlantic Sweden"
  'Endeavor Air':      ['headquarters'],            // hq "Memphis" = legacy Pinnacle (bases MSP kept)
  'Bristow Group':     ['headquarters', 'bases'],   // matched "Bristow Norway", not US parent
};

// New inserts resolved in Step B (codes confirmed via Wikidata; HQ left empty —
// Jet Aviation's Wikidata HQ/country were the wrong jurisdiction).
const NEW_INSERTS = [
  { name: 'Jet Aviation', iataCode: null, icaoCode: 'JAS', country: 'Switzerland', region: 'Europe' },
  { name: 'Luxaviation',  iataCode: null, icaoCode: 'LXA', country: 'Luxembourg',  region: 'Europe' },
];

(async () => {
  const wikidata = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/wikidata-airlines.json'), 'utf8'));
  const fleet = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/airlines-fleet.json'), 'utf8'));
  const wdById = new Map(wikidata.map((r) => [r.dbId, r]));

  const dbAirlines = await prisma.airline.findMany({
    select: { id: true, name: true, iataCode: true, icaoCode: true, country: true, headquarters: true, bases: true, fleet: true },
  });

  const patches = [];      // { id, name, iata, icao, patch }
  const skippedLog = [];   // { name, field, suppressedValue }
  const hqGranularity = []; // airport/district HQ for future normalization

  for (const a of dbAirlines) {
    const r = wdById.get(a.id);
    const skip = SKIP[a.name] || [];
    const patch = {};

    // headquarters
    if (!skip.includes('headquarters') && isEmpty(a.headquarters) && r && r.hq) {
      patch.headquarters = r.hq;
      if (/airport|air park|airfield/i.test(r.hq) || (!/,/.test(r.hq) && /\b(district|-dong|-ku|garhoud|shinbashi|hörsching)\b/i.test(r.hq))) {
        hqGranularity.push({ name: a.name, hq: r.hq });
      }
    } else if (skip.includes('headquarters') && r && r.hq) {
      skippedLog.push({ name: a.name, field: 'headquarters', suppressedValue: r.hq });
    }

    // bases
    if (!skip.includes('bases') && isEmpty(a.bases) && r && r.hubs.length) {
      patch.bases = r.hubs;
    } else if (skip.includes('bases') && r && r.hubs.length) {
      skippedLog.push({ name: a.name, field: 'bases', suppressedValue: r.hubs });
    }

    // fleet (curated JSON only)
    const fl = fleet[a.iataCode || a.icaoCode];
    if (!skip.includes('fleet') && isEmpty(a.fleet) && Array.isArray(fl) && fl.length) {
      patch.fleet = fl;
    }

    if (Object.keys(patch).length) patches.push({ id: a.id, name: a.name, iata: a.iataCode, icao: a.icaoCode, patch });
  }

  // Whitelist enforcement — abort if any non-enrichable key ever appears.
  for (const p of patches) {
    for (const k of Object.keys(p.patch)) {
      if (!ENRICHABLE.includes(k)) throw new Error(`FATAL: non-enrichable field '${k}' in patch for ${p.name}`);
      if (COMMUNITY_ONLY.includes(k)) throw new Error(`FATAL: community-only field '${k}' in patch for ${p.name}`);
    }
  }

  // New inserts (skip if already present by ICAO).
  const existingIcao = new Set(dbAirlines.map((a) => a.icaoCode).filter(Boolean));
  const inserts = NEW_INSERTS.filter((n) => !existingIcao.has(n.icaoCode));

  // Country-fill (only if null) — informational: all current rows have country.
  const countryNulls = dbAirlines.filter((a) => isEmpty(a.country)).length;

  const preview = {
    mode: APPLY ? 'APPLY' : 'DRY-RUN',
    totals: { patched: patches.length, inserted: inserts.length, skippedFields: skippedLog.length, countryFillCandidates: countryNulls },
    patches, inserts, skipped: skippedLog, hqGranularityToNormalizeLater: hqGranularity,
  };
  fs.writeFileSync(path.join(__dirname, '../data/enrichment-apply-preview.json'), JSON.stringify(preview, null, 2));

  console.log(`\n=== ENRICH ${preview.mode} ===`);
  console.log(`Airlines receiving a patch : ${patches.length}`);
  console.log(`New airlines to insert      : ${inserts.length} -> ${JSON.stringify(inserts.map((i) => i.name + ' (' + i.icaoCode + ')'))}`);
  console.log(`Fields suppressed (known-wrong): ${skippedLog.length}`);
  for (const s of skippedLog) console.log(`   SKIP ${s.name}.${s.field} = ${JSON.stringify(s.suppressedValue)}`);
  console.log(`HQ granularity to normalize later: ${hqGranularity.length} (logged in preview)`);
  console.log(`Country-fill candidates (null country): ${countryNulls}`);
  console.log(`Community-only fields in any patch: 0 (whitelist enforced; would have thrown otherwise)`);
  console.log(`Preview written: data/enrichment-apply-preview.json`);

  if (!APPLY) {
    console.log('\nDRY-RUN — no database writes. Re-run with --apply to write.');
    await prisma.$disconnect();
    return;
  }

  // ---- APPLY ----
  let updated = 0, inserted = 0;
  for (const p of patches) {
    await prisma.airline.update({ where: { id: p.id }, data: p.patch });
    updated++;
  }
  for (const n of inserts) {
    await prisma.airline.create({ data: { ...n, hiringStatus: 'UNKNOWN', hiringFrequency: 'UNKNOWN' } });
    inserted++;
  }
  console.log(`\nAPPLIED: ${updated} updated, ${inserted} inserted.`);
  await prisma.$disconnect();
})();
