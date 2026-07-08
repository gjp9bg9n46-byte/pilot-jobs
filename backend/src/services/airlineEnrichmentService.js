'use strict';

/**
 * Airline factfile enrichment — two recurring cycles:
 *
 *  1. recomputeJobDerivedStats()  — after every scrape run.
 *     Derives from OUR OWN live job data (always true, never invented):
 *       - hiringStatus  : active jobs on the board → ACTIVELY_HIRING;
 *                         stale ACTIVELY_HIRING downgrades when jobs disappear;
 *                         UNKNOWN upgrades to OCCASIONAL if jobs appeared in the
 *                         last 90 days. Community PAUSED/OCCASIONAL is respected.
 *       - payRanges     : aggregated from real posted salaries in that airline's
 *                         listings, split captain / first officer. FILL-IF-EMPTY
 *                         only — never overwrites community data.
 *       - workAuthRequired : distinct requirements from active listings.
 *                         FILL-IF-EMPTY only.
 *
 *  2. refreshWikiFleet() — weekly.
 *     Re-parses each airline's Wikipedia fleet table (reusing scripts/lib/wiki-fleet):
 *       - fleetDetail   : refreshed every run (enrichment-owned field).
 *       - fleet (String[]) : FILL-IF-EMPTY only (community/legacy protected).
 *     Polite: cached HTML, ~600ms/request rate, per-airline error isolation.
 *
 * Community-only fields (rosterPattern, interviewStages, simType, upgrade times,
 * notes, contractType, hiringFrequency, avgResponseDays) are NEVER written here.
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../config/database');
const logger = require('../config/logger');

// ─── Company-name normalisation (mirrors frontend/mobile airlineLookup) ───────

function normalizeCompany(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// ─── 1. Job-derived stats ──────────────────────────────────────────────────────

const NINETY_DAYS_MS = 90 * 24 * 3600 * 1000;

function deriveHiringStatus(current, activeCount, recentCount) {
  if (activeCount > 0) return 'ACTIVELY_HIRING';
  if (current === 'ACTIVELY_HIRING') return recentCount > 0 ? 'OCCASIONAL' : 'UNKNOWN';
  if (current === 'UNKNOWN' && recentCount > 0) return 'OCCASIONAL';
  return current; // respect community PAUSED / OCCASIONAL
}

function derivePayRanges(jobs) {
  const buckets = { captain: [], firstOfficer: [] };
  for (const j of jobs) {
    if (j.salaryMin == null && j.salaryMax == null) continue;
    if (j.role === 'CAPTAIN') buckets.captain.push(j);
    else if (j.role === 'FIRST_OFFICER') buckets.firstOfficer.push(j);
  }
  const agg = (arr) => {
    if (!arr.length) return null;
    const mins = arr.map((j) => j.salaryMin).filter((v) => v != null);
    const maxs = arr.map((j) => j.salaryMax ?? j.salaryMin).filter((v) => v != null);
    if (!mins.length && !maxs.length) return null;
    const mode = (vals) => {
      const counts = {};
      for (const v of vals.filter(Boolean)) counts[v] = (counts[v] || 0) + 1;
      return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] ?? null;
    };
    return {
      min: mins.length ? Math.min(...mins) : null,
      max: maxs.length ? Math.max(...maxs) : null,
      currency: mode(arr.map((j) => j.salaryCurrency)),
      period: mode(arr.map((j) => j.salaryPeriod)) ?? 'year',
    };
  };
  const captain = agg(buckets.captain);
  const firstOfficer = agg(buckets.firstOfficer);
  if (!captain && !firstOfficer) return null;
  return {
    ...(captain ? { captain } : {}),
    ...(firstOfficer ? { firstOfficer } : {}),
    source: 'job-postings',
    derivedAt: new Date().toISOString(),
  };
}

async function recomputeJobDerivedStats() {
  const [airlines, jobs] = await Promise.all([
    prisma.airline.findMany({
      select: { id: true, name: true, hiringStatus: true, payRanges: true, workAuthRequired: true },
    }),
    prisma.job.findMany({
      where: { OR: [{ status: 'ACTIVE' }, { postedAt: { gte: new Date(Date.now() - NINETY_DAYS_MS) } }] },
      select: {
        company: true, status: true, postedAt: true, role: true,
        salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true,
        reqWorkAuthorization: true,
      },
    }),
  ]);

  // Bucket jobs by normalised company name
  const byCompany = new Map();
  for (const j of jobs) {
    const k = normalizeCompany(j.company);
    if (!k) continue;
    if (!byCompany.has(k)) byCompany.set(k, []);
    byCompany.get(k).push(j);
  }

  let updated = 0;
  for (const a of airlines) {
    const matched = byCompany.get(normalizeCompany(a.name)) || [];
    const active = matched.filter((j) => j.status === 'ACTIVE');
    const recent = matched.filter((j) => j.postedAt && j.postedAt.getTime() >= Date.now() - NINETY_DAYS_MS);

    const patch = {};

    const nextStatus = deriveHiringStatus(a.hiringStatus, active.length, recent.length);
    if (nextStatus !== a.hiringStatus) patch.hiringStatus = nextStatus;

    // FILL-IF-EMPTY: pay ranges from real posted salaries
    const payEmpty = a.payRanges == null || (typeof a.payRanges === 'object' && a.payRanges?.source === 'job-postings');
    if (payEmpty) {
      const derived = derivePayRanges(active);
      if (derived && JSON.stringify(derived.captain ?? null) + JSON.stringify(derived.firstOfficer ?? null)
          !== JSON.stringify(a.payRanges?.captain ?? null) + JSON.stringify(a.payRanges?.firstOfficer ?? null)) {
        patch.payRanges = derived;
      }
    }

    // FILL-IF-EMPTY: work authorization requirements seen in active listings
    if ((!a.workAuthRequired || a.workAuthRequired.length === 0) && active.length > 0) {
      const auths = [...new Set(active.map((j) => j.reqWorkAuthorization).filter(Boolean))];
      if (auths.length > 0) patch.workAuthRequired = auths;
    }

    if (Object.keys(patch).length > 0) {
      try {
        await prisma.airline.update({ where: { id: a.id }, data: patch });
        updated++;
      } catch (err) {
        logger.error(`airline stats update failed for ${a.name}: ${err.message}`);
      }
    }
  }

  logger.info(`Airline job-derived stats: ${updated}/${airlines.length} airlines updated`);
  return updated;
}

// ─── 2. Weekly Wikipedia fleet refresh ────────────────────────────────────────

let qidByName = null;
function loadQidMap() {
  if (qidByName) return qidByName;
  qidByName = new Map();
  try {
    const p = path.join(__dirname, '../../data/wikidata-airlines.json');
    if (fs.existsSync(p)) {
      const rows = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const r of rows) qidByName.set(r.dbName, r.qid);
    }
  } catch (err) {
    logger.warn(`wikidata qid map unavailable: ${err.message}`);
  }
  return qidByName;
}

async function resolveFleetRows(wf, airline) {
  let baseTitle = null;
  const qid = loadQidMap().get(airline.name);
  try { if (qid) { baseTitle = await wf.titleFromQid(qid); await wf.sleep(250); } } catch { /* fall through */ }
  if (!baseTitle) { try { baseTitle = await wf.searchTitle(airline.name); await wf.sleep(250); } catch { /* fall through */ } }

  if (baseTitle) {
    const main = await wf.fetchHtml(baseTitle);
    if (!main.notFound && main.html) {
      const res = wf.parseFleet(main.html);
      if (res.found && res.rows.length) return res.rows;
    }
  }
  const subTitle = (baseTitle || airline.name).replace(/\s*\([^)]*\)\s*$/, '') + ' fleet';
  const sub = await wf.fetchHtml(subTitle);
  if (!sub.notFound && sub.html) {
    const res = wf.parseFleet(sub.html);
    if (res.found && res.rows.length) return res.rows;
  }
  return null;
}

