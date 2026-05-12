const prisma = require('../config/database');
const { getPilotFlightTotals } = require('../services/matchingService');

async function enrichJobs(jobs, pilotId) {
  const [saved, applied] = await Promise.all([
    prisma.savedJob.findMany({ where: { pilotId }, select: { jobId: true } }),
    prisma.application.findMany({ where: { pilotId }, select: { jobId: true } }),
  ]);
  const savedSet = new Set(saved.map((s) => s.jobId));
  const appliedSet = new Set(applied.map((a) => a.jobId));
  return jobs.map((j) => ({ ...j, isSaved: savedSet.has(j.id), isApplied: appliedSet.has(j.id) }));
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

    // Qualified-only: filter by pilot's hard requirements at DB level
    if (qualifiedOnly === 'true') {
      const pilot = await prisma.pilot.findUnique({
        where: { id: req.pilot.id },
        include: { certificates: true },
      });
      const totals = await getPilotFlightTotals(req.pilot.id);
      const certTypes = pilot.certificates.map((c) => c.type);
      const certAuthorities = pilot.certificates.map((c) => c.issuingAuthority);

      andConditions.push({
        OR: [{ reqCertificates: { isEmpty: true } }, { reqCertificates: { hasSome: certTypes } }],
      });
      andConditions.push({
        OR: [{ reqAuthorities: { isEmpty: true } }, { reqAuthorities: { hasSome: certAuthorities } }],
      });
      andConditions.push({
        OR: [{ reqMinTotalHours: null }, { reqMinTotalHours: { lte: totals.totalTime } }],
      });
      andConditions.push({
        OR: [{ reqMinPicHours: null }, { reqMinPicHours: { lte: totals.picTime } }],
      });
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

    const enriched = await enrichJobs(jobs, req.pilot.id);

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
    const [enriched] = await enrichJobs([job], req.pilot.id);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
};

exports.getMyAlerts = async (req, res, next) => {
  try {
    const alerts = await prisma.jobAlert.findMany({
      where: { pilotId: req.pilot.id },
      include: { job: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(alerts);
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
    await prisma.application.upsert({
      where: { pilotId_jobId: { pilotId: req.pilot.id, jobId: req.params.id } },
      create: { pilotId: req.pilot.id, jobId: req.params.id },
      update: {},
    });
    res.json({ applied: true });
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
