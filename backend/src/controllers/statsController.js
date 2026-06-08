'use strict';

const prisma = require('../config/database');

// Public landing-page aggregates. Server-side cached for 5 min so the landing
// load doesn't hammer the DB. Read-only counts — no auth, no personal data.
const TTL_MS = 5 * 60 * 1000;
let cache = { data: null, expires: 0 };

exports.getStats = async (req, res, next) => {
  try {
    if (cache.data && Date.now() < cache.expires) {
      return res.json(cache.data);
    }

    const [airlinesCount, activeJobsCount, fleetProfilesCount, lastJob] = await Promise.all([
      prisma.airline.count(),
      prisma.job.count({ where: { status: 'ACTIVE' } }),
      prisma.airline.count({ where: { fleetDetail: { not: null } } }),
      prisma.job.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ]);

    cache = {
      data: {
        airlinesCount,
        activeJobsCount,
        fleetProfilesCount,
        lastScrapedAt: lastJob?.updatedAt ?? null,
      },
      expires: Date.now() + TTL_MS,
    };

    res.json(cache.data);
  } catch (err) {
    next(err);
  }
};
