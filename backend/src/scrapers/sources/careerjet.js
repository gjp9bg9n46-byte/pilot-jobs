'use strict';

/**
 * Careerjet source — official public search API (careerjet.com/partners).
 *
 * Legal/ethical: Careerjet's public API exists for partner job distribution;
 * every job links back to the original posting via Careerjet's URL. Free
 * affiliate ID required.
 *
 * Why Careerjet: coverage in markets Adzuna doesn't serve — the Gulf (UAE,
 * Qatar, Saudi, Kuwait) and North Africa (Egypt, Morocco, Tunisia, Algeria) —
 * plus extra depth in Europe/Americas.
 *
 * API (v4, per careerjet.com/partners/api):
 *   GET https://search.api.careerjet.net/v4/query
 *   Basic auth: username = API key, password = empty string.
 *
 * Env:
 *   CAREERJET_API_KEY   — required (free publisher account at careerjet.com/partners)
 *   CAREERJET_LOCALES   — optional, comma-separated locale codes,
 *                         default 'en_AE,en_QA,en_SA,en_KW,en_EG,fr_MA,fr_TN,fr_DZ,en_GB,en_US'
 *   CAREERJET_MAX_PAGES — optional pages per query (100 hits/page, API max 10 pages), default 2
 *
 * Notes:
 *   - Descriptions are SNIPPETS (truncated). The requirement floor will drop
 *     English listings whose snippet shows no extractable requirements —
 *     intentional: only strong listings reach the board.
 *   - All results flow through the shared aviation title filter with
 *     requireContext, same as Adzuna/Jooble.
 */

const axios = require('axios');
const logger = require('../../config/logger');
const { extractRequirements } = require('../normalize');

const CALL_DELAY_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// locale → { country display name, region } (Careerjet locale docs)
const LOCALES = {
  en_AE: { country: 'UAE',            region: 'Middle East' },
  en_QA: { country: 'Qatar',          region: 'Middle East' },
  en_SA: { country: 'Saudi Arabia',   region: 'Middle East' },
  en_KW: { country: 'Kuwait',         region: 'Middle East' },
  en_OM: { country: 'Oman',           region: 'Middle East' },
  en_BH: { country: 'Bahrain',        region: 'Middle East' },
  en_EG: { country: 'Egypt',          region: 'Africa' },
  fr_MA: { country: 'Morocco',        region: 'Africa' },
  fr_TN: { country: 'Tunisia',        region: 'Africa' },
  fr_DZ: { country: 'Algeria',        region: 'Africa' },
  en_ZA: { country: 'South Africa',   region: 'Africa' },
  en_GB: { country: 'United Kingdom', region: 'Europe' },
  en_IE: { country: 'Ireland',        region: 'Europe' },
  en_US: { country: 'United States',  region: 'Americas' },
  en_CA: { country: 'Canada',         region: 'Americas' },
  en_AU: { country: 'Australia',      region: 'Oceania' },
  en_NZ: { country: 'New Zealand',    region: 'Oceania' },
  en_SG: { country: 'Singapore',      region: 'Asia' },
  en_HK: { country: 'Hong Kong',      region: 'Asia' },
  en_MY: { country: 'Malaysia',       region: 'Asia' },
  en_IN: { country: 'India',          region: 'Asia' },
  fr_FR: { country: 'France',         region: 'Europe' },
  de_DE: { country: 'Germany',        region: 'Europe' },
  es_ES: { country: 'Spain',          region: 'Europe' },
  it_IT: { country: 'Italy',          region: 'Europe' },
  nl_NL: { country: 'Netherlands',    region: 'Europe' },
};

const QUERIES = ['pilot', '"first officer"'];

