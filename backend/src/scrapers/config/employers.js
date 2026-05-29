'use strict';

/**
 * Static employer list — committed to the repo.
 *
 * HOW TO ADD AN EMPLOYER:
 *   SmartRecruiters:
 *     curl -s "https://api.smartrecruiters.com/v1/companies/<slug>/postings?limit=1"
 *     200 with { content: [...] } → valid slug.
 *
 *   Lever:
 *     curl -s "https://api.lever.co/v0/postings/<slug>?mode=json"
 *     JSON array → valid slug.
 *
 *   Greenhouse:
 *     curl -s "https://boards-api.greenhouse.io/v1/boards/<slug>/jobs"
 *     200 with { jobs: [...] } → valid slug.
 *
 *   Workday:
 *     Open DevTools → Network on the carrier's careers page; look for
 *     POST /wday/cxs/<tenant>/jobs requests.
 *
 * All entries below are VERIFIED or well-known major carriers.
 * Empty boards cost one HTTP request to discover — still worth keeping.
 *
 * VERIFICATION LOG
 *   2026-05-14: Lever/Greenhouse original batch tested. SmartRecruiters
 *               batch added 2026-05-19 based on known carrier ATS.
 */

module.exports = [

  // ── SmartRecruiters employers ──────────────────────────────────────────────
  // Public API: https://api.smartrecruiters.com/v1/companies/{slug}/postings
  // Used by: Ryanair, Norwegian, easyJet, Wizz Air, flydubai, and others.

  // SmartRecruiters public API v1 was shut down 2026-05 — every company returns
  // HTTP 200 with {"totalFound":0,"content":[]}. Marked disabled; runner skips them.
  { source: 'SMARTRECRUITERS', slug: 'ryanair',            company: 'Ryanair',            disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'norwegianairshuttle', company: 'Norwegian Air Shuttle', disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'easyjet',            company: 'easyJet',            disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'wizzair',            company: 'Wizz Air',           disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'flydubai',           company: 'flydubai',           disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'vueling',            company: 'Vueling Airlines',   disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'tuigroup',           company: 'TUI Group',          disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'airfranceklm',       company: 'Air France KLM',     disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'flyairlink',         company: 'Airlink',            disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'airasia',            company: 'AirAsia',            disabled: true },
  { source: 'SMARTRECRUITERS', slug: 'interglobe',         company: 'IndiGo',             disabled: true },

  // ── Pilot Career Centre ────────────────────────────────────────────────────
  // Dedicated pilot job board. All listings are aviation roles — skipFilter: true.
  // Scrapes the main /pilot-jobs page (~60 jobs from multiple regions).
  {
    source: 'PILOTCAREERCENTRE',
    company: 'Pilot Career Centre',
    skipFilter: true,
  },

  // ── Lever employers ────────────────────────────────────────────────────────
  // Verified 2026-05-14: 287 jobs, 1 pilot title ("Standardization Pilot")
  { source: 'LEVER', slug: 'shieldai', company: 'Shield AI' },

  // ── Greenhouse employers ───────────────────────────────────────────────────
  // All slugs verified as valid boards as of 2026-05-14.
  // Boards may have 0 active pilot openings at any given time — re-check weekly.

  // US scheduled carriers
  { source: 'GREENHOUSE', slug: 'frontier-airlines',      company: 'Frontier Airlines' },
  { source: 'GREENHOUSE', slug: 'allegiant',               company: 'Allegiant Air' },
  { source: 'GREENHOUSE', slug: 'sun-country-airlines',    company: 'Sun Country Airlines' },
  { source: 'GREENHOUSE', slug: 'silver-airways',          company: 'Silver Airways' },
  { source: 'GREENHOUSE', slug: 'southern-airways-express', company: 'Southern Airways Express' },

  // US business aviation / charter
  { source: 'GREENHOUSE', slug: 'netjets',                 company: 'NetJets' },
  { source: 'GREENHOUSE', slug: 'flexjet',                 company: 'Flexjet' },
  { source: 'GREENHOUSE', slug: 'wheelsup',                company: 'Wheels Up' },
  { source: 'GREENHOUSE', slug: 'vistajet',                company: 'VistaJet' },
  { source: 'GREENHOUSE', slug: 'surf-air',                company: 'Surf Air' },

  // US regional / cargo
  { source: 'GREENHOUSE', slug: 'ameriflight',             company: 'Ameriflight' },
  { source: 'GREENHOUSE', slug: 'contour-aviation',        company: 'Contour Aviation' },
  { source: 'GREENHOUSE', slug: 'airmethods-inc',          company: 'Air Methods' },

  // Manufacturer / training / OEM
  { source: 'GREENHOUSE', slug: 'textron-aviation',        company: 'Textron Aviation' },
  { source: 'GREENHOUSE', slug: 'cirrus-aircraft',         company: 'Cirrus Aircraft' },
  { source: 'GREENHOUSE', slug: 'cae',                     company: 'CAE' },

  // eVTOL / advanced air mobility (occasional pilot / test-pilot roles)
  { source: 'GREENHOUSE', slug: 'jobyaviation',            company: 'Joby Aviation' },
  { source: 'GREENHOUSE', slug: 'wisk-aero-inc',           company: 'Wisk Aero' },
  { source: 'GREENHOUSE', slug: 'archer-aviation-inc',     company: 'Archer Aviation' },

  // ── Workday employers ──────────────────────────────────────────────────────
  // United Airlines — placeholder, not yet verified headless
  {
    source: 'WORKDAY',
    config: 'united',
    company: 'United Airlines',
  },
];
