'use strict';

/**
 * Airport geodata — resolves ICAO/IATA codes from logbook entries to
 * city / country / coordinates for the profile flight map.
 *
 * Data: OurAirports (https://ourairports.com/data/ — public domain, no key).
 * Downloaded once per boot on first use, parsed to a lean in-memory map, and
 * cached to /tmp so restarts within the same container skip the download.
 * Codes that can't be resolved are skipped silently (owner directive).
 */

const fs = require('fs');
const axios = require('axios');
const logger = require('../config/logger');

const DATA_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
// v2: the cache shape changed (closed airports are now included).
const CACHE_FILE = '/tmp/cockpithire-airports-v2.json';

let byCode = null; // Map<CODE, {icao, iata, name, city, country, lat, lon}>
let loading = null;

// Minimal CSV field splitter (handles quoted fields with commas).
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// ── Codes the public dataset misses or disagrees with ───────────────────────
// OurAirports has no ALY record at all (including closed airports did not
// bring one back), and its HEAX row carries Borg El Arab's IATA code (HBE) and
// coordinates. A pilot writing ALY on an Air Cairo voyage report means
// Alexandria, and the code has to resolve or the sector cannot be night-checked.
//
// Each override says where it came from, so it can be re-checked when the
// upstream data changes. Overrides win over the dataset.
const OVERRIDES = [
  {
    icao: 'HEAX', iata: 'ALY', name: 'Alexandria El Nouzha', city: 'Alexandria',
    country: 'EG', lat: 31.184, lon: 29.949, closed: true,
    // El Nouzha stopped taking scheduled traffic in 2011 (it moved to Borg El
    // Arab, HBE). Marked closed so the scan review asks rather than assumes,
    // and never so that the flight is refused.
    source: 'owner decision 2026-10-22; OurAirports has no ALY',
  },
];

function buildMap(rows) {
  const map = new Map();
  for (const r of rows) {
    for (const key of [r.icao, r.iata]) {
      if (key && !map.has(key)) map.set(key, r);
    }
  }
  // Applied last and unconditionally: an override exists because the dataset
  // is wrong or silent about that code.
  for (const o of OVERRIDES) {
    for (const key of [o.icao, o.iata]) if (key) map.set(key, o);
  }
  return map;
}

async function load() {
  if (byCode) return byCode;
  if (loading) return loading;

  loading = (async () => {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const rows = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        byCode = buildMap(rows);
        logger.info(`airportService: ${rows.length} airports loaded from cache`);
        return byCode;
      }
    } catch { /* cache unreadable — refetch */ }

    const resp = await axios.get(DATA_URL, {
      timeout: 60000,
      responseType: 'text',
      headers: { 'User-Agent': 'CockpitHire/1.0 (contact@cockpithire.com)' },
      maxContentLength: 50 * 1024 * 1024,
    });

    const lines = String(resp.data).split('\n');
    const header = splitCsvLine(lines[0]);
    const col = (name) => header.indexOf(name);
    const cIdent = col('ident'); const cType = col('type'); const cName = col('name');
    const cLat = col('latitude_deg'); const cLon = col('longitude_deg');
    const cCountry = col('iso_country'); const cCity = col('municipality');
    const cIata = col('iata_code'); const cIcao = col('icao_code');

    // 'closed' is included deliberately. OurAirports marks an airport closed
    // when it stops serving scheduled traffic, but the pilot still flew there,
    // and the code still belongs in their logbook — Alexandria El Nouzha (ALY
    // / HEAX) is the case that brought this up. We keep the record so the code
    // resolves, and mark it so the review can ask rather than guess.
    const KEEP = new Set(['large_airport', 'medium_airport', 'small_airport', 'seaplane_base', 'closed']);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const f = splitCsvLine(lines[i]);
      if (!KEEP.has(f[cType])) continue;
      const lat = parseFloat(f[cLat]);
      const lon = parseFloat(f[cLon]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const icao = (f[cIcao] || f[cIdent] || '').trim().toUpperCase();
      const iata = (f[cIata] || '').trim().toUpperCase();
      rows.push({
        icao: /^[A-Z0-9]{4}$/.test(icao) ? icao : null,
        iata: /^[A-Z]{3}$/.test(iata) ? iata : null,
        name: f[cName] || null,
        city: f[cCity] || null,
        country: f[cCountry] || null,
        closed: f[cType] === 'closed',
        lat: Math.round(lat * 1000) / 1000,
        lon: Math.round(lon * 1000) / 1000,
      });
    }

    try { fs.writeFileSync(CACHE_FILE, JSON.stringify(rows)); } catch { /* tmp readonly — fine */ }
    byCode = buildMap(rows);
    logger.info(`airportService: ${rows.length} airports downloaded and indexed`);
    return byCode;
  })().catch((err) => {
    loading = null; // allow retry on next request
    logger.error(`airportService load failed: ${err.message}`);
    throw err;
  });

  return loading;
}

/** Resolve a raw logbook code (ICAO or IATA, any case) → airport record or null.
 *  Closed airports resolve like any other; the record carries `closed: true`. */
async function resolveAirport(code) {
  const map = await load();
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  return map.get(c) ?? null;
}

module.exports = { resolveAirport, load };
