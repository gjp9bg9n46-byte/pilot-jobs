'use strict';

// Standalone unit tests for crew-schedule combined-datetime import parsing.
// Run with:  node --test src/services/importService.crewSchedule.test.js
// (No external test framework — uses Node's built-in node:test + assert.)
//
// Regression guard for the 2832.xlsx bug: crew rosters embed the date inside the
// Start/Finish columns (e.g. "12Mar24 0029") and decorate the timestamp with a
// day-of-week prefix, timezone marker, seconds, etc. The original strict two-token
// parser failed on all of those, producing "We couldn't auto-detect a date column".

const { test } = require('node:test');
const assert = require('node:assert');
const {
  parseCombinedDateTime,
  applyDateFallbacks,
  detectMapping,
} = require('./importService');

// ── The exact user format + every variation that previously broke ──────────────
const SUPPORTED = {
  'baseline DDMonYY HHMM':       ['12Mar24 0029', '2024-03-12', '00:29'],
  'finish time':                 ['12Mar24 0306', '2024-03-12', '03:06'],
  'day-of-week prefix':          ['Tue 12Mar24 0029', '2024-03-12', '00:29'],
  'short day-of-week prefix':    ['Tu 12Mar24 0029', '2024-03-12', '00:29'],
  'timezone letter on time':     ['12Mar24 0029Z', '2024-03-12', '00:29'],
  'timezone word suffix':        ['12Mar24 0029 UTC', '2024-03-12', '00:29'],
  'seconds in time':             ['12Mar24 00:29:00', '2024-03-12', '00:29'],
  'ISO datetime with seconds':   ['2024-03-12 00:29:00', '2024-03-12', '00:29'],
  'space-separated date':        ['12 Mar 24 0029', '2024-03-12', '00:29'],
  'space-separated 4-digit year':['12 Mar 2024 0029', '2024-03-12', '00:29'],
  'full month name':             ['12 March 2024 0029', '2024-03-12', '00:29'],
  'HHMMSS no colon':             ['12Mar24 002900', '2024-03-12', '00:29'],
  'colon time':                  ['12Mar24 00:29', '2024-03-12', '00:29'],
  'hyphenated date':             ['12-Mar-24 00:29', '2024-03-12', '00:29'],
  'ISO with T separator':        ['2024-03-12T0029', '2024-03-12', '00:29'],
  'slash date DD/MM/YY':         ['12/03/24 00:29', '2024-03-12', '00:29'],
  'double space':                ['12Mar24  0029', '2024-03-12', '00:29'],
  'uppercase month':             ['12MAR24 0029', '2024-03-12', '00:29'],
  'non-breaking space':          ['12Mar24 0029', '2024-03-12', '00:29'],
  'zero-width inside time':      ['12Mar24 00​29', '2024-03-12', '00:29'],
  'day + tz both':               ['Tue 12Mar24 0029 Z', '2024-03-12', '00:29'],
  '2400 end-of-day → 00:00':     ['12Mar24 2400', '2024-03-12', '00:00'],
};

for (const [label, [input, date, time]] of Object.entries(SUPPORTED)) {
  test(`parseCombinedDateTime: ${label}`, () => {
    assert.deepStrictEqual(parseCombinedDateTime(input), { date, time });
  });
}

// ── Invalid values surface a clear error (time parsed, date didn't) ────────────
test('parseCombinedDateTime: invalid month → error object, no crash', () => {
  const r = parseCombinedDateTime('12Foo24 0029');
  assert.strictEqual(r.date, null);
  assert.strictEqual(r.time, '00:29');
  assert.match(r.error, /date/i);
});

test('parseCombinedDateTime: impossible calendar date (31 Feb) → error object', () => {
  const r = parseCombinedDateTime('31Feb24 0900');
  assert.strictEqual(r.date, null);
  assert.ok(r.error);
});

// ── Non-datetimes return null (so detection doesn't false-positive) ────────────
for (const v of ['OMDB', 'A320', '12Mar24', '', null, undefined, 'hello world', '12Mar24 2401']) {
  test(`parseCombinedDateTime: non-datetime ${JSON.stringify(v)} → null`, () => {
    assert.strictEqual(parseCombinedDateTime(v), null);
  });
}

// ── applyDateFallbacks end-to-end: crew Start/Finish → synthesized Date/Off/On ──
test('applyDateFallbacks: crew Start/Finish file (the 2832.xlsx shape) auto-detects', () => {
  const headers = ['Code', 'Start', 'Finish', 'Dest'];
  const rawRows = [
    ['MM', '12Mar24 0029', '12Mar24 0306', 'CAI'],
    ['MM', '13Mar24 0815', '13Mar24 0930', 'CAI'],
    ['CAI', '14Mar24 0600', '14Mar24 0730', 'MM'],
  ];
  const mapping = detectMapping(headers);
  assert.strictEqual(mapping.date, undefined, 'no date column from headers alone');

  const out = applyDateFallbacks(headers, rawRows, mapping);
  assert.strictEqual(out.applied, true);
  assert.ok(out.mapping.date, 'a date column is now mapped');
  assert.ok(out.mapping.offBlocksTime, 'off-block mapped');
  assert.ok(out.mapping.onBlocksTime, 'on-block mapped');

  const di = out.headers.indexOf(out.mapping.date);
  const oi = out.headers.indexOf(out.mapping.offBlocksTime);
  const ni = out.headers.indexOf(out.mapping.onBlocksTime);
  assert.deepStrictEqual(
    [out.rawRows[0][di], out.rawRows[0][oi], out.rawRows[0][ni]],
    ['2024-03-12', '00:29', '03:06'],
  );
  // each row keeps its own date
  assert.strictEqual(out.rawRows[1][di], '2024-03-13');
  assert.strictEqual(out.rawRows[2][di], '2024-03-14');
});

test('applyDateFallbacks: crew file with day-of-week + Z markers still auto-detects', () => {
  const headers = ['Activity', 'Start', 'Finish'];
  const rawRows = [
    ['DXB', 'Tue 12Mar24 0029Z', 'Tue 12Mar24 0306Z'],
    ['DXB', 'Wed 13Mar24 0815Z', 'Wed 13Mar24 0930Z'],
  ];
  const mapping = detectMapping(headers);
  const out = applyDateFallbacks(headers, rawRows, mapping);
  assert.strictEqual(out.applied, true);
  const di = out.headers.indexOf(out.mapping.date);
  assert.strictEqual(out.rawRows[0][di], '2024-03-12');
});

// ── Regression: standard logbook headers still detect WITHOUT synthesis ─────────
test('regression: standard Date/Off/On file detects via headers, no synthesis', () => {
  const headers = ['Date', 'Off Blocks', 'On Blocks', 'From', 'To'];
  const mapping = detectMapping(headers);
  assert.strictEqual(mapping.date, 'Date');
  // applyDateFallbacks should be a no-op when a date is already mapped
  const out = applyDateFallbacks(headers, [['2026-05-01', '08:00', '10:00', 'OMDB', 'OTHH']], mapping);
  assert.strictEqual(out.applied, false);
  assert.strictEqual(out.headers.length, headers.length, 'no synthetic columns added');
});
