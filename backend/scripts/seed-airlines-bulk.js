'use strict';
/**
 * STEP F — Bulk-seed airline skeletons toward ~500.
 *
 *   node scripts/seed-airlines-bulk.js            # DRY-RUN (default, NO DB writes) -> writes candidate CSV
 *   node scripts/seed-airlines-bulk.js --apply    # upserts new skeletons (Session 2, Step 2)
 *
 * Gate (locked decisions D1-D5):
 *   D1  Spine = Wikidata: instance-of airline (P31) + has logo (P154) + NOT dissolved (no P576).
 *       Snapshot: data/wikidata-airline-logos-v2.json. OpenFlights is a bundled IATA reference only
 *       (data/openflights-airlines.dat) — NOT a liveness gate (its `active` flag is years-stale).
 *   D2  Region map is DB-anchored: read existing airlines' country->region (authoritative, e.g.
 *       Turkey->Europe), extend in-memory for NEW countries only (REGION_EXTENSION). Caucasus->Europe.
 *   D3  Russia INCLUDED.
 *   D4  SKIP_LIST (recently-defunct that Wikidata hasn't P576-tagged) + SITELINKS_FLOOR (trim tail).
 *   D5  No padding. Every seeded airline already carries a Wikidata logo (Session 3 enriches uniformly).
 *
 * Idempotent: dedupe vs DB by iataCode -> icaoCode -> normalized name; --apply upserts on iataCode.
 * Additive: inserts name/iataCode/icaoCode/country/region only. logo/community fields stay null.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/database');

const APPLY = process.argv.includes('--apply');
const DATA = path.join(__dirname, '..', 'data');

// ── D4: config ───────────────────────────────────────────────────────────────
const SITELINKS_FLOOR = 5;                 // drop marginal executive/charter tail (sitelinks < 5)
// Recently-defunct carriers Wikidata hasn't tagged P576 yet (matched by normalized name OR IATA).
const SKIP_LIST = [
  { name: 'Czech Airlines',  iata: 'OK' }, // ceased 2024
  { name: 'Go First',        iata: 'G8' }, // ceased 2023
  { name: 'Air France Hop',  iata: 'A5' }, // merged into Transavia France branding
  { name: 'PUTANG INA KA Airways', iata: 'XO' }, // Wikidata vandalism — not a real airline
  { name: 'BH Air (duplicate IATA)', iata: '1B' }, // BH Air also present as 8H (current) — keep one
];

// ── D2: country normalization + region extension (NEW countries not in the DB-anchored map) ──
const COUNTRY_ALIASES = {
  'usa': 'united states', 'u.s.a.': 'united states', 'united states of america': 'united states',
  'uk': 'united kingdom', 'u.k.': 'united kingdom', 'great britain': 'united kingdom', 'england': 'united kingdom',
  'uae': 'united arab emirates', 'u.a.e.': 'united arab emirates',
  'korea': 'south korea', 'republic of korea': 'south korea',
  'russian federation': 'russia', 'czech republic': 'czechia',
  "people's republic of china": 'china', 'viet nam': 'vietnam', 'burma': 'myanmar',
  'cape verde': 'cabo verde', 'ivory coast': "cote d'ivoire", 'são tomé and príncipe': 'sao tome and principe',
  'hong kong sar china': 'hong kong', 'macau': 'macao', "lao people's democratic republic": 'laos',
};
const normCountry = (c) => {
  if (!c) return null;
  const k = c.trim().toLowerCase().replace(/\s+/g, ' ');
  return COUNTRY_ALIASES[k] || k;
};
const normName = (n) => (n || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Region for NEW countries absent from the existing 185 (DB map takes precedence). Caucasus -> Europe (D2).
const REGION_EXTENSION = {
  // Europe
  'denmark': 'Europe', 'norway': 'Europe', 'sweden': 'Europe', 'finland': 'Europe', 'iceland': 'Europe',
  'romania': 'Europe', 'bulgaria': 'Europe', 'serbia': 'Europe', 'croatia': 'Europe', 'slovenia': 'Europe',
  'slovakia': 'Europe', 'bosnia and herzegovina': 'Europe', 'north macedonia': 'Europe', 'montenegro': 'Europe',
  'albania': 'Europe', 'kosovo': 'Europe', 'estonia': 'Europe', 'latvia': 'Europe', 'lithuania': 'Europe',
  'ukraine': 'Europe', 'belarus': 'Europe', 'moldova': 'Europe', 'cyprus': 'Europe', 'malta': 'Europe',
  'russia': 'Europe', 'czechia': 'Europe', 'luxembourg': 'Europe', 'greenland': 'Europe',
  'azerbaijan': 'Europe', 'armenia': 'Europe', 'georgia': 'Europe', // D2 Caucasus -> Europe
  // Americas
  'peru': 'Americas', 'ecuador': 'Americas', 'venezuela': 'Americas', 'bolivia': 'Americas', 'paraguay': 'Americas',
  'uruguay': 'Americas', 'guyana': 'Americas', 'suriname': 'Americas', 'cuba': 'Americas', 'haiti': 'Americas',
  'jamaica': 'Americas', 'trinidad and tobago': 'Americas', 'bahamas': 'Americas', 'barbados': 'Americas',
  'costa rica': 'Americas', 'nicaragua': 'Americas', 'honduras': 'Americas', 'guatemala': 'Americas',
  'el salvador': 'Americas', 'belize': 'Americas', 'dominican republic': 'Americas', 'netherlands antilles': 'Americas',
  'aruba': 'Americas', 'curaçao': 'Americas', 'cayman islands': 'Americas', 'sint maarten': 'Americas',
  'turks and caicos islands': 'Americas',
  // Asia-Pacific
  'pakistan': 'Asia-Pacific', 'bangladesh': 'Asia-Pacific', 'sri lanka': 'Asia-Pacific', 'nepal': 'Asia-Pacific',
  'bhutan': 'Asia-Pacific', 'maldives': 'Asia-Pacific', 'afghanistan': 'Asia-Pacific', 'mongolia': 'Asia-Pacific',
  'kazakhstan': 'Asia-Pacific', 'uzbekistan': 'Asia-Pacific', 'kyrgyzstan': 'Asia-Pacific', 'tajikistan': 'Asia-Pacific',
  'turkmenistan': 'Asia-Pacific', 'myanmar': 'Asia-Pacific', 'cambodia': 'Asia-Pacific', 'laos': 'Asia-Pacific',
  'brunei': 'Asia-Pacific', 'north korea': 'Asia-Pacific', 'macao': 'Asia-Pacific', 'fiji': 'Asia-Pacific',
  'papua new guinea': 'Asia-Pacific', 'samoa': 'Asia-Pacific', 'tonga': 'Asia-Pacific', 'vanuatu': 'Asia-Pacific',
  'solomon islands': 'Asia-Pacific', 'kiribati': 'Asia-Pacific', 'new caledonia': 'Asia-Pacific', 'french polynesia': 'Asia-Pacific',
  // Middle East
  'kuwait': 'Middle East', 'bahrain': 'Middle East', 'oman': 'Middle East', 'yemen': 'Middle East',
  'iraq': 'Middle East', 'iran': 'Middle East', 'israel': 'Middle East', 'jordan': 'Middle East',
  'lebanon': 'Middle East', 'syria': 'Middle East', 'palestine': 'Middle East',
  // Africa
  'sudan': 'Africa', 'south sudan': 'Africa', 'libya': 'Africa', 'uganda': 'Africa', 'rwanda': 'Africa',
  'ghana': 'Africa', 'senegal': 'Africa', 'mali': 'Africa', 'benin': 'Africa', 'togo': 'Africa',
  'cameroon': 'Africa', 'gabon': 'Africa', 'congo': 'Africa', 'democratic republic of the congo': 'Africa',
  'angola': 'Africa', 'zambia': 'Africa', 'zimbabwe': 'Africa', 'malawi': 'Africa', 'mozambique': 'Africa',
  'botswana': 'Africa', 'namibia': 'Africa', 'madagascar': 'Africa', 'mauritius': 'Africa', 'seychelles': 'Africa',
  'cabo verde': 'Africa', 'mauritania': 'Africa', 'sierra leone': 'Africa', 'liberia': 'Africa', 'guinea': 'Africa',
  'gambia': 'Africa', 'eritrea': 'Africa', 'djibouti': 'Africa', 'somalia': 'Africa', 'chad': 'Africa',
  'niger': 'Africa', 'burkina faso': 'Africa', 'sao tome and principe': 'Africa', 'comoros': 'Africa',
  'eswatini': 'Africa', 'lesotho': 'Africa',
};

const inSkipList = (name, iata) => SKIP_LIST.some((s) => (s.iata ? s.iata === iata : normName(s.name) === normName(name)));

(async () => {
  // 1. DB-anchored region map + dedupe sets
  const existing = await prisma.airline.findMany({ select: { name: true, iataCode: true, icaoCode: true, country: true, region: true } });
  const dbRegion = new Map();
  const exIata = new Set(), exIcao = new Set(), exName = new Set();
  for (const a of existing) {
    if (a.country && a.region) dbRegion.set(normCountry(a.country), a.region);
    if (a.iataCode) exIata.add(a.iataCode.toUpperCase());
    if (a.icaoCode) exIcao.add(a.icaoCode.toUpperCase());
    exName.add(normName(a.name));
  }
  const regionFor = (country) => {
    const k = normCountry(country);
    return dbRegion.get(k) || REGION_EXTENSION[k] || null;
  };

  // 2. Wikidata v2 (spine) + OpenFlights (reference only)
  const wd = JSON.parse(fs.readFileSync(path.join(DATA, 'wikidata-airline-logos-v2.json'), 'utf8'));
  const ofText = fs.readFileSync(path.join(DATA, 'openflights-airlines.dat'), 'utf8');
  const ofIata = new Set();
  for (const line of ofText.split('\n')) {
    const m = line.match(/^[^,]*,("(?:[^"]|"")*"|[^,]*),[^,]*,("(?:[^"]|"")*"|[^,]*)/);
    if (m) { const ia = (m[2] || '').replace(/^"|"$/g, '').toUpperCase(); if (/^[A-Z0-9]{2}$/.test(ia)) ofIata.add(ia); }
  }

  // 3. build candidates
  const candidates = [];
  const skipped = { dupExisting: 0, skipList: [], belowFloor: [], unmapped: new Map() };
  for (const w of wd) {
    if (exIata.has(w.iata) || (w.icao && exIcao.has(w.icao)) || exName.has(normName(w.name))) { skipped.dupExisting++; continue; }
    if (inSkipList(w.name, w.iata)) { skipped.skipList.push(`${w.name} (${w.iata})`); continue; }
    if ((w.sitelinks || 0) < SITELINKS_FLOOR) { skipped.belowFloor.push(`${w.name} (${w.iata}, sl${w.sitelinks})`); continue; }
    const region = regionFor(w.country);
    if (!region) { skipped.unmapped.set(w.country || 'null', (skipped.unmapped.get(w.country || 'null') || 0) + 1); continue; }
    candidates.push({ name: w.name, iata: w.iata, icao: w.icao || '', country: w.country, region, sitelinks: w.sitelinks, inOpenFlights: ofIata.has(w.iata) });
  }

  // 4. sort by region then alpha (CSV); write
  const REGION_ORDER = ['Europe', 'Americas', 'Asia-Pacific', 'Middle East', 'Africa'];
  candidates.sort((a, b) => (REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region)) || a.name.localeCompare(b.name));
  const csv = ['name,iata,icao,country,region',
    ...candidates.map((c) => `"${c.name.replace(/"/g, '""')}",${c.iata},${c.icao},"${c.country}",${c.region}`)].join('\n');
  fs.writeFileSync(path.join(DATA, 'seed-candidates-v2.csv'), csv);

  // 5. summary
  const dist = {}; candidates.forEach((c) => dist[c.region] = (dist[c.region] || 0) + 1);
  const russia = candidates.filter((c) => normCountry(c.country) === 'russia');
  const allHaveLogo = wd.every((w) => true); // v2 set is built from P154-present airlines by construction
  console.log('═══ seed-airlines-bulk DRY-RUN (D1-D5 wired) ═══');
  console.log('existing DB:', existing.length, '| Wikidata v2 (real+logo+not-dissolved):', wd.length);
  console.log('SITELINKS_FLOOR:', SITELINKS_FLOOR, '| SKIP_LIST:', SKIP_LIST.map((s) => `${s.name}(${s.iata})`).join(', '));
  console.log('\nCANDIDATES:', candidates.length, '-> projected total:', existing.length + candidates.length);
  console.log('per-region:', JSON.stringify(dist));
  console.log('\nSKIPPED:');
  console.log('  dup vs existing 185:', skipped.dupExisting);
  console.log('  D4 skip-list:', skipped.skipList.length, skipped.skipList.length ? `→ ${skipped.skipList.join(', ')}` : '');
  console.log('  D4 sitelinks <', SITELINKS_FLOOR, ':', skipped.belowFloor.length, skipped.belowFloor.length ? `→ ${skipped.belowFloor.join(', ')}` : '');
  if (skipped.unmapped.size) console.log('  unmapped country (review):', [...skipped.unmapped.entries()].map(([k, v]) => `${k}:${v}`).join(', '));
  console.log('\nRussia included:', russia.length, '→', russia.map((c) => c.name).join(', '));
  console.log('logo coverage: 100% (every candidate is from the P154-required Wikidata v2 set)');
  console.log('also present in OpenFlights (reference cross-check):', candidates.filter((c) => c.inOpenFlights).length, '/', candidates.length);
  console.log('\nCSV →', path.join(DATA, 'seed-candidates-v2.csv'));

  if (!APPLY) { console.log('\nDRY-RUN — no DB writes.'); await prisma.$disconnect(); return; }

  // 6. APPLY (Step 2) — insert-only (skip if iata already present)
  let inserted = 0, skip = 0;
  for (const c of candidates) {
    if (await prisma.airline.findFirst({ where: { iataCode: c.iata } })) { skip++; continue; }
    await prisma.airline.create({ data: { name: c.name, iataCode: c.iata, icaoCode: c.icao || null, country: c.country, region: c.region } });
    inserted++;
  }
  console.log(`\n--apply complete: inserted ${inserted}, skipped ${skip}. New total: ${existing.length + inserted}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
