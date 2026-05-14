'use strict';

/**
 * Ingestion orchestrator.
 *
 * For each employer in the config:
 *   1. Fetch raw postings from the relevant source.
 *   2. Normalize to NormalizedJob shape.
 *   3. Filter to aviation roles only.
 *   4. Upsert into the DB (same source + externalId → update; new → create).
 *   5. Expire jobs that were active last run but absent this run.
 *   6. Trigger pilot matching for newly created jobs.
 *
 * After all employers: run cross-source dedup.
 */

const prisma = require('../config/database');
const logger = require('../config/logger');
const { fetchLever }     = require('./sources/lever');
const { fetchGreenhouse } = require('./sources/greenhouse');
const { fetchWorkday }   = require('./sources/workday/index');
const { normalize }      = require('./normalize');
const { filterAviationJobs } = require('./filters');
const { collapseXSourceDuplicates } = require('./dedup');
const { matchJobToAllPilots } = require('../services/matchingService');

// ─── Upsert a single normalized job ──────────────────────────────────────────

async function upsertJob(job) {
  const {
    sourcePlatform, externalId,
    title, company, location, country, description,
    applyUrl, sourceUrl, postedAt, expiresAt,
    role, contractType, region,
    salaryMin, salaryMax, salaryCurrency, salaryPeriod,
    reqCertificates, reqAuthorities, reqAircraftTypes,
    reqMedicalClass, reqMinTotalHours, reqMinPicHours,
    reqMinMultiEngineHours, reqMinTurbineHours, reqMinInstrumentHours,
    reqWillingToRelocate,
  } = job;

  const data = {
    title, company, location,
    country: country || null,
    description: description || '',
    applyUrl, sourceUrl: sourceUrl || applyUrl,
    status: 'ACTIVE',
    postedAt: postedAt || new Date(),
    expiresAt: expiresAt || null,
    role: role || null,
    contractType: contractType || null,
    region: region || null,
    salaryMin: salaryMin || null,
    salaryMax: salaryMax || null,
    salaryCurrency: salaryCurrency || null,
    salaryPeriod: salaryPeriod || null,
    reqCertificates: reqCertificates || [],
    reqAuthorities: reqAuthorities || [],
    reqAircraftTypes: reqAircraftTypes || [],
    reqMedicalClass: reqMedicalClass || null,
    reqMinTotalHours: reqMinTotalHours || null,
    reqMinPicHours: reqMinPicHours || null,
    reqMinMultiEngineHours: reqMinMultiEngineHours || null,
    reqMinTurbineHours: reqMinTurbineHours || null,
    reqMinInstrumentHours: reqMinInstrumentHours || null,
    reqWillingToRelocate: !!reqWillingToRelocate,
    sourcePlatform,
    externalId,
    mergedInto: null,
  };

  return prisma.job.upsert({
    where: { sourcePlatform_externalId: { sourcePlatform, externalId } },
    create: data,
    update: {
      // On re-run: refresh mutable fields; keep postedAt stable
      title, company, location, country: country || null,
      description: description || '',
      status: 'ACTIVE', // re-activate if it was expired
      expiresAt: expiresAt || null,
      reqCertificates: reqCertificates || [],
      reqAuthorities: reqAuthorities || [],
      reqAircraftTypes: reqAircraftTypes || [],
      reqMedicalClass: reqMedicalClass || null,
      reqMinTotalHours: reqMinTotalHours || null,
      reqMinPicHours: reqMinPicHours || null,
      reqMinMultiEngineHours: reqMinMultiEngineHours || null,
      reqMinTurbineHours: reqMinTurbineHours || null,
      reqMinInstrumentHours: reqMinInstrumentHours || null,
      reqWillingToRelocate: !!reqWillingToRelocate,
      mergedInto: null, // un-merge if re-listed
    },
  });
}

// ─── Mark jobs absent from this run as inactive ───────────────────────────────

