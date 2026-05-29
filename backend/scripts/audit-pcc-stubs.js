#!/usr/bin/env node
'use strict';
/**
 * One-off audit: sample 100 random active PCC jobs, refetch live, measure real content rate.
 * Usage: node scripts/audit-pcc-stubs.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../src/config/database');
const axios   = require('axios');
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const RICH_THRESHOLD = 300; // chars after dedup

function dedup(raw) {
  // PCC renders the <td> with two identical sub-elements (mobile + desktop).
  // If the string is an exact self-repeat, return the first half.
  const half = Math.floor(raw.length / 2);
  const a = raw.slice(0, half).trim();
  const b = raw.slice(half).trim();
  if (a === b && a.length > 50) return a;
  // Near-duplicate: second half starts with the first sentence of the first half
  const firstSentence = a.split(/[.\n]/)[0];
  if (firstSentence.length > 20 && b.startsWith(firstSentence)) return a;
  return raw;
}

async function fetchLive(sourceUrl) {
  // Use US spelling directly to skip the 301 redirect chain
  const url = sourceUrl.replace('pilotcareercentre.com', 'pilotcareercenter.com');
  const resp = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 12000,
    validateStatus: (s) => s < 600,
    maxRedirects: 3,
  });
  if (resp.status === 410 || resp.status === 404) return { gone: true, text: null };
  if (resp.status !== 200) return { gone: false, text: null, status: resp.status };

  const $ = cheerio.load(resp.data);
  const rawReq  = $('#RequirementsRow td').text().trim();
  const rawNotes = $('#NotesRow td').text().trim();
  const text = dedup(rawReq) || dedup(rawNotes) || '';
  return { gone: false, text, reqLen: text.length };
}

async function main() {
  const sample = await prisma.$queryRaw`
    SELECT id, title, company, "sourceUrl", description
    FROM "Job"
    WHERE "sourcePlatform" = 'PILOTCAREERCENTRE'
      AND status = 'ACTIVE'
    ORDER BY RANDOM()
    LIMIT 100
  `;

  console.log(`Sampled ${sample.length} active PCC jobs — fetching live pages (~2 min)...\n`);

  const totals  = { rich: 0, stub: 0, gone: 0, error: 0 };
  const dbStubs = { rich: 0, stub: 0, gone: 0, error: 0, n: 0 };
  const dbRich  = { rich: 0, stub: 0, gone: 0, error: 0, n: 0 };
  const goneJobs = [];
  const exampleRich = []; // up to 2 sample rich outputs
  const exampleStub = []; // up to 2 sample stub outputs

  for (let i = 0; i < sample.length; i++) {
    const job = sample[i];
    const isDbStub = / is recruiting /i.test(job.description || '');
    const bucket = isDbStub ? dbStubs : dbRich;
    bucket.n++;

    process.stdout.write(`\r  [${String(i + 1).padStart(3)}/${sample.length}] ${(job.company + '                    ').slice(0, 22)} ${isDbStub ? '(db:stub)' : '(db:rich)'}`);

    let liveResult;
    try {
      liveResult = await fetchLive(job.sourceUrl);
    } catch (err) {
      totals.error++;
      bucket.error++;
      continue;
    } finally {
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (liveResult.gone) {
      totals.gone++;
      bucket.gone++;
      goneJobs.push({ title: job.title, company: job.company, url: job.sourceUrl });
    } else if (liveResult.text && liveResult.text.length >= RICH_THRESHOLD) {
      totals.rich++;
      bucket.rich++;
      if (exampleRich.length < 2) exampleRich.push({ job, live: liveResult.text.slice(0, 200) });
    } else {
      totals.stub++;
      bucket.stub++;
      if (exampleStub.length < 2) exampleStub.push({ job, live: liveResult.text?.slice(0, 200) || '(empty)' });
    }
  }

  console.log('\n\n══ AUDIT RESULTS ════════════════════════════════════════════\n');

  const pct = (n) => `${n} (${(n / sample.length * 100).toFixed(1)}%)`;
  console.log(`Total sampled                  : ${sample.length}`);
  console.log(`  Rich live (>=${RICH_THRESHOLD} chars)     : ${pct(totals.rich)}`);
  console.log(`  Stub live (<${RICH_THRESHOLD} chars)      : ${pct(totals.stub)}`);
  console.log(`  410/404 Gone                 : ${pct(totals.gone)}`);
  console.log(`  Errors                       : ${pct(totals.error)}`);

  console.log('\n── Of jobs currently STUB in DB ──────────────────────────');
  const sp = (n) => dbStubs.n ? `${n} (${(n / dbStubs.n * 100).toFixed(1)}%)` : String(n);
  console.log(`  DB stubs in sample           : ${dbStubs.n}`);
  console.log(`  Recoverable (rich live)      : ${sp(dbStubs.rich)}`);
  console.log(`  Still stub live              : ${sp(dbStubs.stub)}`);
  console.log(`  Gone (410/404)               : ${sp(dbStubs.gone)}`);
  console.log(`  Errors                       : ${sp(dbStubs.error)}`);

  console.log('\n── Of jobs currently ENRICHED in DB ──────────────────────');
  const rp = (n) => dbRich.n ? `${n} (${(n / dbRich.n * 100).toFixed(1)}%)` : String(n);
  console.log(`  DB enriched in sample        : ${dbRich.n}`);
  console.log(`  Still rich live              : ${rp(dbRich.rich)}`);
  console.log(`  Degraded to stub live        : ${rp(dbRich.stub)}`);
  console.log(`  Gone (410/404)               : ${rp(dbRich.gone)}`);
  console.log(`  Errors                       : ${rp(dbRich.error)}`);

  if (goneJobs.length > 0) {
    console.log(`\n── 410/404 Gone jobs (${goneJobs.length}) ─────────────────────────────`);
    goneJobs.slice(0, 10).forEach((j) => console.log(`  ${j.title} — ${j.company}`));
    if (goneJobs.length > 10) console.log(`  ... and ${goneJobs.length - 10} more`);
  }

  if (exampleRich.length > 0) {
    console.log('\n── Sample RICH live content ──────────────────────────────');
    exampleRich.forEach(({ job, live }) => {
      console.log(`\n  ${job.title} — ${job.company}`);
      console.log(`  DB was: ${job.description?.slice(0, 100)}`);
      console.log(`  Live  : ${live}`);
    });
  }

  if (exampleStub.length > 0) {
    console.log('\n── Sample STUB live content ──────────────────────────────');
    exampleStub.forEach(({ job, live }) => {
      console.log(`\n  ${job.title} — ${job.company}`);
      console.log(`  DB    : ${job.description?.slice(0, 100)}`);
      console.log(`  Live  : ${live}`);
    });
  }

  console.log('\n══════════════════════════════════════════════════════════\n');
}

main()
  .catch((err) => { console.error('\nFatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
