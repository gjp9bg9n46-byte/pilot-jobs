'use strict';

/**
 * Workday employer config — United Airlines (placeholder).
 *
 * HOW TO ADD A NEW WORKDAY EMPLOYER:
 * 1. Find their public careers page (no login needed — if it requires auth, skip it).
 * 2. Open DevTools → Network while the page loads and look for the POST to
 *    /wday/cxs/{tenant}/jobs or similar. That POST body/response structure is
 *    what runner.js intercepts via page.on('response').
 * 3. Confirm the page loads without a Cloudflare / WAF interstitial in headless Chrome.
 *    If it shows a challenge, set `skipReason` and do not add the employer.
 * 4. Fill in `startUrl`, `tenant`, and `listSelector` below.
 * 5. Test with: node scripts/scrape.js --employer <slug> --dry-run
 *
 * LEGACY CARRIERS → tend to use Workday: American, United, Delta, Southwest, Lufthansa, BA.
 * NEWER OPERATORS → tend to use Lever or Greenhouse: Joby, Wisk, Archer, Boom, Surf Air.
 * (Platform choices shift — verify before adding. A quick check:
 *   curl -s "https://api.lever.co/v0/postings/<slug>?mode=json" — 200 = they use Lever)
 */

module.exports = {
  slug: 'united',
  company: 'United Airlines',

  // TODO: replace with the real public careers URL once verified accessible without auth.
  // The Workday tenant slug differs from the company name — find it in the API calls.
  startUrl: 'https://careers.united.com/job/TODO',
  tenant: 'united',  // Workday tenant identifier — appears in API endpoint URLs

  // CSS selector that identifies individual job card elements in the listing.
  // Workday uses role="listitem" on cards — verify in DevTools for this tenant.
  listSelector: '[data-automation-id="jobPostingsList"] li',

  // Selectors within each card — adjust if this tenant's theme differs from default.
  selectors: {
    title:    '[data-automation-id="jobPostingTitle"] a',
    location: '[data-automation-id="jobPostingLocation"]',
    postedAt: '[data-automation-id="postedOn"]',
    applyUrl: '[data-automation-id="jobPostingTitle"] a', // href attribute
  },

  // Set to a string reason if this employer should be skipped (e.g. "WAF blocks headless").
  skipReason: 'placeholder — startUrl not yet verified',
};
