'use strict';

/**
 * Pilot Career Centre source — HTML scrape of the public listings page.
 *
 * URL: https://www.pilotcareercentre.com/pilot-jobs
 *
 * All listings are aviation roles by definition (dedicated pilot job board).
 * Main listing page renders ~60 jobs as static HTML.
 *
 * For each job we resolve the REAL airline apply URL by following:
 *   GET /redirect/job/application/click/{id}
 * which returns a tiny redirect page containing window.location = 'https://...'.
 * If the redirect page has no external URL, the PCC detail page is used as
 * the fallback so the pilot can still find the job.
 *
 * Robots.txt only blocks specific named scrapers; our agent is not listed.
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const { fetchHTML, RobotsDisallowedError, AntiBotBlockedError } = require('../http');
const logger  = require('../../config/logger');

const BASE_URL = 'https://www.pilotcareercentre.com';

// Region pages that expose their job listings as static HTML.
// Each page shows jobs in that region; there is overlap with the main /pilot-jobs
// page so we deduplicate by job ID across all pages.
const REGION_PAGES = [
  `${BASE_URL}/pilot-jobs`,       // ~60 global featured jobs
  `${BASE_URL}/EUROPE-UK`,        // ~198 jobs
  `${BASE_URL}/USA`,              // ~198 jobs
  `${BASE_URL}/CANADA`,           // ~122 jobs
  `${BASE_URL}/ASIA`,             // ~37 jobs
  `${BASE_URL}/MENA`,             // ~23 jobs
  `${BASE_URL}/LATINAMERICA`,     // ~31 jobs
  `${BASE_URL}/OCEANIA`,          // ~12 jobs
  `${BASE_URL}/AFRICA`,           // ~11 jobs
];

// ─── Resolve the real airline apply URL from a PCC redirect page ──────────────

const REDIRECT_URL_RE = /window\.location\s*=\s*['"]([^'"]+)['"]/;

async function resolveApplyUrl(jobId, fallback) {
  // Try 'application' then 'url' redirect types — both give a direct job-posting link
  // when one exists. 'website' is skipped (often goes to the airline's travel site,
  // not the careers page). Falls back to the PCC detail page if neither has a link.
  for (const type of ['application', 'url']) {
    try {
      const resp = await axios.get(`${BASE_URL}/redirect/job/${type}/click/${jobId}`, {
        headers: { 'User-Agent': 'PilotJobsIngest/1.0 (+contact: jobs@cockpithire.com)' },
        timeout: 8000,
        validateStatus: (s) => s < 500,
      });
      if (resp.status !== 200) continue;

      const body = typeof resp.data === 'string' ? resp.data : '';
      if (!body) continue;

      const m = body.match(REDIRECT_URL_RE);
      if (m && m[1].startsWith('http') && !m[1].includes('pilotcareercenter')) return m[1];

      const metaM = body.match(/content=["'][^"']*URL=([^"']+)["']/i);
      if (metaM && metaM[1].startsWith('http') && !metaM[1].includes('pilotcareercenter')) return metaM[1].trim();
    } catch {
      // continue to next type
    }
  }
  return fallback;
}

/**
 * Fetch and parse all pilot job listings from Pilot Career Centre,
 * then resolve each job's real airline apply URL.
 *
 * @param {object} empConfig  { company: 'Pilot Career Centre' } (no slug needed)
 * @returns {Promise<import('../types').RawJob[]>}
 */
async function fetchPilotCareerCentre(empConfig) {
  // ── 1. Fetch all region pages and collect unique listings ────────────────
  const seen = new Set();
  const listings = [];

  for (const pageUrl of REGION_PAGES) {
    let html;
    try {
      html = await fetchHTML(pageUrl, { source: 'PILOTCAREERCENTRE' });
    } catch (err) {
      if (err instanceof RobotsDisallowedError) {
        logger.warn({ source: 'PILOTCAREERCENTRE', url: pageUrl, msg: 'robots.txt blocked — skipping page' });
        continue;
      }
      if (err instanceof AntiBotBlockedError) {
        logger.error({ source: 'PILOTCAREERCENTRE', url: pageUrl, msg: 'anti-bot block — skipping page' });
        continue;
      }
      logger.error({ source: 'PILOTCAREERCENTRE', url: pageUrl, err: err.message, msg: 'page fetch failed' });
      continue;
    }

    const $ = cheerio.load(html);

    $('a[href*="/Pilot-Job-Posting-Pilot-Opening-Pilot-Job/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const cleanPath = href.split('?')[0];
      const parts = cleanPath.split('/').filter(Boolean);
      const jobId = parts[1];
      if (!jobId || seen.has(jobId)) return;
      seen.add(jobId);

      const urlRegion   = decodeURIComponent(parts[2] || '');
      const position    = $(el).find('.position').first().text().trim()
        || decodeURIComponent(parts[3] || '').replace(/-/g, ' ');
      const aircraftRaw = $(el).find('.aircraft').first().text().trim()
        || decodeURIComponent(parts[4] || '').replace(/---/g, ' - ');
      const airline     = $(el).find('.airline').first().text().trim()
        || decodeURIComponent(parts[5] || '').replace(/-/g, ' ');

      if (!position || !airline) return;

      listings.push({ jobId, urlRegion, position, aircraftRaw, airline, detailUrl: `${BASE_URL}${cleanPath}` });
    });

    logger.info({ source: 'PILOTCAREERCENTRE', page: pageUrl, found: seen.size, msg: 'page scraped' });
  }

  logger.info({ source: 'PILOTCAREERCENTRE', fetched: listings.length, msg: 'listings parsed, resolving apply URLs' });

  // ── 3. Resolve real airline apply URLs (sequential, ~1 s/job) ────────────
  const jobs = [];
  for (const l of listings) {
    // Pause 1 s between redirect fetches — polite but faster than 3 s default
    await new Promise((r) => setTimeout(r, 1000));

    const applyUrl = await resolveApplyUrl(l.jobId, l.detailUrl);

    jobs.push({
      sourcePlatform: 'PILOTCAREERCENTRE',
      externalId: l.jobId,
      _position:    l.position,
      _aircraftRaw: l.aircraftRaw,
      _airline:     l.airline,
      _urlRegion:   l.urlRegion,
      _applyUrl:    applyUrl,
      _detailUrl:   l.detailUrl,
    });
  }

  logger.info({ source: 'PILOTCAREERCENTRE', resolved: jobs.length, msg: 'apply URLs resolved' });
  return jobs;
}

module.exports = { fetchPilotCareerCentre };
