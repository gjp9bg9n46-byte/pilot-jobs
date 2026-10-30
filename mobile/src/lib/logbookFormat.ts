// Durations written the way the pilot asked for them — the app's half of
// frontend/src/lib/logbookFormat.js. hh:mm is what a voyage report uses;
// decimal is what an application form asks for. The choice lives on the
// profile, so web and app always agree.

export type TimeFormat = 'hhmm' | 'decimal';

export function hoursToHHMM(hours: number): string {
  const total = Math.round((Number(hours) || 0) * 60);
  const sign = total < 0 ? '-' : '';
  const abs = Math.abs(total);
  return `${sign}${Math.floor(abs / 60).toLocaleString('en-GB')}:${String(abs % 60).padStart(2, '0')}`;
}

export function minutesToHHMM(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  return hoursToHHMM(minutes / 60);
}

export function duration(hours: number, format: TimeFormat = 'hhmm'): string {
  return format === 'decimal'
    ? (Number(hours) || 0).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : hoursToHHMM(hours);
}

export function timeToMinutes(hhmm: string | null | undefined): number | null {
  const m = String(hhmm || '').match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

// Block / airborne as the server derives them: one midnight crossing allowed.
export function spanMinutes(from?: string | null, to?: string | null): number | null {
  const a = timeToMinutes(from);
  const b = timeToMinutes(to);
  if (a == null || b == null) return null;
  return b >= a ? b - a : b + 1440 - a;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Log = any;

export type Day = { date: string; label: string; hours: number; flights: Log[] };

// A day header without a year reads as "this year" — which is how a flight
// saved with a misread year (2024 for 2026) can sit in a logbook looking
// perfectly ordinary while being two years out of place.
export function dayLabel(date: string, now: Date = new Date()): string {
  const d = new Date(`${date}T00:00:00Z`);
  const year = d.getUTCFullYear() === now.getUTCFullYear() ? undefined : 'numeric';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year, timeZone: 'UTC' } as Intl.DateTimeFormatOptions);
}

// Sectors grouped by the day they were flown, newest first, so a CAI–HRG–CAI
// rotation reads as one block.
export function groupByDay(logs: Log[]): Day[] {
  const days = new Map<string, Log[]>();
  for (const log of logs || []) {
    const key = String(log.date).slice(0, 10);
    if (!days.has(key)) days.set(key, []);
    (days.get(key) as Log[]).push(log);
  }
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, flights]) => ({
      date,
      label: dayLabel(date),
      hours: flights.reduce((n: number, f: Log) => n + (Number(f.totalTime) || 0), 0),
      // Newest first inside the day too, matching the order the server pages in.
      flights: [...flights].sort((a, b) => String(b.offBlocksTime || '').localeCompare(String(a.offBlocksTime || ''))),
    }));
}

// ── Grouping ─────────────────────────────────────────────────────────────────
// A logbook is read by month far more often than by day: "how much did I fly in
// October" is the everyday question, and a day group is one or two sectors.
// Month is the default; Day is a switch away for anyone checking a rotation.
export type Grouping = 'month' | 'day';

