'use strict';

// Client-version request tally (backward-compat measurement). Counts are incremented
// in memory per request and flushed to AppVersionStat (~60s) so they survive redeploys.
// Read via the admin-only endpoint. Keyed by UTC day + version string.

const prisma = require('../config/database');
const logger = require('../config/logger');

const deltas = new Map(); // `${day}|${version}` -> count since last flush
let timer = null;

function record(version) {
  const day = new Date().toISOString().slice(0, 10);
  const k = `${day}|${String(version || 'legacy').slice(0, 40)}`;
  deltas.set(k, (deltas.get(k) || 0) + 1);
}

async function flush() {
  if (!deltas.size) return;
  const entries = [...deltas.entries()];
  deltas.clear();
  for (const [k, n] of entries) {
    const i = k.indexOf('|');
    const day = k.slice(0, i);
    const version = k.slice(i + 1);
    try {
      await prisma.appVersionStat.upsert({
        where: { day_version: { day, version } },
        create: { day, version, count: n },
        update: { count: { increment: n } },
      });
    } catch (err) {
      // Re-queue the delta so a transient DB error doesn't lose counts.
      deltas.set(k, (deltas.get(k) || 0) + n);
      logger.warn({ source: 'APP-VERSION-STATS', err: err.message, msg: 'flush failed; re-queued' });
    }
  }
}

function start() {
  if (timer) return;
  timer = setInterval(() => { flush().catch(() => {}); }, 60_000);
  timer.unref();
}

module.exports = { record, flush, start };
