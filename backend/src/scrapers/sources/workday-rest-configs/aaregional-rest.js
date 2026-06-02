'use strict';

/**
 * American Eagle / AAregional Workday REST API config.
 *
 * Verified 2026-06-02: aaregional.wd5.myworkdayjobs.com/wday/cxs/aaregional/Search/jobs
 * American Eagle regional carrier pilot and flight crew listings.
 * Note: This board includes many non-pilot roles (ground crew, admin, maintenance).
 * Aviation-role filter critical for accuracy.
 */

module.exports = {
  tenant: 'aaregional',
  subdomain: 'wd5',
  site: 'Search',
};
