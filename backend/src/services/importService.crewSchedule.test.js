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
  enrichColumns,
  splitRoute,
  parseTimeToHours,
  coerceRow,
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

// Full parse → header-based mapping → all enrichments (the real importParse path).
function pipeline(csv) {
  const { headers, rawRows } = parseCSV(Buffer.from(csv, 'utf-8'));
  const mapping = detectMapping(headers);
  const out = enrichColumns(headers, rawRows, mapping);
  return { srcHeaders: headers, headers: out.headers, rawRows: out.rawRows, mapping: out.mapping };
}
// Resolve a mapped field to its value in row `i`.
const cell = (out, field, i = 0) => out.rawRows[i][out.headers.indexOf(out.mapping[field])];

test('metadata strip: user 2832 shape — "Period:" title above the real header row', () => {
  const csv = [
    'Period: 01Feb24 - 30May26',
    'CrewCode,Start,Finish,Dest',
    'MM,12Mar24 0029,12Mar24 0306,CAI',
    'MM,13Mar24 0815,13Mar24 0930,CAI',
    'CAI,14Mar24 0600,14Mar24 0730,MM',
  ].join('\n');
  const out = pipeline(csv);
  assert.deepStrictEqual(out.srcHeaders, ['CrewCode', 'Start', 'Finish', 'Dest'], 'real headers detected');
  assert.ok(out.mapping.date && out.mapping.offBlocksTime && out.mapping.onBlocksTime, 'Start/Finish synthesized');
  assert.strictEqual(out.rawRows.length, 3, 'only the 3 flight rows are data (title + header not counted)');
  assert.strictEqual(cell(out, 'date'), '2024-03-12', 'first flight row date parsed from Start');
});

test('metadata strip: merged single-cell title (length-1 row above wide data)', () => {
  const csv = [
    'CockpitHire Crew Schedule',           // lone value, merged-cell style
    'CrewCode,Start,Finish,Dest',
    'MM,12Mar24 0029,12Mar24 0306,CAI',
    'MM,13Mar24 0815,13Mar24 0930,CAI',
  ].join('\n');
  const out = pipeline(csv);
  assert.deepStrictEqual(out.srcHeaders, ['CrewCode', 'Start', 'Finish', 'Dest']);
  assert.strictEqual(out.rawRows.length, 2);
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
  const out = pipeline(csv);
  assert.deepStrictEqual(out.srcHeaders, ['CrewCode', 'Start', 'Finish', 'Dest']);
  assert.ok(out.mapping.date, 'date synthesized after skipping 3 metadata rows');
  assert.strictEqual(out.rawRows.length, 2);
});

test('metadata strip regression: standard file with real headers on row 1 is untouched', () => {
  const csv = [
    'Date,Off Blocks,On Blocks,From,To',
    '2026-05-01,08:00,10:00,OMDB,OTHH',
    '2026-05-02,09:00,11:30,OTHH,OMDB',
  ].join('\n');
  const out = pipeline(csv);
  assert.deepStrictEqual(out.srcHeaders, ['Date', 'Off Blocks', 'On Blocks', 'From', 'To']);
  assert.strictEqual(out.mapping.date, 'Date');
  assert.strictEqual(out.rawRows.length, 2);
});

test('stripLeadingMetadata: narrow legit file (no false positives)', () => {
  // A genuine 2-column file — the lone-value rule needs bulk width >= 3, so a
  // 2-col header is never mistaken for a merged title.
  const recs = [['Date', 'Block'], ['2026-05-01', '1.5'], ['2026-05-02', '2.0']];
  assert.deepStrictEqual(stripLeadingMetadata(recs), recs);
});

// ── Column synonyms (AC, FltId, Aug BLHR, Night Hrs, Augmentation) ─────────────
test('detectMapping: crew synonyms map AC/FltId/Aug BLHR/Night Hrs/Augmentation', () => {
  const headers = ['CrewCode', 'AC', 'FltId', 'Aug BLHR', 'Night Hrs', 'Augmentation'];
  const m = detectMapping(headers);
  assert.strictEqual(m.registration, 'AC');
  assert.strictEqual(m.flightNumber, 'FltId');
  assert.strictEqual(m.totalTime, 'Aug BLHR');
  assert.strictEqual(m.nightTime, 'Night Hrs');
  assert.strictEqual(m.remarks, 'Augmentation');
});

// ── Route splitting ────────────────────────────────────────────────────────────
for (const [route, dep, arr] of [
  ['CAI-DMM', 'CAI', 'DMM'],
  ['CAI→DMM', 'CAI', 'DMM'],
  ['CAI/DMM', 'CAI', 'DMM'],
  ['CAI - DMM', 'CAI', 'DMM'],
  ['CAI DMM', 'CAI', 'DMM'],
  ['LHR-JFK', 'LHR', 'JFK'],
  ['OMDB-OERK', 'OMDB', 'OERK'],
]) {
  test(`splitRoute: ${route}`, () => assert.deepStrictEqual(splitRoute(route), { dep, arr }));
}
test('splitRoute: non-route value → null', () => assert.strictEqual(splitRoute('CAI'), null));

test('applyRouteSplit: synthesizes Departure/Arrival from a Route column', () => {
  const headers = ['CrewCode', 'Route', 'Date'];
  const rawRows = [['MM', 'CAI-DMM', '2024-03-12'], ['MM', 'DMM-CAI', '2024-03-13']];
  const mapping = detectMapping(headers);
  const out = enrichColumns(headers, rawRows, mapping);
  assert.ok(out.mapping.departure && out.mapping.arrival);
  assert.ok(out.mapping.departure.includes('auto from Route'));
  const di = out.headers.indexOf(out.mapping.departure);
  const ai = out.headers.indexOf(out.mapping.arrival);
  assert.deepStrictEqual([out.rawRows[0][di], out.rawRows[0][ai]], ['CAI', 'DMM']);
  assert.deepStrictEqual([out.rawRows[1][di], out.rawRows[1][ai]], ['DMM', 'CAI']);
});

// ── HH:MM → decimal hours ──────────────────────────────────────────────────────
test('parseTimeToHours: "2:37" → 2.6166…', () => {
  assert.ok(Math.abs(parseTimeToHours('2:37') - (2 + 37 / 60)) < 1e-9);
});
test('parseTimeToHours: "0:45" → 0.75, "1:00" → 1, decimal "2.5" → 2.5, HH:MM:SS', () => {
  assert.strictEqual(parseTimeToHours('0:45'), 0.75);
  assert.strictEqual(parseTimeToHours('1:00'), 1);
  assert.strictEqual(parseTimeToHours('2.5'), 2.5);
  assert.ok(Math.abs(parseTimeToHours('2:37:30') - (2 + 37 / 60 + 30 / 3600)) < 1e-9);
});
test('coerceRow: night "0:45" → 0.75 decimal hours', () => {
  const { coerced } = coerceRow({ date: '2024-03-12', nightTime: '0:45' });
  assert.strictEqual(coerced.nightTime, 0.75);
});

// ── AC content-based disambiguation ────────────────────────────────────────────
test('AC column with tail codes stays Registration; with type codes → Aircraft Type', () => {
  const tail = enrichColumns(['CrewCode', 'AC'], [['MM', 'BUP'], ['MM', 'BPX']], detectMapping(['CrewCode', 'AC']));
  assert.strictEqual(tail.mapping.registration, 'AC');
  assert.strictEqual(tail.mapping.aircraftType, undefined);

  const types = enrichColumns(['CrewCode', 'AC'], [['MM', 'A320'], ['MM', 'B737']], detectMapping(['CrewCode', 'AC']));
  assert.strictEqual(types.mapping.aircraftType, 'AC');
  assert.strictEqual(types.mapping.registration, undefined);
});

// ── Full 12-column user-file pipeline end-to-end ───────────────────────────────
test('full 2832 12-column shape: all real headers + auto-mappings + coerced values', () => {
  const csv = [
    '', '', 'Period: 01Feb24 - 30May26', '',
    'CrewCode,Namefirst,Namelast,AC,FltId,Route,Start,Finish,Augmentation,Aug BLHR,Day Hrs,Night Hrs',
    'MM,John,Smith,BUP,MS501,CAI-DMM,12Mar24 0029,12Mar24 0306,N,2:37,1:52,0:45',
  ].join('\n');
  const out = pipeline(csv);
  // all 12 source headers preserved (synthetic columns appended after)
  assert.strictEqual(out.srcHeaders.length, 12);
  assert.deepStrictEqual(out.srcHeaders.slice(0, 6), ['CrewCode', 'Namefirst', 'Namelast', 'AC', 'FltId', 'Route']);
  // the expected auto-mappings all present
  for (const f of ['date', 'offBlocksTime', 'onBlocksTime', 'registration', 'flightNumber', 'departure', 'arrival', 'totalTime', 'nightTime']) {
    assert.ok(out.mapping[f], `mapping.${f} present`);
  }
  // coerce row 0 → real values, no errors
  const fields = {};
  for (const [f, h] of Object.entries(out.mapping)) fields[f] = out.rawRows[0][out.headers.indexOf(h)];
  const { coerced, errors } = coerceRow(fields);
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(coerced.registration, 'BUP');     // stored as-is (no SU- prefix)
  assert.strictEqual(coerced.flightNumber, 'MS501');
  assert.strictEqual(coerced.departure, 'CAI');
  assert.strictEqual(coerced.arrival, 'DMM');
  assert.strictEqual(coerced.offBlocksTime, '00:29');
  assert.strictEqual(coerced.onBlocksTime, '03:06');
  assert.strictEqual(coerced.nightTime, 0.75);
  assert.ok(Math.abs(coerced.totalTime - 2.6167) < 0.01); // 00:29→03:06
});
