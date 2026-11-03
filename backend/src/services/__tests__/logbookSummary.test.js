'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { _internals } = require('../logbookSummary');
const { blockFromTimes, normaliseType, classForType, typeFromRegistration, resolveType, buildLadder } = _internals;

test('blockFromTimes: normal + midnight wrap + bad input', () => {
  assert.strictEqual(blockFromTimes('00:29', '03:06'), 157 / 60);
  assert.strictEqual(blockFromTimes('23:30', '01:00'), 90 / 60); // wraps midnight
  assert.strictEqual(blockFromTimes('', '01:00'), null);
  assert.strictEqual(blockFromTimes('99:99', '01:00'), null);
});

test('normaliseType strips variant suffixes to a family key', () => {
  assert.strictEqual(normaliseType('A320-200'), 'A320');
  assert.strictEqual(normaliseType('b737 800'), 'B737');
  assert.strictEqual(normaliseType(''), '');
});

test('classForType: multi/turbine/jet vs single-piston, unknown → null', () => {
  assert.deepStrictEqual(classForType('A320'), { multi: true, turbine: true, jet: true });
  // A turboprop is turbine and is NOT a jet — a form asks for them separately.
  assert.deepStrictEqual(classForType('ATR72'), { multi: true, turbine: true, jet: false });
  assert.deepStrictEqual(classForType('DA42'), { multi: true, turbine: false });
  assert.deepStrictEqual(classForType('C172'), { multi: false, turbine: false });
  assert.strictEqual(classForType('ZZZ99'), null);
});

// An operator roster exports IATA subtype codes rather than the type. A pilot
// on one fleet must not see it split into seven rows in their own logbook.
test('normaliseType folds the A320-family subtype codes 32A–32G into A320', () => {
  for (const c of ['32A', '32B', '32C', '32D', '32E', '32F', '32G']) {
    assert.strictEqual(normaliseType(c), 'A320', `${c} should read as A320`);
  }
  assert.strictEqual(normaliseType('32a'), 'A320');
  // Not every 32-prefixed token is the family: leave anything else alone.
  assert.strictEqual(normaliseType('32H'), '32H');
  assert.strictEqual(normaliseType('320'), '320');
  assert.strictEqual(normaliseType('B732'), 'B732');
});

test('typeFromRegistration: Air Cairo SU-B** truncated reg → A320', () => {
  assert.strictEqual(typeFromRegistration('BPX').type, 'A320');
  assert.strictEqual(typeFromRegistration('BUU').type, 'A320');
  // Scanned voyage reports write the full mark, imports hold the bare suffix.
  assert.strictEqual(typeFromRegistration('SU-BPX').type, 'A320');
  assert.strictEqual(typeFromRegistration('SUBPX').type, 'A320');
  assert.strictEqual(typeFromRegistration('N123'), null);
});

test('resolveType: stored type wins; else inferred from reg; else empty', () => {
  assert.deepStrictEqual(resolveType({ aircraftType: 'A321', registration: 'BPX' }), { type: 'A321', inferred: false, note: null });
  const inf = resolveType({ aircraftType: '', registration: 'BPX' });
  assert.strictEqual(inf.type, 'A320');
  assert.strictEqual(inf.inferred, true);
  assert.deepStrictEqual(resolveType({ aircraftType: '', registration: 'N123' }), { type: '', inferred: false, note: null });
});

test('ladder: CPL, ATPL, then 1000-step rungs', () => {
  const l = buildLadder();
  assert.deepStrictEqual(l[0], { hours: 250, label: 'CPL' });
  assert.deepStrictEqual(l[1], { hours: 1500, label: 'ATPL' });
  assert.strictEqual(l[2].hours, 2000);
  assert.ok(l.every((r, i) => i === 0 || r.hours > l[i - 1].hours)); // strictly increasing
});
