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
 *   WHATJOBS_QUERIES    — comma keywords (default 'pilot,first officer,airline captain,pilot captain').
 *   WHATJOBS_USER_IP    — override the attribution IP (default: server egress IP).
 */

const axios = require('axios');
const logger = require('../../config/logger');
const { extractRequirements } = require('../normalize');

const CALL_DELAY_MS = 1200;
const MAX_ATTEMPTS = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Pacing that reacts to the limiter ───────────────────────────────────────
// 1.2 s between calls has never drawn a 429 from this API (three weeks of cron
// runs, zero non-200s). But "has never" is not "cannot": a partner limiter can
// tighten without notice, and the failure mode here is the dangerous kind —
// silently fewer rows, which downstream reads as "those jobs are gone".
//
// So every call goes through getJson(), which honours Retry-After, retries a
// 429/5xx up to MAX_ATTEMPTS, and PERMANENTLY slows the rest of the sweep once
// it has seen one. A rate-limited sweep now takes longer; it does not come back
// short and quiet.
let paceMs = CALL_DELAY_MS;

function retryAfterMs(headers) {
  const h = headers && (headers['retry-after'] ?? headers['Retry-After']);
  if (h == null) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(60000, Math.max(0, secs * 1000));
  const when = Date.parse(h);                       // HTTP-date form
  return Number.isFinite(when) ? Math.min(60000, Math.max(0, when - Date.now())) : null;
}

/**
 * One API call, with backoff. Throws the last error if every attempt fails;
 * the thrown error carries `.status` and `.rateLimited` for the sweep report.
 */
async function getJson(params, tally) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      tally.calls++;
      const resp = await axios.get('https://api.whatjobs.com/api/v1/jobs.json', {
        params,
        headers: { Accept: 'application/json', 'User-Agent': 'CockpitHireBot/1.0 (+https://cockpithire.com)' },
        timeout: 20000,
      });
      return resp.data;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const limited = status === 429;
      if (limited) { tally.rateLimited++; paceMs = Math.min(10000, Math.max(paceMs * 2, 2500)); }
      else tally.httpErrors++;
      // Only a limiter or a server fault is worth retrying. A 4xx that is not
      // 429 is our mistake (bad publisher, bad param) and will not improve.
      const retryable = limited || (status >= 500) || !status;   // !status = timeout/network
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      const wait = retryAfterMs(err.response?.headers) ?? Math.min(30000, 1500 * (2 ** (attempt - 1)));
      logger.warn({ source: 'WHATJOBS', publisher: params.publisher, keyword: params.keyword, page: params.page,
        status: status || 'network', attempt, waitMs: wait, newPaceMs: paceMs, msg: 'backing off' });
      await sleep(wait);
    }
  }
  if (lastErr) { lastErr.status = lastErr.response?.status; lastErr.rateLimited = lastErr.response?.status === 429; }
  throw lastErr;
}

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

  // Batch-1 leftover IDs, resolved 2026-09-28 by probing the API once and reading
  // the returned jobs' locations: 7237→Australia, 7249→Tanzania. (7242→Saudi =
  // duplicate of sa/7235, skipped; 7239 returned nothing → still PENDING, not added.)
  au:      { id: 7237, country: 'Australia',       region: 'Oceania' },
  tz:      { id: 7249, country: 'Tanzania',        region: 'Africa' },

  // Batch 2 (registered 2026-09-28; activation pending until each country goes
  // live — unactivated ones simply return zero and are retried every cron, never
  // dropped). 7296 (en-om) and 7298 (en-qa) intentionally omitted as duplicates of
  // the existing om/qa publishers.
  ar:      { id: 7283, country: 'Argentina',           region: 'Americas' },
  bo:      { id: 7284, country: 'Bolivia',             region: 'Americas' },
  br:      { id: 7285, country: 'Brazil',              region: 'Americas' },
  cl:      { id: 7286, country: 'Chile',               region: 'Americas' },
  co:      { id: 7287, country: 'Colombia',            region: 'Americas' },
  cr:      { id: 7288, country: 'Costa Rica',          region: 'Americas' },
  do:      { id: 7289, country: 'Dominican Republic',  region: 'Americas' },
  ec:      { id: 7290, country: 'Ecuador',             region: 'Americas' },
  'en-gh': { id: 7291, country: 'Ghana',               region: 'Africa' },
  'en-id': { id: 7292, country: 'Indonesia',           region: 'Asia' },
  'en-ke': { id: 7293, country: 'Kenya',               region: 'Africa' },
  'en-my': { id: 7294, country: 'Malaysia',            region: 'Asia' },
  'en-ng': { id: 7295, country: 'Nigeria',             region: 'Africa' },
  'en-pk': { id: 7297, country: 'Pakistan',            region: 'Asia' },
  'en-sg': { id: 7299, country: 'Singapore',           region: 'Asia' },
  'en-ug': { id: 7300, country: 'Uganda',              region: 'Africa' },
  'es-mx': { id: 7301, country: 'Mexico',              region: 'Americas' },
  fi:      { id: 7302, country: 'Finland',             region: 'Europe' },
  gt:      { id: 7303, country: 'Guatemala',           region: 'Americas' },
  hk:      { id: 7304, country: 'Hong Kong',           region: 'Asia' },
  hu:      { id: 7305, country: 'Hungary',             region: 'Europe' },
  jp:      { id: 7306, country: 'Japan',               region: 'Asia' },
  kr:      { id: 7307, country: 'South Korea',         region: 'Asia' },
  lk:      { id: 7308, country: 'Sri Lanka',           region: 'Asia' },
  lu:      { id: 7309, country: 'Luxembourg',          region: 'Europe' },
  mg:      { id: 7310, country: 'Madagascar',          region: 'Africa' },
  nz:      { id: 7311, country: 'New Zealand',         region: 'Oceania' },
  pa:      { id: 7312, country: 'Panama',              region: 'Americas' },
  pe:      { id: 7313, country: 'Peru',                region: 'Americas' },
  pr:      { id: 7314, country: 'Puerto Rico',         region: 'Americas' },
  py:      { id: 7315, country: 'Paraguay',            region: 'Americas' },
  ru:      { id: 7316, country: 'Russia',              region: 'Europe' },
  sn:      { id: 7317, country: 'Senegal',             region: 'Africa' },
  sv:      { id: 7318, country: 'El Salvador',         region: 'Americas' },
  th:      { id: 7319, country: 'Thailand',            region: 'Asia' },
  uy:      { id: 7320, country: 'Uruguay',             region: 'Americas' },
  ve:      { id: 7321, country: 'Venezuela',           region: 'Americas' },
  vn:      { id: 7322, country: 'Vietnam',             region: 'Asia' },
};

// Localized primary keyword per market. WhatJobs matches the local language, so a
// Spanish/Portuguese market needs 'piloto' and a French one 'pilote' to surface
// local-language postings. The source's requireContext guard (config/employers.js)
// strips the non-aviation 'pilote/piloto' jargon downstream — same as Adzuna.
const LOCALIZED_KEYWORD = {
  // Spanish + Portuguese ('piloto' in both)
  es: 'piloto', pt: 'piloto', ar: 'piloto', bo: 'piloto', br: 'piloto', cl: 'piloto',
  co: 'piloto', cr: 'piloto', do: 'piloto', ec: 'piloto', gt: 'piloto', pa: 'piloto',
  pe: 'piloto', pr: 'piloto', py: 'piloto', sv: 'piloto', uy: 'piloto', ve: 'piloto',
  'es-mx': 'piloto',
  // French-speaking (new batch)
  lu: 'pilote', sn: 'pilote', mg: 'pilote',
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

// ── The last sweep's per-country health ─────────────────────────────────────
// Read by the runner. The point is point (c) of the fix: a country whose fetch
// FAILED must not age its jobs toward expiry, because "the API did not answer"
// and "the airline took the job down" are not the same fact and must not have
// the same consequence. Without this the pipeline treats an outage as evidence.
let _lastSweep = { at: null, countries: [] };
function lastSweepReport() { return _lastSweep; }

async function fetchWhatJobs() {
  const codes = (process.env.WHATJOBS_COUNTRIES || Object.keys(PUBLISHERS).join(','))
    .split(',').map((c) => c.trim().toLowerCase()).filter((c) => PUBLISHERS[c]);
  // 'pilot' alone misses many; 'first officer' adds unique roles. We no longer
  // query the BARE word "captain" — it floods the feed with hospitality ("F&B
  // Captain"), maritime ("Port Captain") and generic ("Team Captain") jobs. Use
  // aviation-qualified captain phrases instead (the intake classifier is the
  // safety net for anything that still slips through).
  const queries = (process.env.WHATJOBS_QUERIES || 'pilot,first officer,airline captain,pilot captain').split(',').map((q) => q.trim()).filter(Boolean);
  const maxPages = Math.min(10, Math.max(1, parseInt(process.env.WHATJOBS_MAX_PAGES || '2', 10)));
  const userIp = await resolveUserIp();

  paceMs = CALL_DELAY_MS;      // a fresh sweep starts optimistic
  const seen = new Set();
  const results = [];
  const report = [];

  for (const code of codes) {
    const meta = PUBLISHERS[code];
    // Append the market's localized keyword (piloto/pilote) to the base English
    // queries so local-language postings are found; requireContext filters noise.
    const localized = LOCALIZED_KEYWORD[code];
    const countryQueries = localized ? [...queries, localized] : queries;
    const tally = { calls: 0, rateLimited: 0, httpErrors: 0, shapeErrors: 0 };
    let countryKept = 0;
    let ok200 = 0;

    for (const keyword of countryQueries) {
      for (let page = 1; page <= maxPages; page++) {
        let data;
        try {
          data = await getJson({ publisher: meta.id, user_ip: userIp, keyword, page }, tally);
          ok200++;
        } catch (err) {
          logger.error({ source: 'WHATJOBS', code, keyword, page, status: err.status, rateLimited: !!err.rateLimited, err: err.message, msg: 'fetch failed after retries' });
          break;
        }
        const items = Array.isArray(data?.data) ? data.data : null;
        if (!items) {
          tally.shapeErrors++;
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
        await sleep(paceMs);
        if (items.length === 0 || page >= (Number(data.last_page) || 1)) break;
      }
    }

    // "Healthy" is a question about the TRANSPORT, not about the row count: a
    // country that answered every call and happens to have no pilot jobs is
    // fine, and its (zero) rows are a fact we can act on. A country that was
    // limited or errored told us nothing.
    const healthy = ok200 > 0 && tally.rateLimited === 0 && tally.httpErrors === 0 && tally.shapeErrors === 0;
    report.push({ code, country: meta.country, publisher: meta.id, rows: countryKept, ...tally, ok200, healthy });

    // Per-country zero-result signal (a live country should return something for "pilot").
    if (countryKept === 0) logger.warn({ source: 'WHATJOBS', code, publisher: meta.id, healthy, msg: 'zero results for country this run' });
  }

  _lastSweep = { at: new Date().toISOString(), countries: report };
  const unhealthy = report.filter((r) => !r.healthy);
  // The whole per-country table in one line, so the next diagnosis is a log
  // search rather than a 25-minute re-run of the sweep.
  logger.info({ source: 'WHATJOBS', total: results.length, countries: codes.length,
    unhealthy: unhealthy.map((r) => `${r.code}:${r.rateLimited ? '429' : r.httpErrors ? 'err' : r.shapeErrors ? 'shape' : 'no-call'}`),
    paceMs, table: report.map((r) => `${r.code}=${r.rows}${r.healthy ? '' : '!'}`).join(' '), msg: 'fetch complete' });
  if (unhealthy.length) {
    logger.warn({ source: 'WHATJOBS', count: unhealthy.length, codes: unhealthy.map((r) => r.code),
      msg: 'countries did NOT fetch cleanly — their jobs are protected from expiry this run' });
  }
  return results;
}

module.exports = { fetchWhatJobs, lastSweepReport, PUBLISHERS };
