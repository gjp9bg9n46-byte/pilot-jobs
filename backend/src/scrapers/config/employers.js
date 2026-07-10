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

  // ── USAJobs.gov ───────────────────────────────────────────────────────────────
  // Free public REST API. Requires USAJOBS_API_KEY + USAJOBS_USER_AGENT env vars.
  // Register: https://developer.usajobs.gov/
  // Queries Job Series 2181 (Aircraft Operation) + 2185 (Aircraft Aerial Work).
  // skipFilter: true — series codes 2181/2185 are exclusively aviation operational roles
  // (Aircraft Commander, Fixed Wing Pilot, etc.) — the API does the filtering.
  // STRICT filter (owner directive 2026-07-08): only explicitly pilot-titled
  // roles (pilot / captain / first officer / instructor / examiner). Federal
  // flying roles without a pilot keyword in the title (e.g. "Air Interdiction
  // Agent") are deliberately dropped — purity over volume.
  {
    source: 'USAJOBS',
    company: 'USAJobs.gov',
    skipFilter: false,
    aggregate: true, // jobs carry real agency names — stale-expiry matches by source only
  },

  // ── Pilot Career Centre (blocked — robots.txt Disallow: / for PilotJobsIngest) ──
  // Do NOT attempt to bypass this block. Contact PCC for API access.
  {
    source: 'PILOTCAREERCENTRE',
    company: 'Pilot Career Centre',
    skipFilter: true,
    aggregate: true,
    disabled: true,
  },

  // ── Lever ─────────────────────────────────────────────────────────────────

  // Defence / autonomy
  // Disabled 2026-07-09 per owner no-drones directive: pilot roles are V-BAT/UAS operators.
  { source: 'LEVER', slug: 'shieldai',    company: 'Shield AI', disabled: true },

  // eVTOL / autonomous aviation
  // Verified 2026-06-02: 20 postings (cargo UAV)
  // Disabled 2026-07-08 per owner: cargo-UAV company — drone roles only.
  { source: 'LEVER', slug: 'pyka',        company: 'Pyka', disabled: true },
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
  // Verified 2026-07-10: 44 jobs incl. "Airbus A220 First Officer" + "A220 Flight Instructor"
  { source: 'GREENHOUSE', slug: 'breezeairways',          company: 'Breeze Airways' },
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

  // Disabled 2026-07-09 per owner no-drones directive: 'Test Pilot' roles are
  // UAS/RC operators (Part 107, unmanned Group 3, Fury UAS) — not manned flying.
  { source: 'GREENHOUSE', slug: 'andurilindustries',      company: 'Anduril Industries', disabled: true },
  // 202 jobs; drone delivery — operations/logistics pilot roles
  // Disabled 2026-07-08 per owner: drone-delivery company — drone roles only.
  { source: 'GREENHOUSE', slug: 'flyzipline',             company: 'Zipline International', disabled: true },
  // 34 jobs; Eve Air Mobility (eVTOL, Embraer-backed)
  { source: 'GREENHOUSE', slug: 'eve',                    company: 'Eve Air Mobility' },

  // DISABLED — GH board 404 as of 2026-06-02 (ATS moved or board closed)
  // Joby Aviation: was jobyaviation — not found on GH, Lever, or Ashby
  // Wisk Aero: was wisk-aero-inc — Boeing-owned since 2023, likely uses Boeing careers
  { source: 'GREENHOUSE', slug: 'jobyaviation', company: 'Joby Aviation', disabled: true },
  { source: 'GREENHOUSE', slug: 'wisk-aero-inc', company: 'Wisk Aero',   disabled: true },

  // ── Magellan Aviation Services ──────────────────────────────────────────────
  // WordPress careers page with Visual Composer accordion job listings.
  // Verified 2026-06-02: 8 jobs (mix of pilots/instructors + aircraft maintenance)
  {
    source: 'MAGELLAN',
    company: 'Magellan Aviation Services',
  },

  // ── Workday (Puppeteer) ───────────────────────────────────────────────────
  // Uses Puppeteer (headless Chrome) — slow but handles Workday SPAs.
  // Note: Puppeteer approach for Southwest returns 0 jobs. Use WORKDAY_REST instead.

  // Placeholder — tenant/startUrl not yet verified accessible without auth
  // (United uses Workday but the specific tenant path and WAF status unknown)
  {
    source: 'WORKDAY',
    config: 'united',
    company: 'United Airlines',
  },

  // ── Workday (REST API) ─────────────────────────────────────────────────────
  // Uses direct JSON API endpoint — faster, full detail extraction, no Puppeteer.
  // Fetches listing page + detail pages for requirements + salary extraction.

  // Verified 2026-06-02: swa.wd1.myworkdayjobs.com/wday/cxs/swa/external/jobs (1 pilot)
  {
    source: 'WORKDAY_REST',
    config: 'southwest-rest',
    company: 'Southwest Airlines',
  },

  // Verified 2026-06-02: Public Workday cadet/training programs
  // uaa.wd12.myworkdayjobs.com/wday/cxs/uaa/EXT/jobs (1 job)
  {
    source: 'WORKDAY_REST',
    config: 'uaa-rest',
    company: 'United Aviate Academy',
  },

  // rjet.wd108.myworkdayjobs.com/wday/cxs/rjet/External_Career_Site/jobs (39 jobs)
  {
    source: 'WORKDAY_REST',
    config: 'rjet-rest',
    company: 'Republic Airways (RJet)',
  },

  // API returned 422 — needs investigation. Site code may be incorrect.
  // Disabled pending further research.
  {
    source: 'WORKDAY_REST',
    config: 'aaregional-rest',
    company: 'American Eagle (AAregional)',
    disabled: true,
  },

  // ── Permanently Disabled — Non-Public Workday or Alternative ATS ──────────
  // These major carriers do NOT use public Workday for pilot hiring.
  // Checked 2026-06-02:
  //   Delta Mainline → Custom/proprietary pilot portal (not Workday)
  //   American Mainline → Custom/proprietary pilot portal (not Workday)
  //   United Mainline → Behind WAF; API probes failed
  //   JetBlue → SAP SuccessFactors (not Workday)
  //   Spirit Airlines → iCIMS (not Workday)
  //   Frontier Airlines → Unknown ATS (not publicly accessible)
  //   Air Canada → Custom or Oracle HCM (not Workday)
  //   Other: Emirates (Taleo), British Airways (404), Hawaiian (unreachable), Cathay Pacific (undetected)

  // ── Adzuna (official aggregator API) — Europe volume ───────────────────────
  // Free API (developer.adzuna.com). Requires ADZUNA_APP_ID + ADZUNA_APP_KEY.
  // Countries via ADZUNA_COUNTRIES (default gb,fr,de,it,es,nl,pl,at).
  // Every job links to the original posting. Shared fixed-wing filter applies.
  {
    source: 'ADZUNA',
    company: 'Adzuna (Europe)',
    aggregate: true,      // jobs carry real employer names — stale-expiry matches by source only
    requireContext: true, // 'pilote/piloto' is non-aviation jargon in FR/ES/IT — require aviation terms
  },

  // ── Jooble (official aggregator API) — North Africa volume ────────────────
  // Free API (jooble.org/api/about). Requires JOOBLE_API_KEY.
  // Locations via JOOBLE_LOCATIONS (default Egypt,Morocco,Tunisia,Algeria).
  // Every job links to the original posting. Shared fixed-wing filter applies.
  {
    source: 'JOOBLE',
    company: 'Jooble (North Africa)',
    aggregate: true,
    requireContext: true,
  },

  // ── Aviation Job Search (aviationjobsearch.com) ────────────────────────────
  // Verified 2026-07-08: robots.txt allows job pages; T&Cs restrict only the
  // candidate/CV database (never touched). Pages publish schema.org JSON-LD
  // (ItemList + JobPosting). We store description EXCERPTS + link back to
  // their listing for the apply click. Shared fixed-wing filter applies.
  {
    source: 'AVIATIONJOBSEARCH',
    company: 'Aviation Job Search',
    aggregate: true,
  },
];
