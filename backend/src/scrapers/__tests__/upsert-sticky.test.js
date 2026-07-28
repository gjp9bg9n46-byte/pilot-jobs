'use strict';

/**
 * Fixture: a merged aggregator row must NOT resurrect when its source re-lists it.
 * Run: node src/scrapers/__tests__/upsert-sticky.test.js
 * DB-isolated via a fake sourcePlatform.
 */

const assert = require('assert');
const { upsertJob } = require('../runner');
const prisma = require('../../config/database');

const SP = '__STICKY_TEST__';
const job = (over = {}) => ({
  sourcePlatform: SP, externalId: 'sticky-1',
  title: 'Sticky First Officer', company: '__STICKY_CO__', location: 'Dubai', country: 'UAE',
  description: 'v1', applyUrl: 'https://www.adzuna.co.uk/land/ad/9', sourceUrl: 'https://www.adzuna.co.uk/land/ad/9',
  postedAt: new Date(), expiresAt: null, role: 'FIRST_OFFICER',
  reqCertificates: [], reqAuthorities: [], reqAircraftTypes: [], ...over,
});

(async () => {
  let id;
  try {
    // 1. create (ACTIVE)
    const created = await upsertJob(job(), {});
    id = created.id;
    assert.strictEqual(created.status, 'ACTIVE');

    // 2. simulate a dedup merge on it
    await prisma.job.update({ where: { id }, data: { status: 'EXPIRED', mergedInto: 'canonical-xyz' } });

    // 3. source re-lists it → re-scrape WITH preserveMerge (existing.mergedInto set)
    await upsertJob(job({ description: 'v2-refreshed' }), { preserveMerge: true });
    const sticky = await prisma.job.findUnique({ where: { id }, select: { status: true, mergedInto: true, description: true } });
    assert.strictEqual(sticky.status, 'EXPIRED', 'sticky: stays EXPIRED (no resurrection)');
    assert.strictEqual(sticky.mergedInto, 'canonical-xyz', 'sticky: mergedInto intact');
    assert.strictEqual(sticky.description, 'v2-refreshed', 'content still refreshes on a merged row');

    // 4. a NON-merged stale row (mergedInto null) SHOULD reactivate on re-scrape
    await prisma.job.update({ where: { id }, data: { status: 'EXPIRED', mergedInto: null } });
    await upsertJob(job({ description: 'v3' }), { preserveMerge: false });
    const revived = await prisma.job.findUnique({ where: { id }, select: { status: true } });
    assert.strictEqual(revived.status, 'ACTIVE', 'non-merged stale row reactivates as before');

    console.log('upsert sticky-merge: 4/4 passed');
    console.log('ALL UPSERT STICKY TESTS PASSED');
  } finally {
    if (id) await prisma.job.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
  }
  process.exit(0);
})().catch((e) => { console.error('UPSERT STICKY TEST FAILED:', e.message); process.exit(1); });
