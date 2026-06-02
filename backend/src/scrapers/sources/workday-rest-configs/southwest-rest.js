'use strict';

/**
 * Southwest Airlines Workday REST API config.
 *
 * Verified 2026-06-02:
 *   Endpoint: https://swa.wd1.myworkdayjobs.com/wday/cxs/swa/external/jobs
 *   Returns: ~3 pilot/flight ops jobs (checked: Flight Ops Flight Instructor, etc.)
 *   robots.txt: Permissive (no blocks on /wday/cxs or general crawl)
 */

module.exports = {
  tenant: 'swa',
  subdomain: 'wd1',
  site: 'external',
};
