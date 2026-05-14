'use strict';

/**
 * Workday per-employer Puppeteer runner.
 *
 * Workday career sites are React SPAs. Each employer hosts their own themed
 * site but the underlying Workday markup is roughly consistent across tenants.
 * This runner navigates the listing page, waits for the job list, paginates,
 * and extracts titles/locations/URLs — it does NOT visit individual detail pages
 * (too slow; accept lower match quality for Workday-sourced jobs).
 *
 * Uses puppeteer (already a project dependency) rather than Playwright.
 * Functionality is equivalent for this use case.
 */

const puppeteer = require('puppeteer');
const logger = require('../../../config/logger');
const { AntiBotBlockedError } = require('../../http');

const USER_AGENT = `PilotJobsIngest/1.0 (+contact: ${process.env.CONTACT_EMAIL || 'noreply@example.com'})`;
const NAV_TIMEOUT_MS = 30000;
const SELECTOR_TIMEOUT_MS = 15000;
// Workday equivalent of 1 req/3s: wait between page navigations
const PAGE_DELAY_MS = 3000;
// Maximum pages to paginate through per employer (safety cap)
const MAX_PAGES = 20;

const ANTIBOT_SELECTORS = [
  '#challenge-form',         // Cloudflare challenge
  '#captcha-container',
  '[data-ray]',              // Cloudflare ray-id attribute
  '.g-recaptcha',
];

/**
 * Check if the current page is an anti-bot interstitial.
 * @param {import('puppeteer').Page} page
 * @returns {Promise<string|null>} reason string or null
 */
async function detectAntiBotPage(page) {
  const title = await page.title().catch(() => '');
  if (/cloudflare|access denied|attention required|just a moment/i.test(title)) {
    return `page title: "${title}"`;
  }
  for (const sel of ANTIBOT_SELECTORS) {
    const found = await page.$(sel).catch(() => null);
    if (found) return `selector "${sel}" present`;
  }
  return null;
}

/**
 * Scrape a single Workday employer config.
 *
 * @param {object} config  Workday employer config (from configs/)
 * @returns {Promise<import('../../types').RawJob[]>}
 */
async function scrapeWorkdayEmployer(config) {
  if (config.skipReason) {
    logger.info({ source: 'WORKDAY', employer: config.slug, msg: `skipped: ${config.skipReason}` });
    return [];
  }

  const jobs = [];
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    // Disable images and fonts to speed up load
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    logger.info({ source: 'WORKDAY', employer: config.slug, url: config.startUrl, msg: 'navigating' });
    await page.goto(config.startUrl, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT_MS });

    // Anti-bot check immediately after landing
    const antiBotReason = await detectAntiBotPage(page);
    if (antiBotReason) {
      throw new AntiBotBlockedError(config.startUrl, antiBotReason);
    }

    let pageNum = 0;
    while (pageNum < MAX_PAGES) {
      pageNum++;

      // Wait for job list or bail
      const listPresent = await page
        .waitForSelector(config.listSelector, { timeout: SELECTOR_TIMEOUT_MS })
        .then(() => true)
        .catch(() => false);

      if (!listPresent) {
        logger.warn({ source: 'WORKDAY', employer: config.slug, pageNum, msg: 'list selector not found — stopping pagination' });
        break;
      }

      // Extract jobs from this page
      const pageJobs = await page.$$eval(
        config.listSelector,
        (items, selectors) =>
          items.map((item) => {
            const titleEl  = item.querySelector(selectors.title);
            const locEl    = item.querySelector(selectors.location);
            const dateEl   = item.querySelector(selectors.postedAt);
            const title    = titleEl?.textContent?.trim() || '';
            const location = locEl?.textContent?.trim() || '';
            const postedAt = dateEl?.textContent?.trim() || '';
            const href     = titleEl?.getAttribute('href') || '';
            // Workday hrefs are relative; prefix with origin in the outer scope
            return { title, location, postedAt, href };
          }),
        config.selectors,
      );

      // Resolve relative hrefs to absolute URLs
      const origin = new URL(config.startUrl).origin;
      for (const j of pageJobs) {
        if (!j.title) continue;
        const applyUrl = j.href.startsWith('http') ? j.href : `${origin}${j.href}`;
        // Derive a stable externalId from the URL path (last segment or query param)
        const externalId = j.href.replace(/[^a-zA-Z0-9-_]/g, '_').slice(-80);
        jobs.push({
          sourcePlatform: 'WORKDAY',
          externalId,
          title: j.title,
          location: j.location,
          postedAt: j.postedAt,
          applyUrl,
          description: '', // list scrape — no detail page visit
        });
      }

      logger.info({ source: 'WORKDAY', employer: config.slug, pageNum, found: pageJobs.length, msg: 'page scraped' });

      // Try to click the "next page" button — Workday typically uses aria-label="next"
      const nextBtn = await page.$('[aria-label="next"]:not([disabled]), [data-automation-id="next"]:not([disabled])');
      if (!nextBtn) break;

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAV_TIMEOUT_MS }).catch(() => {}),
        nextBtn.click(),
      ]);

      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }
  } catch (err) {
    if (err instanceof AntiBotBlockedError) {
      logger.error({ source: 'WORKDAY', employer: config.slug, msg: `anti-bot block: ${err.reason} — mark for 24h pause` });
    } else {
      logger.error({ source: 'WORKDAY', employer: config.slug, err: err.message, msg: 'scrape failed' });
    }
  } finally {
    if (browser) await browser.close();
  }

  return jobs;
}

module.exports = { scrapeWorkdayEmployer };
