'use strict';

/**
 * Jooble source — official job-search API (https://jooble.org/api/about).
 *
 * Legal/ethical: Jooble provides this REST API for exactly this purpose (free
 * key by registration); every job links to the original posting. Coverage here:
 * North Africa by default (Egypt, Morocco, Tunisia, Algeria) — configurable.
 *
 * Env:
 *   JOOBLE_API_KEY     — required (free registration at jooble.org/api/about)
 *   JOOBLE_LOCATIONS   — optional, default 'Egypt,Morocco,Tunisia,Algeria'
 *   JOOBLE_MAX_PAGES   — optional pages per location/query, default 3
 *
 * All results flow through the shared aviation title filter (fixed-wing pilot
 * roles only) — do NOT set skipFilter on this source's config entry.
 */

const axios = require('axios');
const logger = require('../../config/logger');
const { extractRequirements } = require('../normalize');

const KEYWORDS = ['pilot', 'first officer'];
const PAGE_DELAY_MS = 1500; // polite spacing between API calls

const REGION_BY_LOCATION = {
  egypt: 'Africa', morocco: 'Africa', tunisia: 'Africa', algeria: 'Africa', libya: 'Africa',
};

function inferRole(title) {
  const t = String(title || '').toLowerCase();
  if (/captain|commander/.test(t)) return 'CAPTAIN';
  if (/first officer|f\/o|co-?pilot|second officer/.test(t)) return 'FIRST_OFFICER';
  if (/instructor/.test(t)) return 'INSTRUCTOR';
  return null;
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeJoobleJob(item, location) {
  if (!item?.id || !item.title || !item.link) return null;
  const description = stripHtml(item.snippet);
  const reqs = extractRequirements(description);
  return {
    sourcePlatform: 'JOOBLE',
    externalId:     String(item.id),
    title:          item.title.trim(),
    company:        item.company?.trim() || 'Unknown employer',
    location:       item.location?.trim() || location,
    country:        location,
    description,
    applyUrl:       item.link,
    sourceUrl:      item.link,
    postedAt:       item.updated ? new Date(item.updated) : new Date(),
    expiresAt:      null,
    role:           inferRole(item.title),
    contractType:   null,
    region:         REGION_BY_LOCATION[location.toLowerCase()] ?? null,
    // Jooble salary is a free-text string — deliberately NOT parsed (conservative:
    // no invented salary data).
    ...reqs,
  };
}

async function fetchJooble() {
  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) {
    logger.warn({ source: 'JOOBLE', msg: 'JOOBLE_API_KEY not set — skipping. Register free at jooble.org/api/about.' });
    return [];
  }

  const locations = (process.env.JOOBLE_LOCATIONS || 'Egypt,Morocco,Tunisia,Algeria')
    .split(',').map((l) => l.trim()).filter(Boolean);
  const maxPages = Math.max(1, parseInt(process.env.JOOBLE_MAX_PAGES || '3', 10));

  const seen = new Set();
  const results = [];

  for (const location of locations) {
    for (const keywords of KEYWORDS) {
      for (let page = 1; page <= maxPages; page++) {
        let data;
        try {
          const resp = await axios.post(
            `https://jooble.org/api/${apiKey}`,
            { keywords, location, page: String(page) },
            { headers: { 'Content-Type': 'application/json' }, timeout: 20000 },
          );
          data = resp.data;
        } catch (err) {
          logger.error({ source: 'JOOBLE', location, keywords, page, err: err.message, msg: 'fetch failed' });
          break;
        }
        const items = data?.jobs || [];
        for (const item of items) {
          const normalized = normalizeJoobleJob(item, location);
          if (!normalized || seen.has(normalized.externalId)) continue;
          seen.add(normalized.externalId);
          results.push(normalized);
        }
        logger.info({ source: 'JOOBLE', location, keywords, page, fetched: items.length, cumulative: results.length, msg: 'page fetched' });
        if (items.length === 0) break;
        await sleep(PAGE_DELAY_MS);
      }
    }
  }

  return results;
}

module.exports = { fetchJooble };
