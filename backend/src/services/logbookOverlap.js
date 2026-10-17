'use strict';

/**
 * Two flights cannot be in the air at once.
 *
 * Sectors are compared on absolute UTC time — the date plus OUT, with a block
 * that may run through midnight — so a leg landing at 02:00 and the one leaving
 * at 03:10 the next morning do not collide, while a mistyped time or a date a
 * year out does. Touching is fine: OUT exactly on the previous IN is a
 * turnaround, not an overlap.
 *
 * This is a consistency check, not a legality one. It never blocks a save; the
 * pilot may be in the middle of fixing exactly this.
 *
 * Mirrored for display in frontend/src/lib/logbookFormat.js and
 * mobile/src/lib/logbookFormat.ts — the backend cannot import either (Railway
 * deploys backend/ alone), so the three copies are kept deliberately small.
 */

function toMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

function absoluteWindow(flight) {
  const date = String(flight.date || '').slice(0, 10);
  const out = toMinutes(flight.offBlocksTime);
  const inn = toMinutes(flight.onBlocksTime);
  if (!date || out == null) return null;
  const midnight = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(midnight)) return null;
  const start = midnight + out * 60000;
  const minutes = inn == null ? 0 : (inn >= out ? inn - out : inn + 1440 - out);
  return { start, end: start + minutes * 60000 };
}

// Map of flight id → the flight it overlaps.
function findOverlaps(flights) {
  const windows = (flights || [])
    .map((f) => ({ f, w: absoluteWindow(f) }))
    .filter((x) => x.w)
    .sort((a, b) => a.w.start - b.w.start);
  const hits = new Map();
  for (let i = 1; i < windows.length; i++) {
    const prev = windows[i - 1];
    const cur = windows[i];
    if (cur.w.start < prev.w.end) {
      hits.set(cur.f.id, prev.f);
      hits.set(prev.f.id, cur.f);
    }
  }
  return hits;
}

function overlapMessage(other) {
  const name = (other && (other.flightNumber || [other.departure, other.arrival].filter(Boolean).join('–'))) || 'another flight';
  return `Overlaps ${name} — check times or date`;
}

module.exports = { findOverlaps, absoluteWindow, overlapMessage, toMinutes };
