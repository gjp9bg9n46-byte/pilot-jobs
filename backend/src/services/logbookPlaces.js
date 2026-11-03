'use strict';
// ── Logbook Reports, phase 2: distance, places and patterns ─────────────────
//
// Everything here is derived from LOGGED FLIGHTS ONLY. Carry-forward hours are
// a number with no date, no route and no aircraft, so they cannot contribute a
// kilometre, an airport, a tail, a sunrise or a square on the calendar. Phase 1
// already excludes them from its time windows for the same reason; this file
// excludes them from everything it computes, and the payload reports how many
// flights each figure is actually based on.
//
// A flight whose airports we cannot resolve is SKIPPED and COUNTED. A distance
// that quietly drops a third of someone's flying is worse than one that says
// how much it left out.
//
// No new dependency: the sun along the route and the great-circle position are
// the ones services/nightTime.js already uses for night time.
const { resolveAirport } = require('./airportService');
const { solarElevation, interpolate, utcWindow } = require('./nightTime');

const EARTH_CIRCUMFERENCE_KM = 40075;
const MOON_DISTANCE_KM = 384400;
const EARTH_RADIUS_KM = 6371;
const RAD = Math.PI / 180;

// The sun's centre at −0.833° is sunrise/sunset proper: the half-diameter of
// the disc plus atmospheric refraction, which is the moment the limb touches
// the horizon. Night time uses −6° (civil twilight) and is a different
// question — "is it dark" rather than "did the sun come up".
const SUNRISE_DEG = -0.833;
// A sample every five minutes. A sunrise takes minutes to happen and a sector
// is hours long, so this finds every crossing without walking 517 logbooks a
// minute at a time.
const SUN_SAMPLE_MINUTES = 5;

const round1 = (n) => Math.round(n * 10) / 10;

/** Great-circle distance in km. */
function greatCircleKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The Moon line, in the wording we agreed.
 *   under 100%  → "60% of the way to the Moon"
 *   100–200%    → "to the Moon and 30% of the way back"
 *   over 200%   → "to the Moon and back, and 60% of the way there again"
 * The third case exists because the second has an end: past 200% a pilot has
 * been there and back, and "and 160% of the way back" means nothing.
 */
function moonPhrase(km) {
  const pct = (km / MOON_DISTANCE_KM) * 100;
  if (pct < 100) return `${Math.round(pct)}% of the way to the Moon`;
  if (pct <= 200) return `To the Moon and ${Math.round(pct - 100)}% of the way back`;
  return `To the Moon and back, and ${Math.round(pct - 200)}% of the way there again`;
}

/**
 * Sunrises and sunsets that happened while airborne, counted by walking the
 * great circle between the two airports across the block time and watching the
 * sun cross the horizon. Needs both block times and two resolvable airports;
 * a sector missing either is skipped and counted.
 */
function sunEvents(log, from, to) {
  const window = utcWindow(log.date, log.offBlocksTime, log.onBlocksTime);
  if (!window) return null;
  const ms = window.to - window.from;
  if (!(ms > 0)) return null;

  const steps = Math.max(2, Math.ceil(ms / (SUN_SAMPLE_MINUTES * 60000)));
  let sunrises = 0;
  let sunsets = 0;
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const pos = interpolate(from, to, f);
    const at = new Date(window.from.getTime() + f * ms);
    const up = solarElevation(pos.lat, pos.lon, at) >= SUNRISE_DEG;
    if (prev !== null && up !== prev) { if (up) sunrises += 1; else sunsets += 1; }
    prev = up;
  }
  return { sunrises, sunsets };
}

/** YYYY-MM-DD / YYYY-MM in UTC. */
const ymd = (d) => d.toISOString().slice(0, 10);
const ym = (d) => d.toISOString().slice(0, 7);

