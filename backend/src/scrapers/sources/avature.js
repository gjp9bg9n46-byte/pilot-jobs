'use strict';

/**
 * Avature careersite / marketplace source (generic across tenants).
 *
 * Public, server-rendered portal (no headless browser needed):
 *   List:   {host}/{locale}/{portalPath}/SearchJobs/?jobRecordsPerPage={n}&jobOffset={m}
 *   Detail: {host}/{locale}/{portalPath}/JobDetail/{slug}/{jobId}
 *           {host}/{locale}/{portalPath}/JobDetail?jobId={jobId}
 *   Apply:  {host}/{locale}/{portalPath}/ApplicationMethods?jobId={jobId}
 *
 * applyUrl is always the direct Avature ApplicationMethods URL — the carrier's
 * own ATS — never an aggregator. Config-driven so other Avature tenants are
 * config-only:
 *   { source: 'AVATURE',
 *     avature: { host, locale, portalPath, recordsPerPage?, maxRecords? },
 *     company, country?, region?, defaultLocation? }
 *
 * Pagination is OFFSET-based (jobOffset), not page-number. The UI default is
 * 6/page; we override via jobRecordsPerPage and detect silent clamping.
 * Total count comes from the "1-6 of 300 results" page text (third group).
 *
 * PARSING (verified per-tenant recon — Emirates):
 *  - Anchor-driven: find every a[href*="/JobDetail"]; extract jobId from BOTH URL
 *    shapes. Do NOT rely on CSS class names (they vary per Avature tenant).
 *  - Dedupe by jobId — the "View more"/"Apply" anchors point at the same job as
 *    the title anchor.
 *  - CARD SCOPING: to read a job's per-card fields (closing date, location,
 *    summary) without leaking the FIRST job's values, DON'T take the nearest
 *    li/article/div ancestor — this tenant wraps cards in <section>, so tag-name
 *    matching climbs past the card into the shared container. Instead walk UP
 *    from the title anchor until an ancestor contains >1 distinct jobId, then
 *    step back one: that outermost single-job ancestor is the card.
 *  - applyUrl is CONSTRUCTED from jobId (not scraped), so even a mis-scoped card
 *    can never hand one job another's apply link.
 *
 * All fetches route through http.js (identifiable UA + robots.txt + rate-limit).
 * robots.txt (Emirates) allows /careersmarketplace; only *?qtvc= tracked URLs
 * are disallowed — we never request those.
 */

const cheerio = require('cheerio');
const logger = require('../../config/logger');
const { fetchHTML } = require('../http');
const { extractRequirements, extractSalary, htmlToText } = require('../normalize');

