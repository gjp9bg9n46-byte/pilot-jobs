// Display-only cleanup of scraped company + location strings (C#5). Never mutates
// stored data — purely presentational. Mirrors frontend/src/lib/displayNames.js.

const COMPANY_ALIASES: Record<string, string> = {
  aircairo: 'Air Cairo', flyyeg: 'Fly YEG', drgok: 'Drgok', airx: 'AirX', hauteaviation: 'Haute Aviation',
};
const AIRPORT_CITY: Record<string, string> = {
  HRG: 'Hurghada', SSH: 'Sharm El Sheikh', CAI: 'Cairo', DXB: 'Dubai', AUH: 'Abu Dhabi',
  JED: 'Jeddah', RUH: 'Riyadh', DOH: 'Doha', KWI: 'Kuwait City', BAH: 'Bahrain',
  LHR: 'London', CDG: 'Paris', FRA: 'Frankfurt', AMS: 'Amsterdam', IST: 'Istanbul',
  SIN: 'Singapore', HKG: 'Hong Kong', JFK: 'New York', LAX: 'Los Angeles', YYZ: 'Toronto',
};
const SMALL = new Set(['of', 'and', 'the', 'for', 'de', 'la', 'el', 'da', 'di', 'van', 'von']);

function titleCaseWord(w: string): string {
  if (!w) return w;
  if (/^[A-Z0-9&().,'-]+$/.test(w) && w.length <= 4) return w;
  const lower = w.toLowerCase();
  if (SMALL.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function companyName(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return s;
  const key = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (COMPANY_ALIASES[key]) return COMPANY_ALIASES[key];
  if (s === s.toLowerCase() || s === s.toUpperCase()) {
    return s.split(/\s+/).map((w, i) => (i === 0 ? titleCaseWord(w).replace(/^([a-z])/, (m) => m.toUpperCase()) : titleCaseWord(w))).join(' ');
  }
  return s;
}

export function locationName(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return s;
  const tokens = s.split(/[\s,]+/).filter(Boolean);
  const allCodes = tokens.length >= 2 && tokens.every((t) => /^[A-Za-z]{3}$/.test(t) && AIRPORT_CITY[t.toUpperCase()]);
  if (allCodes) return tokens.map((t) => AIRPORT_CITY[t.toUpperCase()]).join(' · ');
  const seen = new Set<string>();
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean)
    .filter((p) => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return parts.join(', ');
}
