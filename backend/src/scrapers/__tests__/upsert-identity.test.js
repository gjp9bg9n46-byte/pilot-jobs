'use strict';

/**
 * Fixture: upsertJob stamps identityKey + identityFirstSeenAt on INSERT, and a
 * re-post of the same ad from another source inherits the cluster's first-seen
 * (so it never re-registers as "new" on the dashboard).
 * Run: node src/scrapers/__tests__/upsert-identity.test.js
 * DB-isolated via a fake sourcePlatform; skips against the prod host.
 */

const assert = require('assert');
const { upsertJob } = require('../runner');
const prisma = require('../../config/database');

const SP = '__IDENTITY_TEST__';
const job = (over = {}) => ({
  sourcePlatform: SP, externalId: 'ident-1',
  title: 'A380 First Officer', company: '__IDENT_CO__', location: 'Dubai', country: 'UAE',
  description: 'v1', applyUrl: 'https://example.com/a', sourceUrl: 'https://example.com/a',
  postedAt: new Date(), expiresAt: null, role: 'FIRST_OFFICER',
  reqCertificates: [], reqAuthorities: [], reqAircraftTypes: [], ...over,
});

(async () => {
  require('./_assertTestDb').skipIfProdDb('upsert-identity');
  const ids = [];
  try {
    // 1. insert → both identity columns present immediately (no recompute pass)
    const a = await upsertJob(job(), {});
    ids.push(a.id);
    assert.ok(a.identityKey, 'identityKey stamped at insert');
    assert.ok(a.identityFirstSeenAt, 'identityFirstSeenAt stamped at insert');

    // 2. age the original, then insert the SAME ad under a different source
    const old = new Date(Date.now() - 45 * 864e5);
    await prisma.job.update({ where: { id: a.id }, data: { identityFirstSeenAt: old } });
    const b = await upsertJob(job({ externalId: 'ident-2', sourcePlatform: SP, description: 'reposted' }), {});
    ids.push(b.id);
    assert.strictEqual(b.identityKey, a.identityKey, 're-post lands in the same cluster');
    assert.strictEqual(
      new Date(b.identityFirstSeenAt).toISOString(), old.toISOString(),
      're-post inherits the cluster first-seen (otherwise it shows as a new job)',
    );

    // 3. re-scraping an EXISTING row must not move its first-seen
    const again = await upsertJob(job({ description: 'v2' }), {});
    assert.strictEqual(new Date(again.identityFirstSeenAt).toISOString(), old.toISOString(), 'update path leaves first-seen alone');

    console.log('upsert identity-at-insert: 3/3 passed');
    console.log('ALL UPSERT IDENTITY TESTS PASSED');
  } finally {
    for (const id of ids) await prisma.job.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
  }
  process.exit(0);
})().catch((e) => { console.error('UPSERT IDENTITY TEST FAILED:', e.message); process.exit(1); });
