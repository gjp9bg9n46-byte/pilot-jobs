'use strict';

// Guardrail: EVERY ingestable source must have a normalize() handling path.
// A source in the runner dispatch (or employers.js config) with no case in
// normalize() has ALL its fetched jobs silently discarded before upsert — the
// bug that zeroed WhatJobs, Taleo, Phenom, Recruitee, Teamtailor, BambooHR,
// Personio, Reed, Breezy, Ashby, Traffit for weeks. This test fails CI the
// moment a new source is added without a normalize() home.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { normalizeHandledSources, normalize, takeUnmappedSources } = require('../normalize');
const employers = require('../config/employers');

// Sources the runner can actually dispatch (parsed from runner.js so this can
// never drift from the real code): `case 'X': return fetchX(empConfig)`.
const runnerSrc = fs.readFileSync(path.join(__dirname, '..', 'runner.js'), 'utf8');
const dispatchSources = [...new Set([...runnerSrc.matchAll(/case '([A-Z_]+)':\s*return fetch/g)].map((m) => m[1]))];

// Sources referenced by the employer config.
const configSources = [...new Set(employers.map((e) => e.source))];

test('runner dispatch parse found the expected sources', () => {
  assert.ok(dispatchSources.length >= 20, `expected many dispatch sources, got ${dispatchSources.length}`);
  assert.ok(dispatchSources.includes('WHATJOBS') && dispatchSources.includes('ADZUNA'));
});

test('normalize() has a handling path for EVERY runner-dispatch source', () => {
  const handled = normalizeHandledSources();
  const missing = dispatchSources.filter((s) => !handled.has(s));
  assert.deepStrictEqual(missing, [],
    `normalize.js has NO handling path for: [${missing.join(', ')}] — their jobs are silently dropped. Add each to PRENORMALIZED (passthrough) or NORMALIZERS (mapper) in normalize.js.`);
});

test('normalize() has a handling path for EVERY employers.js config source', () => {
  const handled = normalizeHandledSources();
  const missing = configSources.filter((s) => !handled.has(s));
  assert.deepStrictEqual(missing, [],
    `normalize.js has NO handling path for config sources: [${missing.join(', ')}].`);
});

test('normalize() does NOT drop a handled source, and DOES flag an unmapped one', () => {
  takeUnmappedSources(); // clear
  // A handled passthrough source returns the row.
  const ok = normalize({ sourcePlatform: 'WHATJOBS', title: 't', applyUrl: 'http://x' }, {});
  assert.ok(ok && ok.title === 't', 'handled source should pass through, not null');
  assert.deepStrictEqual(takeUnmappedSources(), [], 'handled source must not be flagged unmapped');
  // An unknown source is nulled AND recorded for the alert.
  const bad = normalize({ sourcePlatform: 'TOTALLY_NEW_ATS', title: 't' }, {});
  assert.strictEqual(bad, null, 'unmapped source returns null');
  assert.deepStrictEqual(takeUnmappedSources(), ['TOTALLY_NEW_ATS'], 'unmapped source must be recorded for the alert');
});
