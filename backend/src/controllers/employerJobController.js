'use strict';

const prisma = require('../config/database');
const { getPilotFlightTotals } = require('../services/matchingService');

const APPLICATION_STATUSES = ['APPLIED', 'REVIEWED', 'SHORTLISTED', 'HIRED'];
const MEDICAL_RANK = { CLASS_1: 3, CLASS_2: 2, CLASS_3: 1 };

// Decoupled from PilotRole — Job.role is a String? supporting CAPTAIN/FIRST_OFFICER/INSTRUCTOR. See investigation 2026-06-03.
const VALID_ROLES = ['CAPTAIN', 'FIRST_OFFICER', 'INSTRUCTOR'];
// Contract types match the values the scraper/normalizer already produces. role/contractType may also be null.
const VALID_CONTRACT_TYPES = ['PERMANENT', 'CONTRACT', 'FREELANCE', 'PART_TIME'];

const SALARY_CAP = 10_000_000; // no $50M pilot salaries
const HOURS_CAP = 30_000;      // same sanity cap pattern as the scraper

// Fields an employer may set on a job. Anything outside this list is silently
// stripped before the Prisma call — including all server-controlled provenance
// (sourcePlatform, postedByEmployerId, company, moderationStatus, status,
// externalId, sourceUrl, id, createdAt, updatedAt, postedAt).
const ALLOWED_FIELDS = [
  'title', 'description', 'location', 'country',
  'role', 'contractType', 'applyUrl',
  'salaryMin', 'salaryMax', 'salaryCurrency', 'salaryPeriod',
  'reqAuthorities', 'reqCertificates', 'reqAircraftTypes',
  'reqMinTotalHours', 'reqMinPicHours', 'reqMinMultiEngineHours',
  'reqMinTurbineHours', 'reqMinInstrumentHours', 'reqMinCrossCountryHours',
  'reqMedicalClass', 'reqEducation', 'reqWorkAuthorization',
  'reqEnglishLevel', 'reqWillingToRelocate',
];

const HOURS_FIELDS = [
  'reqMinTotalHours', 'reqMinPicHours', 'reqMinMultiEngineHours',
  'reqMinTurbineHours', 'reqMinInstrumentHours', 'reqMinCrossCountryHours',
];
const NUMERIC_FIELDS = ['salaryMin', 'salaryMax', ...HOURS_FIELDS, 'reqEnglishLevel'];

function pickAllowed(body) {
  const data = {};
  for (const f of ALLOWED_FIELDS) {
    if (f in body) data[f] = body[f];
  }
  return data;
}

const isBlank = (v) => v === null || v === undefined || v === '';

// Validates the (already-whitelisted) field set. On create, title/description/
// applyUrl are required; on update only the present fields are checked.
function validateJobFields(data, { isCreate }) {
  const errors = [];

  if (isCreate || 'title' in data) {
    if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
      errors.push({ path: 'title', msg: 'Title is required' });
    } else if (data.title.length > 200) {
      errors.push({ path: 'title', msg: 'Title must be 200 characters or fewer' });
    }
  }

  if (isCreate || 'description' in data) {
    if (!data.description || typeof data.description !== 'string' || !data.description.trim()) {
      errors.push({ path: 'description', msg: 'Description is required' });
    } else if (data.description.length > 10000) {
      errors.push({ path: 'description', msg: 'Description must be 10,000 characters or fewer' });
    }
  }

  if (isCreate || 'applyUrl' in data) {
    if (!data.applyUrl) {
      errors.push({ path: 'applyUrl', msg: 'Apply URL is required' });
    } else {
      try { new URL(data.applyUrl); }
      catch { errors.push({ path: 'applyUrl', msg: 'Apply URL must be a valid URL' }); }
    }
  }

  if ('role' in data && !isBlank(data.role) && !VALID_ROLES.includes(data.role)) {
    errors.push({ path: 'role', msg: `role must be one of ${VALID_ROLES.join(', ')} or null` });
  }

  if ('contractType' in data && !isBlank(data.contractType) && !VALID_CONTRACT_TYPES.includes(data.contractType)) {
    errors.push({ path: 'contractType', msg: `contractType must be one of ${VALID_CONTRACT_TYPES.join(', ')} or null` });
  }

  for (const f of ['salaryMin', 'salaryMax']) {
    if (f in data && !isBlank(data[f])) {
      const n = Number(data[f]);
      if (!Number.isFinite(n) || n < 0) errors.push({ path: f, msg: `${f} must be a positive number` });
      else if (n > SALARY_CAP) errors.push({ path: f, msg: `${f} exceeds the sanity cap of ${SALARY_CAP}` });
    }
  }

  for (const f of HOURS_FIELDS) {
    if (f in data && !isBlank(data[f])) {
      const n = Number(data[f]);
      if (!Number.isFinite(n) || n < 0) errors.push({ path: f, msg: `${f} must be a positive number` });
      else if (n > HOURS_CAP) errors.push({ path: f, msg: `${f} exceeds the sanity cap of ${HOURS_CAP}` });
    }
  }

  return errors;
}

// Coerce numeric fields (JSON may deliver them as strings) after validation.
function coerceNumbers(data) {
  for (const f of NUMERIC_FIELDS) {
    if (f in data && !isBlank(data[f])) data[f] = Number(data[f]);
  }
}

// Loads a job and asserts it belongs to the authenticated employer.
// Returns the job, or null (caller responds 404 — never reveals existence).
async function loadOwnedJob(jobId, employerId) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.postedByEmployerId !== employerId) return null;
  return job;
}

