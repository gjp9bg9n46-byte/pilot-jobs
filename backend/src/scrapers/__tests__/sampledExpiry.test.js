'use strict';

/**
 * The expiry rule for SAMPLED sources (the aggregator-churn fix).
 *
 * An ATS answers "every opening we have", so a row absent from one fetch is
 * gone and must leave the board at once. A keyword aggregator answers "page 1-2
 * of what matches these words right now" — ask twice, get different sets. The
 * pipeline used to treat the second kind as the first, and expired 858
 * Careerjet and 329 WhatJobs rows within twelve hours of seeing them alive in
 * a single week, against 0 for Greenhouse.
 *
 * These tests pin both halves: sampled sources get a grace window, complete
 * listings still expire immediately. No DB — staleWhere() is pure, and the
 * tiny matcher below applies its output to candidate rows so the assertions
 * read as outcomes ("this row survives") rather than query shape.
 *
 * Run: node src/scrapers/__tests__/sampledExpiry.test.js
 */

const assert = require('assert');
const { staleWhere, SAMPLED_SOURCES, unseenGraceHours } = require('../runner');

// ── A matcher for the Prisma operators staleWhere actually uses ──────────────
function matchLeaf(value, cond) {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value != null && new Date(value).getTime() === cond.getTime();
  if (cond && typeof cond === 'object') {
    for (const [op, operand] of Object.entries(cond)) {
      const v = value == null ? null : (value instanceof Date ? value.getTime() : value);
      const o = operand instanceof Date ? operand.getTime() : operand;
      if (op === 'notIn') { if (value != null && operand.includes(value)) return false; }
      else if (op === 'in') { if (value == null || !operand.includes(value)) return false; }
      else if (op === 'lt') { if (v == null || !(v < o)) return false; }
      else if (op === 'lte') { if (v == null || !(v <= o)) return false; }
      else if (op === 'not') { if (operand === null ? value == null : v === o) return false; }
      else throw new Error(`matcher: unhandled operator ${op}`);
    }
    return true;
  }
  return value === cond;
}
function matches(row, where) {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') { if (!cond.every((c) => matches(row, c))) return false; continue; }
    if (key === 'OR') { if (!cond.some((c) => matches(row, c))) return false; continue; }
    if (!matchLeaf(row[key], cond)) return false;
  }
  return true;
}

const NOW = new Date('2026-11-01T12:00:00Z');
const agoH = (h) => new Date(NOW.getTime() - h * 3600 * 1000);
const row = (o) => ({
  sourcePlatform: 'WHATJOBS', company: 'Acme Air', status: 'ACTIVE', externalId: 'absent-1',
  country: 'United Kingdom', expiresAt: null, lastSeenAt: agoH(6), updatedAt: agoH(6), ...o,
});

let passed = 0;
const check = (label, expected, actual) => { assert.strictEqual(actual, expected, label); passed++; };

(async () => {
  // ── 1. A sampled source gives a row time to reappear ──────────────────────
  {
    const w = staleWhere('WHATJOBS', null, ['seen-a'], { now: NOW, graceHours: 72 });
    check('absent but seen 6h ago → SURVIVES (one missed sample is not removal)',
      false, matches(row({ lastSeenAt: agoH(6) }), w));
    check('absent, last seen 71h ago → still inside the window, SURVIVES',
      false, matches(row({ lastSeenAt: agoH(71) }), w));
    check('absent, last seen 80h ago → past the window, EXPIRES',
      true, matches(row({ lastSeenAt: agoH(80) }), w));
    check('present in this run (externalId seen) → never touched',
      false, matches(row({ externalId: 'seen-a', lastSeenAt: agoH(999) }), w));
  }

  // ── 2. A complete listing still loses a pulled job immediately ────────────
  // The regression that matters most: this fix must not make a filled ATS
  // vacancy linger. Greenhouse/Lever/Workday/iCIMS keep one-shot expiry.
  {
    for (const src of ['GREENHOUSE', 'LEVER', 'WORKDAY_REST', 'ICIMS', 'AVATURE', 'TALEO']) {
      const w = staleWhere(src, 'Acme Air', ['seen-a'], { now: NOW });
      check(`${src}: absent and seen minutes ago → EXPIRES at once (no grace)`,
        true, matches(row({ sourcePlatform: src, lastSeenAt: agoH(0.1) }), w));
    }
    assert.ok(!SAMPLED_SOURCES.has('GREENHOUSE') && !SAMPLED_SOURCES.has('WORKDAY_REST'),
      'ATS sources must never be classified as sampled');
    passed++;
  }

  // ── 3. A country that did not answer keeps its jobs ───────────────────────
  // The point of the fix: "the API was rate-limited" and "that market's jobs
  // were taken down" are different facts and must not share a consequence.
  {
    const w = staleWhere('WHATJOBS', null, ['seen-a'], {
      now: NOW, graceHours: 72, protectCountries: ['Spain', 'Ireland'],
    });
    check('failed country, row long unseen → PROTECTED, survives',
      false, matches(row({ country: 'Spain', lastSeenAt: agoH(400) }), w));
    check('healthy country, row long unseen → expires normally',
      true, matches(row({ country: 'United Kingdom', lastSeenAt: agoH(400) }), w));
    check('a row with no country recorded is not swept up by the protect list',
      true, matches(row({ country: null, lastSeenAt: agoH(400) }), w));
  }

  // ── 4. Rows predating lastSeenAt fall back to updatedAt ───────────────────
  {
    const w = staleWhere('CAREERJET', null, ['seen-a'], { now: NOW, graceHours: 72 });
    check('lastSeenAt NULL but updated 2h ago → SURVIVES (no false expiry)',
      false, matches(row({ sourcePlatform: 'CAREERJET', lastSeenAt: null, updatedAt: agoH(2) }), w));
    check('lastSeenAt NULL and untouched for 200h → EXPIRES',
      true, matches(row({ sourcePlatform: 'CAREERJET', lastSeenAt: null, updatedAt: agoH(200) }), w));
  }

  // ── 5. A future expiresAt still wins over everything ──────────────────────
  {
    const w = staleWhere('WHATJOBS', null, ['seen-a'], { now: NOW, graceHours: 0 });
    check('validThrough still in the future → never expired by absence',
      false, matches(row({ expiresAt: new Date(NOW.getTime() + 864e5), lastSeenAt: agoH(500) }), w));
  }

  // ── 6. The grace window is configurable, and 0 means the old behaviour ────
  {
    const w0 = staleWhere('WHATJOBS', null, ['seen-a'], { now: NOW, graceHours: 0 });
    check('graceHours 0 → a sampled source reverts to one-shot expiry',
      true, matches(row({ lastSeenAt: agoH(0.1) }), w0));
    const prev = process.env.AGGREGATOR_UNSEEN_GRACE_HOURS;
    process.env.AGGREGATOR_UNSEEN_GRACE_HOURS = '12';
    assert.strictEqual(unseenGraceHours(), 12, 'env override read');
    if (prev === undefined) delete process.env.AGGREGATOR_UNSEEN_GRACE_HOURS;
    else process.env.AGGREGATOR_UNSEEN_GRACE_HOURS = prev;
    assert.strictEqual(unseenGraceHours(), 72, 'default window is 72h (12 cron cycles)');
    passed += 2;
  }

  console.log(`sampled-source expiry: ${passed}/${passed} passed`);
  console.log('ALL SAMPLED-EXPIRY TESTS PASSED');
})().catch((e) => { console.error('SAMPLED-EXPIRY TEST FAILED:', e.message); process.exit(1); });
