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
const { fetchMagellan }        = require('./sources/magellan');
const { fetchSmartRecruiters }     = require('./sources/smartrecruiters');
const { fetchPilotCareerCentre, enrichPccBatch } = require('./sources/pilotcareercentre');
const { fetchUSAJobs } = require('./sources/usajobs');
const { fetchAdzuna } = require('./sources/adzuna');
const { fetchJooble } = require('./sources/jooble');
const { fetchCareerjet } = require('./sources/careerjet');
const { fetchTaleo } = require('./sources/taleo');
const { fetchAviationJobSearch } = require('./sources/aviationjobsearch');
const { fetchIcims } = require('./sources/icims');
const { fetchAvature } = require('./sources/avature');
const { fetchJibe } = require('./sources/jibe');
const { enrichWorkdayBatch } = require('./workday-enrichment');
const { normalize, hasAnyRequirement } = require('./normalize');
const { filterAviationJobs, isAviationJob, isNotHiringNotice } = require('./filters');
const { classifySourceType } = require('./sourceType');
const { sendEmail } = require('../services/emailService');
const { collapseXSourceDuplicates, collapseSameAdAcrossLocations, collapseAggregatorDuplicates } = require('./dedup');
const { matchJobToAllPilots } = require('../services/matchingService');

// ─── Upsert a single normalized job ──────────────────────────────────────────

async function upsertJob(job, { preserveMerge = false } = {}) {
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
    sourceType: classifySourceType(applyUrl, sourcePlatform),
    externalId,
    mergedInto: null,
    lastSeenAt: new Date(),
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
      sourceType: classifySourceType(applyUrl, sourcePlatform),
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
      // Appearing in this fetch is a "seen today" fact regardless of merge state,
      // so lastSeenAt always refreshes — even for a sticky-merged row.
      lastSeenAt: new Date(),
      // Sticky merge: a row that dedup EXPIRED + mergedInto must NOT resurrect
      // just because its source still lists it — otherwise it flaps ACTIVE↔EXPIRED
      // every cron cycle (and serves the aggregator link in the window between
      // upsert and dedup). Content fields above still refresh; status/mergedInto
      // are only reset for a NON-merged row (the normal "reappeared after going
      // stale" reactivation).
      ...(preserveMerge ? {} : { status: 'ACTIVE', mergedInto: null }),
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
      // Aggregate sources (Adzuna, Jooble, USAJobs, AJS…) store the REAL
      // employer name on each job, so filtering by the config's label
      // ('Adzuna (Europe)') would match nothing and stale jobs would live
      // forever. For those, company is passed as null → match by source only.
      ...(company ? { company } : {}),
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
    case 'MAGELLAN':        return fetchMagellan(empConfig);
    case 'SMARTRECRUITERS':   return fetchSmartRecruiters(empConfig);
    case 'PILOTCAREERCENTRE': return fetchPilotCareerCentre(empConfig);
    case 'USAJOBS':           return fetchUSAJobs(empConfig);
    case 'ADZUNA':            return fetchAdzuna(empConfig);
    case 'JOOBLE':            return fetchJooble(empConfig);
    case 'CAREERJET':         return fetchCareerjet(empConfig);
    case 'TALEO':             return fetchTaleo(empConfig);
    case 'AVIATIONJOBSEARCH':  return fetchAviationJobSearch(empConfig);
    case 'ICIMS':             return fetchIcims(empConfig);
    case 'AVATURE':           return fetchAvature(empConfig);
    case 'JIBE':              return fetchJibe(empConfig);
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
    let { kept, dropped } = empConfig.skipFilter
      ? { kept: normalized, dropped: 0 }
      : filterAviationJobs(normalized, empConfig.source, empConfig.company, {
          excludeOnly: !!empConfig.excludeOnly,
          requireContext: !!empConfig.requireContext,
        });

    // Freshness cap for aggregators: their feeds resurface years-old evergreen
    // postings; anything older than JOB_MAX_AGE_DAYS never reaches the board.
    if (empConfig.aggregate) {
      const cutoff = new Date(Date.now() - maxAgeDays() * 24 * 3600 * 1000);
      const fresh = kept.filter((j) => !j.postedAt || j.postedAt >= cutoff);
      dropped += kept.length - fresh.length;
      kept = fresh;
    }

    // Requirement floor for aggregators (owner directive): a listing that
    // states NO extractable requirements is noise on a matching platform.
    // Non-English jobs get a pass here — translation extracts their
    // requirements later, and the sweep re-checks them afterwards.
    if (empConfig.requireContext) {
      const looksEnglish = (t) => ((String(t || '').slice(0, 500).match(/\b(the|and|with|for|you|will|are|this|that|from|have|our|is|of|to)\b/gi) || []).length >= 3);
      const withReqs = kept.filter((j) => hasAnyRequirement(j) || !looksEnglish(`${j.title} ${j.description}`));
      dropped += kept.length - withReqs.length;
      kept = withReqs;
    }

    // "We are not hiring" pages scraped as vacancies (e.g. a careers page
    // stating no recruiting is anticipated this year) are not jobs at all.
    {
      const hiring = kept.filter((j) => !isNotHiringNotice(j.description));
      dropped += kept.length - hiring.length;
      kept = hiring;
    }
    stats.keptAfterFilter = kept.length;

    logger.info({
      msg: 'filter result',
      source: empConfig.source, employer: empConfig.company,
      fetched: raw.length, kept: kept.length, dropped,
    });

    // Zero-result / failed-fetch guard: a source that returned NOTHING this run
    // is treated as a FAILED run, not an emptied source — skip the write/expiry
    // block entirely so a transient outage or edge-gated portal can't wipe every
    // row and resurrect it next cycle (flapping). (markStaleInactive is a no-op
    // on empty upserts too; this short-circuits + logs it explicitly. A genuinely
    // idle employer simply keeps its prior rows until it posts again — the safe
    // direction.)
    if (raw.length === 0) {
      logger.warn({ source: empConfig.source, employer: empConfig.company, msg: 'fetch returned 0 jobs — failed/empty-run guard: skipping expiry this run' });
      logger.info({ msg: 'employer run complete', ...stats });
      return stats;
    }

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
              reqEnglishLevel: true, reqWillingToRelocate: true, mergedInto: true,
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

          // preserveMerge: a row dedup already merged stays EXPIRED + mergedInto
          // on re-scrape (sticky) rather than resurrecting and flapping.
          const upserted = await upsertJob(jobToUpsert, { preserveMerge: !!existing?.mergedInto });
          seenExternalIds.push(job.externalId);
          stats.upserted++;

          if (isNew) newJobs.push(upserted);
        } catch (err) {
          stats.errors++;
          logger.error({ source: empConfig.source, employer: empConfig.company, externalId: job.externalId, err: err.message, msg: 'upsert failed' });
        }
      }

      // Expire jobs that weren't in this run's listing
      stats.markedInactive = await markStaleInactive(
        empConfig.source,
        empConfig.aggregate ? null : empConfig.company,
        seenExternalIds,
      );

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

