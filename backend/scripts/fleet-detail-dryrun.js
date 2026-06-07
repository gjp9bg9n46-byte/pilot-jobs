'use strict';
/**
 * STEP B — fleet-detail dry run (read-only, no DB writes).
 * Resolves each airline's Wikipedia fleet table, parses it, classifies the
 * outcome, and writes data/fleet-detail-dry-run.json + data/airline-wikipedia-urls.json.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/database');
const wf = require('./lib/wiki-fleet');

const wikidata = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/wikidata-airlines.json'), 'utf8'));
const qidByName = new Map(wikidata.map((r) => [r.dbName, r.qid]));
const urlOf = (title) => 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));

async function resolveAndParse(a) {
  // 1) base title
  let baseTitle = null, source = null;
  const qid = qidByName.get(a.name);
  try { if (qid) { baseTitle = await wf.titleFromQid(qid); if (baseTitle) source = 'wikidata'; await wf.sleep(250); } } catch {}
  if (!baseTitle) { try { baseTitle = await wf.searchTitle(a.name); if (baseTitle) source = 'search'; await wf.sleep(250); } catch {} }

  let foundTableSomewhere = false, anyArticle = false;

  // 2) main article
  if (baseTitle) {
    const main = await wf.fetchHtml(baseTitle);
    if (main.notFound) { /* try sub */ } else { anyArticle = true;
      const res = wf.parseFleet(main.html);
      if (res.found) { foundTableSomewhere = true;
        if (res.rows.length) return { outcome: 'PARSED', wikipediaUrl: urlOf(baseTitle), resolutionPath: `${source}→main`, rows: res.rows, junk: res.junkDropped, notes: res.notes };
      }
    }
  }

  // 3) sub-article "{Title} fleet" — strip any "(airline)" disambiguation suffix
  //    so Emirates (airline) → "Emirates fleet", not "Emirates (airline) fleet".
  const subTitle = (baseTitle || a.name).replace(/\s*\([^)]*\)\s*$/, '') + ' fleet';
  const sub = await wf.fetchHtml(subTitle);
  if (!sub.notFound && sub.html) { anyArticle = true;
    const res = wf.parseFleet(sub.html);
    if (res.found) { foundTableSomewhere = true;
      if (res.rows.length) return { outcome: 'PARSED', wikipediaUrl: urlOf(subTitle), resolutionPath: `${source || 'search'}→sub-article-fallback`, rows: res.rows, junk: res.junkDropped, notes: res.notes };
    }
  }

  if (foundTableSomewhere) return { outcome: 'EMPTY_AFTER_FILTER', wikipediaUrl: baseTitle ? urlOf(baseTitle) : null, resolutionPath: source || 'none', rows: [], junk: 0, notes: ['table found but all rows filtered'] };
  if (!anyArticle) return { outcome: 'NO_ARTICLE', wikipediaUrl: baseTitle ? urlOf(baseTitle) : null, resolutionPath: source || 'none', rows: [], junk: 0, notes: [] };
  return { outcome: 'NO_TABLE', wikipediaUrl: baseTitle ? urlOf(baseTitle) : null, resolutionPath: source || 'none', rows: [], junk: 0, notes: [] };
}

(async () => {
  const airlines = await prisma.airline.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, iataCode: true, icaoCode: true } });
  console.log(`Processing ${airlines.length} airlines …`);
  const out = [];
  const urlCache = {};
  let i = 0;
  for (const a of airlines) {
    i++;
    let r;
    try { r = await resolveAndParse(a); }
    catch (e) { r = { outcome: 'PARSE_ERROR', wikipediaUrl: null, resolutionPath: 'error', rows: [], junk: 0, notes: [String(e.message || e)] }; }
    out.push({ iataCode: a.iataCode, icaoCode: a.icaoCode, name: a.name, wikipediaUrl: r.wikipediaUrl, resolutionPath: r.resolutionPath, outcome: r.outcome, rowsExtracted: r.rows, junkRowsDropped: r.junk, parserNotes: r.notes });
    if (r.wikipediaUrl) urlCache[a.iataCode || a.icaoCode] = r.wikipediaUrl;
    if (i % 20 === 0) console.log(`  …${i}/${airlines.length}`);
  }

  fs.writeFileSync(path.join(__dirname, '../data/fleet-detail-dry-run.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(__dirname, '../data/airline-wikipedia-urls.json'), JSON.stringify(urlCache, null, 2));

  const buckets = {};
  for (const x of out) buckets[x.outcome] = (buckets[x.outcome] || 0) + 1;
  const parsed = out.filter((x) => x.outcome === 'PARSED');
  const totalRows = parsed.reduce((s, x) => s + x.rowsExtracted.length, 0);
  console.log('\n=== OUTCOME BUCKETS ===');
  for (const k of ['PARSED', 'NO_ARTICLE', 'NO_TABLE', 'EMPTY_AFTER_FILTER', 'PARSE_ERROR']) console.log(`  ${k.padEnd(20)} ${buckets[k] || 0}`);
  console.log(`  TOTAL                ${out.length}`);
  console.log(`PARSED rows total: ${totalRows} (avg ${(totalRows / Math.max(1, parsed.length)).toFixed(1)}/airline)`);
  console.log('Artifacts: data/fleet-detail-dry-run.json, data/airline-wikipedia-urls.json');
  await prisma.$disconnect();
})();
