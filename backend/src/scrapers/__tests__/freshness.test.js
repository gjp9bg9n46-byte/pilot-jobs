'use strict';

/**
 * expireUnseen — the staleness backstop that overrides the zero-result guard.
 * Run: node src/scrapers/__tests__/freshness.test.js
 * DB-isolated via a fake sourcePlatform; cleaned up in finally.
 */

const assert = require('assert');
const { expireUnseen } = require('../runner');
const prisma = require('../../config/database');

const SP = '__FRESHNESS_TEST__';
const D = (days) => new Date(Date.now() - days * 24 * 3600 * 1000);
const base = { company: '__FR_CO__', title: 'Test Pilot', location: 'X', description: '', applyUrl: 'https://x.icims.com/1', status: 'ACTIVE' };

(async () => {
  const ids = [];
  try {
    // a) scraped, lastSeenAt 20d ago (> 14d window) → EXPIRE
    const stale = await prisma.job.create({ data: { ...base, sourcePlatform: SP, externalId: 'f-stale', lastSeenAt: D(20) } });
    // b) scraped, lastSeenAt today → SURVIVE
    const fresh = await prisma.job.create({ data: { ...base, sourcePlatform: SP, externalId: 'f-fresh', lastSeenAt: D(0) } });
    // c) scraped, lastSeenAt NULL but recently updated → SURVIVE (updatedAt fallback spares live pre-field rows)
    const nullFresh = await prisma.job.create({ data: { ...base, sourcePlatform: SP, externalId: 'f-null-fresh', lastSeenAt: null } });
    // d) manual/legacy row (sourcePlatform NULL) → NEVER swept (not a scraped row)
    const manual = await prisma.job.create({ data: { ...base, sourcePlatform: null, externalId: null, lastSeenAt: D(99) } });
    ids.push(stale.id, fresh.id, nullFresh.id, manual.id);

    const expired = await expireUnseen();
    assert.ok(expired >= 1, 'at least the stale row expired');

    const s = await prisma.job.findUnique({ where: { id: stale.id }, select: { status: true } });
    const f = await prisma.job.findUnique({ where: { id: fresh.id }, select: { status: true } });
    const n = await prisma.job.findUnique({ where: { id: nullFresh.id }, select: { status: true } });
    const m = await prisma.job.findUnique({ where: { id: manual.id }, select: { status: true } });

    assert.strictEqual(s.status, 'EXPIRED', 'stale scraped row (lastSeenAt 20d) expired');
    assert.strictEqual(f.status, 'ACTIVE', 'fresh scraped row survives');
    assert.strictEqual(n.status, 'ACTIVE', 'NULL lastSeenAt but recent updatedAt survives (no fabrication, no false expiry)');
    assert.strictEqual(m.status, 'ACTIVE', 'manual/legacy row (sourcePlatform NULL) never swept by the backstop');

    console.log('expireUnseen backstop: 4/4 passed');
    console.log('ALL FRESHNESS TESTS PASSED');
  } finally {
    if (ids.length) await prisma.job.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
    await prisma.$disconnect();
  }
  process.exit(0);
})().catch((e) => { console.error('FRESHNESS TEST FAILED:', e.message); process.exit(1); });
