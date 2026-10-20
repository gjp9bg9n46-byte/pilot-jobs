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
import { QueryClient } from '@tanstack/react-query';

// staleTime: how long a cached answer is served without a background refetch.
// gcTime: how long it survives unused in memory. Both are generous because this
// is reference data a pilot reads far more often than it changes.
export const STALE = {
  short: 30 * 1000,        // dashboard, jobs — move with new postings
  medium: 5 * 60 * 1000,   // logbook, CV, profile — change when the pilot edits
  long: 24 * 60 * 60 * 1000, // airline logos — a table that changes monthly
};

export const queryClient = new QueryClient({
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
export const CACHE_BUSTER = '2026-10-20.1';
