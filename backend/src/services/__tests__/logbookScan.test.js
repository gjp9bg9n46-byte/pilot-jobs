'use strict';

// The scan pipeline's arithmetic and judgement, without touching the network:
// night from the sun, the Air Cairo cross-checks, and what the review screen
// is told to flag. Airport lookups hit the cached OurAirports index.

const test = require('node:test');
const assert = require('node:assert');

const { span, parseFormDuration, parseDate, hhmm } = require('../voyageValidate');
const { validateScan } = require('../voyageValidate');
const { solarElevation, toMinutes, utcWindow, nightMinutes } = require('../nightTime');
const { spanMinutes, buildFlightRow, presetFor, ROLE_PRESETS } = require('../logbookEntry');
const { parseJson, estimateCostUsd, modelName } = require('../voyageExtractor');

// A real page: HRG–MUC–HRG on 4 Oct 2026, SU-BVM, Capt Elmasry (1766), FO 3074.
const RAW = () => ({
  date: '2026-10-04', registration: 'SU-BVM', aircraftType: '', commander: 'MOHAMED ELMASRY',
  firstOfficer: 'MOHAMED MEKHEMAR', pilotRole: 'UNKNOWN', pageOrientation: 'upright',
  totals: { day: '07:40', night: '01:00', total: '08:40' },
  sectors: [
    { flightNumber: 'MSC 2926', from: 'HRG', to: 'MUC', out: '07:26', off: '07:39', on: '11:47', in: '11:53',
      std: '07:25', sta: '12:05', landings: 1, pilotFlying: true, formDay: '04:27', formNight: '', formTotal: '04:27',
      pfStaff: '1766', pmStaff: '3074', confidence: {} },
    { flightNumber: 'MSC 2927', from: 'MUC', to: 'HRG', out: '12:54', off: '13:12', on: '17:04', in: '17:17',
      std: '13:05', sta: '17:15', landings: 1, pilotFlying: false, formDay: '03:13', formNight: '01:00', formTotal: '04:13',
      pfStaff: '3074', pmStaff: '1766', confidence: {} },
  ],
  confidence: {},
});
const FO = { id: 'p1', role: 'FIRST_OFFICER', staffNumber: '3074', logbookPrefs: {} };
const NOW = new Date('2026-10-16T00:00:00Z');

test('times: a sector that crosses midnight lands the next day', () => {
  assert.equal(span('23:40', '01:10'), 90);
  assert.equal(span('07:26', '11:53'), 267);
  assert.equal(spanMinutes('22:00', '22:00'), 0);
  assert.equal(span('bad', '01:00'), null);
  assert.equal(hhmm(267), '4:27');
});

test('the form\'s own hh mm columns parse, including "04 27"', () => {
  assert.equal(parseFormDuration('04:27'), 267);
  assert.equal(parseFormDuration('04 27'), 267);
  assert.equal(parseFormDuration('0427'), 267);
  assert.equal(parseFormDuration(''), null);
});

test('dates: dd/mm/yyyy as written on the form, and ISO', () => {
  assert.equal(parseDate('04/10/2026').toISOString().slice(0, 10), '2026-10-04');
  assert.equal(parseDate('2026-10-04').toISOString().slice(0, 10), '2026-10-04');
  assert.equal(parseDate('4-10-26').toISOString().slice(0, 10), '2026-10-04');
  assert.equal(parseDate('not a date'), null);
});

test('the sun: noon is up at Greenwich, midnight is well down', () => {
  assert.ok(solarElevation(51.48, 0, new Date('2026-03-20T12:00:00Z')) > 30);
  assert.ok(solarElevation(51.48, 0, new Date('2026-03-20T00:00:00Z')) < -30);
  assert.equal(toMinutes('0740'), 460);
  assert.equal(toMinutes('25:00'), null);
  assert.equal(utcWindow('2026-10-04', '23:30', '00:30').to - utcWindow('2026-10-04', '23:30', '00:30').from, 3600000);
});

test('night: a daylight sector is zero, a night sector is not', async () => {
  const day = await nightMinutes({ date: new Date('2026-10-04'), departure: 'HRG', arrival: 'MUC', off: '07:39', on: '11:47' });
  assert.equal(day.minutes, 0);
  const night = await nightMinutes({ date: new Date('2026-10-04'), departure: 'CAI', arrival: 'HRG', off: '20:30', on: '21:30' });
  assert.ok(night.minutes > 30, `expected a night sector, got ${night.minutes} min`);
});

test('block disagreeing with the form marks OUT and IN, not the whole sector', async () => {
  const r = await validateScan(RAW(), { pilot: FO, now: NOW });
  const [one, two] = r.sectors;
  assert.equal(one.blockHHMM, '4:27');
  assert.deepEqual(one.flags, {}, 'a sector matching the form is clean');
  assert.equal(two.blockHHMM, '4:23');                 // 12:54 → 17:17 as read
  assert.match(two.flags.out.message, /form says 4:13/);
  assert.match(two.flags.in.message, /form says 4:13/);
  assert.equal(two.flags.off, undefined);
});

