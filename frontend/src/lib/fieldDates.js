// Per-field date resolution + compact formatting for airline fact files.
// Mirrors backend src/services/fieldDateKeys.js resolveDate: a per-item value
// resolves precise key ('fleet:A320') → field-level fallback ('fleet') → null.
// Kept in sync with mobile/src/lib/fieldDates.ts.

export function resolveFieldDate(map, logical, itemSuffix) {
  if (!map) return null;
  if (itemSuffix != null && itemSuffix !== '') {
    const precise = `${logical}:${itemSuffix}`;
    if (map[precise] != null) return map[precise];
  }
  return map[logical] ?? null;
}

// Stable content hash for interview-stage keys (mirror of backend
// fieldDateKeys.js hashStage) — dates follow the stage TEXT, not its position,
// so reordering can't move a date onto the wrong stage.
export function hashStage(s) {
  const t = String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

// Compact "MMM YYYY" so the date never competes with the value. NULL → "—".
export function formatFieldDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
