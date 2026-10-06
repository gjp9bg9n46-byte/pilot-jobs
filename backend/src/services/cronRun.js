'use strict';

const os = require('os');
const prisma = require('../config/database');
const logger = require('../config/logger');

const HOST = os.hostname();
// Railway injects the deployed commit; fall back to any common CI var, else null.
const COMMIT = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || process.env.SOURCE_VERSION || '')
  .slice(0, 7) || null;

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
  } catch (err) {
    logger.warn(`CronRun start trace failed for ${jobName}: ${err.message}`);
  }

  const finalise = async (status, counts, error) => {
    if (!runId) return;
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

module.exports = { withCronRun };
