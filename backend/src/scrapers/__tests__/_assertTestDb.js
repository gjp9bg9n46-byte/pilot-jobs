'use strict';

// Safety guard for DB-mutating tests: they must NEVER run against production.
// Prisma auto-loads .env, so DATABASE_URL may point at the Railway prod DB. These
// tests skip (clean exit, no writes) unless DATABASE_URL is a non-prod host — or the
// explicit ALLOW_PROD_TEST_DB=1 override is set.
try { require('dotenv').config(); } catch { /* dotenv optional */ }

const PROD_RX = [/\.rlwy\.net/i, /\.railway\.app/i, /crossover\.proxy/i, /\.proxy\.rlwy/i];

function dbHost() {
  try { return new URL(process.env.DATABASE_URL || '').host; } catch { return String(process.env.DATABASE_URL || ''); }
}
function isProdDb() {
  const h = dbHost();
  return !!h && PROD_RX.some((re) => re.test(h));
}
// Call FIRST in a DB-mutating test. Exits 0 (skip) if the DB is prod.
function skipIfProdDb(label) {
  if (isProdDb() && process.env.ALLOW_PROD_TEST_DB !== '1') {
    console.log(`[SKIP] ${label}: refusing to run a DB-mutating test against the PROD host "${dbHost()}". Set DATABASE_URL to a local DB (.env.test) or ALLOW_PROD_TEST_DB=1 to override.`);
    process.exit(0);
  }
}

module.exports = { isProdDb, dbHost, skipIfProdDb };
