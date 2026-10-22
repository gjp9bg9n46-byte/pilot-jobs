'use strict';

// ALY is the case these rules came from: a code on a real Air Cairo voyage
// report that the public dataset does not carry at all.

const test = require('node:test');
const assert = require('node:assert');
const { resolveAirport } = require('../airportService');

test('ALY resolves to Alexandria El Nouzha, open, with its own coordinates', async () => {
  const a = await resolveAirport('ALY');
  assert.ok(a, 'ALY must resolve — a pilot writing it means Alexandria');
  assert.equal(a.icao, 'HEAX');
  assert.equal(a.closed, false, 'open: the owner flies there, whatever the dataset says');
  // El Nouzha, not Borg El Arab (30.932, 29.696) — the row OurAirports conflates it with.
  assert.equal(a.lat, 31.184);
  assert.equal(a.lon, 29.949);
});

test('the override is case-insensitive and works from either code', async () => {
  for (const code of ['aly', 'ALY', 'heax', 'HEAX']) {
    const a = await resolveAirport(code);
    assert.equal(a && a.iata, 'ALY', `${code} should resolve`);
  }
});

test('ordinary codes are unaffected by the override table', async () => {
  const cai = await resolveAirport('CAI');
  assert.equal(cai.closed, false);
  assert.equal(cai.icao, 'HECA');
  // Borg El Arab keeps the dataset's own record; only ALY/HEAX are overridden.
  const hbe = await resolveAirport('HBE');
  assert.equal(hbe.iata, 'HBE');
});

test('a code that does not exist anywhere still returns null', async () => {
  assert.equal(await resolveAirport('XQX'), null);
  assert.equal(await resolveAirport(''), null);
});
