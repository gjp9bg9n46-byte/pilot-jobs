'use strict';

/**
 * Static employer list — committed to the repo.
 *
 * HOW TO ADD AN EMPLOYER:
 *   Lever:
 *     curl -s "https://api.lever.co/v0/postings/<slug>?mode=json"
 *     200 + JSON array → valid slug.
 *
 *   Greenhouse:
 *     curl -s "https://boards-api.greenhouse.io/v1/boards/<slug>/jobs"
 *     200 with { jobs: [...] } → valid slug.
 *
 *   Workday:
 *     1. Find tenant by scanning careers page HTML for myworkdayjobs.com references.
 *     2. Verify via REST: POST https://TENANT.wd1.myworkdayjobs.com/wday/cxs/TENANT/SITE/jobs
 *        with body { limit:10, offset:0, appliedFacets:{}, searchText:'pilot' }
 *        Returns { total, jobPostings: [...] } if valid.
 *     3. Create configs/SLUG.js, add entry below, test dry-run.
 *
 * VERIFICATION LOG
 *   2026-05-14: Lever/Greenhouse original batch tested.
 *   2026-06-02: Expanded batch — all new entries below verified via API.
 *               PCC blocked (robots.txt Disallow: / for PilotJobsIngest).
 *               SmartRecruiters API permanently shut down — all disabled.
 *               Joby/Wisk GH boards 404 — ATS not publicly accessible.
 *               JetBlue→SAP SF, Spirit→iCIMS, Emirates→Taleo: not supported.
 */

module.exports = [

  // ── SmartRecruiters (disabled — API shut down 2026-05) ────────────────────
  { source: 'SMARTRECRUITERS', slug: 'ryanair',             company: 'Ryanair',               disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'norwegianairshuttle', company: 'Norwegian Air Shuttle',  disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'easyjet',             company: 'easyJet',               disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'wizzair',             company: 'Wizz Air',              disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'flydubai',            company: 'flydubai',              disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'vueling',             company: 'Vueling Airlines',      disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'tuigroup',            company: 'TUI Group',             disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'airfranceklm',        company: 'Air France KLM',        disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'flyairlink',          company: 'Airlink',               disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'airasia',             company: 'AirAsia',               disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'interglobe',          company: 'IndiGo',                disabled: true },

  // ── Pilot Career Centre (blocked — robots.txt Disallow: / for PilotJobsIngest) ──
  // Do NOT attempt to bypass this block. Contact PCC for API access.
  {
    source: 'PILOTCAREERCENTRE',
    company: 'Pilot Career Centre',
    skipFilter: true,
    disabled: true,
  },

  // ── Lever ─────────────────────────────────────────────────────────────────

  // Defence / autonomy (has pilot/test-pilot roles)
  // Verified 2026-05-14: 287 jobs, 1 pilot title
  { source: 'LEVER', slug: 'shieldai',    company: 'Shield AI' },

  // eVTOL / autonomous aviation
  // Verified 2026-06-02: 20 postings (cargo UAV)
  { source: 'LEVER', slug: 'pyka',        company: 'Pyka' },
  // Verified 2026-06-02: 29 postings (AI autopilot, occasional test-pilot roles)
  { source: 'LEVER', slug: 'merlinlabs',  company: 'Merlin Labs' },

  // Commercial carriers
  // Verified 2026-06-02: 69 postings (LCC — check for pilot openings regularly)
  { source: 'LEVER', slug: 'allegiantair', company: 'Allegiant Air' },

  // NOT on Lever (checked 2026-06-02 — ATS not publicly accessible or moved):
  //   Joby Aviation, Beta Technologies, Wisk Aero, Archer Aviation,
  //   Reliable Robotics, ZeroAvia, Universal Hydrogen (company closed 2024)

  // ── Greenhouse ───────────────────────────────────────────────────────────

  // US scheduled carriers
  // (frontier-airlines and sun-country verified 2026-05-14 but returned 0 — keep for future)
  { source: 'GREENHOUSE', slug: 'frontier-airlines',      company: 'Frontier Airlines' },
  { source: 'GREENHOUSE', slug: 'sun-country-airlines',   company: 'Sun Country Airlines' },
  { source: 'GREENHOUSE', slug: 'silver-airways',         company: 'Silver Airways' },
  { source: 'GREENHOUSE', slug: 'southern-airways-express', company: 'Southern Airways Express' },

  // US business aviation / charter
  { source: 'GREENHOUSE', slug: 'netjets',                company: 'NetJets' },
  { source: 'GREENHOUSE', slug: 'flexjet',                company: 'Flexjet' },
  { source: 'GREENHOUSE', slug: 'wheelsup',               company: 'Wheels Up' },
  { source: 'GREENHOUSE', slug: 'vistajet',               company: 'VistaJet' },
  { source: 'GREENHOUSE', slug: 'surf-air',               company: 'Surf Air' },

  // US regional / cargo
  { source: 'GREENHOUSE', slug: 'ameriflight',            company: 'Ameriflight' },
  { source: 'GREENHOUSE', slug: 'contour-aviation',       company: 'Contour Aviation' },
  { source: 'GREENHOUSE', slug: 'airmethods-inc',         company: 'Air Methods' },

  // Manufacturer / training / OEM
  { source: 'GREENHOUSE', slug: 'textron-aviation',       company: 'Textron Aviation' },
  { source: 'GREENHOUSE', slug: 'cirrus-aircraft',        company: 'Cirrus Aircraft' },
  { source: 'GREENHOUSE', slug: 'cae',                    company: 'CAE' },

  // eVTOL / advanced air mobility
  // Verified 2026-06-02: correct slug (was archer-aviation-inc which returned 404)
  { source: 'GREENHOUSE', slug: 'archer',                 company: 'Archer Aviation' },

  // NEW — verified 2026-06-02
  // 1939 jobs total; includes ~24 aviation/drone/test-pilot roles
  { source: 'GREENHOUSE', slug: 'andurilindustries',      company: 'Anduril Industries' },
  // 202 jobs; drone delivery — operations/logistics pilot roles
  { source: 'GREENHOUSE', slug: 'flyzipline',             company: 'Zipline International' },
  // 34 jobs; Eve Air Mobility (eVTOL, Embraer-backed)
  { source: 'GREENHOUSE', slug: 'eve',                    company: 'Eve Air Mobility' },

  // DISABLED — GH board 404 as of 2026-06-02 (ATS moved or board closed)
  // Joby Aviation: was jobyaviation — not found on GH, Lever, or Ashby
  // Wisk Aero: was wisk-aero-inc — Boeing-owned since 2023, likely uses Boeing careers
  { source: 'GREENHOUSE', slug: 'jobyaviation', company: 'Joby Aviation', disabled: true },
  { source: 'GREENHOUSE', slug: 'wisk-aero-inc', company: 'Wisk Aero',   disabled: true },

  // ── Workday ───────────────────────────────────────────────────────────────
  // Uses Puppeteer (headless Chrome) — slow but handles Workday SPAs.
  // REST API verified via: POST /wday/cxs/{tenant}/{site}/jobs

  // Verified 2026-06-02: swa.wd1.myworkdayjobs.com/external (3 pilot results found)
  {
    source: 'WORKDAY',
    config: 'southwest',
    company: 'Southwest Airlines',
  },

  // Placeholder — tenant/startUrl not yet verified accessible without auth
  // (United uses Workday but the specific tenant path and WAF status unknown)
  {
    source: 'WORKDAY',
    config: 'united',
    company: 'United Airlines',
  },

  // NOT verified on Workday (checked 2026-06-02):
  //   JetBlue → SAP SuccessFactors (not supported)
  //   Spirit Airlines → iCIMS (not supported)
  //   Emirates → Taleo (not supported)
  //   Air Canada → ATS undetected (custom or Oracle HCM)
  //   Cathay Pacific → ATS undetected
  //   British Airways → careers.ba.com returned 404 on listing page
  //   Lufthansa → connection refused on lhcareers.com
  //   Hawaiian Airlines → domain not resolving
  //   Delta → Workday API probes failed (likely behind WAF)
  //   American Airlines → Workday API probes failed
];
