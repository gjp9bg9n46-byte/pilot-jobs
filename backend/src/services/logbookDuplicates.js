'use strict';
// ── Is this flight already in the logbook? ─────────────────────────────────
//
// One rule, used by the import preview AND by the save that follows it. They
// used to be different things: the preview checked, the save did not, so a
// file imported twice in two tabs — or a logbook that grew between the
// preview and the confirm — landed twice.
//
// The rule, and why:
//
//  1. A different date is a different flight. Nothing else is even compared.
//
//  2. On the same date, two flights are the same flight when their flight
//     numbers match, or when their routes match.
//
//  3. ...but only if the TIMES AGREE, within 15 minutes. A pilot who flies
//     CAI–RUH out and back twice in a day has two legitimate CAI–RUH rows,
//     and merging them would quietly delete a sector. Fifteen minutes is
//     wide enough for the difference between an off-blocks time and a
//     take-off time, and far narrower than the gap between two real rotations.
//
//  4. If either side has no time at all, there is nothing to disagree about,
//     so the pair stands as a duplicate. Without this, re-importing a file
//     that carries no times would double every flight in it.
//
//  5. Rows are compared against the logbook AND against each other, so a file
//     that lists the same sector twice is caught before it is saved.

const MATCH_WINDOW_MINUTES = 15;
const MINUTES_IN_DAY = 1440;

/** 'YYYY-MM-DD' from a Date, an ISO string, or a plain date string. */
function dayOf(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const s = String(value).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Minutes past midnight from "06:10", "0610" or "6:10". Null when unknown. */
function minutesOfDay(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Do two times of day agree? Unknown agrees with anything (rule 4). The
 * distance is circular, so 23:55 and 00:05 are ten minutes apart rather than
 * a day — a date written either side of midnight should not escape the rule.
 */
function timesAgree(a, b, windowMinutes = MATCH_WINDOW_MINUTES) {
  const x = minutesOfDay(a);
  const y = minutesOfDay(b);
  if (x == null || y == null) return true;
  const d = Math.abs(x - y);
  return Math.min(d, MINUTES_IN_DAY - d) <= windowMinutes;
}

const code = (v) => (v == null ? null : String(v).toUpperCase().replace(/\s+/g, '') || null);

/** The few fields the rule looks at, from a row in any of our shapes. */
function keyOf(row) {
  if (!row) return null;
  return {
    day: dayOf(row.date),
    flightNumber: code(row.flightNumber),
    departure: code(row.departure),
    arrival: code(row.arrival),
    time: row.offBlocksTime ?? row.time ?? null,
  };
}

/** Rules 1–4, against two already-extracted keys. */
function keysMatch(a, b, windowMinutes = MATCH_WINDOW_MINUTES) {
  if (!a || !b || !a.day || a.day !== b.day) return null;
  if (!timesAgree(a.time, b.time, windowMinutes)) return null;
  if (a.flightNumber && b.flightNumber && a.flightNumber === b.flightNumber) return 'flight number';
  if (a.departure && a.arrival && a.departure === b.departure && a.arrival === b.arrival) return 'route';
  return null;
}

const matches = (a, b, w) => keysMatch(keyOf(a), keyOf(b), w);

/**
 * Which rows are duplicates — of the logbook, or of each other.
 *
 * Returns one entry per duplicated row, in file order, carrying enough to
 * show the pilot what was skipped without making them open the file again.
 * The FIRST of a repeated pair inside the file is kept; only the later copies
 * are reported.
 */
function findDuplicates(rows, existing = [], { windowMinutes = MATCH_WINDOW_MINUTES } = {}) {
  const existingByDay = new Map();
  for (const e of existing) {
    const k = keyOf(e);
    if (!k || !k.day) continue;
    if (!existingByDay.has(k.day)) existingByDay.set(k.day, []);
    existingByDay.get(k.day).push(k);
  }

  const out = [];
  const keptByDay = new Map();   // rows from this file that we are keeping

  rows.forEach((row, index) => {
    const k = keyOf(row);
    if (!k || !k.day) return;    // no date: a different problem, reported elsewhere

    let on = null;
    for (const other of existingByDay.get(k.day) || []) {
      on = keysMatch(k, other, windowMinutes);
      if (on) break;
    }
    let where = 'logbook';
    if (!on) {
      for (const other of keptByDay.get(k.day) || []) {
        on = keysMatch(k, other, windowMinutes);
        if (on) { where = 'file'; break; }
      }
    }

    if (!on) {
      if (!keptByDay.has(k.day)) keptByDay.set(k.day, []);
      keptByDay.get(k.day).push(k);
      return;
    }

    out.push({
      index,
      where,
      on,
      reason: where === 'logbook'
        ? `already in your logbook — same ${on} on ${k.day}`
        : `the same ${on} appears earlier in this file, on ${k.day}`,
      date: k.day,
      flightNumber: k.flightNumber,
      from: k.departure,
      to: k.arrival,
      time: k.time || null,
    });
  });

  return out;
}

/**
 * The logbook rows worth comparing against: the same pilot, the span the file
 * covers.
 *
 * A range, not a list of exact dates. Imported rows sit at midnight UTC, but
 * a flight added by hand or lifted off a scan need not, and an exact-date
 * query silently misses those — which would let a duplicate through while
 * looking like it had checked.
 */
async function existingOnDays(prisma, pilotId, rows) {
  const days = [...new Set(rows.map((r) => dayOf(r.date)).filter(Boolean))].sort();
  if (!days.length) return [];
  return prisma.flightLog.findMany({
    where: {
      pilotId,
      date: {
        gte: new Date(`${days[0]}T00:00:00.000Z`),
        lte: new Date(`${days[days.length - 1]}T23:59:59.999Z`),
      },
    },
    select: { date: true, flightNumber: true, departure: true, arrival: true, offBlocksTime: true },
  });
}

/** Preview and save ask the same question, so they ask it the same way. */
async function duplicatesAgainstLogbook(prisma, pilotId, rows, opts = {}) {
  const existing = await existingOnDays(prisma, pilotId, rows);
  return findDuplicates(rows, existing, opts);
}

/**
 * What the save step does with what the check found.
 *
 * Separated from the controller so the decision can be tested without a
 * database: which rows are written, what the pilot is told, and the row
 * numbers they saw in the preview (the valid rows are a subset of what was
 * submitted, so a duplicate's index is not its row number).
 */
function planImport({ valid, validIndex = [], duplicates = [], includeDuplicates = false }) {
  const dupeRows = new Set(duplicates.map((d) => d.index));
  const write = includeDuplicates ? valid.slice() : valid.filter((_, i) => !dupeRows.has(i));
  return {
    write,
    skippedDuplicates: includeDuplicates ? 0 : duplicates.length,
    duplicates: duplicates.map((d) => ({ ...d, rowIndex: (validIndex[d.index] ?? d.index) + 1 })),
  };
}

module.exports = {
  MATCH_WINDOW_MINUTES, planImport,
  dayOf, minutesOfDay, timesAgree, keyOf, keysMatch, matches,
  findDuplicates, existingOnDays, duplicatesAgainstLogbook,
};
