'use strict';

/**
 * What the server makes of a scan.
 *
 * The model reads characters; this decides whether to believe them. Every
 * sector comes back with the values it will save, the derived block / airborne
 * / night, and a per-field verdict: 'ok', or a reason the pilot must look.
 * Nothing here writes anything — the review screen shows exactly this, and the
 * save step re-runs it so a hand-edited field is checked too.
 *
 * The crew's own TIME D/N/T columns are the best cross-check available: if our
 * block (IN − OUT) disagrees with their T, one of the two times was misread.
 * Where the form states night time and our sun calculation disagrees, the form
 * wins and both numbers are shown.
 */

const { resolveAirport } = require('./airportService');
const { nightMinutes, isNightLanding, toMinutes } = require('./nightTime');
const { _internals } = require('./logbookSummary');

const LOW_CONFIDENCE = 0.8;
const BLOCK_TOLERANCE_MIN = 2;     // rounding on the form, not a misread
const NIGHT_TOLERANCE_MIN = 10;    // sunset at altitude vs on the ground
const MAX_AGE_DAYS = 60;

const hhmm = (mins) => (mins == null ? null : `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`);

// Minutes between two clock times, allowing one midnight crossing.
function span(fromHHMM, toHHMM) {
  const a = toMinutes(fromHHMM);
  const b = toMinutes(toHHMM);
  if (a == null || b == null) return null;
  return b >= a ? b - a : b + 1440 - a;
}

function parseFormDuration(v) {
  const m = String(v || '').trim().match(/^(\d{1,2})[:h ]?(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function daysBetween(a, b) {
  return Math.round((Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())
    - Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())) / 86400000);
}

// dd/mm/yyyy, yyyy-mm-dd, dd-mm-yy… → a UTC Date, or null.
function parseDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const year = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return new Date(Date.UTC(year, +m[2] - 1, +m[1]));
  }
  return null;
}

const flag = (level, message) => ({ level, message });

/**
 * @param {object} raw        what the extractor returned
 * @param {object} ctx        { pilot, now }
 * @returns {{header, sectors, issues}}
 */
