'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  MATCH_WINDOW_MINUTES, dayOf, minutesOfDay, timesAgree, keysMatch, keyOf, matches, findDuplicates,
} = require('../logbookDuplicates');

const flight = (over = {}) => ({
  date: '2026-03-04', flightNumber: 'SM101', departure: 'CAI', arrival: 'RUH',
  offBlocksTime: '06:10', ...over,
});

// ── Reading the fields ──────────────────────────────────────────────────────

test('a date is a day, whatever shape it arrives in', () => {
  assert.strictEqual(dayOf('2026-03-04'), '2026-03-04');
  assert.strictEqual(dayOf('2026-03-04T00:00:00.000Z'), '2026-03-04');
  assert.strictEqual(dayOf(new Date('2026-03-04T21:30:00.000Z')), '2026-03-04');
  assert.strictEqual(dayOf(''), null);
  assert.strictEqual(dayOf(null), null);
  assert.strictEqual(dayOf('not a date'), null);
});

test('a time is minutes past midnight, however it was written', () => {
  assert.strictEqual(minutesOfDay('06:10'), 370);
  assert.strictEqual(minutesOfDay('0610'), 370);
  assert.strictEqual(minutesOfDay('6:10'), 370);
  assert.strictEqual(minutesOfDay('00:00'), 0);
  assert.strictEqual(minutesOfDay(''), null);
  assert.strictEqual(minutesOfDay(null), null);
  assert.strictEqual(minutesOfDay('25:00'), null);
  assert.strictEqual(minutesOfDay('nope'), null);
});

// ── The 15-minute window ────────────────────────────────────────────────────

test('the window is fifteen minutes, and the edge counts', () => {
  assert.strictEqual(MATCH_WINDOW_MINUTES, 15);
  assert.ok(timesAgree('06:10', '06:25'), 'exactly fifteen minutes still agrees');
  assert.ok(!timesAgree('06:10', '06:26'), 'sixteen does not');
  assert.ok(timesAgree('06:10', '05:55'));
});

test('a time nobody recorded agrees with anything', () => {
  assert.ok(timesAgree(null, '06:10'));
  assert.ok(timesAgree('06:10', null));
  assert.ok(timesAgree(null, null));
  assert.ok(timesAgree('', '06:10'));
});

// A row written either side of midnight should not escape the rule.
test('times are compared around the clock, not along a line', () => {
  assert.ok(timesAgree('23:55', '00:05'), 'ten minutes apart, not a day');
  assert.ok(!timesAgree('23:00', '01:00'));
});

// ── Two shuttles are two flights ────────────────────────────────────────────
// This is the case the old rule got wrong: same route, same day was enough,
// so a pilot who flew CAI–RUH twice lost a sector to the "duplicate" filter.

test('the same route on the same day is one flight only if the times match', () => {
  const morning = flight({ offBlocksTime: '06:10', flightNumber: null });
  const afternoon = flight({ offBlocksTime: '14:40', flightNumber: null });
  assert.strictEqual(matches(morning, { ...morning, offBlocksTime: '06:18' }), 'route');
  assert.strictEqual(matches(morning, afternoon), null, 'two real shuttles must survive');
});

test('the same flight number on the same day follows the same time rule', () => {
  const a = flight({ offBlocksTime: '06:10' });
  assert.strictEqual(matches(a, { ...a, offBlocksTime: '06:20' }), 'flight number');
  assert.strictEqual(matches(a, { ...a, offBlocksTime: '18:00' }), null);
});

test('a flight number matches even when the route was written differently', () => {
  const a = flight();
  assert.strictEqual(matches(a, { ...a, departure: 'CAI', arrival: 'RUH ' }), 'flight number');
  assert.strictEqual(matches(a, { ...a, departure: null, arrival: null }), 'flight number');
});

