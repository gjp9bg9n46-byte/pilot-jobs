'use strict';
/**
 * Wikidata fetch helpers for airline factfile enrichment (read-only).
 * Pulls IATA (P229), ICAO (P230), country (P17), HQ (P159), hubs (P113).
 * Requires a descriptive User-Agent or Wikidata returns 403.
 */
const SPARQL = 'https://query.wikidata.org/sparql';
const API = 'https://www.wikidata.org/w/api.php';
const UA = 'CockpitHire-FactfileEnrichment/1.0 (contact@cockpithire.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query) {
  const url = `${SPARQL}?format=json&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`SPARQL ${res.status}`);
  const j = await res.json();
  return j.results.bindings;
}

// Map a binding row → flat record.
function toRecord(b) {
  return {
    qid: b.airline?.value?.split('/').pop() || null,
    name: b.airlineLabel?.value || null,
    iata: b.iata?.value || null,
    icao: b.icao?.value || null,
    country: b.countryLabel?.value || null,
    hq: b.hqLabel?.value || null,
    hubs: b.hubs?.value ? b.hubs.value.split('|').filter(Boolean) : [],
  };
}

const FIELDS = `
  OPTIONAL { ?airline wdt:P230 ?icao. }
  OPTIONAL { ?airline wdt:P17 ?country. }
  OPTIONAL { ?airline wdt:P159 ?hq. }
  OPTIONAL { ?airline wdt:P113 ?hub. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en".
    ?country rdfs:label ?countryLabel. ?hq rdfs:label ?hqLabel.
    ?hub rdfs:label ?hubLabel. ?airline rdfs:label ?airlineLabel. }`;

// Fetch all entities sharing each IATA in `codes`. Returns array of records.
async function fetchByIata(codes) {
  const out = [];
  for (let i = 0; i < codes.length; i += 60) {
    const chunk = codes.slice(i, i + 60);
    const values = chunk.map((c) => `"${c}"`).join(' ');
    const q = `SELECT ?airline ?airlineLabel ?iata ?icao ?countryLabel ?hqLabel (GROUP_CONCAT(DISTINCT ?hubLabel;separator="|") AS ?hubs) WHERE {
      VALUES ?iata { ${values} } ?airline wdt:P229 ?iata. ${FIELDS}
    } GROUP BY ?airline ?airlineLabel ?iata ?icao ?countryLabel ?hqLabel`;
    const rows = await sparql(q);
    out.push(...rows.map(toRecord));
    await sleep(1200);
  }
  return out;
}

// Fetch entities by ICAO (for ICAO-only operators already in DB).
async function fetchByIcao(codes) {
  const out = [];
  for (let i = 0; i < codes.length; i += 60) {
    const chunk = codes.slice(i, i + 60);
    const values = chunk.map((c) => `"${c}"`).join(' ');
    const q = `SELECT ?airline ?airlineLabel ?iata ?icao ?countryLabel ?hqLabel (GROUP_CONCAT(DISTINCT ?hubLabel;separator="|") AS ?hubs) WHERE {
      VALUES ?icao { ${values} } ?airline wdt:P230 ?icao. OPTIONAL { ?airline wdt:P229 ?iata. }
      OPTIONAL { ?airline wdt:P17 ?country. } OPTIONAL { ?airline wdt:P159 ?hq. } OPTIONAL { ?airline wdt:P113 ?hub. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en".
        ?country rdfs:label ?countryLabel. ?hq rdfs:label ?hqLabel. ?hub rdfs:label ?hubLabel. ?airline rdfs:label ?airlineLabel. }
    } GROUP BY ?airline ?airlineLabel ?iata ?icao ?countryLabel ?hqLabel`;
    const rows = await sparql(q);
    out.push(...rows.map(toRecord));
    await sleep(1200);
  }
  return out;
}

// Resolve an airline Q-ID by name search (wbsearchentities).
async function searchByName(name) {
  const url = `${API}?action=wbsearchentities&format=json&language=en&type=item&limit=5&search=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const j = await res.json();
  return (j.search || []).map((s) => ({ qid: s.id, label: s.label, description: s.description || '' }));
}

// Fetch the fields for a specific Q-ID.
async function fetchByQid(qid) {
  const q = `SELECT ?airline ?airlineLabel ?iata ?icao ?countryLabel ?hqLabel (GROUP_CONCAT(DISTINCT ?hubLabel;separator="|") AS ?hubs) WHERE {
    VALUES ?airline { wd:${qid} } OPTIONAL { ?airline wdt:P229 ?iata. } ${FIELDS}
  } GROUP BY ?airline ?airlineLabel ?iata ?icao ?countryLabel ?hqLabel`;
  const rows = await sparql(q);
  return rows.length ? toRecord(rows[0]) : null;
}

// Normalize a name for fuzzy matching (lowercase, strip punctuation/suffixes).
function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Among candidate records sharing an IATA, pick the best match to dbName.
function disambiguate(candidates, dbName) {
  if (!candidates.length) return { chosen: null, ambiguous: false, candidateNames: [] };
  const names = candidates.map((c) => c.name);
  if (candidates.length === 1) return { chosen: candidates[0], ambiguous: false, candidateNames: names };
  const dn = norm(dbName);
  // 1) exact normalized name match
  let best = candidates.find((c) => norm(c.name) === dn);
  // 2) name contains / contained
  if (!best) best = candidates.find((c) => norm(c.name).includes(dn) || dn.includes(norm(c.name)));
  // 3) richest record (has HQ, most hubs)
  if (!best) best = [...candidates].sort((a, b) => (b.hubs.length + (b.hq ? 1 : 0)) - (a.hubs.length + (a.hq ? 1 : 0)))[0];
  return { chosen: best, ambiguous: true, candidateNames: names };
}

module.exports = { fetchByIata, fetchByIcao, searchByName, fetchByQid, disambiguate, norm, sleep };
