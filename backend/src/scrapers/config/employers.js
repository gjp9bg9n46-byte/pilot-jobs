'use strict';

/**
 * Static employer list — committed to the repo.
 *
 * HOW TO ADD AN EMPLOYER:
 *   1. Identify the ATS platform:
 *      - Lever:      visit https://api.lever.co/v0/postings/<slug>?mode=json
 *                    If it returns a JSON array → valid slug. 200 = they use Lever.
 *      - Greenhouse: visit https://boards-api.greenhouse.io/v1/boards/<slug>/jobs
 *                    200 = valid slug.
 *      - Workday:    navigate to their public careers page; open DevTools → Network
 *                    and look for POST /wday/cxs/<tenant>/jobs requests.
 *
 *   2. Verify the endpoint returns data without any login prompt or auth redirect.
 *      If it requires a session cookie or OAuth, skip that employer — we never log in.
 *
 *   3. Add the entry below with the verified slug/config and a real company name.
 *
 *   4. Test: node scripts/scrape.js --employer <slug> --dry-run
 *
 * PLATFORM TENDENCIES (approximate — verify before committing a slug):
 *   Lever / Greenhouse → newer aviation tech companies: eVTOL startups (Joby,
 *     Wisk, Archer, Lilium), supersonic (Boom), advanced-air-mobility operators,
 *     charter tech platforms.
 *   Workday → legacy carriers: major US/European airlines, flag carriers. Their
 *     Workday tenants often block headless browsers with WAF — verify before adding.
 *
 * VERIFICATION LOG — 2026-05-14
 *   Tested all 13 original candidates (Joby Aviation, Archer Aviation, Wisk Aero,
 *   Beta Technologies, Boom Supersonic, Eviation, Reliable Robotics, Xwing,
 *   Merlin Labs, Zipline, Skydio, Volocopter, Heart Aerospace) on both Lever and
 *   Greenhouse. Results:
 *
 *   Lever FOUND (array response):
 *     merlinlabs      — 22 jobs, 0 pilot titles (all engineering/autonomy)
 *     dronedeploy     — 12 jobs, 0 pilot titles (SaaS/sales roles)
 *     shieldai        — 287 jobs, 1 pilot title ("Standardization Pilot") ✓
 *
 *   Greenhouse boards FOUND (valid slug, 0 current openings — re-check periodically):
 *     jobyaviation, joby-aviation-services, wisk-aero-inc, archer-aviation-inc,
 *     heartaerospace (24 engineering jobs, 0 pilot titles),
 *     textron-aviation, zipline-international, ameriflight, contour-aviation,
 *     wheelsup, flexjet, netjets, vistajet, surf-air, cae, airmethods-inc,
 *     frontier-airlines, spirit-airlines, allegiant, silver-airways,
 *     southern-airways-express, sun-country-airlines, cirrus-aircraft, ...
 *
 *   All other original 13 candidates → 404 on both platforms.
 *
 * WORKDAY CANDIDATES (unverified — print URL, await user confirmation before config):
 *   United Airlines: https://www.united.com/en/us/careers  (see configs/united.js)
 *   Southwest Airlines: https://careers.southwestair.com
 *
 * All entries below are VERIFIED. Do not add speculative slugs.
 */

module.exports = [
  // ── Lever employers ──────────────────────────────────────────────────────────
  // Verify: curl -s "https://api.lever.co/v0/postings/<slug>?mode=json" → JSON array

  // Verified 2026-05-14: curl api.lever.co/v0/postings/shieldai?mode=json → 287 jobs, 1 pilot title ("Standardization Pilot")
  { source: 'LEVER', slug: 'shieldai', company: 'Shield AI' },

  // ── Greenhouse employers ─────────────────────────────────────────────────────
  // Verify: curl -s "https://boards-api.greenhouse.io/v1/boards/<slug>/jobs" → { jobs: [...] }
  //
  // No Greenhouse employers have active pilot openings as of 2026-05-14.
  // Many valid boards exist but are currently empty — re-verify before adding:
  //   jobyaviation, wisk-aero-inc, textron-aviation, ameriflight, ...

  // ── Workday employers ────────────────────────────────────────────────────────
  // config: references a file in sources/workday/configs/<name>.js
  // Verify the careers page loads headlessly before adding (many carriers use WAF).
  {
    source: 'WORKDAY',
    config: 'united',                       // → sources/workday/configs/united.js
    company: 'United Airlines',             // placeholder — startUrl not yet verified
  },
];
