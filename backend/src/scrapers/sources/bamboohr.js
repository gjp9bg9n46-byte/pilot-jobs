'use strict';

/**
 * BambooHR careers source.
 *
 * BambooHR exposes an unauthenticated public JSON careers list + per-job detail
 * on each customer's subdomain:
 *   https://{company}.bamboohr.com/careers/list
 *     → { result: [ { id, jobOpeningName, departmentLabel, employmentStatusLabel,
 *                     location:{city,state}, isRemote, ... } ] }
 *   https://{company}.bamboohr.com/careers/{id}/detail
 *     → { result: { jobOpening: { jobOpeningName, jobOpeningShareUrl,
 *                    description(HTML), location, datePosted, departmentLabel } } }
 *
 * The list has no description, so each posting's detail page is fetched once for
 * the full HTML description + canonical `jobOpeningShareUrl` (the operator's own
 * BambooHR posting → classified direct_ats). All fetches go through http.js
 * (UA + robots + rate limit); list shape is validated (no result[] ⇒ abort).
 *
 * Config (employers.js):
 *   { source: 'BAMBOOHR',
 *     bamboohr: { company: 'luxaviation', idPrefix?: 'luxaviation', maxJobs?: 80 },
 *     company: 'Luxaviation', country?, region?, defaultLocation? }
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

function locStr(loc) {
  if (!loc || typeof loc !== 'object') return '';
  return [loc.city, loc.state, loc.country].filter(Boolean).join(', ');
}

async function fetchBamboohr(empConfig) {
  const cfg = empConfig.bamboohr || {};
  const company = cfg.company;
  if (!company) {
    logger.warn({ source: 'BAMBOOHR', employer: empConfig.company, msg: 'missing bamboohr.company config — skipping' });
    return [];
  }
  const idPrefix = cfg.idPrefix || company;
  const maxJobs = cfg.maxJobs || 80;

  let data;
  try {
    data = await fetchJSON(`https://${company}.bamboohr.com/careers/list`, { source: 'BAMBOOHR' });
  } catch (err) {
    logger.error({ source: 'BAMBOOHR', employer: empConfig.company, err: err.message, msg: 'list fetch failed' });
    return [];
  }

  const list = data && Array.isArray(data.result) ? data.result : null;
  if (!list) {
    logger.error({ source: 'BAMBOOHR', employer: empConfig.company, msg: 'SHAPE ALERT: no result[] array — aborting source' });
    return [];
  }

  const results = [];
  let skipped = 0;
  for (const item of list.slice(0, maxJobs)) {
    const id = String(item.id || '').trim();
    const title = String(item.jobOpeningName || '').trim();
    if (!id || !title) { skipped++; continue; }

    // Detail page → full HTML description + canonical share URL.
    let description = '';
    let applyUrl = `https://${company}.bamboohr.com/careers/${id}`;
    let datePosted = null;
    let detailLoc = '';
    try {
      const det = await fetchJSON(`https://${company}.bamboohr.com/careers/${id}/detail`, { source: 'BAMBOOHR' });
      const jo = det && det.result && det.result.jobOpening;
      if (jo) {
        if (jo.description) description = htmlToText(jo.description);
        if (jo.jobOpeningShareUrl) applyUrl = jo.jobOpeningShareUrl;
        if (jo.datePosted) datePosted = jo.datePosted;
        detailLoc = locStr(jo.location);
      }
    } catch (err) {
      logger.warn({ source: 'BAMBOOHR', employer: empConfig.company, id, err: err.message, msg: 'detail fetch failed — using list only' });
    }
    if (!description) description = title;

    const location = locStr(item.location) || detailLoc || (item.isRemote ? 'Remote' : '') || empConfig.defaultLocation || '';
    const text = `${title} ${description}`;
    const et = String(item.employmentStatusLabel || item.employmentType || '');

    results.push({
      sourcePlatform: 'BAMBOOHR',
      externalId: `${idPrefix}-${id}`,
      title,
      company: empConfig.company,
      location,
      country: empConfig.country || null,
      description,
      applyUrl,
      sourceUrl: applyUrl,
      postedAt: datePosted ? new Date(datePosted) : new Date(),
      expiresAt: null,
      role: roleFromTitle(title),
      contractType: /part.?time/i.test(et) ? 'PART_TIME' : (/full.?time/i.test(et) ? 'FULL_TIME' : null),
      region: empConfig.region || null,
      salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      ...extractRequirements(text),
      ...(extractSalary(description) || {}),
    });
  }

  if (list.length > 0 && skipped / list.length > 0.5) {
    logger.error({ source: 'BAMBOOHR', employer: empConfig.company, seen: list.length, skipped,
      msg: 'SHAPE ALERT: >50% of postings missing id|name — feed shape may have changed' });
  }

  logger.info({ source: 'BAMBOOHR', employer: empConfig.company, parsed: results.length, skipped, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchBamboohr };
