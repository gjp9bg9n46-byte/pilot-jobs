#!/usr/bin/env node
// Apply the merges approved in a dry-run document under docs/data-audits/.
//
// It reads the document rather than re-deriving the clusters: the approval was
// given for those exact rows, so those exact rows are what gets touched. A row
// is never deleted — it keeps its data, gains `mergedInto` pointing at the
// surviving vacancy, and goes EXPIRED so it leaves the feed. Undoing a batch is
// therefore `mergedInto = NULL, status = 'ACTIVE'` on the listed ids.
//
// Take a fresh pg_dump first, into ~/cockpithire-backups/ — never inside the
// repo.
//
//   node scripts/apply-duplicate-merges.js <doc.md>            # dry run
//   node scripts/apply-duplicate-merges.js <doc.md> --apply
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/database');

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const BATCH = 10;

/** Every "KEEP …" / "merge …" pair in the document, in document order. */
function parsePairs(md) {
  const pairs = [];
  let keep = null;
  for (const line of md.split('\n')) {
    const k = new RegExp('^-\\s*KEEP\\s+`(' + UUID + ')`').exec(line);
    if (k) { keep = k[1]; continue; }
    const m = new RegExp('^-\\s*merge\\s+`(' + UUID + ')`').exec(line);
    if (m && keep) pairs.push({ loser: m[1], winner: keep });
  }
  return pairs;
}

/** A row merged in pass 1 and again in pass 2b must end up on the last winner. */
function resolveChains(pairs) {
  const target = new Map();
  for (const { loser, winner } of pairs) target.set(loser, winner);
  const flat = new Map();
  for (const loser of target.keys()) {
    let w = target.get(loser);
    const seen = new Set([loser]);
    while (target.has(w) && !seen.has(w)) { seen.add(w); w = target.get(w); }
    if (w !== loser) flat.set(loser, w);
  }
  return flat;
}

(async () => {
  const docPath = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!docPath) { console.error('usage: apply-duplicate-merges.js <doc.md> [--apply]'); process.exit(2); }

  const pairs = parsePairs(fs.readFileSync(docPath, 'utf8'));
  const merges = resolveChains(pairs);
  console.log(`${path.basename(docPath)}: ${pairs.length} merge lines → ${merges.size} rows to merge`);

  const ids = [...new Set([...merges.keys(), ...merges.values()])];
  const rows = await prisma.job.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, company: true, sourcePlatform: true, status: true, mergedInto: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  // The document is a snapshot; the feed has moved on since. Anything that no
  // longer matches it is reported and skipped rather than forced.
  // Two outcomes, because the feed has moved on since the snapshot:
  //  merge  — the duplicate is still live: point it at the survivor and expire it.
  //  record — it expired on its own meanwhile: only write the pointer, leave the
  //           status alone, so the duplicate cannot come back as its own vacancy
  //           the next time a scrape finds it.
  const todo = []; const record = []; const skipped = [];
  for (const [loser, winner] of merges) {
    const l = byId.get(loser); const w = byId.get(winner);
    if (!l) { skipped.push([loser, 'gone from the database']); continue; }
    if (!w) { skipped.push([loser, `survivor ${winner.slice(0, 8)} gone`]); continue; }
    if (l.mergedInto) { skipped.push([loser, `already merged into ${l.mergedInto.slice(0, 8)}`]); continue; }
    if (w.mergedInto) { skipped.push([loser, `survivor ${winner.slice(0, 8)} has itself been merged`]); continue; }
    // A survivor that has died since the snapshot cannot absorb a live row —
    // that would hide a real vacancy behind a dead one. Leave both alone.
    if (w.status !== 'ACTIVE') { skipped.push([loser, `survivor ${winner.slice(0, 8)} is ${w.status} — ${l.status === 'ACTIVE' ? 'the live row stays' : 'both already gone'}`]); continue; }
    (l.status === 'ACTIVE' ? todo : record).push({ loser, winner, l, w });
  }

  const line = ({ loser, winner, l, w }) =>
    `  ${loser.slice(0, 8)} "${l.title}" (${l.sourcePlatform}) → ${winner.slice(0, 8)} "${w.title}" [${l.company}]`;
  console.log(`\nmerge — live duplicates leaving the feed (${todo.length}):`);
  todo.forEach((t) => console.log(line(t)));
  console.log(`\nrecord — already ${'EXPIRED'} on their own, pointer only (${record.length}):`);
  record.forEach((t) => console.log(line(t)));
  if (skipped.length) {
    console.log(`\nskipped (${skipped.length}):`);
    for (const [id, why] of skipped) console.log(`  ${id.slice(0, 8)}  ${why}`);
  }

  const activeBefore = await prisma.job.count({ where: { status: 'ACTIVE', mergedInto: null } });
  console.log(`\nvisible ACTIVE vacancies before: ${activeBefore}`);
  if (!apply) { console.log('dry run — nothing written. Re-run with --apply.'); await prisma.$disconnect(); return; }

  for (const [label, rows_, data] of [['merge', todo, true], ['record', record, false]]) {
    let done = 0;
    for (let i = 0; i < rows_.length; i += BATCH) {
      const chunk = rows_.slice(i, i + BATCH);
      await prisma.$transaction(chunk.map(({ loser, winner }) => prisma.job.update({
        where: { id: loser },
        data: data ? { mergedInto: winner, status: 'EXPIRED' } : { mergedInto: winner },
      })));
      done += chunk.length;
      console.log(`  ${label} batch ${Math.floor(i / BATCH) + 1}: ${done}/${rows_.length}`);
    }
  }
  const activeAfter = await prisma.job.count({ where: { status: 'ACTIVE', mergedInto: null } });
  console.log(`visible ACTIVE vacancies after:  ${activeAfter}  (−${activeBefore - activeAfter})`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
