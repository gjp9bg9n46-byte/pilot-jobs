'use strict';

const prisma = require('../config/database');

const VALID_SORT = ['name', 'lastUpdated', 'hiringStatus'];
const VALID_HIRING_STATUSES = new Set(['ACTIVELY_HIRING', 'OCCASIONAL', 'PAUSED', 'UNKNOWN']);
const VALID_REGIONS = new Set(['Europe', 'Americas', 'Asia-Pacific', 'Middle East', 'Africa']);

const LIST_SELECT = {
  id: true, name: true, iataCode: true, icaoCode: true,
  country: true, region: true, headquarters: true,
  hiringStatus: true, hiringFrequency: true, contractType: true,
  bases: true, fleet: true,
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

exports.getAirline = async (req, res, next) => {
  try {
    const airline = await prisma.airline.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, name: true, iataCode: true, icaoCode: true,
        country: true, region: true, headquarters: true, description: true,
        bases: true, fleet: true,
        hiringStatus: true, hiringFrequency: true,
        payRanges: true, rosterPattern: true, contractType: true,
        workAuthRequired: true, avgResponseDays: true,
        interviewStages: true, simType: true,
        upgradeTimeMinYears: true, upgradeTimeMaxYears: true,
        notes: true, verifiedContributors: true,
        lastUpdatedAt: true, createdAt: true,
        // contributions intentionally omitted — never expose contributor identities
      },
    });

    if (!airline) return res.status(404).json({ error: 'Airline not found' });
    res.json(airline);
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
