'use strict';

/**
 * Night time for a sector, calculated — never typed.
 *
 * Definition: night is the time between the end of evening civil twilight and
 * the beginning of morning civil twilight (sun centre 6° below the horizon),
 * which is what EASA FCL.010 and the usual airline logbook mean by night.
 *
 * The aeroplane moves, so the sun's elevation is evaluated along the great
 * circle between the two airports, minute by minute, between OFF and ON. A
 * sector that departs in daylight and lands after dusk therefore gets the real
 * split, not an airport-only approximation.
 *
 * Coordinates come from airportService (OurAirports, worldwide). If either end
 * cannot be resolved the answer is null — "unknown", never a guessed zero, so
 * the caller can show the field as needing a look.
 */

const { resolveAirport } = require('./airportService');

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const CIVIL_TWILIGHT_DEG = -6;

// ── Solar elevation (NOAA low-precision equations, ±0.01° — far finer than the
// minute resolution we sample at). `when` is a UTC Date.
function solarElevation(lat, lon, when) {
  const jd = when.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;                       // days from J2000.0
  const L = (280.460 + 0.9856474 * n) % 360;      // mean longitude
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD; // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const epsilon = (23.439 - 0.0000004 * n) * RAD; // obliquity
  const decl = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) * DEG;
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;   // hours
  const lst = (gmst * 15 + lon + 360) % 360;                   // degrees
  const ha = (((lst - ra + 540) % 360) - 180) * RAD;           // hour angle, −180..180
  const phi = lat * RAD;
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) * DEG;
}

// Great-circle interpolation; f = 0 at A, 1 at B.
function interpolate(a, b, f) {
  const [lat1, lon1, lat2, lon2] = [a.lat * RAD, a.lon * RAD, b.lat * RAD, b.lon * RAD];
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
  ));
  if (!d) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  return { lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * DEG, lon: Math.atan2(y, x) * DEG };
}

// "HHMM" / "HH:MM" → minutes since midnight, or null.
function toMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// A sector's clock times are wall-clock UTC on `date`; a leg that lands "before"
// it departed crossed midnight, so the arrival belongs to the next day.
function utcWindow(date, startHHMM, endHHMM) {
  const start = toMinutes(startHHMM);
  const end = toMinutes(endHHMM);
  if (start == null || end == null) return null;
  const base = new Date(date);
  if (Number.isNaN(base.getTime())) return null;
  const day = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  const from = day + start * 60000;
  const to = day + (end >= start ? end : end + 1440) * 60000;
  return { from: new Date(from), to: new Date(to) };
}

/**
 * Night minutes between OFF and ON.
 * @returns {{minutes:number, hours:number, resolved:true} | null}
 */
async function nightMinutes({ date, departure, arrival, off, on }) {
  const window = utcWindow(date, off, on);
  if (!window) return null;
  const [a, b] = await Promise.all([resolveAirport(departure), resolveAirport(arrival)]);
  if (!a || !b || a.lat == null || b.lat == null) return null;

  const total = Math.round((window.to - window.from) / 60000);
  if (total <= 0) return { minutes: 0, hours: 0, resolved: true };

  // Sample at the midpoint of every minute: a minute counts as night if the sun
  // is below civil twilight at the aircraft's position halfway through it.
  let night = 0;
  for (let i = 0; i < total; i++) {
    const f = total === 1 ? 0.5 : (i + 0.5) / total;
    const pos = interpolate(a, b, f);
    const at = new Date(window.from.getTime() + (i + 0.5) * 60000);
    if (solarElevation(pos.lat, pos.lon, at) < CIVIL_TWILIGHT_DEG) night++;
  }
  return { minutes: night, hours: Math.round((night / 60) * 100) / 100, resolved: true };
}

// A landing is a night landing when the sun is below civil twilight at the
// arrival airport at the ON time.
async function isNightLanding({ date, arrival, on }) {
  const window = utcWindow(date, on, on);
  if (!window) return null;
  const b = await resolveAirport(arrival);
  if (!b || b.lat == null) return null;
  return solarElevation(b.lat, b.lon, window.from) < CIVIL_TWILIGHT_DEG;
}

module.exports = { nightMinutes, isNightLanding, solarElevation, toMinutes, utcWindow, CIVIL_TWILIGHT_DEG };
