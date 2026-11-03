'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  hhmm, count, toRow, carryForwardSums, addSums, addRow, zeroSums, fmtSums, ROWS_PER_PAGE,
} = require('../logbookPrint');

// ── h:mm, and the blank that is not a zero ──────────────────────────────────
// An EASA column left empty means "not applicable or not recorded". A nought
// means "none, and we checked". Printing 0:00 for a column the import never
// carried would be a claim about the pilot's flying that we cannot make.

test('hhmm writes hours the way the form expects', () => {
  assert.strictEqual(hhmm(3.5), '3:30');
  assert.strictEqual(hhmm(1592.4), '1592:24');
  assert.strictEqual(hhmm(0.25), '0:15');
  assert.strictEqual(hhmm(10), '10:00');
});

test('hhmm leaves nothing behind for nothing', () => {
  for (const v of [0, null, undefined, '', NaN, -1]) {
    assert.strictEqual(hhmm(v), '', `${String(v)} should print blank, never 0:00`);
  }
});

// A derived column — day hours are total minus night — can land on twelve
// seconds of dust. "0:00" in a logbook reads as "no day flying at all".
test('a value that rounds to nothing prints nothing', () => {
  assert.strictEqual(hhmm(0.0033333333333329662), '');
  assert.strictEqual(hhmm(1e-15), '');
  assert.strictEqual(hhmm(0.008), '', 'under half a minute rounds away');
  assert.strictEqual(hhmm(0.0084), '0:01', 'over half a minute is a minute');
});

test('count prints a number only when there is one', () => {
  assert.strictEqual(count(3), '3');
  assert.strictEqual(count(0), '');
  assert.strictEqual(count(null), '');
});

// ── A row ───────────────────────────────────────────────────────────────────

const log = (over = {}) => ({
  date: new Date('2026-03-04T00:00:00Z'),
  departure: 'CAI', arrival: 'MXP', offBlocksTime: '06:10', onBlocksTime: '09:45',
  totalTime: 3.5, picTime: 0, sicTime: 3.5, nightTime: 0, instrumentTime: 0,
  landingsDay: 0, landingsNight: 0, aircraftType: 'A320', registration: 'SU-BPX',
  picName: 'A. Captain', remarks: '', ...over,
});

test('a row carries every Part-FCL column', () => {
  const r = toRow(log());
  assert.strictEqual(r.date, '2026-03-04');
  assert.strictEqual(r.depPlace, 'CAI'); assert.strictEqual(r.depTime, '06:10');
  assert.strictEqual(r.arrPlace, 'MXP'); assert.strictEqual(r.arrTime, '09:45');
  assert.strictEqual(r.type, 'A320'); assert.strictEqual(r.registration, 'SU-BPX');
  assert.strictEqual(r.f.total, '3:30');
  assert.strictEqual(r.f.coPilot, '3:30');
});

// This is a personal document. The no-crew-names rule covers reports and share
// cards, which get posted; a logbook page is signed by its holder.
test('the PIC name column is filled, because this is the pilot\'s own document', () => {
  assert.strictEqual(toRow(log()).picName, 'A. Captain');
  assert.strictEqual(toRow(log({ picName: null })).picName, '', 'and blank when there is none');
});

test('columns the source never recorded print blank, not zero', () => {
  const r = toRow(log({ nightTime: 0, instrumentTime: 0, landingsDay: 0, landingsNight: 0, picTime: 0 }));
  assert.strictEqual(r.f.night, '');
  assert.strictEqual(r.f.ifr, '');
  assert.strictEqual(r.f.landingsDay, '');
  assert.strictEqual(r.f.landingsNight, '');
  assert.strictEqual(r.f.pic, '');
  assert.strictEqual(r.f.total, '3:30', 'but the total is always printed');
});

test('there is no training column yet, so it is blank rather than guessed', () => {
  assert.strictEqual(toRow(log()).f.dual, '');
});

// ── Carry-forward is the brought-forward line ───────────────────────────────

test('carry-forward maps onto the totals columns', () => {
  const cf = carryForwardSums({ totalTime: 3000, picTime: 2500, sicTime: 500, nightTime: 400, instrumentTime: 200, landingsDay: 900, landingsNight: 300 });
  assert.strictEqual(cf.total, 3000);
  assert.strictEqual(cf.pic, 2500);
  assert.strictEqual(cf.coPilot, 500);
  assert.strictEqual(cf.night, 400);
  assert.strictEqual(cf.ifr, 200);
  assert.strictEqual(cf.landingsDay, 900);
  // Carry-forward does not say how much was multi-pilot or dual, so it claims
  // neither.
  assert.strictEqual(cf.multiPilot, 0);
  assert.strictEqual(cf.dual, 0);
});

test('no carry-forward leaves the brought-forward line blank, not 0:00', () => {
  const f = fmtSums(carryForwardSums({}));
  assert.strictEqual(f.total, '');
  assert.strictEqual(f.pic, '');
  assert.strictEqual(f.landingsDay, '');
});

