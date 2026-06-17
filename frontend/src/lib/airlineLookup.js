// ─── Airline lookup — company-name → airline factfile id ──────────────────────
// Job `company` strings are scraped and vary from our canonical Airline.name
// ("aircairo" vs "Air Cairo", "Republic Airways (RJet)" vs "Republic Airways"),
// so an exact (even case-insensitive) match misses most airlines. We normalise
// both sides aggressively — drop parentheticals, diacritics, and every non-
// alphanumeric char — then compare. The airline list is fetched once and cached
// at module level (shared by Jobs.jsx + JobDetail.jsx).

import { airlineApi } from '../services/api';

// "Republic Airways (RJet)" → "republicairways"; "Air Cairo" → "aircairo"
export function normalizeCompany(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, '')        // drop parenthetical qualifiers
    .replace(/[^a-z0-9]/g, '');     // drop spaces + punctuation
}

let _airlineCache = null;

// Map keyed by normalised airline name → { id, name, logoUrl, iataCode }. First
// write wins so a canonical name isn't clobbered by a later collision. (logoUrl +
// iataCode are additive — id/name consumers are unaffected — so card listings can
// render the AirlineLogo from the one cached fetch instead of N per-card calls.)
export async function fetchAirlineMap() {
  if (_airlineCache) return _airlineCache;
  const map = new Map();
  let page = 1, totalPages = 1;
  do {
    const { data } = await airlineApi.list({ limit: 100, page });
    data.items.forEach((a) => {
      const k = normalizeCompany(a.name);
      if (k && !map.has(k)) map.set(k, { id: a.id, name: a.name, logoUrl: a.logoUrl ?? null, iataCode: a.iataCode ?? null });
    });
    totalPages = data.totalPages;
    page++;
  } while (page <= totalPages);
  _airlineCache = map;
  return map;
}

// Resolve a job's company string to an airline { id, name, logoUrl, iataCode } (or null if unmapped).
export function resolveAirline(map, company) {
  if (!map || !company) return null;
  return map.get(normalizeCompany(company)) ?? null;
}

// Convenience: just the id (or null).
export function resolveAirlineId(map, company) {
  return resolveAirline(map, company)?.id ?? null;
}
