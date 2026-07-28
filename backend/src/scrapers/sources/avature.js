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

async function fetchAvature(empConfig) {
  const cfg = empConfig.avature || {};
  const { host, locale, portalPath } = cfg;
  if (!host || !locale || !portalPath) {
    logger.warn({ source: 'AVATURE', employer: empConfig.company, msg: 'missing avature.host/locale/portalPath — skipping' });
    return [];
  }
  const perPage = cfg.recordsPerPage || 100;
  const maxRecords = cfg.maxRecords || 500;
  const portal = `${host}/${locale}/${portalPath}`;

  const byId = new Map();   // jobId → normalized job (first wins; dedupe)
  let total = null;
  let clampedWarned = false;

  for (let offset = 0; offset < maxRecords; offset += perPage) {
    const url = `${portal}/SearchJobs/?jobRecordsPerPage=${perPage}&jobOffset=${offset}`;
    let html;
    try {
      html = await fetchHTML(url, { source: 'AVATURE' });
    } catch (err) {
      logger.error({ source: 'AVATURE', employer: empConfig.company, offset, err: err.message, msg: 'search fetch failed' });
      break;
    }
    const $ = cheerio.load(html);

    // Total from "1-6 of 300 results" (third group).
    if (total == null) {
      const tm = $.text().match(/\d[\d,]*\s*[-–]\s*\d[\d,]*\s+of\s+([\d,]+)\s+results?/i);
      total = tm ? parseInt(tm[1].replace(/,/g, ''), 10) : null;
    }

    // Title anchors: one per job, dedup by jobId, ignore generic View/Apply anchors.
    const pageIds = new Set();
    $('a[href*="/JobDetail"]').each((_, a) => {
      const $a = $(a);
      const jobId = jobIdFromHref($a.attr('href'));
      if (!jobId) return;
      pageIds.add(jobId);
      const label = ($a.text() || '').replace(/\s+/g, ' ').trim();
      if (!label || GENERIC_ANCHOR.test(label)) return;   // not the title anchor
      if (byId.has(jobId)) return;

      const card = cardFor($, a, jobId);
      const cardText = htmlToText($.html(card));
      const summary = cardText.replace(CLOSING_RE, '').trim();
      const expiresAt = parseClosing(cardText);
      const text = `${label} ${summary}`;

      byId.set(jobId, {
        sourcePlatform: 'AVATURE',
        externalId: `${locale}-${jobId}`,
        title: label,
        company: empConfig.company,
        // Location markup varies per tenant + wasn't verifiable here; fall back to
        // the configured default. Requirement matching uses title + summary, not location.
        location: empConfig.defaultLocation || '',
        country: empConfig.country || null,
        description: summary || label,
        applyUrl: `${portal}/ApplicationMethods?jobId=${jobId}`,   // constructed, never scraped
        sourceUrl: `${portal}/JobDetail?jobId=${jobId}`,
        postedAt: new Date(),
        expiresAt,
        role: roleFromTitle(label),
        contractType: null,
        region: empConfig.region || null,
        salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
        ...extractRequirements(text),
        ...(extractSalary(summary) || {}),
      });
    });

    // Clamp detection: asked for perPage>6 but the page yielded ≤6 distinct jobs.
    if (!clampedWarned && perPage > 6 && pageIds.size > 0 && pageIds.size <= 6) {
      logger.warn({ source: 'AVATURE', employer: empConfig.company, requested: perPage, got: pageIds.size, msg: 'jobRecordsPerPage may be clamped to page default' });
      clampedWarned = true;
    }

    logger.info({ source: 'AVATURE', employer: empConfig.company, offset, pageJobs: pageIds.size, cumulative: byId.size, total, msg: 'search page parsed' });

    if (pageIds.size === 0) break;                       // no rows → done
    if (total != null && byId.size >= total) break;      // collected everything
    if (pageIds.size < perPage && pageIds.size <= 6) break; // last page (or clamped) — stop
  }

  const results = [...byId.values()];
  logger.info({ source: 'AVATURE', employer: empConfig.company, parsed: results.length, total, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchAvature };
