'use strict';

/**
 * The WhatJobs sweep's per-country health report and its 429 handling.
 *
 * The failure this guards against is the quiet one: a limiter turns on, a
 * country returns nothing, and the pipeline reads "nothing" as "that market
 * has no pilot jobs" and expires them. So two things must hold — a limited
 * country must be reported UNHEALTHY (which protects its rows downstream), and
 * Retry-After must actually be waited out before the sweep gives up on it.
 *
 * axios is stubbed, so no partner API calls are made.
 * Run: node src/scrapers/__tests__/whatjobsSweep.test.js
 */

const assert = require('assert');

process.env.WHATJOBS_USER_IP = '203.0.113.9';     // skips the ipify lookup
process.env.WHATJOBS_COUNTRIES = 'uk,ie,de';
process.env.WHATJOBS_QUERIES = 'pilot';
process.env.WHATJOBS_MAX_PAGES = '1';

const axios = require('axios');
const realGet = axios.get;

const job = (i) => ({
  title: `First Officer A320 ${i}`, company: 'Acme Air', location: 'London',
  url: `https://www.whatjobs.com/pub_api__cpl__${i}__7225?utm_source=x`,
  snippet: '<p>ATPL required, 1500 hours total time.</p>', age_days: 3,
});

let waits = [];
function run(handler) {
  waits = [];
  // Record how long the sweep sleeps without actually sleeping: a real
  // Retry-After test would add seconds to the suite for no extra confidence.
  const realTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => { waits.push(ms); return realTimeout(fn, 0); };
  axios.get = handler;
  const restore = () => { axios.get = realGet; global.setTimeout = realTimeout; };
  return { restore };
}

(async () => {
  let passed = 0;
  const { fetchWhatJobs, lastSweepReport, PUBLISHERS } = require('../sources/whatjobs');
  const PUB = Object.fromEntries(Object.entries(PUBLISHERS).map(([c, m]) => [m.id, c]));

  // ── 1. A clean sweep: every country healthy, rows attributed per country ──
  {
    const { restore } = run(async (url, cfg) => ({
      status: 200,
      data: { data: [job(`${cfg.params.publisher}-1`), job(`${cfg.params.publisher}-2`)], last_page: 1 },
    }));
    try {
      const rows = await fetchWhatJobs({});
      const rep = lastSweepReport();
      assert.strictEqual(rep.countries.length, 3, 'three countries swept');
      assert.ok(rep.countries.every((c) => c.healthy), 'all countries healthy');
      assert.strictEqual(rows.length, 6, 'two rows per country, deduped by externalId');
      assert.deepStrictEqual(rep.countries.map((c) => c.rows), [2, 2, 2], 'rows attributed per country');
      passed += 4;
    } finally { restore(); }
  }

  // ── 2. A 429 on one country: that country is unhealthy, the rest are fine ─
  {
    const blocked = PUBLISHERS.ie.id;
    const { restore } = run(async (url, cfg) => {
      if (cfg.params.publisher === blocked) {
        const err = new Error('Request failed with status code 429');
        err.response = { status: 429, headers: { 'retry-after': '7' } };
        err.config = cfg;
        throw err;
      }
      return { status: 200, data: { data: [job(`${cfg.params.publisher}-1`)], last_page: 1 } };
    });
    try {
      const rows = await fetchWhatJobs({});
      const rep = lastSweepReport();
      const ie = rep.countries.find((c) => c.code === 'ie');
      const uk = rep.countries.find((c) => c.code === 'uk');
      assert.strictEqual(ie.healthy, false, 'the rate-limited country is UNHEALTHY');
      assert.ok(ie.rateLimited >= 1, 'the 429 is counted');
      assert.strictEqual(ie.rows, 0, 'and it returned no rows');
      assert.strictEqual(uk.healthy, true, 'an unaffected country stays healthy');
      // Retry-After: 7 → three attempts, two waits of 7s (not the 1.5s default).
      assert.ok(waits.includes(7000), `Retry-After honoured (waits: ${waits.join(',')})`);
      assert.strictEqual(rows.length, 2, 'the other two countries still delivered');
      passed += 6;
    } finally { restore(); }
  }

  // ── 3. Zero rows from a country that ANSWERED is healthy, not a failure ───
  // "No pilot jobs in Ireland today" is a fact we can act on. "Ireland did not
  // answer" is not. Conflating them is what this whole fix is about.
  {
    const quiet = PUBLISHERS.ie.id;
    const { restore } = run(async (url, cfg) => ({
      status: 200,
      data: cfg.params.publisher === quiet ? { data: [], last_page: 1 } : { data: [job(`${cfg.params.publisher}-1`)], last_page: 1 },
    }));
    try {
      await fetchWhatJobs({});
      const ie = lastSweepReport().countries.find((c) => c.code === 'ie');
      assert.strictEqual(ie.rows, 0, 'no rows');
      assert.strictEqual(ie.healthy, true, 'but HEALTHY — it answered');
      passed += 2;
    } finally { restore(); }
  }

  // ── 4. A 500 retries; a 404 does not ─────────────────────────────────────
  {
    for (const [status, expectRetries] of [[500, true], [404, false]]) {
      let calls = 0;
      const { restore } = run(async (url, cfg) => {
        if (cfg.params.publisher !== PUBLISHERS.uk.id) return { status: 200, data: { data: [], last_page: 1 } };
        calls++;
        const err = new Error(`HTTP ${status}`);
        err.response = { status, headers: {} };
        err.config = cfg;
        throw err;
      });
      try {
        await fetchWhatJobs({});
        if (expectRetries) assert.strictEqual(calls, 3, `${status} retried to MAX_ATTEMPTS`);
        else assert.strictEqual(calls, 1, `${status} is our mistake, not retried`);
        const uk = lastSweepReport().countries.find((c) => c.code === 'uk');
        assert.strictEqual(uk.healthy, false, `${status} marks the country unhealthy`);
        passed += 2;
      } finally { restore(); }
    }
  }

  // ── 5. A broken response shape is a failure, not an empty market ─────────
  {
    const { restore } = run(async (url, cfg) => (
      cfg.params.publisher === PUBLISHERS.de.id
        ? { status: 200, data: { jobs: [] } }                 // no data[] — shape drift
        : { status: 200, data: { data: [job(`${cfg.params.publisher}`)], last_page: 1 } }
    ));
    try {
      await fetchWhatJobs({});
      const de = lastSweepReport().countries.find((c) => c.code === 'de');
      assert.strictEqual(de.healthy, false, 'shape drift marks the country unhealthy');
      passed += 1;
    } finally { restore(); }
  }

  assert.ok(PUB[PUBLISHERS.uk.id] === 'uk', 'publisher map sanity');
  console.log(`whatjobs sweep health: ${passed}/${passed} passed`);
  console.log('ALL WHATJOBS SWEEP TESTS PASSED');
})().catch((e) => { console.error('WHATJOBS SWEEP TEST FAILED:', e.message, e.stack); process.exit(1); });