test('the staff number decides who was flying, overriding the model', async () => {
  const r = await validateScan(RAW(), { pilot: FO, now: NOW });
  // The model said PF on sector 1, but 3074 is in the PM column there.
  assert.equal(r.sectors[0].pilotFlying, false);
  assert.equal(r.sectors[0].myLandings, 0);
  assert.equal(r.sectors[1].pilotFlying, true);
  assert.equal(r.sectors[1].myLandings, 1);
  assert.equal(r.sectors[1].pfSource, 'staff number');
});

test('with no staff number the model\'s reading stands', async () => {
  const r = await validateScan(RAW(), { pilot: { ...FO, staffNumber: null }, now: NOW });
  assert.equal(r.sectors[0].pilotFlying, true);
  assert.equal(r.sectors[0].pfSource, 'read');
});

test('the form\'s night time wins over the calculation, and both are kept', async () => {
  const r = await validateScan(RAW(), { pilot: FO, now: NOW });
  const two = r.sectors[1];
  assert.equal(two.nightFromForm, 60);
  assert.equal(two.nightSource, 'form');
  assert.equal(two.night, 60);
  assert.ok(two.nightCalculated != null, 'the sun figure is kept alongside');
});

test('a night figure far from the form is flagged, not silently replaced', async () => {
  const raw = RAW();
  raw.sectors[1].formNight = '03:00';           // nothing like the sun's answer
  const r = await validateScan(raw, { pilot: FO, now: NOW });
  assert.match(r.sectors[1].flags.night.message, /Using the form/);
  assert.equal(r.sectors[1].night, 180);
});

test('airports must exist; a misread code is red, not saved quietly', async () => {
  const raw = RAW();
  raw.sectors[0].to = 'XQX';
  const r = await validateScan(raw, { pilot: FO, now: NOW });
  assert.equal(r.sectors[0].flags.to.level, 'red');
});

test('dates in the future are red; dates over 60 days old are amber', async () => {
  const future = RAW(); future.date = '2026-12-01';
  assert.equal((await validateScan(future, { pilot: FO, now: NOW })).header.flags.date.level, 'red');
  const old = RAW(); old.date = '2026-01-04';
  assert.equal((await validateScan(old, { pilot: FO, now: NOW })).header.flags.date.level, 'amber');
});

test('low confidence on a time asks the pilot to look', async () => {
  const raw = RAW();
  raw.sectors[0].confidence = { on: 0.42 };
  const r = await validateScan(raw, { pilot: FO, now: NOW });
  assert.equal(r.sectors[0].flags.on.level, 'amber');
});

test('the registration drives the type when the form has no type column', async () => {
  const raw = RAW();
  const r = await validateScan(raw, { pilot: FO, now: NOW });   // SU-BVM, no type column
  assert.equal(r.header.aircraftType, 'A320');
  assert.equal(r.header.typeInferred, true);
  // An unknown mark stays empty rather than being guessed.
  raw.registration = 'ZZ-QQQ';
  assert.equal((await validateScan(raw, { pilot: FO, now: NOW })).header.aircraftType, null);
});

test('a manual entry derives block, night and the SIC split from the times', async () => {
  const row = await buildFlightRow({
    date: '2026-10-04', from: 'HRG', to: 'MUC', out: '07:26', off: '07:39', on: '11:47', in: '11:53',
    aircraftType: 'a320', registration: 'su-bvm', pilotFlying: true, commander: 'K. Samir',
  }, FO);
  assert.equal(row.totalTime, 4.45);                 // 4:27
  assert.equal(row.sicTime, 4.45);
  assert.equal(row.picTime, 0);
  assert.equal(row.nightTime, 0);
  assert.equal(row.aircraftType, 'A320');
  assert.equal(row.registration, 'SU-BVM');
  assert.equal(row.landingsDay, 1);
  assert.equal(row._derived.blockMinutes, 267);
  assert.equal(row._derived.airborneMinutes, 248);
});

test('the captain preset books the same flight as PIC', async () => {
  const captain = { id: 'p2', role: 'CAPTAIN', logbookPrefs: {} };
  assert.equal(presetFor(captain), 'airline_captain');
  assert.equal(ROLE_PRESETS[presetFor(captain)].role, 'PIC');
  const row = await buildFlightRow({ date: '2026-10-04', from: 'HRG', to: 'MUC', out: '07:26', in: '11:53' }, captain);
  assert.equal(row.picTime, 4.45);
  assert.equal(row.sicTime, 0);
});

test('a monitoring pilot logs no landing', async () => {
  const row = await buildFlightRow({ date: '2026-10-04', from: 'HRG', to: 'MUC', out: '07:26', in: '11:53', pilotFlying: false }, FO);
  assert.equal(row.landingsDay + row.landingsNight, 0);
});

test('extractor helpers: fenced JSON, cost, model from env', () => {
  assert.deepEqual(parseJson('```json\n{"sectors":[]}\n```'), { sectors: [] });
  assert.equal(parseJson('nonsense'), null);
  assert.ok(estimateCostUsd({ promptTokenCount: 1800, candidatesTokenCount: 550 }) < 0.01);
  assert.ok(modelName().includes('flash'));
});

