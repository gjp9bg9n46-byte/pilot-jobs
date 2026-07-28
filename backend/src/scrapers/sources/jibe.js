'use strict';

/**
 * Jibe careers front-end source.
 *
 * Jibe (iCIMS's marketing/candidate front-end) fronts many iCIMS-hosted
 * employers. The carrier's OWN careers domain exposes a public, unauthenticated
 * JSON API that the Jibe search widget consumes:
 *   https://{host}/api/jobs?keywords={kw}&offset={o}&limit={n}
 * → { jobs: [ { data: { req_id, slug, title, description(HTML), city, country,
 *                        full_location, apply_url, posted_date,
 *                        posting_expiry_date, qualifications, responsibilities,
 *                        ... } } ],
 *     totalCount, count, ... }
 *
 * Why this and not the iCIMS HTML parser: some iCIMS tenants (e.g.
 * careers-flydubai.icims.com) serve robots.txt `Disallow: /`, so the iCIMS
 * portal is off-limits — but the carrier's own Jibe front-end (robots
 * `Allow: /`) publishes the same postings as structured JSON, and each row's
 * `apply_url` is already the DIRECT `*.icims.com/jobs/{id}/…` carrier link
 * (→ classifies direct_ats). Front-end beats the ATS backend on both
 * accessibility and data quality (full descriptions + structured location).
 *
 * Use `keywords` (plural) — the singular `keyword` param does a fuzzy match
 * that pulls in unrelated roles.
 *
 * All fetches go through http.js (identifiable UA + robots.txt + rate-limit).
 * Shape is UNDOCUMENTED and can change without notice, so every response is
 * shape-validated before use.
 *
 * Config (employers.js):
 *   { source: 'JIBE',
 *     jibe: { host: 'careers.flydubai.com', keyword?: 'pilot',
 *             idPrefix?: 'flydubai', pageSize?: 100, maxPages?: 10 },
 *     company: 'flydubai', country?, region?, defaultLocation? }
 */

const logger = require('../../config/logger');
const { fetchJSON } = require('../http');
const { extractRequirements, extractSalary, htmlToText } = require('../normalize');

function roleFromTitle(title) {
  if (/captain|commander|\bpic\b/i.test(title)) return 'CAPTAIN';
  if (/first\s+officer|co-?pilot|f\/o|\bfo\b|\bsic\b/i.test(title)) return 'FIRST_OFFICER';
  if (/instructor|check\s*airman|examiner|\btri\b|\btre\b/i.test(title)) return 'INSTRUCTOR';
  return null;
}

async function fetchJibe(empConfig) {
  const cfg = empConfig.jibe || {};
  const host = cfg.host;
  if (!host) {
    logger.warn({ source: 'JIBE', employer: empConfig.company, msg: 'missing jibe.host config — skipping' });
    return [];
  }
  const keyword = cfg.keyword || 'pilot';
  const idPrefix = cfg.idPrefix || host.split('.')[1] || host;
  const pageSize = cfg.pageSize || 100;
  const maxPages = cfg.maxPages || 10;

  const results = [];
  let total = null;
  let seenRows = 0;
  let skipped = 0;

  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const url = `https://${host}/api/jobs?keywords=${encodeURIComponent(keyword)}&offset=${offset}&limit=${pageSize}`;
    let data;
    try {
      data = await fetchJSON(url, { source: 'JIBE' });
    } catch (err) {
      logger.error({ source: 'JIBE', employer: empConfig.company, page, err: err.message, msg: 'fetch failed' });
      break;
    }

    // ── Shape validation: no jobs[] array ⇒ abort this source (returns []
    //    → the runner's zero-result guard skips expiry, no flapping). ──
    const rows = data && Array.isArray(data.jobs) ? data.jobs : null;
    if (!rows) {
      logger.error({ source: 'JIBE', employer: empConfig.company, host,
        msg: 'SHAPE ALERT: /api/jobs response has no jobs[] array — aborting source' });
      return [];
    }
    if (total == null) total = Number(data.totalCount ?? data.count ?? rows.length) || 0;

    for (const j of rows) {
      seenRows++;
      const d = j && j.data;
      const title = d ? String(d.title || '').trim() : '';
      const applyUrl = d ? String(d.apply_url || '').trim() : '';
      const reqId = d ? String(d.req_id || d.slug || '').trim() : '';
      // Require the fields we depend on; apply_url MUST be a real absolute URL
      // (the direct carrier ATS link — never construct or guess it).
      if (!d || !title || !reqId || !/^https?:\/\//i.test(applyUrl)) { skipped++; continue; }

      const descHtml = [d.description, d.responsibilities, d.qualifications].filter(Boolean).join('\n\n');
      const description = descHtml ? htmlToText(descHtml) : title;
      const location = d.full_location || d.short_location
        || [d.city, d.country].filter(Boolean).join(', ')
        || empConfig.defaultLocation || '';
      const text = `${title} ${description}`;

      results.push({
        sourcePlatform: 'JIBE',
        externalId: `${idPrefix}-${reqId}`,
        title,
        company: empConfig.company,
        location,
        country: d.country || empConfig.country || null,
        description,
        applyUrl,           // direct carrier ATS link, straight from the feed
        sourceUrl: applyUrl,
        postedAt: d.posted_date ? new Date(d.posted_date) : new Date(),
        expiresAt: d.posting_expiry_date ? new Date(d.posting_expiry_date) : null,
        role: roleFromTitle(title),
        contractType: null,
        region: empConfig.region || null,
        salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
        ...extractRequirements(text),
        ...(extractSalary(description) || {}),
      });
    }

    logger.info({ source: 'JIBE', employer: empConfig.company, page, fetched: rows.length, total, msg: 'page fetched' });
    // Clamp-safe pagination: stop by ACTUAL rows returned, not the limit param.
    if (rows.length === 0 || rows.length < pageSize || offset + rows.length >= total) break;
  }

  // Shape drift alarm: a healthy feed drops almost nothing.
  if (seenRows > 0 && skipped / seenRows > 0.25) {
    logger.error({ source: 'JIBE', employer: empConfig.company, seenRows, skipped,
      msg: 'SHAPE ALERT: >25% of rows missing title|apply_url|req_id — feed shape may have changed' });
  }

  logger.info({ source: 'JIBE', employer: empConfig.company, parsed: results.length, skipped, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchJibe };
