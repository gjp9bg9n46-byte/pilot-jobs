'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { extractRequirements, deriveAircraftTypes } = require('../normalize');

// The trigger-gated field is now reqTypeRatings (matching). reqAircraftTypes stays the
// legacy fleet-inclusive field (search/display) — see the split test below.
const types = (text) => extractRequirements(text).reqTypeRatings;

// ── #1 Fleet-list mentions must NOT create a type-rating requirement ──────────
test('#1 Emirates FO fleet lines do not create a type requirement → not stated', () => {
  const text = [
    'First Officer — Emirates',
    'Join one of the world’s largest international airlines. Our fleet includes the B777, A380 & A350.',
    'Requirements: A valid ICAO ATPL & matching Authority Class 1 Medical certificate.',
    'ICAO English Level 4 or above. Minimum 2,000 hours total flight time.',
  ].join('\n');
  assert.deepStrictEqual(types(text), []);
});

test('#1 a bare fleet list never yields types', () => {
  assert.deepStrictEqual(types('We operate the A320, B737 and E190 across the network.'), []);
  assert.deepStrictEqual(types('Our modern fleet: ATR72 and Dash-8 Q400 regional aircraft.'), []);
});

// ── #1 A stated type-rating requirement IS extracted ─────────────────────────
test('#1 "type rated on the A320" → [A320]', () => {
  assert.deepStrictEqual(types('Candidates must be type rated on the A320.'), ['A320']);
});
test('#1 "A320 type rating required" → [A320]', () => {
  assert.deepStrictEqual(types('A current A320 type rating is required.'), ['A320']);
});
test('#1 "current on the B737" → [B737]', () => {
  assert.deepStrictEqual(types('Pilots must be current on the B737.'), ['B737']);
});
test('#1 "rating on ATR72" → [ATR72]', () => {
  assert.deepStrictEqual(types('Hold a valid type rating on ATR72 aircraft.'), ['ATR72']);
});
test('#1 mixed: fleet blurb + one real requirement extracts only the required type', () => {
  const text = 'Our fleet spans the A350 and B787. The successful candidate will be type rated on the A320.';
  assert.deepStrictEqual(types(text), ['A320']);
});

// ── Option 3 split: legacy reqAircraftTypes (fleet) vs new reqTypeRatings (rated) ──
test('split: fleet mentions populate legacy reqAircraftTypes but NOT reqTypeRatings', () => {
  const r = extractRequirements('Our fleet includes the B777, A380 & A350. Requirements: a valid ICAO ATPL.');
  assert.deepStrictEqual(r.reqTypeRatings, []);                 // new matching field: trigger-gated
  assert.ok(r.reqAircraftTypes.includes('B777'));               // legacy field: fleet-inclusive (unchanged)
  assert.ok(r.reqAircraftTypes.includes('A380'));
});
test('split: a stated requirement lands in BOTH fields', () => {
  const r = extractRequirements('Must be type rated on the A320.');
  assert.deepStrictEqual(r.reqTypeRatings, ['A320']);
  assert.ok(r.reqAircraftTypes.includes('A320'));
});

// ── #3 Hours extractor: nearest-keyword, clause-scoped ───────────────────────
const hrs = (t) => {
  const r = extractRequirements(t);
  return { total: r.reqMinTotalHours, pic: r.reqMinPicHours, multi: r.reqMinMultiEngineHours, turbine: r.reqMinTurbineHours, instrument: r.reqMinInstrumentHours, xc: r.reqMinCrossCountryHours };
};

// Residual-edge fixtures the user called out:
test('#3 edge: ATR72 Captain — concatenated labels split correctly', () => {
  const text = 'Minimum requirements are mandatory. Valid and current ATPL. Current and qualified on ATR 72-600. Total flight time : 3000 hoursTime as PIC : 1000 hoursTime as PIC on ATR 72-600 : 500 hours';
  const h = hrs(text);
  assert.strictEqual(h.total, 3000); // was null in the first proposal
  assert.strictEqual(h.pic, 1000);
  assert.strictEqual(h.multi, null);
});
test('#3 edge: Aeromedical — "total night flying" is NOT the career total', () => {
  const text = 'Current ME/IR BGT theory credit. Minimum 1,500 hours Pilot in Command. Minimum 100 hours total night flying. Minimum 500 hours multi-engine flying. Minimum 200 hours IFR. Minimum 150 hours cross-country flying.';
  const h = hrs(text);
  assert.strictEqual(h.total, null); // no career-total figure stated (was wrongly 100)
  assert.strictEqual(h.pic, 1500);
  assert.strictEqual(h.multi, 500);
  assert.strictEqual(h.instrument, 200);
  assert.strictEqual(h.xc, 150);
});

