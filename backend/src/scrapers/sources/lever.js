'use strict';

/**
 * Lever source — public JSON API, no auth required.
 *
 * Endpoint: https://api.lever.co/v0/postings/{slug}?mode=json
 *
 * Lever is the cleanest source: a documented JSON feed per employer slug,
 * unauthenticated, no HTML scraping needed.
 */

const { fetchJSON, RobotsDisallowedError, AntiBotBlockedError } = require('../http');
const logger = require('../../config/logger');

const BASE = 'https://api.lever.co/v0/postings';

/**
 * Fetch all active postings for a Lever employer.
 *
 * @param {object} empConfig  must have { slug, company }
 * @returns {Promise<import('../types').RawJob[]>}
 */
async function fetchLever(empConfig) {
  const { slug, company } = empConfig;
  const url = `${BASE}/${slug}?mode=json`;

  let data;
  try {
    data = await fetchJSON(url, { source: `LEVER:${slug}` });
  } catch (err) {
    if (err instanceof RobotsDisallowedError) {
      logger.warn({ source: 'LEVER', slug, msg: 'robots.txt blocked — skipping' });
      return [];
    }
    if (err instanceof AntiBotBlockedError) {
      logger.error({ source: 'LEVER', slug, msg: 'anti-bot block — pausing 24h (manual action needed)' });
      return [];
    }
    logger.error({ source: 'LEVER', slug, err: err.message, msg: 'fetch failed' });
    return [];
  }

  if (!Array.isArray(data)) {
    logger.warn({ source: 'LEVER', slug, msg: 'unexpected response shape — expected array' });
    return [];
  }

  return data.map((posting) => ({
    sourcePlatform: 'LEVER',
    externalId: posting.id,
    // Lever includes the full posting structure; normalize.js unpacks it
    ...posting,
    // Stamp the company name from our config — Lever doesn't always include it
    _company: company,
  }));
}

module.exports = { fetchLever };