test('a route needs both ends, not just a shared departure', () => {
  const a = flight({ flightNumber: null });
  assert.strictEqual(matches(a, { ...a, arrival: 'JED' }), null);
  assert.strictEqual(matches(a, { ...a, arrival: null }), null);
});

test('without times on either side, the same route is the same flight', () => {
  const a = flight({ offBlocksTime: null, flightNumber: null });
  assert.strictEqual(matches(a, { ...a }), 'route', 'or re-importing a file with no times doubles it');
  assert.strictEqual(matches(a, flight({ flightNumber: null })), 'route', 'and one side having a time changes nothing');
});

test('a different day is a different flight, and nothing else is compared', () => {
  assert.strictEqual(matches(flight(), flight({ date: '2026-03-05' })), null);
});

test('case and spacing do not make a new flight', () => {
  const a = flight({ flightNumber: 'sm 101', departure: 'cai', arrival: 'ruh' });
  assert.strictEqual(matches(a, flight()), 'flight number');
  assert.strictEqual(keyOf(a).flightNumber, 'SM101');
});

test('a row with no date is never matched', () => {
  assert.strictEqual(keysMatch(keyOf(flight({ date: null })), keyOf(flight())), null);
});

// ── Against the logbook, and against the file itself ───────────────────────

test('a flight already in the logbook is reported, with what to show the pilot', () => {
  const found = findDuplicates([flight()], [flight()]);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].index, 0);
  assert.strictEqual(found[0].where, 'logbook');
  assert.match(found[0].reason, /already in your logbook/);
  assert.strictEqual(found[0].date, '2026-03-04');
  assert.strictEqual(found[0].from, 'CAI');
  assert.strictEqual(found[0].to, 'RUH');
});

// The case the import could not see at all before: a file that repeats itself.
test('a file that lists the same sector twice keeps the first and reports the second', () => {
  const found = findDuplicates([flight(), flight({ offBlocksTime: '06:12' })], []);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].index, 1, 'the first copy is the one that stays');
  assert.strictEqual(found[0].where, 'file');
  assert.match(found[0].reason, /earlier in this file/);
});

test('three copies in a file leave one', () => {
  const found = findDuplicates([flight(), flight(), flight()], []);
  assert.deepStrictEqual(found.map((d) => d.index), [1, 2]);
});

test('two genuine shuttles in one file are both kept', () => {
  const rows = [
    flight({ flightNumber: null, offBlocksTime: '06:10' }),
    flight({ flightNumber: null, offBlocksTime: '14:40' }),
  ];
  assert.deepStrictEqual(findDuplicates(rows, []), []);
});

test('the logbook is checked before the file, so the reason is the useful one', () => {
  const found = findDuplicates([flight(), flight()], [flight()]);
  assert.deepStrictEqual(found.map((d) => d.where), ['logbook', 'logbook']);
});

test('a row without a date is left to the validator, not called a duplicate', () => {
  assert.deepStrictEqual(findDuplicates([flight({ date: null })], [flight()]), []);
});

test('rows are reported in file order, by their own index', () => {
  const rows = [flight({ date: '2026-03-01' }), flight(), flight({ date: '2026-03-02' }), flight()];
  const found = findDuplicates(rows, [flight()]);
  assert.deepStrictEqual(found.map((d) => d.index), [1, 3]);
});

test('an empty file and an empty logbook are quietly fine', () => {
  assert.deepStrictEqual(findDuplicates([], []), []);
  assert.deepStrictEqual(findDuplicates([flight()], []), []);
});

// The logbook's own rows arrive as Prisma objects: a Date and nullable strings.
test('a logbook row from the database is read the same way as a file row', () => {
  const fromDb = {
    date: new Date('2026-03-04T00:00:00.000Z'),
    flightNumber: 'SM101', departure: 'CAI', arrival: 'RUH', offBlocksTime: '06:10',
  };
  assert.strictEqual(findDuplicates([flight()], [fromDb]).length, 1);
});

// ── What the save step does with the answer ─────────────────────────────────
// The preview can be minutes old, and the client decides nothing: these are
// the rules the server applies at the moment of writing.

