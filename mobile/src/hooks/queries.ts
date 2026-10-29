// ── Every screen's data, in one place ────────────────────────────────────────
// One key per thing the app reads, so a tab and the prefetch that warms it can
// never disagree about what to fetch. Screens call these hooks and get three
// things: whatever was cached (instantly, even after a restart), a background
// refetch, and `isPending` that is true ONLY when there is nothing to show.
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import api from '../lib/api';
import { STALE } from '../lib/queryClient';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const get = async <T,>(path: string, params?: Record<string, unknown>): Promise<T> => {
  const { data } = await api.get(path, params ? { params } : undefined);
  return data as T;
};

export const keys = {
  dashboard: ['dashboard'] as const,
  jobs: (q: Record<string, unknown>) => ['jobs', q] as const,
  airlineLogos: ['airlines', 'logos'] as const,
  airlines: (q: Record<string, unknown>) => ['airlines', 'list', q] as const,
  cv: ['cv', 'document'] as const,
  logbook: (page: number) => ['logbook', 'bootstrap', page] as const,
  profile: ['profile', 'overview'] as const,
};

// ── Home ─────────────────────────────────────────────────────────────────────
export function useDashboard() {
  return useQuery({ queryKey: keys.dashboard, queryFn: () => get<Any>('/dashboard'), staleTime: STALE.short });
}

// ── Jobs ─────────────────────────────────────────────────────────────────────
export function useJobs(query: Record<string, unknown>) {
  return useQuery({ queryKey: keys.jobs(query), queryFn: () => get<Any>('/jobs', query), staleTime: STALE.short });
}

// ── Airlines ─────────────────────────────────────────────────────────────────
export function useAirlines(query: Record<string, unknown>) {
  return useQuery({ queryKey: keys.airlines(query), queryFn: () => get<Any>('/airlines', query), staleTime: STALE.medium });
}

// The company → logo map, one call for the whole table (GET /airlines/logos).
// Falls back to the paged listing if the app is talking to an older backend.
export type AirlineRef = { id: string; name: string; logoUrl: string | null; iataCode: string | null };
export function useAirlineLogos() {
  return useQuery({
    queryKey: keys.airlineLogos,
    staleTime: STALE.long,
    queryFn: async (): Promise<AirlineRef[]> => {
      try {
        const d = await get<{ items: AirlineRef[] }>('/airlines/logos');
        if (d?.items?.length) return d.items;
      } catch { /* older backend — page the listing below */ }
      const out: AirlineRef[] = [];
      let page = 1, totalPages = 1;
      do {
        const d = await get<Any>('/airlines', { limit: 100, page });
        (d.items || []).forEach((a: Any) => out.push({ id: a.id, name: a.name, logoUrl: a.logoUrl ?? null, iataCode: a.iataCode ?? null }));
        totalPages = d.totalPages || 1;
        page += 1;
      } while (page <= totalPages);
      return out;
    },
  });
}

// ── CV ───────────────────────────────────────────────────────────────────────
export function useCvDocument() {
  return useQuery({ queryKey: keys.cv, queryFn: () => get<Any>('/cv/document'), staleTime: STALE.medium });
}

// ── Logbook (one bundled call: prefs + quota + summary + page) ────────────────
// A bundle whose every part failed is a failure, not an empty screen. React
// Query stores whatever a queryFn RESOLVES to as a success, and the persister
// writes successes to disk — so one bad moment on a hotel wi-fi used to leave
// `{prefs: null, summary: null, flights: null}` cached for a week, rehydrated
// on every launch, with the screen rendering nothing and no way to clear it.
// Throwing keeps the query in an error state, which leaves the last good data
// in place and retries.
function allNull(bundle: Record<string, unknown>): boolean {
  const vs = Object.values(bundle);
  return vs.length > 0 && vs.every((v) => v == null);
}

export function useLogbook(page: number) {
  return useQuery({
    queryKey: keys.logbook(page),
    staleTime: STALE.medium,
    queryFn: async () => {
      try {
        return await get<Any>('/logbook/bootstrap', { page, limit: 20 });
      } catch {
        // Older backend: the four calls this bundle replaced.
        const [prefs, scanQuota, summary, flights] = await Promise.all([
          get<Any>('/logbook/prefs').catch(() => null),
          get<Any>('/logbook/scan-quota').catch(() => null),
          get<Any>('/logbook/summary').catch(() => null),
          get<Any>('/flight-logs', { page, limit: 20 }).catch(() => null),
        ]);
        const bundle = { prefs, scanQuota, summary, flights };
        if (allNull(bundle)) throw new Error('Could not reach the logbook');
        return bundle;
      }
    },
  });
}

// ── Profile (one bundled call: profile + readiness + logbook + apps + CV) ─────
export function useProfileOverview() {
  return useQuery({
    queryKey: keys.profile,
    staleTime: STALE.medium,
    queryFn: async () => {
      try {
        return await get<Any>('/profile/overview');
      } catch {
        const [profile, readiness, logbook, applications, cv] = await Promise.all([
          get<Any>('/profile').catch(() => null),
          get<Any>('/profile/readiness').catch(() => null),
          get<Any>('/logbook/summary').catch(() => null),
          get<Any>('/jobs/applications').catch(() => null),
          get<Any>('/cv/document').catch(() => null),
        ]);
        const bundle = { profile, readiness, logbook, applications, cv };
        if (allNull(bundle)) throw new Error('Could not reach your profile');
        return bundle;
      }
    },
  });
}

// ── Prefetch ─────────────────────────────────────────────────────────────────
// Right after sign-in (and on every cold start with a token) the four tabs a
// pilot actually opens are fetched in the background, so the first visit to
// each is already warm. Failures are ignored: this is a head start, not a gate.
export function prefetchTabs(qc: QueryClient) {
  const warm = [
    { queryKey: keys.dashboard, queryFn: () => get<Any>('/dashboard'), staleTime: STALE.short },
    { queryKey: keys.jobs(DEFAULT_JOBS_QUERY), queryFn: () => get<Any>('/jobs', DEFAULT_JOBS_QUERY), staleTime: STALE.short },
    { queryKey: keys.logbook(1), queryFn: () => get<Any>('/logbook/bootstrap', { page: 1, limit: 20 }), staleTime: STALE.medium },
    { queryKey: keys.cv, queryFn: () => get<Any>('/cv/document'), staleTime: STALE.medium },
  ];
  return Promise.allSettled(warm.map((w) => qc.prefetchQuery(w as Any)));
}

// The query the Jobs tab opens with — shared so the prefetch warms the exact key.
export const DEFAULT_JOBS_QUERY: Record<string, unknown> = { limit: 1000, sort: 'best' };

/** Warms the tabs once per signed-in session. */
export function usePrefetchTabs(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => { void prefetchTabs(qc); }, 300); // let the first screen paint first
    return () => clearTimeout(t);
  }, [enabled, qc]);
}
