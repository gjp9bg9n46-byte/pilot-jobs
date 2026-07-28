'use strict';

/**
 * Fixture tests for dedup canonical selection + fuzzy aggregator displacement.
 * Run: node src/scrapers/__tests__/dedup.test.js
 * (No test runner configured; standalone node/assert script.)
 *
 * A — pure pickCanonical() comparator (no DB).
 * B — full collapseXSourceDuplicates() (exact key), DB-isolated via fake platforms.
 * C — pure titleCore()/cityCore() noise-normalisation.
 * D — collapseAggregatorDuplicates() (fuzzy, asymmetric) shadow + live + INVARIANT,
 *     DB-isolated via fake platforms.
 */

const assert = require('assert');
const {
  pickCanonical, collapseXSourceDuplicates, collapseAggregatorDuplicates, titleCore, cityCore,
} = require('../dedup');

function partA() {
  assert.strictEqual(pickCanonical([
    { id: 'agg', sourceType: 'aggregator', description: 'x'.repeat(5000) },
    { id: 'ats', sourceType: 'direct_ats', description: 'short' },
  ]).id, 'ats', 'direct_ats outranks longer-desc aggregator');
  assert.strictEqual(pickCanonical([
    { id: 'agg', sourceType: 'aggregator', description: 'x'.repeat(5000) },
    { id: 'op', sourceType: 'operator_direct', description: 'short' },
  ]).id, 'op', 'operator_direct outranks longer-desc aggregator');
  assert.strictEqual(pickCanonical([
    { id: 'op', sourceType: 'operator_direct', description: 'x'.repeat(5000) },
    { id: 'ats', sourceType: 'direct_ats', description: 'short' },
  ]).id, 'ats', 'direct_ats outranks operator_direct');
  assert.strictEqual(pickCanonical([
    { id: 'shortAts', sourceType: 'direct_ats', description: 'short' },
    { id: 'longAts', sourceType: 'direct_ats', description: 'x'.repeat(200) },
  ]).id, 'longAts', 'same type → longer description wins');
  console.log('  Part A (pickCanonical): 4/4 passed');
}

function partC() {
  // Noise-only difference ("- Pilot" + city variant) → normalise EQUAL.
  assert.strictEqual(
    titleCore('Direct Entry Captain - Pilot', 'Emirates', 'Dubai International Airport'),
    titleCore('Direct Entry Captain', 'Emirates', 'Dubai, United Arab Emirates'),
    'noise-only title difference normalises equal');
  // Type/aircraft designator is SIGNAL → must NOT normalise equal.
  assert.notStrictEqual(
    titleCore('First Officer A320', 'Emirates', 'Dubai'),
    titleCore('First Officer B777', 'Emirates', 'Dubai'),
    'A320 vs B777 stay distinct (designators never stripped)');
  assert.strictEqual(cityCore('Dubai International Airport'), 'dubai');
  assert.strictEqual(cityCore('Dubai, United Arab Emirates'), 'dubai');
  // Interior rank word "officer" must survive (only a trailing "- Officer" is noise).
  assert.ok(titleCore('First Officer', 'X', '').split(' ').includes('officer'), 'rank word kept');
  console.log('  Part C (titleCore/cityCore): 5/5 passed');
}

async function partB(prisma) {
  const PA = '__FIXT_ATS__', PAGG = '__FIXT_AGG__', POP = '__FIXT_OP__';
  const base = { title: 'Dedup Fixture First Officer', company: '__DEDUP_FIXTURE_CO__', location: 'Testville', description: '', applyUrl: 'https://example.test/x', status: 'ACTIVE', mergedInto: null };
  const ids = [];
  const ats = await prisma.job.create({ data: { ...base, sourcePlatform: PA, externalId: 'ats-1', sourceType: 'direct_ats', description: 'short desc', applyUrl: 'https://carrier.icims.com/jobs/1/job' } });
  const agg = await prisma.job.create({ data: { ...base, sourcePlatform: PAGG, externalId: 'agg-1', sourceType: 'aggregator', description: 'x'.repeat(4000), applyUrl: 'https://adzuna.com/land/ad/1' } });
  const op = await prisma.job.create({ data: { ...base, title: 'Dedup Fixture Captain', sourcePlatform: POP, externalId: 'op-1', sourceType: 'operator_direct', description: 'short', applyUrl: 'https://usajobs.gov/1' } });
  const agg2 = await prisma.job.create({ data: { ...base, title: 'Dedup Fixture Captain', sourcePlatform: PAGG, externalId: 'agg-2', sourceType: 'aggregator', description: 'y'.repeat(4000), applyUrl: 'https://jooble.org/away/1' } });
  ids.push(ats.id, agg.id, op.id, agg2.id);
  try {
    await collapseXSourceDuplicates([PA, PAGG, POP]);
    const [a, b, c, d] = await Promise.all([ats.id, agg.id, op.id, agg2.id].map((id) => prisma.job.findUnique({ where: { id }, select: { status: true, mergedInto: true } })));
    assert.strictEqual(a.status, 'ACTIVE'); assert.strictEqual(a.mergedInto, null);
    assert.strictEqual(b.status, 'EXPIRED'); assert.strictEqual(b.mergedInto, ats.id);
    assert.strictEqual(c.status, 'ACTIVE');
    assert.strictEqual(d.status, 'EXPIRED'); assert.strictEqual(d.mergedInto, op.id);
    console.log('  Part B (collapseXSourceDuplicates exact-key): 6/6 passed');
  } finally { await prisma.job.deleteMany({ where: { id: { in: ids } } }); }
}

