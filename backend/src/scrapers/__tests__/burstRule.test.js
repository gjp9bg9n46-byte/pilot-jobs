'use strict';

// The burst rule, and above all what it must NOT merge.
//
// Every case below is a pair the dry runs actually proposed collapsing, or one
// the owner caught. They are written as "must not merge" because that is the
// expensive direction: a missed duplicate costs a tidy list, a wrong merge
// hides a real vacancy from a pilot who would have applied for it.

const test = require('node:test');
const assert = require('node:assert');

const { mergeBlocked, burstKind, BURST_WINDOW_DAYS } = require('../dedup');

// The rule's own veto, member against canonical.
const blocked = (a, b, ca = 'Emirates', cb = 'Emirates') => mergeBlocked(a, b, ca, cb);

test('the window is a week', () => {
  assert.strictEqual(BURST_WINDOW_DAYS, 7);
});

test('a sim instructor is not a line pilot', () => {
  assert.strictEqual(burstKind('Synthetic Flight Instructor (Ground) - Airbus'), 'ground');
  assert.strictEqual(burstKind('Simulator Instructor'), 'ground');
  assert.strictEqual(burstKind('Direct Entry Captain'), 'flying');
  assert.strictEqual(burstKind('First Officer: Global Flying with Tax-Free Dubai Benefits'), 'flying');
});

// ── Must not merge ──────────────────────────────────────────────────────────

test('two fleets are two vacancies, written either way round', () => {
  // The first dry run merged these: only one side matched the old model
  // pattern, so the guard saw nothing to disagree about.
  assert.ok(blocked('A320 Captain', 'Boeing 737 Captains', 'GetJet Airlines', 'GetJet Airlines'));
  assert.ok(blocked('Boeing 737 First Officer', 'A320 First Officer', 'GetJet Airlines', 'GetJet Airlines'));
  assert.ok(blocked('First Officer - A320', 'First Officer - A330', 'Etihad Airways', 'Etihad Airways'));
  assert.ok(blocked('Boeing 787 First Officer', 'Boeing 737 First Officer', 'Norse', 'Norse'));
});

test('an Airbus course is not a Boeing course', () => {
  assert.ok(blocked('Synthetic Flight Instructor (Ground) - Airbus', 'Synthetic Flight Instructor (Ground)- Boeing'));
  assert.ok(blocked('Synthetic Flight Examiner (Ground) Airbus', 'Synthetic Flight Examiner (Ground) Boeing'));
});

test('two entry programmes are two campaigns', () => {
  // Emirates runs these side by side and the first dry run collapsed them.
  assert.ok(blocked('Accelerated Command - Pilot', 'Direct Entry Pilot'));
  assert.ok(blocked('Direct Entry Captain', 'Cadet Pilot Programme'));
});

test('ranks do not blur into each other', () => {
  assert.ok(blocked('Direct Entry Captain', 'First Officer'));
  assert.ok(blocked('Senior First Officer Emirates Fly Better', 'First Officer'));
  assert.ok(blocked('Flight Instructor', 'Flight Examiner'));
  assert.ok(blocked('Chief Pilot', 'Commercial Pilot'), 'the owner called this one out by name');
});

test('a sub-brand hires on its own terms', () => {
  assert.ok(blocked('Direct Entry First Officer', 'QantasLink Direct Entry First Officer', 'Qantas', 'Qantas'));
  assert.ok(blocked('First Officer', 'Jetstar First Officer', 'Qantas Group', 'Qantas Group'));
});

test('a helicopter job is a different licence', () => {
  assert.ok(blocked('Rotor Wing Pilot', 'Pilot - Full Time'));
  assert.ok(blocked('HEMS Captain', 'Fixed Wing Captain'));
});

test('type-rated and non-type-rated are different adverts', () => {
  assert.ok(blocked('Type Rated A320 First Officer', 'Non Type Rated First Officer'));
});

// ── Must still merge ────────────────────────────────────────────────────────
// The rule is worthless if it refuses everything, so the reworded reposts the
// aggregators actually produce have to go through.

test('a reworded repost of the same vacancy still merges', () => {
  assert.strictEqual(blocked('Direct Entry Captain - Pilot', 'Direct Entry Captain - Pilot'), null);
  assert.strictEqual(
    blocked('Experienced First Officer Rated & Not-Rated (All Genders)', 'Experienced First Officer Rated & Not-Rated (All Genders) - Air Dolomiti',
      'Air Dolomiti', 'Air Dolomiti'),
    null,
  );
});

// The ingestion rule is STRICTER than the one-off batch the owner approved.
// That batch merged five reworded Qantas reposts; mergeBlocked refuses two of
// them, because one title claims "path to command" and the other does not.
// Erring that way is deliberate: a missed duplicate costs a tidy list, a wrong
// merge hides a vacancy from a pilot who would have applied.
test('a one-sided claim about the role holds the merge back', () => {
  assert.ok(blocked(
    'Regional First Officer Pilot - Path to Command',
    'First Officer - Regional Pilot (Home Bases, FT)',
    'Qantas Group', 'Qantas Group',
  ));
});

test('a type named on one side only is not a disagreement', () => {
  // "First Officer" vs "First Officer A321" is the same vacancy, one title
  // simply says more. Only a stated conflict blocks.
  assert.strictEqual(blocked('First Officer', 'First Officer A321'), null);
});
