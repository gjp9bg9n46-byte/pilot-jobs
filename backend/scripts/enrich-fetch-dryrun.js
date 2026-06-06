'use strict';
/**
 * STEP B — Wikidata fetch + enrichment DRY RUN (no DB writes).
 * Reads the airline list from the DB, fetches Wikidata for each, resolves the
 * 12 deferred operators by name, computes the additive patches that Step C
 * WOULD apply, and writes everything under data/ for review.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/database');
const wd = require('./lib/wikidata');

const DEFERRED = [
  'Wheels Up', 'Luxaviation', 'Jet Aviation', 'Jet Linx', 'Solairus Aviation', 'Air Methods',
  'PHI Aviation', 'CHC Helicopter', 'Babcock International', 'Coulson Aviation', '10 Tanker Air Carrier', 'Omni Helicopters International',
];
const ENRICHABLE = ['headquarters', 'bases', 'fleet']; // additive-only target fields
const COMMUNITY_ONLY = ['payRanges', 'rosterPattern', 'hiringStatus', 'hiringFrequency', 'contractType', 'avgResponseDays', 'interviewStages', 'simType', 'upgradeTimeMinYears', 'upgradeTimeMaxYears', 'notes', 'workAuthRequired'];
const isEmpty = (v) => v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'string' && v.trim() === '');
const AVIATION = /airline|aviation|carrier|charter|helicopter|cargo|airways|air transport/i;

(async () => {
  const fleet = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/airlines-fleet.json'), 'utf8'));
  const fleetKey = (a) => a.iataCode || a.icaoCode;

  const dbAirlines = await prisma.airline.findMany({ select: { id: true, name: true, iataCode: true, icaoCode: true, country: true, region: true, headquarters: true, bases: true, fleet: true } });
  console.log(`DB airlines: ${dbAirlines.length}`);

  // --- Fetch Wikidata for everything in DB ---
  const withIata = dbAirlines.filter((a) => a.iataCode);
  const icaoOnly = dbAirlines.filter((a) => !a.iataCode && a.icaoCode);
  console.log(`Fetching Wikidata: ${withIata.length} by IATA, ${icaoOnly.length} by ICAO …`);
  const byIataRows = await wd.fetchByIata(withIata.map((a) => a.iataCode));
  const byIcaoRows = await wd.fetchByIcao(icaoOnly.map((a) => a.icaoCode));

  const iataGroups = new Map();
  for (const r of byIataRows) { if (!iataGroups.has(r.iata)) iataGroups.set(r.iata, []); iataGroups.get(r.iata).push(r); }
  const icaoGroups = new Map();
  for (const r of byIcaoRows) { if (!icaoGroups.has(r.icao)) icaoGroups.set(r.icao, []); icaoGroups.get(r.icao).push(r); }

  const resolved = []; // per DB airline
  for (const a of dbAirlines) {
    let pick;
    if (a.iataCode) pick = wd.disambiguate(iataGroups.get(a.iataCode) || [], a.name);
    else pick = wd.disambiguate(icaoGroups.get(a.icaoCode) || [], a.name);
    const r = pick.chosen;
    resolved.push({
      dbId: a.id, dbName: a.name, dbIata: a.iataCode, dbIcao: a.icaoCode, region: a.region,
      iataFound: !!r,                                   // an entity exists for our code
      icaoWikidata: r?.icao || null,
      icaoMatch: r && r.icao ? (r.icao === a.icaoCode) : null,
      hq: r?.hq || null, hubs: r?.hubs || [],
      ambiguous: pick.ambiguous, candidateNames: pick.candidateNames,
      wikidataName: r?.name || null, qid: r?.qid || null,
    });
  }

  // --- Resolve the 12 deferred by name ---
  const deferredResults = [];
  for (const name of DEFERRED) {
    let rec = null, qid = null, candidates = [];
    try {
      candidates = await wd.searchByName(name);
      const aviationHit = candidates.find((c) => AVIATION.test(c.description)) || candidates[0];
      if (aviationHit) { qid = aviationHit.qid; rec = await wd.fetchByQid(qid); }
      await wd.sleep(800);
    } catch (e) { /* leave rec null */ }
    let status;
    if (rec && rec.iata && rec.icao) status = 'iata+icao';
    else if (rec && rec.icao) status = 'icao-only';
    else if (rec && rec.iata) status = 'iata-only';
    else status = 'unresolvable';
    deferredResults.push({ name, status, qid, resolved: rec, candidateDescs: candidates.map((c) => `${c.label} — ${c.description}`) });
  }

  // --- Build additive dry-run patches (fields currently empty get filled) ---
  const patches = [];
  for (const a of dbAirlines) {
    const r = resolved.find((x) => x.dbId === a.id);
    const patch = {};
    if (isEmpty(a.headquarters) && r.hq) patch.headquarters = r.hq;
    if (isEmpty(a.bases) && r.hubs.length) patch.bases = r.hubs;
    const fl = fleet[fleetKey(a)];
    if (isEmpty(a.fleet) && Array.isArray(fl) && fl.length) patch.fleet = fl;
    if (Object.keys(patch).length) patches.push({ name: a.name, iata: a.iataCode, icao: a.icaoCode, patch });
  }

  // --- Stats ---
  const usableHq = resolved.filter((r) => r.hq).length;
  const usableBases = resolved.filter((r) => r.hubs.length).length;
  const iataNotFound = resolved.filter((r) => r.dbIata && !r.iataFound);
  const icaoMatch = resolved.filter((r) => r.icaoMatch === true).length;
  const icaoMismatch = resolved.filter((r) => r.icaoMatch === false);
  const nothingUsable = resolved.filter((r) => !r.hq && !r.hubs.length).length;
  const fleetKeys = Object.keys(fleet).filter((k) => k !== '_meta');

  // --- Save artifacts ---
  fs.writeFileSync(path.join(__dirname, '../data/wikidata-airlines.json'), JSON.stringify(resolved, null, 2));
  fs.writeFileSync(path.join(__dirname, '../data/wikidata-deferred.json'), JSON.stringify(deferredResults, null, 2));
  fs.writeFileSync(path.join(__dirname, '../data/enrichment-patches-preview.json'), JSON.stringify(patches, null, 2));

  // --- Report ---
  console.log('\n================= DRY-RUN REPORT =================');
  console.log(`\n[1] Wikidata fetch over ${dbAirlines.length} DB airlines:`);
  console.log(`  usable HQ string:        ${usableHq}`);
  console.log(`  usable bases/hubs list:  ${usableBases}`);
  console.log(`  IATA found in Wikidata:  ${resolved.filter(r=>r.iataFound).length} / ${resolved.length}`);
  console.log(`  IATA NOT found (suspect code): ${iataNotFound.length}` + (iataNotFound.length ? ' -> ' + JSON.stringify(iataNotFound.map(r=>`${r.dbName}(${r.dbIata})`)) : ''));
  console.log(`  ICAO matches DB:         ${icaoMatch}`);
  console.log(`  ICAO mismatches DB (review): ${icaoMismatch.length}` + (icaoMismatch.length ? ' -> ' + JSON.stringify(icaoMismatch.map(r=>`${r.dbName}: DB=${r.dbIcao} WD=${r.icaoWikidata}`)) : ''));
  console.log(`  nothing usable (stay empty): ${nothingUsable}`);
  console.log(`  ambiguous IATA (multi-entity, auto-picked): ${resolved.filter(r=>r.ambiguous).length}`);

  console.log(`\n[2] 12 deferred operators:`);
  for (const d of deferredResults) console.log(`  ${d.status.padEnd(13)} ${d.name}` + (d.resolved ? ` -> iata=${d.resolved.iata||'—'} icao=${d.resolved.icao||'—'} country=${d.resolved.country||'—'} hq=${d.resolved.hq||'—'}` : ''));
  const di = deferredResults.filter(d=>d.status==='iata+icao').length, dc = deferredResults.filter(d=>d.status==='icao-only').length, du = deferredResults.filter(d=>d.status==='unresolvable'||d.status==='iata-only').length;
  console.log(`  summary: iata+icao=${di}  icao-only=${dc}  drop/unresolvable=${du}`);

  console.log(`\n[3] Fleet JSON: ${fleetKeys.length} airlines have curated fleet; remaining ${dbAirlines.length - fleetKeys.length} intentionally empty (long tail).`);
  for (const k of ['FR','EK','LH','DL','CA']) console.log(`  ${k}: ${JSON.stringify(fleet[k])}`);

  console.log(`\n[4] Sample dry-run patches (10 of ${patches.length}):`);
  const sample = patches.sort(() => Math.random() - 0.5).slice(0, 10);
  for (const p of sample) console.log(`  ${p.name} (${p.iata||p.icao}): ${JSON.stringify(p.patch)}`);
  const leak = patches.filter((p) => Object.keys(p.patch).some((k) => COMMUNITY_ONLY.includes(k) || !ENRICHABLE.includes(k)));
  console.log(`\n  community-only / non-enrichable fields appearing in ANY patch: ${leak.length} (must be 0)`);
  console.log(`  total airlines that would receive a patch: ${patches.length}`);
  console.log('\nArtifacts written: data/wikidata-airlines.json, data/wikidata-deferred.json, data/enrichment-patches-preview.json');
  console.log('NO DATABASE WRITES PERFORMED.');
  await prisma.$disconnect();
})();
