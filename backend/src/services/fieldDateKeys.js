'use strict';

/**
 * Logical field-date keys for airline fact files.
 *
 * A key is EITHER a whole-field key ('rosterPattern') or a per-item composite
 * ('fleet:A320', 'payRanges:captain', 'interviewStages:0'). Per-item fields
 * ALSO have a field-level fallback key with no suffix ('fleet') — the honest
 * backfill (from whole-field contribution history) can only date at field level,
 * while going-forward edits and re-affirms date precise items. Display resolves
 * precise → field-level fallback → NULL.
 *
 * Raw Airline columns map to logical fields (fleetDetail→fleet, the two upgrade
 * columns→upgradeTime) so a date follows what the user sees, not the storage.
 */

// Whole-field factfile keys — one date each.
const WHOLE_FIELDS = [
  'headquarters', 'description', 'bases', 'hiringStatus', 'hiringFrequency',
  'rosterPattern', 'contractType', 'workAuthRequired', 'avgResponseDays',
  'simType', 'upgradeTime', 'notes', 'region',
];

// Per-item fields — dated per item, with a field-level fallback.
const PER_ITEM_FIELDS = ['fleet', 'payRanges', 'interviewStages'];

// Raw Airline column → logical field key.
const RAW_TO_LOGICAL = {
  fleet: 'fleet', fleetDetail: 'fleet',
  upgradeTimeMinYears: 'upgradeTime', upgradeTimeMaxYears: 'upgradeTime',
};
const toLogical = (rawField) => RAW_TO_LOGICAL[rawField] || rawField;

// Interview stages are keyed by a STABLE content hash of the stage text, not by
// array index — reordering stages must not silently move dates onto the wrong
// item. Editing a stage's text is a genuine content change → a new key (its old
// date is correctly orphaned). Same hash is mirrored in the client fieldDates
// libs so display resolves to the same key.
function normalizeStage(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}
function hashStage(s) {
  const t = normalizeStage(s);
  let h = 0x811c9dc5; // FNV-1a 32-bit
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

const itemKey = {
  fleet: (type) => `fleet:${type}`,
  pay: (role) => `payRanges:${role}`,             // 'captain' | 'fo'
  interview: (stageText) => `interviewStages:${hashStage(stageText)}`,
};

// Resolve the date for a per-item (or whole) value from the field-dates map:
// precise item key → field-level fallback → null. `map` is { field: recordedAt }.
function resolveDate(map, logicalField, itemSuffix) {
  if (!map) return null;
  if (itemSuffix != null) {
    const precise = `${logicalField}:${itemSuffix}`;
    if (map[precise] != null) return map[precise];
  }
  return map[logicalField] ?? null;
}

// Deep-ish equality good enough for fact values (scalars, arrays, small objects).
const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Given ONE raw field that changed, return the precise field-date keys to stamp.
 * `newA`/`oldA` are the full new/old airline states (post-merge and pre-merge).
 * Per-item fields diff so only changed/added items are re-dated (editing one
 * fleet type doesn't re-date the others). Whole fields return their single key.
 * If the old state is unknown (null), per-item falls back to stamping every item
 * in the new value — over-date a genuine edit, never under-date.
 */
function keysToStampOnEdit(rawField, newA, oldA) {
  const logical = toLogical(rawField);

  if (logical === 'fleet') {
    const typesOf = (a) => {
      if (Array.isArray(a?.fleetDetail) && a.fleetDetail.length) return a.fleetDetail.map((d) => d && d.type).filter(Boolean);
      if (Array.isArray(a?.fleet)) return a.fleet.filter(Boolean);
      return [];
    };
    const newTypes = typesOf(newA);
    const oldTypes = typesOf(oldA);
    const oldByType = new Map((oldA?.fleetDetail || []).map((d) => [d?.type, d]));
    const changed = newTypes.filter((t) => {
      const nd = (newA?.fleetDetail || []).find((d) => d?.type === t);
      return !oldTypes.includes(t) || (nd && !eq(nd, oldByType.get(t)));
    });
    const stamp = (oldA == null ? newTypes : changed);
    return stamp.length ? stamp.map(itemKey.fleet) : ['fleet'];
  }

  if (logical === 'payRanges') {
    const keys = [];
    for (const role of ['captain', 'fo']) {
      if (oldA == null || !eq(newA?.payRanges?.[role], oldA?.payRanges?.[role])) keys.push(itemKey.pay(role));
    }
    return keys.length ? keys : ['payRanges'];
  }

  if (logical === 'interviewStages') {
    const nv = Array.isArray(newA?.interviewStages) ? newA.interviewStages : [];
    const ov = Array.isArray(oldA?.interviewStages) ? oldA.interviewStages : [];
    // Content-keyed: a stage whose normalized text isn't already present is
    // added-or-edited → stamp it. Reordered stages keep their keys → not re-dated.
    const oldSet = new Set(ov.map(normalizeStage));
    const keys = [];
    for (const s of nv) { if (oldA == null || !oldSet.has(normalizeStage(s))) keys.push(itemKey.interview(s)); }
    return keys.length ? keys : ['interviewStages'];
  }

  return [logical]; // whole field
}

module.exports = {
  WHOLE_FIELDS, PER_ITEM_FIELDS, toLogical, itemKey, resolveDate, keysToStampOnEdit,
  normalizeStage, hashStage,
  ALL_LOGICAL_FIELDS: [...WHOLE_FIELDS, ...PER_ITEM_FIELDS],
};