test('a page total is the sum of its rows, and to-date adds what came before', () => {
  const rows = [toRow(log()), toRow(log({ totalTime: 2, sicTime: 2 }))];
  const thisPage = rows.reduce(addRow, zeroSums());
  assert.strictEqual(thisPage.total, 5.5);
  const previous = carryForwardSums({ totalTime: 3000, picTime: 2500 });
  const toDate = addSums(previous, thisPage);
  assert.strictEqual(toDate.total, 3005.5, 'brought forward plus this page');
  assert.strictEqual(toDate.pic, 2500);
});

test('the page length is fixed, so page breaks are reproducible', () => {
  assert.strictEqual(ROWS_PER_PAGE, 32);
});

// ── A range export still tells the truth about the running total ────────────
// "Total to date" means the total to that date. A pilot printing October
// alone must not see 37 hours where they have 1,592: the flights before the
// range are summed into page one's brought-forward line alongside the
// carry-forward, and never printed as rows.
test('brought forward = carry-forward plus everything before the range', () => {
  const earlier = [toRow(log({ totalTime: 100, sicTime: 100 })), toRow(log({ totalTime: 50, sicTime: 50 }))];
  const prior = earlier.reduce(addRow, zeroSums());
  const cf = carryForwardSums({ totalTime: 3000, picTime: 2500 });
  const broughtForward = addSums(cf, prior);

  assert.strictEqual(broughtForward.total, 3150, '3,000 carried + 150 flown before the range');
  assert.strictEqual(broughtForward.coPilot, 150);
  assert.strictEqual(broughtForward.pic, 2500);

  // and the printed range adds on top of it
  const inRange = [toRow(log({ totalTime: 10, sicTime: 10 }))];
  const thisPage = inRange.reduce(addRow, zeroSums());
  assert.strictEqual(addSums(broughtForward, thisPage).total, 3160);
});

// ── Layouts ─────────────────────────────────────────────────────────────────

const { cellsFor, totalsCells, gapsFor } = require('../logbookPrint');
const fmts = require('../logbookFormats');
const cell = (id, r, key) => {
  const fmt = fmts.getFormat(id);
  return cellsFor(fmt, r)[fmt.columns.findIndex((c) => c.key === key)];
};

test('a row is drawn against whichever layout was asked for', () => {
  for (const id of fmts.FORMAT_IDS) {
    const fmt = fmts.getFormat(id);
    const cells = cellsFor(fmt, toRow(log()));
    assert.strictEqual(cells.length, fmt.columns.length, `${id} row is the wrong length`);
    assert.ok(cells.every((c) => typeof c === 'string'), `${id} must hand the renderer strings`);
  }
});

test('the same flight reads the same total in every layout', () => {
  for (const id of fmts.FORMAT_IDS) {
    assert.strictEqual(cell(id, toRow(log()), 'total'), '3:30', id);
  }
});

// ── IFR hours are not instrument hours ──────────────────────────────────────
// Under FAA rules "actual instrument" is time in cloud. We hold one IFR
// figure, so putting it in that column would be a claim about the pilot's
// flying we cannot make.
test('IFR time never becomes actual or simulated instrument', () => {
  const r = toRow(log({ instrumentTime: 3.5 }));
  assert.strictEqual(cell('easa', r, 'ifr'), '3:30');
  assert.strictEqual(cell('faa', r, 'insActual'), '');
  assert.strictEqual(cell('faa', r, 'insSim'), '');
});

test('a recorded instrument split is printed', () => {
  const r = toRow(log({ instrumentActualTime: 1.25, instrumentSimTime: 0.5 }));
  assert.strictEqual(cell('faa', r, 'insActual'), '1:15');
  assert.strictEqual(cell('faa', r, 'insSim'), '0:30');
});

// ── Category, class and the crew split come from the aircraft table ─────────

test('category and class follow the type, and stay blank for a type we do not know', () => {
  assert.strictEqual(cell('faa', toRow(log()), 'catClass'), 'AMEL');
  assert.strictEqual(cell('faa', toRow(log({ aircraftType: 'C172' })), 'catClass'), 'ASEL');
  assert.strictEqual(cell('faa', toRow(log({ aircraftType: 'ZZZZ', registration: 'G-ABCD' })), 'catClass'), '');
});

test('only a multi-engine turbine logs multi-pilot time', () => {
  assert.strictEqual(cell('easa', toRow(log()), 'multiPilot'), '3:30', 'an A320 sector is multi-pilot');
  // A Cessna is not, however the hours were logged — it is single-pilot time.
  const c172 = toRow(log({ aircraftType: 'C172', picTime: 3.5, sicTime: 0 }));
  assert.strictEqual(cell('easa', c172, 'multiPilot'), '');
  assert.strictEqual(cell('icao', c172, 'spSE'), '3:30');
  assert.strictEqual(cell('icao', c172, 'spME'), '');
  const da42 = toRow(log({ aircraftType: 'DA42', picTime: 3.5, sicTime: 0 }));
  assert.strictEqual(cell('icao', da42, 'spME'), '3:30');
  assert.strictEqual(cell('icao', da42, 'spSE'), '');
  // An unknown type claims neither.
  const unknown = toRow(log({ aircraftType: 'ZZZZ', registration: 'G-ABCD' }));
  assert.strictEqual(cell('easa', unknown, 'multiPilot'), '');
  assert.strictEqual(cell('icao', unknown, 'spSE'), '');
});

