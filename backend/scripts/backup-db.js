'use strict';
/**
 * backup-db.js — dump the production database to a timestamped SQL file.
 *
 * Run BEFORE any schema change, especially destructive ones:
 *   node scripts/backup-db.js
 *
 * Output: backups/YYYY-MM-DD-HHMMSS.sql  (directory is git-ignored)
 *
 * Requires pg_dump to be installed locally (ships with PostgreSQL client tools).
 * On macOS:  brew install libpq && brew link --force libpq
 * On Ubuntu: sudo apt-get install postgresql-client
 */

require('dotenv').config();

// On macOS with Homebrew libpq, pg_dump lives at /opt/homebrew/opt/libpq/bin
// Add to PATH so the script works without requiring manual export
process.env.PATH = `/opt/homebrew/opt/libpq/bin:/usr/local/bin:${process.env.PATH}`;
const { execSync } = require('child_process');
const path         = require('path');
const fs           = require('fs');

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

// Parse connection URL
const parsed = new URL(url);
const host   = parsed.hostname;
const port   = parsed.port || '5432';
const dbName = parsed.pathname.replace(/^\//, '');
const user   = parsed.username;
const pass   = parsed.password;

// Timestamped output file
const ts      = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
const outDir  = path.join(__dirname, '..', 'backups');
const outFile = path.join(outDir, `${ts}.sql`);

fs.mkdirSync(outDir, { recursive: true });

console.log(`Backing up ${dbName}@${host}:${port} → ${outFile}`);

try {
  execSync(
    `pg_dump --no-password --format=plain --file="${outFile}" "${url}"`,
    { env: { ...process.env, PGPASSWORD: pass }, stdio: 'inherit' }
  );
  const bytes = fs.statSync(outFile).size;
  console.log(`Done. ${(bytes / 1024).toFixed(1)} KB written to ${outFile}`);
} catch (err) {
  console.error('pg_dump failed:', err.message);
  console.error('Ensure pg_dump is installed: brew install libpq && brew link --force libpq');
  process.exit(1);
}
