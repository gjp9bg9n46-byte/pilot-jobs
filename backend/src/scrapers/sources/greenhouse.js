'use strict';

/**
 * Greenhouse source — board API with content=true.
 *
 * Endpoint: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
 *
 * NOTE: This endpoint is NOT officially documented as public. It is widely used
 * by third-party job aggregators and has been stable for years, but Greenhouse
 * could change or restrict it without notice. If it returns 403 or an unexpected
 * shape, this source needs to be revisited (possibly migrating to the official
 * Harvest API which requires employer permission).
 */

const { fetchJSON, RobotsDisallowedError, AntiBotBlockedError } = require('../http');
const logger = require('../../config/logger');

const BASE = 'https://boards-api.greenhouse.io/v1/boards';

/**
 * Fetch all jobs from a Greenhouse board.
 *
 * @param {object} empConfig  must have { slug, company }
 * @returns {Promise<import('../types').RawJob[]>}
 */
async function fetchGreenhouse(empConfig) {
  const { slug, company } = empConfig;
  const url = `${BASE}/${slug}/jobs?content=true`;

  let data;
  try {
    data = await fetchJSON(url, { source: `GREENHOUSE:${slug}` });
  } catch (err) {
    if (err instanceof RobotsDisallowedError) {
      logger.warn({ source: 'GREENHOUSE', slug, msg: 'robots.txt blocked — skipping' });
      return [];
    }
    if (err instanceof AntiBotBlockedError) {
      logger.error({ source: 'GREENHOUSE', slug, msg: 'anti-bot block — pausing 24h (manual action needed)' });
      return [];
    }
    logger.error({ source: 'GREENHOUSE', slug, err: err.message, msg: 'fetch failed' });
    return [];
  }

  const jobs = data?.jobs;
  if (!Array.isArray(jobs)) {
    logger.warn({ source: 'GREENHOUSE', slug, data, msg: 'unexpected response — expected { jobs: [] }' });
    return [];
  }

  return jobs.map((job) => ({
    sourcePlatform: 'GREENHOUSE',
    // Greenhouse IDs are integers; stringify for consistent externalId handling
    externalId: String(job.id),
    ...job,
    _company: company,
  }));
}

module.exports = { fetchGreenhouse };
