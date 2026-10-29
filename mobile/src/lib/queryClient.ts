// ── Query client + on-device cache ───────────────────────────────────────────
// The app used to fetch on every mount and every tab focus, so each tab opened
// on a spinner and then waited ~1–3 s for Cairo → Vercel → Railway → Postgres.
// Now every screen reads from a cache that survives app restarts: what you saw
// last time is on screen immediately, and the refetch happens behind it.
//
// A screen shows a skeleton ONLY when there is nothing cached for it. When
// cached data exists it is rendered at once, however stale, with a quiet
// refreshing state — never a full-screen loader over data we already have.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { describeJsonProblem, findUnJsonSafe } from './jsonSafe';

// staleTime: how long a cached answer is served without a background refetch.
// gcTime: how long it survives unused in memory. Both are generous because this
// is reference data a pilot reads far more often than it changes.
export const STALE = {
  short: 30 * 1000,        // dashboard, jobs — move with new postings
  medium: 5 * 60 * 1000,   // logbook, CV, profile — change when the pilot edits
  long: 24 * 60 * 60 * 1000, // airline logos — a table that changes monthly
};

// Everything in this cache is written to disk with JSON.stringify and read
// back with JSON.parse. A value that does not survive that round trip works
// on the launch that fetched it and breaks on every launch after — a Map
// rehydrated as `{}` with no `.get` took the Logbook tab down twice before
// the cause was visible. This catches the whole class the moment a query
// resolves, in development, where the author can still see it.
//
// Development only: in a release build it costs nothing, and the lint rule
// in eslint.config.js is what guards the shipped code.
const queryCache = new QueryCache({
  onSuccess: __DEV__ ? (data, query) => {
    const problem = findUnJsonSafe(data);
    if (!problem) return;
    // eslint-disable-next-line no-console
    console.error(
      `[query cache] ${describeJsonProblem(query.queryHash, problem)}\n`
      + 'It will not survive a restart. Keep plain JSON in the query and build '
      + 'the value in `select`, which runs after rehydration and is not persisted.',
    );
  } : undefined,
});

export const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      staleTime: STALE.short,
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: 2,
      // The cached copy is the point: never blank the screen while refetching.
      placeholderData: (prev: unknown) => prev,
      refetchOnReconnect: true,
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'cockpithire.query-cache.v1',
  throttleTime: 2000,
});

// Bump when a payload shape changes so stale shapes are dropped, not rendered.
// 2026-10-29: the logbook payload and screen changed across builds 4–6
// (bootstrap bundling, the new flight row, Month/Day grouping, the route map)
// without this moving, so a device could rehydrate a build-3 shape into
// build-6 code. Bump it with the shape, not with the release.
// 2026-10-30: the airports query changed shape (a Map became {airports,
// routes}) and this did NOT move, so every device kept the old entry — which
// was the Map serialised to {} — and the new `select` read no airports from
// it. The map said "0 airports · 200 without coordinates" for a day, because
// the entry was also still inside its 24-hour staleTime.
//
// Bump this in the SAME commit as any change to what a queryFn returns.
// 2026-10-30.2: the jobs payload gained a campaign fitGroup and every job now
// carries a match object. A cached list from before that holds rows whose
// match is null, which older grouping code dereferenced.
export const CACHE_BUSTER = '2026-10-30.2';
