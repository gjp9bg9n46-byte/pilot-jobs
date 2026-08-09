'use strict';

/**
 * Personio careers source.
 *
 * Personio publishes a public XML job feed per customer:
 *   https://{company}.jobs.personio.{de|com}/xml
 *   → <position> { id, subcompany, office, department, recruitingCategory,
 *                  name, jobDescriptions>jobDescription>(name,value[CDATA HTML]),
 *                  employmentType, schedule, seniority, createdAt,
 *                  salaryInformation>{min,max,currencyCode} } </position>
 *
 * The public posting is `https://{company}.jobs.personio.{tld}/job/{id}` (the
 * operator's own Personio careers site → classified direct_ats). All fetches go
 * through http.js (UA + robots + rate limit). Feed shape is validated (no
 * <position> ⇒ abort → returns []). XML is parsed with light regex (no new dep).
 *
 * Config (employers.js):
 *   { source: 'PERSONIO',
 *     personio: { company: 'getjet', tld?: 'de', idPrefix?: 'getjet' },
 *     company: 'GetJet Airlines', country?, region?, defaultLocation? }
 */

const logger = require('../../config/logger');
const { fetchHTML } = require('../http');
const { extractRequirements, extractSalary, htmlToText } = require('../normalize');

function roleFromTitle(title) {
  if (/captain|commander|\bpic\b/i.test(title)) return 'CAPTAIN';
  if (/first\s+officer|co-?pilot|f\/o|\bfo\b|\bsic\b|second\s+officer/i.test(title)) return 'FIRST_OFFICER';
  if (/instructor|check\s*airman|examiner|\btri\b|\btre\b/i.test(title)) return 'INSTRUCTOR';
  return null;
}

const firstTag = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
};

async function fetchPersonio(empConfig) {
  const cfg = empConfig.personio || {};
  const company = cfg.company;
  if (!company) {
    logger.warn({ source: 'PERSONIO', employer: empConfig.company, msg: 'missing personio.company config — skipping' });
    return [];
  }
  const tld = cfg.tld || 'de';
  const idPrefix = cfg.idPrefix || company;

  let xml;
  try {
    xml = await fetchHTML(`https://${company}.jobs.personio.${tld}/xml`, { source: 'PERSONIO' });
  } catch (err) {
    logger.error({ source: 'PERSONIO', employer: empConfig.company, err: err.message, msg: 'feed fetch failed' });
    return [];
  }

  const blocks = xml.match(/<position>[\s\S]*?<\/position>/gi);
  if (!blocks) {
    logger.error({ source: 'PERSONIO', employer: empConfig.company, msg: 'SHAPE ALERT: no <position> elements — aborting source' });
    return [];
  }

  const results = [];
  let skipped = 0;
  for (const b of blocks) {
    const id = firstTag(b, 'id');
    // The position title is the <name> BEFORE <jobDescriptions> (section names
    // also use <name>); take the head slice up to the descriptions block.
    const head = b.split(/<jobDescriptions>/i)[0];
    const title = firstTag(head, 'name');
    if (!id || !title) { skipped++; continue; }

    // Concatenate all jobDescription <value> CDATA blocks → full HTML.
    const descHtml = [...b.matchAll(/<value>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/value>/gi)].map((m) => m[1]).join('\n');
    const description = descHtml ? htmlToText(descHtml) : title;
    const location = [firstTag(b, 'office'), firstTag(b, 'department')].filter(Boolean).join(' — ') || empConfig.defaultLocation || '';
    const et = firstTag(b, 'employmentType');
    const created = firstTag(b, 'createdAt');
    const text = `${title} ${description}`;

    const sal = {};
    const salMin = Number(firstTag(b, 'min')); const salMax = Number(firstTag(b, 'max'));
    const cur = firstTag(b, 'currencyCode');
    if (salMin > 0) sal.salaryMin = Math.round(salMin);
    if (salMax > 0) sal.salaryMax = Math.round(salMax);
    if (cur && (sal.salaryMin || sal.salaryMax)) sal.salaryCurrency = cur;

    results.push({
      sourcePlatform: 'PERSONIO',
      externalId: `${idPrefix}-${id}`,
      title,
      company: empConfig.company,
      location,
      country: empConfig.country || null,
      description,
      applyUrl: `https://${company}.jobs.personio.${tld}/job/${id}`,
      sourceUrl: `https://${company}.jobs.personio.${tld}/job/${id}`,
      postedAt: created ? new Date(created) : new Date(),
      expiresAt: null,
      role: roleFromTitle(title),
      contractType: /part.?time/i.test(et) ? 'PART_TIME' : (/full.?time|permanent/i.test(et) ? 'FULL_TIME' : null),
      region: empConfig.region || null,
      salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      ...extractRequirements(text),
      ...(extractSalary(description) || {}),
      ...sal,
    });
  }

  if (blocks.length > 0 && skipped / blocks.length > 0.5) {
    logger.error({ source: 'PERSONIO', employer: empConfig.company, seen: blocks.length, skipped,
      msg: 'SHAPE ALERT: >50% of positions missing id|name — feed shape may have changed' });
  }

  logger.info({ source: 'PERSONIO', employer: empConfig.company, parsed: results.length, skipped, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchPersonio };
