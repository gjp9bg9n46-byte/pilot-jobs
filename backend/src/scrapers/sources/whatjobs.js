'use strict';

/**
 * WhatJobs partner-API source (aggregator, like Adzuna/Careerjet).
 *
 * Partner JSON API — one PUBLISHER ID per country (our attribution IDs):
 *   https://api.whatjobs.com/api/v1/jobs.json?publisher={ID}&user_ip={IP}
 *     &keyword={kw}&page={n}
 *   → { data: [ { title, location, url, snippet(HTML), age, age_days, salary,
 *                 logo, company, postcode, job_type } ],
 *       total, per_page, current_page, last_page, ... }  (Laravel pagination)
 *
 * `url` is the WhatJobs redirect (…/pub_api__cpl__{jobid}__{pubid}?utm…) — that
 * click is how we get paid, so it's kept intact as applyUrl (NEVER bypassed) and
 * classifies `aggregator`. `user_ip` is WhatJobs' click-attribution field: we
 * pass the requesting visitor's IP when the pipeline has one, else the server's
 * egress IP (the cron case). Snippets are truncated → the requirement floor +
 * requireContext title filter gate quality, same as the other aggregators;
 * enrichment can pull the full posting later.
 *
 * No API key — the publisher IDs below ARE the credentials (they also appear in
 * the public redirect URLs). No robots concern on the API itself; we pace calls.
 *
 * Env:
 *   WHATJOBS_COUNTRIES  — comma list of country codes to query (default: all).
 *   WHATJOBS_MAX_PAGES  — pages/query, 20 results/page (default 2).
 *   WHATJOBS_QUERIES    — comma keywords (default 'pilot,first officer,captain').
 *   WHATJOBS_USER_IP    — override the attribution IP (default: server egress IP).
 */

const axios = require('axios');
const logger = require('../../config/logger');
const { extractRequirements } = require('../normalize');

const CALL_DELAY_MS = 1200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// country code → { id: publisher, country: display name, region }
const PUBLISHERS = {
  eg:      { id: 7224, country: 'Egypt',          region: 'Africa' },
  uk:      { id: 7225, country: 'United Kingdom',  region: 'Europe' },
  ie:      { id: 7226, country: 'Ireland',         region: 'Europe' },
  de:      { id: 7227, country: 'Germany',         region: 'Europe' },
  fr:      { id: 7228, country: 'France',          region: 'Europe' },
  es:      { id: 7229, country: 'Spain',           region: 'Europe' },
  lt:      { id: 7230, country: 'Lithuania',       region: 'Europe' },
  nl:      { id: 7231, country: 'Netherlands',     region: 'Europe' },
  'de-ch': { id: 7232, country: 'Switzerland',     region: 'Europe' },
  pl:      { id: 7233, country: 'Poland',          region: 'Europe' },
  ua:      { id: 7234, country: 'Ukraine',         region: 'Europe' },
  sa:      { id: 7235, country: 'Saudi Arabia',    region: 'Middle East' },
  qa:      { id: 7236, country: 'Qatar',           region: 'Middle East' },
  cn:      { id: 7238, country: 'China',           region: 'Asia' },
  gr:      { id: 7240, country: 'Greece',          region: 'Europe' },
  'en-za': { id: 7241, country: 'South Africa',    region: 'Africa' },
  'en-ca': { id: 7243, country: 'Canada',          region: 'Americas' },
  'en-ae': { id: 7244, country: 'UAE',             region: 'Middle East' },
  it:      { id: 7245, country: 'Italy',           region: 'Europe' },
  us:      { id: 7246, country: 'United States',   region: 'Americas' },
  ma:      { id: 7247, country: 'Morocco',         region: 'Africa' },
  tn:      { id: 7248, country: 'Tunisia',         region: 'Africa' },
  dz:      { id: 7250, country: 'Algeria',         region: 'Africa' },
  bh:      { id: 7251, country: 'Bahrain',         region: 'Middle East' },
  kw:      { id: 7252, country: 'Kuwait',          region: 'Middle East' },
  om:      { id: 7253, country: 'Oman',            region: 'Middle East' },
  tr:      { id: 7254, country: 'Turkey',          region: 'Europe' },
  pt:      { id: 7255, country: 'Portugal',        region: 'Europe' },
  at:      { id: 7256, country: 'Austria',         region: 'Europe' },
  be:      { id: 7257, country: 'Belgium',         region: 'Europe' },
  no:      { id: 7258, country: 'Norway',          region: 'Europe' },
  se:      { id: 7259, country: 'Sweden',          region: 'Europe' },
  dk:      { id: 7260, country: 'Denmark',         region: 'Europe' },
  cz:      { id: 7261, country: 'Czech Republic',  region: 'Europe' },
  ro:      { id: 7262, country: 'Romania',         region: 'Europe' },
  'en-in': { id: 7263, country: 'India',           region: 'Asia' },
  'en-ph': { id: 7264, country: 'Philippines',     region: 'Asia' },
};

function inferRole(title) {
  const t = String(title || '').toLowerCase();
  if (/captain|commander/.test(t)) return 'CAPTAIN';
  if (/first officer|f\/o|co-?pilot|second officer/.test(t)) return 'FIRST_OFFICER';
  if (/instructor|instructeur/.test(t)) return 'INSTRUCTOR';
  return null;
}
function stripHtml(s) { return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim(); }

// Resolve the server egress IP once per run (WhatJobs' attribution field). The
// cron has no visitor IP, so this is the standard path; env can override.
let _ipCache = null;
async function resolveUserIp() {
  if (process.env.WHATJOBS_USER_IP) return process.env.WHATJOBS_USER_IP;
  if (_ipCache) return _ipCache;
  try {
    const { data } = await axios.get('https://api.ipify.org?format=json', { timeout: 8000 });
    _ipCache = data.ip;
  } catch { _ipCache = '127.0.0.1'; }
  return _ipCache;
}

function normalize(item, meta) {
  if (!item?.url || !item.title) return null;
  const description = stripHtml(item.snippet);
  // Stable id: the redirect path minus the utm query (…/pub_api__cpl__{id}__{pub}).
  const externalId = String(item.url).split('?')[0].replace(/^https?:\/\//, '').slice(0, 250);
  const ageDays = Number(item.age_days);
  return {
    sourcePlatform: 'WHATJOBS',
    externalId,
    title:       stripHtml(item.title),
    company:     (item.company || '').trim() || 'Unknown employer',
    location:    (item.location || '').trim() || meta.country || '',
    country:     meta.country || null,
    description,
    applyUrl:    item.url,   // paid redirect — keep intact, never bypass
    sourceUrl:   item.url,
    postedAt:    Number.isFinite(ageDays) ? new Date(Date.now() - ageDays * 86400000) : new Date(),
    expiresAt:   null,
    role:        inferRole(item.title),
    contractType: null,
    region:      meta.region || null,
    ...extractRequirements(`${item.title} ${description}`),
  };
}

async function fetchWhatJobs() {
  const codes = (process.env.WHATJOBS_COUNTRIES || Object.keys(PUBLISHERS).join(','))
    .split(',').map((c) => c.trim().toLowerCase()).filter((c) => PUBLISHERS[c]);
  // 'pilot' alone misses many; dry-run showed 'first officer' + 'captain' each
  // add ~15-20 UNIQUE roles per country, so all three are on by default.
  const queries = (process.env.WHATJOBS_QUERIES || 'pilot,first officer,captain').split(',').map((q) => q.trim()).filter(Boolean);
  const maxPages = Math.min(10, Math.max(1, parseInt(process.env.WHATJOBS_MAX_PAGES || '2', 10)));
  const userIp = await resolveUserIp();

  const seen = new Set();
  const results = [];

  for (const code of codes) {
    const meta = PUBLISHERS[code];
    let countryKept = 0;
    for (const keyword of queries) {
      for (let page = 1; page <= maxPages; page++) {
        let data;
        try {
          const resp = await axios.get('https://api.whatjobs.com/api/v1/jobs.json', {
            params: { publisher: meta.id, user_ip: userIp, keyword, page },
            headers: { Accept: 'application/json', 'User-Agent': 'CockpitHireBot/1.0 (+https://cockpithire.com)' },
            timeout: 20000,
          });
          data = resp.data;
        } catch (err) {
          logger.error({ source: 'WHATJOBS', code, keyword, page, status: err.response?.status, err: err.message, msg: 'fetch failed' });
          break;
        }
        const items = Array.isArray(data?.data) ? data.data : null;
        if (!items) {
          logger.error({ source: 'WHATJOBS', code, keyword, page, msg: 'SHAPE ALERT: no data[] array' });
          break;
        }
        for (const item of items) {
          const n = normalize(item, meta);
          if (!n || seen.has(n.externalId)) continue;
          seen.add(n.externalId);
          results.push(n);
          countryKept++;
        }
        logger.info({ source: 'WHATJOBS', code, keyword, page, fetched: items.length, cumulative: results.length, msg: 'page fetched' });
        await sleep(CALL_DELAY_MS);
        if (items.length === 0 || page >= (Number(data.last_page) || 1)) break;
      }
    }
    // Per-country zero-result signal (a live country should return something for "pilot").
    if (countryKept === 0) logger.warn({ source: 'WHATJOBS', code, publisher: meta.id, msg: 'zero results for country this run' });
  }

  logger.info({ source: 'WHATJOBS', total: results.length, countries: codes.length, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchWhatJobs, PUBLISHERS };