async function refreshWikiFleet() {
  // scripts/lib is shipped with the backend; required lazily so a missing file
  // in exotic deploys degrades to a logged warning instead of a boot crash.
  let wf;
  try {
    // eslint-disable-next-line global-require
    wf = require('../../scripts/lib/wiki-fleet');
  } catch (err) {
    logger.warn(`wiki-fleet lib unavailable — skipping fleet refresh: ${err.message}`);
    return 0;
  }

  const airlines = await prisma.airline.findMany({
    select: { id: true, name: true, fleet: true, fleetDetail: true },
    orderBy: { name: 'asc' },
  });

  let updated = 0;
  for (const a of airlines) {
    try {
      const rows = await resolveFleetRows(wf, a);
      if (!rows) continue;

      const patch = { fleetDetail: rows }; // enrichment-owned → refreshed every run
      if (!a.fleet || a.fleet.length === 0) {
        const types = [...new Set(rows.map((r) => r.type).filter(Boolean))];
        if (types.length) patch.fleet = types; // fill-if-empty only
      }
      const changed = JSON.stringify(a.fleetDetail) !== JSON.stringify(rows) || patch.fleet;
      if (changed) {
        await prisma.airline.update({ where: { id: a.id }, data: patch });
        updated++;
      }
    } catch (err) {
      logger.error(`fleet refresh failed for ${a.name}: ${err.message}`);
    }
  }

  logger.info(`Airline wiki fleet refresh: ${updated}/${airlines.length} airlines updated`);
  return updated;
}

module.exports = { recomputeJobDerivedStats, refreshWikiFleet, normalizeCompany, deriveHiringStatus, derivePayRanges };
