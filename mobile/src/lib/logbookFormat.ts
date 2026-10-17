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
