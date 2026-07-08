'use strict';

/**
 * Adzuna source — official job-search API (https://developer.adzuna.com).
 *
 * Legal/ethical: Adzuna's API exists precisely for programmatic job
 * distribution; every job links back to the original posting via Adzuna's
 * redirect URL. Free tier requires an app_id + app_key.
 *
 * Coverage here: Europe (per-country endpoints). Countries are configurable via
 * ADZUNA_COUNTRIES (comma-separated ISO codes from Adzuna's supported list).
 *
 * Env:
 *   ADZUNA_APP_ID / ADZUNA_APP_KEY   — required (free registration)
 *   ADZUNA_COUNTRIES                 — optional, default 'gb,fr,de,it,es,nl,pl,at'
 *   ADZUNA_MAX_PAGES                 — optional pages per query (50 results/page), default 2
 *
 * All results flow through the shared aviation title filter (fixed-wing pilot
 * roles only) — do NOT set skipFilter on this source's config entry.
 */

const logger = require('../../config/logger');
const { fetchJSON } = require('../http');
const { extractRequirements } = require('../normalize');

const COUNTRY_NAMES = {
  gb: 'United Kingdom', fr: 'France', de: 'Germany', it: 'Italy', es: 'Spain',
  nl: 'Netherlands', pl: 'Poland', at: 'Austria', be: 'Belgium', ch: 'Switzerland',
  us: 'United States', ca: 'Canada', au: 'Australia', nz: 'New Zealand',
  za: 'South Africa', in: 'India', sg: 'Singapore', mx: 'Mexico', br: 'Brazil',
};
const EUROPE = new Set(['gb', 'fr', 'de', 'it', 'es', 'nl', 'pl', 'at', 'be', 'ch']);

// Two searches per country: 'pilot' plus the exact phrase 'first officer'
// (FO postings don't always contain the word 'pilot').
const QUERIES = [
  { param: 'what', value: 'pilot' },
  { param: 'what_phrase', value: 'first officer' },
];

function regionFor(code) {
  if (EUROPE.has(code)) return 'Europe';
  if (code === 'us' || code === 'ca' || code === 'mx' || code === 'br') return 'Americas';
  if (code === 'za') return 'Africa';
  return null;
}

function inferRole(title) {
  const t = String(title || '').toLowerCase();
  if (/captain|commander/.test(t)) return 'CAPTAIN';
  if (/first officer|f\/o|co-?pilot|second officer/.test(t)) return 'FIRST_OFFICER';
  if (/instructor/.test(t)) return 'INSTRUCTOR';
  return null;
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function normalizeAdzunaJob(item, countryCode) {
  if (!item?.id || !item.title || !item.redirect_url) return null;
  const description = stripHtml(item.description);
  const reqs = extractRequirements(description);

  // Only trust salary figures the employer actually posted — Adzuna marks
  // machine-estimated salaries with salary_is_predicted='1'; we skip those so
  // no invented data reaches pilots.
  const salaryReal = item.salary_is_predicted !== '1' && item.salary_is_predicted !== 1;

  return {
    sourcePlatform: 'ADZUNA',
    externalId:     String(item.id),
    title:          item.title.trim(),
    company:        item.company?.display_name?.trim() || 'Unknown employer',
    location:       item.location?.display_name || COUNTRY_NAMES[countryCode] || '',
    country:        COUNTRY_NAMES[countryCode] || null,
    description,
    applyUrl:       item.redirect_url,
    sourceUrl:      item.redirect_url,
    postedAt:       item.created ? new Date(item.created) : new Date(),
    expiresAt:      null,
    role:           inferRole(item.title),
    contractType:   item.contract_time === 'part_time' ? 'part_time' : item.contract_time === 'full_time' ? 'full_time' : null,
    region:         regionFor(countryCode),
    ...(salaryReal && item.salary_min ? { salaryMin: Math.round(item.salary_min) } : {}),
    ...(salaryReal && item.salary_max ? { salaryMax: Math.round(item.salary_max) } : {}),
    ...reqs,
  };
}

async function fetchAdzuna() {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    logger.warn({ source: 'ADZUNA', msg: 'ADZUNA_APP_ID or ADZUNA_APP_KEY not set — skipping. Register free at developer.adzuna.com.' });
    return [];
  }

  const countries = (process.env.ADZUNA_COUNTRIES || 'gb,fr,de,it,es,nl,pl,at')
    .split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
  const maxPages = Math.max(1, parseInt(process.env.ADZUNA_MAX_PAGES || '2', 10));

  const seen = new Set();
  const results = [];

  for (const country of countries) {
    for (const q of QUERIES) {
      for (let page = 1; page <= maxPages; page++) {
        const url =
          `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}` +
          `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}` +
          `&results_per_page=50&${q.param}=${encodeURIComponent(q.value)}&content-type=application/json`;
        let data;
        try {
          data = await fetchJSON(url, { source: 'ADZUNA' });
        } catch (err) {
          logger.error({ source: 'ADZUNA', country, query: q.value, page, err: err.message, msg: 'fetch failed' });
          break;
        }
        const items = data?.results || [];
        for (const item of items) {
          const normalized = normalizeAdzunaJob(item, country);
          if (!normalized || seen.has(normalized.externalId)) continue;
          seen.add(normalized.externalId);
          results.push(normalized);
        }
        logger.info({ source: 'ADZUNA', country, query: q.value, page, fetched: items.length, cumulative: results.length, msg: 'page fetched' });
        if (items.length < 50) break; // last page
      }
    }
  }

  return results;
}

module.exports = { fetchAdzuna };
