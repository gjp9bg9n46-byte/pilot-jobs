'use strict';

/**
 * SmartRecruiters source — public REST API, no auth required.
 *
 * List:   GET https://api.smartrecruiters.com/v1/companies/{id}/postings?limit=100
 * Detail: GET https://api.smartrecruiters.com/v1/companies/{id}/postings/{postingId}
 *
 * Strategy: fetch the full listing, filter to aviation titles immediately
 * (before detail fetches), then fetch descriptions only for pilot roles.
 * This keeps HTTP requests proportional to actual pilot openings, not the
 * total headcount of large carriers like Ryanair (~300+ postings at any time).
 */

const { fetchJSON, RobotsDisallowedError, AntiBotBlockedError } = require('../http');
const { isAviationRole } = require('../filters');
const logger = require('../../config/logger');

const BASE = 'https://api.smartrecruiters.com/v1/companies';

/**
 * Fetch all pages of the job listing for a SmartRecruiters employer.
 * Returns summary objects (no description yet).
 */
async function fetchAllListings(slug) {
  const allItems = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const url = `${BASE}/${slug}/postings?limit=${limit}&offset=${offset}`;
    const data = await fetchJSON(url, { source: `SMARTRECRUITERS:${slug}` });

    if (!Array.isArray(data?.content)) break;
    allItems.push(...data.content);

    if (allItems.length >= (data.totalFound || 0)) break;
    offset += limit;
    if (data.content.length < limit) break; // guard: last page was short
  }

  return allItems;
}

/**
 * Fetch full posting detail (includes jobAd.sections with description HTML).
 * Returns null on failure so the caller can fall back to the summary object.
 */
async function fetchDetail(slug, postingId) {
  try {
    const url = `${BASE}/${slug}/postings/${postingId}`;
    return await fetchJSON(url, { source: `SMARTRECRUITERS:${slug}` });
  } catch {
    return null;
  }
}

/**
 * Fetch all active pilot postings for a SmartRecruiters employer.
 *
 * @param {object} empConfig  must have { slug, company }
 * @returns {Promise<import('../types').RawJob[]>}
 */
async function fetchSmartRecruiters(empConfig) {
  const { slug, company } = empConfig;

  let listings;
  try {
    listings = await fetchAllListings(slug);
  } catch (err) {
    if (err instanceof RobotsDisallowedError) {
      logger.warn({ source: 'SMARTRECRUITERS', slug, msg: 'robots.txt blocked — skipping' });
      return [];
    }
    if (err instanceof AntiBotBlockedError) {
      logger.error({ source: 'SMARTRECRUITERS', slug, msg: 'anti-bot block — skipping' });
      return [];
    }
    logger.error({ source: 'SMARTRECRUITERS', slug, err: err.message, msg: 'listing fetch failed' });
    return [];
  }

  // Pre-filter by title before expensive detail fetches
  const pilotListings = listings.filter((p) => isAviationRole(p.name || ''));
  logger.info({ source: 'SMARTRECRUITERS', slug, total: listings.length, pilotFiltered: pilotListings.length, msg: 'pre-filter done' });

  // Fetch detail for each pilot posting to get description HTML
  const detailed = [];
  for (const listing of pilotListings) {
    const detail = await fetchDetail(slug, listing.id);
    detailed.push({
      sourcePlatform: 'SMARTRECRUITERS',
      externalId: listing.id,
      _summary: listing,
      _detail: detail,
      _company: company,
    });
  }

  return detailed;
}

module.exports = { fetchSmartRecruiters };