// ─── Housekeeping sweeps (run once per ingestion pass) ────────────────────────

const maxAgeDays = () => Math.max(1, parseInt(process.env.JOB_MAX_AGE_DAYS || '90', 10));

/**
 * Re-validate ACTIVE jobs from aggregate sources against the CURRENT filter
 * rules and freshness cap, expiring failures. Self-healing: when the filter
 * gets stricter (e.g. the French "pilote de travaux" purge, rotary-model
 * blocks), previously stored junk disappears on the next run without manual
 * DB surgery.
 */
async function revalidateActiveJobs(employers) {
  let expired = 0;
  const cutoff = new Date(Date.now() - maxAgeDays() * 24 * 3600 * 1000);

  // Disabled employers never refresh, so their leftover ACTIVE jobs are
  // zombies (e.g. Zipline/Anduril after the no-drones directive) — expire them.
  for (const emp of employers) {
    if (!emp.disabled) continue;
    const { count } = await prisma.job.updateMany({
      where: {
        sourcePlatform: emp.source,
        status: 'ACTIVE',
        ...(emp.aggregate ? {} : { company: emp.company }),
      },
      data: { status: 'EXPIRED' },
    });
    if (count) {
      expired += count;
      logger.info({ source: emp.source, employer: emp.company, expired: count, msg: 'expired jobs from disabled employer' });
    }
  }

  const seenSources = new Set();
  for (const emp of employers) {
    if (emp.disabled || !emp.aggregate || seenSources.has(emp.source)) continue;
    seenSources.add(emp.source);
    const jobs = await prisma.job.findMany({
      where: { sourcePlatform: emp.source, status: 'ACTIVE' },
      select: {
        id: true, title: true, description: true, postedAt: true,
        // Everything hasAnyRequirement() and the language guard below read —
        // without these selected they're undefined and the floor never fires.
        sourceLanguage: true, descriptionEn: true,
        reqCertificates: true, reqAuthorities: true, reqAircraftTypes: true,
        reqMinTotalHours: true, reqMinPicHours: true, reqMinMultiEngineHours: true,
        reqMinTurbineHours: true, reqMinInstrumentHours: true, reqMinCrossCountryHours: true,
        reqMedicalClass: true, reqEducation: true, reqWorkAuthorization: true, reqEnglishLevel: true,
      },
    });
    const badIds = jobs
      .filter((j) =>
        (j.postedAt && j.postedAt < cutoff) ||
        (!emp.skipFilter && !isAviationJob(j, { excludeOnly: !!emp.excludeOnly, requireContext: !!emp.requireContext })) ||
        // "We are not hiring" notices scraped as if they were vacancies.
        isNotHiringNotice(j.description) ||
        // Requirement floor: English (or already-translated) aggregator jobs
        // with zero structured requirements are noise — expire them.
        (emp.requireContext && !hasAnyRequirement(j) && (j.sourceLanguage === 'EN' || j.descriptionEn != null)))
      .map((j) => j.id);
    if (badIds.length) {
      const { count } = await prisma.job.updateMany({
        where: { id: { in: badIds } },
        data: { status: 'EXPIRED' },
      });
      expired += count;
      logger.info({ source: emp.source, expired: count, msg: 'revalidation expired stale/non-pilot jobs' });
    }
  }
  return expired;
}

/** Expire any ACTIVE job whose own expiry date has passed. */
async function expirePastDue() {
  const { count } = await prisma.job.updateMany({
    where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
  if (count) logger.info({ expired: count, msg: 'expired past-validThrough jobs' });
  return count;
}

const unseenMaxDays = () => Math.max(1, parseInt(process.env.JOB_UNSEEN_MAX_DAYS || '14', 10));

/**
 * Hard staleness backstop — the thing that stops a dead/gated source producing
 * immortal rows. A healthy cron re-sees every live posting within hours, so a
 * row not seen in `unseenMaxDays` (default 14) is dead, not gated.
 *
 * This deliberately OVERRIDES the zero-result guard: markStaleInactive skips
 * expiry when a source returns 0 (so a transient failure can't wipe good data),
 * but a source returning nothing for two weeks is dead — the backstop catches
 * exactly the rows the guard protects.
 *
 * lastSeenAt is authoritative once set. Rows that predate the field (lastSeenAt
 * NULL) fall back to updatedAt, which every re-see refreshes — so a still-live
 * NULL row is spared and only genuinely-unseen NULL rows expire. Scoped to
 * scraped rows only: employer-posted (first-party) and manual/legacy rows are
 * never re-scraped and must not be swept.
 */
async function expireUnseen() {
  const cutoff = new Date(Date.now() - unseenMaxDays() * 24 * 3600 * 1000);
  const { count } = await prisma.job.updateMany({
    where: {
      status: 'ACTIVE',
      sourcePlatform: { not: null }, // scraped rows only
      postedByEmployerId: null,      // never expire first-party employer posts
      OR: [
        { lastSeenAt: { lt: cutoff } },
        { lastSeenAt: null, updatedAt: { lt: cutoff } },
      ],
    },
    data: { status: 'EXPIRED' },
  });
  if (count) logger.info({ expired: count, unseenMaxDays: unseenMaxDays(), msg: 'expired rows unseen past backstop window (overrides zero-result guard)' });
  return count;
}

/**
 * Zero-result alert — the thing that surfaces the next CAE before someone finds
 * it six months late. The pipeline CANNOT distinguish "this employer has no
 * openings" from "this scraper is dead" — both return 0 rows. So every enabled
 * source that returns 0 on a run is reported loudly (warn log + one digest
 * email) for a human to judge. The 14-day backstop cleans up after the
 * confusion; this alert exposes it.
 *
 * Batched to one email per run (not one per source) to avoid fatigue. Email
 * no-ops without RESEND_API_KEY (local dev) — the warn log always fires.
 * Recipient: SCRAPER_ALERT_EMAIL, falling back to CONTACT_EMAIL.
 */
async function alertZeroResults(zeros) {
  if (!zeros.length) return;
  logger.warn({ msg: 'SCRAPER ALERT: enabled sources returned 0 rows', count: zeros.length, zeros });
  const to = process.env.SCRAPER_ALERT_EMAIL || process.env.CONTACT_EMAIL;
  if (!to) return;
  const lines = zeros.map((z) => `- ${z.source} / ${z.company}${z.errors ? `  (fetch errors: ${z.errors})` : ''}`);
  try {
    await sendEmail({
      to,
      subject: `⚠️ Scraper: ${zeros.length} source${zeros.length > 1 ? 's' : ''} returned 0 rows`,
      text:
        'These ENABLED sources returned 0 jobs on the latest scrape. A source with '
        + 'genuinely no openings and a dead scraper look identical here — check each '
        + '(the CAE-Greenhouse-404 class of failure is silent 0):\n\n'
        + lines.join('\n')
        + '\n\nRepoint or disable dead configs so this alert stays signal, not noise.',
    });
    logger.info({ msg: 'zero-result alert email sent', to, count: zeros.length });
  } catch (err) { logger.error({ err: err.message, msg: 'zero-result alert email failed' }); }
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
  const zeroResults = [];

  // Workday runs sequentially (Puppeteer is heavy); others can run per-employer sequentially too
  // for rate-limit safety. Parallelism would complicate per-host rate limiting.
  for (const emp of employers) {
    const stats = await processEmployer(emp, opts);
    allStats.push(stats);
    sourcePlatformsSeen.add(emp.source);
    // A 0-row fetch from an enabled source is the ambiguous "dead vs empty" signal.
    if (!emp.disabled && stats.fetched === 0) {
      zeroResults.push({ source: emp.source, company: emp.company || emp.source, errors: stats.errors });
    }
  }

  if (!opts.dryRun) {
    // Staleness backstop runs FIRST (after all employers refreshed lastSeenAt),
    // so dead/unseen rows are EXPIRED before dedup — a stale row can never be
    // selected as a displacement canonical.
    try { await expireUnseen(); } catch (err) { logger.error({ err: err.message, msg: 'unseen backstop failed' }); }
  }

  if (!opts.dryRun && sourcePlatformsSeen.size > 1) {
    // Cross-source dedup only makes sense when multiple sources ran
    await collapseXSourceDuplicates([...sourcePlatformsSeen]);
  }

  if (!opts.dryRun) {
    // Fuzzy aggregator→clean displacement, AFTER exact-key dedup. Runs across ALL
    // active platforms (not just those seen this run) so a newly-ingested direct
    // row can displace an aggregator row left over from a prior cycle.
    try {
      const activePlatforms = (await prisma.job.findMany({ where: { status: 'ACTIVE' }, select: { sourcePlatform: true }, distinct: ['sourcePlatform'] })).map((r) => r.sourcePlatform).filter(Boolean);
      await collapseAggregatorDuplicates(activePlatforms, { dryRun: false });
    } catch (err) { logger.error({ err: err.message, msg: 'aggregator-dedup failed' }); }
  }

  if (!opts.dryRun) {
    // Housekeeping: purge stored jobs that no longer pass the (stricter) filter,
    // and anything past its own expiry date.
    try { await collapseSameAdAcrossLocations(); } catch (err) { logger.error({ err: err.message, msg: 'same-ad collapse failed' }); }
    try { await revalidateActiveJobs(employers); } catch (err) { logger.error({ err: err.message, msg: 'revalidation sweep failed' }); }
    try { await expirePastDue(); } catch (err) { logger.error({ err: err.message, msg: 'expiry sweep failed' }); }
    try {
      const { translateUntranslatedJobs } = require('../services/translationService');
      await translateUntranslatedJobs();
    } catch (err) { logger.error({ err: err.message, msg: 'translation sweep failed' }); }
    // Surface dead/empty sources loudly — the pipeline can't tell them apart.
    try { await alertZeroResults(zeroResults); } catch (err) { logger.error({ err: err.message, msg: 'zero-result alert failed' }); }
  }

  return allStats;
}

module.exports = { runAllEmployers, upsertJob, processEmployer, revalidateActiveJobs, expirePastDue, expireUnseen, alertZeroResults, fetchForEmployer };