function inferRole(title) {
  const t = String(title || '').toLowerCase();
  if (/captain|commander/.test(t)) return 'CAPTAIN';
  if (/first officer|f\/o|co-?pilot|second officer/.test(t)) return 'FIRST_OFFICER';
  if (/instructor|instructeur/.test(t)) return 'INSTRUCTOR';
  return null;
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function normalizeCareerjetJob(item, locale) {
  if (!item?.url || !item.title) return null;
  const meta = LOCALES[locale] || {};
  const description = stripHtml(item.description);
  const reqs = extractRequirements(description);
  // Careerjet has no stable numeric id — the job URL is unique per posting.
  const externalId = String(item.url).replace(/^https?:\/\//, '').slice(0, 250);

  return {
    sourcePlatform: 'CAREERJET',
    externalId,
    title:       stripHtml(item.title),
    company:     (item.company || '').trim() || 'Unknown employer',
    location:    (item.locations || '').trim() || meta.country || '',
    country:     meta.country || null,
    description,
    applyUrl:    item.url,
    sourceUrl:   item.url,
    postedAt:    item.date ? new Date(item.date) : new Date(),
    expiresAt:   null,
    role:        inferRole(item.title),
    contractType: null,
    region:      meta.region || null,
    ...(item.salary_min && Number(item.salary_min) > 0 ? { salaryMin: Math.round(Number(item.salary_min)) } : {}),
    ...(item.salary_max && Number(item.salary_max) > 0 ? { salaryMax: Math.round(Number(item.salary_max)) } : {}),
    ...(item.salary_currency_code ? { salaryCurrency: item.salary_currency_code } : {}),
    ...reqs,
  };
}

async function fetchCareerjet() {
  const apiKey = process.env.CAREERJET_API_KEY;
  if (!apiKey) {
    logger.warn({ source: 'CAREERJET', msg: 'CAREERJET_API_KEY not set — skipping. Register free at careerjet.com/partners.' });
    return [];
  }

  const locales = (process.env.CAREERJET_LOCALES || 'en_AE,en_QA,en_SA,en_KW,en_EG,fr_MA,fr_TN,fr_DZ,en_GB,en_US')
    .split(',').map((l) => l.trim()).filter((l) => LOCALES[l]);
  const maxPages = Math.min(10, Math.max(1, parseInt(process.env.CAREERJET_MAX_PAGES || '2', 10)));

  const seen = new Set();
  const results = [];

  for (const locale of locales) {
    for (const keywords of QUERIES) {
      for (let page = 1; page <= maxPages; page++) {
        let data;
        try {
          const resp = await axios.get('https://search.api.careerjet.net/v4/query', {
            params: {
              locale_code: locale,
              keywords,
              sort: 'date',
              page,
              page_size: 100,
              fragment_size: 2000, // longest excerpt available — feeds requirement extraction
              user_ip: '127.0.0.1',
              user_agent: 'CockpitHireBot/1.0 (+https://cockpithire.com)',
            },
            auth: { username: apiKey, password: '' },
            timeout: 20000,
            headers: { Accept: 'application/json' },
          });
          data = resp.data;
        } catch (err) {
          logger.error({ source: 'CAREERJET', locale, keywords, page, status: err.response?.status, err: err.message, msg: 'fetch failed' });
          break;
        }
        if (data?.type !== 'JOBS' || !Array.isArray(data.jobs)) {
          if (data?.type === 'ERROR') logger.error({ source: 'CAREERJET', locale, err: data.error, msg: 'API error' });
          break;
        }
        for (const item of data.jobs) {
          const normalized = normalizeCareerjetJob(item, locale);
          if (!normalized || seen.has(normalized.externalId)) continue;
          seen.add(normalized.externalId);
          results.push(normalized);
        }
        logger.info({ source: 'CAREERJET', locale, keywords, page, fetched: data.jobs.length, cumulative: results.length, msg: 'page fetched' });
        await sleep(CALL_DELAY_MS);
        if (page >= (data.pages || 1)) break;
      }
    }
  }

  logger.info({ source: 'CAREERJET', total: results.length, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchCareerjet };
