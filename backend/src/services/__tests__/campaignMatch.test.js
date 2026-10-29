'use strict';

// A standing recruitment campaign is not a vacancy, and every surface that
// matches jobs has to agree about that. It once returned `null`, which took
// out GET /jobs for every signed-in pilot: the controller's own fit-group
// tally read match.fitGroup and threw.

const test = require('node:test');
const assert = require('node:assert');

const { matchJob, CAMPAIGN_MATCH, contextFromPilot } = require('../jobMatch');

// The same shape the matcher's own tests use: a current aeroplane ATPL
// holder. Hand-rolling a thinner one fails inside the matcher for reasons
// that have nothing to do with campaigns.
const CTX = contextFromPilot({
  certificates: [
    { type: 'ATPL', issuingAuthority: 'EASA', category: 'aeroplane' },
    { type: 'ELP', issuingAuthority: 'EASA', englishLevel: '5' },
  ],
  ratings: [{ aircraftType: 'A320', category: 'aeroplane' }],
  medicals: [{ medicalClass: 'CLASS_1', expiryDate: '2999-01-01T00:00:00Z' }],
  rightToWork: [],
  instructorRatings: [],
  education: 'bachelor',
  role: null,
  willingToRelocate: false,
  country: null,
  nationality: null,
}, { totalTime: 2000, picTime: 800, sicTime: 0 });

const campaign = (over = {}) => ({
  id: 'c1', title: 'Pilot recruitment (general)', company: 'Emirates',
  isCampaign: true, ...over,
});

test('a campaign always matches to the campaign shape', () => {
  const m = matchJob(campaign(), CTX);
  assert.strictEqual(m.fitGroup, 'campaign');
  assert.strictEqual(m.status, 'CAMPAIGN');
  assert.strictEqual(m.pct, null, 'no percentage: there is nothing to be a percentage of');
});

test('and never reads as a job the pilot qualifies for', () => {
  assert.notStrictEqual(matchJob(campaign(), CTX).status, 'QUALIFY');
  // Even carrying requirements a pilot would meet.
  const withReqs = campaign({ reqMinTotalHours: 100, reqCertificates: ['ATPL'] });
  assert.strictEqual(matchJob(withReqs, CTX).fitGroup, 'campaign');
});

test('the shape is never null, and carries every field a client reads', () => {
  const m = matchJob(campaign(), CTX);
  assert.ok(m, 'null here crashed GET /jobs for every signed-in pilot');
  for (const k of ['requirements', 'unmetKeys', 'unknownKeys']) {
    assert.ok(Array.isArray(m[k]), `${k} must be an array, not undefined`);
  }
  assert.strictEqual(m, CAMPAIGN_MATCH, 'one frozen object for every caller');
});

test('a row without the flag is matched normally', () => {
  // isCampaign is a select away from being absent; absent must mean "vacancy".
  const m = matchJob({ id: 'j1', title: 'First Officer A320', company: 'Emirates' }, CTX);
  assert.notStrictEqual(m.fitGroup, 'campaign');
});
