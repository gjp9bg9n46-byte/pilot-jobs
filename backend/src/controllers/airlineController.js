'use strict';

const prisma = require('../config/database');

const VALID_SORT = ['name', 'lastUpdated', 'hiringStatus'];
const VALID_HIRING_STATUSES = new Set(['ACTIVELY_HIRING', 'OCCASIONAL', 'PAUSED', 'UNKNOWN']);
const VALID_HIRING_FREQUENCIES = new Set(['CONTINUOUS', 'PERIODIC', 'RARE', 'UNKNOWN']);
const VALID_CONTRACT_TYPES = new Set(['PERMANENT', 'FIXED_TERM', 'AGENCY', 'PAY_TO_FLY', 'MIXED']);
const VALID_REGIONS = new Set(['Europe', 'Americas', 'Asia-Pacific', 'Middle East', 'Africa']);

// Fields pilots may contribute. Identity fields (name, iataCode, icaoCode, country) are admin-only.
const CONTRIBUTION_FIELD_TYPES = {
  headquarters:       'string',
  description:        'string',
  bases:              'array',
  fleet:              'array',
  fleetDetail:        'fleetDetail',
  hiringStatus:       'hiringStatus',
  hiringFrequency:    'hiringFrequency',
  payRanges:          'json',
  rosterPattern:      'string',
  contractType:       'contractType',
  workAuthRequired:   'array',
  avgResponseDays:    'int',
  interviewStages:    'array',
  simType:            'string',
  upgradeTimeMinYears: 'float',
  upgradeTimeMaxYears: 'float',
  notes:              'string',
  region:             'region',
};

function validateContributionField(field, value) {
  const type = CONTRIBUTION_FIELD_TYPES[field];
  if (!type) return `Unknown field: '${field}'`;

  if (value === null) return null; // explicit clear — always valid

  switch (type) {
    case 'string':
      if (typeof value !== 'string') return `'${field}' must be a string or null`;
      if (value.trim() === '') return `'${field}' must not be empty. Use null to clear the field.`;
      break;
    case 'array':
      if (!Array.isArray(value)) return `'${field}' must be an array`;
      for (const item of value) {
        if (typeof item !== 'string' || item.trim() === '') return `'${field}' array items must be non-empty strings`;
      }
      break;
    case 'int': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `'${field}' must be a finite number or null`;
      if (!Number.isInteger(value)) return `'${field}' must be a whole number`;
      break;
    }
    case 'float':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `'${field}' must be a finite number or null`;
      break;
    case 'json':
      if (typeof value !== 'object' || Array.isArray(value)) return `'${field}' must be an object or null`;
      break;
    case 'hiringStatus':
      if (!VALID_HIRING_STATUSES.has(value)) return `'${field}' must be one of: ${[...VALID_HIRING_STATUSES].join(', ')}`;
      break;
    case 'hiringFrequency':
      if (!VALID_HIRING_FREQUENCIES.has(value)) return `'${field}' must be one of: ${[...VALID_HIRING_FREQUENCIES].join(', ')}`;
      break;
    case 'contractType':
      if (!VALID_CONTRACT_TYPES.has(value)) return `'${field}' must be one of: ${[...VALID_CONTRACT_TYPES].join(', ')}`;
      break;
    case 'region':
      if (!VALID_REGIONS.has(value)) return `'${field}' must be one of: ${[...VALID_REGIONS].join(', ')}`;
      break;
    case 'fleetDetail': {
      if (!Array.isArray(value)) return `'${field}' must be an array`;
      for (const row of value) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return `'${field}' rows must be objects`;
        if (typeof row.type !== 'string' || row.type.trim() === '') return `'${field}' rows require a non-empty 'type'`;
        for (const k of ['inService', 'ordered', 'retired']) {
          const v = row[k];
          if (v == null) continue;
          if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
            return `'${field}' '${k}' must be a whole number >= 0 or null`;
          }
        }
      }
      break;
    }
  }
  return null;
}

const LIST_SELECT = {
  id: true, name: true, iataCode: true, icaoCode: true,
  country: true, region: true, headquarters: true,
  hiringStatus: true, hiringFrequency: true, contractType: true,
  bases: true, fleet: true, logoUrl: true, domain: true,
  verifiedContributors: true, lastUpdatedAt: true, createdAt: true,
};

