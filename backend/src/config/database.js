const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  // Option 3: the new additive Job columns are populated now but must NOT surface in
  // any API response until the frontend wiring reads them — so they're globally
  // omitted from query results by default (writes are unaffected). A query that needs
  // them (the new matcher/readers, the backfill verifier) selects them explicitly,
  // which overrides this. Removed when the coordinated frontend wiring ships.
  omit: {
    job: { aircraftTypes: true, reqTypeRatings: true },
  },
});

module.exports = prisma;