async function validateScan(raw, { pilot = {}, now = new Date() } = {}) {
  const prefs = pilot.logbookPrefs || {};
  const staffNumber = String(pilot.staffNumber || prefs.staffNumber || '').trim();
  const conf = raw.confidence || {};

  const date = parseDate(raw.date);
  const headerFlags = {};
  if (!date) headerFlags.date = flag('amber', 'No date could be read.');
  else if (daysBetween(date, now) > 0) headerFlags.date = flag('red', 'That date is in the future.');
  else if (daysBetween(now, date) > MAX_AGE_DAYS) headerFlags.date = flag('amber', `That date is ${daysBetween(now, date)} days ago — check the year.`);
  else if ((conf.date ?? 1) < LOW_CONFIDENCE) headerFlags.date = flag('amber', 'The date was hard to read.');

  const registration = String(raw.registration || '').toUpperCase().trim() || null;
  const regRule = registration ? _internals.typeFromRegistration(registration) : null;
  let aircraftType = String(raw.aircraftType || '').toUpperCase().trim() || null;
  let typeInferred = false;
  if (!aircraftType && regRule) { aircraftType = regRule.type; typeInferred = true; }
  if (aircraftType && regRule && regRule.type !== aircraftType) {
    headerFlags.aircraftType = flag('amber', `${registration} is normally a ${regRule.type}.`);
  }
  if (registration && (conf.registration ?? 1) < LOW_CONFIDENCE) {
    headerFlags.registration = flag('amber', 'The registration was hard to read.');
  }

  // The pilot's own role: their staff number against the PF/PM columns decides
  // the sector; the flight-deck crew block decides the role for the whole page.
  let pilotRole = ['PIC', 'SIC'].includes(raw.pilotRole) ? raw.pilotRole : null;
  if (!pilotRole && pilot.role === 'CAPTAIN') pilotRole = 'PIC';
  if (!pilotRole && pilot.role === 'FIRST_OFFICER') pilotRole = 'SIC';

  const sectors = [];
  for (const s of (raw.sectors || [])) {
    const c = s.confidence || {};
    const flags = {};
    const sect = {
      flightNumber: String(s.flightNumber || '').trim() || null,
      from: String(s.from || '').toUpperCase().trim() || null,
      to: String(s.to || '').toUpperCase().trim() || null,
      out: s.out || null, off: s.off || null, on: s.on || null, in: s.in || null,
      std: s.std || null, sta: s.sta || null,
      landings: Number.isFinite(s.landings) ? s.landings : null,
      pfStaff: String(s.pfStaff || '').trim() || null,
      pmStaff: String(s.pmStaff || '').trim() || null,
      formDay: s.formDay || null, formNight: s.formNight || null, formTotal: s.formTotal || null,
    };

    // Airports must exist. A code we cannot resolve is a red flag, not a guess.
    const [a, b] = await Promise.all([resolveAirport(sect.from), resolveAirport(sect.to)]);
    if (!sect.from || !a) flags.from = flag('red', sect.from ? `${sect.from} is not an airport we know.` : 'No departure airport.');
    if (!sect.to || !b) flags.to = flag('red', sect.to ? `${sect.to} is not an airport we know.` : 'No arrival airport.');
    if (a && b && sect.from === sect.to) flags.to = flag('amber', 'Departure and arrival are the same.');

    // Times must run OUT → OFF → ON → IN, allowing one midnight crossing.
    for (const k of ['out', 'off', 'on', 'in']) {
      if (!sect[k]) flags[k] = flag('amber', `No ${k.toUpperCase()} time was read.`);
      else if ((c[k] ?? 1) < LOW_CONFIDENCE) flags[k] = flag('amber', 'Hard to read — check against the photo.');
    }
    const block = span(sect.out, sect.in);
    const airborne = span(sect.off, sect.on);
    const taxiOut = span(sect.out, sect.off);
    const taxiIn = span(sect.on, sect.in);
    if (block != null && (block === 0 || block > 20 * 60)) flags.in = flag('red', 'Block time does not look right.');
    if (airborne != null && block != null && airborne > block) flags.off = flag('red', 'Airborne time is longer than block time.');
    if (taxiOut != null && taxiOut > 180) flags.off = flag('amber', 'Over 3 hours between OUT and OFF.');
    if (taxiIn != null && taxiIn < 1) flags.in = flag('amber', 'ON and IN are the same minute.');

    // The form's own total is the strongest check we have.
    const formTotal = parseFormDuration(sect.formTotal);
    if (formTotal != null && block != null && Math.abs(formTotal - block) > BLOCK_TOLERANCE_MIN) {
      const msg = `Your times give ${hhmm(block)} block, the form says ${hhmm(formTotal)}.`;
      flags.out = flags.out || flag('amber', msg);
      flags.in = flags.in || flag('amber', msg);
    }

    // Night: calculated along the route, cross-checked against the form's N.
    const night = (date && sect.off && sect.on && a && b)
      ? await nightMinutes({ date, departure: sect.from, arrival: sect.to, off: sect.off, on: sect.on })
      : null;
    const formNight = parseFormDuration(sect.formNight);
    let nightUsed = night ? night.minutes : null;
    let nightSource = night ? 'calculated' : null;
    if (formNight != null) {
      if (nightUsed == null || Math.abs(formNight - nightUsed) > NIGHT_TOLERANCE_MIN) {
        flags.night = flag('amber', nightUsed == null
          ? `Taken from the form (${hhmm(formNight)}).`
          : `The form says ${hhmm(formNight)} night, the sun says ${hhmm(nightUsed)}. Using the form.`);
      }
      nightUsed = formNight;           // the crew's own figure wins
      nightSource = 'form';
    }

    // Landings: the pilot flying gets them. Their staff number settles who that was.
    let pilotFlying = typeof s.pilotFlying === 'boolean' ? s.pilotFlying : null;
    let pfSource = pilotFlying == null ? null : 'read';
    if (staffNumber && (sect.pfStaff || sect.pmStaff)) {
      if (sect.pfStaff && sect.pfStaff.includes(staffNumber)) { pilotFlying = true; pfSource = 'staff number'; }
      else if (sect.pmStaff && sect.pmStaff.includes(staffNumber)) { pilotFlying = false; pfSource = 'staff number'; }
    }
    if (pilotFlying == null) flags.pilotFlying = flag('amber', 'Who was flying is not marked.');

    const landings = sect.landings == null ? (pilotFlying ? 1 : 0) : sect.landings;
    const mine = pilotFlying === true ? landings : 0;
    const nightLanding = (date && sect.on && b) ? await isNightLanding({ date, arrival: sect.to, on: sect.on }) : null;

    sectors.push({
      ...sect,
      pilotFlying,
      pfSource,
      aircraftType,
      registration,
      typeInferred,
      block, airborne, taxiOut, taxiIn,
      blockHHMM: hhmm(block), airborneHHMM: hhmm(airborne),
      night: nightUsed, nightHHMM: hhmm(nightUsed), nightSource,
      nightCalculated: night ? night.minutes : null,
      nightFromForm: formNight,
      landings,
      myLandings: mine,
      landingsDay: nightLanding ? 0 : mine,
      landingsNight: nightLanding ? mine : 0,
      nightLanding,
      flags,
      needsCheck: Object.keys(flags).length > 0,
    });
  }

  const issues = sectors.reduce((n, s) => n + Object.keys(s.flags).length, 0) + Object.keys(headerFlags).length;
  return {
    header: {
      date: date ? date.toISOString().slice(0, 10) : null,
      aircraftType, registration, typeInferred,
      commander: String(raw.commander || '').trim() || null,
      firstOfficer: String(raw.firstOfficer || '').trim() || null,
      pilotRole,
      pageOrientation: raw.pageOrientation || 'upright',
      totals: raw.totals || null,
      flags: headerFlags,
    },
    sectors,
    issues,
  };
}

module.exports = { validateScan, span, parseFormDuration, parseDate, hhmm, LOW_CONFIDENCE, MAX_AGE_DAYS };
