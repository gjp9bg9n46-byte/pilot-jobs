// Logbook durations, written the way the pilot asked for them.
//
// hh:mm is what a voyage report and most airline logbooks use; decimal is what
// an application form asks for. The choice is stored per pilot, so both
// platforms show the same thing — these helpers are the only place it is applied.

export function hoursToHHMM(hours) {
  const total = Math.round((Number(hours) || 0) * 60);
  const sign = total < 0 ? '-' : '';
  const abs = Math.abs(total);
  return `${sign}${Math.floor(abs / 60).toLocaleString()}:${String(abs % 60).padStart(2, '0')}`;
}

export function minutesToHHMM(minutes) {
  if (minutes == null) return '—';
  return hoursToHHMM(minutes / 60);
}

export function hoursToDecimal(hours) {
  return (Number(hours) || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// One entry point: format a duration in hours per the pilot's setting.
export function duration(hours, format) {
  return format === 'decimal' ? hoursToDecimal(hours) : hoursToHHMM(hours);
}

// "HHMM" / "HH:MM" → minutes, mirroring the server's parser.
export function timeToMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

// Block/airborne as the server derives them: one midnight crossing allowed.
export function spanMinutes(from, to) {
  const a = timeToMinutes(from);
  const b = timeToMinutes(to);
  if (a == null || b == null) return null;
  return b >= a ? b - a : b + 1440 - a;
}

const DAY_FMT = { weekday: 'short', day: 'numeric', month: 'short' };
const DAY_FMT_OTHER_YEAR = { ...DAY_FMT, year: 'numeric' };

// A day header without a year reads as "this year" — which is how a flight
// saved with a misread year (2024 for 2026) can sit in a logbook looking
// perfectly ordinary while being two years out of place. Show the year whenever
// it is not the current one.
export function dayLabel(date, now = new Date()) {
  const d = new Date(`${date}T00:00:00Z`);
  const fmt = d.getUTCFullYear() === now.getUTCFullYear() ? DAY_FMT : DAY_FMT_OTHER_YEAR;
  return d.toLocaleDateString('en-GB', { ...fmt, timeZone: 'UTC' });
}

// Sectors grouped by the day they were flown, newest first — a CAI–HRG–CAI
// rotation reads as one block, as on the mockup.
export function groupByDay(logs) {
  const days = new Map();
  for (const log of logs) {
    const key = String(log.date).slice(0, 10);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(log);
  }
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, flights]) => ({
      date,
      label: dayLabel(date),
      hours: flights.reduce((n, f) => n + (Number(f.totalTime) || 0), 0),
      // Newest first inside the day too, so the whole list reads in one
      // direction and matches the order the server pages in.
      flights: [...flights].sort((a, b) => String(b.offBlocksTime || '').localeCompare(String(a.offBlocksTime || ''))),
    }));
}

// "Oldest drops 2 Dec" — the day the 90-day window loses the third landing,
// which is the day currency lapses.
export function dropOffLabel(currentUntil) {
  if (!currentUntil) return null;
  return new Date(`${currentUntil}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// A sector's date is the UTC date it pushed back — OUT. A leg that lands after
// midnight is still one flight on one date; it is never split across days, and
// the arrival is marked "+1" instead.
export function landsNextDay(out, inn) {
  const a = timeToMinutes(out);
  const b = timeToMinutes(inn);
  if (a == null || b == null) return false;
  return b < a;
}

// "Return of overnight trip from 14 Oct": the leg before this one left on a
// different date, landed where this one starts, and did so within 12 hours.
export function overnightReturnOf(flight, all) {
  if (!flight || !flight.departure) return null;
  const date = String(flight.date).slice(0, 10);
  const out = timeToMinutes(flight.offBlocksTime);
  if (out == null) return null;
  const mine = Date.parse(`${date}T00:00:00Z`) + out * 60000;
  let best = null;
  for (const other of all || []) {
    if (other === flight || other.id === flight.id) continue;
    if (String(other.arrival || '').toUpperCase() !== String(flight.departure).toUpperCase()) continue;
    const otherDate = String(other.date).slice(0, 10);
    if (otherDate === date) continue;                       // same day is just the next sector
    const otherOut = timeToMinutes(other.offBlocksTime);
    const otherIn = timeToMinutes(other.onBlocksTime);
    if (otherOut == null || otherIn == null) continue;
    const wrap = otherIn < otherOut ? 1440 : 0;
    const landed = Date.parse(`${otherDate}T00:00:00Z`) + (otherIn + wrap) * 60000;
    const gap = mine - landed;
    if (gap < 0 || gap > 12 * 3600 * 1000) continue;        // within twelve hours
    if (!best || landed > best.landed) best = { landed, date: otherDate };
  }
  if (!best) return null;
  return new Date(`${best.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
