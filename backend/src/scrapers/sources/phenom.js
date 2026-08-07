'use strict';

/**
 * Phenom People careers front-end source.
 *
 * Phenom ("phApp"/phenompeople.com) is a candidate-experience front-end that
 * many carriers/operators run on their OWN careers domain (e.g. Flexjet at
 * careers.flexjet.com). Every Phenom page embeds a `phApp.ddo` JSON blob:
 *   - the search page (…/{path}/search-results?keywords={kw}) carries the first
 *     page of results under `eagerLoadRefineSearch.data.jobs` — each row has
 *     { title, jobId, cityStateCountry, city/state/country, type, category,
 *       postedDate, descriptionTeaser, applyUrl(→ the real ATS), … };
 *   - the detail page (…/{path}/job/{jobId}) embeds the FULL `description`
 *     (HTML) and a clean `<link rel=canonical>` on the carrier's domain.
 *
 * We read the search page for the listing, then each detail page for the full
 * description, and emit the carrier's own Phenom detail URL as applyUrl (the
 * candidate lands on the operator's careers site and applies from there →
 * classifies operator_direct). Robots is honoured per-URL by http.js; Phenom
 * robots typically disallows only the apply/px-widgets/chatbot paths, NOT
 * /search-results or /job/ — so both endpoints we touch are allowed. Any host
 * whose robots disallows them will simply raise RobotsDisallowedError and the
 * source aborts cleanly (returns [] → no expiry flapping).
 *
 * The embedded JSON shape is UNDOCUMENTED and can change, so the response is
 * shape-validated (no jobs[] ⇒ abort) and a >25%-skip drift alarm is raised.
 *
 * Config (employers.js):
 *   { source: 'PHENOM',
 *     phenom: { host: 'careers.flexjet.com', path?: 'us/en', keyword?: 'pilot',
 *               idPrefix?: 'flexjet', maxJobs?: 80 },
 *     company: 'Flexjet', country?, region?, defaultLocation? }
 */

const logger = require('../../config/logger');
const { fetchHTML } = require('../http');
const { extractRequirements, extractSalary, htmlToText } = require('../normalize');

function roleFromTitle(title) {
  if (/captain|commander|\bpic\b/i.test(title)) return 'CAPTAIN';
  if (/first\s+officer|co-?pilot|f\/o|\bfo\b|\bsic\b/i.test(title)) return 'FIRST_OFFICER';
  if (/instructor|check\s*airman|examiner|\btri\b|\btre\b/i.test(title)) return 'INSTRUCTOR';
  return null;
}

// HTML entities that survive inside Phenom's JSON description string.
function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
}

// Return the balanced JSON substring (array or object) starting at `start`,
// string-aware so brackets inside quoted values don't unbalance the scan.
function balancedJson(str, start) {
  const open = str[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return str.slice(start, i + 1); }
  }
  return null;
}

// Pull `eagerLoadRefineSearch.…jobs: [ … ]` out of the embedded phApp.ddo.
function extractJobsArray(html) {
  const anchor = html.indexOf('"eagerLoadRefineSearch"');
  if (anchor < 0) return null;
  const jobsKey = html.indexOf('"jobs"', anchor);
  if (jobsKey < 0) return null;
  const arrStart = html.indexOf('[', jobsKey);
  if (arrStart < 0) return null;
  const arrTxt = balancedJson(html, arrStart);
  if (!arrTxt) return null;
  try { return JSON.parse(arrTxt); } catch { return null; }
}

// Full description + canonical apply URL from a Phenom detail page.
function extractDetail(html) {
  let description = '';
  const m = html.match(/"description":"((?:[^"\\]|\\.)*)"/);
  if (m) {
    let raw;
    try { raw = JSON.parse('"' + m[1] + '"'); } catch { raw = m[1]; }
    description = decodeEntities(raw);
  }
  const c = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  return { description, canonical: c ? c[1] : null };
}

async function fetchPhenom(empConfig) {
  const cfg = empConfig.phenom || {};
  const host = cfg.host;
  if (!host) {
    logger.warn({ source: 'PHENOM', employer: empConfig.company, msg: 'missing phenom.host config — skipping' });
    return [];
  }
  const path = String(cfg.path || 'us/en').replace(/^\/|\/$/g, '');
  const keyword = cfg.keyword || 'pilot';
  const idPrefix = cfg.idPrefix || host.split('.')[1] || host;
  const maxJobs = cfg.maxJobs || 80;

  const searchUrl = `https://${host}/${path}/search-results?keywords=${encodeURIComponent(keyword)}`;
  let html;
  try {
    html = await fetchHTML(searchUrl, { source: 'PHENOM' });
  } catch (err) {
    logger.error({ source: 'PHENOM', employer: empConfig.company, err: err.message, msg: 'search fetch failed' });
    return [];
  }

  const jobs = extractJobsArray(html);
  if (!jobs) {
    logger.error({ source: 'PHENOM', employer: empConfig.company, host,
      msg: 'SHAPE ALERT: no eagerLoadRefineSearch jobs[] in phApp.ddo — aborting source' });
    return [];
  }

  const results = [];
  let skipped = 0;
  for (const d of jobs.slice(0, maxJobs)) {
    const title = String(d.title || '').trim();
    const jobId = String(d.jobId || d.jobSeqNo || '').trim();
    if (!title || !jobId) { skipped++; continue; }

    // Detail page → full HTML description + clean canonical (carrier domain).
    // On any failure, fall back to the teaser + the short /job/{id} URL (which
    // itself resolves to the canonical), so one bad detail page never drops the
    // listing.
    let descriptionHtml = '';
    let canonical = null;
    const detailUrl = `https://${host}/${path}/job/${encodeURIComponent(jobId)}`;
    try {
      const dh = await fetchHTML(detailUrl, { source: 'PHENOM' });
      const det = extractDetail(dh);
      descriptionHtml = det.description;
      canonical = det.canonical;
    } catch (err) {
      logger.warn({ source: 'PHENOM', employer: empConfig.company, jobId, err: err.message, msg: 'detail fetch failed — using teaser' });
    }

    const description = descriptionHtml
      ? htmlToText(descriptionHtml)
      : (d.descriptionTeaser ? decodeEntities(String(d.descriptionTeaser)) : title);
    const applyUrl = canonical || detailUrl; // carrier's own careers domain
    const location = d.cityStateCountry || d.location
      || [d.city, d.state, d.country].filter(Boolean).join(', ')
      || empConfig.defaultLocation || '';
    const text = `${title} ${description}`;

    results.push({
      sourcePlatform: 'PHENOM',
      externalId: `${idPrefix}-${jobId}`,
      title,
      company: empConfig.company,
      location,
      country: d.country || empConfig.country || null,
      description,
      applyUrl,
      sourceUrl: applyUrl,
      postedAt: d.postedDate ? new Date(d.postedDate) : new Date(),
      expiresAt: null,
      role: roleFromTitle(title),
      contractType: null,
      region: empConfig.region || null,
      salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      ...extractRequirements(text),
      ...(extractSalary(description) || {}),
    });
  }

  if (jobs.length > 0 && skipped / jobs.length > 0.25) {
    logger.error({ source: 'PHENOM', employer: empConfig.company, seen: jobs.length, skipped,
      msg: 'SHAPE ALERT: >25% of rows missing title|jobId — feed shape may have changed' });
  }

  logger.info({ source: 'PHENOM', employer: empConfig.company, parsed: results.length, skipped, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchPhenom };
