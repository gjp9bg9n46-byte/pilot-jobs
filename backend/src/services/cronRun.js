'use strict';

const os = require('os');
const prisma = require('../config/database');
const logger = require('../config/logger');

const HOST = os.hostname();
// Railway injects the deployed commit; fall back to any common CI var, else null.
const COMMIT = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || process.env.SOURCE_VERSION || '')
  .slice(0, 7) || null;

// A run only counts as RUNNING while a process is actually running it. Railway
// replaces the container on every deploy, and a deploy landing inside the
// 25-minute scrape window used to leave a CronRun row RUNNING for ever — which
// is how four midday cycles went missing without any record saying so. These
// are the live rows this process owns, so SIGTERM can tell the truth about them.
const inFlight = new Map();   // runId → { jobName, startedAt }

/** Longest any task legitimately runs. Past this, a RUNNING row is a corpse. */
const ORPHAN_AFTER_MIN = () => Math.max(5, parseInt(process.env.CRON_ORPHAN_AFTER_MIN || '60', 10));

// Wrap a scheduled task so every run leaves a trace: a CronRun row is written
// RUNNING at start and finalised OK/ERROR at end with timing, counts and any error.
// The trace is best-effort — a failure to write it (e.g. the table not yet migrated)
// is logged and swallowed so it can NEVER break the underlying task. `fn` may return
// a plain object of task-specific counts; anything else is ignored.
async function withCronRun(jobName, fn) {
  const startedAt = new Date();
  let runId = null;
  try {
    const row = await prisma.cronRun.create({
      data: { jobName, host: HOST, commit: COMMIT, status: 'RUNNING', startedAt },
      select: { id: true },
    });
    runId = row.id;
    inFlight.set(runId, { jobName, startedAt });
  } catch (err) {
    logger.warn(`CronRun start trace failed for ${jobName}: ${err.message}`);
  }

  const finalise = async (status, counts, error) => {
    if (!runId) return;
    inFlight.delete(runId);
    const endedAt = new Date();
    try {
      await prisma.cronRun.update({
        where: { id: runId },
        data: {
          status, endedAt, durationMs: endedAt - startedAt,
          counts: counts && typeof counts === 'object' ? counts : undefined,
          error: error ? String(error.message || error).slice(0, 1000) : undefined,
        },
      });
    } catch (err) {
      logger.warn(`CronRun end trace failed for ${jobName}: ${err.message}`);
    }
  };

  try {
    const counts = await fn();
    await finalise('OK', counts, null);
    return counts;
  } catch (err) {
    // Preserve the existing behaviour: log the failure, don't let it crash the process.
    logger.error(`Scheduled task "${jobName}" failed: ${err.message}`);
    await finalise('ERROR', null, err);
    return null;
  }
}

/**
 * Should a boot run a catch-up sweep for a cycle that was killed?
 *
 * Pure, because the failure mode is a stampede: get this wrong and a run of
 * sixteen deploys in an afternoon becomes sixteen 25-minute sweeps hammering
 * partner APIs. Every "no" is as important as the "yes".
 *
 * @param {object} st
 * @param {?number} st.hoursSinceLastSuccess  null/Infinity when there has never been one
 * @param {number}  st.intervalHours          the cron period
 * @param {boolean} st.inFlight               a sweep is running right now
 * @param {boolean} st.attemptedWithinCooldown a sweep was STARTED recently, outcome irrelevant
 * @returns {{ catchUp: boolean, reason: string }}
 */
function shouldCatchUp(st) {
  const { intervalHours, inFlight, attemptedWithinCooldown } = st;
  const hrs = st.hoursSinceLastSuccess == null ? Infinity : st.hoursSinceLastSuccess;
  // Order matters: the two safety answers come before the "yes".
  if (inFlight) return { catchUp: false, reason: 'a sweep is already in flight' };
  if (attemptedWithinCooldown) return { catchUp: false, reason: 'a sweep was attempted within the cooldown' };
  if (!(hrs > intervalHours)) return { catchUp: false, reason: 'the last successful sweep is still recent' };
  return { catchUp: true, reason: hrs === Infinity ? 'no successful sweep on record' : `last success was ${Math.round(hrs * 10) / 10}h ago` };
}

/**
 * Mark everything this process still has in flight as ABANDONED.
 *
 * Called on SIGTERM, which is what Railway sends before replacing the
 * container. It is deliberately a single updateMany with a short deadline: the
 * platform will not wait long, and an honest record written in 200ms beats a
 * perfect one that never lands.
 */
async function abandonInFlight(reason) {
  const ids = [...inFlight.keys()];
  if (!ids.length) return 0;
  const names = [...inFlight.values()].map((v) => v.jobName);
  inFlight.clear();
  try {
    const { count } = await prisma.cronRun.updateMany({
      where: { id: { in: ids }, status: 'RUNNING' },
      data: { status: 'ABANDONED', endedAt: new Date(), error: String(reason).slice(0, 1000) },
    });
    logger.warn({ msg: 'cron runs abandoned mid-flight', count, jobs: names, reason });
    return count;
  } catch (err) {
    logger.warn(`CronRun abandon trace failed: ${err.message}`);
    return 0;
  }
}

/**
 * Close out RUNNING rows left by a process that died without warning (SIGKILL,
 * OOM, a yanked container). Nothing here legitimately runs for an hour, so a
 * RUNNING row older than that belongs to a process that no longer exists.
 *
 * Run at boot, before the schedulers start, so "RUNNING" means what it says
 * and the in-flight guard below can be trusted.
 */
async function reapOrphanedRuns() {
  const cutoff = new Date(Date.now() - ORPHAN_AFTER_MIN() * 60000);
  try {
    const orphans = await prisma.cronRun.findMany({
      where: { status: 'RUNNING', startedAt: { lt: cutoff } },
      select: { id: true, jobName: true, startedAt: true, host: true, commit: true },
    });
    if (!orphans.length) return { reaped: 0, jobs: [] };
    await prisma.cronRun.updateMany({
      where: { id: { in: orphans.map((o) => o.id) } },
      data: {
        status: 'ABANDONED',
        error: `no completion recorded within ${ORPHAN_AFTER_MIN()} min — the process that started it is gone (deploy, OOM or hard kill)`,
      },
    });
    logger.warn({
      msg: 'reaped orphaned cron runs from a dead process', reaped: orphans.length,
      detail: orphans.map((o) => `${o.jobName}@${new Date(o.startedAt).toISOString().slice(0, 16)} host=${o.host || '?'} commit=${o.commit || '?'}`),
    });
    return { reaped: orphans.length, jobs: orphans.map((o) => o.jobName) };
  } catch (err) {
    logger.warn(`Orphan reap failed: ${err.message}`);
    return { reaped: 0, jobs: [] };
  }
}

/**
 * Is this job already running, here or in another container?
 *
 * A rolling deploy briefly has two containers alive, and both run the same
 * schedule. This is a soft guard, not a lock — it can race in the sub-second
 * window between two containers checking — but it reliably stops the case that
 * matters: a catch-up run piling onto a sweep that is already in progress and
 * doubling our partner-API calls.
 */
async function isJobInFlight(jobName) {
  try {
    const row = await prisma.cronRun.findFirst({
      where: { jobName, status: 'RUNNING', startedAt: { gt: new Date(Date.now() - ORPHAN_AFTER_MIN() * 60000) } },
      select: { id: true, startedAt: true, host: true },
    });
    return row || null;
  } catch { return null; }
}

/**
 * Was this job attempted at all within the last `withinMin` minutes, whatever
 * the outcome? An attempt that was itself killed still counts — that is what
 * stops a run of deploys turning into a stampede of catch-up sweeps.
 */
async function recentAttempt(jobName, withinMin) {
  try {
    return await prisma.cronRun.findFirst({
      where: { jobName, startedAt: { gt: new Date(Date.now() - withinMin * 60000) } },
      orderBy: { startedAt: 'desc' }, select: { startedAt: true, status: true },
    });
  } catch { return null; }
}

/** Newest run of a job with the given status, or null. */
async function lastRun(jobName, status = 'OK') {
  try {
    return await prisma.cronRun.findFirst({
      where: { jobName, status }, orderBy: { startedAt: 'desc' },
      select: { startedAt: true, endedAt: true, durationMs: true },
    });
  } catch { return null; }
}

/**
 * Install the shutdown handlers. Idempotent.
 *
 * SIGTERM is the deploy path and is where nearly all of these deaths come from,
 * so it gets the honest-record treatment. We do not try to finish the task —
 * the container is going away regardless.
 */
let installed = false;
function installShutdownHandlers({ onShutdown } = {}) {
  if (installed) return;
  installed = true;
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, async () => {
      logger.warn({ msg: `${sig} received — closing out in-flight cron runs`, inFlight: inFlight.size });
      await Promise.race([
        abandonInFlight(`${sig}: container replaced or stopped mid-run`),
        new Promise((r) => setTimeout(r, 4000)),      // never hang the shutdown
      ]);
      try { if (onShutdown) await onShutdown(); } catch { /* best effort */ }
      process.exit(0);
    });
  }
}

module.exports = {
  withCronRun, abandonInFlight, reapOrphanedRuns, isJobInFlight, lastRun, recentAttempt, shouldCatchUp,
  installShutdownHandlers, ORPHAN_AFTER_MIN,
  _inFlight: inFlight,
};
