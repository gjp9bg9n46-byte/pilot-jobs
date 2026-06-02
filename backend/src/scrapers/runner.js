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
const { fetchLever }           = require('./sources/lever');
const { fetchGreenhouse }      = require('./sources/greenhouse');
const { fetchWorkday }         = require('./sources/workday/index');
const { fetchWorkdayRest }     = require('./sources/workday-rest');
const { fetchSmartRecruiters }     = require('./sources/smartrecruiters');
const { fetchPilotCareerCentre, enrichPccBatch } = require('./sources/pilotcareercentre');
const { fetchUSAJobs } = require('./sources/usajobs');
const { enrichWorkdayBatch } = require('./workday-enrichment');
const { normalize }      = require('./normalize');
const { filterAviationJobs } = require('./filters');
const { collapseXSourceDuplicates } = require('./dedup');
const { matchJobToAllPilots } = require('../services/matchingService');

// ─── Upsert a single normalized job ──────────────────────────────────────────

async function upsertJob(job) {
  const {
    sourcePlatform, externalId,
    title, company, location, country, description, notes,
    applyUrl, sourceUrl, postedAt, expiresAt,
    role, contractType, region,
    salaryMin, salaryMax, salaryCurrency, salaryPeriod,
    reqCertificates, reqAuthorities, reqAircraftTypes,
    reqMedicalClass, reqMinTotalHours, reqMinPicHours,
    reqMinMultiEngineHours, reqMinTurbineHours, reqMinInstrumentHours,
    reqMinCrossCountryHours, reqEducation, reqWorkAuthorization, reqEnglishLevel,
    reqWillingToRelocate,
  } = job;

  const data = {
    title, company, location,
    country: country || null,
    description: description || '',
    notes: notes || null,
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
    reqMinCrossCountryHours: reqMinCrossCountryHours || null,
    reqEducation: reqEducation || null,
    reqWorkAuthorization: reqWorkAuthorization || null,
    reqEnglishLevel: reqEnglishLevel || null,
    reqWillingToRelocate: !!reqWillingToRelocate,
    sourcePlatform,
    externalId,
    mergedInto: null,
  };

  return prisma.job.upsert({
    where: { sourcePlatform_externalId: { sourcePlatform, externalId } },
    create: data,
    update: {
      // On re-run: refresh all mutable fields; keep postedAt stable
      title, company, location, country: country || null,
      description: description || '',
      notes: notes || null,
      applyUrl, sourceUrl: sourceUrl || applyUrl,
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
      reqMinCrossCountryHours: reqMinCrossCountryHours || null,
      reqEducation: reqEducation || null,
      reqWorkAuthorization: reqWorkAuthorization || null,
      reqEnglishLevel: reqEnglishLevel || null,
      reqWillingToRelocate: !!reqWillingToRelocate,
      mergedInto: null,
    },
  });
}

// ─── Mark jobs absent from this run as inactive ───────────────────────────────

async function markStaleInactive(sourcePlatform, company, seenExternalIds) {
  if (!seenExternalIds.length) return 0;
  const now = new Date();
  const { count } = await prisma.job.updateMany({
    where: {
      sourcePlatform,
      company,
      status: 'ACTIVE',
      externalId: { notIn: seenExternalIds },
      // Don't expire jobs whose Workday expiresAt is still in the future
      OR: [
        { expiresAt: null },
        { expiresAt: { lte: now } },
      ],
    },
    data: { status: 'EXPIRED' },
  });
  return count;
}

// ─── Fetch raw jobs for one employer ─────────────────────────────────────────

async function fetchForEmployer(empConfig) {
  if (empConfig.disabled) {
    logger.info({ source: empConfig.source, employer: empConfig.company, msg: 'platform deprecated — skipped' });
    return [];
  }
  switch (empConfig.source) {
    case 'LEVER':           return fetchLever(empConfig);
    case 'GREENHOUSE':      return fetchGreenhouse(empConfig);
    case 'WORKDAY':         return fetchWorkday(empConfig);
    case 'WORKDAY_REST':    return fetchWorkdayRest(empConfig);
    case 'SMARTRECRUITERS':   return fetchSmartRecruiters(empConfig);
    case 'PILOTCAREERCENTRE': return fetchPilotCareerCentre(empConfig);
    case 'USAJOBS':           return fetchUSAJobs(empConfig);
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

    // skipFilter: true → source is already a pilot-only board (e.g. PilotCareerCentre)
    const { kept, dropped } = empConfig.skipFilter
      ? { kept: normalized, dropped: 0 }
      : filterAviationJobs(normalized, empConfig.source, empConfig.company);
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
          const existing = await prisma.job.findUnique({
            where: { sourcePlatform_externalId: { sourcePlatform: job.sourcePlatform, externalId: job.externalId } },
            select: {
              id: true, description: true, notes: true,
              reqCertificates: true, reqAuthorities: true, reqAircraftTypes: true,
              reqMedicalClass: true, reqMinTotalHours: true, reqMinPicHours: true,
              reqMinMultiEngineHours: true, reqMinTurbineHours: true, reqMinInstrumentHours: true,
              reqMinCrossCountryHours: true, reqEducation: true, reqWorkAuthorization: true,
              reqEnglishLevel: true, reqWillingToRelocate: true,
            },
          });
          const isNew = !existing;

          // For PCC: the list-page always produces a stub description. Don't overwrite
          // an already-enriched description (or its extracted req fields) with fresh stubs.
          const isEnrichedPcc = (
            !isNew &&
            job.sourcePlatform === 'PILOTCAREERCENTRE' &&
            existing.description &&
            !/ is recruiting /i.test(existing.description)
          );
          const jobToUpsert = isEnrichedPcc ? {
            ...job,
            description:            existing.description,
            notes:                  existing.notes,
            reqCertificates:        existing.reqCertificates,
            reqAuthorities:         existing.reqAuthorities,
            reqAircraftTypes:       existing.reqAircraftTypes,
            reqMedicalClass:        existing.reqMedicalClass,
            reqMinTotalHours:       existing.reqMinTotalHours,
            reqMinPicHours:         existing.reqMinPicHours,
            reqMinMultiEngineHours: existing.reqMinMultiEngineHours,
            reqMinTurbineHours:     existing.reqMinTurbineHours,
            reqMinInstrumentHours:  existing.reqMinInstrumentHours,
            reqMinCrossCountryHours:existing.reqMinCrossCountryHours,
            reqEducation:           existing.reqEducation,
            reqWorkAuthorization:   existing.reqWorkAuthorization,
            reqEnglishLevel:        existing.reqEnglishLevel,
            reqWillingToRelocate:   existing.reqWillingToRelocate,
          } : job;

          const upserted = await upsertJob(jobToUpsert);
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

      // PCC post-step: enrich any stub-description jobs with detail-page text + requirements.
      // Stub marker: 'is recruiting' AND char_length < 200 (avoids false positives where
      // 'is recruiting' appears in a longer enriched description). New jobs from this run
      // will be picked up here; already-enriched jobs are skipped automatically.
      if (empConfig.source === 'PILOTCAREERCENTRE') {
        const toEnrich = await prisma.$queryRaw`
          SELECT id, "sourceUrl", description
          FROM "Job"
          WHERE "sourcePlatform" = 'PILOTCAREERCENTRE'
            AND description ILIKE '% is recruiting %'
            AND char_length(description) < 200
        `;
        if (toEnrich.length > 0) {
          logger.info({ source: 'PILOTCAREERCENTRE', count: toEnrich.length, msg: 'enriching PCC detail pages' });
          const enriched = await enrichPccBatch(toEnrich);
          let enrichedCount = 0, failedCount = 0;
          for (const result of enriched) {
            if (!result) { failedCount++; continue; }
            enrichedCount++;
            try {
              await prisma.job.update({
                where: { id: result.id },
                data: {
                  description:             result.description,
                  notes:                   result.notes                   ?? null,
                  reqCertificates:         result.reqCertificates         ?? [],
                  reqAuthorities:          result.reqAuthorities          ?? [],
                  reqAircraftTypes:        result.reqAircraftTypes        ?? [],
                  reqMedicalClass:         result.reqMedicalClass         ?? null,
                  reqMinTotalHours:        result.reqMinTotalHours        ?? null,
                  reqMinPicHours:          result.reqMinPicHours          ?? null,
                  reqMinMultiEngineHours:  result.reqMinMultiEngineHours  ?? null,
                  reqMinTurbineHours:      result.reqMinTurbineHours      ?? null,
                  reqMinInstrumentHours:   result.reqMinInstrumentHours   ?? null,
                  reqMinCrossCountryHours: result.reqMinCrossCountryHours ?? null,
                  reqEducation:            result.reqEducation            ?? null,
                  reqWorkAuthorization:    result.reqWorkAuthorization    ?? null,
                  reqEnglishLevel:         result.reqEnglishLevel         ?? null,
                  reqWillingToRelocate:    result.reqWillingToRelocate    ?? false,
                  // Salary from prose — only set if not already populated
                  ...(result.salaryMin      != null ? { salaryMin:      result.salaryMin }      : {}),
                  ...(result.salaryMax      != null ? { salaryMax:      result.salaryMax }      : {}),
                  ...(result.salaryCurrency         ? { salaryCurrency: result.salaryCurrency } : {}),
                  ...(result.salaryPeriod           ? { salaryPeriod:   result.salaryPeriod }   : {}),
                },
              });
            } catch (err) {
              failedCount++;
              enrichedCount--;
              logger.error({ id: result.id, err: err.message, msg: 'PCC enrichment update failed' });
            }
          }
          logger.info({ source: 'PILOTCAREERCENTRE', enriched: enrichedCount, failed: failedCount, msg: 'PCC enrichment complete' });
        }
      }

      // Workday post-step: enrich any active jobs whose applyUrl is a Workday domain
      // and haven't been enriched in the last 14 days.
      const SKIP_DAYS = 14;
      const wdCutoff = new Date(Date.now() - SKIP_DAYS * 24 * 60 * 60 * 1000);
      const toWorkdayEnrich = await prisma.$queryRaw`
        SELECT id, title, company, "applyUrl", description, "contractType",
               "reqCertificates", "reqAuthorities", "reqAircraftTypes",
               "reqMedicalClass", "reqMinTotalHours", "reqMinPicHours",
               "reqMinMultiEngineHours", "reqMinTurbineHours", "reqMinInstrumentHours",
               "reqMinCrossCountryHours", "reqEducation", "reqWorkAuthorization",
               "reqEnglishLevel", "reqWillingToRelocate"
        FROM "Job"
        WHERE status = 'ACTIVE'
          AND "applyUrl" ILIKE '%myworkday%'
          AND ("lastEnrichedFromWorkdayAt" IS NULL OR "lastEnrichedFromWorkdayAt" < ${wdCutoff})
        ORDER BY "lastEnrichedFromWorkdayAt" ASC NULLS FIRST
        LIMIT 50
      `;
      if (toWorkdayEnrich.length > 0) {
        logger.info({ count: toWorkdayEnrich.length, msg: 'Workday enrichment post-step' });
        const wdResults = await enrichWorkdayBatch(toWorkdayEnrich);
        let wdEnriched = 0, wdNoJsonLd = 0, wdErrors = 0;
        for (const result of wdResults) {
          if (result.error) { wdErrors++; continue; }
          if (result.noJsonLd) {
            wdNoJsonLd++;
            await prisma.job.update({ where: { id: result.id }, data: { lastEnrichedFromWorkdayAt: new Date() } }).catch(() => {});
            continue;
          }
          wdEnriched++;
          await prisma.job.update({ where: { id: result.id }, data: result.updates }).catch((err) =>
            logger.error({ id: result.id, err: err.message, msg: 'Workday enrichment update failed' }),
          );
        }
        logger.info({ enriched: wdEnriched, noJsonLd: wdNoJsonLd, errors: wdErrors, msg: 'Workday enrichment complete' });
      }

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
