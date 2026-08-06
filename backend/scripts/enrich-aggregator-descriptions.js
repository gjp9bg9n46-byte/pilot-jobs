#!/usr/bin/env node
'use strict';

/**
 * Aggregator description enrichment.
 *
 * Adzuna/Careerjet/Jooble feeds ship truncated snippets (~500/127 chars). Their
 * own listing page usually carries a full schema.org JobPosting (Adzuna's
 * /details/ page JSON-LD holds the complete ~2k-char description). This fetches
 * that page ONCE per job, replaces the snippet with the full structured text,
 * and re-runs requirement extraction on it.
 *
 * Safe by construction:
 *   - Fetches through http.js → identifiable UA, robots.txt honoured, rate-limited.
 *   - Each job is touched at most once: descriptionEnrichedAt is stamped whether
 *     the fetch succeeds, finds nothing, or is robots-blocked — so a page is
 *     never re-hit. (Adzuna's applyUrl IS Adzuna's own detail page, not a
 *     resolved third-party redirect_url.)
 *   - Only replaces the description when the fetched text is materially longer.
 *
 *   node scripts/enrich-aggregator-descriptions.js [--limit N] [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const cheerio = require('cheerio');
const prisma = require('../src/config/database');
const logger = require('../src/config/logger');
const { fetchHTML } = require('../src/scrapers/http');
const { htmlToText, extractRequirements } = require('../src/scrapers/normalize');

const AGGREGATORS = ['ADZUNA', 'CAREERJET', 'JOOBLE'];
const SNIPPET_MAX = 800;      // below this = a truncated snippet worth enriching
const MIN_GAIN = 200;         // only replace if the fetched text adds real content

// Pull the full description from a schema.org JobPosting JSON-LD block.
function jsonLdDescription(html) {
  const $ = cheerio.load(html);
  let desc = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (desc) return;
    try {
      const parsed = JSON.parse($(el).contents().text());
      const arr = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
      const jp = arr.find((o) => o && o['@type'] === 'JobPosting' && o.description);
      if (jp) desc = jp.description;
    } catch { /* malformed block — ignore */ }
  });
  return desc ? htmlToText(String(desc)) : null;
}

async function enrichAggregatorDescriptions({ limit = 50, dryRun = false } = {}) {
  const jobs = await prisma.$queryRaw`
    SELECT id, "applyUrl", "sourcePlatform", description
    FROM "Job"
    WHERE status = 'ACTIVE'
      AND "sourcePlatform" = ANY(${AGGREGATORS})
      AND "descriptionEnrichedAt" IS NULL
      AND char_length(description) < ${SNIPPET_MAX}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;

  let enriched = 0, marked = 0;
  for (const j of jobs) {
    let full = null;
    try {
      const html = await fetchHTML(j.applyUrl, { source: 'ENRICH' });
      full = jsonLdDescription(html);
    } catch (err) {
      logger.debug({ source: 'ENRICH', id: j.id, err: err.message, msg: 'fetch skipped (robots/anti-bot/network)' });
    }
    const now = new Date();
    if (full && full.length >= (j.description || '').length + MIN_GAIN) {
      const reqs = extractRequirements(full);
      if (!dryRun) {
        await prisma.job.update({ where: { id: j.id }, data: { description: full, descriptionEnrichedAt: now, ...reqs } });
      }
      enriched++;
      logger.info({ source: 'ENRICH', id: j.id, platform: j.sourcePlatform, from: (j.description || '').length, to: full.length, msg: 'description enriched' });
    } else {
      // No fuller text available — stamp so we never re-fetch this listing.
      if (!dryRun) await prisma.job.update({ where: { id: j.id }, data: { descriptionEnrichedAt: now } });
      marked++;
    }
  }

  logger.info({ msg: 'aggregator description enrichment complete', considered: jobs.length, enriched, marked, dryRun });
  return { considered: jobs.length, enriched, marked };
}

module.exports = { enrichAggregatorDescriptions };

if (require.main === module) {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : 50;
  const dryRun = process.argv.includes('--dry-run');
  enrichAggregatorDescriptions({ limit, dryRun })
    .then((r) => { console.log(JSON.stringify(r)); return prisma.$disconnect(); })
    .then(() => process.exit(0))
    .catch((e) => { console.error('ENRICH FAILED:', e.message); process.exit(1); });
}
