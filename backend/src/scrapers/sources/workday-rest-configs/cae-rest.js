'use strict';

/**
 * CAE (simulator / flight-training) Workday REST API config.
 *
 * CAE migrated off Greenhouse (board token `cae` now 404s) to Workday.
 * Verified 2026-07-29: cae.wd3.myworkdayjobs.com/wday/cxs/cae/career/jobs
 * returns 100+ roles including many Instructor Pilot postings (Praetor, Falcon
 * EASy, PC-12 NGX, Global 6500, and "Instructor Pilot (Global/Challenger)" in
 * Montreal — the same job that was showing only via Adzuna). robots.txt allows
 * /career/ and the CXS path (only /refreshFacet/ disallowed).
 *
 * Large board → narrow the listing to pilot-relevant roles with searchText so
 * the instructor-pilot postings fit inside the pagination cap.
 */

module.exports = {
  tenant: 'cae',
  subdomain: 'wd3',
  site: 'career',
  searchText: 'pilot',
};
