'use strict';

// What a manually typed flight needs, and what it must not invent.
//
// A pilot copying an old paper page often has the block time written down and
// nothing else. Demanding OUT/OFF/ON/IN would mean inventing three of them, so
// a typed block time is accepted on its own — and everything it cannot answer
// stays null rather than becoming zero.

const test = require('node:test');
const assert = require('node:assert');

const { buildFlightRow } = require('../logbookEntry');
const {
  parseBlockHours, missingForSave, missingSentence,
} = require('../../../../frontend/src/lib/logbookFormat.js');

const FO = { id: 'p1', role: 'FIRST_OFFICER', staffNumber: '3074', logbookPrefs: {} };

test('a block time is read however the pilot writes it', () => {
  assert.equal(parseBlockHours('1:30'), 1.5);
  assert.equal(parseBlockHours('01:30'), 1.5);
  assert.equal(parseBlockHours('1.5'), 1.5);
  assert.equal(parseBlockHours('1,5'), 1.5, 'a comma is a decimal point in most of Europe');
  assert.equal(parseBlockHours('12:00'), 12);
});

test('and refused when it is not a duration', () => {
  for (const v of ['', '   ', null, undefined, 'abc', '1:70', '0', '-2']) {
    assert.equal(parseBlockHours(v), null, JSON.stringify(v));
  }
});

test('Save needs out and in, OR a block time', () => {
  const base = { date: '2026-10-04', aircraftType: 'A320' };
  assert.deepEqual(missingForSave({ ...base, out: '07:00', in: '09:30' }), [], 'both times');
  assert.deepEqual(missingForSave({ ...base, blockTyped: '2:30' }), [], 'block alone');
  assert.deepEqual(missingForSave({ ...base, out: '07:00', in: '09:30', blockTyped: 'junk' }), [], 'the times win');
});

test('and says which half is missing, not just "invalid"', () => {
  const base = { date: '2026-10-04', aircraftType: 'A320' };
  assert.deepEqual(missingForSave({ ...base, out: '07:00' }), ['an in time (or a block time)']);
  assert.deepEqual(missingForSave({ ...base, in: '09:30' }), ['an out time (or a block time)']);
  assert.deepEqual(missingForSave(base), ['out and in times, or a block time']);
  assert.deepEqual(missingForSave({}), ['a date', 'an aircraft type', 'out and in times, or a block time']);
});

test('the disabled Save names one thing at a time', () => {
  assert.equal(missingSentence(['a date']), 'Add a date');
  assert.equal(
    missingSentence(['a date', 'an aircraft type', 'out and in times, or a block time']),
    'Add a date',
    'four blanks in one sentence is a wall; the next one is all the pilot can act on',
  );
  assert.equal(missingSentence(['a date'], 2), 'Leg 2: add a date');
  assert.equal(missingSentence([]), '', 'nothing missing, nothing said');
});

test('a block-only flight keeps its hours and invents nothing else', async () => {
  const row = await buildFlightRow({
    date: '2026-10-04', aircraftType: 'A320', totalTime: 2.5,
  }, FO);
  assert.equal(row.totalTime, 2.5, 'the typed block stands');
  assert.equal(row.offBlocksTime, null);
  assert.equal(row.takeoffTime, null);
  assert.equal(row.landingTime, null);
  assert.equal(row.onBlocksTime, null);
  assert.equal(row.nightTime, null, 'unknown, not zero');
  assert.equal(row.nightSource, null);
});

test('out and in still derive the block, and empty strings are not times', async () => {
  const row = await buildFlightRow({
    date: '2026-10-04', aircraftType: 'A320', offBlocksTime: '07:00', onBlocksTime: '09:30',
    takeoffTime: '', landingTime: '',
  }, FO);
  assert.equal(row.totalTime, 2.5);
  assert.equal(row.takeoffTime, null, '"" is not a takeoff time');
  assert.equal(row.nightTime, null, 'no OFF/ON and no route — nothing to work from');
});

test('a night time the pilot typed is kept — it used to be thrown away', async () => {
  const row = await buildFlightRow({
    date: '2026-10-04', aircraftType: 'A320', totalTime: 2.5, nightTime: 1.25,
  }, FO);
  assert.equal(row.nightTime, 1.25);
  assert.equal(row.nightSource, 'form');
});

test('a figure we worked out ourselves is still ours, and still recalculated', async () => {
  const row = await buildFlightRow({
    date: '2026-10-04', aircraftType: 'A320', totalTime: 2.5,
    nightTime: 99, nightSource: 'calculated',
  }, FO);
  assert.notEqual(row.nightTime, 99, 'not taken as the pilot\'s own');
});
