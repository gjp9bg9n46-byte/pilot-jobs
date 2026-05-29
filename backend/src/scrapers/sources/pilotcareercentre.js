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
const { extractRequirements, extractSalary } = require('../normalize');
const logger  = require('../../config/logger');

const BASE_URL = 'https://pilotcareercenter.com'; // US spelling, no www — direct hit

// Deduplicate <td> text: PCC renders each cell with two identical sub-elements
// (mobile + desktop). If the string is a clean self-repeat, return the first half.
function dedupTdText(raw) {
  if (!raw || raw.length < 20) return raw;
  const half = Math.floor(raw.length / 2);
  const a = raw.slice(0, half).trim();
  const b = raw.slice(half).trim();
  if (a === b) return a;
  // Near-match: b starts with the first sentence of a
  const firstSentence = (a.split(/[.\n]/)[0] || '').trim();
  if (firstSentence.length > 30 && b.trimStart().startsWith(firstSentence)) return a;
  return raw;
}

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

const REDIRECT_URL_RE   = /window\.location\s*=\s*['"]([^'"]+)['"]/;
const META_REFRESH_RE   = /content=["'][^"']*?(?:url|URL)=([^"']+)["']/i;
const PCC_DOMAIN_RE     = /pilotcareercen(?:ter|tre)\.com/i; // matches both spellings

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

      // 1. window.location = '...' (JS redirect)
      const jsM = body.match(REDIRECT_URL_RE);
      if (jsM && jsM[1].startsWith('http') && !PCC_DOMAIN_RE.test(jsM[1])) return jsM[1];

      // 2. <meta http-equiv="refresh" content="N; URL=..."> (HTML redirect)
      const metaM = body.match(META_REFRESH_RE);
      if (metaM && metaM[1].startsWith('http') && !PCC_DOMAIN_RE.test(metaM[1])) return metaM[1].trim();
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

// ─── Detail-page enrichment ───────────────────────────────────────────────────

const DETAIL_HEADERS = {
  'User-Agent': 'PilotJobsIngest/1.0 (+contact: jobs@cockpithire.com)',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Fetch a PCC detail page and return `{ text, notes }` or null on failure.
 * - text:  deduplicated #RequirementsRow td content (requirements)
 * - notes: deduplicated #NotesRow td content (benefits / compensation)
 * Uses a direct axios.get so we bypass the shared 3-s/host rate limiter.
 *
 * @param {string} url  Full PCC detail page URL (stored in Job.sourceUrl)
 * @returns {Promise<{text:string|null, notes:string|null}|null>}
 */
async function fetchPccDetailText(url) {
  const resp = await axios.get(url, {
    headers: DETAIL_HEADERS,
    timeout: 8000,
    validateStatus: (s) => s < 500,
  });
  if (resp.status !== 200) return null;

  const $ = cheerio.load(resp.data);
  const text  = dedupTdText($('#RequirementsRow td').text().trim()) || null;
  const notes = dedupTdText($('#NotesRow td').text().trim()) || null;
  return { text, notes };
}

/**
 * Enrich a single DB job row with detail-page text and extracted requirements.
 * Retries up to 3 times (500ms, 1000ms back-off) before giving up.
 *
 * @param {{ id: string, sourceUrl: string, existingDescription?: string }} job
 * @returns {Promise<object|null>}  Enriched field set, or null if all attempts fail.
 */
async function enrichOneJob(job) {
  const MAX_TRIES = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const result = await fetchPccDetailText(job.sourceUrl);
      if (!result || !result.text) return null;

      // Write guard: if the existing description is more than 2× longer than the fetched
      // content, the current DB content is richer — skip this write to avoid overwriting
      // good data with a stub-echo or shorter page snapshot.
      const existingDesc = job.existingDescription ?? job.description ?? null;
      if (existingDesc && existingDesc.length > result.text.length * 2) {
        logger.info({ id: job.id, existingLen: existingDesc.length, newLen: result.text.length, msg: 'preserved existing enrichment' });
        return null;
      }

      const reqs = extractRequirements(result.text);
      const sal  = extractSalary(result.text);
      return { id: job.id, description: result.text, notes: result.notes, ...reqs, ...(sal || {}) };
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_TRIES) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  logger.warn({ id: job.id, url: job.sourceUrl, err: lastErr?.message, msg: 'PCC detail fetch failed after 3 attempts' });
  return null;
}

/**
 * Enrich an array of DB job rows in parallel batches.
 *
 * @param {Array<{ id: string, sourceUrl: string }>} jobs
 * @param {{ onProgress?: (done: number, total: number) => void }} opts
 * @returns {Promise<Array<object|null>>}  Parallel to input; null entries = failures.
 */
async function enrichPccBatch(jobs, { onProgress } = {}) {
  const BATCH_SIZE = 5;
  const STAGGER_MS = 200;
  const results = [];

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((job, idx) =>
        new Promise((resolve) => setTimeout(resolve, idx * STAGGER_MS)).then(() => enrichOneJob(job)),
      ),
    );
    results.push(...batchResults);
    if (onProgress) onProgress(Math.min(i + BATCH_SIZE, jobs.length), jobs.length);
  }

  return results;
}

module.exports = { fetchPilotCareerCentre, fetchPccDetailText, enrichOneJob, enrichPccBatch };
