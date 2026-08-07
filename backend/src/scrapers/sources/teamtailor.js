'use strict';

/**
 * Teamtailor careers source.
 *
 * Every Teamtailor career site exposes a public JSON Feed (jsonfeed.org 1.1) of
 * live postings at:
 *   https://{company}.teamtailor.com/jobs.json
 *   → { items: [ { id, title, url, date_published, content_html,
 *                  _jobposting: <schema.org JobPosting> } ] }
 * The `_jobposting` object carries structured location / employmentType /
 * datePosted. `url` is the posting on the employer's own career site (often a
 * custom domain, e.g. careers.vueling.com) → emitted as applyUrl, classified
 * direct_ats (Teamtailor is the operator's ATS).
 *
 * All fetches go through http.js (UA + robots + rate limit); the feed shape is
 * validated (no items[] ⇒ abort → returns []).
 *
 * Config (employers.js):
 *   { source: 'TEAMTAILOR',
 *     teamtailor: { subdomain: 'norse', idPrefix?: 'norse' },
 *     company: 'Norse Atlantic Airways', country?, region?, defaultLocation? }
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

// Pull a human-readable location out of the schema.org JobPosting jobLocation.
function locationFromJobPosting(jp) {
  if (!jp) return '';
  const locs = Array.isArray(jp.jobLocation) ? jp.jobLocation : (jp.jobLocation ? [jp.jobLocation] : []);
  const parts = [];
  for (const l of locs) {
    const a = l && l.address;
    if (!a) continue;
    const s = [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(', ');
    if (s) parts.push(s);
  }
  if (jp.applicantLocationRequirements && !parts.length) {
    const alr = Array.isArray(jp.applicantLocationRequirements) ? jp.applicantLocationRequirements : [jp.applicantLocationRequirements];
    for (const r of alr) if (r && r.name) parts.push(r.name);
  }
  return [...new Set(parts)].join('; ');
}

async function fetchTeamtailor(empConfig) {
  const cfg = empConfig.teamtailor || {};
  const sub = cfg.subdomain;
  if (!sub) {
    logger.warn({ source: 'TEAMTAILOR', employer: empConfig.company, msg: 'missing teamtailor.subdomain config — skipping' });
    return [];
  }
  const idPrefix = cfg.idPrefix || sub;
  const url = `https://${sub}.teamtailor.com/jobs.json`;

  let data;
  try {
    data = await fetchJSON(url, { source: 'TEAMTAILOR' });
  } catch (err) {
    logger.error({ source: 'TEAMTAILOR', employer: empConfig.company, err: err.message, msg: 'fetch failed' });
    return [];
  }

  const items = data && Array.isArray(data.items) ? data.items : null;
  if (!items) {
    logger.error({ source: 'TEAMTAILOR', employer: empConfig.company, msg: 'SHAPE ALERT: no items[] array — aborting source' });
    return [];
  }

  const results = [];
  let skipped = 0;
  for (const it of items) {
    const title = String(it.title || '').trim();
    const id = String(it.id || '').trim();
    const applyUrl = String(it.url || '').trim();
    if (!title || !id || !/^https?:\/\//i.test(applyUrl)) { skipped++; continue; }

    const jp = it._jobposting || {};
    const descHtml = it.content_html || jp.description || '';
    const description = descHtml ? htmlToText(descHtml) : title;
    const location = locationFromJobPosting(jp) || empConfig.defaultLocation || '';
    const text = `${title} ${description}`;
    const et = String(jp.employmentType || '');

    results.push({
      sourcePlatform: 'TEAMTAILOR',
      externalId: `${idPrefix}-${id}`,
      title,
      company: empConfig.company,
      location,
      country: empConfig.country || null,
      description,
      applyUrl,
      sourceUrl: applyUrl,
      postedAt: it.date_published ? new Date(it.date_published) : (jp.datePosted ? new Date(jp.datePosted) : new Date()),
      expiresAt: jp.validThrough ? new Date(jp.validThrough) : null,
      role: roleFromTitle(title),
      contractType: /part.?time/i.test(et) ? 'PART_TIME' : (/full.?time/i.test(et) ? 'FULL_TIME' : null),
      region: empConfig.region || null,
      salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      ...extractRequirements(text),
      ...(extractSalary(description) || {}),
    });
  }

  if (items.length > 0 && skipped / items.length > 0.5) {
    logger.error({ source: 'TEAMTAILOR', employer: empConfig.company, seen: items.length, skipped,
      msg: 'SHAPE ALERT: >50% of items missing title|id|url — feed shape may have changed' });
  }

  logger.info({ source: 'TEAMTAILOR', employer: empConfig.company, parsed: results.length, skipped, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchTeamtailor };
