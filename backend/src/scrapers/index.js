'use strict';

/**
 * Public entry point for the ingestion pipeline.
 *
 * Called by:
 *   - app.js cron schedule (every SCRAPE_INTERVAL_HOURS hours)
 *   - scripts/scrape.js (manual / CI runs)
 *
 * Scheduling note: node-cron is already configured in app.js and calls
 * runIngestion() directly. If BullMQ is added later, replace the cron call
 * in app.js with a BullMQ repeatable job pointing at this same export.
 */

const logger = require('../config/logger');
const employers = require('./config/employers');
const { runAllEmployers } = require('./runner');

/**
 * Run one full ingestion pass.
 *
 * @param {object} opts
 * @param {string}  [opts.source]    filter to one source platform ('LEVER'|'GREENHOUSE'|'WORKDAY')
 * @param {string}  [opts.employer]  filter to one employer slug or config name
 * @param {boolean} [opts.dryRun]    fetch + normalize only — don't write to DB or trigger matching
 * @returns {Promise<import('./types').IngestionStats[]>}
 */
async function runIngestion({ source, employer, dryRun = false } = {}) {
  const start = Date.now();
  logger.info({ msg: 'ingestion started', source, employer, dryRun });

  let filtered = employers;
  if (source) {
    filtered = filtered.filter((e) => e.source === source.toUpperCase());
  }
  if (employer) {
    filtered = filtered.filter(
      (e) => (e.slug || e.config || '').toLowerCase() === employer.toLowerCase(),
    );
  }

  if (!filtered.length) {
    logger.warn({ msg: 'no employers matched filter', source, employer });
    return [];
  }

  const stats = await runAllEmployers(filtered, { dryRun });

  const totals = stats.reduce(
    (acc, s) => {
      acc.fetched       += s.fetched;
      acc.kept          += s.keptAfterFilter;
      acc.upserted      += s.upserted;
      acc.markedInactive += s.markedInactive;
      acc.errors        += s.errors;
      return acc;
    },
    { fetched: 0, kept: 0, upserted: 0, markedInactive: 0, errors: 0 },
  );

  logger.info({
    msg: 'ingestion complete',
    durationMs: Date.now() - start,
    employers: filtered.length,
    ...totals,
  });

  return stats;
}

module.exports = { runIngestion };
