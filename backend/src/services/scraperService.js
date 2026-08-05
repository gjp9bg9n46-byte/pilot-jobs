'use strict';

/**
 * DEPRECATED — legacy scraper, retired 2026-08-05.
 *
 * This file used to scrape aviationjobsearch.com and pilotcareercentre.com
 * with hardcoded CSS selectors, writing rows with NO sourcePlatform and NO
 * lastSeenAt — which made them invisible to every staleness sweep
 * (expireUnseen skips sourcePlatform=null rows). Those immortal rows are
 * cleaned up by scripts/clear-fake-jobs.js (npm run purge:legacy).
 *
 * The real pipeline lives in src/scrapers/ (runner.js + sources/), entry
 * points:
 *   - npm run scrape          → scripts/scrape.js (manual/CI)
 *   - app.js cron             → runIngestion() every SCRAPE_INTERVAL_HOURS
 *
 * This shim forwards to the new pipeline so any forgotten caller still
 * ingests correctly instead of writing junk.
 */

const logger = require('../config/logger');
const { runIngestion } = require('../scrapers/index');

async function runScraper() {
  logger.warn('scraperService.runScraper() is deprecated — forwarding to src/scrapers runIngestion()');
  return runIngestion();
}

// Kept for backwards compatibility: the maintained implementation.
const { extractRequirements } = require('../scrapers/normalize');

module.exports = { runScraper, extractRequirements };

// Allow direct invocation (old `node src/services/scraperService.js` habit).
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
  runScraper()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