exports.createJob = async (req, res, next) => {
  try {
    const data = pickAllowed(req.body);
    const errors = validateJobFields(data, { isCreate: true });
    if (errors.length) return res.status(400).json({ errors });
    coerceNumbers(data);

    const job = await prisma.job.create({
      data: {
        ...data,
        location: data.location || '',          // schema requires NOT NULL
        // Server-forced — overrides anything in the body.
        company: req.employer.companyName,       // derived from the authenticated employer
        sourcePlatform: 'EMPLOYER_DIRECT',
        postedByEmployerId: req.employer.id,
        moderationStatus: 'APPROVED',
        status: 'ACTIVE',
        externalId: null,
        sourceUrl: null,
        postedAt: new Date(),
      },
    });

    res.status(201).json(job);
  } catch (err) {
    next(err);
  }
};

exports.listMyJobs = async (req, res, next) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { postedByEmployerId: req.employer.id }, // ALL statuses
      orderBy: { postedAt: 'desc' },
      take: 100,
    });
    res.json(jobs);
  } catch (err) {
    next(err);
  }
};

exports.updateJob = async (req, res, next) => {
  try {
    const job = await loadOwnedJob(req.params.id, req.employer.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const data = pickAllowed(req.body); // forbidden fields never reach here
    const errors = validateJobFields(data, { isCreate: false });
    if (errors.length) return res.status(400).json({ errors });
    coerceNumbers(data);

    const updated = await prisma.job.update({ where: { id: job.id }, data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.deleteJob = async (req, res, next) => {
  try {
    const job = await loadOwnedJob(req.params.id, req.employer.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Soft-delete → EXPIRED. Excluded from public /api/jobs (status='ACTIVE'),
    // but stays in the employer's own list so they can repost it.
    const updated = await prisma.job.update({ where: { id: job.id }, data: { status: 'EXPIRED' } });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.repostJob = async (req, res, next) => {
  try {
    const job = await loadOwnedJob(req.params.id, req.employer.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (job.status !== 'EXPIRED') {
      return res.status(400).json({
        error: `Only EXPIRED jobs can be reposted. This job is ${job.status}.`,
      });
    }

    const updated = await prisma.job.update({
      where: { id: job.id },
      data: { status: 'ACTIVE', postedAt: new Date() },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// ─── Applicants (E1) ─────────────────────────────────────────────────────────
// Whitelisted applicant DTO — first name + last initial, qualifications, and the
// snapshotted match/breakdown. NEVER email/phone/full surname/CV (privacy enforced
// here at the API layer, not just in the frontend).
function toApplicantDTO(app, totals) {
  const p = app.pilot;
  const elp = p.certificates.find((c) => c.type === 'ELP');
  const bestMedical = p.medicals.reduce(
    (best, m) => ((MEDICAL_RANK[m.medicalClass] ?? 0) > (MEDICAL_RANK[best] ?? 0) ? m.medicalClass : best),
    null,
  );
  return {
    applicationId: app.id,
    pilotName: `${p.firstName}${p.lastName ? ` ${p.lastName[0]}.` : ''}`,
    appliedAt: app.appliedAt,
    status: app.status,
    statusUpdatedAt: app.statusUpdatedAt,
    matchScore: app.matchScore,
    matchBreakdown: app.matchBreakdown,
    snapshot: {
      role: p.role,
      totalHours: Math.round(totals.totalTime),
      picHours: Math.round(totals.picTime),
      ratings: [...new Set(p.ratings.map((r) => r.aircraftType.toUpperCase()))],
      licences: [...new Set(p.certificates.filter((c) => c.type !== 'ELP').map((c) => c.type))],
      medicalClass: bestMedical,
      elpLevel: elp?.englishLevel || null,
      rightToWork: p.rightToWork.map((r) => r.country),
    },
  };
}

exports.listApplicants = async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.postedByEmployerId !== req.employer.id) return res.status(403).json({ error: 'This job is not yours.' });

    const apps = await prisma.application.findMany({
      where: { jobId: job.id },
      orderBy: [{ matchScore: 'desc' }, { appliedAt: 'asc' }],
      include: { pilot: { include: { certificates: true, ratings: true, medicals: true, rightToWork: true } } },
    });
    const applicants = await Promise.all(apps.map(async (a) => toApplicantDTO(a, await getPilotFlightTotals(a.pilotId))));
    res.json({ job: { id: job.id, title: job.title, status: job.status }, applicants });
  } catch (err) {
    next(err);
  }
};

exports.updateApplicationStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${APPLICATION_STATUSES.join(', ')}` });
    }
    const app = await prisma.application.findUnique({ where: { id: req.params.id }, include: { job: true } });
    if (!app) return res.status(404).json({ error: 'Application not found' });
    if (app.job.postedByEmployerId !== req.employer.id) return res.status(403).json({ error: 'This application is not yours.' });

    const updated = await prisma.application.update({
      where: { id: app.id },
      data: { status, statusUpdatedAt: new Date() },
    });

    // Phase D notification trigger (stub — Resend wiring is the backend cluster).
    console.log(`[notify] Pilot status email trigger — application=${app.id} pilot=${app.pilotId} status=${status}`);

    res.json({ id: updated.id, status: updated.status, statusUpdatedAt: updated.statusUpdatedAt });
  } catch (err) {
    next(err);
  }
};
