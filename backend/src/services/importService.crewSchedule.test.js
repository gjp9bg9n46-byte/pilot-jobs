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
  parseCSV,
  stripLeadingMetadata,
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

// ── Title/metadata row stripping (the 2832.xlsx "Period: …" title bug) ─────────
// End-to-end through parseCSV: the leading title band must be dropped so the real
// header row leads, otherwise every crew row imports as 0-valid.

function pipeline(csv) {
  const { headers, rawRows } = parseCSV(Buffer.from(csv, 'utf-8'));
  const mapping = detectMapping(headers);
  const out = mapping.date
    ? { headers, rawRows, mapping, applied: false }
    : applyDateFallbacks(headers, rawRows, mapping);
  return { headers, rawRows: out.rawRows, mapping: out.mapping };
}

test('metadata strip: user 2832 shape — "Period:" title above the real header row', () => {
  const csv = [
    'Period: 01Feb24 - 30May26',
    'CrewCode,Start,Finish,Dest',
    'MM,12Mar24 0029,12Mar24 0306,CAI',
    'MM,13Mar24 0815,13Mar24 0930,CAI',
    'CAI,14Mar24 0600,14Mar24 0730,MM',
  ].join('\n');
  const { headers, rawRows, mapping } = pipeline(csv);
  assert.deepStrictEqual(headers, ['CrewCode', 'Start', 'Finish', 'Dest'], 'real headers detected');
  assert.ok(mapping.date && mapping.offBlocksTime && mapping.onBlocksTime, 'Start/Finish synthesized');
  assert.strictEqual(rawRows.length, 3, 'only the 3 flight rows are data (title + header not counted)');
  const di = headers.length + ['Date (auto)', 'Off (auto)', 'On (auto)'].indexOf(mapping.date);
  assert.strictEqual(rawRows[0][di], '2024-03-12', 'first flight row date parsed from Start');
});

test('metadata strip: merged single-cell title (length-1 row above wide data)', () => {
  const csv = [
    'CockpitHire Crew Schedule',           // lone value, merged-cell style
    'CrewCode,Start,Finish,Dest',
    'MM,12Mar24 0029,12Mar24 0306,CAI',
    'MM,13Mar24 0815,13Mar24 0930,CAI',
  ].join('\n');
  const { headers, rawRows } = pipeline(csv);
  assert.deepStrictEqual(headers, ['CrewCode', 'Start', 'Finish', 'Dest']);
  assert.strictEqual(rawRows.length, 2);
});

test('metadata strip: 2+ stacked metadata rows (title + blank + Period)', () => {
  const csv = [
    'Roster Report',
    '',
    'Period: 01Feb24 - 30May26',
    'CrewCode,Start,Finish,Dest',
    'MM,12Mar24 0029,12Mar24 0306,CAI',
    'MM,13Mar24 0815,13Mar24 0930,CAI',
  ].join('\n');
  const { headers, rawRows, mapping } = pipeline(csv);
  assert.deepStrictEqual(headers, ['CrewCode', 'Start', 'Finish', 'Dest']);
  assert.ok(mapping.date, 'date synthesized after skipping 3 metadata rows');
  assert.strictEqual(rawRows.length, 2);
});

test('metadata strip regression: standard file with real headers on row 1 is untouched', () => {
  const csv = [
    'Date,Off Blocks,On Blocks,From,To',
    '2026-05-01,08:00,10:00,OMDB,OTHH',
    '2026-05-02,09:00,11:30,OTHH,OMDB',
  ].join('\n');
  const { headers, rawRows, mapping } = pipeline(csv);
  assert.deepStrictEqual(headers, ['Date', 'Off Blocks', 'On Blocks', 'From', 'To']);
  assert.strictEqual(mapping.date, 'Date');
  assert.strictEqual(rawRows.length, 2);
});

test('stripLeadingMetadata: narrow legit file (no false positives)', () => {
  // A genuine 2-column file — the lone-value rule needs bulk width >= 3, so a
  // 2-col header is never mistaken for a merged title.
  const recs = [['Date', 'Block'], ['2026-05-01', '1.5'], ['2026-05-02', '2.0']];
  assert.deepStrictEqual(stripLeadingMetadata(recs), recs);
});
