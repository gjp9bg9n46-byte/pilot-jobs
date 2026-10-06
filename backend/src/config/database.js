const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  // Option 3: the new additive Job columns are populated now but must NOT surface in
  // any API response until the frontend wiring reads them — so they're globally
  // omitted from query results by default (writes are unaffected). A query that needs
  // them (the new matcher/readers, the backfill verifier) selects them explicitly,
  // which overrides this. Removed when the coordinated frontend wiring ships.
  omit: {
    // aircraftTypes/reqTypeRatings: Option-3 match inputs. identityKey/
    // identityFirstSeenAt: precomputed clustering internals (jobIdentityStore).
    // All four are read via explicit select where needed (which overrides this)
    // and kept OUT of default API responses so the response shape is unchanged.
    job: { aircraftTypes: true, reqTypeRatings: true, identityKey: true, identityFirstSeenAt: true },
  },
});

module.exports = prisma;
