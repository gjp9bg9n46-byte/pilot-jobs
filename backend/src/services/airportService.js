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
const CACHE_FILE = '/tmp/cockpithire-airports.json';

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

function buildMap(rows) {
  const map = new Map();
  for (const r of rows) {
    for (const key of [r.icao, r.iata]) {
      if (key && !map.has(key)) map.set(key, r);
    }
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

    const KEEP = new Set(['large_airport', 'medium_airport', 'small_airport', 'seaplane_base']);
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

/** Resolve a raw logbook code (ICAO or IATA, any case) → airport record or null. */
async function resolveAirport(code) {
  const map = await load();
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  return map.get(c) ?? null;
}

module.exports = { resolveAirport, load };
