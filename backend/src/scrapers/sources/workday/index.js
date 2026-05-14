'use strict';

/**
 * Workday entrypoint.
 *
 * Loads the per-employer config by slug and delegates to the Puppeteer runner.
 * Only one Workday employer is scraped at a time — Puppeteer is heavy and
 * running multiple browsers concurrently would blow memory on a small server.
 */

const path = require('path');
const { scrapeWorkdayEmployer } = require('./runner');
const logger = require('../../../config/logger');

/**
 * @param {object} empConfig  must have { config: 'united' } (references a file in configs/)
 * @returns {Promise<import('../../types').RawJob[]>}
 */
async function fetchWorkday(empConfig) {
  const configFile = empConfig.config;
  let tenantConfig;

  try {
    tenantConfig = require(path.join(__dirname, 'configs', configFile));
  } catch {
    logger.error({ source: 'WORKDAY', config: configFile, msg: 'could not load employer config file' });
    return [];
  }

  // Merge employer-level overrides (company name, etc.) into the tenant config
  const merged = { ...tenantConfig, company: empConfig.company || tenantConfig.company };
  return scrapeWorkdayEmployer(merged);
}

module.exports = { fetchWorkday };
