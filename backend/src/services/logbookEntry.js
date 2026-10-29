'use strict';

/**
 * One flight, built from what the pilot actually types.
 *
 * Block, airborne and night are DERIVED here and nowhere else — the forms on
 * web and app send out/off/on/in and never a duration, so the two platforms
 * cannot disagree and a typo in a total is impossible. Role decides whether the
 * block counts as PIC or SIC: the preset on the profile ("Airline Captain" /
 * "Airline First Officer") is the default, and a single flight can override it.
 */

const { nightMinutes, isNightLanding, toMinutes } = require('./nightTime');

// A reader — ours or a person's — writing the WORD "null" does not mean the
// aeroplane was a NULL. These strings all mean "nothing was there", and one of
// them reached the logbook as an aircraft type and then into the remembered
// values, so every new flight offered "NULL" as its aircraft.
const NOTHING = new Set(['null', 'undefined', 'nil', 'none', 'n/a', 'na', '-', '--', '?', 'unknown']);
function cleanField(v) {
  const t = String(v ?? '').trim();
  return NOTHING.has(t.toLowerCase()) ? '' : t;
}

const ROLE_PRESETS = {
  airline_fo: { label: 'Airline First Officer', role: 'SIC' },
  airline_captain: { label: 'Airline Captain', role: 'PIC' },
};

function presetFor(pilot) {
  const prefs = (pilot && pilot.logbookPrefs) || {};
  if (prefs.rolePreset && ROLE_PRESETS[prefs.rolePreset]) return prefs.rolePreset;
  return pilot && pilot.role === 'CAPTAIN' ? 'airline_captain' : 'airline_fo';
}

function spanMinutes(from, to) {
  const a = toMinutes(from);
  const b = toMinutes(to);
  if (a == null || b == null) return null;
  return b >= a ? b - a : b + 1440 - a;   // one midnight crossing
}

/**
 * @param {object} input  date, flightNumber, from/departure, to/arrival, aircraftType,
 *                        registration, out/off/on/in, pilotFlying, landings, commander,
 *                        approach, remarks, role ('PIC'|'SIC'), plus any raw hour columns
 * @param {object} pilot  the pilot row (role, logbookPrefs)
 */
async function buildFlightRow(input, pilot) {
  const departure = String(input.departure || input.from || '').toUpperCase().trim() || null;
  const arrival = String(input.arrival || input.to || '').toUpperCase().trim() || null;
  const out = input.offBlocksTime || input.out || null;
  const off = input.takeoffTime || input.off || null;
  const on = input.landingTime || input.on || null;
  const inn = input.onBlocksTime || input.in || null;
  const date = input.date ? new Date(input.date) : null;

  const blockMin = spanMinutes(out, inn);
  const airborneMin = spanMinutes(off, on);
  const hours = blockMin != null ? Math.round((blockMin / 60) * 100) / 100 : Number(input.totalTime) || 0;

  // Night comes from the sun along the route — unless the crew's own N column
  // gave a figure, in which case that stands. It survives an edit to any other
  // field, including the date: the sun moves between years, what the crew wrote
  // does not.
  // Unknown is not zero. When the crew wrote nothing and the sun cannot be
  // worked out — an airport code we cannot resolve has no coordinates — night
  // is stored as null and shown as "—", rather than asserting "no night".
  // Starts unknown. A flight entered as a block time alone — no OFF, no ON,
  // no route — gives nothing to work from, and "0 hours of night" is a claim
  // about the flight that nobody made.
  let nightHours = null;
  let nightSource = null;
  if (Number.isFinite(Number(input.nightOverrideMinutes))) {
    nightHours = Math.round((Number(input.nightOverrideMinutes) / 60) * 100) / 100;
    nightSource = 'form';
  } else if (input.nightSource !== 'calculated' && input.nightTime !== '' && input.nightTime != null && Number.isFinite(Number(input.nightTime))) {
    // A figure the pilot typed. It used to count only when the client also sent
    // nightSource: 'form', which the web form never did — so every night time
    // typed on the web was dropped. A row we worked out ourselves still says
    // 'calculated' and is still recalculated, date change and all.
    nightHours = Number(input.nightTime);
    nightSource = 'form';
  } else if (date && departure && arrival && off && on) {
    const n = await nightMinutes({ date, departure, arrival, off, on });
    if (n) { nightHours = n.hours; nightSource = 'calculated'; }
    else { nightHours = null; }   // no coordinates for one of the two codes
  }

  const role = input.role === 'PIC' || input.role === 'SIC' ? input.role : ROLE_PRESETS[presetFor(pilot)].role;
  const pilotFlying = typeof input.pilotFlying === 'boolean' ? input.pilotFlying : null;

  // Landings belong to whoever flew the sector. If the form says nothing, the
  // pilot flying gets one; a monitoring pilot gets none.
  let landings = Number.isFinite(Number(input.landings)) ? Number(input.landings) : null;
  if (landings == null) landings = pilotFlying === true ? 1 : 0;
  const night = (date && arrival && on) ? await isNightLanding({ date, arrival, on }) : false;

  return {
    date,
    flightNumber: input.flightNumber || null,
    aircraftType: cleanField(input.aircraftType).toUpperCase(),
    registration: String(input.registration || '').toUpperCase().trim() || null,
    departure,
    arrival,
    offBlocksTime: out, takeoffTime: off, landingTime: on, onBlocksTime: inn,
    picName: input.commander || input.picName || null,
    sicName: input.sicName || null,
    totalTime: hours,
    picTime: role === 'PIC' ? hours : 0,
    sicTime: role === 'SIC' ? hours : 0,
    nightTime: nightHours,
    nightSource,
    landingsDay: night ? 0 : landings,
    landingsNight: night ? landings : 0,
    // Typed by hand, or derived from who was flying: either way it is recorded.
    landingsRecorded: true,
    pilotFlying,
    approach: input.approach || null,
    remarks: input.remarks || null,
    _derived: {
      blockMinutes: blockMin,
      airborneMinutes: airborneMin,
      nightMinutes: nightHours == null ? null : Math.round(nightHours * 60),
      nightSource,
      role,
      nightLanding: night,
    },
  };
}

module.exports = {
  cleanField, buildFlightRow, spanMinutes, presetFor, ROLE_PRESETS };