const { planImport } = require('../logbookDuplicates');

test('duplicates are dropped at the save step, whatever the client sent', () => {
  const valid = [flight(), flight({ flightNumber: 'SM204', departure: 'JED', offBlocksTime: '19:00' }), flight()];
  const duplicates = findDuplicates(valid, [flight()]);
  const plan = planImport({ valid, validIndex: [0, 1, 2], duplicates });
  assert.deepStrictEqual(plan.write.map((r) => r.departure), ['JED']);
  assert.strictEqual(plan.skippedDuplicates, 2);
});

test('"import them anyway" keeps them, and still says how many there were', () => {
  const valid = [flight(), flight()];
  const duplicates = findDuplicates(valid, [flight()]);
  const plan = planImport({ valid, validIndex: [0, 1], duplicates, includeDuplicates: true });
  assert.strictEqual(plan.write.length, 2);
  assert.strictEqual(plan.skippedDuplicates, 0, 'nothing was skipped');
  assert.strictEqual(plan.duplicates.length, 2, 'but the pilot is still told');
});

// The valid rows are a subset of what was submitted, so a duplicate's place
// in the valid list is not the row number the pilot saw.
test('a skipped row is reported by the row number the pilot saw', () => {
  const valid = [flight(), flight()];
  const duplicates = findDuplicates(valid, [flight()]);
  // rows 3 and 7 of the file survived validation
  const plan = planImport({ valid, validIndex: [2, 6], duplicates });
  assert.deepStrictEqual(plan.duplicates.map((d) => d.rowIndex), [3, 7]);
});

test('nothing to skip leaves the import exactly as it was', () => {
  const valid = [flight(), flight({ date: '2026-03-05' })];
  const plan = planImport({ valid, validIndex: [0, 1], duplicates: [] });
  assert.strictEqual(plan.write.length, 2);
  assert.strictEqual(plan.skippedDuplicates, 0);
  assert.deepStrictEqual(plan.duplicates, []);
});

// ── What we ask the database for ───────────────────────────────────────────
// An exact-date query only finds rows stored at midnight. Imported rows are,
// but a flight typed in by hand or lifted off a scan need not be — and a
// check that cannot see them would pass while letting a duplicate through.

const { existingOnDays } = require('../logbookDuplicates');

test('the logbook is read across the span the file covers, not on exact dates', async () => {
  let asked = null;
  const prisma = { flightLog: { findMany: async (args) => { asked = args; return []; } } };
  await existingOnDays(prisma, 'p1', [
    { date: '2026-03-04' }, { date: '2024-11-30T00:00:00.000Z' }, { date: null },
  ]);
  assert.strictEqual(asked.where.pilotId, 'p1');
  assert.strictEqual(asked.where.date.gte.toISOString(), '2024-11-30T00:00:00.000Z');
  assert.strictEqual(asked.where.date.lte.toISOString(), '2026-03-04T23:59:59.999Z');
  assert.ok(asked.select.offBlocksTime, 'the time is part of the rule, so it has to be fetched');
});

test('a file with no usable dates asks the database nothing', async () => {
  let called = false;
  const prisma = { flightLog: { findMany: async () => { called = true; return []; } } };
  assert.deepStrictEqual(await existingOnDays(prisma, 'p1', [{ date: null }]), []);
  assert.strictEqual(called, false);
});

test('a flight stored at a time of day is still matched', async () => {
  const prisma = { flightLog: { findMany: async () => [{
    date: new Date('2026-03-04T21:30:00.000Z'), flightNumber: 'SM101',
    departure: 'CAI', arrival: 'RUH', offBlocksTime: '06:10',
  }] } };
  const { duplicatesAgainstLogbook } = require('../logbookDuplicates');
  const found = await duplicatesAgainstLogbook(prisma, 'p1', [flight()]);
  assert.strictEqual(found.length, 1);
});
