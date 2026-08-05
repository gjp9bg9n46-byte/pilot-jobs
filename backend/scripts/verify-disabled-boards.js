#!/usr/bin/env node
'use strict';

/**
 * Re-verify every disabled LEVER / GREENHOUSE employer in
 * src/scrapers/config/employers.js against the live ATS APIs.
 *
 * Why: the 2026-08-03 sweep disabled ~15 Greenhouse boards as "dead board
 * (HTTP 404)" all on the same day — suspicious enough (rate-limit or network
 * failure misread as 404?) to warrant a slow, spaced re-check before
 * accepting that much lost coverage.
 *
 * For each disabled board it reports:
 *   ALIVE  <n> jobs (<p> pilot-titled)  → re-enable it in employers.js
 *   DEAD   HTTP 404                     → truly gone; find the new ATS
 *   RETRY  HTTP 429/5xx/timeout         → NOT dead; do not disable
 *
 * Read-only, no DB. Run from your machine (not CI) so the egress IP is yours:
 *   node scripts/verify-disabled-boards.js
 */

const axios = require('axios');
const employers = require('../src/scrapers/config/employers');

const PILOT_RE = /pilot|first officer|captain|flight instructor|check airman|sfo\b/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(url, extract) {
  try {
    const { data, status } = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'PilotJobsIngest/1.0 (+config re-verification)' },
      validateStatus: () => true,
    });
    if (status !== 200) return { status };
    return { status, ...extract(data) };
  } catch (err) {
    return { status: 'ERR', err: err.code || err.message };
  }
}

async function main() {
  const targets = employers.filter(
    (e) => e.disabled && (e.source === 'GREENHOUSE' || e.source === 'LEVER') && (e.slug || e.config),
  );
  console.log(`Re-checking ${targets.length} disabled Lever/Greenhouse boards...\n`);

  const results = { alive: [], dead: [], retry: [] };

  for (const emp of targets) {
    const slug = emp.slug || emp.config;
    let r;
    if (emp.source === 'GREENHOUSE') {
      r = await probe(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
        (d) => ({ jobs: (d.jobs || []).length, pilot: (d.jobs || []).filter((j) => PILOT_RE.test(j.title)).length }),
      );
    } else {
      r = await probe(
        `https://api.lever.co/v0/postings/${slug}?mode=json`,
        (d) => ({ jobs: Array.isArray(d) ? d.length : 0, pilot: (Array.isArray(d) ? d : []).filter((j) => PILOT_RE.test(j.text)).length }),
      );
    }

    let verdict;
    if (r.status === 200) {
      verdict = `ALIVE  ${r.jobs} jobs (${r.pilot} pilot-titled)`;
      results.alive.push({ ...emp, ...r });
    } else if (r.status === 404) {
      verdict = 'DEAD   HTTP 404';
      results.dead.push(emp);
    } else {
      verdict = `RETRY  ${r.status}${r.err ? ` (${r.err})` : ''} — transient, NOT proof of death`;
      results.retry.push(emp);
    }
    console.log(`${emp.source.padEnd(11)} ${String(slug).padEnd(28)} ${verdict}`);

    await sleep(1500); // gentle spacing — the whole point is avoiding rate-limit false negatives
  }

  console.log('\n── Summary ─────────────────────────────────');
  console.log(`ALIVE (re-enable in employers.js): ${results.alive.map((e) => e.slug || e.config).join(', ') || 'none'}`);
  console.log(`DEAD  (find their new ATS):        ${results.dead.map((e) => e.slug || e.config).join(', ') || 'none'}`);
  console.log(`RETRY (re-run later):              ${results.retry.map((e) => e.slug || e.config).join(', ') || 'none'}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
