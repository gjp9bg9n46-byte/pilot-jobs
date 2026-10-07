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

// Title case for SHOUTED / lowercased job titles (A#8). Display only — the
// stored title is never touched. This is a line-for-line twin of
// frontend/src/lib/jobDisplay.js displayTitle(); if you change one, change both,
// or the same job reads differently on web and app.
const KEEP_UPPER = /^(FAA|EASA|ATP|ATPL|CPL|MPL|PPL|IR|ME|SE|ELP|ICAO|GCAA|GACA|QCAA|BCAA|CARC|CAA|DGCA|CASA|TCCA|CAAC|JAA|AOC|ATO|FTO|OSS|ANG|USAF|RAF|EU|UK|US|USA|UAE|KSA|II|III|IV|VI|VII|VIII|IX|XI|XII|PIC|SIC|FO|SO|DEC|NTR|LST|IFR|VFR|TRI|TRE|SFI|SFE|LPC|OPC|CRM|MCC|JOC|AQP|RHS|LHS|HEMS|EMS|SAR|VIP|VVIP|PF|PM|QRH|SOP|GA|MPA|SEP|MEP)$/;
const tcPart = (p: string): string => (p ? p.toLowerCase().replace(/^([^a-z]*)([a-z])/, (_m, pre, ch) => pre + ch.toUpperCase()) : p);
function titleCaseWords(str: string): string {
  return String(str).split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok) || tok === '') return tok;
    if (/\d/.test(tok)) return /^[a-z]+\d/.test(tok) ? tok.replace(/^[a-z]+/, (m) => m.toUpperCase()) : tok;
    const letters = tok.replace(/[^A-Za-z]/g, '');
    if (tok === tok.toUpperCase() && (KEEP_UPPER.test(letters) || letters.length <= 2)) return tok;
    return tok.split('-').map(tcPart).join('-');
  }).join('');
}
export function displayTitle(title: string | null | undefined): string {
  const t = String(title || '').replace(/[\s–—-]+$/, '').trim();
  const upper = (t.match(/[A-Z]/g) || []).length;
  const lower = (t.match(/[a-z]/g) || []).length;
  if (!upper) return lower ? titleCaseWords(t) : t;
  const shouty = lower <= Math.max(2, upper * 0.15);
  if (!shouty) return t;
  return titleCaseWords(t);
}
