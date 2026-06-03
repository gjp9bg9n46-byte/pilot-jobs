'use strict';

const { PilotRole } = require('@prisma/client');
const prisma = require('../config/database');

// Roles map to the existing PilotRole enum; contract types to the values the
// scraper/normalizer already produces. role/contractType may also be null.
const VALID_ROLES = Object.values(PilotRole); // ['FIRST_OFFICER', 'CAPTAIN']
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