exports.listAirlines = async (req, res, next) => {
  try {
    const { q, region, hiringStatus, sort = 'name', page = 1, limit = 25 } = req.query;

    if (!VALID_SORT.includes(sort)) {
      return res.status(400).json({ error: `Invalid sort. Must be one of: ${VALID_SORT.join(', ')}` });
    }
    if (region && !VALID_REGIONS.has(region)) {
      return res.status(400).json({ error: `Invalid region.` });
    }
    if (hiringStatus && !VALID_HIRING_STATUSES.has(hiringStatus)) {
      return res.status(400).json({ error: `Invalid hiringStatus.` });
    }

    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const where = {};
    if (q)            where.name         = { contains: q, mode: 'insensitive' };
    if (region)       where.region       = region;
    if (hiringStatus) where.hiringStatus = hiringStatus;

    const orderBy =
      sort === 'lastUpdated'  ? { lastUpdatedAt: 'desc' } :
      sort === 'hiringStatus' ? [{ hiringStatus: 'asc' }, { name: 'asc' }] :
                                { name: 'asc' };

    const [total, items] = await Promise.all([
      prisma.airline.count({ where }),
      prisma.airline.findMany({
        where, orderBy,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        select: LIST_SELECT,
      }),
    ]);

    res.json({ items, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    next(err);
  }
};

// Requirements DERIVED from an airline's own current vacancies — populated AND
// dated (max lastSeenAt), from data we already hold. It is a separate signal
// from the hand-entered requirements field (never merged into it): both answer
// different questions. Because it reads only ACTIVE jobs, it self-expires when
// the vacancies do — no persisted-after-gone failure. Returns null when the
// airline has no current vacancies.
async function deriveRequirementsFromJobs(airlineName) {
  if (!airlineName) return null;
  const jobs = await prisma.job.findMany({
    where: { status: 'ACTIVE', company: { equals: airlineName, mode: 'insensitive' } },
    select: {
      reqMinTotalHours: true, reqCertificates: true, reqAircraftTypes: true,
      reqAuthorities: true, lastSeenAt: true, updatedAt: true,
    },
  });
  if (!jobs.length) return null;

  const hoursVals = jobs.map((j) => j.reqMinTotalHours).filter((h) => h != null);
  const union = (key) => [...new Set(jobs.flatMap((j) => j[key] || []))];
  const statedCount = (key) => jobs.filter((j) => (j[key] || []).length > 0).length;
  // "last confirmed" = most recent time a contributing vacancy was seen in a
  // scrape (lastSeenAt; updatedAt fallback for pre-field rows). Never now().
  const lastConfirmed = jobs.reduce((max, j) => {
    const t = j.lastSeenAt || j.updatedAt;
    return t && (!max || new Date(t) > new Date(max)) ? t : max;
  }, null);

  return {
    vacancyCount: jobs.length,
    // Report the floor (lowest entry bar across current vacancies) + how many
    // vacancies actually state it, so one job's number isn't shown as consensus.
    minTotalHours: hoursVals.length ? Math.min(...hoursVals) : null,
    hoursStatedCount: hoursVals.length,
    certificates: union('reqCertificates'),
    certStatedCount: statedCount('reqCertificates'),
    aircraftTypes: union('reqAircraftTypes'),
    typeStatedCount: statedCount('reqAircraftTypes'),
    authorities: union('reqAuthorities'),
    lastConfirmed,
  };
}

exports.getAirline = async (req, res, next) => {
  try {
    const airline = await prisma.airline.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, name: true, iataCode: true, icaoCode: true,
        country: true, region: true, headquarters: true, description: true,
        bases: true, fleet: true, fleetDetail: true, logoUrl: true, domain: true,
        hiringStatus: true, hiringFrequency: true,
        payRanges: true, rosterPattern: true, contractType: true,
        workAuthRequired: true, avgResponseDays: true,
        interviewStages: true, simType: true,
        upgradeTimeMinYears: true, upgradeTimeMaxYears: true,
        notes: true, verifiedContributors: true,
        lastUpdatedAt: true, createdAt: true,
        // contributions intentionally omitted — never expose contributor identities
        fieldDates: { select: { field: true, recordedAt: true } },
      },
    });

    if (!airline) return res.status(404).json({ error: 'Airline not found' });
    // Flatten per-field dates to a { field: recordedAt } map. Absent = unknown
    // (client renders "—"); never a fabricated date. Keys: whole-field
    // ('rosterPattern') or per-item ('fleet:A320', 'payRanges:captain').
    const { fieldDates, ...rest } = airline;
    const fieldDateMap = {};
    for (const fd of fieldDates) fieldDateMap[fd.field] = fd.recordedAt;
    const derivedRequirements = await deriveRequirementsFromJobs(airline.name);
    res.json({ ...rest, fieldDates: fieldDateMap, derivedRequirements });
  } catch (err) {
    next(err);
  }
};

exports.getJobCount = async (req, res, next) => {
  try {
    const airline = await prisma.airline.findUnique({
      where: { id: req.params.id },
      select: { name: true },
    });
    if (!airline) return res.status(404).json({ error: 'Airline not found' });

    const count = await prisma.job.count({
      where: {
        company: { equals: airline.name, mode: 'insensitive' },
        status: 'ACTIVE',
      },
    });
    res.json({ count });
  } catch (err) {
    next(err);
  }
};

exports.contribute = async (req, res, next) => {
  try {
    const airline = await prisma.airline.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!airline) return res.status(404).json({ error: 'Airline not found' });

    const { proposedChanges } = req.body;
    if (!proposedChanges || typeof proposedChanges !== 'object' || Array.isArray(proposedChanges)) {
      return res.status(400).json({ error: 'proposedChanges must be a non-empty object' });
    }
    if (Object.keys(proposedChanges).length === 0) {
      return res.status(400).json({ error: 'proposedChanges must not be empty' });
    }

    const fieldErrors = {};
    for (const [field, value] of Object.entries(proposedChanges)) {
      const err = validateContributionField(field, value);
      if (err) fieldErrors[field] = err;
    }
    if (Object.keys(fieldErrors).length > 0) {
      return res.status(400).json({ error: 'Validation failed', fieldErrors });
    }

    const contribution = await prisma.airlineFactContribution.create({
      data: {
        airlineId:       req.params.id,
        contributorId:   req.pilot.id,
        proposedChanges,
        status:          'PENDING',
      },
    });

    res.status(201).json(contribution);
  } catch (err) {
    next(err);
  }
};

exports.getMyContributions = async (req, res, next) => {
  try {
    const airline = await prisma.airline.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!airline) return res.status(404).json({ error: 'Airline not found' });

    const contributions = await prisma.airlineFactContribution.findMany({
      where: {
        airlineId:     req.params.id,
        contributorId: req.pilot.id,
        // All statuses (E6): the contributor sees PENDING/APPROVED/REJECTED so
        // reviewer feedback (reviewNote) actually reaches them.
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        // reviewerId intentionally omitted — admin opacity.
        id: true, proposedChanges: true, status: true, createdAt: true,
        reviewNote: true, reviewedAt: true,
      },
    });

    res.json(contributions);
  } catch (err) {
    next(err);
  }
};
