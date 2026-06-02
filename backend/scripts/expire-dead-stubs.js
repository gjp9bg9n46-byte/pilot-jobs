'use strict';
/**
 * ⚠ DATABASE SAFETY
 * DO NOT use --force-reset. Use prisma migrate dev for development
 * and prisma migrate deploy for production.
 * Force-reset wipes ALL data with no recovery path.
 * Run scripts/backup-db.js before any destructive schema operation.
 */

#!/usr/bin/env node
'use strict';
/**
 * Step 1 of stub cleanup.
 * Fetch each active PCC stub; mark EXPIRED only on definitive 404/410.
 * Transient errors (timeout, 5xx, empty 200) → leave ACTIVE, log inconclusive.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../src/config/database');
const axios  = require('axios');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function checkLiveness(sourceUrl) {
  const url = sourceUrl.replace('pilotcareercentre.com', 'pilotcareercenter.com');
  try {
    const resp = await axios.get(url, {
      headers: { 'User-Agent': UA },
      timeout: 10000,
      validateStatus: () => true, // never throw on HTTP errors
      maxRedirects: 3,
    });
    if (resp.status === 404 || resp.status === 410) return { verdict: 'GONE', status: resp.status };
    const body = typeof resp.data === 'string' ? resp.data : '';
    if (resp.status === 200 && body.length === 0) return { verdict: 'INCONCLUSIVE', status: resp.status, reason: 'empty body' };
    if (resp.status >= 500) return { verdict: 'INCONCLUSIVE', status: resp.status, reason: '5xx server error' };
    return { verdict: 'LIVE', status: resp.status };
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return { verdict: 'INCONCLUSIVE', status: null, reason: 'timeout' };
    }
    return { verdict: 'INCONCLUSIVE', status: null, reason: err.message };
  }
}

async function main() {
  const stubs = await prisma.$queryRaw`
    SELECT id, title, company, "sourceUrl"
    FROM "Job"
    WHERE "sourcePlatform" = 'PILOTCAREERCENTRE'
      AND status = 'ACTIVE'
      AND description ILIKE '% is recruiting %'
    ORDER BY "createdAt" ASC
  `;

  console.log(`Active PCC stubs to check: ${stubs.length}\n`);

  const results = { gone: [], live: [], inconclusive: [] };

  for (let i = 0; i < stubs.length; i++) {
    const job = stubs[i];
    process.stdout.write(`\r  [${String(i + 1).padStart(2)}/${stubs.length}] ${(job.company + '                  ').slice(0, 22)}`);

    const check = await checkLiveness(job.sourceUrl);
    await new Promise((r) => setTimeout(r, 800));

    if (check.verdict === 'GONE') {
      results.gone.push(job);
      await prisma.job.update({ where: { id: job.id }, data: { status: 'EXPIRED' } });
    } else if (check.verdict === 'INCONCLUSIVE') {
      results.inconclusive.push({ ...job, reason: check.reason, status: check.status });
      console.log(`\n    INCONCLUSIVE [${job.title} — ${job.company}]: ${check.reason} (HTTP ${check.status ?? 'n/a'})`);
    } else {
      results.live.push({ ...job, httpStatus: check.status });
    }
  }

  console.log('\n\n══ STEP 1 RESULTS ═══════════════════════════════════════════\n');
  console.log(`  Marked EXPIRED (404/410)     : ${results.gone.length}`);
  console.log(`  Left ACTIVE — live content   : ${results.live.length}`);
  console.log(`  Left ACTIVE — inconclusive   : ${results.inconclusive.length}`);

  if (results.gone.length > 0) {
    console.log('\n  Expired:');
    results.gone.forEach((j) => console.log(`    ✗ ${j.title} — ${j.company}`));
  }
  if (results.live.length > 0) {
    console.log('\n  Live (will be re-enriched in Step 2):');
    results.live.forEach((j) => console.log(`    ✓ ${j.title} — ${j.company} [HTTP ${j.httpStatus}]`));
  }
  if (results.inconclusive.length > 0) {
    console.log('\n  Inconclusive (left ACTIVE, retry next pass):');
    results.inconclusive.forEach((j) => console.log(`    ? ${j.title} — ${j.company} (${j.reason})`));
  }

  console.log('\n══════════════════════════════════════════════════════════════\n');
}

main()
  .catch((err) => { console.error('\nFatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
