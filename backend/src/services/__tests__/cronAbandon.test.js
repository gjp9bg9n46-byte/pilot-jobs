'use strict';

/**
 * A killed cycle must leave an honest record, not a row that says RUNNING for ever.
 *
 * Four midday cycles went missing with no trace saying so, because nothing
 * closed the CronRun row when Railway replaced the container. Two paths cover
 * it: SIGTERM (the deploy path, which can write before it goes) and the boot
 * reaper (for a hard kill or OOM, where nothing got the chance).
 *
 * prisma is stubbed, so this runs with no database.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// ── Stub the prisma singleton before cronRun requires it ────────────────────
const dbPath = require.resolve(path.join(__dirname, '../../config/database'));
const calls = [];
const stub = {
  cronRun: {
    create: async ({ data }) => { calls.push(['create', data]); return { id: `id-${calls.length}` }; },
    update: async (args) => { calls.push(['update', args]); return {}; },
    updateMany: async (args) => { calls.push(['updateMany', args]); return { count: (args.where.id?.in || []).length || 1 }; },
    findMany: async (args) => { calls.push(['findMany', args]); return stub.__orphans || []; },
    findFirst: async (args) => { calls.push(['findFirst', args]); return null; },
  },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: stub };

const cronPath = require.resolve('../cronRun');
delete require.cache[cronPath];
const { withCronRun, abandonInFlight, reapOrphanedRuns, _inFlight } = require('../cronRun');

test('a completed run leaves nothing in flight', async () => {
  calls.length = 0;
  await withCronRun('demo', async () => ({ did: 1 }));
  assert.strictEqual(_inFlight.size, 0, 'finalise clears the in-flight entry');
  const statuses = calls.filter((c) => c[0] === 'update').map((c) => c[1].data.status);
  assert.deepStrictEqual(statuses, ['OK']);
});

test('a failing run is recorded ERROR and also clears', async () => {
  calls.length = 0;
  await withCronRun('demo', async () => { throw new Error('boom'); });
  assert.strictEqual(_inFlight.size, 0);
  const upd = calls.find((c) => c[0] === 'update');
  assert.strictEqual(upd[1].data.status, 'ERROR');
  assert.match(upd[1].data.error, /boom/);
});

test('SIGTERM mid-run marks the row ABANDONED, not RUNNING for ever', async () => {
  calls.length = 0;
  let release;
  const held = new Promise((r) => { release = r; });
  const running = withCronRun('scrape', () => held);

  // The row exists and the process knows it owns it.
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(_inFlight.size, 1, 'the live run is tracked');

  const n = await abandonInFlight('SIGTERM: container replaced mid-run');
  assert.strictEqual(n, 1, 'one run abandoned');
  assert.strictEqual(_inFlight.size, 0, 'and no longer tracked');

  const um = calls.find((c) => c[0] === 'updateMany');
  assert.strictEqual(um[1].data.status, 'ABANDONED');
  assert.strictEqual(um[1].where.status, 'RUNNING', 'only a row still RUNNING is overwritten');
  assert.match(um[1].data.error, /SIGTERM/);
  assert.ok(um[1].data.endedAt instanceof Date, 'an end time is recorded');

  release({});
  await running;
});

test('abandoning with nothing in flight is a no-op', async () => {
  calls.length = 0;
  assert.strictEqual(await abandonInFlight('x'), 0);
  assert.strictEqual(calls.length, 0, 'no write at all');
});

test('the boot reaper closes rows left by a process that is gone', async () => {
  calls.length = 0;
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  stub.__orphans = [
    { id: 'a', jobName: 'scrape', startedAt: old, host: 'dead-box', commit: 'abc1234' },
    { id: 'b', jobName: 'liveness', startedAt: old, host: 'dead-box', commit: 'abc1234' },
  ];
  const r = await reapOrphanedRuns();
  assert.strictEqual(r.reaped, 2);
  assert.deepStrictEqual(r.jobs, ['scrape', 'liveness']);

  const find = calls.find((c) => c[0] === 'findMany');
  assert.strictEqual(find[1].where.status, 'RUNNING', 'only RUNNING rows are candidates');
  assert.ok(find[1].where.startedAt.lt instanceof Date, 'and only ones older than the cutoff');

  const um = calls.find((c) => c[0] === 'updateMany');
  assert.deepStrictEqual(um[1].where.id.in, ['a', 'b']);
  assert.strictEqual(um[1].data.status, 'ABANDONED');
  assert.match(um[1].data.error, /the process that started it is gone/);
  stub.__orphans = [];
});

test('the reaper leaves a young RUNNING row alone', async () => {
  // A sweep legitimately runs for ~25 minutes. Reaping it would both lie about
  // the run and free the in-flight guard to start a second one on top of it.
  calls.length = 0;
  stub.__orphans = [];
  const r = await reapOrphanedRuns();
  assert.strictEqual(r.reaped, 0);
  assert.strictEqual(calls.filter((c) => c[0] === 'updateMany').length, 0, 'nothing written');
});
