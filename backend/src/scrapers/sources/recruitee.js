'use strict';

/**
 * Recruitee careers source.
 *
 * Recruitee publishes an unauthenticated public JSON list of an employer's live
 * postings at:
 *   https://{company}.recruitee.com/api/offers/
 *   → { offers: [ { id, title, slug, description(HTML), requirements(HTML),
 *                   careers_url, careers_apply_url, location, city, country_code,
 *                   department, employment_type_code, created_at, salary, ... } ] }
 *
 * `careers_url` is the posting on the employer's OWN careers site (often a
 * custom domain, e.g. werkenbijtransavia.com) → we emit it as applyUrl and the
 * platform classifies direct_ats (Recruitee is the operator's ATS, same class
 * as Greenhouse/Lever). All fetches go through http.js (UA + robots + rate
 * limit). The shape is validated (no offers[] ⇒ abort → returns []).
 *
 * Config (employers.js):
 *   { source: 'RECRUITEE',
 *     recruitee: { company: 'transavia', idPrefix?: 'transavia' },
 *     company: 'Transavia', country?, region?, defaultLocation? }
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

async function fetchRecruitee(empConfig) {
  const cfg = empConfig.recruitee || {};
  const company = cfg.company;
  if (!company) {
    logger.warn({ source: 'RECRUITEE', employer: empConfig.company, msg: 'missing recruitee.company config — skipping' });
    return [];
  }
  const idPrefix = cfg.idPrefix || company;
  const url = `https://${company}.recruitee.com/api/offers/`;

  let data;
  try {
    data = await fetchJSON(url, { source: 'RECRUITEE' });
  } catch (err) {
    logger.error({ source: 'RECRUITEE', employer: empConfig.company, err: err.message, msg: 'fetch failed' });
    return [];
  }

  const offers = data && Array.isArray(data.offers) ? data.offers : null;
  if (!offers) {
    logger.error({ source: 'RECRUITEE', employer: empConfig.company, msg: 'SHAPE ALERT: no offers[] array — aborting source' });
    return [];
  }

  const results = [];
  let skipped = 0;
  for (const o of offers) {
    const title = String(o.title || '').trim();
    const id = String(o.id || o.slug || '').trim();
    const applyUrl = String(o.careers_url || o.careers_apply_url || '').trim();
    // Only ACTIVE/published offers with a real posting URL.
    if (!title || !id || !/^https?:\/\//i.test(applyUrl) || (o.status && o.status !== 'published')) { skipped++; continue; }

    const descHtml = [o.description, o.requirements].filter(Boolean).join('\n\n');
    const description = descHtml ? htmlToText(descHtml) : title;
    const location = o.location
      || [o.city, o.country_code].filter(Boolean).join(', ')
      || empConfig.defaultLocation || '';
    const text = `${title} ${description}`;
    const et = String(o.employment_type_code || '');

    results.push({
      sourcePlatform: 'RECRUITEE',
      externalId: `${idPrefix}-${id}`,
      title,
      company: empConfig.company,
      location,
      country: o.country_code || empConfig.country || null,
      description,
      applyUrl,
      sourceUrl: applyUrl,
      postedAt: o.created_at ? new Date(o.created_at) : new Date(),
      expiresAt: o.close_at ? new Date(o.close_at) : null,
      role: roleFromTitle(title),
      contractType: /part.?time/i.test(et) ? 'PART_TIME' : (/full.?time/i.test(et) ? 'FULL_TIME' : null),
      region: empConfig.region || null,
      salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      ...extractRequirements(text),
      ...(extractSalary(description) || {}),
    });
  }

  if (offers.length > 0 && skipped / offers.length > 0.5) {
    logger.error({ source: 'RECRUITEE', employer: empConfig.company, seen: offers.length, skipped,
      msg: 'SHAPE ALERT: >50% of offers missing title|id|careers_url — feed shape may have changed' });
  }

  logger.info({ source: 'RECRUITEE', employer: empConfig.company, parsed: results.length, skipped, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchRecruitee };
