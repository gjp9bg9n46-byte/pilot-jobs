'use strict';
/**
 * STEP G — Airline logo enrichment (Session 3, Commit 2).
 *
 *   node scripts/enrich-airline-logos.js              # DRY-RUN (resolve only, no writes/uploads)
 *   node scripts/enrich-airline-logos.js --sample     # stratified ~40, download + manifest (no DB, no upload)
 *   node scripts/enrich-airline-logos.js --apply       # full run: download -> Uploadcare -> write logoUrl/logoSource
 *
 * Resolution tiers (locked):
 *   Tier 1  Wikidata snapshot data/wikidata-airline-logos-v3.json (by IATA) -> P154 Commons URL (+ P856 domain).
 *   Tier 2  data/wikidata-airlines.json qid -> live Wikidata EntityData P154 (for existing airlines not in v3).
 *   Tier 3  SKIPPED this commit (initials fallback covers misses; add Wikipedia scrape later if coverage <80%).
 *
 * Image: Commons Special:FilePath?width=320 -> uniform PNG (rasterises SVG server-side; no client SVG).
 * Storage: self-host via Uploadcare (helper replicated inline — cvController is frozen, do NOT import it).
 * Additive + idempotent: only writes logoUrl/logoSource(/domain); skips airlines where logoUrl !== null.
 * Concurrency 3 with a descriptive User-Agent (Wikimedia policy); per-row try/catch never aborts the batch.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/database');

const APPLY = process.argv.includes('--apply');
const SAMPLE = process.argv.includes('--sample');
const DATA = path.join(__dirname, '..', 'data');
const SAMPLE_DIR = path.join(DATA, 'design-migration-audit', 'logo-samples');
const UA = 'CockpitHire-LogoEnrich/1.0 (https://cockpithire.com; mohamed.alaa.azim@icloud.com)';
const THUMB_W = 320;
const CONCURRENCY = 2;
const normName = (n) => (n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const thumb = (commonsUrl) => commonsUrl + (commonsUrl.includes('?') ? '&' : '?') + `width=${THUMB_W}`;

// ── Uploadcare upload — PRESERVED for a future self-host migration. ──────────────
// Currently UNUSED: Option B hotlinks the Wikimedia Commons CDN directly (the
// Uploadcare free-tier key didn't persist files at bulk volume — 404 on stored
// UUIDs, then 403). When a paid Uploadcare plan or S3 is available, re-enable this,
// switch the APPLY block back to download→upload, and re-run filtered by
// logoSource='WIKIMEDIA_CDN' to migrate the hotlinked URLs to self-hosted.
// eslint-disable-next-line no-unused-vars
async function uploadToUploadcare(buffer, filename) {
  const form = new FormData();
  form.append('UPLOADCARE_PUB_KEY', process.env.UPLOADCARE_PUBLIC_KEY);
  form.append('UPLOADCARE_STORE', '1');
  form.append('file', new Blob([buffer], { type: 'image/png' }), filename);
  const res = await fetch('https://upload.uploadcare.com/base/', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Uploadcare upload failed: ${res.status}`);
  const data = await res.json();
  if (!data.file) throw new Error('No UUID in Uploadcare response');
  return `https://ucarecdn.com/${data.file}/`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Polite fetch with retry/backoff — Wikimedia throttles burst thumbnail requests.
async function httpGet(url, asBuffer) {
  let lastErr;
  await sleep(400);  // base pacing to stay under Commons rate limit
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(800 * 2 ** (attempt - 1));   // 0.8s, 1.6s, 3.2s backoff
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25000);
      let res;
      try { res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctl.signal }); }
      finally { clearTimeout(timer); }
      if (res.status === 429 || res.status >= 500) { lastErr = new Error(`GET ${res.status}`); continue; }
      if (!res.ok) throw new Error(`GET ${res.status} ${url.slice(0, 60)}`);
      return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// Option B: follow Special:FilePath?width=320 to the stable upload.wikimedia.org
// thumbnail CDN URL and return it (we hotlink that, no self-host upload).
async function resolveCdnUrl(url) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(800 * 2 ** (attempt - 1));
    await sleep(400);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctl.signal });
      if (res.status === 429 || res.status >= 500) { lastErr = new Error(`GET ${res.status}`); continue; }
      if (!res.ok) throw new Error(`GET ${res.status} ${url.slice(0, 60)}`);
      return res.url; // final CDN URL after redirects
    } catch (e) { lastErr = e; } finally { clearTimeout(timer); }
  }
  throw lastErr;
}

// Normalised file title for matching API responses back to airlines.
const normTitle = (t) => t.replace(/^File:/i, '').replace(/ /g, '_').toLowerCase();

// Batched thumbnail resolution via the MediaWiki imageinfo API (≤50 files/request).
// Returns Map(normTitle -> thumburl). The Wikimedia-sanctioned, throttle-friendly path.
async function batchImageInfo(filenames) {
  const out = new Map();
  for (let i = 0; i < filenames.length; i += 50) {
    const batch = filenames.slice(i, i + 50);
    const titles = batch.map((fn) => 'File:' + fn).join('|');
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=320&titles=${encodeURIComponent(titles)}`;
    let data;
    try { data = await httpGet(url, false); } catch (e) { console.warn(`  imageinfo batch ${i} failed: ${e.message}`); continue; }
    const pages = data.query && data.query.pages ? data.query.pages : {};
    for (const pid of Object.keys(pages)) {
      const pg = pages[pid];
      const ii = pg.imageinfo && pg.imageinfo[0];
      const thumb = ii && (ii.thumburl || ii.url);
      if (thumb && pg.title) out.set(normTitle(pg.title), thumb);
    }
    await sleep(300);
  }
  return out;
}

// Tier 2: qid -> P154 Commons filename -> FilePath URL
async function p154FromQid(qid) {
  try {
    const data = await httpGet(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, false);
    const file = data.entities?.[qid]?.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
    return file ? `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}` : null;
  } catch { return null; }
}

function loadSnapshots() {
  const v3 = JSON.parse(fs.readFileSync(path.join(DATA, 'wikidata-airline-logos-v3.json'), 'utf8'));
  const v3ByIata = new Map(v3.map((e) => [e.iata, e]));
  const wd = JSON.parse(fs.readFileSync(path.join(DATA, 'wikidata-airlines.json'), 'utf8'));
  const qidByIata = new Map(), qidByName = new Map();
  for (const a of wd) {
    if (a.qid && a.dbIata) qidByIata.set(a.dbIata.toUpperCase(), a.qid);
    if (a.qid && a.dbName) qidByName.set(normName(a.dbName), a.qid);
  }
  return { v3ByIata, qidByIata, qidByName };
}

// Resolve a Commons logo URL for an airline -> { commonsUrl, source:'WIKIDATA', tier, domain }
async function resolveLogo(airline, snaps) {
  const iata = (airline.iataCode || '').toUpperCase();
  const t1 = iata && snaps.v3ByIata.get(iata);
  if (t1?.p154) return { commonsUrl: t1.p154, source: 'WIKIDATA', tier: 1, domain: t1.p856 || null };
  // Tier 2: qid by iata, then by name
  const qid = (iata && snaps.qidByIata.get(iata)) || snaps.qidByName.get(normName(airline.name));
  if (qid) {
    const p154 = await p154FromQid(qid);
    if (p154) return { commonsUrl: p154, source: 'WIKIDATA', tier: 2, domain: null };
  }
  return null;
}

// simple concurrency pool
async function pool(items, n, fn) {
  const results = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; results[idx] = await fn(items[idx], idx); }
  }));
  return results;
}

// ── stratified ~40 sample (locked composition) ──
const SAMPLE_IDS = [
  // 10 majors
  'LH','DL','EK','QF','SQ','BA','AF','NH','TK','UA',
  // 15 mid (mostly newly-seeded, varied regions)
  'SU','J2','JJ','PG','DE','GL','DD','UK','JX','PK','OA','EN','RF','QP','NU',
  // 10 fallback-tier (existing not in v3 — Tier 2 / may fail)
  'NK','JT','BG','LM','K4','HO','UL','name:VistaJet','name:Flexjet','name:Bristow Group',
  // 5 tricky (cargo / non-Latin / stylized)
  'DP','7L','ZG','JS','CU',
];

(async () => {
  const snaps = loadSnapshots();

  if (SAMPLE) {
    fs.mkdirSync(SAMPLE_DIR, { recursive: true });
    // resolve each sample id -> DB airline
    const airlines = [];
    for (const id of SAMPLE_IDS) {
      let a;
      if (id.startsWith('name:')) a = await prisma.airline.findFirst({ where: { name: { contains: id.slice(5), mode: 'insensitive' } }, select: { name: true, iataCode: true, icaoCode: true } });
      else a = await prisma.airline.findFirst({ where: { iataCode: id }, select: { name: true, iataCode: true, icaoCode: true } });
      if (a) airlines.push(a); else airlines.push({ name: id, iataCode: id.startsWith('name:') ? null : id, icaoCode: null, _notFound: true });
    }
    const manifest = await pool(airlines, CONCURRENCY, async (a) => {
      const rec = { name: a.name, iata: a.iataCode, notFound: !!a._notFound };
      if (a._notFound) { rec.status = 'NOT_IN_DB'; return rec; }
      try {
        const r = await resolveLogo(a, snaps);
        if (!r) { rec.status = 'NO_LOGO'; return rec; }
        rec.tier = r.tier; rec.source = r.source; rec.commonsUrl = r.commonsUrl; rec.domain = r.domain;
        const buf = await httpGet(thumb(r.commonsUrl), true);
        const file = `${(a.iataCode || normName(a.name)).replace(/[^A-Za-z0-9]/g, '')}.png`;
        fs.writeFileSync(path.join(SAMPLE_DIR, file), buf);
        rec.localFile = file; rec.bytes = buf.length; rec.status = 'OK';
      } catch (e) { rec.status = 'FAIL'; rec.error = e.message; }
      return rec;
    });
    fs.writeFileSync(path.join(SAMPLE_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const ok = manifest.filter((m) => m.status === 'OK');
    console.log('═══ SAMPLE (no DB writes, no uploads) ═══');
    console.log('resolved+downloaded:', ok.length, '/', manifest.length);
    console.log('tier1:', ok.filter((m) => m.tier === 1).length, '| tier2:', ok.filter((m) => m.tier === 2).length);
    console.log('failures:', manifest.filter((m) => m.status !== 'OK').map((m) => `${m.name}(${m.iata || '—'}:${m.status})`).join(', ') || 'none');
    manifest.forEach((m) => console.log(`  ${m.status.padEnd(9)} T${m.tier || '-'} ${m.name} [${m.iata || '—'}] ${m.commonsUrl ? m.commonsUrl.replace('http://commons.wikimedia.org/wiki/Special:FilePath/', '') : ''}`));
    console.log('manifest →', path.join(SAMPLE_DIR, 'manifest.json'));
    await prisma.$disconnect();
    return;
  }

  // DRY-RUN / APPLY over all airlines with logoUrl == null.
  const targets = await prisma.airline.findMany({ where: { logoUrl: null }, select: { id: true, name: true, iataCode: true, icaoCode: true } });
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — airlines needing a logo:`, targets.length);

  // 1. resolve each to a Commons filename (Tier 1 = no network; Tier 2 = qid→EntityData).
  const tally = { tier1: 0, tier2: 0, miss: 0, fail: 0 };
  const resolved = []; // { airline, filename, domain }
  await pool(targets, 4, async (a) => {
    try {
      const r = await resolveLogo(a, snaps);
      if (!r) { tally.miss++; return; }
      tally[`tier${r.tier}`]++;
      const filename = decodeURIComponent(r.commonsUrl.split('Special:FilePath/')[1]);
      resolved.push({ airline: a, filename, domain: r.domain });
    } catch (e) { tally.fail++; console.warn(`  resolve FAIL ${a.name}: ${e.message}`); }
  });
  console.log(`resolved filenames: ${resolved.length} (tier1 ${tally.tier1}, tier2 ${tally.tier2}) | miss ${tally.miss} | fail ${tally.fail}`);
  if (!APPLY) { console.log('\nDRY-RUN — no writes. Run --apply to batch-resolve + write.'); await prisma.$disconnect(); return; }

  // 2. batch-resolve thumbnails via the imageinfo API (≤50/request → few calls, no 429).
  const thumbMap = await batchImageInfo([...new Set(resolved.map((r) => r.filename))]);
  console.log(`imageinfo thumbnails resolved: ${thumbMap.size}`);

  // 3. write sequentially (no DB pool exhaustion).
  let written = 0, noThumb = 0;
  for (const { airline, filename, domain } of resolved) {
    const thumbUrl = thumbMap.get(normTitle('File:' + filename));
    if (!thumbUrl) { noThumb++; continue; }
    try {
      await prisma.airline.update({ where: { id: airline.id }, data: { logoUrl: thumbUrl, logoSource: 'WIKIMEDIA_CDN', ...(domain ? { domain } : {}) } });
      written++;
    } catch (e) { console.warn(`  write FAIL ${airline.name}: ${e.message}`); }
  }
  console.log(`written this run: ${written} | resolved-but-no-thumb: ${noThumb}`);
  const finalCount = await prisma.airline.count({ where: { logoUrl: { not: null } } });
  console.log(`TOTAL logos now: ${finalCount}/468 (${Math.round(finalCount / 468 * 100)}%)`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