test('the Canadian engine-and-light split needs night hours to be recorded', () => {
  const day = toRow(log({ nightTime: 0 }));
  assert.strictEqual(cell('tcca', day, 'meDay'), '3:30');
  assert.strictEqual(cell('tcca', day, 'meNight'), '');
  assert.strictEqual(cell('tcca', day, 'seDay'), '', 'an A320 is not single-engine');

  const some = toRow(log({ nightTime: 1.5 }));
  assert.strictEqual(cell('tcca', some, 'meDay'), '2:00');
  assert.strictEqual(cell('tcca', some, 'meNight'), '1:30');

  // Night unknown is not night zero, so neither column is claimed.
  const unknownNight = toRow(log({ nightTime: null }));
  assert.strictEqual(cell('tcca', unknownNight, 'meDay'), '');
  assert.strictEqual(cell('tcca', unknownNight, 'meNight'), '');
  assert.strictEqual(cell('casa', unknownNight, 'day'), '');
});

test('the approach column carries the approach we recorded, not a count', () => {
  assert.strictEqual(cell('faa', toRow(log({ approach: 'ils' })), 'approaches'), 'ILS');
  assert.strictEqual(cell('faa', toRow(log()), 'approaches'), '');
});

// ── Columns we have no field for ────────────────────────────────────────────

test('dual, instructor, ICUS and solo print blank in every layout that has them', () => {
  for (const id of fmts.FORMAT_IDS) {
    const fmt = fmts.getFormat(id);
    const cells = cellsFor(fmt, toRow(log({ picTime: 3.5 })));
    fmt.columns.forEach((col, i) => {
      if (['dual', 'instructor', 'icus', 'solo', 'fstd'].includes(col.key)) {
        assert.strictEqual(cells[i], '', `${id}.${col.key} must not be invented`);
      }
    });
  }
});

test('a missing column is reported as a gap, with the field to add', () => {
  const g = gapsFor(fmts.getFormat('faa'), [toRow(log())]);
  const byKey = Object.fromEntries(g.map((x) => [x.key, x]));
  assert.ok(byKey.dual, 'dual received should be reported');
  assert.strictEqual(byKey.dual.kind, 'missing');
  assert.match(byKey.dual.add, /dualTime/);
  assert.ok(byKey.instructor, 'instructor time should be reported');
  assert.ok(!g.some((x) => x.key === 'total'), 'a column we can fill is not a gap');
});

// A pilot who does record a column should not be told we cannot.
test('a column whose field exists is only a gap while it is empty', () => {
  const fmt = fmts.getFormat('faa');
  const empty = gapsFor(fmt, [toRow(log())]);
  assert.ok(empty.some((x) => x.key === 'xc'), 'no cross-country anywhere → reported');
  const filled = gapsFor(fmt, [toRow(log()), toRow(log({ crossCountryTime: 3.5 }))]);
  assert.ok(!filled.some((x) => x.key === 'xc'), 'one flight with cross-country → not reported');
  assert.ok(filled.some((x) => x.key === 'dual'), 'but a field that does not exist always is');
});

// ── Totals lines ────────────────────────────────────────────────────────────

test('a totals line covers every column after the label, and skips the text ones', () => {
  for (const id of fmts.FORMAT_IDS) {
    const fmt = fmts.getFormat(id);
    const sums = [toRow(log()), toRow(log({ totalTime: 2, sicTime: 2 }))].reduce(addRow, zeroSums());
    const cells = totalsCells(fmt, sums);
    assert.strictEqual(cells.length, fmt.columns.length - fmts.labelSpan(fmt), `${id} totals row is the wrong length`);
    fmt.columns.slice(fmts.labelSpan(fmt)).forEach((col, i) => {
      if (col.kind === 'text' || fmts.KINDS[col.key] === 'text') {
        assert.strictEqual(cells[i], '', `${id}.${col.key} is not a number to total`);
      }
    });
    const totalAt = fmt.columns.findIndex((c) => c.key === 'total') - fmts.labelSpan(fmt);
    assert.strictEqual(cells[totalAt], '5:30', `${id} page total`);
  }
});

// Day-first everywhere except the FAA layout, which writes the month first as
// US logbooks do. Four-digit years, so one can never be read for the other.
test('each layout writes the date the way its own book does', () => {
  const r = toRow(log({ date: new Date('2026-03-04T00:00:00Z') }));
  assert.strictEqual(cell('easa', r, 'date'), '04/03/26');
  assert.strictEqual(cell('icao', r, 'date'), '04/03/26');
  assert.strictEqual(cell('faa', r, 'date'), '03/04/26');
});
