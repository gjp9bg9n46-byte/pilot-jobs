'use strict';

/**
 * Ashby careers source.
 *
 * Ashby exposes a documented, unauthenticated public posting API per job board:
 *   https://api.ashbyhq.com/posting-api/job-board/{boardName}
 *   → { jobs: [ { id, title, department, team, employmentType, location,
 *                 secondaryLocations, publishedAt, isListed, isRemote,
 *                 workplaceType, address, jobUrl, applyUrl,
 *                 descriptionHtml, descriptionPlain } ] }
 * `jobUrl` is the posting on the employer's Ashby board (jobs.ashbyhq.com/{board})
 * → emitted as applyUrl, classified direct_ats (Ashby is the operator's ATS).
 *
 * All fetches go through http.js (UA + robots + rate limit). Shape validated
 * (no jobs[] ⇒ abort → returns []). Only isListed !== false postings are kept.
 *
 * Config (employers.js):
 *   { source: 'ASHBY',
 *     ashby: { board: 'boom', idPrefix?: 'boom' },
 *     company: 'Boom Supersonic', country?, region?, defaultLocation? }
 */

const logger = require('../../config/logger');
const { fetchJSON } = require('../http');
const { extractRequirements, extractSalary, htmlToText } = require('../normalize');

function roleFromTitle(title) {
  if (/captain|commander|\bpic\b/i.test(title)) return 'CAPTAIN';
  if (/first\s+officer|co-?pilot|f\/o|\bfo\b|\bsic\b|second\s+officer/i.test(title)) return 'FIRST_OFFICER';
  if (/instructor|check\s*airman|examiner|\btri\b|\btre\b/i.test(title)) return 'INSTRUCTOR';
  return null;
}

async function fetchAshby(empConfig) {
  const cfg = empConfig.ashby || {};
  const board = cfg.board;
  if (!board) {
    logger.warn({ source: 'ASHBY', employer: empConfig.company, msg: 'missing ashby.board config — skipping' });
    return [];
  }
  const idPrefix = cfg.idPrefix || board;
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`;

  let data;
  try {
    data = await fetchJSON(url, { source: 'ASHBY' });
  } catch (err) {
    logger.error({ source: 'ASHBY', employer: empConfig.company, err: err.message, msg: 'fetch failed' });
    return [];
  }

  const jobs = data && Array.isArray(data.jobs) ? data.jobs : null;
  if (!jobs) {
    logger.error({ source: 'ASHBY', employer: empConfig.company, msg: 'SHAPE ALERT: no jobs[] array — aborting source' });
    return [];
  }

  const results = [];
  let skipped = 0;
  for (const j of jobs) {
    if (j.isListed === false) { skipped++; continue; }
    const title = String(j.title || '').trim();
    const id = String(j.id || '').trim();
    const applyUrl = String(j.jobUrl || j.applyUrl || '').trim();
    if (!title || !id || !/^https?:\/\//i.test(applyUrl)) { skipped++; continue; }

    const description = j.descriptionHtml ? htmlToText(j.descriptionHtml) : String(j.descriptionPlain || title);
    const secondary = Array.isArray(j.secondaryLocations)
      ? j.secondaryLocations.map((l) => (typeof l === 'string' ? l : l.location)).filter(Boolean) : [];
    const location = [j.location, ...secondary].filter(Boolean).join('; ') || empConfig.defaultLocation || '';
    const text = `${title} ${description}`;
    const et = String(j.employmentType || '');

    results.push({
      sourcePlatform: 'ASHBY',
      externalId: `${idPrefix}-${id}`,
      title,
      company: empConfig.company,
      location,
      country: empConfig.country || null,
      description,
      applyUrl,
      sourceUrl: applyUrl,
      postedAt: j.publishedAt ? new Date(j.publishedAt) : new Date(),
      expiresAt: null,
      role: roleFromTitle(title),
      contractType: /part.?time/i.test(et) ? 'PART_TIME' : (/full.?time/i.test(et) ? 'FULL_TIME' : null),
      region: empConfig.region || null,
      salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      ...extractRequirements(text),
      ...(extractSalary(description) || {}),
    });
  }

  if (jobs.length > 0 && skipped / jobs.length > 0.6) {
    logger.error({ source: 'ASHBY', employer: empConfig.company, seen: jobs.length, skipped,
      msg: 'SHAPE ALERT: >60% of jobs missing title|id|jobUrl — feed shape may have changed' });
  }

  logger.info({ source: 'ASHBY', employer: empConfig.company, parsed: results.length, skipped, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchAshby };
