'use strict';

// ── Per-pilot match-context cache ─────────────────────────────────────────────
// buildMatchContext() loads the pilot with five relations, which Prisma issues as
// six queries. Measured from Cairo against prod, one round trip to the database
// costs ~300 ms, so that one call was ~1.5 s of the latency on EVERY screen:
// /jobs, /dashboard, /profile/readiness, /jobs/alerts/unread-count and the
// airline fact file all build the same context for the same pilot, often within
// the same second (the app opens several tabs' worth of requests at once).
//
// The context is derived purely from the pilot's own profile + stored totals, so
// it only changes when the pilot changes: cache it per pilot, invalidate on
// write, and keep a short TTL as a backstop for any write path that forgets to
// call invalidate. Job data is NOT part of this — jobs have their own cache.
//
// Process-local by design. Railway runs one instance; with several, each would
// hold its own copy and the TTL bounds the drift.

const { buildMatchContext } = require('./jobMatch');

const TTL_MS = 60 * 1000;
const MAX_ENTRIES = 500; // a pilot's context is a few KB; this is a safe ceiling

const cache = new Map(); // pilotId -> { at: number, ctx }
const inflight = new Map(); // pilotId -> Promise — collapses concurrent builds

const stats = { hits: 0, misses: 0, coalesced: 0, invalidations: 0 };

function prune() {
  if (cache.size <= MAX_ENTRIES) return;
  // Oldest first — Map preserves insertion order and we re-insert on refresh.
  const excess = cache.size - MAX_ENTRIES;
  let i = 0;
  for (const k of cache.keys()) {
    cache.delete(k);
    if (++i >= excess) break;
  }
}

// Drop-in replacement for buildMatchContext(pilotId, prisma).
async function getMatchContext(pilotId, prisma) {
  if (!pilotId) return null;
  const hit = cache.get(pilotId);
  if (hit && Date.now() - hit.at < TTL_MS) { stats.hits += 1; return hit.ctx; }

  // Several endpoints firing at once must not each build the same context.
  const pending = inflight.get(pilotId);
  if (pending) { stats.coalesced += 1; return pending; }

  stats.misses += 1;
  const p = buildMatchContext(pilotId, prisma)
    .then((ctx) => {
      cache.delete(pilotId); // re-insert so insertion order tracks recency
      cache.set(pilotId, { at: Date.now(), ctx });
      prune();
      return ctx;
    })
    .finally(() => inflight.delete(pilotId));
  inflight.set(pilotId, p);
  return p;
}

// Call after ANY write to the pilot's profile, licences, ratings, medicals,
// right to work, instructor ratings or logbook totals.
function invalidateMatchContext(pilotId) {
  if (!pilotId) return;
  cache.delete(pilotId);
  stats.invalidations += 1;
}

function clearMatchContextCache() { cache.clear(); inflight.clear(); }
function matchContextCacheStats() { return { ...stats, size: cache.size, ttlMs: TTL_MS }; }

module.exports = { getMatchContext, invalidateMatchContext, clearMatchContextCache, matchContextCacheStats, TTL_MS };
