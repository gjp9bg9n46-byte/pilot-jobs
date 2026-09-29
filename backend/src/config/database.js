const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});

// Invalidate the per-pilot derived match-totals cache whenever a flight log (or a
// pilot's carry-forward hours) changes, so job matching reflects logbook edits
// immediately rather than waiting for the cache's short TTL. Blunt (clears all
// pilots), but logbook writes are rare compared with /jobs reads. Lazy require of
// logbookSummary avoids a load-time cycle (it require()s this module).
prisma.$use(async (params, next) => {
  const result = await next(params);
  try {
    const isFlightWrite = params.model === 'FlightLog' && /create|update|delete|upsert/i.test(params.action || '');
    const isCarryForward = params.model === 'Pilot' && /update/i.test(params.action || '')
      && params.args && params.args.data && params.args.data.carryForward !== undefined;
    if (isFlightWrite || isCarryForward) require('../services/logbookSummary').clearAllMatchTotals();
  } catch { /* cache invalidation is best-effort */ }
  return result;
});

module.exports = prisma;
