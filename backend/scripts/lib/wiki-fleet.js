'use strict';
/**
 * Wikipedia fleet-table resolver + parser (read-only).
 *  - URL resolution: Wikidata sitelink (qid) → Wikipedia search → "{Title} fleet" sub-article.
 *  - Fetch: REST HTML, on-disk cache, polite rate, retry-once w/ backoff.
 *  - Parser: cheerio with a rowspan/colspan-aware grid expansion.
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const UA = 'CockpitHire/1.0 (contact@cockpithire.com)';
const REST = 'https://en.wikipedia.org/api/rest_v1/page/html/';
const WD = 'https://www.wikidata.org/w/api.php';
const WP = 'https://en.wikipedia.org/w/api.php';
const CACHE_DIR = path.join(__dirname, '../../data/wikipedia-html-cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cacheFile = (title) => path.join(CACHE_DIR, encodeURIComponent(title.replace(/ /g, '_')).replace(/%/g, '_') + '.html');

// ---- fetch helpers (cache + retry) ----
async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Returns { html, fetched } or { notFound:true } or throws on hard error.
async function fetchHtml(title, rate = 600) {
  const cf = cacheFile(title);
  if (fs.existsSync(cf)) return { html: fs.readFileSync(cf, 'utf8'), fetched: false };
  const url = REST + encodeURIComponent(title.replace(/ /g, '_'));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      await sleep(rate);
      if (res.status === 404) return { notFound: true };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      fs.writeFileSync(cf, html);
      return { html, fetched: true };
    } catch (e) {
      if (attempt === 1) throw e;
      await sleep(1500 * (attempt + 1)); // backoff
    }
  }
}

async function titleFromQid(qid) {
  if (!qid) return null;
  const j = await getJson(`${WD}?action=wbgetentities&format=json&ids=${qid}&props=sitelinks&sitefilter=enwiki`);
  return j.entities?.[qid]?.sitelinks?.enwiki?.title || null;
}
async function searchTitle(name) {
  const j = await getJson(`${WP}?action=query&list=search&format=json&srlimit=1&srsearch=${encodeURIComponent(name)}`);
  return j.query?.search?.[0]?.title || null;
}

// ---- parsing ----
function cellText($, el) {
  const c = $(el).clone();
  c.find('sup, style, .mw-ref, .reference, [class*="sortkey"], [style*="display:none"], [style*="display: none"]').remove();
  return c.text().replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

// Expand a <table> into a rectangular grid honoring rowspan/colspan.
// Each cell = { text, origin } — origin=true ONLY at the span's top-left, so a
// rowspanned count is read once (not duplicated across the rows it covers).
function tableToGrid($, table) {
  const trs = $(table).children('tbody').children('tr').toArray().length
    ? $(table).children('tbody').children('tr').toArray()
    : $(table).find('tr').toArray();
  const grid = [];
  for (let r = 0; r < trs.length; r++) {
    let c = 0;
    const cells = $(trs[r]).children('th,td').toArray();
    for (const cell of cells) {
      while (grid[r] && grid[r][c] !== undefined) c++;
      const cs = Math.max(1, parseInt($(cell).attr('colspan') || '1', 10) || 1);
      const rs = Math.max(1, parseInt($(cell).attr('rowspan') || '1', 10) || 1);
      const text = cellText($, cell);
      for (let i = 0; i < rs; i++) {
        for (let j = 0; j < cs; j++) {
          if (!grid[r + i]) grid[r + i] = [];
          grid[r + i][c + j] = { text, origin: i === 0 && j === 0 };
        }
      }
      c += cs;
    }
    if (!grid[r]) grid[r] = [];
  }
  return grid;
}
const txt = (cell) => (cell && cell.text) || '';

function parseNum(t) {
  if (t == null) return null;
  let s = String(t).replace(/\[[^\]]*\]/g, '').replace(/ /g, ' ').replace(/,/g, '').trim();
  if (s === '') return null;
  if (/^(—|–|−|-|n\/?a|tba|tbd|none|\?)$/i.test(s)) return null;
  const m = s.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// Header matching is whitespace-insensitive: Wikipedia renders "In service" as
// "Inservice" when a <br> separates the words (collapsed on .text()).
const COL = {
  type: (h) => /aircraft|^type$|aircrafttype/.test(h) && !/subtype|engine/.test(h),
  service: (h) => /inservice|infleet|inoperation|^active$|^current$|^fleet$|operational/.test(h) && !/operatedfor/.test(h),
  orders: (h) => /order/.test(h),
  retired: (h) => /retired|withdrawn|stored/.test(h),
};

function isJunkType(t) {
  if (!t) return true;
  const s = t.trim();
  if (/^[FJCWY]$/.test(s) || /^PE$/i.test(s)) return true;     // cabin class
  if (/^\d+$/.test(s)) return true;                            // pure number
  if (/^(total|aircraft|type)$/i.test(s)) return true;         // header carry / subtotal
  if (/ fleet$/i.test(s)) return true;                         // "Cargo fleet" caption
  if (s.length > 48) return true;                              // notes/caption blob
  return false;
}

// Parse the first fleet-like wikitable in the HTML. Returns { found, rows, junkDropped, notes }.
function parseFleet(html) {
  const $ = cheerio.load(html);
  const notes = new Set();
  let chosen = null, idx = null;

  $('table.wikitable').each((_, tbl) => {
    if (chosen) return;
    const grid = tableToGrid($, tbl);
    // find header row within first 3 rows
    for (let r = 0; r < Math.min(3, grid.length); r++) {
      const row = (grid[r] || []).map((x) => txt(x).toLowerCase().replace(/\s+/g, '')); // despaced for matching
      const typeIdx = row.findIndex(COL.type);
      const isIdx = row.findIndex(COL.service);
      const ordIdx = row.findIndex(COL.orders);
      const retIdx = row.findIndex(COL.retired);
      if (typeIdx !== -1 && (isIdx !== -1 || ordIdx !== -1)) {
        chosen = grid; idx = { typeIdx, isIdx, ordIdx, retIdx, headerRow: r, headers: grid[r].map(txt) };
        return false;
      }
    }
  });
  if (!chosen) return { found: false };

  if (/class="[^"]*reference|<sup/.test(html)) notes.add('footnote-refs-stripped');

  // Aggregate by type, counting each number cell ONCE (origin only) — de-dupes
  // rowspanned counts and sums genuine sub-fleet rows.
  const agg = new Map(); // type -> { order, inService:{sum,has}, ordered:{...}, retired:{...} }
  let junk = 0;
  const add = (rec, field, cell) => {
    if (!cell || !cell.origin) return;            // skip rowspan-fill duplicates
    const n = parseNum(cell.text); if (n == null) return;
    rec[field].sum += n; rec[field].has = true;
  };
  for (let r = idx.headerRow + 1; r < chosen.length; r++) {
    const g = chosen[r] || [];
    const distinct = new Set(g.map(txt).filter((x) => x && x.trim()));
    if (distinct.size <= 1) { junk++; notes.add('full-span-divider'); continue; }
    const type = txt(g[idx.typeIdx]).trim();
    if (isJunkType(type)) { junk++; if (/^[FJCWY]$/.test(type)) notes.add('cabin-class-row'); continue; }
    if (!agg.has(type)) agg.set(type, { order: agg.size, inService: { sum: 0, has: false }, ordered: { sum: 0, has: false }, retired: { sum: 0, has: false } });
    const rec = agg.get(type);
    if (idx.isIdx !== -1) add(rec, 'inService', g[idx.isIdx]);
    if (idx.ordIdx !== -1) add(rec, 'ordered', g[idx.ordIdx]);
    if (idx.retIdx !== -1) add(rec, 'retired', g[idx.retIdx]);
  }
  if ([...agg.values()].some((v) => v.inService.has && v.ordered.has)) notes.add('aggregated-by-type');
  const rows = [...agg.entries()].sort((a, b) => a[1].order - b[1].order).map(([type, v]) => ({
    type,
    inService: v.inService.has ? v.inService.sum : null,
    ordered: v.ordered.has ? v.ordered.sum : null,
    retired: v.retired.has ? v.retired.sum : null,
  }));
  return { found: true, rows, junkDropped: junk, notes: [...notes], headers: idx.headers };
}

module.exports = { fetchHtml, titleFromQid, searchTitle, parseFleet, sleep };
