'use strict';

// Unknown night is not zero. 0 asserts "this flight had no night time"; for a
// sector we cannot place on the globe, we do not know that.

const test = require('node:test');
const assert = require('node:assert');
const { buildFlightRow } = require('../logbookEntry');

const PILOT = { id: 'p1', role: 'FIRST_OFFICER', logbookPrefs: {} };
const BASE = {
  date: '2026-10-16', aircraftType: 'A320', registration: 'SU-BVM',
  offBlocksTime: '09:38', takeoffTime: '09:52', landingTime: '14:22', onBlocksTime: '14:33',
};

test('an unresolvable airport leaves night unknown, not zero', async () => {
  const row = await buildFlightRow({ ...BASE, departure: 'XQX', arrival: 'HRG' }, PILOT);
  assert.equal(row.nightTime, null, 'night is unknown, so it is null');
  assert.equal(row.nightSource, null);
});

test('a day flight between known airports is zero, not unknown', async () => {
  const row = await buildFlightRow({ ...BASE, departure: 'CAI', arrival: 'HRG' }, PILOT);
  assert.equal(typeof row.nightTime, 'number', 'a computable sector gets a number');
  assert.equal(row.nightSource, 'calculated');
});

test('ALY is computable now, so a sector to Alexandria gets a real figure', async () => {
  const row = await buildFlightRow({ ...BASE, departure: 'CAI', arrival: 'ALY' }, PILOT);
  assert.equal(typeof row.nightTime, 'number');
  assert.equal(row.nightSource, 'calculated');
});

test("the crew's own night figure always wins, even for an unknown airport", async () => {
  const row = await buildFlightRow(
    { ...BASE, departure: 'XQX', arrival: 'HRG', nightOverrideMinutes: 95 }, PILOT,
  );
  assert.equal(row.nightTime, 1.58);
  assert.equal(row.nightSource, 'form');
});