const JOBID_RE = /\/JobDetail(?:\/[^/?#]+)?\/(\d+)\b|\/JobDetail\?[^"'#]*\bjobId=(\d+)|\/ApplicationMethods\?[^"'#]*\bjobId=(\d+)/i;

function jobIdFromHref(href) {
  const m = String(href || '').match(JOBID_RE);
  return m ? (m[1] || m[2] || m[3]) : null;
}

// All distinct jobIds referenced anywhere inside a cheerio node's subtree.
function distinctJobIdsIn($, node) {
  const ids = new Set();
  $(node).find('a[href]').each((_, a) => {
    const id = jobIdFromHref($(a).attr('href'));
    if (id) ids.add(id);
  });
  return ids;
}

// Walk up from the title anchor to the outermost ancestor that still contains
// exactly this one jobId (see CARD SCOPING note above).
function cardFor($, anchorEl, jobId) {
  let card = anchorEl;
  let el = anchorEl;
  for (let hops = 0; hops < 12; hops++) {
    const parent = el.parent;
    if (!parent || parent.type !== 'tag' || parent.name === 'body' || parent.name === 'html') break;
    const ids = distinctJobIdsIn($, parent);
    if (ids.size > 1) break;      // parent is the shared container → stop
    card = parent;                // parent still scopes to just this job
    el = parent;
  }
  return card;
}

const CLOSING_RE = /Closing\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/i;
function parseClosing(text) {
  const m = String(text || '').match(CLOSING_RE);
  if (!m) return null;
  const d = new Date(m[1].replace(/-/g, ' '));
  return isNaN(d.getTime()) ? null : d;
}

function roleFromTitle(title) {
  if (/captain|commander|\bpic\b/i.test(title)) return 'CAPTAIN';
  if (/first\s+officer|co-?pilot|f\/o|\bfo\b|\bsic\b|second\s+officer/i.test(title)) return 'FIRST_OFFICER';
  if (/instructor|examiner|\btri\b|\btre\b|check\s*airman/i.test(title)) return 'INSTRUCTOR';
  return null;
}

const GENERIC_ANCHOR = /^\s*(view\s*(more|details|job)?|apply|read\s*more|see\s*more|details|save)\s*$/i;

/**
 * JSON-API mode. Some carriers front their Avature portal with a public
 * marketing jobs API (e.g. Emirates: www.emiratesgroupcareers.com/api/v1/jobs)
 * that returns structured JSON — richer + more robust than scraping the portal
 * HTML, and NOT subject to the portal's direct-navigation redirect gate. Each
 * record carries a `redirectionurl` that IS the direct Avature ApplicationMethods
 * link, which we use verbatim as applyUrl (so it classifies direct_ats).
 *
 * Config: avature: { apiUrl, idPrefix? }
 */
async function fetchAvatureApi(empConfig, cfg) {
  const idPrefix = cfg.idPrefix || String(empConfig.company || 'avature').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  let body;
  try {
    body = await fetchHTML(cfg.apiUrl, { source: 'AVATURE' });
  } catch (err) {
    logger.error({ source: 'AVATURE', employer: empConfig.company, err: err.message, msg: 'api fetch failed' });
    return [];
  }
  let rows;
  try {
    const parsed = JSON.parse(body);
    rows = Array.isArray(parsed) ? parsed : (parsed.data || parsed.jobs || parsed.results || []);
  } catch (err) {
    logger.error({ source: 'AVATURE', employer: empConfig.company, err: err.message, msg: 'api JSON parse failed' });
    return [];
  }

  const out = [];
  for (const j of rows) {
    const id = j.reqid ?? j.reqno ?? j.id;
    const title = String(j.title || '').trim();
    const applyUrl = j.redirectionurl || j.applyUrl || j.url;
    if (!id || !title || !applyUrl) continue;   // must have a real apply destination
    const description = htmlToText(j.jobdescription || j.description || '');
    const location = [...new Set([j.city, j.state, j.country].filter(Boolean))].join(', ') || j.location || empConfig.defaultLocation || '';
    const text = `${title} ${description}`;
    out.push({
      sourcePlatform: 'AVATURE',
      externalId: `${idPrefix}-${id}`,
      title,
      company: empConfig.company,
      location,
      country: j.country || empConfig.country || null,
      description: description || title,
      applyUrl,                       // direct Avature ApplicationMethods URL (from the API)
      sourceUrl: applyUrl,
      postedAt: j.postingdate ? new Date(Number(j.postingdate) || j.postingdate) : new Date(),
      expiresAt: j.closingdate ? new Date(Number(j.closingdate) || j.closingdate) : null,
      role: roleFromTitle(title),
      contractType: null,
      region: empConfig.region || null,
      salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      ...extractRequirements(text),
      ...(extractSalary(description) || {}),
    });
  }
  logger.info({ source: 'AVATURE', employer: empConfig.company, fetched: rows.length, mapped: out.length, mode: 'api', msg: 'fetch complete' });
  return out;
}

async function fetchAvature(empConfig) {
  const cfg = empConfig.avature || {};
  if (cfg.apiUrl) return fetchAvatureApi(empConfig, cfg);   // JSON-API mode (preferred where available)
  const { host, portalPath } = cfg;
  const locale = cfg.locale || '';   // optional — the avature.net host omits it
  if (!host || !portalPath) {
    logger.warn({ source: 'AVATURE', employer: empConfig.company, msg: 'missing avature.host/portalPath — skipping' });
    return [];
  }
  const perPage = cfg.recordsPerPage || 100;
  const maxRecords = cfg.maxRecords || 500;
  const portal = locale ? `${host}/${locale}/${portalPath}` : `${host}/${portalPath}`;
  // Per-tenant externalId prefix so two Avature tenants can't collide on jobId
  // (the @@unique([sourcePlatform, externalId]) is shared across all AVATURE rows).
  const tenantKey = host.replace(/^https?:\/\//, '').split('.')[0];

  const byId = new Map();   // jobId → normalized job (first wins; dedupe)
  let total = null;
  let clampedWarned = false;

  // jobRecordsPerPage is REQUESTED but the portal commonly clamps it to the
  // 6-per-page UI default (verified on a served Avature tenant). So we advance
  // jobOffset by the ACTUAL number of jobs a page returns, never by the
  // requested size — stepping by perPage would skip every job past the first
  // page. Loop until a page is empty, we've collected `total`, or hit maxRecords.
  let offset = 0;
  let guard = 0;
  while (offset < maxRecords && guard < 500) {
    guard++;
    const url = `${portal}/SearchJobs/?jobRecordsPerPage=${perPage}&jobOffset=${offset}`;
    let html;
    try {
      html = await fetchHTML(url, { source: 'AVATURE' });
    } catch (err) {
      logger.error({ source: 'AVATURE', employer: empConfig.company, offset, err: err.message, msg: 'search fetch failed' });
      break;
    }
    const $ = cheerio.load(html);

    // Total: "1-6 of 300 results" (third group), or a plain "300 results".
    if (total == null) {
      const tm = $.text().match(/\d[\d,]*\s*[-–]\s*\d[\d,]*\s+of\s+([\d,]+)\s+results?/i)
        || $.text().match(/([\d,]+)\s+results?\b/i);
      total = tm ? parseInt(tm[1].replace(/,/g, ''), 10) : null;
    }

    // One JobDetail anchor per card (the title). "View more"/"Apply" anchors are
    // generic-text or point at /ApplicationMethods, so they're filtered/deduped.
    const pageIds = new Set();
    $('a[href*="/JobDetail"]').each((_, a) => {
      const $a = $(a);
      const jobId = jobIdFromHref($a.attr('href'));
      if (!jobId) return;
      pageIds.add(jobId);
      const label = ($a.text() || '').replace(/\s+/g, ' ').trim();
      if (!label || GENERIC_ANCHOR.test(label)) return;   // not the title anchor
      if (byId.has(jobId)) return;

      // Card-scoped so each job gets ITS OWN closing date (not the first job's).
      const card = cardFor($, a, jobId);
      const expiresAt = parseClosing(htmlToText($.html(card)));

      byId.set(jobId, {
        sourcePlatform: 'AVATURE',
        externalId: `${tenantKey}-${jobId}`,
        title: label,
        company: empConfig.company,
        // Location/category live behind the card's expand toggle (lazy-loaded),
        // not in the list HTML — fall back to the configured default. Matching
        // keys off title + requirements; Avature isn't requireContext-gated.
        location: empConfig.defaultLocation || '',
        country: empConfig.country || null,
        description: label,
        applyUrl: `${portal}/ApplicationMethods?jobId=${jobId}`,   // constructed, never scraped
        sourceUrl: `${portal}/JobDetail?jobId=${jobId}`,
        postedAt: new Date(),
        expiresAt,
        role: roleFromTitle(label),
        contractType: null,
        region: empConfig.region || null,
        salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
        ...extractRequirements(label),
      });
    });

    // Clamp detection: asked for >6 but the page yielded ≤6 distinct jobs.
    if (!clampedWarned && perPage > 6 && pageIds.size > 0 && pageIds.size <= 6) {
      logger.warn({ source: 'AVATURE', employer: empConfig.company, requested: perPage, got: pageIds.size, msg: 'jobRecordsPerPage clamped to page default — paginating by actual page size' });
      clampedWarned = true;
    }

    logger.info({ source: 'AVATURE', employer: empConfig.company, offset, pageJobs: pageIds.size, cumulative: byId.size, total, msg: 'search page parsed' });

    if (pageIds.size === 0) break;                    // empty page → done
    offset += pageIds.size;                            // advance by ACTUAL page size
    if (total != null && byId.size >= total) break;    // collected everything
  }

  const results = [...byId.values()];
  logger.info({ source: 'AVATURE', employer: empConfig.company, parsed: results.length, total, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchAvature };
