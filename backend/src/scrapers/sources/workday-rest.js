'use strict';

/**
 * Workday REST API scraper.
 *
 * Uses the public JSON API endpoint (not Puppeteer) to fetch job listings and detail pages.
 * Workday job pages include JSON-LD structured data which is extracted for full requirements.
 *
 * Workflow:
 *   1. POST to {tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
 *   2. For each job in the listing, fetch the detail page and extract JSON-LD
 *   3. Run extractRequirements + extractSalary on the extracted data
 *   4. Filter by aviation role (exclude flight attendants, mechanics, admins, etc.)
 *   5. Upsert by sourceUrl
 */

const axios = require('axios');
const logger = require('../../config/logger');
const { extractRequirements, extractSalary } = require('../normalize');

const RATE_LIMIT_MS = 1500;  // 1.5s stagger between requests
const MAX_PAGINATION_ITERATIONS = 10;
const LIST_PAGE_SIZE = 10;  // Southwest API returns 400 if limit > 50; use 10 for safety

// Polite User-Agent for Workday REST API
const USER_AGENT = 'CockpitHire/1.0 (jobs@cockpithire.com)';

// ─── Aviation role filter ──────────────────────────────────────────────────────

// Titles that INCLUDE pilot/aviation roles
const INCLUDE_ROLES = /\b(pilot|captain|first\s+officer|fo\b|pic\b|sic\b|second\s+in\s+command|flight\s+instructor|sim\s+instructor|check\s+airman|check\s+pilot|flight\s+engineer|cruise\s+pilot|relief\s+pilot)\b/i;

// Titles that EXCLUDE non-pilot roles (even if "pilot" appears in description)
const EXCLUDE_ROLES = /\b(flight\s+attendant|cabin\s+(?:crew|manager|attendant)|dispatcher|ground\s+\w+|ramp\s+\w+|cargo\s+handler|mechanic|technician|a&p|avionics|admin|accountant|analyst|manager|operations|lead|coordinator|specialist|representative)\b/i;

/**
 * Check if a job title should be scraped based on role keywords.
 * Default to skip if both include and exclude keywords match (avoid false positives).
 * Exception: "Chief Pilot" and "Flight Operations Manager" are included.
 */
function shouldIncludeByRole(title) {
  if (!title) return false;

  const includesRole = INCLUDE_ROLES.test(title);
  const excludesRole = EXCLUDE_ROLES.test(title);

  // Exception: Chief Pilot and Flight Operations Manager are acceptable
  const isChiefPilot = /\bchief\s+pilot\b/i.test(title);
  const isFltOpsManager = /\bflight\s+operations\s+manager\b/i.test(title);
  if ((isChiefPilot || isFltOpsManager) && excludesRole) return true;

  // Both match: default to skip
  if (includesRole && excludesRole) return false;

  // Include only if it matches an include role
  return includesRole;
}

// ─── JSON-LD extraction (reused from workday-enrichment.js) ───────────────────

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const PERIOD_MAP = { YEAR: 'year', ANNUAL: 'year', MONTH: 'month', HOUR: 'hour', WEEK: 'week' };

function extractWorkdayJsonLd(html) {
  if (!html) return null;

  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const raw = JSON.parse(m[1].trim());
      const candidates = Array.isArray(raw) ? raw : [raw];
      const posting = candidates.find((d) => d?.['@type'] === 'JobPosting');
      if (posting) return _parsePosting(posting);
    } catch {
      // malformed block — try next
    }
  }
  return null;
}

function _parsePosting(p) {
  let salaryMin = null, salaryMax = null, salaryCurrency = null, salaryPeriod = null;
  const bs = p.baseSalary;
  if (bs) {
    salaryCurrency = bs.currency || null;
    const val = bs.value || bs;
    if (val) {
      const rawMin = val.minValue ?? val.value ?? null;
      const rawMax = val.maxValue ?? val.value ?? null;
      salaryMin = rawMin != null ? Number(rawMin) : null;
      salaryMax = rawMax != null ? Number(rawMax) : null;
      if (isNaN(salaryMin)) salaryMin = null;
      if (isNaN(salaryMax)) salaryMax = null;
      salaryPeriod = PERIOD_MAP[(val.unitText || '').toUpperCase()] || null;
    }
  }

  const postedAt  = p.datePosted   ? _safeDate(p.datePosted)   : null;
  const expiresAt = p.validThrough ? _safeDate(p.validThrough) : null;

  const description = p.description ? stripHtml(p.description) : null;

  const reqParts = [p.qualifications, p.experienceRequirements, p.educationRequirements]
    .filter(Boolean)
    .map((t) => (typeof t === 'object' ? JSON.stringify(t) : String(t)))
    .map(stripHtml)
    .filter(Boolean);
  const reqText = reqParts.join('\n') || description || null;

  const contractType = p.employmentType || null;
  const hiringOrg = p.hiringOrganization?.name || null;

  return { salaryMin, salaryMax, salaryCurrency, salaryPeriod, postedAt, expiresAt, description, reqText, contractType, hiringOrg };
}

function _safeDate(val) {
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// ─── Fetch detail page and extract JSON-LD ──────────────────────────────────

const WORKDAY_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchDetailPage(detailUrl) {
  try {
    const resp = await axios.get(detailUrl, {
      headers: WORKDAY_HEADERS,
      timeout: 15000,
      validateStatus: (s) => s < 500,
      responseType: 'arraybuffer',
    });

    if (resp.status !== 200) {
      logger.warn({ source: 'WORKDAY_REST', url: detailUrl, status: resp.status, msg: 'detail fetch failed' });
      return null;
    }

    const html = resp.data && resp.data.length > 0 ? Buffer.from(resp.data).toString('utf-8') : null;
    if (!html) {
      logger.warn({ source: 'WORKDAY_REST', url: detailUrl, msg: 'empty detail page' });
      return null;
    }

    return extractWorkdayJsonLd(html);
  } catch (err) {
    logger.warn({ source: 'WORKDAY_REST', url: detailUrl, err: err.message, msg: 'detail fetch error' });
    return null;
  }
}

// ─── Main scraper function ─────────────────────────────────────────────────

async function fetchWorkdayRest(empConfig) {
  const configFile = empConfig.config;
  let config;

  try {
    const path = require('path');
    config = require(path.join(__dirname, 'workday-rest-configs', configFile));
  } catch (err) {
    logger.error({ source: 'WORKDAY_REST', company: empConfig.company, config: configFile, msg: 'could not load config file' });
    return [];
  }

  const { tenant, subdomain, site } = config;
  const { company } = empConfig;

  if (!tenant || !subdomain || !site) {
    logger.error({ source: 'WORKDAY_REST', company, msg: 'missing config: tenant, subdomain, site required' });
    return [];
  }

  const baseUrl = `https://${tenant}.${subdomain}.myworkdayjobs.com`;
  const listingEndpoint = `${baseUrl}/wday/cxs/${tenant}/${site}/jobs`;
  const results = [];

  logger.info({ source: 'WORKDAY_REST', company, endpoint: listingEndpoint, msg: 'starting fetch' });

  let offset = 0;
  let pageNum = 0;
  let totalJobs = null;

  while (pageNum < MAX_PAGINATION_ITERATIONS) {
    pageNum++;

    let listing;
    try {
      const resp = await axios.post(
        listingEndpoint,
        {
          limit: LIST_PAGE_SIZE,
          offset,
          appliedFacets: {},
          searchText: '',  // could filter by 'pilot' but listing already has mixed roles
        },
        {
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json' },
          timeout: 20000,
          validateStatus: (s) => s < 500,
        },
      );

      if (resp.status !== 200) {
        logger.error({ source: 'WORKDAY_REST', company, offset, status: resp.status, msg: 'listing fetch failed' });
        break;
      }

      listing = resp.data;
    } catch (err) {
      logger.error({ source: 'WORKDAY_REST', company, offset, err: err.message, msg: 'listing fetch error' });
      break;
    }

    if (!listing || !Array.isArray(listing.jobPostings)) {
      logger.warn({ source: 'WORKDAY_REST', company, offset, msg: 'no jobPostings in response' });
      break;
    }

    const { jobPostings, total } = listing;
    if (totalJobs === null) totalJobs = total;

    logger.info({ source: 'WORKDAY_REST', company, pageNum, offset, found: jobPostings.length, total: totalJobs, msg: 'page fetched' });

    // Process each job in this page
    for (const job of jobPostings) {
      // Role filter first (before fetching detail page)
      if (!shouldIncludeByRole(job.title)) {
        logger.debug({ source: 'WORKDAY_REST', title: job.title, msg: 'skipped by role filter' });
        continue;
      }

      // Build detail URL
      const detailUrl = `${baseUrl}${job.externalPath}`;

      // Fetch and parse detail page
      const parsed = await fetchDetailPage(detailUrl);
      if (!parsed) {
        logger.warn({ source: 'WORKDAY_REST', title: job.title, url: detailUrl, msg: 'no JSON-LD in detail page' });
        // Continue with partial data
      }

      // Combine description from listing + detail page
      const fullDescription = parsed?.description || job.title;
      const reqText = parsed?.reqText || '';

      // Extract requirements from combined text
      const reqs = extractRequirements(fullDescription + '\n' + reqText);

      // Extract salary from JSON-LD (prefer that) or fall back to regex
      let salary = {};
      if (parsed?.salaryMin != null || parsed?.salaryMax != null) {
        salary = {
          salaryMin: parsed.salaryMin,
          salaryMax: parsed.salaryMax,
          salaryCurrency: parsed.salaryCurrency,
          salaryPeriod: parsed.salaryPeriod,
        };
      } else {
        salary = extractSalary(fullDescription + '\n' + reqText) || {};
      }

      // Build normalized job
      const normalized = {
        sourcePlatform: 'WORKDAY_REST',
        externalId: job.bulletFields?.[0] || job.title.replace(/\W+/g, '_').slice(-50),
        title: job.title,
        company,
        location: job.locationsText,
        country: 'United States',  // Workday REST sourced jobs are US-based for now
        description: fullDescription,
        applyUrl: detailUrl,
        sourceUrl: detailUrl,
        postedAt: parsed?.postedAt || new Date(),
        expiresAt: parsed?.expiresAt || null,
        contractType: parsed?.contractType || null,
        region: 'Americas',
        ...reqs,
        ...salary,
      };

      results.push(normalized);

      // Rate limit between detail fetches
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }

    // Check if we've fetched all results
    if (jobPostings.length === 0 || offset + LIST_PAGE_SIZE >= (totalJobs || 0)) {
      break;
    }

    offset += LIST_PAGE_SIZE;

    // Rate limit between listing pages
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  if (pageNum >= MAX_PAGINATION_ITERATIONS) {
    logger.warn({ source: 'WORKDAY_REST', company, maxIterations: MAX_PAGINATION_ITERATIONS, msg: 'hard pagination cap hit' });
  }

  logger.info({ source: 'WORKDAY_REST', company, total: results.length, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchWorkdayRest };
