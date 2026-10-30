#!/usr/bin/env node
/* eslint-disable no-console */
// ── Run before every EAS update ─────────────────────────────────────────────
//
// Three updates in a row passed a type-check, a lint and a web screenshot and
// then broke a screen on a real phone. What they had in common: nothing
// exercised the screens against the shape of data the owner's account
// actually holds, including the shape already sitting in the on-device cache.
//
// This drives the PRODUCTION bundle (expo start --no-dev --minify, the same
// JS an update ships) through Logbook, the map card, the full-screen map, a
// flight's own page and the Scan screen, answering every /api call from JSON
// fetched read-only from prod. It fails loudly on:
//   · a render error or an error boundary on any screen
//   · a red banner from the server
//   · a screen that renders but says something false ("0 airports")
// and it does it twice: once with an empty cache, and once with the cache
// shape a device that has run an older build would be holding — which is the
// case that broke the map.
//
//   node scripts/preflight.cjs            # expects the fixtures to exist
//   node scripts/preflight.cjs --keep     # leave the server running
//
// Fixtures live beside this script's output dir and are refreshed by
// scripts/fixtures.cjs.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const puppeteer = require(path.join(__dirname, '../../backend/node_modules/puppeteer'));

const FIX = process.env.PREFLIGHT_FIXTURES
  || path.join(__dirname, '..', '.preflight-fixtures');
const PORT = Number(process.env.PREFLIGHT_PORT || 8099);
const BASE = `http://localhost:${PORT}`;

const read = (n) => JSON.parse(fs.readFileSync(path.join(FIX, n), 'utf8'));

function stubs() {
  const bootstrap = read('bootstrap.json');
  const airports = read('airports.json');
  const rest = read('rest.json');
  const flight = read('flight.json');
  const flightScan = read('flight-scan.json');
  const jobs = read('jobs.json');
  const airlines = read('airlines.json');
  const job = read('job.json');
  return {
    '/api/logbook/bootstrap': bootstrap,
    '/api/logbook/prefs': bootstrap.prefs,
    '/api/logbook/summary': bootstrap.summary,
    '/api/logbook/scan-quota': { enabled: true, left: 30, limit: 30 },
    '/api/logbook/scan': { scans: [] },
    '/api/flight-logs': bootstrap.flights,
    '/api/profile/airports': airports,
    '/api/profile/carry-forward': rest.carryForward,
    '/api/profile/totals': bootstrap.summary.totals,
    '/api/profile': rest.profile || {},
    '/api/auth/me': rest.me,
    '/api/jobs/alerts/unread-count': { count: 0 },
    // prefetchTabs warms these on every cold start; unstubbed they are noise
    // that drowns the signal this script exists to show.
    '/api/jobs': jobs,
    '/api/airlines': airlines,
    // Airline logos are proxied per row; they are images, not screens.
    '/api/logo': {},
    '/api/cv/document': { document: null },
    '/api/airlines/logos': { items: [] },
    '/api/dashboard': { newJobs: 0 },
    __flight: flight,
    __flightScan: flightScan,
    __job: job,
  };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

// The cache a device holds after running an older build: the airports entry
// written when useAirportCoords still returned a Map, which JSON turned into
// {}. This is the exact state that made the map say "0 airports".
const STALE_CACHE = (buster) => JSON.stringify({
  buster,
  timestamp: Date.now(),
  clientState: {
    mutations: [],
    queries: [{
      dehydratedAt: Date.now(),
      queryKey: ['profile', 'airports'],
      queryHash: '["profile","airports"]',
      state: {
        data: {}, dataUpdateCount: 1, dataUpdatedAt: Date.now(), error: null,
        errorUpdateCount: 0, errorUpdatedAt: 0, fetchFailureCount: 0,
        fetchFailureReason: null, fetchMeta: null, isInvalidated: false,
        status: 'success', fetchStatus: 'idle',
      },
    }],
  },
});

// Things that must never appear on a screen.
const FORBIDDEN = [
  { re: /Something went wrong/i, why: 'an error boundary caught a render error' },
  { re: /Map unavailable/i, why: 'the map card boundary caught a render error' },
  { re: /is not defined/i, why: 'a ReferenceError reached the UI' },
  { re: /is not a function/i, why: 'a TypeError reached the UI' },
  { re: /undefined|\[object Object\]|NaN:NaN/, why: 'a raw value leaked into the copy' },
  { re: /0 airports/i, why: 'the airport lookup came back empty' },
  { re: /without coordinates not shown/i, why: 'airports failed to resolve' },
  { re: /Airports could not be loaded/i, why: 'the airports call failed' },
  { re: /FAA-derived|unverified|ECAR Part 61|JAR-derived/, why: 'an internal note is visible to the pilot' },
];

async function run() {
  if (!fs.existsSync(FIX)) {
    console.error(`No fixtures at ${FIX}. Run: node scripts/fixtures.cjs`);
    process.exit(2);
  }
  // Before anything renders: can this JS even be an update? A native module
  // added since the last build would throw on load inside the binary people
  // already have, and nothing below would notice, because this machine has
  // the module installed.
  const nativeCheck = require('child_process').spawnSync(
    process.execPath, [path.join(__dirname, 'native-modules.cjs')], { encoding: 'utf8' },
  );
  process.stdout.write(nativeCheck.stdout || '');
  if (nativeCheck.status !== 0) {
    if (!process.argv.includes('--build')) {
      process.stderr.write(nativeCheck.stderr || '');
      console.error('\npreflight stops here: ship a BUILD, not an update.');
      process.exit(1);
    }
    // --build: a new binary WILL contain them, so this is information, not a
    // failure. Re-record the list once the build is cut.
    console.log('  (--build: a new binary will contain these)\n');
  }

  const S = stubs();
  const buster = /CACHE_BUSTER = '([^']+)'/.exec(
    fs.readFileSync(path.join(__dirname, '../src/lib/queryClient.ts'), 'utf8'),
  )?.[1] || 'unknown';
  console.log(`preflight · production bundle · cache buster ${buster}\n`);

  // The production bundle, not the dev one: __DEV__ is false, the code is
  // minified, and that is what an update ships.
  const server = spawn(
    'npx',
    ['expo', 'start', '--web', '--port', String(PORT), '--no-dev', '--minify'],
    { cwd: path.join(__dirname, '..'), stdio: 'ignore', env: { ...process.env, CI: '1' } },
  );
  const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { try { server.kill('SIGKILL'); } catch { /* gone */ } } };
  process.on('exit', stop);

  for (let i = 0; i < 150; i += 1) {
    try {
      const r = await fetch(BASE);
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 2000));
  }

  const failures = [];
  const browser = await puppeteer.launch({ headless: 'new' });

  for (const pass of ['empty cache', 'cache from an older build']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    const runtime = [];
    page.on('pageerror', (e) => runtime.push(`pageerror: ${String(e.message).slice(0, 200)}`));
    page.on('console', (m) => {
      const t = m.text();
      if (m.type() === 'error'
        && !/Download the React DevTools|was preloaded/.test(t)
        // Our own 404 for an unstubbed call is already reported above.
        && !/Failed to load resource/.test(t)) {
        runtime.push(`console.error: ${t.slice(0, 200)}`);
      }
    });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = new URL(req.url(), BASE);
      if (/cdn\.jsdelivr\.net/.test(u.host)) return req.continue();
      if (!u.pathname.startsWith('/api/')) return req.continue();
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS });
      if (/^\/api\/flight-logs\/[^/]+$/.test(u.pathname)) {
        const id = u.pathname.split('/').pop();
        const which = id === S.__flightScan.id ? S.__flightScan : S.__flight;
        return req.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(which) });
      }
      if (/^\/api\/jobs\/[0-9a-f-]{8,}$/.test(u.pathname)) {
        return req.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(S.__job) });
      }
      const k = Object.keys(S).find((x) => !x.startsWith('__') && u.pathname.startsWith(x));
      if (!k) {
        runtime.push(`unstubbed ${req.method()} ${u.pathname}`);
        return req.respond({ status: 404, headers: CORS, contentType: 'application/json', body: '{}' });
      }
      req.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(S[k]) });
    });
    const stale = pass !== 'empty cache';
    await page.evaluateOnNewDocument((b, withStale, cache) => {
      try {
        localStorage.clear();
        localStorage.setItem('cockpithire.auth.token', 'stub');
        localStorage.setItem('cockpithire.auth.type', 'pilot');
        if (withStale) localStorage.setItem('cockpithire.query-cache.v1', cache);
      } catch { /* ignore */ }
    }, buster, stale, STALE_CACHE(buster));

    const screens = [
      { name: 'Logbook', path: '/logbook', must: [/flights/i] },
      { name: 'map card', path: '/logbook', must: [/airports? · (all time|this view)/i], scroll: 600 },
      { name: 'full map', path: '/logbook/map', must: [/airports?/i] },
      // Both shapes: an imported row with two times, and a scanned one with
      // four. Each must name its airports and give the great-circle distance.
      {
        name: 'flight detail · imported',
        path: `/logbook/flight/${S.__flight.id}`,
        must: [/BLOCK/, /\(\w{4}\) → /, /nm great circle/],
      },
      {
        name: 'flight detail · scanned',
        path: `/logbook/flight/${S.__flightScan.id}`,
        must: [/BLOCK/, /\(\w{4}\) → /, /nm great circle/],
      },
      { name: 'scan', path: '/logbook/scan', must: [] },
      // The three the campaign row took down. The list has to reach the
      // bottom, because that is where a campaign sorts.
      { name: 'Jobs list', path: '/jobs', must: [/job|vacanc/i] },
      { name: 'Jobs · bottom', path: '/jobs', must: [/General recruitment/i], scroll: 60000 },
      { name: 'Airlines', path: '/airlines', must: [/airline/i] },
      { name: 'job detail', path: `/jobs/${S.__job?.id || S.__job?.job?.id}`, must: [/apply|requirement|recruitment/i] },
    ];

    for (const sc of screens) {
      runtime.length = 0;
      await page.goto(`${BASE}${sc.path}`, { waitUntil: 'networkidle2', timeout: 180000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 3500));
      if (sc.scroll) {
        // A virtualised list only renders what is near the viewport, so one
        // jump to a big offset lands nowhere. Step down until what we are
        // looking for appears, or the list stops growing.
        const want = (sc.must || [])[0];
        let lastTop = -1;
        for (let step = 0; step < 60; step += 1) {
          const top = await page.evaluate((y) => {
            const el = [...document.querySelectorAll('div')]
              .filter((n) => n.scrollHeight > n.clientHeight + 40)
              .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
            if (!el) { window.scrollBy(0, y); return -1; }
            el.scrollTop = Math.min(el.scrollTop + y, el.scrollHeight);
            el.dispatchEvent(new Event('scroll', { bubbles: true }));
            return el.scrollTop;
          }, Math.min(sc.scroll, 2500));
          await new Promise((r) => setTimeout(r, 400));
          if (want) {
            const found = await page.evaluate((src, flags) => new RegExp(src, flags).test(document.body.innerText),
              want.source, want.flags);
            if (found) break;
          }
          if (top === lastTop) break;
          lastTop = top;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
      const text = await page.evaluate(() => document.body.innerText).catch(() => '');
      const bad = FORBIDDEN.filter((f) => f.re.test(text));
      // A single sector's map must show that sector, not the whole career.
      if (/flight detail/.test(sc.name) && /· all time/.test(text)) {
        bad.push({ re: /· all time/, why: "the flight's map is showing every airport, not this sector" });
      }
      const missing = (sc.must || []).filter((re) => !re.test(text));
      for (const b of bad) failures.push(`[${pass}] ${sc.name}: ${b.why} — "${(text.match(b.re) || [''])[0]}"`);
      for (const m of missing) failures.push(`[${pass}] ${sc.name}: expected ${m} and did not find it`);
      for (const r of runtime) failures.push(`[${pass}] ${sc.name}: ${r}`);
      const mark = bad.length || missing.length || runtime.length ? '✖' : '✓';
      console.log(`  ${mark} ${pass} · ${sc.name}`);
    }
    await page.close();
  }

  await browser.close();
  stop();

  if (failures.length) {
    console.error(`\n${failures.length} problem(s):`);
    for (const f of failures) console.error(`  · ${f}`);
    console.error('\nDo NOT publish this update.');
    process.exit(1);
  }
  console.log('\nEvery screen rendered, on an empty cache and on a cache from an older build.');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
