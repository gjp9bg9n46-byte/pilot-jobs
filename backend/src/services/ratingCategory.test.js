const test = require('node:test');
const assert = require('node:assert');
const { impliedCategory, isClassRating, surfaceOf, withSurface, normalizeType } = require('./ratingCategory');

test('the type answers the category where it can', () => {
  for (const t of ['A320', 'B737-800', 'ATR 72', 'KING AIR 200', 'MEP', 'CRJ900', 'Falcon 7X']) {
    assert.strictEqual(impliedCategory(t), 'Multi-Engine', t);
  }
  for (const t of ['SEP', 'C172', 'CESSNA-172', 'PA-28', 'SR22', 'TBM 930', 'PC-12']) {
    assert.strictEqual(impliedCategory(t), 'Single-Engine', t);
  }
});

test('an unrecognised type is left to the pilot, never guessed', () => {
  for (const t of ['', null, undefined, 'XJ-9', 'Prototype One']) {
    assert.strictEqual(impliedCategory(t), null, String(t));
  }
});

test('class ratings are told apart from type ratings', () => {
  for (const t of ['SEP', 'MEP (land)', 'set', 'MET (sea)']) assert.ok(isClassRating(t), t);
  for (const t of ['A320', 'C172', 'SEPTEMBER']) assert.ok(!isClassRating(t), t);
});

test('the surface rides along with a class rating only', () => {
  assert.strictEqual(surfaceOf('SEP (sea)'), 'sea');
  assert.strictEqual(surfaceOf('SEP'), null);
  assert.strictEqual(withSurface('SEP', 'sea'), 'SEP (sea)');
  assert.strictEqual(withSurface('SEP (land)', 'sea'), 'SEP (sea)');
  assert.strictEqual(withSurface('A320', 'sea'), 'A320', 'a type rating gains no surface');
});

test('stored types are uppercase but the surface stays readable', () => {
  assert.strictEqual(normalizeType(' sep (land) '), 'SEP (land)');
  assert.strictEqual(normalizeType('a320'), 'A320');
});