export function monthLabel(ym: string): string {
  // Always with the year: a logbook is read across years, and "October" alone
  // is how a misfiled 2024 flight hides in plain sight.
  const d = new Date(`${ym}-01T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Sectors grouped by calendar month, newest first, with the month's total.
export function groupByMonth(logs: Log[]): Day[] {
  const months = new Map<string, Log[]>();
  for (const log of logs || []) {
    const key = String(log.date).slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    (months.get(key) as Log[]).push(log);
  }
  return [...months.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([ym, flights]) => ({
      date: ym,
      label: monthLabel(ym),
      hours: flights.reduce((n: number, f: Log) => n + (Number(f.totalTime) || 0), 0),
      flights: [...flights].sort((a, b) => {
        const d = String(b.date).slice(0, 10).localeCompare(String(a.date).slice(0, 10));
        return d !== 0 ? d : String(b.offBlocksTime || '').localeCompare(String(a.offBlocksTime || ''));
      }),
    }));
}

// "Fri 16" — the date each card carries in month view, where the group header
// only says the month.
export function shortDayLabel(date: string): string {
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function groupBy(logs: Log[], grouping: Grouping): Day[] {
  return grouping === 'month' ? groupByMonth(logs) : groupByDay(logs);
}

// "Oldest drops 2 Dec" — the day the 90-day window loses its third landing.
export function dropOffLabel(currentUntil?: string | null): string | null {
  if (!currentUntil) return null;
  return new Date(`${currentUntil}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// A sector's date is the UTC date it pushed back — OUT. A leg that lands after
// midnight is still one flight on one date; it is never split across days, and
// the arrival is marked "+1" instead.
export function landsNextDay(out?: string | null, inn?: string | null): boolean {
  const a = timeToMinutes(out);
  const b = timeToMinutes(inn);
  if (a == null || b == null) return false;
  return b < a;
}

// "Return of overnight trip from 14 Oct": the leg before this one left on a
// different date, landed where this one starts, and did so within 12 hours.
export function overnightReturnOf(flight: Log, all: Log[]): string | null {
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

// ── Overlapping sectors ────────────────────────────────────────────────────
// Two flights cannot be in the air at once. Compared on absolute UTC time —
// date plus OUT, with a block that may run through midnight — so a leg that
// lands at 02:00 and the one that leaves at 03:10 the next morning do not
// collide, while a date or a time typed wrongly does. This is a consistency
// check, not a legality one: it never blocks a save.

export function absoluteWindow(flight: Log): { start: number; end: number } | null {
  const date = String(flight.date || '').slice(0, 10);
  const out = timeToMinutes(flight.offBlocksTime);
  const inn = timeToMinutes(flight.onBlocksTime);
  if (!date || out == null) return null;
  const midnight = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(midnight)) return null;
  const start = midnight + out * 60000;
  const minutes = inn == null ? 0 : (inn >= out ? inn - out : inn + 1440 - out);
  return { start, end: start + minutes * 60000 };
}

// Returns a Map of flight id → the flight it overlaps.
export function findOverlaps(flights: Log[]): Map<string, Log> {
  const windows = (flights || [])
    .map((f) => ({ f, w: absoluteWindow(f) }))
    .filter((x): x is { f: Log; w: { start: number; end: number } } => x.w != null)
    .sort((a, b) => a.w.start - b.w.start);
  const hits = new Map<string, Log>();
  for (let i = 1; i < windows.length; i++) {
    const prev = windows[i - 1];
    const cur = windows[i];
    // Touching is fine: OUT exactly on the previous IN is a turnaround.
    if (cur.w.start < prev.w.end) {
      hits.set(cur.f.id, prev.f);
      hits.set(prev.f.id, cur.f);
    }
  }
  return hits;
}

export function overlapLabel(other: Log): string {
  const name = (other && (other.flightNumber || [other.departure, other.arrival].filter(Boolean).join('–'))) || 'another flight';
  return `Overlaps ${name} — check times or date`;
}

// ── The recency strip, in one place (web + app) ───────────────────────────────
// Two separate things, never mixed up:
//   • the requirement — 3 take-offs/landings in the last 90 days, day or night
//     alike. That is what "needed" and the amber dot are about.
//   • the night leg — a SEPARATE condition that only some authorities impose,
//     and that an instrument rating removes under EASA/UK CAA. The server
//     resolves it (services/recencyRules.js) and sends `currency.rule`. When
//     `rule.nightApplies` is false — IR holder, unmapped authority, or no
//     authority on file — the night figure is stated as information and is
//     NEVER called "needed" and never turns the strip amber.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function recencyLine(currency: any): any {
  if (!currency) return null;
  const rule = currency.rule || { nightApplies: false, mapped: false, base: 3 };
  const night = currency.night || { landings: 0, required: 3 };
  const required = currency.required || rule.base || 3;
  // Total landings in the window (older payloads only carried the day/night split).
  const total = currency.landings != null
    ? currency.landings
    : (currency.day?.landings || 0) + (night.landings || 0);
  const nightCount = night.landings || 0;
  // How many must be at night, per the pilot's authority (EASA/UK: one of the
  // three; FAA: three). Null/absent when no night requirement applies.
  const nightNeed = rule.nightApplies ? (rule.nightRequired ?? night.required ?? 1) : 0;
  const nightOk = nightCount >= nightNeed;
  const totalOk = total >= required;
  const until = currency.currentUntil || currency.day?.currentUntil || null;
  const plural = (n: number) => `${n} landing${n === 1 ? '' : 's'}`;

  // Everything that is true but not urgent goes behind the ⓘ. The strip gets
  // one line — the verdict and the date it runs out — because that is what a
  // pilot checks, and four clauses in a row stopped being read.
  const info = [`${plural(nightCount)} at night in the last 90 days`];
  if (rule.nightNote) info.push(rule.nightNote);

  // Landings missing from the window: the count is a floor, not a verdict.
  if (currency.incomplete && !totalOk) {
    return {
      tone: 'unknown',
      text: `Recency can't be worked out — ${currency.flightsWithoutLandings} of your last ${currency.flightsInWindow} flights have no landings recorded`,
      info,
    };
  }

  // Current = the requirement is met, and the night leg too where it applies.
  if (totalOk && (!rule.nightApplies || nightOk)) {
    const head = until ? `Current until ${dropOffLabel(until)}` : 'Current';
    return { tone: 'ok', text: `${head} · ${plural(total)} in 90 days`, info };
  }

  const needs = [];
  if (!totalOk) needs.push(`${required - total} more`);
  if (rule.nightApplies && !nightOk) needs.push(`${nightNeed - nightCount} more at night`);
  // "3 of 3" would be a lie when the three are flown and only the night leg is
  // outstanding, so the head states the count plainly in that case.
  const head = totalOk
    ? `${plural(total)} in 90 days`
    : `${total} of ${required} landings in 90 days`;
  return {
    tone: 'short',
    text: `${head}${needs.length ? ` · ${needs.join(' · ')} needed` : ''}`,
    info,
  };
}

type Pt = { lat?: number | null; lon?: number | null };
type Ap = { name?: string | null; city?: string | null; icao?: string | null };
type End = { airport?: Ap | null; code?: string | null };
// ── Great-circle distance ───────────────────────────────────────────────────
// The shortest path between two airports over the earth, in nautical miles —
// the distance a pilot means. Haversine on a 6371 km sphere; a flight plan's
// track distance is longer, so this is labelled "great circle" wherever it is
// shown rather than passed off as the distance flown.

/** Nautical miles between two {lat, lon}, or null if either is missing. */
export function greatCircleNm(
  a?: Pt | null, b?: Pt | null,
): number | null {
  if (!a || !b) return null;
  const [aLat, aLon, bLat, bLon] = [a.lat, a.lon, b.lat, b.lon];
  for (const v of [aLat, aLon, bLat, bLon]) if (!Number.isFinite(v)) return null;
  const R = 6371;                       // km
  const rad = Math.PI / 180;
  const dLat = ((bLat as number) - (aLat as number)) * rad;
  const dLon = ((bLon as number) - (aLon as number)) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat as number) * rad) * Math.cos((bLat as number) * rad) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  return Math.round(km / 1.852);
}

/**
 * "Jeddah (OEJN) → Alexandria El Nouzha (HEAX)".
 *
 * An airport we cannot name, or one with no ICAO, contributes just its code.
 * Nothing here is invented: a missing name stays missing.
 */
export function routeNames(from: End, to: End): string | null {
  const one = (ap?: Ap | null, code?: string | null) => {
    const c = String(code || '').toUpperCase();
    if (!ap) return c || null;
    const name = ap.name || ap.city || null;
    const icao = ap.icao && String(ap.icao).toUpperCase() !== c ? String(ap.icao).toUpperCase() : null;
    if (!name) return c || null;
    return icao ? `${name} (${icao})` : name;
  };
  const a = one(from.airport, from.code);
  const b = one(to.airport, to.code);
  if (!a && !b) return null;
  return `${a || '—'} → ${b || '—'}`;
}
