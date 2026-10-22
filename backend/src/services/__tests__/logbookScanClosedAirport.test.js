'use strict';

// The closed-airport branch, kept covered with a stub: no airport in the public
// dataset carries both a closed status and an IATA code, and the one override
// we have (ALY) is open. The branch still matters — a future override or an
// upstream change can bring a closed field back.

const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const origLoad = Module._load;
Module._load = function (request) {
  if (request.endsWith('airportService')) {
    return {
      resolveAirport: async (code) => {
        const c = String(code || '').toUpperCase();
        if (c === 'ZZZ') return { icao: 'ZZZZ', iata: 'ZZZ', name: 'Old Field', lat: 30, lon: 31, closed: true };
        if (!c) return null;
        return { icao: `${c}X`, iata: c, name: c, lat: 30, lon: 31, closed: false };
      },
      load: async () => new Map(),
    };
  }
  return origLoad.apply(this, arguments);
};
const { validateScan } = require('../voyageValidate');
Module._load = origLoad;

const RAW = () => ({
  date: '2026-10-04', registration: 'SU-BVM', aircraftType: 'A320', commander: 'X', firstOfficer: 'Y',
  pilotRole: 'UNKNOWN', pageOrientation: 'upright', totals: {},
  sectors: [{
    flightNumber: 'MSC 1', from: 'CAI', to: 'ZZZ', out: '07:26', off: '07:39', on: '11:47', in: '11:53',
    landings: 1, pilotFlying: true, formDay: '04:27', formNight: '', formTotal: '04:27', confidence: {},
  }],
  confidence: {},
});
const FO = { id: 'p1', role: 'FIRST_OFFICER', staffNumber: '3074', logbookPrefs: {} };

test('a closed airport is asked about, and never refused', async () => {
  const r = await validateScan(RAW(), { pilot: FO, now: new Date('2026-10-05T00:00:00Z') });
  const s0 = r.sectors[0];
  assert.notEqual(s0.flags.to && s0.flags.to.level, 'red', 'closed is not a refusal');
  const q = (s0.questions || []).find((x) => x.id === 'to-closed');
  assert.ok(q, 'the pilot is asked to confirm it');
  assert.match(q.title, /Is ZZZ right\?/);
  assert.match(q.body, /closed/i);
  assert.deepEqual(q.actions.map((a) => a.id), ['confirm', 'edit']);
});

test('an open airport asks nothing', async () => {
  const raw = RAW();
  raw.sectors[0].to = 'JED';
  const r = await validateScan(raw, { pilot: FO, now: new Date('2026-10-05T00:00:00Z') });
  assert.equal((r.sectors[0].questions || []).filter((q) => q.field === 'to').length, 0);
});