// ── The checks added after the first accuracy round ────────────────────────
// Every one of these is a real miss from the nine sample reports.

const { matchesForm, parseDuration: dur } = require('../voyageReconcile');

test('a re-read is judged against the PAGE total, never its own (the 96c1f6fc trap)', () => {
  // The page was read two hours late AND its T column was read two hours long,
  // so the two agreed with each other and nothing was flagged.
  const misread = { out: '15:42', in: '21:55', formTotal: '06:13' };
  assert.equal(matchesForm(misread), true, 'self-consistent misreading looks fine on its own');
  assert.equal(matchesForm(misread, dur('05:13')), false, 'against the real T it is caught');
  const correct = { out: '13:42', in: '18:55', formTotal: '05:13' };
  assert.equal(matchesForm(correct, dur('05:13')), true);
});

test('the lower table is an independent witness to the route', async () => {
  const raw = RAW();
  raw.sectors[0].lowerFrom = 'CAI';            // upper table said HRG
  raw.sectors[0].lowerTo = 'JED';              // upper table said MUC
  const r = await validateScan(raw, { pilot: FO, now: NOW });
  assert.match(r.sectors[0].flags.from.message, /lower table says CAI/);
  assert.match(r.sectors[0].flags.to.message, /lower table says JED/);
});

test('sector totals that do not add up to the page total flag every row', async () => {
  const raw = RAW();
  raw.totals = { day: '07:40', night: '01:00', total: '11:04' };   // sectors sum to 8:40
  const r = await validateScan(raw, { pilot: FO, now: NOW });
  assert.match(r.header.flags.totals.message, /page total says 11:04/);
  assert.ok(r.sectors.every((s) => s.needsCheck), 'every sector is put up for checking');
});

test('a disagreement between the two readings is flagged on that field', async () => {
  const r = await validateScan(RAW(), {
    pilot: FO, now: NOW,
    uncertain: { header: ['registration'], sectors: { 1: ['on', 'in'] } },
  });
  assert.match(r.header.flags.registration.message, /read differently the second time/);
  assert.match(r.sectors[1].flags.on.message, /two readings/);
  assert.match(r.sectors[1].flags.in.message, /two readings/);
  assert.equal(r.sectors[0].flags.on, undefined, 'the sector they agreed on stays clean');
});

test('dates: a swapped day and month is offered back, not just rejected', async () => {
  const raw = RAW();
  raw.date = '2026-10-21';                     // 21 Oct is still to come
  const r = await validateScan(raw, { pilot: FO, now: new Date('2026-10-17T00:00:00Z') });
  assert.equal(r.header.flags.date.level, 'red');
  assert.equal(r.header.dateSuggestion, '2026-10-12', 'day and month swapped back');
});

test('dates: a misread year is offered back as this year', async () => {
  const raw = RAW();
  raw.date = '2021-10-16';
  const r = await validateScan(raw, { pilot: FO, now: new Date('2026-10-17T00:00:00Z') });
  assert.equal(r.header.flags.date.level, 'amber');
  assert.equal(r.header.dateSuggestion, '2026-10-16');
});

test('a departure long after its scheduled time is worth a second look', async () => {
  const raw = RAW();
  raw.sectors[0].std = '07:25';
  raw.sectors[0].out = '09:26';                // two hours after STD
  raw.sectors[0].in = '13:53';                 // block still matches the form
  raw.sectors[0].formTotal = '04:27';
  const r = await validateScan(raw, { pilot: FO, now: NOW });
  assert.match(r.sectors[0].flags.out.message, /after the scheduled 07:25/);
});

test('a sector that matches its form total and schedule stays clean', async () => {
  const raw = RAW();
  raw.sectors[1].out = '12:59';
  raw.sectors[1].in = '17:12';                 // 4:13, exactly the form's T
  raw.sectors[1].std = '13:05';
  const r = await validateScan(raw, { pilot: FO, now: NOW });
  assert.deepEqual(r.sectors[1].flags, {});
});

test('an unmatched staff number leaves who-was-flying unverified, and says so', async () => {
  const raw = RAW();
  raw.sectors[0].pfStaff = '3574';          // a digit off the pilot's own 3074
  raw.sectors[0].pmStaff = '1407';
  const r = await validateScan(raw, { pilot: FO, now: NOW });
  assert.match(r.sectors[0].flags.pilotFlying.message, /not in the PF or PM column/);
});

test('staff numbers that read differently twice put the landing up for checking', async () => {
  const r = await validateScan(RAW(), {
    pilot: FO, now: NOW,
    uncertain: { header: [], sectors: { 1: ['pfStaff', 'pmStaff'] } },
  });
  assert.match(r.sectors[1].flags.pilotFlying.message, /read differently the second time/);
  assert.equal(r.sectors[0].flags.pilotFlying, undefined, 'the sector they agreed on is left alone');
});
