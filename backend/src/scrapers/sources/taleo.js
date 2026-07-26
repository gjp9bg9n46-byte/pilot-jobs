'use strict';

/**
 * Oracle Taleo (Enterprise careersection) source.
 *
 * Public, unauthenticated JSON endpoint used by every Taleo careers page:
 *   POST https://{tenant}.taleo.net/careersection/rest/jobboard/searchjobs?lang=en[&portal={portal}]
 * Returns { requisitionList: [{ contestNo, column: [...] }], pagingData }.
 * Column order is tenant-configured; column[0] is the title on standard
 * portals. Detail links: /careersection/{section}/jobdetail.ftl?job={contestNo}.
 *
 * Config (employers.js): { source: 'TALEO', taleo: { tenant, section, portal? }, company }
 * Verified per-tenant via /health/scrape-test before trusting.
 */

const axios = require('axios');
const logger = require('../../config/logger');
const { extractRequirements } = require('../normalize');

const BODY = {
  multilineEnabled: false,
  sortingSelection: { sortBySelectionParam: '3', ascendingSortingOrder: 'false' },
  fieldData: { fields: { KEYWORD: '', LOCATION: '' }, valid: true },
  filterSelectionParam: { searchFilterSelections: [
    { id: 'POSTING_DATE', selectedValues: [] }, { id: 'LOCATION', selectedValues: [] },
    { id: 'JOB_FIELD', selectedValues: [] }, { id: 'JOB_TYPE', selectedValues: [] },
    { id: 'JOB_SCHEDULE', selectedValues: [] },
  ] },
  advancedSearchFiltersSelectionParam: { searchFilterSelections: [
    { id: 'ORGANIZATION', selectedValues: [] }, { id: 'LOCATION', selectedValues: [] },
    { id: 'JOB_FIELD', selectedValues: [] }, { id: 'URGENT', selectedValues: [] },
  ] },
  pageNo: 1,
};

async function fetchTaleo(empConfig) {
  const cfg = empConfig.taleo || {};
  if (!cfg.tenant || !cfg.section) {
    logger.warn({ source: 'TALEO', employer: empConfig.company, msg: 'missing taleo.tenant/section config — skipping' });
    return [];
  }
  const base = `https://${cfg.tenant}.taleo.net/careersection`;
  const url = `${base}/rest/jobboard/searchjobs?lang=en${cfg.portal ? `&portal=${cfg.portal}` : ''}`;
  const results = [];
  const maxPages = cfg.maxPages || 5;

  for (let page = 1; page <= maxPages; page++) {
    let data;
    try {
      const resp = await axios.post(url, { ...BODY, pageNo: page }, {
        timeout: 20000,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      data = resp.data;
    } catch (err) {
      logger.error({ source: 'TALEO', employer: empConfig.company, page, status: err.response?.status, err: err.message, msg: 'fetch failed' });
      break;
    }
    const list = data?.requisitionList || [];
    for (const r of list) {
      const title = String(r.column?.[0] ?? '').trim();
      const location = String(r.column?.[1] ?? '').trim();
      if (!r.contestNo || !title) continue;
      const text = `${title} ${location}`;
      results.push({
        sourcePlatform: 'TALEO',
        externalId: `${cfg.tenant}-${r.contestNo}`,
        title,
        company: empConfig.company,
        location: location || empConfig.defaultLocation || '',
        country: empConfig.country || null,
        description: title, // list endpoint has no body text; detail pages are SPA-rendered
        applyUrl: `${base}/${cfg.section}/jobdetail.ftl?job=${encodeURIComponent(r.contestNo)}&lang=en`,
        sourceUrl: `${base}/${cfg.section}/jobdetail.ftl?job=${encodeURIComponent(r.contestNo)}&lang=en`,
        postedAt: new Date(),
        expiresAt: null,
        role: /captain|commander/i.test(title) ? 'CAPTAIN'
          : /first officer|co-?pilot/i.test(title) ? 'FIRST_OFFICER'
          : /instructor/i.test(title) ? 'INSTRUCTOR' : null,
        contractType: null,
        region: empConfig.region || null,
        ...extractRequirements(text),
      });
    }
    const total = data?.pagingData?.totalCount ?? 0;
    logger.info({ source: 'TALEO', employer: empConfig.company, page, fetched: list.length, total, msg: 'page fetched' });
    if (list.length === 0 || results.length >= total) break;
  }

  logger.info({ source: 'TALEO', employer: empConfig.company, total: results.length, msg: 'fetch complete' });
  return results;
}

module.exports = { fetchTaleo };
