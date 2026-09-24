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

test('classForType: multi/turbine vs single-piston, unknown → null', () => {
  assert.deepStrictEqual(classForType('A320'), { multi: true, turbine: true });
  assert.deepStrictEqual(classForType('DA42'), { multi: true, turbine: false });
  assert.deepStrictEqual(classForType('C172'), { multi: false, turbine: false });
  assert.strictEqual(classForType('ZZZ99'), null);
});

test('typeFromRegistration: Air Cairo SU-B** truncated reg → A320', () => {
  assert.strictEqual(typeFromRegistration('BPX').type, 'A320');
  assert.strictEqual(typeFromRegistration('BUU').type, 'A320');
  assert.strictEqual(typeFromRegistration('SU-BPX'), null); // full reg not matched by the truncated rule
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
