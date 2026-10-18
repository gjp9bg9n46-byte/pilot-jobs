'use strict';

// The fact file's two promises: a requirement is ticked against the pilot with
// the same context the Jobs page uses, and nothing is shown that nobody
// recorded. Pure functions only — no database, no network.

const test = require('node:test');
const assert = require('node:assert');

const { requirementChecks } = require('../airlineFactfile');
const {
  parseStages, readPay, fleetRows, aircraftTotal, missingFacts, shortFleet, upgradeLabel,
} = require('../../../../frontend/src/lib/airlineFacts.js');

const CTX = () => ({
  certTypes: new Set(['ATPL', 'ELP']),
  certAuthorities: new Set(['EASA']),
  ratingTypes: new Set(['A320']),
  elpLevel: 5, elpValid: true, elpExpiry: '2027-09-30',
  totals: { totalTime: 1534, picTime: 0 },
  matchable: true,
});
const DERIVED = {
  vacancyCount: 9, minTotalHours: 1500, minPicHours: 500, englishLevel: 4,
  certificates: ['ATPL'], aircraftTypes: ['A320'], authorities: ['EASA'],
};

test('a requirement the pilot meets is ticked, with their own value beside it', () => {
  const rows = requirementChecks(DERIVED, CTX());
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal(byLabel['ATPL licence'].status, 'met');
  assert.equal(byLabel['A320 type rating'].status, 'met');
  assert.equal(byLabel['1,500 h total'].status, 'met');
  assert.match(byLabel['1,500 h total'].you, /1,534 h/);
  assert.equal(byLabel['EASA licence authority'].status, 'met');
});

test('a requirement the pilot does not meet is marked, not hidden', () => {
  const rows = requirementChecks(DERIVED, CTX());
  const pic = rows.find((r) => r.label.includes('PIC'));
  assert.equal(pic.status, 'not-met');
  assert.equal(pic.you, 'you: 0 h');
});

test('an expiring English level asks for a look rather than passing', () => {
  const ctx = { ...CTX(), elpExpiry: new Date(Date.now() + 20 * 86400000).toISOString() };
  const rows = requirementChecks(DERIVED, ctx);
  assert.equal(rows.find((r) => r.label.startsWith('ICAO English')).status, 'unknown');
});

test('with nothing on the profile every line is unknown, never a red cross', () => {
  const rows = requirementChecks(DERIVED, null);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.status === 'unknown'), 'an empty profile fails nothing');
});

test('no current vacancies means no requirement list at all', () => {
  assert.deepEqual(requirementChecks(null, CTX()), []);
});

test('the hiring process splits into numbered stages, bullets grouped under them', () => {
  const stages = parseStages([
    'Stage 1 — Online Application', '* Submit through Careers.', '* Upload CV.',
    'Stage 2 — Video Interview', 'Stage 3 — Simulator Assessment',
  ]);
  assert.equal(stages.length, 3);
  assert.equal(stages[0].title, 'Online Application');
  assert.deepEqual(stages[0].points, ['Submit through Careers.', 'Upload CV.']);
  assert.equal(stages[2].title, 'Simulator Assessment');
});

test('a whole process stored as one arrow-separated line still numbers correctly', () => {
  const stages = parseStages(['Online application → COMPASS test → HireVue interview → simulator → medical']);
  assert.equal(stages.length, 5);
  assert.equal(stages[1].title, 'COMPASS test');
});

test('pay is reported in the currency and period it was recorded in', () => {
  const rows = readPay({ captain: { min: 100000, max: 235000, period: 'Annual', currency: 'EURO' } });
  assert.equal(rows[0].value, '100,000 – 235,000');
  assert.equal(rows[0].currency, 'EUR');
  assert.equal(rows[0].period, 'annual');
  assert.deepEqual(readPay(null), [], 'no pay recorded shows no pay box');
});

test('the fleet falls back to the plain list when nobody recorded the numbers', () => {
  const detailed = fleetRows({ fleetDetail: [{ type: 'A320', inService: 48, ordered: 20 }] });
  assert.deepEqual(detailed, [{ type: 'A320', inService: 48, ordered: 20 }]);
  const plain = fleetRows({ fleet: ['A320', 'B777'] });
  assert.deepEqual(plain.map((f) => f.type), ['A320', 'B777']);
  assert.equal(plain[0].inService, null);
  assert.equal(aircraftTotal({ fleetDetail: [{ inService: 48 }, { inService: 22 }] }), 70);
  assert.equal(aircraftTotal({ fleet: ['A320'] }), null, 'never show 0 as a count');
});

test('what nobody recorded is listed once, by name', () => {
  const gaps = missingFacts({ fleet: ['A320'], bases: [], interviewStages: [] });
  assert.ok(gaps.includes('pay'));
  assert.ok(gaps.includes('bases'));
  assert.ok(gaps.includes('hiring process'));
  assert.ok(!gaps.includes('fleet'), 'the fleet is recorded, so it is not a gap');
});

test('fleet names read as a pilot says them', () => {
  assert.equal(shortFleet(['Airbus A380-800', 'Boeing 777-300ER', 'Airbus A350-900']), 'A380, B777, A350');
  assert.equal(shortFleet(['Airbus A320-200', 'Airbus A320neo']), 'A320', 'variants of one type collapse');
  assert.equal(shortFleet(['Embraer 190', 'Embraer 195']), 'Embraer 190, Embraer 195');
  assert.equal(shortFleet([]), '');
});

test('upgrade time reads as a range, or says which end is known', () => {
  assert.equal(upgradeLabel(4, 6), '4 – 6 years');
  assert.equal(upgradeLabel(null, null), null);
  assert.match(upgradeLabel(5, null), /5 years/);
});
