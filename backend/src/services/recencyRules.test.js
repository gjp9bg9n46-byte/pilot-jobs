'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { recencyRuleFor, normalizeAuthority, holdsInstrumentRating } = require('./recencyRules');

const cert = (type, authority = 'EASA', expiryDate = null) => ({ type, issuingAuthority: authority, expiryDate });

test('EASA: an IR holder is never told a night landing is needed', () => {
  const r = recencyRuleFor([cert('ATPL')]);
  assert.equal(r.mapped, true);
  assert.equal(r.hasIr, true);
  assert.equal(r.nightApplies, false);
});

test('EASA: a CPL with no instrument rating does carry the night requirement', () => {
  const r = recencyRuleFor([cert('CPL')]);
  assert.equal(r.nightApplies, true);
});

test('EASA: a current IR on a CPL removes the night requirement', () => {
  const r = recencyRuleFor([cert('CPL'), cert('IR', 'EASA', '2030-01-01')]);
  assert.equal(r.nightApplies, false);
});

test('EASA: an EXPIRED IR on a CPL does not remove it', () => {
  const r = recencyRuleFor([cert('CPL'), cert('IR', 'EASA', '2000-01-01')]);
  assert.equal(r.nightApplies, true);
});

test('FAA: no instrument-rating exemption — the night leg applies to an ATP', () => {
  const r = recencyRuleFor([cert('ATPL', 'FAA')]);
  assert.equal(r.nightApplies, true);
  // The full-stop caveat is part of what the PILOT reads now. It used to sit
  // in `note`, which is our own working field and was being printed to them
  // verbatim; `note` no longer leaves the server at all.
  assert.match(r.nightNote, /full-stop/);
  assert.match(r.nightNote, /treat the night figure as a maximum/);
  assert.ok(!/CockpitHire/.test(r.nightNote), 'say what the rule asks, not what our database holds');
});

test('unmapped authority never asserts a night requirement', () => {
  for (const a of ['GCAA', 'ECAA', 'Some Other CAA']) {
    const r = recencyRuleFor([cert('CPL', a)]);
    assert.equal(r.mapped, false, `${a} must not be treated as mapped`);
    assert.equal(r.nightApplies, false, `${a} must not demand a night landing`);
  }
});

test('missing/unknown authority falls back to the total-only rule', () => {
  for (const a of ['unknown', '', null, 'ICAO']) {
    const r = recencyRuleFor([cert('CPL', a)]);
    assert.equal(r.mapped, false);
    assert.equal(r.nightApplies, false);
    assert.equal(r.base, 3);
  }
});

test('the authority comes from the highest licence held', () => {
  const r = recencyRuleFor([cert('PPL', 'FAA'), cert('CPL', 'EASA')]);
  assert.equal(r.authority, 'EASA');
});

test('authority spellings normalise to the table keys', () => {
  assert.equal(normalizeAuthority('easa'), 'EASA');
  assert.equal(normalizeAuthority('UK CAA'), 'UK_CAA');
  assert.equal(normalizeAuthority('FAA (USA)'), 'FAA');
  assert.equal(normalizeAuthority('GCAA'), 'GCAA');
  assert.equal(normalizeAuthority('ECAA'), 'ECAA');
  assert.equal(normalizeAuthority('unknown'), null);
});

test('instrument privileges: ATPL/MPL imply them, a bare CPL does not', () => {
  assert.equal(holdsInstrumentRating([cert('ATPL')]), true);
  assert.equal(holdsInstrumentRating([cert('MPL')]), true);
  assert.equal(holdsInstrumentRating([cert('CPL')]), false);
});
