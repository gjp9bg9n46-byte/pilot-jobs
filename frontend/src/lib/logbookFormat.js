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

// ── Grouping ─────────────────────────────────────────────────────────────────
// A logbook is read by month far more often than by day: "how much did I fly in
// October" is the everyday question, and a day group is one or two sectors.
// Month is the default; Day is a switch away for anyone checking a rotation.

export function monthLabel(ym) {
  // Always with the year: a logbook is read across years, and "October" alone
  // is how a misfiled 2024 flight hides in plain sight.
  const d = new Date(`${ym}-01T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Sectors grouped by calendar month, newest first, with the month's total.
export function groupByMonth(logs) {
  const months = new Map();
  for (const log of logs || []) {
    const key = String(log.date).slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(log);
  }
  return [...months.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([ym, flights]) => ({
      date: ym,
      label: monthLabel(ym),
      hours: flights.reduce((n, f) => n + (Number(f.totalTime) || 0), 0),
      flights: [...flights].sort((a, b) => {
        const d = String(b.date).slice(0, 10).localeCompare(String(a.date).slice(0, 10));
        return d !== 0 ? d : String(b.offBlocksTime || '').localeCompare(String(a.offBlocksTime || ''));
      }),
    }));
}

// "Fri 16" — the date each card carries in month view, where the group header
// only says the month.
export function shortDayLabel(date) {
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function groupBy(logs, grouping) {
  return grouping === 'month' ? groupByMonth(logs) : groupByDay(logs);
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

// ── Overlapping sectors ────────────────────────────────────────────────────
// Two flights cannot be in the air at once. Compared on absolute UTC time —
// date plus OUT, with a block that may run through midnight — so a leg that
// lands at 02:00 and the one that leaves at 03:10 the next morning do not
// collide, while a date or a time typed wrongly does. This is a consistency
// check, not a legality one: it never blocks a save.

export function absoluteWindow(flight) {
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
export function findOverlaps(flights) {
  const windows = (flights || [])
    .map((f) => ({ f, w: absoluteWindow(f) }))
    .filter((x) => x.w)
    .sort((a, b) => a.w.start - b.w.start);
  const hits = new Map();
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

export function overlapLabel(other) {
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
export function recencyLine(currency) {
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
  const plural = (n) => `${n} landing${n === 1 ? '' : 's'}`;

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

// ── What a flight needs before it can be saved ───────────────────────────────
// A pilot copying an old paper page often has the block time written down and
// nothing else — no OUT, no IN. Demanding the four times would mean inventing
// three of them. So: either OUT and IN (and the block follows from them), or a
// block time typed straight in.

/** "1:30", "1.5", "1,5" → 1.5 hours. null when it is not a time at all. */
export function parseBlockHours(raw) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (!s) return null;
  const hhmm = /^(\d{1,3}):([0-5]\d)$/.exec(s);
  if (hhmm) return parseFloat((Number(hhmm[1]) + Number(hhmm[2]) / 60).toFixed(2));
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? parseFloat(n.toFixed(2)) : null;
}

/**
 * What is still missing from one leg, in the words the Save button uses.
 * Empty array = ready to save.
 */
export function missingForSave({ date, aircraftType, out, in: inn, blockTyped }) {
  const missing = [];
  if (!date) missing.push('a date');
  if (!String(aircraftType || '').trim()) missing.push('an aircraft type');
  if (spanMinutes(out, inn) === null && parseBlockHours(blockTyped) === null) {
    const haveOut = timeToMinutes(out) !== null;
    const haveIn = timeToMinutes(inn) !== null;
    if (haveOut && !haveIn) missing.push('an in time (or a block time)');
    else if (haveIn && !haveOut) missing.push('an out time (or a block time)');
    else missing.push('out and in times, or a block time');
  }
  return missing;
}

/**
 * "Add a date" — the reason a disabled Save gives. One thing at a time: four
 * items in one sentence is a wall, and the next blank is the only one the
 * pilot can act on anyway. It advances as the form fills.
 */
export function missingSentence(missing, legNumber) {
  if (!missing.length) return '';
  return `${legNumber ? `Leg ${legNumber}: a` : 'A'}dd ${missing[0]}`;
}
