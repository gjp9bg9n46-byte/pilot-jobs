'use strict';

/**
 * Breezy HR careers source.
 *
 * Breezy exposes a public JSON list of published positions per company:
 *   https://{company}.breezy.hr/json
 *   → [ { id, friendly_id, name, url, published_date, type:{name},
 *         location:{name,city,state,country:{name}}, department, salary } ]
 * The list omits the description, so each position's detail is fetched once:
 *   https://{company}.breezy.hr/json/{id}  → { ..., description(HTML) }
 * `url` is the operator's own Breezy board posting → classified direct_ats.
 *
 * All fetches go through http.js (UA + robots + rate limit); list shape is
 * validated (non-array ⇒ abort → []).
 *
 * Config (employers.js):
 *   { source: 'BREEZY',
 *     breezy: { company: 'acme', idPrefix?: 'acme', maxJobs?: 80 },
 *     company: 'Acme', country?, region?, defaultLocation? }
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
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  if (loc.name) return loc.name;
  const city = typeof loc.city === 'string' ? loc.city : loc.city?.name;
  return [city, loc.state?.name, loc.country?.name].filter(Boolean).join(', ');
}

async function fetchBreezy(empConfig) {
  const cfg = empConfig.breezy || {};
  const company = cfg.company;
  if (!company) {
    logger.warn({ source: 'BREEZY', employer: empConfig.company, msg: 'missing breezy.company config — skipping' });
    return [];
  }
  const idPrefix = cfg.idPrefix || company;
  const maxJobs = cfg.maxJobs || 80;

  let list;
  try {
    list = await fetchJSON(`https://${company}.breezy.hr/json`, { source: 'BREEZY' });
  } catch (err) {
    logger.error({ source: 'BREEZY', employer: empConfig.company, err: err.message, msg: 'list fetch failed' });
    return [];
  }

  if (!Array.isArray(list)) {
    logger.error({ source: 'BREEZY', employer: empConfig.company, msg: 'SHAPE ALERT: /json did not return an array — aborting source' });
    return [];
  }

  const results = [];
  let skipped = 0;
  for (const p of list.slice(0, maxJobs)) {
    const id = String(p.id || p.friendly_id || '').trim();
    const title = String(p.name || '').trim();
    const applyUrl = String(p.url || '').trim();
    if (!id || !title || !/^https?:\/\//i.test(applyUrl)) { skipped++; continue; }

    let descHtml = p.description || '';
    if (!descHtml) {
      try {
        const det = await fetchJSON(`https://${company}.breezy.hr/json/${id}`, { source: 'BREEZY' });
        descHtml = (det && det.description) || '';
      } catch (err) {
        logger.warn({ source: 'BREEZY', employer: empConfig.company, id, err: err.message, msg: 'detail fetch failed — using title' });
      }
    }
    const description = descHtml ? htmlToText(descHtml) : title;
    const location = locStr(p.location) || empConfig.defaultLocation || '';
    const text = `${title} ${description}`;
    const et = String(p.type?.name || '');

    results.push({
      sourcePlatform: 'BREEZY',
      externalId: `${idPrefix}-${id}`,
      title,
      company: empConfig.company,
      location,
      country: p.location?.country?.name || empConfig.country || null,
      description,
      applyUrl,
      sourceUrl: applyUrl,
      postedAt: p.published_date ? new Date(p.published_date) : new Date(),
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
    logger.error({ source: 'BREEZY', employer: empConfig.company, seen: list.length, skipped,
      msg: 'SHAPE ALERT: >50% of positions missing id|name|url — feed shape may have changed' });
  }

  logger.info({ source: 'BREEZY', employer: empConfig.company, parsed: results.length, skipped, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchBreezy };
