'use strict';

// ── The ACTIVE job set, cached ───────────────────────────────────────────────
// Pilot-independent: it only changes when the scraper or the liveness checker
// writes. Three readers were each scanning the whole table per request — the
// dashboard, the profile-strength nudge, and (already cached separately)
// /jobs. The nudge's scan had no `select` at all, so it pulled every column of
// ~311 rows, descriptions included, to compute three numbers.
//
// Same TTL as the /jobs cache: a pilot sees listings at most 45 s old, matched
// live against their current profile.

const prisma = require('../config/database');

// Everything the shared matcher reads (the two omitted columns are selected
// explicitly, which overrides the client-level omit).
const MATCH_SELECT = {
  isCampaign: true,   // matchJob needs it to tell a campaign from a vacancy
  id: true, title: true, titleEn: true, company: true, location: true, country: true,
  role: true, sourceType: true, applyUrl: true, postedAt: true, createdAt: true, status: true,
  salaryMin: true, salaryMax: true,
  reqCertificates: true, reqAuthorities: true, reqAircraftTypes: true, aircraftTypes: true, reqTypeRatings: true,
  reqMedicalClass: true, reqMinTotalHours: true, reqMinPicHours: true, reqMinMultiEngineHours: true,
  reqMinTurbineHours: true, reqMinInstrumentHours: true, reqMinCrossCountryHours: true,
  reqEducation: true, reqWorkAuthorization: true, reqEnglishLevel: true,
  requirementsText: true, description: true,
  identityKey: true, identityFirstSeenAt: true,
};

const TTL_MS = Number(process.env.JOBS_CACHE_TTL_MS || 45000);
let cached = { rows: null, exp: 0 };

async function getActiveJobs() {
  if (cached.rows && cached.exp > Date.now()) return cached.rows;
  const rows = await prisma.job.findMany({ where: { status: 'ACTIVE', mergedInto: null }, select: MATCH_SELECT });
  cached = { rows, exp: Date.now() + TTL_MS };
  return rows;
}

function clearActiveJobs() { cached = { rows: null, exp: 0 }; }

module.exports = { getActiveJobs, clearActiveJobs, MATCH_SELECT, TTL_MS };
