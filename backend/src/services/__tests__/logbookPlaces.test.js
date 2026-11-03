'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  greatCircleKm, moonPhrase, sunEvents, EARTH_CIRCUMFERENCE_KM, MOON_DISTANCE_KM,
} = require('../logbookPlaces');

// ── Distance ────────────────────────────────────────────────────────────────

const CAI = { lat: 30.122, lon: 31.406 };   // Cairo
const LHR = { lat: 51.4706, lon: -0.461941 };
const SSH = { lat: 27.977, lon: 34.395 };   // Sharm El Sheikh
const ALA = { lat: 43.352, lon: 77.041 };   // Almaty

test('greatCircleKm matches published distances within a percent', () => {
  // Cairo–Heathrow is about 3,520 km.
  const d = greatCircleKm(CAI, LHR);
  assert.ok(Math.abs(d - 3520) < 40, `CAI–LHR should be ~3,520 km, got ${Math.round(d)}`);
  // The longest sector in the test logbook, checked against the figure the
  // report prints.
  assert.strictEqual(Math.round(greatCircleKm(SSH, ALA)), 4159);
});

test('greatCircleKm is symmetric and zero for a point against itself', () => {
  assert.strictEqual(Math.round(greatCircleKm(CAI, LHR)), Math.round(greatCircleKm(LHR, CAI)));
  assert.strictEqual(greatCircleKm(CAI, CAI), 0);
});

test('greatCircleKm crosses the antimeridian without going the long way round', () => {
  const a = { lat: 0, lon: 179 };
  const b = { lat: 0, lon: -179 };
  // Two degrees of longitude at the equator, not 358.
  assert.ok(greatCircleKm(a, b) < 250, 'must take the short way across 180°');
});

// ── The Moon line ───────────────────────────────────────────────────────────
// Three brandings, agreed wording. The third exists because the second runs
// out: past 200% a pilot has been there and back, and "160% of the way back"
// is not a sentence.

test('moonPhrase under 100%: how far towards the Moon', () => {
  assert.strictEqual(moonPhrase(MOON_DISTANCE_KM * 0.6), '60% of the way to the Moon');
  assert.strictEqual(moonPhrase(MOON_DISTANCE_KM * 0.004), '0% of the way to the Moon');
});

test('moonPhrase 100–200%: there, and part of the way back', () => {
  assert.strictEqual(moonPhrase(MOON_DISTANCE_KM * 1.3), 'To the Moon and 30% of the way back');
  assert.strictEqual(moonPhrase(MOON_DISTANCE_KM * 1.0), 'To the Moon and 0% of the way back');
  assert.strictEqual(moonPhrase(MOON_DISTANCE_KM * 2.0), 'To the Moon and 100% of the way back');
});

test('moonPhrase over 200%: there and back, and some of the way out again', () => {
  // The real figure from the test logbook: 997,800 km is 259.6%.
  assert.strictEqual(moonPhrase(997800), 'To the Moon and back, and 60% of the way there again');
  assert.strictEqual(moonPhrase(MOON_DISTANCE_KM * 2.3), 'To the Moon and back, and 30% of the way there again');
});

test('the constants are the ones we quote', () => {
  assert.strictEqual(EARTH_CIRCUMFERENCE_KM, 40075);
  assert.strictEqual(MOON_DISTANCE_KM, 384400);
});

// ── Sunrises and sunsets ────────────────────────────────────────────────────

const leg = (date, off, on) => ({ date: new Date(date), offBlocksTime: off, onBlocksTime: on });

test('a daytime sector over the equator sees neither', () => {
  // Midday, two hours, nowhere near a horizon crossing.
  const ev = sunEvents(leg('2026-06-15T00:00:00Z', '10:00', '12:00'), CAI, SSH);
  assert.deepStrictEqual(ev, { sunrises: 0, sunsets: 0 });
});

test('a sector through dawn counts one sunrise and no sunset', () => {
  // Cairo sunrise mid-June is about 03:00 UTC; 01:00–05:00 brackets it.
  const ev = sunEvents(leg('2026-06-15T00:00:00Z', '01:00', '05:00'), CAI, SSH);
  assert.strictEqual(ev.sunrises, 1);
  assert.strictEqual(ev.sunsets, 0);
});

test('a sector through dusk counts one sunset and no sunrise', () => {
  // Cairo sunset mid-June is about 17:00 UTC.
  const ev = sunEvents(leg('2026-06-15T00:00:00Z', '15:00', '19:00'), CAI, SSH);
  assert.strictEqual(ev.sunsets, 1);
  assert.strictEqual(ev.sunrises, 0);
});

test('a sector with no block times is skipped rather than guessed at', () => {
  assert.strictEqual(sunEvents(leg('2026-06-15T00:00:00Z', null, '12:00'), CAI, SSH), null);
  assert.strictEqual(sunEvents(leg('2026-06-15T00:00:00Z', '', ''), CAI, SSH), null);
});

test('a sector crossing midnight is measured over its real duration', () => {
  // 22:00 → 04:00 wraps the day and must contain the dawn, not be negative.
  const ev = sunEvents(leg('2026-06-15T00:00:00Z', '22:00', '04:00'), CAI, SSH);
  assert.strictEqual(ev.sunrises, 1, 'the wrapped window still contains dawn');
});
