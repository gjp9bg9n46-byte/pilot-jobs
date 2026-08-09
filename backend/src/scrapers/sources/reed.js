'use strict';

/**
 * Reed.co.uk jobseeker API source (UK aggregator).
 *
 * Free instant API key at reed.co.uk/developers. Auth is HTTP Basic with the
 * API key as the username and an empty password.
 *   GET https://www.reed.co.uk/api/1.0/search?keywords=pilot&resultsToTake=100&resultsToSkip=0
 *   → { totalResults, results: [ { jobId, employerName, jobTitle, locationName,
 *        minimumSalary, maximumSalary, currency, date(dd/mm/yyyy), jobDescription
 *        (snippet HTML), jobUrl } ] }
 *
 * jobUrl is a reed.co.uk listing → classified `aggregator` (the pilot is
 * redirected). Descriptions are SNIPPETS — the requirement floor drops listings
 * with no extractable requirements, same as Adzuna/Careerjet; the enricher can
 * later pull the full posting. Results flow through the shared aviation title
 * filter with requireContext.
 *
 * Env: REED_API_KEY (required — no-ops without it),
 *      REED_MAX_PAGES (optional, 100 results/page, default 2).
 */

const axios = require('axios');
const logger = require('../../config/logger');
const { extractRequirements } = require('../normalize');

const QUERIES = ['pilot', 'first officer', 'flight instructor'];
const PAGE = 100;

function inferRole(title) {
  const t = String(title || '').toLowerCase();
  if (/captain|commander/.test(t)) return 'CAPTAIN';
  if (/first officer|f\/o|co-?pilot|second officer/.test(t)) return 'FIRST_OFFICER';
  if (/instructor|examiner/.test(t)) return 'INSTRUCTOR';
  return null;
}
function stripHtml(s) { return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim(); }
function parseUkDate(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}`) : new Date();
}

function normalize(item) {
  if (!item || !item.jobId || !item.jobTitle) return null;
  const description = stripHtml(item.jobDescription);
  const reqs = extractRequirements(`${item.jobTitle} ${description}`);
  return {
    sourcePlatform: 'REED',
    externalId: `reed-${item.jobId}`,
    title: stripHtml(item.jobTitle),
    company: (item.employerName || '').trim() || 'Unknown employer',
    location: (item.locationName || '').trim() || 'United Kingdom',
    country: 'United Kingdom',
    description,
    applyUrl: item.jobUrl,
    sourceUrl: item.jobUrl,
    postedAt: parseUkDate(item.date),
    expiresAt: item.expirationDate ? parseUkDate(item.expirationDate) : null,
    role: inferRole(item.jobTitle),
    contractType: null,
    region: 'Europe',
    ...(Number(item.minimumSalary) > 0 ? { salaryMin: Math.round(Number(item.minimumSalary)) } : {}),
    ...(Number(item.maximumSalary) > 0 ? { salaryMax: Math.round(Number(item.maximumSalary)) } : {}),
    ...((Number(item.minimumSalary) > 0 || Number(item.maximumSalary) > 0) ? { salaryCurrency: item.currency || 'GBP', salaryPeriod: 'year' } : {}),
    ...reqs,
  };
}

async function fetchReed() {
  const apiKey = process.env.REED_API_KEY;
  if (!apiKey) {
    logger.warn({ source: 'REED', msg: 'REED_API_KEY not set — skipping. Free key at reed.co.uk/developers.' });
    return [];
  }
  const maxPages = Math.max(1, parseInt(process.env.REED_MAX_PAGES || '2', 10));
  const auth = { username: apiKey, password: '' };
  const seen = new Set();
  const results = [];

  for (const keywords of QUERIES) {
    for (let page = 0; page < maxPages; page++) {
      let data;
      try {
        const resp = await axios.get('https://www.reed.co.uk/api/1.0/search', {
          params: { keywords, resultsToTake: PAGE, resultsToSkip: page * PAGE },
          auth,
          timeout: 20000,
          headers: { Accept: 'application/json' },
        });
        data = resp.data;
      } catch (err) {
        logger.error({ source: 'REED', keywords, page, status: err.response?.status, err: err.message, msg: 'fetch failed' });
        break;
      }
      const items = data?.results || [];
      for (const it of items) {
        const n = normalize(it);
        if (!n || seen.has(n.externalId)) continue;
        seen.add(n.externalId);
        results.push(n);
      }
      logger.info({ source: 'REED', keywords, page, fetched: items.length, total: data?.totalResults, cumulative: results.length, msg: 'page fetched' });
      if (items.length < PAGE || (page + 1) * PAGE >= (data?.totalResults || 0)) break;
    }
  }

  logger.info({ source: 'REED', parsed: results.length, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchReed };
