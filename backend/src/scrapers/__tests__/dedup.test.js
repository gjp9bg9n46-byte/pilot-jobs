'use strict';

/**
 * Fixture tests for the sourceType-first dedup canonical selection.
 *
 * Run: node src/scrapers/__tests__/dedup.test.js
 * (Repo has no test runner configured; this is a standalone node/assert script.)
 *
 * Part A — pure pickCanonical() comparator (no DB).
 * Part B — full collapseXSourceDuplicates() against the DB, but ISOLATED: the
 *   fixture rows use fake sourcePlatform labels no real job uses, so the dedup
 *   query (`where sourcePlatform in [...]`) only ever sees the fixtures. Every
 *   fixture row is deleted afterwards in a finally block.
 */

const assert = require('assert');
const { pickCanonical, collapseXSourceDuplicates } = require('../dedup');

// ── Part A: pure comparator ───────────────────────────────────────────────────
function partA() {
  // aggregator has the LONGER description but must still lose to direct_ats.
  assert.strictEqual(
    pickCanonical([
      { id: 'agg', sourceType: 'aggregator', description: 'x'.repeat(5000) },
      { id: 'ats', sourceType: 'direct_ats', description: 'short' },
    ]).id, 'ats', 'direct_ats must outrank a longer-description aggregator');

  // operator_direct beats aggregator (longer aggregator desc again).
  assert.strictEqual(
    pickCanonical([
      { id: 'agg', sourceType: 'aggregator', description: 'x'.repeat(5000) },
      { id: 'op', sourceType: 'operator_direct', description: 'short' },
    ]).id, 'op', 'operator_direct must outrank a longer-description aggregator');

  // direct_ats beats operator_direct.
  assert.strictEqual(
    pickCanonical([
      { id: 'op', sourceType: 'operator_direct', description: 'x'.repeat(5000) },
      { id: 'ats', sourceType: 'direct_ats', description: 'short' },
    ]).id, 'ats', 'direct_ats must outrank operator_direct');

  // same sourceType → longer description wins (tiebreak preserved).
  assert.strictEqual(
    pickCanonical([
      { id: 'shortAts', sourceType: 'direct_ats', description: 'short' },
      { id: 'longAts', sourceType: 'direct_ats', description: 'x'.repeat(200) },
    ]).id, 'longAts', 'same type → longer description wins');

  console.log('  Part A (pickCanonical): 4/4 passed');
}

// ── Part B: DB integration, isolated by fake sourcePlatforms ───────────────────
async function partB() {
  const prisma = require('../../config/database');
  const PA = '__FIXT_ATS__';   // fake platforms — no real job uses these
  const PAGG = '__FIXT_AGG__';
  const POP = '__FIXT_OP__';
  const base = {
    title: 'Dedup Fixture First Officer', company: '__DEDUP_FIXTURE_CO__',
    location: 'Testville', description: '', applyUrl: 'https://example.test/x',
    status: 'ACTIVE', mergedInto: null,
  };
  const ids = [];
  try {
    // Case 1: aggregator (LONGER desc) vs direct_ats → direct_ats canonical.
    const ats = await prisma.job.create({ data: { ...base, sourcePlatform: PA, externalId: 'ats-1', sourceType: 'direct_ats', description: 'short desc', applyUrl: 'https://carrier.icims.com/jobs/1/job' } });
    const agg = await prisma.job.create({ data: { ...base, sourcePlatform: PAGG, externalId: 'agg-1', sourceType: 'aggregator', description: 'x'.repeat(4000), applyUrl: 'https://adzuna.com/land/ad/1' } });
    ids.push(ats.id, agg.id);

    // Case 2: aggregator vs operator_direct → operator_direct canonical.
    const op = await prisma.job.create({ data: { ...base, title: 'Dedup Fixture Captain', sourcePlatform: POP, externalId: 'op-1', sourceType: 'operator_direct', description: 'short', applyUrl: 'https://usajobs.gov/1' } });
    const agg2 = await prisma.job.create({ data: { ...base, title: 'Dedup Fixture Captain', sourcePlatform: PAGG, externalId: 'agg-2', sourceType: 'aggregator', description: 'y'.repeat(4000), applyUrl: 'https://jooble.org/away/1' } });
    ids.push(op.id, agg2.id);

    await collapseXSourceDuplicates([PA, PAGG, POP]);

    const [ratsAfter, raggAfter, ropAfter, ragg2After] = await Promise.all(
      [ats.id, agg.id, op.id, agg2.id].map((id) => prisma.job.findUnique({ where: { id }, select: { status: true, mergedInto: true } })),
    );

    // Case 1 assertions
    assert.strictEqual(ratsAfter.status, 'ACTIVE', 'direct_ats stays ACTIVE (canonical)');
    assert.strictEqual(ratsAfter.mergedInto, null, 'direct_ats has no mergedInto');
    assert.strictEqual(raggAfter.status, 'EXPIRED', 'aggregator dup EXPIRED');
    assert.strictEqual(raggAfter.mergedInto, ats.id, 'aggregator mergedInto the direct_ats id');

    // Case 2 assertions
    assert.strictEqual(ropAfter.status, 'ACTIVE', 'operator_direct stays ACTIVE (canonical)');
    assert.strictEqual(ragg2After.status, 'EXPIRED', 'aggregator dup EXPIRED (vs operator)');
    assert.strictEqual(ragg2After.mergedInto, op.id, 'aggregator mergedInto the operator_direct id');

    console.log('  Part B (collapseXSourceDuplicates, DB-isolated): 6/6 passed');
  } finally {
    if (ids.length) await prisma.job.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}

(async () => {
  partA();
  await partB();
  console.log('ALL DEDUP FIXTURE TESTS PASSED');
  process.exit(0);
})().catch((e) => { console.error('DEDUP TEST FAILED:', e.message); process.exit(1); });
