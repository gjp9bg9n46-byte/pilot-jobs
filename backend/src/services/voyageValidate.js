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
async function validateScan(raw, { pilot = {}, now = new Date(), uncertain = null } = {}) {
  const prefs = pilot.logbookPrefs || {};
  const staffNumber = String(pilot.staffNumber || prefs.staffNumber || '').trim();
  const conf = raw.confidence || {};
  // Fields the two readings of the page disagreed about. The model is not
  // deterministic on handwriting, so a disagreement is the clearest possible
  // signal that a human should look — stronger than its own confidence score.
  const shaky = (uncertain && uncertain.sectors) || {};
  const shakyHeader = new Set((uncertain && uncertain.header) || []);

  const date = parseDate(raw.date);
  const headerFlags = {};

  // The form is always dd/mm/yyyy, and the year is handwritten. When a date
  // cannot be right, the three things that actually happen are: the year was
  // misread, the day and month were swapped, or both. Offer the most plausible
  // reading rather than only saying "that looks wrong".
  const plausible = (d) => d && daysBetween(d, now) <= 0 && daysBetween(now, d) <= MAX_AGE_DAYS;
  const candidates = [];
  if (date) {
    const day = date.getUTCDate();
    const month = date.getUTCMonth();
    // The three ways a handwritten dd/mm/yyyy actually goes wrong: the year is
    // misread, the day's two digits are transposed (12 read as 21), or the day
    // and month are swapped.
    const reversed = Number(String(day).padStart(2, '0').split('').reverse().join(''));
    const days = [day, ...(reversed >= 1 && reversed <= 31 && reversed !== day ? [reversed] : [])];
    for (const y of [date.getUTCFullYear(), now.getUTCFullYear(), now.getUTCFullYear() - 1]) {
      for (const d of days) {
        candidates.push(new Date(Date.UTC(y, month, d)));
        if (d <= 12) candidates.push(new Date(Date.UTC(y, d - 1, month + 1)));   // day/month swapped
      }
    }
  }
  const better = candidates.filter((d) => plausible(d) && d.getTime() !== (date ? date.getTime() : 0))
    .sort((a, b) => daysBetween(now, a) - daysBetween(now, b))[0] || null;
  let dateSuggestion = null;

  if (!date) headerFlags.date = flag('amber', 'No date could be read.');
  else if (daysBetween(date, now) > 0) {
    dateSuggestion = better ? better.toISOString().slice(0, 10) : null;
    headerFlags.date = flag('red', dateSuggestion
      ? `That date is in the future — did you mean ${dateSuggestion}?`
      : 'That date is in the future.');
  } else if (daysBetween(now, date) > MAX_AGE_DAYS) {
    dateSuggestion = better ? better.toISOString().slice(0, 10) : null;
    headerFlags.date = flag('amber', dateSuggestion
      ? `Read as ${date.toISOString().slice(0, 10)} — did you mean ${dateSuggestion}?`
      : `That date is ${daysBetween(now, date)} days ago — check the year.`);
  } else if ((conf.date ?? 1) < LOW_CONFIDENCE) headerFlags.date = flag('amber', 'The date was hard to read.');

  const registration = String(raw.registration || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').trim() || null;
  const regRule = registration ? _internals.typeFromRegistration(registration) : null;
  let aircraftType = String(raw.aircraftType || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').trim() || null;
  let typeInferred = false;
  if (!aircraftType && regRule) { aircraftType = regRule.type; typeInferred = true; }
  if (aircraftType && regRule && regRule.type !== aircraftType) {
    headerFlags.aircraftType = flag('amber', `${registration} is normally a ${regRule.type}.`);
  }
  if (registration && (conf.registration ?? 1) < LOW_CONFIDENCE) {
    headerFlags.registration = flag('amber', 'The registration was hard to read.');
  }
  for (const f of shakyHeader) {
    if (f === 'sectorCount') headerFlags.sectors = flag('amber', 'The two readings of this page found a different number of sectors.');
    else if (!headerFlags[f]) headerFlags[f] = flag('amber', 'The page read differently the second time — check this.');
  }

  // The pilot's own role: their staff number against the PF/PM columns decides
  // the sector; the flight-deck crew block decides the role for the whole page.
  let pilotRole = ['PIC', 'SIC'].includes(raw.pilotRole) ? raw.pilotRole : null;
  if (!pilotRole && pilot.role === 'CAPTAIN') pilotRole = 'PIC';
  if (!pilotRole && pilot.role === 'FIRST_OFFICER') pilotRole = 'SIC';

  const sectors = [];
  for (const [sectorIndex, s] of (raw.sectors || []).entries()) {
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
      // Where this row sits on the stored page, so the review screen can show
      // the pilot the strip of paper a flagged value came from.
      rowBox: s.rowBoxUpright || s.rowBox || null,
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

    // Anything the two readings differed on.
    for (const f of (shaky[sectorIndex] || [])) {
      if (!flags[f]) flags[f] = flag('amber', 'The two readings of this page differ here — check it against the photo.');
    }

    // The lower table repeats FROM and TO. Read separately, it is an
    // independent witness to the route; disagreement means one of them is wrong.
    const lowerFrom = String(s.lowerFrom || '').toUpperCase().trim();
    const lowerTo = String(s.lowerTo || '').toUpperCase().trim();
    if (lowerFrom && sect.from && lowerFrom !== sect.from && !flags.from) {
      flags.from = flag('amber', `The lower table says ${lowerFrom} here.`);
    }
    if (lowerTo && sect.to && lowerTo !== sect.to && !flags.to) {
      flags.to = flag('amber', `The lower table says ${lowerTo} here.`);
    }

    // A departure long after its scheduled time is possible, but on this form
    // it is more often a misread hour.
    const sched = span(sect.std, sect.out);
    if (sect.std && sect.out && sched != null && sched > 90 && sched < 1200 && !flags.out) {
      flags.out = flag('amber', `OUT is ${hhmm(sched)} after the scheduled ${sect.std} — check the hour.`);
    }

    // The form's own total is the strongest check we have.
    const formTotal = parseFormDuration(sect.formTotal);
    if (formTotal != null && block != null && Math.abs(formTotal - block) > BLOCK_TOLERANCE_MIN) {
      const msg = `Your times give ${hhmm(block)} block, the form says ${hhmm(formTotal)}.`;
      flags.out = flags.out || flag('amber', msg);
      flags.in = flags.in || flag('amber', msg);
    }

    // Night: calculated along the route, cross-checked against the form's N.
    // The window is OUT→IN, not OFF→ON: night counts over flight (block) time,
    // which is what the crew's own N column records and what a logbook credits.
    const night = (date && sect.out && sect.in && a && b)
      ? await nightMinutes({ date, departure: sect.from, arrival: sect.to, off: sect.out, on: sect.in })
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
    let staffMatched = false;
    if (staffNumber && (sect.pfStaff || sect.pmStaff)) {
      if (sect.pfStaff && sect.pfStaff.includes(staffNumber)) { pilotFlying = true; pfSource = 'staff number'; staffMatched = true; }
      else if (sect.pmStaff && sect.pmStaff.includes(staffNumber)) { pilotFlying = false; pfSource = 'staff number'; staffMatched = true; }
    }
    if (pilotFlying == null) {
      flags.pilotFlying = flag('amber', 'Who was flying is not marked.');
    } else if (staffNumber && !staffMatched) {
      // The staff numbers were read but none of them is this pilot's, so the
      // only thing left deciding who flew — and therefore who gets the landing
      // — is the model's guess. Measured: the guess flipped between two runs of
      // the same photo, and the staff column said 3574 where the pilot is 3074.
      flags.pilotFlying = flag('amber', `Your staff number ${staffNumber} is not in the PF or PM column here — check who was flying.`);
    } else if (staffMatched && ((shaky[sectorIndex] || []).includes('pfStaff') || (shaky[sectorIndex] || []).includes('pmStaff'))) {
      // The two readings put different numbers in those columns, so the match
      // that decided this is only as good as one of them.
      flags.pilotFlying = flag('amber', 'The PF / PM staff numbers read differently the second time — check who was flying.');
    }

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

  // The TOTAL row at the foot of the upper table is one more independent
  // number: if the sector totals do not add up to it, one of them was misread.
  const pageTotal = parseFormDuration(raw.totals && raw.totals.total);
  const sumOfT = sectors.reduce((n, x) => n + (parseFormDuration(x.formTotal) ?? 0), 0);
  if (pageTotal != null && sumOfT > 0 && Math.abs(pageTotal - sumOfT) > BLOCK_TOLERANCE_MIN) {
    headerFlags.totals = flag('amber', `The sector totals come to ${hhmm(sumOfT)}, the page total says ${hhmm(pageTotal)}.`);
    for (const x of sectors) {
      if (!x.flags.out) x.flags.out = flag('amber', 'The page total does not match the sectors — check this row.');
      x.needsCheck = true;
    }
  }

  const issues = sectors.reduce((n, s) => n + Object.keys(s.flags).length, 0) + Object.keys(headerFlags).length;
  return {
    header: {
      date: date ? date.toISOString().slice(0, 10) : null,
      dateSuggestion,   // already yyyy-mm-dd
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
