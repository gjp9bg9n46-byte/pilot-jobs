'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { classifyJob } = require('../aviationFilter');

const verdict = (job) => classifyJob(typeof job === 'string' ? { title: job } : job).verdict;

test('rejects hospitality / maritime / generic "captain" roles', () => {
  const rejects = [
    { title: 'F&B Captain – Ycone Paris', company: 'Raffles Hotels & Resorts' },
    { title: 'Bell Captain/Lead Doorman - W Amsterdam', company: 'Hotelprofessionals' },
    { title: 'Rotational Captain 40m+ S.Y', company: 'McMaster Yachts Ltd.' },
    { title: 'Junior Port Captain & Operator – Remote-Ready Logistics', company: 'Nirint Shipping B.V.' },
    { title: 'Team Captain', company: 'Boldr' },
    { title: 'Job Captain', company: 'Westside Build LLC' },
  ];
  for (const j of rejects) assert.strictEqual(verdict(j), 'reject', `should reject: ${j.title}`);
});

test('keeps real pilot roles (incl. business-jet type codes)', () => {
  const keeps = [
    { title: 'Captain (Home Based) - CL300/350', company: 'Vista America' },
    { title: 'Captain A320', company: 'Some Operator' },
    { title: 'First Officer B737', company: 'Some Operator' },
    { title: 'Gulfstream G650 First Officer', company: 'Jet Aviation' },
  ];
  for (const j of keeps) assert.strictEqual(verdict(j), 'keep', `should keep: ${j.title}`);
});

test('routes ambiguous military/air-force to review, not reject', () => {
  assert.strictEqual(verdict({ title: 'Captain — Air Defence Wing Planning Lead', company: 'Pareto Securities AS' }), 'review');
  // but a military PILOT still keeps (aviation signal wins)
  assert.strictEqual(verdict({ title: 'Air Force Pilot', company: 'RAF' }), 'keep');
});

test('word boundaries: bar≠Barcelona, port≠airport/transport, ship≠internship', () => {
  assert.strictEqual(verdict({ title: 'First Officer', company: 'Barcelona Air', description: 'Based in Barcelona' }), 'keep');
  assert.strictEqual(verdict({ title: 'A320 Captain', description: 'airport ops, ground transport, full support' }), 'keep');
  assert.strictEqual(verdict({ title: 'Pilot', description: 'paid internship and partnership opportunities' }), 'keep');
});

test('airline/operator source is kept by provenance', () => {
  assert.strictEqual(verdict({ title: 'Direct Entry Captain', company: 'Emirates', sourceType: 'operator_direct' }), 'keep');
});

// ── Regression: the two bugs found on live data ──────────────────────────────
test('BUG1 — "Direct Entry Captain … airline" is KEPT (airline in text is a signal)', () => {
  assert.strictEqual(verdict({ title: 'Direct Entry Captain', company: 'Air Dolomiti', description: 'Join our airline as a captain.' }), 'keep');
  assert.strictEqual(verdict({ title: 'Captain – Lead Flights & Teams with Excellence', company: 'Air Dolomiti', description: 'Air Dolomiti, a Lufthansa Group airline, Embraer fleet.' }), 'keep');
});

test('BUG2 — maritime "Port Captain" is REJECTED even when it names harbour "pilots" / working hours', () => {
  const msc = { title: 'Port Captain', company: 'MSC Mediterranean Shipping Company', description: 'As an FNTE Port Captain in our Marseille office you coordinate with harbour pilots and vessel crews, 24 hours port operations.' };
  assert.strictEqual(verdict(msc), 'reject');
  assert.strictEqual(verdict({ title: 'Marine Pilot', company: 'Port of Rotterdam' }), 'reject');
  assert.strictEqual(verdict({ title: 'Harbour Pilot', company: 'ABP' }), 'reject');
});

test('BUG3 — non-aviation "officer" grades rejected; real First Officers kept', () => {
  assert.strictEqual(verdict({ title: 'HOUSING FIRST OFFICER', company: 'Cardiff Council', description: 'Manage council housing tenancies.' }), 'reject');
  assert.strictEqual(verdict({ title: 'Loan Officer', company: 'A Bank' }), 'reject');
  assert.strictEqual(verdict({ title: 'Compliance Officer', company: 'A Firm' }), 'reject');
  assert.strictEqual(verdict({ title: 'Customs First Officer', company: 'Border Agency' }), 'reject');
  // real pilots still keep (second signal present)
  assert.strictEqual(verdict({ title: 'First Officer A320', company: 'Wizz Air' }), 'keep');
  assert.strictEqual(verdict({ title: 'First Officer', company: 'Emirates', description: 'Join our airline, Boeing 777 fleet.' }), 'keep');
  assert.strictEqual(verdict({ title: 'First Officer — Airbus A350', company: 'Agency' }), 'keep');
});
