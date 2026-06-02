'use strict';

/**
 * Workday employer config — Southwest Airlines.
 *
 * Verified 2026-06-02:
 *   Workday REST API confirmed: swa.wd1.myworkdayjobs.com/wday/cxs/swa/external/jobs
 *   Returns jobs including pilot roles (e.g. "Flight Ops Flight Instructor").
 *   Career site URL: https://careers.southwestair.com/us/en/search-results
 *
 * Tenant: swa | Subdomain: wd1 | Career site: external
 */

module.exports = {
  slug: 'southwest',
  company: 'Southwest Airlines',
  startUrl: 'https://careers.southwestair.com/us/en/search-results',
  tenant: 'swa',

  listSelector: '[data-automation-id="jobPostingsList"] li',
  selectors: {
    title:    '[data-automation-id="jobPostingTitle"] a',
    location: '[data-automation-id="jobPostingLocation"]',
    postedAt: '[data-automation-id="postedOn"]',
    applyUrl: '[data-automation-id="jobPostingTitle"] a',
  },

  // Puppeteer scraper returns 0: careers.southwestair.com uses a non-standard Workday
  // React theme where [data-automation-id="jobPostingsList"] is absent.
  // REST API is confirmed working (swa.wd1.myworkdayjobs.com/wday/cxs/swa/external/jobs).
  // TODO: extend runner.js to support a restApiUrl mode instead of Puppeteer for such tenants.
  skipReason: 'Puppeteer selector mismatch — needs REST API runner mode (TODO)',
};
