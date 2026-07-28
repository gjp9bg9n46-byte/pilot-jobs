'use strict';

/**
 * iCIMS (careersite) source.
 *
 * Public, unauthenticated career portal used by iCIMS-hosted employers:
 *   List:   https://{subdomain}.icims.com/jobs/search?searchKeyword={kw}&pr={page}&in_iframe=1
 *   Detail: https://{subdomain}.icims.com/jobs/{id}/{slug}/job
 * The list page renders one <a class="iCIMS_Anchor"> per posting (href = the
 * DIRECT iCIMS job URL, title = "{id} - {Job Title}"). Each detail page embeds a
 * schema.org JSON-LD JobPosting (title / description / location / datePosted) —
 * the clean, tenant-agnostic data source we parse.
 *
 * applyUrl is always the direct *.icims.com job URL — the carrier's own ATS
 * portal — never an aggregator redirect.
 *
 * All fetches go through http.js (identifiable User-Agent + robots.txt +
 * rate-limit + retry), so this stays polite and within each site's terms.
 *
 * Config (employers.js):
 *   { source: 'ICIMS',
 *     icims: { subdomain: 'careers-solairus', keyword?: 'pilot',
 *              maxPages?: 3, maxDetails?: 40 },
 *     company: 'Solairus Aviation', country?, region? }
 */

const cheerio = require('cheerio');
const logger = require('../../config/logger');
const { fetchHTML } = require('../http');
const { extractRequirements, extractSalary, htmlToText } = require('../normalize');

// Only fetch detail pages for postings that look like a flying role — avoids
// hammering the site for the many non-pilot roles a mixed careersite lists
// ("Client Aviation Manager", "Flight Coordinator", "Maintenance Technician").
// The authoritative fixed-wing filter still runs later in the pipeline.
const PILOT_TITLE_RE = /\b(pilot|captain|first\s+officer|co-?pilot|f\/o|\bfo\b|\bsic\b|\bpic\b|aviator)\b/i;

function roleFromTitle(title) {
  if (/captain|commander|\bpic\b/i.test(title)) return 'CAPTAIN';
  if (/first\s+officer|co-?pilot|f\/o|\bfo\b|\bsic\b/i.test(title)) return 'FIRST_OFFICER';
  if (/instructor|check\s*airman|\btri\b|\btre\b/i.test(title)) return 'INSTRUCTOR';
  return null;
}

// Pull the schema.org JobPosting out of a detail page's <script type="ld+json">.
function parseJsonLd(html) {
  const $ = cheerio.load(html);
  let posting = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (posting) return;
    const raw = $(el).contents().text();
    if (!raw || !/JobPosting/.test(raw)) return;
    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      posting = arr.find((o) => o && o['@type'] === 'JobPosting') || null;
    } catch { /* malformed block — ignore */ }
  });
  return posting;
}

function locationFromPosting(posting) {
  const loc = posting?.jobLocation;
  const one = Array.isArray(loc) ? loc[0] : loc;
  const addr = one?.address || {};
  const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
    .filter((v) => v && !/^unavailable$/i.test(String(v)));
  return { location: parts.join(', '), country: addr.addressCountry || null };
}

async function fetchIcims(empConfig) {
  const cfg = empConfig.icims || {};
  const subdomain = cfg.subdomain;
  if (!subdomain) {
    logger.warn({ source: 'ICIMS', employer: empConfig.company, msg: 'missing icims.subdomain config — skipping' });
    return [];
  }
  const base = `https://${subdomain}.icims.com`;
  const keyword = cfg.keyword || 'pilot';
  const maxPages = cfg.maxPages || 3;
  const maxDetails = cfg.maxDetails || 40;

  // ── 1. Collect candidate job anchors from the paginated search ──
  const seen = new Set();
  const candidates = [];
  for (let page = 0; page < maxPages; page++) {
    const listUrl = `${base}/jobs/search?searchKeyword=${encodeURIComponent(keyword)}&pr=${page}&in_iframe=1`;
    let html;
    try {
      html = await fetchHTML(listUrl, { source: 'ICIMS' });
    } catch (err) {
      logger.error({ source: 'ICIMS', employer: empConfig.company, page, err: err.message, msg: 'list fetch failed' });
      break;
    }
    const $ = cheerio.load(html);
    const before = candidates.length;
    $('a.iCIMS_Anchor').each((_, el) => {
      const href = $(el).attr('href') || '';
      const rawTitle = ($(el).attr('title') || $(el).text() || '').trim();
      const m = href.match(/\/jobs\/(\d+)\//);
      if (!m) return;
      const id = m[1];
      if (seen.has(id)) return;
      // title attr is "{id} - {Title}"; strip the leading id.
      const title = rawTitle.replace(/^\s*\d+\s*-\s*/, '').trim();
      if (!title || !PILOT_TITLE_RE.test(title)) return; // skip non-flying roles
      seen.add(id);
      candidates.push({ id, title, url: `${base}/jobs/${id}/job` });
    });
    logger.info({ source: 'ICIMS', employer: empConfig.company, page, newAnchors: candidates.length - before, msg: 'list page parsed' });
    if (candidates.length === before) break; // no new pilot rows → stop paging
  }

  // ── 2. Fetch each candidate's detail page → JSON-LD JobPosting ──
  const results = [];
  for (const c of candidates.slice(0, maxDetails)) {
    let html;
    try {
      html = await fetchHTML(`${c.url}?in_iframe=1`, { source: 'ICIMS' });
    } catch (err) {
      logger.warn({ source: 'ICIMS', employer: empConfig.company, id: c.id, err: err.message, msg: 'detail fetch failed' });
      continue;
    }
    const posting = parseJsonLd(html);
    const title = (posting?.title || c.title).trim();
    const description = posting?.description ? htmlToText(posting.description) : title;
    const { location, country } = locationFromPosting(posting);
    const text = `${title} ${description}`;

    results.push({
      sourcePlatform: 'ICIMS',
      externalId: `${subdomain}-${c.id}`,
      title,
      company: empConfig.company,
      location: location || empConfig.defaultLocation || '',
      country: country || empConfig.country || null,
      description,
      applyUrl: c.url,   // direct iCIMS carrier ATS URL
      sourceUrl: c.url,
      postedAt: posting?.datePosted ? new Date(posting.datePosted) : new Date(),
      expiresAt: posting?.validThrough ? new Date(posting.validThrough) : null,
      role: roleFromTitle(title),
      contractType: null,
      region: empConfig.region || null,
      salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      ...extractRequirements(text),
      ...(extractSalary(description) || {}),
    });
  }

  logger.info({ source: 'ICIMS', employer: empConfig.company, candidates: candidates.length, parsed: results.length, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchIcims };
