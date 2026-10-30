import { useEffect, useState } from 'react';
import { profileApi } from '../services/api';

// ── The pilot's airports, fetched once ──────────────────────────────────────
// Two places want this now — the logbook's map card and a flight's own detail
// — and it is the same 20-odd KB for both. One module-scoped promise means one
// request per page load however many components ask, and the second asker gets
// the answer immediately instead of a second spinner.
//
// Deliberately not React Query: this is the only shared fetch on the web side,
// and a promise in a module is the whole of what is needed.

let inflight = null;
let value = null;

function load() {
  if (value) return Promise.resolve(value);
  if (!inflight) {
    inflight = profileApi.getAirports()
      .then(({ data }) => {
        const byCode = new Map();
        for (const a of data?.airports || []) {
          if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;   // never 0,0
          for (const k of [a.code, a.icao, a.iata]) if (k) byCode.set(String(k).toUpperCase(), a);
        }
        value = { byCode, routes: data?.routes || [] };
        return value;
      })
      .catch(() => {
        // A failure must not be cached: the next screen should try again.
        inflight = null;
        return { byCode: new Map(), routes: [] };
      });
  }
  return inflight;
}

/** { byCode, routes } — byCode is empty until the fetch lands. */
export function useAirports() {
  const [state, setState] = useState(value || { byCode: new Map(), routes: [] });
  useEffect(() => {
    let alive = true;
    load().then((v) => { if (alive) setState(v); });
    return () => { alive = false; };
  }, []);
  return state;
}

/** For a one-off lookup outside a component. */
export function airportsNow() { return value; }