async function partD(prisma) {
  const PA = '__FZ_ATS__', PAGG = '__FZ_AGG__';
  const base = { company: '__FUZZ_CO__', description: '', status: 'ACTIVE', mergedInto: null };
  const ids = [];
  const ats = await prisma.job.create({ data: { ...base, sourcePlatform: PA, externalId: 'fz-ats', sourceType: 'direct_ats', title: 'Direct Entry Captain', location: 'Dubai, United Arab Emirates', applyUrl: 'https://carrier.icims.com/1' } });
  const agg = await prisma.job.create({ data: { ...base, sourcePlatform: PAGG, externalId: 'fz-agg', sourceType: 'aggregator', title: 'Direct Entry Captain - Pilot', location: 'Dubai International Airport', applyUrl: 'https://adzuna.com/land/ad/1' } });
  const atsA = await prisma.job.create({ data: { ...base, sourcePlatform: PA, externalId: 'fz-a320', sourceType: 'direct_ats', title: 'First Officer A320', location: 'Dubai', applyUrl: 'https://carrier.icims.com/2' } });
  const aggB = await prisma.job.create({ data: { ...base, sourcePlatform: PAGG, externalId: 'fz-b777', sourceType: 'aggregator', title: 'First Officer B777', location: 'Dubai', applyUrl: 'https://adzuna.com/land/ad/2' } });
  const aggOnly = await prisma.job.create({ data: { ...base, sourcePlatform: PAGG, externalId: 'fz-only', sourceType: 'aggregator', title: 'Ramp Service Agent', location: 'Dubai', applyUrl: 'https://adzuna.com/land/ad/3' } });
  ids.push(ats.id, agg.id, atsA.id, aggB.id, aggOnly.id);
  try {
    // SHADOW: no writes, exactly one candidate pair (the captain).
    const shadow = await collapseAggregatorDuplicates([PA, PAGG], { dryRun: true });
    assert.strictEqual(shadow.merged, 0, 'shadow writes nothing');
    const capPair = shadow.pairs.filter((p) => p.aggId === agg.id);
    assert.strictEqual(capPair.length, 1, 'captain is a candidate pair');
    assert.strictEqual(capPair[0].canonId, ats.id, 'direct captain is canonical');
    assert.ok(!shadow.pairs.some((p) => p.aggId === aggB.id), 'B777 aggregator is NOT a candidate (A320 is a different job)');
    assert.ok(!shadow.pairs.some((p) => p.aggId === aggOnly.id), 'aggregator with no clean twin is NOT a candidate');
    assert.strictEqual((await prisma.job.findUnique({ where: { id: agg.id } })).status, 'ACTIVE', 'shadow leaves aggregator ACTIVE');

    // LIVE: merge only the captain.
    const live = await collapseAggregatorDuplicates([PA, PAGG], { dryRun: false });
    assert.strictEqual(live.merged, 1, 'live merges exactly one');
    const aggAfter = await prisma.job.findUnique({ where: { id: agg.id }, select: { status: true, mergedInto: true } });
    assert.strictEqual(aggAfter.status, 'EXPIRED', 'aggregator captain EXPIRED');
    assert.strictEqual(aggAfter.mergedInto, ats.id, 'aggregator mergedInto the clean canonical');
    assert.strictEqual((await prisma.job.findUnique({ where: { id: ats.id } })).status, 'ACTIVE', 'INVARIANT: canonical stays live');
    assert.strictEqual((await prisma.job.findUnique({ where: { id: aggB.id } })).status, 'ACTIVE', 'B777 aggregator NOT merged (distinct type)');
    assert.strictEqual((await prisma.job.findUnique({ where: { id: aggOnly.id } })).status, 'ACTIVE', 'aggregator with no clean twin NOT expired');
    console.log('  Part D (collapseAggregatorDuplicates shadow+live+invariant): passed');
  } finally { await prisma.job.deleteMany({ where: { id: { in: ids } } }); }
}

(async () => {
  partA();
  partC();
  const prisma = require('../../config/database');
  try {
    await partB(prisma);
    await partD(prisma);
    console.log('ALL DEDUP FIXTURE TESTS PASSED');
  } finally { await prisma.$disconnect(); }
  process.exit(0);
})().catch((e) => { console.error('DEDUP TEST FAILED:', e.message); process.exit(1); });
