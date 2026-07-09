const prisma = require('../config/database');
const {
  getPilotFlightTotals, runMatchForPilot, computeAlertScore, computeMatchScore, computeMatchBreakdown,
  getQualifiedMedicalClasses,
} = require('../services/matchingService');
const { EDU_RANK, parseElpLevel } = require('../lib/eduRank');

const EU_COUNTRIES_RTW = new Set([
  'austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech republic',
  'denmark', 'estonia', 'finland', 'france', 'germany', 'greece',
  'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg',
  'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia',
  'slovenia', 'spain', 'sweden',
]);

async function enrichJobs(jobs, pilotId) {
  const [saved, applied] = await Promise.all([
    prisma.savedJob.findMany({ where: { pilotId }, select: { jobId: true } }),
    prisma.application.findMany({ where: { pilotId }, select: { jobId: true } }),
  ]);
  const savedSet = new Set(saved.map((s) => s.jobId));
  const appliedSet = new Set(applied.map((a) => a.jobId));
  return jobs.map((j) => ({ ...j, isSaved: savedSet.has(j.id), isApplied: appliedSet.has(j.id) }));
}

// ─── "No requirements specified" definition (shared by alerts noreq filter
// and the qualified-unread badge count) ───────────────────────────────────────
const NO_REQ_JOB_WHERE = {
  reqCertificates: { isEmpty: true },
  reqAuthorities: { isEmpty: true },
  reqAircraftTypes: { isEmpty: true },
  reqMinTotalHours: null,
  reqMinPicHours: null,
  reqMinMultiEngineHours: null,
  reqMinTurbineHours: null,
  reqMinInstrumentHours: null,
  reqMinCrossCountryHours: null,
  reqMedicalClass: null,
  reqEducation: null,
  reqWorkAuthorization: null,
  reqEnglishLevel: null,
};

function jobHasRequirements(job) {
  return (
    (job.reqCertificates?.length || 0) > 0 ||
    (job.reqAuthorities?.length || 0) > 0 ||
    (job.reqAircraftTypes?.length || 0) > 0 ||
    job.reqMinTotalHours != null || job.reqMinPicHours != null ||
    job.reqMinMultiEngineHours != null || job.reqMinTurbineHours != null ||
    job.reqMinInstrumentHours != null || job.reqMinCrossCountryHours != null ||
    job.reqMedicalClass != null || job.reqEducation != null ||
    job.reqWorkAuthorization != null || job.reqEnglishLevel != null
  );
}

exports.getJobs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      q,
      country,
      authority,
      aircraft,
      role,
      contractType,
      region,
      maxReqHours,
      salaryMin,
      postedWithin,
      sort = 'newest',
      qualifiedOnly,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const where = { status: 'ACTIVE' };
    const andConditions = [];

    // Text search across key fields
    if (q) {
      andConditions.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { company: { contains: q, mode: 'insensitive' } },
          { location: { contains: q, mode: 'insensitive' } },
          { country: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    // Scalar filters
    if (country) where.country = { contains: country, mode: 'insensitive' };
    if (role) where.role = role;
    if (contractType) where.contractType = contractType;
    if (region) where.region = region;

    // Authority: comma-separated list → hasSome
    if (authority) {
      const authorities = authority.split(',').map((a) => a.trim()).filter(Boolean);
      if (authorities.length > 0) where.reqAuthorities = { hasSome: authorities };
    }

    // Aircraft: comma-separated list → hasSome
    if (aircraft) {
      const types = aircraft.split(',').map((a) => a.trim()).filter(Boolean);
      if (types.length > 0) where.reqAircraftTypes = { hasSome: types };
    }

    // Max hours required by the job (show jobs requiring ≤ maxReqHours)
    if (maxReqHours) {
      andConditions.push({
        OR: [
          { reqMinTotalHours: null },
          { reqMinTotalHours: { lte: Number(maxReqHours) } },
        ],
      });
    }

    // Min salary expected: job's salaryMax must be >= requested salaryMin
    if (salaryMin) {
      andConditions.push({
        OR: [
          { salaryMax: null },
          { salaryMax: { gte: Number(salaryMin) } },
        ],
      });
    }

    // Posted within N days
    if (postedWithin) {
      const since = new Date();
      since.setDate(since.getDate() - Number(postedWithin));
      where.postedAt = { gte: since };
    }

    // Qualified-only: filter by pilot's profile against job requirements.
    // Requires a logged-in pilot; ignored for public (logged-out) requests.
    if (qualifiedOnly === 'true' && req.pilot) {
      // NOTE: matching logic is duplicated in client-side computeMatchCount (Jobs.jsx).
      // Both must stay in sync. Long-term: compute server-side and return in API response.
      const pilot = await prisma.pilot.findUnique({
        where: { id: req.pilot.id },
        include: { certificates: true, ratings: true, medicals: true, rightToWork: true },
      });
      const totals = await getPilotFlightTotals(req.pilot.id);

      // Normalize cert types: treat ATP/ATPL and CAA variants as equivalent
      const normalise = (t) => (t === 'ATP' ? ['ATP', 'ATPL'] : t === 'ATPL' ? ['ATPL', 'ATP'] : [t]);
      const normaliseAuth = (a) => (a === 'CAA_UK' || a === 'CAA-UK') ? ['CAA', 'CAA_UK', 'CAA-UK'] : a === 'CAA' ? ['CAA', 'CAA_UK', 'CAA-UK'] : [a];
      const flightCerts = pilot.certificates.filter((c) => c.type !== 'ELP');
      const certTypes = [...new Set(flightCerts.flatMap((c) => normalise(c.type)))];
      const certAuthorities = [...new Set(flightCerts.flatMap((c) => normaliseAuth(c.issuingAuthority)))];
      const ratingTypes = pilot.ratings.map((r) => r.aircraftType.toUpperCase());

      // Certs — strict: pilot must have a matching cert, or job has no cert requirement.
      // Principle: charitable null on the JOB side only; missing pilot data = fail.
      andConditions.push(certTypes.length > 0
        ? { OR: [{ reqCertificates: { isEmpty: true } }, { reqCertificates: { hasSome: certTypes } }] }
        : { reqCertificates: { isEmpty: true } }
      );

      // Authority — strict
      andConditions.push(certAuthorities.length > 0
        ? { OR: [{ reqAuthorities: { isEmpty: true } }, { reqAuthorities: { hasSome: certAuthorities } }] }
        : { reqAuthorities: { isEmpty: true } }
      );

      // Total hours — strict: always compare; 0 pilot hours fails any positive job requirement
      andConditions.push({
        OR: [{ reqMinTotalHours: null }, { reqMinTotalHours: { lte: totals.totalTime ?? 0 } }],
      });

      // PIC hours — strict
      andConditions.push({
        OR: [{ reqMinPicHours: null }, { reqMinPicHours: { lte: totals.picTime ?? 0 } }],
      });

      // Aircraft type ratings — strict
      andConditions.push(ratingTypes.length > 0
        ? { OR: [{ reqAircraftTypes: { isEmpty: true } }, { reqAircraftTypes: { hasSome: ratingTypes } }] }
        : { reqAircraftTypes: { isEmpty: true } }
      );

      // Medical class — strict: no medical on file → only jobs with no medical requirement
      const qualifiedMedicals = getQualifiedMedicalClasses(pilot.medicals);
      andConditions.push(qualifiedMedicals
        ? { OR: [{ reqMedicalClass: null }, { reqMedicalClass: { in: qualifiedMedicals } }] }
        : { reqMedicalClass: null }
      );

      // Multi-engine hours — strict
      andConditions.push({
        OR: [{ reqMinMultiEngineHours: null }, { reqMinMultiEngineHours: { lte: totals.multiEngineTime ?? 0 } }],
      });

      // Turbine hours — strict
      andConditions.push({
        OR: [{ reqMinTurbineHours: null }, { reqMinTurbineHours: { lte: totals.turbineTime ?? 0 } }],
      });

      // Instrument hours — strict
      andConditions.push({
        OR: [{ reqMinInstrumentHours: null }, { reqMinInstrumentHours: { lte: totals.instrumentTime ?? 0 } }],
      });

      // Cross-country hours — strict
      andConditions.push({
        OR: [{ reqMinCrossCountryHours: null }, { reqMinCrossCountryHours: { lte: totals.crossCountryTime ?? 0 } }],
      });

      // Education — strict: no education on file → only jobs with no education requirement
      if (pilot.education != null) {
        const pilotEduRank = EDU_RANK[pilot.education] ?? 0;
        const validEdus = Object.entries(EDU_RANK)
          .filter(([, rank]) => rank <= pilotEduRank)
          .map(([edu]) => edu);
        andConditions.push({
          OR: [{ reqEducation: null }, { reqEducation: { in: validEdus } }],
        });
      } else {
        andConditions.push({ reqEducation: null });
      }

      // English level (ELP) — strict: no parseable ELP cert → only jobs with no ELP requirement
      const elpCert = pilot.certificates.find((c) => c.type === 'ELP');
      const pilotElpLevel = parseElpLevel(elpCert?.englishLevel);
      andConditions.push(pilotElpLevel != null
        ? { OR: [{ reqEnglishLevel: null }, { reqEnglishLevel: { lte: pilotElpLevel } }] }
        : { reqEnglishLevel: null }
      );

      // Willing to relocate — if pilot is NOT willing, exclude jobs that require it
      if (!pilot.willingToRelocate) {
        andConditions.push({ reqWillingToRelocate: { not: true } });
      }

      // Role — if pilot has declared a role, restrict to matching or unspecified job roles
      if (pilot.role) {
        andConditions.push({ OR: [{ role: null }, { role: pilot.role }] });
      }

      // Work authorisation
      if (pilot.rightToWork.length === 0) {
        // No RTW on file: only show jobs with no requirement
        andConditions.push({ reqWorkAuthorization: null });
      } else {
        const rtwCountries = pilot.rightToWork.map((r) => r.country.toLowerCase().trim());
        const rtwOptions = [
          { reqWorkAuthorization: null },
          { reqWorkAuthorization: 'required' },
        ];
        if (rtwCountries.some((c) => EU_COUNTRIES_RTW.has(c)))                          rtwOptions.push({ reqWorkAuthorization: 'EU' });
        if (rtwCountries.some((c) => ['united states', 'usa', 'us'].includes(c)))       rtwOptions.push({ reqWorkAuthorization: 'US' });
        if (rtwCountries.some((c) => ['united kingdom', 'uk', 'great britain'].includes(c))) rtwOptions.push({ reqWorkAuthorization: 'UK' });
        andConditions.push({ OR: rtwOptions });
      }
    }

    if (andConditions.length > 0) where.AND = andConditions;

    // Sort order
    let orderBy;
    switch (sort) {
      case 'salary_high':
        orderBy = [{ salaryMax: { sort: 'desc', nulls: 'last' } }, { postedAt: 'desc' }];
        break;
      case 'salary_low':
        orderBy = [{ salaryMin: { sort: 'asc', nulls: 'last' } }, { postedAt: 'desc' }];
        break;
      case 'hours_asc':
        orderBy = [{ reqMinTotalHours: { sort: 'asc', nulls: 'last' } }, { postedAt: 'desc' }];
        break;
      case 'deadline':
        orderBy = [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { postedAt: 'desc' }];
        break;
      case 'oldest':
        orderBy = { postedAt: 'asc' };
        break;
      default:
        orderBy = { postedAt: 'desc' };
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({ where, orderBy, skip, take: Number(limit) }),
      prisma.job.count({ where }),
    ]);

    // Public (logged-out) requests have no pilot → no isSaved/isApplied state.
    const enriched = req.pilot
      ? await enrichJobs(jobs, req.pilot.id)
      : jobs.map((j) => ({ ...j, isSaved: false, isApplied: false }));

    res.json({
      jobs: enriched,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    next(err);
  }
};

exports.getJob = async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Resolve the airline factfile id from the company name (case-insensitive),
    // so the JobDetail "View factfile" link doesn't need the client airline map.
    let airlineId = null;
    if (job.company) {
      const airline = await prisma.airline.findFirst({
        where: { name: { equals: job.company, mode: 'insensitive' } },
        select: { id: true },
      });
      airlineId = airline?.id ?? null;
    }

    // Public-readable (optionalAuth): enrich isSaved/isApplied only when a pilot
    // is known; otherwise default to false.
    const enriched = req.pilot
      ? (await enrichJobs([job], req.pilot.id))[0]
      : { ...job, isSaved: false, isApplied: false };

    res.json({ ...enriched, airlineId });
  } catch (err) {
    next(err);
  }
};

exports.getMyAlerts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, filter = 'all', sort = 'newest' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = { pilotId: req.pilot.id };

    // Filter bucket
    if (filter === 'unread') {
      where.readAt = null;
      where.dismissedAt = null;
    } else if (filter === 'dismissed') {
      where.dismissedAt = { not: null };
    } else if (filter === 'noreq') {
      // Jobs that didn't specify any requirements — can't be scored, surfaced
      // in their own bucket so pilots can review them manually.
      where.dismissedAt = null;
      where.job = NO_REQ_JOB_WHERE;
    } else if (filter === 'saved') {
      const savedJobIds = (
        await prisma.savedJob.findMany({ where: { pilotId: req.pilot.id }, select: { jobId: true } })
      ).map((s) => s.jobId);
      where.jobId = { in: savedJobIds };
      where.dismissedAt = null;
    } else {
      // 'all' — exclude dismissed
      where.dismissedAt = null;
    }

    // Sort
    let orderBy;
    switch (sort) {
      case 'score':
        orderBy = [{ matchScore: 'desc' }, { createdAt: 'desc' }];
        break;
      case 'deadline':
        orderBy = [{ job: { expiresAt: { sort: 'asc', nulls: 'last' } } }, { createdAt: 'desc' }];
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    const [alerts, total] = await Promise.all([
      prisma.jobAlert.findMany({
        where,
        include: { job: true },
        orderBy,
        skip,
        take: Number(limit),
      }),
      prisma.jobAlert.count({ where }),
    ]);

    res.json({ alerts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
};

exports.markAlertRead = async (req, res, next) => {
  try {
    await prisma.jobAlert.updateMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
      data: { readAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.getSavedJobs = async (req, res, next) => {
  try {
    const saved = await prisma.savedJob.findMany({
      where: { pilotId: req.pilot.id },
      include: { job: true },
      orderBy: { createdAt: 'desc' },
    });
    // Apply applied status too
    const jobs = saved.map((s) => s.job);
    const applied = await prisma.application.findMany({
      where: { pilotId: req.pilot.id, jobId: { in: jobs.map((j) => j.id) } },
      select: { jobId: true },
    });
    const appliedSet = new Set(applied.map((a) => a.jobId));
    res.json(jobs.map((j) => ({ ...j, isSaved: true, isApplied: appliedSet.has(j.id) })));
  } catch (err) {
    next(err);
  }
};

exports.saveJob = async (req, res, next) => {
  try {
    await prisma.savedJob.upsert({
      where: { pilotId_jobId: { pilotId: req.pilot.id, jobId: req.params.id } },
      create: { pilotId: req.pilot.id, jobId: req.params.id },
      update: {},
    });
    // Ensure a JobAlert exists so this job appears in the Saved filter on Alerts page
    const alertExists = await prisma.jobAlert.findUnique({
      where: { pilotId_jobId: { pilotId: req.pilot.id, jobId: req.params.id } },
    });
    if (!alertExists) {
      try {
        const [job, pilot] = await Promise.all([
          prisma.job.findUnique({ where: { id: req.params.id } }),
          prisma.pilot.findUnique({
            where: { id: req.pilot.id },
            include: { certificates: true, ratings: true, medicals: true },
          }),
        ]);
        const totals = await getPilotFlightTotals(req.pilot.id);
        const score = computeAlertScore(pilot, totals, job) ?? 0;
        const breakdown = computeMatchBreakdown(pilot, totals, job);
        await prisma.jobAlert.create({
          data: { pilotId: req.pilot.id, jobId: req.params.id, matchScore: score, breakdown },
        });
      } catch (_) {}
    }
    res.json({ saved: true });
  } catch (err) {
    next(err);
  }
};

exports.unsaveJob = async (req, res, next) => {
  try {
    await prisma.savedJob.deleteMany({
      where: { pilotId: req.pilot.id, jobId: req.params.id },
    });
    res.json({ saved: false });
  } catch (err) {
    next(err);
  }
};

exports.applyToJob = async (req, res, next) => {
  try {
    const jobId = req.params.id;
    const pilotId = req.pilot.id;

    // Idempotent: a re-click returns success without re-snapshotting (the match is
    // captured AS OF the first apply and must not drift on later clicks).
    const existing = await prisma.application.findUnique({
      where: { pilotId_jobId: { pilotId, jobId } },
      include: { job: { select: { applyUrl: true } } },
    });
    if (existing) return res.json({ applied: true, applyUrl: existing.job.applyUrl });

    const [pilot, totals, job] = await Promise.all([
      prisma.pilot.findUnique({
        where: { id: pilotId },
        include: { certificates: true, ratings: true, medicals: true, rightToWork: true },
      }),
      getPilotFlightTotals(pilotId),
      prisma.job.findUnique({ where: { id: jobId } }),
    ]);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Strict 0–100 match snapshot (null when the pilot hard-fails a requirement —
    // the employer still sees the application + the breakdown of what's missing).
    const matchScore = computeMatchScore(pilot, totals, job);
    const matchBreakdown = computeMatchBreakdown(pilot, totals, job);

    await prisma.application.create({
      data: { pilotId, jobId, matchScore, matchBreakdown },
    });

    // Phase D notification trigger (stub — Resend wiring is the backend cluster).
    console.log(`[notify] Employer digest trigger — new application: pilot=${pilotId} job=${jobId} score=${matchScore}`);

    res.json({ applied: true, applyUrl: job.applyUrl });
  } catch (err) {
    next(err);
  }
};

// Pilot's own applications (My Applications tab). Own rows only.
exports.getMyApplications = async (req, res, next) => {
  try {
    const apps = await prisma.application.findMany({
      where: { pilotId: req.pilot.id },
      orderBy: { appliedAt: 'desc' },
      include: {
        job: { select: { id: true, title: true, company: true, location: true, role: true, status: true } },
      },
    });
    res.json(apps.map((a) => ({
      id: a.id,
      job: a.job,
      status: a.status,
      appliedAt: a.appliedAt,
      statusUpdatedAt: a.statusUpdatedAt,
      matchScore: a.matchScore,
    })));
  } catch (err) {
    next(err);
  }
};

exports.reportJob = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Reason is required' });
    await prisma.jobReport.create({
      data: { pilotId: req.pilot.id, jobId: req.params.id, reason },
    });
    res.json({ reported: true });
  } catch (err) {
    next(err);
  }
};

exports.markAllAlertsRead = async (req, res, next) => {
  try {
    const { count } = await prisma.jobAlert.updateMany({
      where: { pilotId: req.pilot.id, readAt: null, dismissedAt: null },
      data: { readAt: new Date() },
    });
    res.json({ updated: count });
  } catch (err) {
    next(err);
  }
};

exports.dismissAlert = async (req, res, next) => {
  try {
    await prisma.jobAlert.updateMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
      data: { dismissedAt: new Date() },
    });
    res.json({ dismissed: true });
  } catch (err) {
    next(err);
  }
};

// ─── Saved searches ───────────────────────────────────────────────────────────

exports.getSavedSearches = async (req, res, next) => {
  try {
    const searches = await prisma.savedSearch.findMany({
      where: { pilotId: req.pilot.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(searches);
  } catch (err) {
    next(err);
  }
};

exports.createSavedSearch = async (req, res, next) => {
  try {
    const { name, filters, frequency = 'INSTANT' } = req.body;
    if (!name || !filters) return res.status(400).json({ error: 'name and filters are required' });
    const search = await prisma.savedSearch.create({
      data: { pilotId: req.pilot.id, name, filters, frequency },
    });
    res.status(201).json(search);
  } catch (err) {
    next(err);
  }
};

exports.updateSavedSearch = async (req, res, next) => {
  try {
    const { name, filters, frequency, paused } = req.body;
    const search = await prisma.savedSearch.updateMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
      data: {
        ...(name !== undefined && { name }),
        ...(filters !== undefined && { filters }),
        ...(frequency !== undefined && { frequency }),
        ...(paused !== undefined && { paused }),
      },
    });
    if (!search.count) return res.status(404).json({ error: 'Not found' });
    res.json({ updated: true });
  } catch (err) {
    next(err);
  }
};

exports.deleteSavedSearch = async (req, res, next) => {
  try {
    await prisma.savedSearch.deleteMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
    });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
};

exports.triggerMatch = async (req, res, next) => {
  try {
    const matched = await runMatchForPilot(req.pilot.id);
    res.json({ matched });
  } catch (err) {
    next(err);
  }
};

// Badge count: unread alerts the pilot actually QUALIFIES for (meets every
// specified requirement, strict). Jobs with no specified requirements are
// excluded here — they live in the Alerts 'noreq' bucket instead.
exports.getUnreadCount = async (req, res, next) => {
  try {
    const pilotId = req.pilot.id;
    const [alerts, pilot, totals] = await Promise.all([
      prisma.jobAlert.findMany({
        where: { pilotId, readAt: null, dismissedAt: null, job: { status: 'ACTIVE' } },
        include: { job: true },
      }),
      prisma.pilot.findUnique({
        where: { id: pilotId },
        include: { certificates: true, ratings: true, medicals: true, rightToWork: true },
      }),
      getPilotFlightTotals(pilotId),
    ]);

    let qualified = 0;
    let noReq = 0;
    for (const a of alerts) {
      if (!jobHasRequirements(a.job)) { noReq++; continue; }
      if (computeMatchScore(pilot, totals, a.job) != null) qualified++;
    }

    res.json({ unread: qualified, totalUnread: alerts.length, noReqUnread: noReq });
  } catch (err) {
    next(err);
  }
};
