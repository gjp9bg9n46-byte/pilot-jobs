'use strict';

/**
 * Magellan Aviation Services job scraper.
 *
 * Magellan lists pilot/instructor positions on their WordPress careers page as
 * Visual Composer accordion panels. Each panel contains title + full job description.
 *
 * URL: https://www.magellanaviation.com/en/career/
 * Format: Accordion (.vc_tta-accordion) with job panels (.vc_tta-panel)
 * Reuses: extractRequirements, extractSalary, shouldIncludeByRole from normalize + workday-rest
 */

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../../config/logger');
const { extractRequirements, extractSalary } = require('../normalize');

const CAREERS_URL = 'https://www.magellanaviation.com/en/career/';
const USER_AGENT = 'CockpitHire/1.0 (jobs@cockpithire.com)';

// ─── Aviation role filter (imported from workday-rest logic) ───────────────────

const INCLUDE_ROLES = /\b(pilot|captain|first\s+officer|fo\b|pic\b|sic\b|second\s+in\s+command|flight\s+instructor|sim\s+instructor|check\s+airman|check\s+pilot|flight\s+engineer|cruise\s+pilot|relief\s+pilot)\b/i;
const EXCLUDE_ROLES = /\b(flight\s+attendant|cabin\s+(?:crew|manager|attendant)|dispatcher|ground\s+\w+|ramp\s+\w+|cargo\s+handler|mechanic|technician|a&p|avionics|admin|accountant|analyst|manager|operations|lead|coordinator|specialist|representative)\b/i;

function shouldIncludeByRole(title) {
  if (!title) return false;
  const includesRole = INCLUDE_ROLES.test(title);
  const excludesRole = EXCLUDE_ROLES.test(title);
  const isChiefPilot = /\bchief\s+pilot\b/i.test(title);
  const isFltOpsManager = /\bflight\s+operations\s+manager\b/i.test(title);
  if ((isChiefPilot || isFltOpsManager) && excludesRole) return true;
  if (includesRole && excludesRole) return false;
  return includesRole;
}

// ─── Main scraper ─────────────────────────────────────────────────────────────

async function fetchMagellan(empConfig) {
  const { company } = empConfig;
  const results = [];

  logger.info({ source: 'MAGELLAN', company, url: CAREERS_URL, msg: 'fetching' });

  let html;
  try {
    const resp = await axios.get(CAREERS_URL, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });
    if (resp.status !== 200) {
      logger.error({ source: 'MAGELLAN', company, status: resp.status, msg: 'fetch failed' });
      return [];
    }
    html = resp.data;
  } catch (err) {
    logger.error({ source: 'MAGELLAN', company, err: err.message, msg: 'fetch error' });
    return [];
  }

  // Parse HTML
  const $ = cheerio.load(html);

  // Find all accordion panels (each is one job)
  const panels = $('.vc_tta-panel');
  logger.info({ source: 'MAGELLAN', company, panelCount: panels.length, msg: 'panels found' });

  // Process each job panel
  panels.each((idx, panelEl) => {
    try {
      // Extract title from panel heading
      const titleEl = $(panelEl).find('.vc_tta-panel-title span.vc_tta-title-text');
      const title = titleEl.text().trim();
      if (!title) {
        logger.debug({ source: 'MAGELLAN', panelIndex: idx, msg: 'no title found' });
        return; // continue to next
      }

      // Filter by aviation role before extracting details
      if (!shouldIncludeByRole(title)) {
        logger.debug({ source: 'MAGELLAN', title, msg: 'skipped by role filter' });
        return;
      }

      // Extract full description from panel body
      const bodyEl = $(panelEl).find('.vc_tta-panel-body');
      const description = bodyEl.text().trim();

      // Try to extract location from description (usually "Region" or location line)
      // Magellan format: "Job Summary ... Job Summary ... [Location]"
      const locMatch = description.match(/(?:Base|Location|Region)[:\s]+([A-Za-z\s,-]+?)(?:\.|,|$)/i);
      const location = locMatch ? locMatch[1].trim() : '';

      // Construct apply URL (Magellan uses their careers page)
      const applyUrl = CAREERS_URL;
      const sourceUrl = applyUrl; // Same page for all jobs

      // Build external ID from title (stable across runs if title doesn't change)
      const externalId = title.replace(/\W+/g, '_').slice(-80);

      // Extract requirements and salary
      const reqs = extractRequirements(description);
      const salary = extractSalary(description) || {};

      const normalized = {
        sourcePlatform: 'MAGELLAN',
        externalId,
        title,
        company,
        location,
        country: 'Canada', // Magellan is based in Canada (Quebec)
        description,
        applyUrl,
        sourceUrl,
        postedAt: new Date(),
        expiresAt: null,
        contractType: null,
        region: 'Americas',
        ...reqs,
        ...salary,
      };

      results.push(normalized);
      logger.debug({ source: 'MAGELLAN', title, msg: 'job extracted' });
    } catch (err) {
      logger.error({ source: 'MAGELLAN', panelIndex: idx, err: err.message, msg: 'panel parse error' });
    }
  });

  logger.info({ source: 'MAGELLAN', company, total: results.length, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchMagellan };
