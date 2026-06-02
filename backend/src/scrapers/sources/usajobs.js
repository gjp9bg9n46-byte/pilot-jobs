'use strict';

/**
 * USAJobs.gov source — federal government pilot and aviation job listings.
 *
 * API: https://developer.usajobs.gov/
 * Auth: User-Agent header (contact email) + Authorization-Key header (free API key).
 *
 * Job Series scraped:
 *   2181 — Aircraft Operation (pilots, navigators, flight officers)
 *   2185 — Aircraft Aerial Work (aerial photography, survey, inspection pilots)
 *
 * All USAJobs positions require US work authorization — reqWorkAuthorization is
 * hardcoded to 'US'. Direct application is via usajobs.gov (no API apply).
 *
 * Rate limits: USAJobs does not publish explicit rate limits. We use conservative
 * delays (1 req/2s) to avoid overwhelming the public endpoint.
 */

const axios  = require('axios');
const logger = require('../../config/logger');
const { extractRequirements } = require('../normalize');

const BASE_URL        = 'https://data.usajobs.gov/api/search';
const RESULTS_PER_PAGE = 500;  // API max
const JOB_SERIES      = ['2181', '2185'];  // Aircraft Operation, Aircraft Aerial Work

// Salary period codes → our model values
const PERIOD_MAP = {
  PA: 'year',   // Per Annum
  PH: 'hour',   // Per Hour
  BW: null,     // Biweekly — not in our model
  WC: null,     // Without Compensation — skip
  SES: null,    // Senior Executive Schedule — no range
};

// Infer pilot role from title (most USAJobs titles don't distinguish Captain/FO)
function inferRole(title) {
  if (!title) return null;
  if (/\bcommander\b|\bchief\s+pilot\b|\bpic\b/i.test(title)) return 'CAPTAIN';
  // "First Officer" rarely appears in USAJobs titles but guard for it
  if (/\bfirst\s+officer\b|\b1st\s+officer\b/i.test(title)) return 'FIRST_OFFICER';
  return null;
}

/**
 * Parse a PositionRemuneration array into salary fields.
 */
function parseSalary(remunerations) {
  if (!Array.isArray(remunerations) || !remunerations.length) {
    return { salaryMin: null, salaryMax: null, salaryCurrency: 'USD', salaryPeriod: null };
  }
  const r = remunerations[0];
  const period = PERIOD_MAP[r.RateIntervalCode] ?? null;
  const min = parseFloat(r.MinimumRange);
  const max = parseFloat(r.MaximumRange);
  return {
    salaryMin:      isFinite(min) ? min : null,
    salaryMax:      isFinite(max) ? max : null,
    salaryCurrency: 'USD',
    salaryPeriod:   period,
  };
}

/**
 * Convert one USAJobs MatchedObjectDescriptor into a NormalizedJob.
 */
function normalizeUSAJob(item) {
  const d = item.MatchedObjectDescriptor;
  if (!d) return null;

  const positionId   = d.PositionID;
  const title        = (d.PositionTitle || '').trim();
  const org          = (d.OrganizationName || d.DepartmentName || 'U.S. Government').trim();
  const loc          = d.PositionLocation?.[0]?.LocationName || '';
  const positionUri  = d.PositionURI || '';
  const startDate    = d.PositionStartDate ? new Date(d.PositionStartDate) : new Date();
  const closeDate    = d.ApplicationCloseDate ? new Date(d.ApplicationCloseDate) : null;

  // Combine summary + qualifications for the best requirement extraction
  const details      = d.UserArea?.Details || {};
  const summary      = details.JobSummary        || '';
  const quals        = d.QualificationSummary    || '';
  const description  = [summary, quals].filter(Boolean).join('\n\n').trim();

  const reqs = extractRequirements(description);

  return {
    sourcePlatform: 'USAJOBS',
    externalId:     positionId,
    title,
    company:        org,
    location:       loc,
    country:        'United States',
    description,
    applyUrl:       positionUri,   // direct link on usajobs.gov — pilots apply there
    sourceUrl:      positionUri,
    postedAt:       startDate,
    expiresAt:      closeDate,
    role:           inferRole(title),
    contractType:   null,
    region:         'Americas',
    reqWorkAuthorization: 'US',    // all federal jobs require US work authorization
    ...parseSalary(d.PositionRemuneration),
    ...reqs,
    // Work auth overrides extractRequirements result — federal jobs are always US
    reqWorkAuthorization: 'US',
  };
}

/**
 * Fetch one page of results for a given job series code.
 */
async function fetchPage(seriesCode, page, headers) {
  const url = `${BASE_URL}?JobCategoryCode=${seriesCode}&ResultsPerPage=${RESULTS_PER_PAGE}&Page=${page}&PositionStatus=Active`;
  const resp = await axios.get(url, { headers, timeout: 20000 });
  const result = resp.data?.SearchResult;
  if (!result) throw new Error('Unexpected response shape — missing SearchResult');
  return result;
}

/**
 * Main entry point — fetches all aviation-series jobs from USAJobs.
 *
 * @returns {Promise<import('../types').RawJob[]>}  pre-normalized NormalizedJob objects
 */
async function fetchUSAJobs() {
  const apiKey  = process.env.USAJOBS_API_KEY;
  const userAgent = process.env.USAJOBS_USER_AGENT;

  if (!apiKey || !userAgent) {
    logger.warn({
      source: 'USAJOBS',
      msg: 'USAJOBS_API_KEY or USAJOBS_USER_AGENT not set — skipping. Register at developer.usajobs.gov.',
    });
    return [];
  }

  const headers = {
    'User-Agent':       userAgent,
    'Authorization-Key': apiKey,
    'Accept':           'application/json',
  };

  const seen    = new Set();
  const results = [];

  for (const series of JOB_SERIES) {
    let page = 1;
    let totalExpected = null;

    logger.info({ source: 'USAJOBS', series, msg: 'fetching series' });

    while (true) {
      let result;
      try {
        result = await fetchPage(series, page, headers);
      } catch (err) {
        logger.error({ source: 'USAJOBS', series, page, err: err.message, msg: 'fetch failed' });
        break;
      }

      const items = result.SearchResultItems || [];
      if (totalExpected === null) totalExpected = result.SearchResultCountAll ?? items.length;

      for (const item of items) {
        const normalized = normalizeUSAJob(item);
        if (!normalized) continue;
        // Deduplicate across series (some jobs appear in multiple series)
        if (seen.has(normalized.externalId)) continue;
        seen.add(normalized.externalId);
        results.push(normalized);
      }

      logger.info({
        source: 'USAJOBS', series, page,
        fetched: items.length, cumulative: results.length,
        total: totalExpected,
        msg: 'page fetched',
      });

      // Done when we've seen all items or got an empty page
      if (items.length === 0) break;

      // Are there more pages?
      const fetched = page * RESULTS_PER_PAGE;
      if (fetched >= (totalExpected ?? 0)) break;

      page++;
      // Polite delay between pages
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  logger.info({ source: 'USAJOBS', total: results.length, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchUSAJobs };
