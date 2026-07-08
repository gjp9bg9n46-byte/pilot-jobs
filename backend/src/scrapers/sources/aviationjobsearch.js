'use strict';

/**
 * Aviation Job Search (aviationjobsearch.com, Friday Media Group) — pilot jobs.
 *
 * Legal/ethical basis (verified 2026-07-08):
 *   - robots.txt ALLOWS job listing/detail pages (blocks only apply/API paths,
 *     which we never touch) and publishes sitemaps for them.
 *   - Their T&Cs prohibit scraping only the CANDIDATE/CV database — we read
 *     public job ads exclusively, never anything candidate-related.
 *   - Pages embed schema.org JSON-LD (ItemList + JobPosting) — structured data
 *     published intentionally for machine consumption.
 *   - IP posture: we store an EXCERPT of the description (requirements are
 *     extracted from the full text first), and applyUrl links to THEIR page —
 *     we index, they receive the applicant click.
 *   - Fetches go through the shared polite HTTP layer (robots re-checked,
 *     rate-limited, retry with backoff).
 *
 * Env:
 *   AJS_MAX_LIST_PAGES    — listing pages per run (25 jobs each), default 4
 *   AJS_MAX_DETAIL_FETCH  — detail pages per run, default 80
 */

const logger = require('../../config/logger');
const { fetchHTML } = require('../http');
const { extractRequirements } = require('../normalize');

const LIST_URL = (page) => `https://www.aviationjobsearch.com/en-GB/jobs/pilots?page=${page}`;
const DESCRIPTION_EXCERPT_CHARS = 600;

const EUROPE_HINTS = /united kingdom|ireland|france|germany|italy|spain|portugal|netherlands|belgium|austria|switzerland|poland|czech|hungary|greece|malta|cyprus|denmark|sweden|norway|finland|luxembourg|croatia|romania|bulgaria|estonia|latvia|lithuania|slovak|sloven|iceland/i;

function stripHtml(s) {
  return String(s || '')
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function jsonLdBlocks(html) {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try { blocks.push(JSON.parse(m[1])); } catch { /* malformed block — skip */ }
  }
  return blocks;
}

function externalIdFromUrl(url) {
  const m = String(url).match(/-(\d+)(?:\/)?$/);
  return m ? m[1] : null;
}

function inferRole(title) {
  const t = String(title || '').toLowerCase();
  if (/captain|commander/.test(t)) return 'CAPTAIN';
  if (/first officer|f\/o|co-?pilot|second officer/.test(t)) return 'FIRST_OFFICER';
  if (/instructor/.test(t)) return 'INSTRUCTOR';
  return null;
}

function normalizePosting(posting, url) {
  const externalId = externalIdFromUrl(url);
  if (!externalId || !posting?.title) return null;

  const addr = posting.jobLocation?.address || {};
  const locality = addr.addressLocality || '';
  const region = addr.addressRegion || '';
  const country = addr.addressCountry || region || null;
  const location = [locality, region].filter(Boolean).join(', ') || country || '';

  const fullText = stripHtml(posting.description);
  const reqs = extractRequirements(fullText);
  const excerpt = fullText.length > DESCRIPTION_EXCERPT_CHARS
    ? `${fullText.slice(0, DESCRIPTION_EXCERPT_CHARS).trim()}… (full posting on Aviation Job Search)`
    : fullText;

  const salary = posting.baseSalary?.value || null;

  return {
    sourcePlatform: 'AVIATIONJOBSEARCH',
    externalId,
    title: String(posting.title).trim(),
    company: posting.hiringOrganization?.name?.trim() || 'Unknown employer',
    location,
    country,
    description: excerpt,
    applyUrl: url,          // their page gets the applicant click
    sourceUrl: url,
    postedAt: posting.datePosted ? new Date(posting.datePosted) : new Date(),
    expiresAt: posting.validThrough ? new Date(posting.validThrough) : null,
    role: inferRole(posting.title),
    contractType: posting.employmentType === 'FULL_TIME' ? 'full_time' : posting.employmentType === 'PART_TIME' ? 'part_time' : null,
    region: EUROPE_HINTS.test(`${location} ${country || ''}`) ? 'Europe' : null,
    ...(salary?.minValue ? { salaryMin: Math.round(salary.minValue) } : {}),
    ...(salary?.maxValue ? { salaryMax: Math.round(salary.maxValue) } : {}),
    ...(posting.baseSalary?.currency ? { salaryCurrency: posting.baseSalary.currency } : {}),
    ...reqs,
  };
}

async function fetchAviationJobSearch() {
  const maxListPages = Math.max(1, parseInt(process.env.AJS_MAX_LIST_PAGES || '4', 10));
  const maxDetails = Math.max(1, parseInt(process.env.AJS_MAX_DETAIL_FETCH || '80', 10));

  // 1. Collect job URLs from the listing pages' ItemList JSON-LD.
  const urls = [];
  const seen = new Set();
  for (let page = 1; page <= maxListPages; page++) {
    let html;
    try {
      html = await fetchHTML(LIST_URL(page), { source: 'AVIATIONJOBSEARCH' });
    } catch (err) {
      logger.error({ source: 'AVIATIONJOBSEARCH', page, err: err.message, msg: 'list fetch failed' });
      break;
    }
    const list = jsonLdBlocks(html).find((b) => b['@type'] === 'ItemList');
    const items = list?.itemListElement || [];
    for (const item of items) {
      if (item?.url && !seen.has(item.url)) { seen.add(item.url); urls.push(item.url); }
    }
    logger.info({ source: 'AVIATIONJOBSEARCH', page, found: items.length, cumulative: urls.length, msg: 'list page parsed' });
    if (items.length === 0) break;
  }

  // 2. Fetch detail pages (capped per run) and parse JobPosting JSON-LD.
  const results = [];
  for (const url of urls.slice(0, maxDetails)) {
    try {
      const html = await fetchHTML(url, { source: 'AVIATIONJOBSEARCH' });
      const posting = jsonLdBlocks(html).find((b) => b['@type'] === 'JobPosting');
      if (!posting) continue;
      const normalized = normalizePosting(posting, url);
      if (normalized) results.push(normalized);
    } catch (err) {
      logger.error({ source: 'AVIATIONJOBSEARCH', url, err: err.message, msg: 'detail fetch failed' });
    }
  }

  logger.info({ source: 'AVIATIONJOBSEARCH', listed: urls.length, parsed: results.length, msg: 'run complete' });
  return results;
}

module.exports = { fetchAviationJobSearch };
