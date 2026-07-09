// Airline lookup — company-name → airline factfile id. Ported from
// frontend/src/lib/airlineLookup.js. Job `company` strings are scraped and vary
// from canonical Airline.name, so we normalise both sides (drop parentheticals,
// diacritics, non-alphanumerics) then compare. The airline list is fetched once
// and cached at module level.
import api from './api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AirlineRef = { id: string; name: string; logoUrl: string | null; iataCode: string | null };

export function normalizeCompany(str: string): string {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

let _cache: Map<string, AirlineRef> | null = null;

export async function fetchAirlineMap(): Promise<Map<string, AirlineRef>> {
  if (_cache) return _cache;
  const map = new Map<string, AirlineRef>();
  let page = 1;
  let totalPages = 1;
  do {
    const { data } = await api.get('/airlines', { params: { limit: 100, page } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data.items || []).forEach((a: any) => {
      const k = normalizeCompany(a.name);
      if (k && !map.has(k)) map.set(k, { id: a.id, name: a.name, logoUrl: a.logoUrl ?? null, iataCode: a.iataCode ?? null });
    });
    totalPages = data.totalPages;
    page++;
  } while (page <= totalPages);
  _cache = map;
  return map;
}

export function resolveAirline(map: Map<string, AirlineRef> | null, company: string): AirlineRef | null {
  if (!map || !company) return null;
  return map.get(normalizeCompany(company)) ?? null;
}
