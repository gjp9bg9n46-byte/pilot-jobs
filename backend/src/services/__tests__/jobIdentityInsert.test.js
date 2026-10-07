'use strict';

// Identity at INSERT. Before this, a scraped row got identityKey /
// identityFirstSeenAt only from the next recompute pass, so for up to a cron
// cycle a new row had neither — and a RE-POST of an older ad looked "new" on the
// dashboard (the new-since-last-visit test falls back to createdAt when
// identityFirstSeenAt is null).
//
// No DB: the shared Prisma client's methods are mocked, so this runs anywhere.

const test = require('node:test');
const assert = require('node:assert');
const prisma = require('../../config/database');
const { identityForInsert, clearResolverCache } = require('../jobIdentityStore');
const { makeResolver, identityOf } = require('../../scrapers/jobIdentity');

const AIRLINES = [{ name: 'Emirates', country: 'UAE', headquarters: 'Dubai', bases: ['Dubai'] }];
const JOB = { title: 'A380 First Officer', titleEn: null, company: 'Emirates', location: 'Dubai', country: 'UAE' };
const NOW = new Date('2026-10-07T10:00:00.000Z');

function stub({ prior }) {
  clearResolverCache();
  prisma.airline.findMany = async () => AIRLINES;
  prisma.job.findFirst = async () => prior;
}

test('new cluster → key is stamped and first-seen is now', async () => {
  stub({ prior: null });
  const r = await identityForInsert(JOB, { now: NOW });
  assert.ok(r.identityKey && typeof r.identityKey === 'string', 'key present');
  assert.strictEqual(r.identityFirstSeenAt.toISOString(), NOW.toISOString());
});

test('the key matches what the recompute pass would compute for the same job', async () => {
  stub({ prior: null });
  const r = await identityForInsert(JOB, { now: NOW });
  const expected = identityOf({ ...JOB, description: JOB.titleEn || JOB.title }, makeResolver(AIRLINES)).key;
  assert.strictEqual(r.identityKey, expected, 'insert and recompute must agree, or rows flap between passes');
});

test('re-post inherits the cluster first-seen, so it is NOT new', async () => {
  const original = new Date('2026-08-01T00:00:00.000Z');
  stub({ prior: { identityFirstSeenAt: original, createdAt: new Date('2026-08-02T00:00:00.000Z') } });
  const r = await identityForInsert(JOB, { now: NOW });
  assert.strictEqual(r.identityFirstSeenAt.toISOString(), original.toISOString());
});

test('a prior row with no identityFirstSeenAt falls back to its createdAt', async () => {
  const created = new Date('2026-09-09T00:00:00.000Z');
  stub({ prior: { identityFirstSeenAt: null, createdAt: created } });
  const r = await identityForInsert(JOB, { now: NOW });
  assert.strictEqual(r.identityFirstSeenAt.toISOString(), created.toISOString());
});

test('titleEn wins over title for the key (same job, translated title)', async () => {
  stub({ prior: null });
  const a = await identityForInsert({ ...JOB, title: 'Premier Officier A380', titleEn: 'A380 First Officer' }, { now: NOW });
  stub({ prior: null });
  const b = await identityForInsert(JOB, { now: NOW });
  assert.strictEqual(a.identityKey, b.identityKey);
});

test('the airline resolver is cached across inserts (not rebuilt per job)', async () => {
  clearResolverCache();
  let builds = 0;
  prisma.airline.findMany = async () => { builds += 1; return AIRLINES; };
  prisma.job.findFirst = async () => null;
  await identityForInsert(JOB, { now: NOW });
  await identityForInsert(JOB, { now: NOW });
  await identityForInsert(JOB, { now: NOW });
  assert.strictEqual(builds, 1, 'resolver rebuilt per job would be O(airlines) on every upsert');
});
