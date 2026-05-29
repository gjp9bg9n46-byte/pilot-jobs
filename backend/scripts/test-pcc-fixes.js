#!/usr/bin/env node
'use strict';
/**
 * Smoke test for Step 3 fixes:
 *   1. US-spelling domain (no 301)
 *   2. Dedup of <td> content
 *   3. #NotesRow td harvested
 *   4. meta-refresh redirect resolver
 *
 * Picks 3 varied jobs, fetches their detail pages and redirect URLs,
 * prints a structured report.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../src/config/database');
const axios  = require('axios');
const { fetchPccDetailText } = require('../src/scrapers/sources/pilotcareercentre');

// We test the redirect resolver directly
const PCC_BASE = 'https://www.pilotcareercenter.com';
const PCC_DOMAIN_RE = /pilotcareercen(?:ter|tre)\.com/i;
const META_REFRESH_RE = /content=["'][^"']*?(?:url|URL)=([^"']+)["']/i;
const JS_REDIRECT_RE  = /window\.location\s*=\s*['"]([^'"]+)['"]/;

async function resolveRedirect(jobId) {
  for (const type of ['application', 'url']) {
    try {
      const resp = await axios.get(`${PCC_BASE}/redirect/job/${type}/click/${jobId}`, {
        headers: { 'User-Agent': 'PilotJobsIngest/1.0 (+contact: jobs@cockpithire.com)' },
        timeout: 8000,
        validateStatus: () => true,
        maxRedirects: 3,
      });
      if (resp.status !== 200) continue;
      const body = typeof resp.data === 'string' ? resp.data : '';
      if (!body) continue;

      const jsM = body.match(JS_REDIRECT_RE);
      if (jsM && jsM[1].startsWith('http') && !PCC_DOMAIN_RE.test(jsM[1])) {
        return { type, method: 'window.location', url: jsM[1] };
      }
      const metaM = body.match(META_REFRESH_RE);
      if (metaM && metaM[1].startsWith('http') && !PCC_DOMAIN_RE.test(metaM[1])) {
        return { type, method: 'meta-refresh', url: metaM[1].trim() };
      }
    } catch { /* try next type */ }
  }
  return { method: 'fallback', url: null };
}

async function testJob(job) {
  const jobId = job.externalId;
  const sourceUrl = job.sourceUrl.replace('pilotcareercentre.com', 'pilotcareercenter.com');

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`Job    : ${job.title} — ${job.company}`);
  console.log(`URL    : ${sourceUrl}`);

  // 1. Check for 301 redirect
  const resp = await axios.get(sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' },
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: 10000,
  });
  const got301 = resp.status === 301 || resp.status === 302;
  console.log(`301?   : ${got301 ? '⚠ YES — redirect to ' + resp.headers.location : '✓ NO (direct hit)'} [HTTP ${resp.status}]`);

  // 2. Fetch detail text (dedup + NotesRow)
  const detail = await fetchPccDetailText(sourceUrl);
  if (!detail) {
    console.log(`Detail : null (page returned non-200)`);
  } else {
    const reqLen  = detail.text?.length ?? 0;
    const notesLen = detail.notes?.length ?? 0;
    // Check for obvious duplication: if text contains the same sentence twice at start
    const doubled = detail.text && detail.text.length > 100 && (() => {
      const half = Math.floor(detail.text.length / 2);
      return detail.text.slice(0, half).trim() === detail.text.slice(half).trim();
    })();
    console.log(`ReqRow : ${reqLen} chars${doubled ? ' ⚠ STILL DOUBLED' : ' ✓ deduped'}`);
    if (detail.text) console.log(`  snippet: ${detail.text.slice(0, 120).replace(/\n/g, ' ')}`);
    console.log(`NotesRow: ${notesLen > 0 ? notesLen + ' chars ✓' : 'absent'}`);
    if (detail.notes) console.log(`  snippet: ${detail.notes.slice(0, 120).replace(/\n/g, ' ')}`);
  }

  // 3. Redirect resolver
  const redirect = await resolveRedirect(jobId);
  if (redirect.url) {
    const atsHint = /workday/i.test(redirect.url) ? ' [WORKDAY]'
      : /smartrecruiters/i.test(redirect.url) ? ' [SMARTRECRUITERS]'
      : /greenhouse/i.test(redirect.url) ? ' [GREENHOUSE]'
      : /lever/i.test(redirect.url) ? ' [LEVER]' : '';
    console.log(`Redirect: ${redirect.method} → ${redirect.url.slice(0, 80)}${atsHint}`);
  } else {
    console.log(`Redirect: no external URL found (fallback)`);
  }
}

async function main() {
  // Pick 3 varied active enriched PCC jobs
  const jobs = await prisma.$queryRaw`
    SELECT id, title, company, "sourceUrl", "externalId"
    FROM "Job"
    WHERE "sourcePlatform" = 'PILOTCAREERCENTRE'
      AND status = 'ACTIVE'
      AND description NOT ILIKE '% is recruiting %'
    ORDER BY RANDOM()
    LIMIT 3
  `;

  console.log('PCC Step 3 Fix Verification\n');

  for (const job of jobs) {
    await testJob(job);
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log(`\n${'═'.repeat(64)}\nDone.\n`);
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