async function markStaleInactive(sourcePlatform, company, seenExternalIds) {
  if (!seenExternalIds.length) return 0;
  const { count } = await prisma.job.updateMany({
    where: {
      sourcePlatform,
      company,
      status: 'ACTIVE',
      externalId: { notIn: seenExternalIds },
    },
    data: { status: 'EXPIRED' },
  });
  return count;
}

// ─── Fetch raw jobs for one employer ─────────────────────────────────────────

async function fetchForEmployer(empConfig) {
  switch (empConfig.source) {
    case 'LEVER':      return fetchLever(empConfig);
    case 'GREENHOUSE': return fetchGreenhouse(empConfig);
    case 'WORKDAY':    return fetchWorkday(empConfig);
    default:
      logger.warn({ msg: `unknown source: ${empConfig.source}` });
      return [];
  }
}

// ─── Process one employer ─────────────────────────────────────────────────────

async function processEmployer(empConfig, { dryRun = false } = {}) {
  const label = `${empConfig.source}:${empConfig.slug || empConfig.config}`;
  const stats = {
    source: empConfig.source,
    employer: empConfig.company,
    requestsMade: 0,
    fetched: 0,
    keptAfterFilter: 0,
    upserted: 0,
    markedInactive: 0,
    errors: 0,
  };

  try {
    const raw = await fetchForEmployer(empConfig);
    stats.fetched = raw.length;

    const normalized = raw
      .map((r) => normalize(r, empConfig))
      .filter(Boolean);

    const { kept, dropped } = filterAviationJobs(normalized, empConfig.source, empConfig.company);
    stats.keptAfterFilter = kept.length;

    logger.info({
      msg: 'filter result',
      source: empConfig.source, employer: empConfig.company,
      fetched: raw.length, kept: kept.length, dropped,
    });

    if (!dryRun) {
      const seenExternalIds = [];
      const newJobs = [];

      for (const job of kept) {
        try {
          const isNew = !(await prisma.job.findUnique({
            where: { sourcePlatform_externalId: { sourcePlatform: job.sourcePlatform, externalId: job.externalId } },
            select: { id: true },
          }));

          const upserted = await upsertJob(job);
          seenExternalIds.push(job.externalId);
          stats.upserted++;

          if (isNew) newJobs.push(upserted);
        } catch (err) {
          stats.errors++;
          logger.error({ source: empConfig.source, employer: empConfig.company, externalId: job.externalId, err: err.message, msg: 'upsert failed' });
        }
      }

      // Expire jobs that weren't in this run's listing
      stats.markedInactive = await markStaleInactive(empConfig.source, empConfig.company, seenExternalIds);

      // Trigger pilot matching for new jobs only
      for (const job of newJobs) {
        try {
          await matchJobToAllPilots(job);
        } catch (err) {
          logger.error({ jobId: job.id, err: err.message, msg: 'matching failed' });
        }
      }
    }
  } catch (err) {
    stats.errors++;
    logger.error({ source: empConfig.source, employer: empConfig.company, err: err.message, msg: 'employer processing failed' });
  }

  logger.info({ msg: 'employer run complete', ...stats });
  return stats;
}

// ─── Full ingestion pass ──────────────────────────────────────────────────────

/**
 * @param {object[]} employers   employer config array (filtered by CLI args if needed)
 * @param {object}   opts
 * @param {boolean}  opts.dryRun  fetch + normalize, don't write to DB
 * @returns {Promise<import('./types').IngestionStats[]>}
 */
async function runAllEmployers(employers, opts = {}) {
  const allStats = [];
  const sourcePlatformsSeen = new Set();

  // Workday runs sequentially (Puppeteer is heavy); others can run per-employer sequentially too
  // for rate-limit safety. Parallelism would complicate per-host rate limiting.
  for (const emp of employers) {
    const stats = await processEmployer(emp, opts);
    allStats.push(stats);
    sourcePlatformsSeen.add(emp.source);
  }

  if (!opts.dryRun && sourcePlatformsSeen.size > 1) {
    // Cross-source dedup only makes sense when multiple sources ran
    await collapseXSourceDuplicates([...sourcePlatformsSeen]);
  }

  return allStats;
}

module.exports = { runAllEmployers, upsertJob, processEmployer };
