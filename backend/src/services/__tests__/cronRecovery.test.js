'use strict';

/**
 * Surviving a deploy that lands mid-cycle.
 *
 * Railway replaces the container on every deploy. Deploys happen in working
 * hours, and 12:00 UTC is the only scrape cycle inside that window — of the
 * last 120 cycles the four that never completed were 12:00 x3 and 00:00 x1,
 * each with a new-commit container taking over 0-4 minutes after the sweep
 * began. 00:00, 06:00 and 18:00 UTC have never been lost.
 *
 * Two things are tested here. That a killed cycle is noticed and re-run, and —
 * more importantly — that noticing it cannot turn into a stampede: sixteen
 * deploys in an afternoon must not become sixteen 25-minute sweeps against
 * partner APIs. Every "no" below is load-bearing.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { shouldCatchUp } = require('../cronRun');

const base = { hoursSinceLastSuccess: 1, intervalHours: 6, inFlight: false, attemptedWithinCooldown: false };

test('an overdue cycle is caught up', () => {
  const r = shouldCatchUp({ ...base, hoursSinceLastSuccess: 6.4 });
  assert.strictEqual(r.catchUp, true);
  assert.match(r.reason, /6\.4h ago/);
});

test('a cycle that is merely due-soon is left to the cron', () => {
  // 5.9h after the last success the next scheduled run is minutes away; racing
  // it buys nothing and costs a full sweep.
  assert.strictEqual(shouldCatchUp({ ...base, hoursSinceLastSuccess: 5.9 }).catchUp, false);
  assert.strictEqual(shouldCatchUp({ ...base, hoursSinceLastSuccess: 6 }).catchUp, false,
    'exactly at the interval is not yet overdue');
});

test('a sweep already in flight is never joined by a second one', () => {
  // The stampede case: a rolling deploy briefly has two containers, both of
  // which boot and both of which would otherwise see a missed cycle.
  const r = shouldCatchUp({ ...base, hoursSinceLastSuccess: 99, inFlight: true });
  assert.strictEqual(r.catchUp, false);
  assert.match(r.reason, /already in flight/);
});

test('a recent ATTEMPT blocks a catch-up even though it failed', () => {
  // This is what caps a deploy storm. The previous attempt was killed, so it
  // left no success — if only successes counted, every redeploy would start
  // another sweep.
  const r = shouldCatchUp({ ...base, hoursSinceLastSuccess: 99, attemptedWithinCooldown: true });
  assert.strictEqual(r.catchUp, false);
  assert.match(r.reason, /within the cooldown/);
});

test('in-flight and cooldown both win over a very overdue cycle', () => {
  for (const flags of [{ inFlight: true }, { attemptedWithinCooldown: true }, { inFlight: true, attemptedWithinCooldown: true }]) {
    assert.strictEqual(shouldCatchUp({ ...base, hoursSinceLastSuccess: 1e6, ...flags }).catchUp, false,
      `safety flags must beat staleness: ${JSON.stringify(flags)}`);
  }
});

test('no successful sweep on record counts as overdue, not as up to date', () => {
  for (const v of [null, undefined, Infinity]) {
    const r = shouldCatchUp({ ...base, hoursSinceLastSuccess: v });
    assert.strictEqual(r.catchUp, true, `hoursSinceLastSuccess=${String(v)}`);
  }
  assert.match(shouldCatchUp({ ...base, hoursSinceLastSuccess: null }).reason, /no successful sweep/);
});

test('a shorter configured interval shortens the patience', () => {
  assert.strictEqual(shouldCatchUp({ ...base, hoursSinceLastSuccess: 3.5, intervalHours: 3 }).catchUp, true);
  assert.strictEqual(shouldCatchUp({ ...base, hoursSinceLastSuccess: 3.5, intervalHours: 6 }).catchUp, false);
});

// ── The trace guard must still have teeth ───────────────────────────────────
// mergeGuard.test.js now follows one hop of indirection, because the scrape is
// entered through startScrape(). A follower that accepts any hop would quietly
// retire the check that found a laptop rewriting 458 live rows, so prove it
// still rejects a hop that never reaches withCronRun.
test('the one-hop trace follower still rejects an untraced entry point', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../app.js'), 'utf8');

  const untracedIn = (text) => {
    const out = [];
    for (const m of text.matchAll(/(cron\.schedule\(|setImmediate\(|setTimeout\()/g)) {
      const window = text.slice(m.index, m.index + 220);
      if (window.includes('withCronRun')) continue;
      const hop = window.match(/=>\s*([A-Za-z_$][\w$]*)\s*\(/);
      if (hop) {
        const decl = new RegExp(`(?:async\\s+)?function\\s+${hop[1]}\\s*\\(`);
        const at = text.search(decl);
        if (at >= 0 && text.slice(at, at + 1200).includes('withCronRun')) continue;
      }
      out.push(window.split('\n')[0].trim().slice(0, 70));
    }
    return out;
  };

  assert.deepStrictEqual(untracedIn(src), [], 'the real app.js is fully traced');

  // A hop to a function that writes to the DB without a trace: must be caught.
  const bad = `${src}\nasync function sneakyWrite() { await prisma.job.updateMany({}); }\ncron.schedule('0 5 * * *', () => sneakyWrite());\n`;
  const found = untracedIn(bad);
  assert.strictEqual(found.length, 1, `an untraced hop must be reported, got ${JSON.stringify(found)}`);
  assert.match(found[0], /sneakyWrite/);
});