async function buildPlaces(logs, blockHours, now = new Date()) {
  const flights = logs || [];

  // Resolve every code once. 60-odd unique airports against a Map that is
  // already loaded, not 1,000 lookups.
  const codes = new Set();
  for (const l of flights) {
    if (l.departure) codes.add(String(l.departure).trim().toUpperCase());
    if (l.arrival) codes.add(String(l.arrival).trim().toUpperCase());
  }
  const resolved = new Map();
  for (const c of codes) {
    const a = await resolveAirport(c);
    if (a) resolved.set(c, a);
  }
  const at = (code) => resolved.get(String(code || '').trim().toUpperCase()) || null;

  let km = 0;
  let withAirports = 0;
  let withoutAirports = 0;
  let longest = null;
  let sunrises = 0;
  let sunsets = 0;
  let sunFlights = 0;
  const visits = new Map();     // code → times touched
  const routeMap = new Map();   // "A→B" → count
  const tails = new Map();      // registration → sectors
  const dayMap = new Map();     // YYYY-MM-DD → { hours, flights }
  const monthMap = new Map();   // YYYY-MM  → hours
  let nightHours = 0;
  let totalHours = 0;

  for (const l of flights) {
    const hours = blockHours(l);
    totalHours += hours;
    nightHours += Number(l.nightTime) || 0;

    const d = ymd(l.date);
    const day = dayMap.get(d) || { hours: 0, flights: 0 };
    day.hours += hours; day.flights += 1; dayMap.set(d, day);
    const m = ym(l.date);
    monthMap.set(m, (monthMap.get(m) || 0) + hours);

    if (l.registration) {
      const reg = String(l.registration).trim().toUpperCase();
      if (reg) tails.set(reg, (tails.get(reg) || 0) + 1);
    }

    const a = at(l.departure);
    const b = at(l.arrival);
    if (!a || !b) { withoutAirports += 1; continue; }
    withAirports += 1;

    const ca = String(l.departure).trim().toUpperCase();
    const cb = String(l.arrival).trim().toUpperCase();
    visits.set(ca, (visits.get(ca) || 0) + 1);
    visits.set(cb, (visits.get(cb) || 0) + 1);
    const key = `${ca}→${cb}`;
    routeMap.set(key, (routeMap.get(key) || 0) + 1);

    const legKm = greatCircleKm(a, b);
    km += legKm;
    if (!longest || legKm > longest.km) {
      longest = { from: ca, to: cb, fromName: a.name || null, toName: b.name || null, km: Math.round(legKm), date: ymd(l.date) };
    }

    const ev = sunEvents(l, a, b);
    if (ev) { sunrises += ev.sunrises; sunsets += ev.sunsets; sunFlights += 1; }
  }

  const countries = [...new Set([...visits.keys()].map((c) => at(c)?.country).filter(Boolean))].sort();

  const airports = [...visits.entries()]
    .map(([code, count]) => {
      const a = at(code);
      return { code, visits: count, name: a?.name || null, city: a?.city || null, country: a?.country || null, lat: a?.lat, lon: a?.lon };
    })
    .sort((x, y) => y.visits - x.visits || x.code.localeCompare(y.code));

  const routes = [...routeMap.entries()].map(([key, count]) => {
    const [f, t] = key.split('→');
    const a = at(f); const b = at(t);
    return { from: f, to: t, count, fromLat: a?.lat, fromLon: a?.lon, toLat: b?.lat, toLon: b?.lon };
  }).sort((x, y) => y.count - x.count);

  // Heatmap: the last twelve calendar months of flying days, as [date, hours].
  const since = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1);
  const days = [...dayMap.entries()]
    .filter(([d]) => new Date(`${d}T00:00:00Z`).getTime() >= since)
    .map(([date, v]) => ({ date, hours: round1(v.hours), flights: v.flights }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // Busiest month across the WHOLE logbook, not just the heatmap window — it
  // is a career fact, and hiding it because it fell thirteen months ago would
  // be odd.
  let busiest = null;
  for (const [key, hours] of monthMap) {
    if (!busiest || hours > busiest.hours) busiest = { month: key, hours: round1(hours) };
  }

  return {
    basis: { flightCount: flights.length, withAirports, withoutAirports },
    distance: {
      km: Math.round(km),
      earthLaps: Math.round((km / EARTH_CIRCUMFERENCE_KM) * 10) / 10,
      moonPercent: Math.round((km / MOON_DISTANCE_KM) * 1000) / 10,
      moonPhrase: moonPhrase(km),
      longest,
    },
    places: {
      airportCount: airports.length,
      countryCount: countries.length,
      countries,
      airports: airports.slice(0, 60),
      routes: routes.slice(0, 400),
    },
    tails: [...tails.entries()]
      .map(([registration, sectors]) => ({ registration, sectors }))
      .sort((a, b) => b.sectors - a.sectors || a.registration.localeCompare(b.registration))
      .slice(0, 5),
    sun: { sunrises, sunsets, flightsCounted: sunFlights, flightsSkipped: flights.length - sunFlights },
    activity: { days, daysFlown: dayMap.size, busiestMonth: busiest },
    night: {
      nightHours: round1(nightHours),
      totalHours: round1(totalHours),
      percent: totalHours > 0 ? Math.round((nightHours / totalHours) * 100) : null,
    },
  };
}

module.exports = {
  buildPlaces,
  // exported for tests — all pure
  greatCircleKm,
  moonPhrase,
  sunEvents,
  EARTH_CIRCUMFERENCE_KM,
  MOON_DISTANCE_KM,
  SUNRISE_DEG,
};
