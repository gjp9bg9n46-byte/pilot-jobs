'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  hhmm, count, toRow, carryForwardSums, addSums, zeroSums, fmtSums, ROWS_PER_PAGE,
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
  const thisPage = rows.reduce((a, r) => addSums(a, r), zeroSums());
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
  const prior = earlier.reduce((a, r) => addSums(a, r), zeroSums());
  const cf = carryForwardSums({ totalTime: 3000, picTime: 2500 });
  const broughtForward = addSums(cf, prior);

  assert.strictEqual(broughtForward.total, 3150, '3,000 carried + 150 flown before the range');
  assert.strictEqual(broughtForward.coPilot, 150);
  assert.strictEqual(broughtForward.pic, 2500);

  // and the printed range adds on top of it
  const inRange = [toRow(log({ totalTime: 10, sicTime: 10 }))];
  const thisPage = inRange.reduce((a, r) => addSums(a, r), zeroSums());
  assert.strictEqual(addSums(broughtForward, thisPage).total, 3160);
});
