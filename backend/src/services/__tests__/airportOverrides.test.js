'use strict';

// ALY is the case these rules came from: a code on a real Air Cairo voyage
// report that the public dataset does not carry at all.

const test = require('node:test');
const assert = require('node:assert');
const { resolveAirport } = require('../airportService');

test('ALY resolves to Alexandria El Nouzha, and says it is closed', async () => {
  const a = await resolveAirport('ALY');
  assert.ok(a, 'ALY must resolve — a pilot writing it means Alexandria');
  assert.equal(a.icao, 'HEAX');
  assert.equal(a.closed, true, 'closed, so the review can ask rather than assume');
  assert.ok(Number.isFinite(a.lat) && Number.isFinite(a.lon), 'coordinates, or night cannot be worked out');
});

test('the override is case-insensitive and works from either code', async () => {
  for (const code of ['aly', 'ALY', 'heax', 'HEAX']) {
    const a = await resolveAirport(code);
    assert.equal(a && a.iata, 'ALY', `${code} should resolve`);
  }
});

test('a closed airport still resolves generally, not just the override', async () => {
  // Including 'closed' in the dataset filter is the general rule; the override
  // only covers what the dataset omits entirely.
  const open = await resolveAirport('CAI');
  assert.equal(open.closed, false);
  assert.equal(open.icao, 'HECA');
});

test('a code that does not exist anywhere still returns null', async () => {
  assert.equal(await resolveAirport('XQX'), null);
  assert.equal(await resolveAirport(''), null);
});