// 7 headline before→after fixtures:
test('#3 Westair — "Minimum 500 Total PIC" → pic 500, not the total 1000', () => {
  const h = hrs('Requirements Valid CPL License Minimum 1000 hours Total Time Minimum 500 Total PIC Multi-Engine 100 hours Multi-Engine PIC 200 hours');
  assert.strictEqual(h.total, 1000);
  assert.strictEqual(h.pic, 500);
});
test('#3 Clay Lacy Falcon 900 — PIC is 2000, not the total 3500', () => {
  const h = hrs('Requirements include 3,500 hours of total time, 2,000 hours of PIC time, and 1,000 hours of Turbine time. ATP required.');
  assert.strictEqual(h.total, 3500);
  assert.strictEqual(h.pic, 2000);
  assert.strictEqual(h.turbine, 1000);
});
test('#3 Commercial Pilot Captain — PIC 1500, total 5000', () => {
  const h = hrs('Minimum of 5000 hours total flight time, with at least 1500 hours as Pilot-in-Command (PIC).');
  assert.strictEqual(h.total, 5000);
  assert.strictEqual(h.pic, 1500);
});
test('#3 Flexjet Europe — total 2500 (PICUS is PIC 500, not total)', () => {
  const h = hrs('Minimum 500 hours Pilot in Command Under Supervision (PICUS). Minimum 2,500 total flight hours.');
  assert.strictEqual(h.total, 2500);
  assert.strictEqual(h.pic, 500);
});
test('#3 NetJets — ad states only a total; PIC/ME stay null (no false copy)', () => {
  const h = hrs('At least 21 years of age. 1,500 hours total flight time experience or 1,250 hours with appropriate university R-ATP certificate.');
  assert.strictEqual(h.total, 1500);
  assert.strictEqual(h.pic, null);
  assert.strictEqual(h.multi, null);
});
test('#3 Luxaviation Global 8000 — only total stated → no ME/PIC copy', () => {
  const h = hrs('4,000 hours total time (minimum).');
  assert.strictEqual(h.total, 4000);
  assert.strictEqual(h.pic, null);
  assert.strictEqual(h.multi, null);
});
test('#3 Rite-Hite — turbine 1000, PIC 500, total 3000 (no cross-steal)', () => {
  const h = hrs('3000 hours total flight time, 1000 turbine and 500 PIC turbine. Mid-Cabin to Large Cabin aircraft experience G550.');
  assert.strictEqual(h.total, 3000);
  assert.strictEqual(h.pic, 500);
  assert.strictEqual(h.turbine, 1000);
});

// Regressions caught in the dry-run:
test('#3 Emirates FO — "average of 85 flying hours" (roster pay) is ignored; total 2000', () => {
  const h = hrs('Monthly take-home cash: AED 32,100 (USD 8,750), based on an average of 85 flying hours. As a first officer, you will need a minimum of 2,000 hours total flying time.');
  assert.strictEqual(h.total, 2000);
});
test('#3 SA Red Cross — "total Fixed Wing time" is a career total (1500)', () => {
  const h = hrs('A minimum of 1500 hours total Fixed Wing time,75 hours instrument hours and 100 hours night flying.');
  assert.strictEqual(h.total, 1500);
  assert.strictEqual(h.instrument, 75);
});
test('#3 B737NG — "2,000 hours total" (total after the number) is the total', () => {
  const h = hrs('ATPL with B737NG Type Rating, 2,000 hours total, 1,000 hours on B737NG, and 1,500 hours on MPA.');
  assert.strictEqual(h.total, 2000);
});
test('#3 Clay Lacy KSJC — flattened "N hours LABEL" chain binds each number to its following label', () => {
  const h = hrs('Minimum 200 hours in G600 3,500 hours total flight time 2,000 hours Pilot in Command (PIC) 1,000 hours turbine time ATP Certificate required');
  assert.strictEqual(h.total, 3500);
  assert.strictEqual(h.pic, 2000); // not the trailing 1,000
  assert.strictEqual(h.turbine, 1000);
});

// #1 work authorization — federal / military eligibility is a US requirement
const wa = (t) => extractRequirements(t).reqWorkAuthorization;
test('#1 National Guard / Title 32 → US', () => {
  assert.strictEqual(wa('THIS IS A NATIONAL GUARD TITLE 32 EXCEPTED SERVICE POSITION. Aircraft Pilot.'), 'US');
});
test('#1 bare "security clearance" does NOT imply US', () => {
  assert.strictEqual(wa('Appointment subject to security clearance.'), null);
});
test('#1 security clearance WITH US context → US', () => {
  assert.strictEqual(wa('Must be a U.S. citizen able to obtain a security clearance.'), 'US');
});
test('#1 "citizenship required" alone (non-US) does NOT imply US', () => {
  assert.strictEqual(wa('Qatari citizenship required for this government role.'), null);
});

// #B aircraftTypes = title tokens ∪ reqAircraftTypes (no description-body parsing)
test('#B deriveAircraftTypes unions title + rated types, dedups, no body parse', () => {
  assert.deepStrictEqual(deriveAircraftTypes('A320 First Officer', []), ['A320']);
  assert.deepStrictEqual(deriveAircraftTypes('ATR 72-600 First Officer', []), ['ATR72']);
  assert.deepStrictEqual(deriveAircraftTypes('First Officer', ['B737']), ['B737']);
  assert.deepStrictEqual(deriveAircraftTypes('A320 First Officer', ['A320']), ['A320']);
  assert.deepStrictEqual(deriveAircraftTypes('First Officer', []), []);
});
test('#1 USAJobs open continuous announcement → US', () => {
  assert.strictEqual(wa('THIS IS AN OPEN CONTINUOUS ANNOUNCEMENT. The USDA Forest Service airplane pilot role.'), 'US');
});
test('#1 no citizenship/federal signal → not US (stays null)', () => {
  assert.strictEqual(wa('First Officer on the A320. Competitive salary and roster.'), null);
});
