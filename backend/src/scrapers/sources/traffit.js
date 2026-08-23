'use strict';

/**
 * Traffit careers source (Polish/CEE ATS).
 *
 * Traffit exposes a public JSON list of live adverts per customer:
 *   https://{company}.traffit.com/public/an/list/
 *   → { count, items: [ { advertPublishId, advertId, url, title, name,
 *        description(HTML), job_location:{country,iso,locality,region1,…},
 *        locations, job_type:[…], validStart(unix s), validEnd, applicationForm } ] }
 *
 * `url` is the advert on the operator's own Traffit careers domain → classified
 * direct_ats. Discovered via headless XHR on Heston Airlines. All fetches go
 * through http.js (UA + robots + rate limit). Shape validated (no items[] ⇒
 * abort → returns []).
 *
 * Config (employers.js):
 *   { source: 'TRAFFIT',
 *     traffit: { company: 'hestonairlines', idPrefix?: 'heston' },
 *     company: 'Heston Airlines', country?, region?, defaultLocation? }
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

function locFromJob(jl) {
  if (!jl || typeof jl !== 'object') return '';
  return [jl.locality, jl.region1, jl.country].filter(Boolean).join(', ');
}

async function fetchTraffit(empConfig) {
  const cfg = empConfig.traffit || {};
  const company = cfg.company;
  if (!company) {
    logger.warn({ source: 'TRAFFIT', employer: empConfig.company, msg: 'missing traffit.company config — skipping' });
    return [];
  }
  const idPrefix = cfg.idPrefix || company;

  let data;
  try {
    data = await fetchJSON(`https://${company}.traffit.com/public/an/list/`, { source: 'TRAFFIT' });
  } catch (err) {
    logger.error({ source: 'TRAFFIT', employer: empConfig.company, err: err.message, msg: 'fetch failed' });
    return [];
  }

  const items = data && Array.isArray(data.items) ? data.items : null;
  if (!items) {
    logger.error({ source: 'TRAFFIT', employer: empConfig.company, msg: 'SHAPE ALERT: no items[] array — aborting source' });
    return [];
  }

  const results = [];
  let skipped = 0;
  for (const it of items) {
    const title = String(it.title || it.name || '').trim();
    const id = String(it.advertPublishId || it.advertId || '').trim();
    const applyUrl = String(it.url || it.applicationForm || '').trim();
    if (!title || !id || !/^https?:\/\//i.test(applyUrl)) { skipped++; continue; }

    const description = it.description ? htmlToText(it.description) : title;
    const location = locFromJob(it.job_location)
      || (Array.isArray(it.locations) ? it.locations.map((l) => (typeof l === 'string' ? l : locFromJob(l))).filter(Boolean).join('; ') : '')
      || empConfig.defaultLocation || '';
    const jt = Array.isArray(it.job_type) ? it.job_type.join(' ') : String(it.job_type || '');
    const text = `${title} ${description}`;

    results.push({
      sourcePlatform: 'TRAFFIT',
      externalId: `${idPrefix}-${id}`,
      title,
      company: empConfig.company,
      location,
      country: (it.job_location && it.job_location.country) || empConfig.country || null,
      description,
      applyUrl,
      sourceUrl: applyUrl,
      postedAt: it.validStart ? new Date(it.validStart * 1000) : new Date(),
      expiresAt: it.validEnd ? new Date(it.validEnd * 1000) : null,
      role: roleFromTitle(title),
      contractType: /part.?time/i.test(jt) ? 'PART_TIME' : (/full.?time/i.test(jt) ? 'FULL_TIME' : null),
      region: empConfig.region || null,
      salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      ...extractRequirements(text),
      ...(extractSalary(description) || {}),
    });
  }

  if (items.length > 0 && skipped / items.length > 0.5) {
    logger.error({ source: 'TRAFFIT', employer: empConfig.company, seen: items.length, skipped,
      msg: 'SHAPE ALERT: >50% of items missing title|id|url — feed shape may have changed' });
  }

  logger.info({ source: 'TRAFFIT', employer: empConfig.company, parsed: results.length, skipped, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchTraffit };
