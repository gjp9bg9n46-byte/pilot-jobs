// Per-field date resolution + compact formatting for airline fact files.
// Mirrors backend src/services/fieldDateKeys.js + frontend src/lib/fieldDates.js.
// A per-item value resolves precise key ('fleet:A320') → field-level fallback
// ('fleet') → null. Keep in sync with web so the two clients don't drift.

export type FieldDateMap = Record<string, string> | null | undefined;

export function resolveFieldDate(map: FieldDateMap, logical: string, itemSuffix?: string | number | null): string | null {
  if (!map) return null;
  if (itemSuffix != null && itemSuffix !== '') {
    const precise = `${logical}:${itemSuffix}`;
    if (map[precise] != null) return map[precise];
  }
  return map[logical] ?? null;
}

// Compact "MMM YYYY" so the date never competes with the value. NULL → "—".
export function formatFieldDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
