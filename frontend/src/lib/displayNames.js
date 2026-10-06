// Display-only cleanup of scraped company + location strings (C#5). Never mutates
// stored data — purely presentational. Shared shape with mobile/src/lib/displayNames.ts.

// Known scraped-company → proper display name (lowercase key, exact-ish match).
const COMPANY_ALIASES = {
  aircairo: 'Air Cairo',
  flyyeg: 'Fly YEG',
  drgok: 'Drgok',
  airx: 'AirX',
  hauteaviation: 'Haute Aviation',
};

// IATA/airport codes → city label (for terse code-only locations like "Hrg ssh cai").
const AIRPORT_CITY = {
  HRG: 'Hurghada', SSH: 'Sharm El Sheikh', CAI: 'Cairo', DXB: 'Dubai', AUH: 'Abu Dhabi',
  JED: 'Jeddah', RUH: 'Riyadh', DOH: 'Doha', KWI: 'Kuwait City', BAH: 'Bahrain',
  LHR: 'London', CDG: 'Paris', FRA: 'Frankfurt', AMS: 'Amsterdam', IST: 'Istanbul',
  SIN: 'Singapore', HKG: 'Hong Kong', JFK: 'New York', LAX: 'Los Angeles', YYZ: 'Toronto',
};

const SMALL = new Set(['of', 'and', 'the', 'for', 'de', 'la', 'el', 'da', 'di', 'van', 'von']);
function titleCaseWord(w) {
  if (!w) return w;
  if (/^[A-Z0-9&().,'-]+$/.test(w) && w.length <= 4) return w; // keep acronyms/codes (LLC, A320, ATR)
  const lower = w.toLowerCase();
  if (SMALL.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Proper company display name. Alias table first; else Title Case the string while
// preserving acronyms/legal suffixes. Leaves already-mixed-case names alone.
export function companyName(raw) {
  const s = String(raw || '').trim();
  if (!s) return s;
  const key = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (COMPANY_ALIASES[key]) return COMPANY_ALIASES[key];
  // All-lowercase or ALL-CAPS scraped strings → Title Case; mixed-case → leave as-is.
  if (s === s.toLowerCase() || s === s.toUpperCase()) {
    return s.split(/\s+/).map((w, i) => (i === 0 ? titleCaseWord(w).replace(/^([a-z])/, (m) => m.toUpperCase()) : titleCaseWord(w))).join(' ');
  }
  return s;
}

// Proper location display: dedupe repeated parts ("Dubai, Dubai" → "Dubai"), and
// expand a run of airport codes ("Hrg ssh cai" → "Hurghada · Sharm El Sheikh · Cairo").
export function locationName(raw) {
  const s = String(raw || '').trim();
  if (!s) return s;
  // Airport-code run (2+ three-letter tokens, no commas) → cities joined by " · ".
  const tokens = s.split(/[\s,]+/).filter(Boolean);
  const allCodes = tokens.length >= 2 && tokens.every((t) => /^[A-Za-z]{3}$/.test(t) && AIRPORT_CITY[t.toUpperCase()]);
  if (allCodes) return tokens.map((t) => AIRPORT_CITY[t.toUpperCase()]).join(' · ');
  // Dedupe repeated comma parts (case-insensitive), preserving order.
  const seen = new Set();
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean)
    .filter((p) => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return parts.join(', ');
}
