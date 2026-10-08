'use strict';

// The cross-rank / cross-type guard on the LEGACY dedup passes.
// Rule (owner, 2026-10-08): never merge across a different rank or a different
// aircraft type; a location difference alone is still fine. Governing
// principle: showing a duplicate is better than hiding a real job — so every
// ambiguous case must come back "allowed to merge" only when nothing
// contradicts, and "blocked" the moment something does.
//
// Every BLOCK case below is a merge that actually happened in production on
// 2026-10-08 and had to be reverted by hand.

const test = require('node:test');
const assert = require('node:assert');
const { mergeBlocked, modelTokens } = require('../dedup');

const blocks = (a, b) => assert.ok(mergeBlocked(a, b), `expected BLOCKED: "${a}" vs "${b}"`);
const allows = (a, b) => assert.strictEqual(mergeBlocked(a, b), null, `expected allowed: "${a}" vs "${b}" (got ${mergeBlocked(a, b)})`);

test('blocks a merge across different ranks — the Emirates campaign', () => {
  blocks('Direct Entry Captain - Pilot', 'Emirates First Officer/Senior First Officer');
  blocks('Captain A320', 'First Officer A320');
  blocks('First Officer', 'Flight Qualified Leader (Assistant Chief Pilot, Check Airman)');
});

// Honest limit of the rule as specified. Both of these are rank PILOT with no
// aircraft named, so "different rank or different type" cannot separate them —
// yet they are different jobs, and the legacy fingerprint pass merged them on
// 2026-10-08. Catching this needs the identity gate's extra test (no type AND
// titles share nothing), which would also block legitimate per-city title
// variants, so it is NOT applied here. Flagged for a decision.
test('KNOWN GAP: same rank, no type, unrelated titles still merge', () => {
  allows('Rotor Wing Pilot in Command', 'Pilot Transport');
  allows('Safety Pilot', 'Pilot Transport');
});

test('blocks a merge across different aircraft — curated types', () => {
  blocks('First Officer, Gulfstream 200', 'First Officer, Falcon 2000 LX');
  blocks('A320 First Officer', 'B737 First Officer');
});

test('blocks a merge across different airframes the type vocabulary does not know', () => {
  // KC-10 and KC-135 are different tankers; neither is in typesOf()
  blocks('KC-10 First Officer', 'KC-135 Stratotanker First Officer');
  // one side names a type the vocabulary knows and the other does not → that
  // is an absence, not a contradiction, so it stays allowed (see the Perimeter
  // Dash/Metro pair, which the IDENTITY gate holds on its own rules)
  allows('Dash 8 First Officer', 'Metro 23 First Officer');
});

test('ALLOWS the merges these passes exist for — same job, different wording or place', () => {
  allows('First Officer', 'First Officer');
  allows('SAAB First Officer', 'SAAB First Officer');
  allows('A320 First Officer', 'A320 First Officer (m/w/d)');
  // one side names a type and the other does not → not a contradiction
  allows('First Officer', 'First Officer A321');
  allows('Pilot', 'Pilot');
});

test('a location difference alone never blocks — that is what the pass is for', () => {
  allows('First Officer - Dubai', 'First Officer - Abu Dhabi');
  allows('Captain - Germany', 'Captain - Spain');
});

test('modelTokens only picks airframe-shaped tokens', () => {
  assert.deepStrictEqual([...modelTokens('KC-135 Stratotanker First Officer')], ['kc135']);
  assert.deepStrictEqual([...modelTokens('A320 First Officer')], ['a320']);
  assert.deepStrictEqual([...modelTokens('Boeing 747 Captain')], ['747']);
  // rosters and years are not airframes
  assert.deepStrictEqual([...modelTokens('Captain 10/10 Roster')], []);
  assert.deepStrictEqual([...modelTokens('First Officer')], []);
});

test('a named sub-brand is a different employer — QantasLink is not Qantas', () => {
  assert.ok(mergeBlocked('QantasLink Direct Entry First Officer', 'First Officer: Regional Pilot — Home Bases in Australia', 'Qantas Group', 'Qantas Group'));
  // both sides naming the same brand is fine
  assert.strictEqual(mergeBlocked('QantasLink First Officer - Sydney', 'QantasLink First Officer - Melbourne', 'Qantas Group', 'Qantas Group'), null);
  // neither naming one is fine
  assert.strictEqual(mergeBlocked('First Officer - Sydney', 'First Officer - Melbourne', 'Qantas', 'Qantas'), null);
});
