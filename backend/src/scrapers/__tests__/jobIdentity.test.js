'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { rankOf, typesOf, baseOf, variantOf, makeResolver, identityOf, companyKey, shouldAutoMerge } = require('../jobIdentity');

// Small airline fact-set used by the resolver tests (name · country · bases).
const AIRLINES = [
  { name: 'DHL Air', country: 'United Kingdom', bases: ['East Midlands'] },
  { name: 'Scandinavian Airlines', country: 'Sweden', bases: ['Stockholm'] },
  { name: 'Emirates', country: 'United Arab Emirates', bases: ['Dubai'] },
  { name: 'Clay Lacy Aviation', country: 'United States', bases: ['Van Nuys'] },
  { name: 'Global Medical Response', country: 'United States', bases: [] },
  { name: 'Guardian Flight', country: 'United States', bases: [] },
  { name: 'Flexjet', country: 'United States', bases: ['Cleveland'] },
  { name: 'Air Canada', country: 'Canada', bases: ['Toronto'] },
  { name: 'VistaJet', country: 'Malta', bases: ['Malta'] },
  { name: 'Luxaviation', country: 'Luxembourg', bases: ['Luxembourg'] },
  { name: 'Jet Time', country: 'Denmark', bases: ['Copenhagen'] },
  { name: 'Global Jet Luxembourg', country: 'Luxembourg', bases: ['Luxembourg'] },
  { name: 'Qantas', country: 'Australia', bases: ['Sydney'] },
];
const resolver = () => makeResolver(AIRLINES);
const key = (job, r) => identityOf(job, r).key;
const same = (a, b, r) => key(a, r) === key(b, r);

// ── rank ─────────────────────────────────────────────────────────────────────
test('rankOf distinguishes examiner from instructor and the pilot grades', () => {
  assert.strictEqual(rankOf('Synthetic Flight Examiner – Boeing'), 'EXAMINER');
  assert.strictEqual(rankOf('Synthetic Flight Instructor – Boeing'), 'INSTRUCTOR');
  assert.strictEqual(rankOf('First Officer A320'), 'FO');
  assert.strictEqual(rankOf('Senior First Officer'), 'SFO');
  assert.strictEqual(rankOf('Direct Entry Captain'), 'CPT');
  assert.strictEqual(rankOf('Cadet Pilot Programme'), 'CADET');
  assert.notStrictEqual(rankOf('Examiner'), rankOf('Instructor'));
  // plural "First Officers" must still be FO (not fall through to generic PILOT)
  assert.strictEqual(rankOf('Direct Entry First Officers (Contract)'), 'FO');
  assert.notStrictEqual(rankOf('Direct Entry First Officers (Contract)'), rankOf('Pilot — Singapore Airlines'));
});

// ── aircraft type: manufacturer words + distinct variants ────────────────────
test('typesOf reads manufacturer words and keeps variants distinct', () => {
  assert.deepStrictEqual(typesOf('Synthetic Flight Examiner – Boeing', ''), ['BOEING']);
  assert.deepStrictEqual(typesOf('Synthetic Flight Examiner – Airbus', ''), ['AIRBUS']);
  assert.notDeepStrictEqual(typesOf('Captain – Boeing', ''), typesOf('Captain – Airbus', ''));
  // GV ≠ G600
  assert.deepStrictEqual(typesOf('Pilot: Captain - Gulfstream GV | KAUS', ''), ['GV']);
  assert.deepStrictEqual(typesOf('Pilot: Captain - Gulfstream G600 | KSJC', ''), ['G600']);
  assert.ok(!same({ title: 'Captain - Gulfstream GV' }, { title: 'Captain - Gulfstream G600' }));
  // Legacy 600 ≠ Legacy 650
  assert.deepStrictEqual(typesOf('Legacy 650 Captain', ''), ['LEGACY650']);
  assert.deepStrictEqual(typesOf('Legacy 600 Captain', ''), ['LEGACY600']);
  // specific model beats the bare manufacturer fallback (no double-count)
  assert.deepStrictEqual(typesOf('Boeing 777 First Officer', ''), ['B777']);
  assert.deepStrictEqual(typesOf('First Officer A350', ''), ['A350']);
  // type can come from the description, not just the title
  assert.deepStrictEqual(typesOf('First Officer', 'Join our Boeing 777 fleet.'), ['B777']);
});

// ── base: city/airport, single-airport-country collapse, country fallback ────
test('baseOf prefers ICAO, treats single-airport countries as one base', () => {
  // Clay Lacy: ICAO in the location/title → distinct per airport
  assert.strictEqual(baseOf('Captain - Gulfstream G600 | KSJC', '', 'KSJC - San Jose', 'United States').base, 'KSJC');
  assert.strictEqual(baseOf('Captain - Gulfstream G600 | KVNY', '', 'KVNY - Van Nuys', 'United States').base, 'KVNY');
  assert.notStrictEqual(baseOf('x | KSJC', '', 'KSJC - a', 'US').base, baseOf('x | KVNY', '', 'KVNY - b', 'US').base);
  // single-airport country with NO distinct city named → the country IS the base
  assert.strictEqual(baseOf('B767 First Officer', '', 'Bahrain', 'Bahrain').base, 'bahrain');
  assert.strictEqual(baseOf('B767 First Officer', '', '', 'Bahrain').base, 'bahrain');
  // GMR: distinct US towns stay distinct
  assert.notStrictEqual(baseOf('Fixed Wing Pilot', '', 'Amarillo, Potter County', 'United States').base, baseOf('Fixed Wing Pilot', '', 'Goodland, Sherman County', 'United States').base);
  // "X-based" phrasing in the title
  assert.strictEqual(baseOf('Captain Falcon 2000 Marseille-Based', '', '', 'France').base, 'marseille');
});

// ── C#4: a named location WINS over the country; never substitute HQ/home country ─
test('baseOf C#4 — named location beats a mislabelled country; unresolvable → unknown', () => {
  // "Dubai, Dubai" (repeated) with country=Luxembourg (company HQ, mislabelled)
  // → dedupe to Dubai, and Dubai wins over the Luxembourg single-airport rule.
  assert.strictEqual(baseOf('First Officer - Lineage', '', 'Dubai, Dubai', 'Luxembourg').base, 'dubai');
  // The correctly-tagged sibling (country=UAE) already resolves to Dubai — so the
  // two now share a base instead of splitting dubai vs luxembourg.
  assert.strictEqual(baseOf('First Officer - Lineage', '', 'Dubai', 'UAE').base, 'dubai');
  assert.strictEqual(
    baseOf('First Officer - Lineage', '', 'Dubai, Dubai', 'Luxembourg').base,
    baseOf('First Officer - Lineage', '', 'Dubai', 'UAE').base,
  );
  // Unresolvable location (no city, multi-airport country only) → unknown, NOT the country.
  const unk = baseOf('First Officer', '', '', 'Germany');
  assert.strictEqual(unk.base, '');
  assert.strictEqual(unk.kind, 'unknown');
});

// ── variant: programme / eligibility / rated ─────────────────────────────────
test('variantOf separates programmes, eligibility groups and rated-status', () => {
  assert.notStrictEqual(variantOf('Accelerated Command Programme', ''), variantOf('First Officer', ''));
  assert.notStrictEqual(variantOf('Cadet Pilot Pathway', ''), variantOf('First Officer', ''));
  assert.notStrictEqual(variantOf('First Officer — for AC Express Pilots only', ''), variantOf('First Officer — for non AC-Express Pilots only', ''));
  assert.notStrictEqual(variantOf('CL605 First Officer Non-Rated', ''), variantOf('CL605 First Officer Type Rated', ''));
});

// ── MUST NOT MERGE (every case the review flagged) ───────────────────────────
test('Emirates examiner/instructor × Boeing/Airbus = 4 distinct jobs', () => {
  const r = resolver();
  const jobs = [
    { company: 'Emirates', title: 'Synthetic Flight Examiner – Boeing', country: 'United Arab Emirates' },
    { company: 'Emirates', title: 'Synthetic Flight Examiner – Airbus', country: 'United Arab Emirates' },
    { company: 'Emirates', title: 'Synthetic Flight Instructor – Boeing', country: 'United Arab Emirates' },
    { company: 'Emirates', title: 'Synthetic Flight Instructor – Airbus', country: 'United Arab Emirates' },
  ];
  const keys = new Set(jobs.map((j) => key(j, r)));
  assert.strictEqual(keys.size, 4);
});

test('Clay Lacy G600 ×3 airports + GV = 4 distinct jobs', () => {
  const r = resolver();
  const jobs = [
    { company: 'Clay Lacy Aviation', title: 'Pilot: Captain - Gulfstream G600 | KSJC', location: 'KSJC - San Jose', country: 'United States' },
    { company: 'Clay Lacy Aviation', title: 'Pilot: Captain - Gulfstream G600 | KVNY', location: 'KVNY - Van Nuys', country: 'United States' },
    { company: 'Clay Lacy Aviation', title: 'Pilot: Captain - Gulfstream G600 | KOXC', location: 'KOXC - Oxford', country: 'United States' },
    { company: 'Clay Lacy Aviation', title: 'Pilot: Captain - Gulfstream GV | KAUS', location: 'KAUS - Austin', country: 'United States' },
  ];
  assert.strictEqual(new Set(jobs.map((j) => key(j, r))).size, 4);
});

test('Global Medical Response / Guardian Flight fixed-wing per town = distinct', () => {
  const r = resolver();
  const gmr = ['Amarillo, Potter County', 'Goodland, Sherman County', 'Slaton, Lubbock County']
    .map((loc) => ({ company: 'Global Medical Response', title: 'Fixed Wing Pilot', location: loc, country: 'United States' }));
  assert.strictEqual(new Set(gmr.map((j) => key(j, r))).size, 3);
});

test('Flexjet Europe (Farnborough) ≠ Flexjet US (Richardson)', () => {
  const r = resolver();
  const eu = { company: 'Flexjet', title: 'First Officer', location: 'Farnborough', country: 'United Kingdom' };
  const us = { company: 'Flexjet', title: 'First Officer', location: 'Richardson, Texas', country: 'United States' };
  assert.ok(!same(eu, us, r));
});

test('Air Canada "for AC Express pilots only" ≠ "for non AC-Express pilots only"', () => {
  const r = resolver();
  const a = { company: 'Air Canada', title: 'First Officer — for AC Express Pilots only', country: 'Canada' };
  const b = { company: 'Air Canada', title: 'First Officer — for non AC-Express Pilots only', country: 'Canada' };
  assert.ok(!same(a, b, r));
});

test('airx CL604/605 FO Non-rated ≠ Type Rated', () => {
  const r = resolver();
  const nr = { company: 'airx', title: 'CL604/605 First Officer – Non-Rated', country: 'Malta' };
  const tr = { company: 'airx', title: 'CL604/605 First Officer – Type Rated', country: 'Malta' };
  assert.ok(!same(nr, tr, r));
});

test('VistaJet Instructor Cadet Pathway ≠ Private Jet First Officer XLS', () => {
  const r = resolver();
  const a = { company: 'VistaJet', title: 'Multi-Engine Instructor – Cadet Pathway', country: 'Malta' };
  const b = { company: 'VistaJet', title: 'Private Jet First Officer – Citation XLS', country: 'Malta' };
  assert.ok(!same(a, b, r));
});

test('Emirates Accelerated Command ≠ general Pilot/First Officer', () => {
  const r = resolver();
  const a = { company: 'Emirates', title: 'Accelerated Command Programme', country: 'United Arab Emirates' };
  const b = { company: 'Emirates', title: 'First Officer', country: 'United Arab Emirates' };
  assert.ok(!same(a, b, r));
});

test('Luxaviation Legacy 650 Captain (Luxembourg) ≠ Legacy 600 Captain (London)', () => {
  const r = resolver();
  const lux = { company: 'Luxaviation', title: 'Legacy 650 Captain', location: 'Luxembourg', country: 'Luxembourg' };
  const lon = { company: 'Luxaviation', title: 'Legacy 600 Captain – London based', location: 'London', country: 'United Kingdom' };
  assert.ok(!same(lux, lon, r));
});

// ── MUST MERGE (recruiter reposts of one real job) ───────────────────────────
test('DHL Air Bahrain B767 FO reposts collapse to one job', () => {
  const r = resolver();
  // Reposts whose TITLE names the operator collapse (title-only resolution).
  const jobs = [
    { company: 'DHL', title: 'Boeing 767 First Officer – DHL Air Bahrain', location: 'Manama', country: 'Bahrain', description: 'x' },
    { company: 'Pilot Assessments', title: 'Boeing 767 First Officer – DHL Air Bahrain (Talent Pool)', location: 'Muharraq', country: 'Bahrain', description: 'x' },
    { company: 'DHL Express', title: 'DHL Air Bahrain — B767 First Officer', location: 'Muharraq', country: 'Bahrain', description: 'x' },
  ];
  assert.strictEqual(new Set(jobs.map((j) => key(j, r))).size, 1);
});

test('SAS direct + recruiter repost both resolve to the airline and merge', () => {
  const r = resolver();
  const direct = { company: 'Scandinavian Airlines', title: 'Direct Entry First Officer A320', location: 'Stockholm', country: 'Sweden', sourceType: 'operator_direct' };
  const repost = { company: 'AeroProfessional', title: 'First Officer A320 – fly for SAS Scandinavian Airlines', location: 'Stockholm', country: 'Sweden' };
  assert.ok(same(direct, repost, r));
});

// ── resolver: conservative, never incidental ────────────────────────────────
test('resolver maps only on explicit naming — "Global Jet Luxembourg" ≠ Jet Time', () => {
  const r = resolver();
  const res = r.resolve('Global Jet Luxembourg', 'Captain Falcon 2000 | Marseille-based | 3000 hours jet time required');
  assert.strictEqual(res.name, 'Global Jet Luxembourg');
  assert.notStrictEqual(res.name, 'Jet Time');
});

test('resolver does NOT fire on an incidental "jet time" flight-hours phrase', () => {
  const r = resolver();
  const res = r.resolve('Some Recruiter', 'First Officer, minimum 500 hours jet time on type.');
  assert.notStrictEqual(res.name, 'Jet Time'); // "Jet Time" is a common phrase → never text-matched
});

// ── Round-2 review fixes (B / C / E) ─────────────────────────────────────────
test('types read from TITLE first — a description fleet-list does not pollute', () => {
  assert.deepStrictEqual(typesOf('Captain - Global 8000', 'We also operate the Global 7500 and Challenger 350.'), ['GLOBAL8000']);
  // airx Challenger 850: "CRJ-200" mention in the body must not appear
  assert.deepStrictEqual(typesOf('First Officer - Challenger 850', 'CRJ-200 derivative platform.'), ['CL850']);
});

test('new bizjet types: Lineage, Praetor, C525/CJ', () => {
  assert.deepStrictEqual(typesOf('First Officer - Lineage 1000', ''), ['LINEAGE']);
  assert.deepStrictEqual(typesOf('First Officer C525/CJ Type', ''), ['CITATION_CJ']);
  assert.deepStrictEqual(typesOf('First Officer, Praetor 600/EMB-550 Flight Deck', ''), ['PRAETOR600']);
  // Luxaviation: Lineage FO ≠ C525/CJ FO (same base) → different jobs
  const r = resolver();
  assert.ok(!same({ company: 'Luxaviation', title: 'First Officer - Lineage', country: 'Luxembourg' }, { company: 'Luxaviation', title: 'First Officer C525/CJ Type', country: 'Luxembourg' }, r));
});

test('rated status: title wins; ambiguous description ≠ an explicit non-rated title', () => {
  assert.strictEqual(variantOf('First Officer - Challenger 850 (Non-rated)', ''), 'non-rated');
  // body mentions both "type-rated" and "non-rated" → ambiguous, not "non-rated"
  assert.notStrictEqual(variantOf('Challenger 850 First Officer – Training & Growth', 'type-rated or non-rated welcome'), 'non-rated');
  // bare "highly rated" is not a rated signal
  assert.strictEqual(variantOf('First Officer - Lineage', 'a highly rated employer'), '');
});

test('programme variants from title: cadet / direct-entry / path-to-command', () => {
  const r = resolver();
  assert.ok(!same({ company: 'Qantas', title: 'QantasLink Direct Entry First Officer', country: 'Australia' }, { company: 'Qantas', title: 'Regional First Officer – Path to Command', country: 'Australia' }, r));
  // a general FO ad that merely mentions a cadet programme in its body is NOT a cadet job
  assert.strictEqual(variantOf('First Officer: Hands-on Flight Ops', 'a cadet programme is also available'), '');
});

test('seniority is part of rank — Senior Commercial Pilot ≠ Commercial Pilot', () => {
  assert.notStrictEqual(rankOf('Senior Commercial Pilot — Travel Benefits'), rankOf('Commercial Pilot Job Vacancy'));
});

test('employer resolves from TITLE only — a KLM mention in the body does not', () => {
  const r = makeResolver([...AIRLINES, { name: 'KLM', country: 'Netherlands', bases: ['Amsterdam'] }]);
  const res = r.resolve('Pilot Assessments', 'First Officer (Type-Rated) — Fleet Assignment by Seniority');
  assert.notStrictEqual(res.name, 'KLM'); // KLM only appears in the description
  assert.strictEqual(res.name, 'Pilot Assessments');
});

test('no partial-name mapping — Silver Air, LLC ≠ Silver Airways', () => {
  const r = makeResolver([...AIRLINES, { name: 'Silver Airways', country: 'United States', bases: ['Fort Lauderdale'] }]);
  const res = r.resolve('Silver Air, LLC', 'Dassault Falcon 900B First Officer');
  assert.notStrictEqual(res.name, 'Silver Airways');
});

test('companyKey normalises legal suffixes and slugs', () => {
  assert.strictEqual(companyKey('Jet Aviation Inc.'), companyKey('Jet Aviation'));
  assert.strictEqual(companyKey('Skyservice Business Aviation Inc.'), companyKey('Skyservice Business Aviation'));
  assert.strictEqual(companyKey('Luxaviation Group'), companyKey('Luxaviation'));
  assert.strictEqual(companyKey('AirX Charter'), companyKey('airx'));
});

// ── Round-3 review fixes ─────────────────────────────────────────────────────
test('type dictionary covers the titles that previously showed no type', () => {
  assert.deepStrictEqual(typesOf('B737NG First Officer', ''), ['B737']);
  assert.deepStrictEqual(typesOf('737-800 Captain', ''), ['B737']);
  assert.deepStrictEqual(typesOf('Captain F406/C425', ''), ['C425', 'F406']);
  assert.deepStrictEqual(typesOf('C208 Supervan Pilot', ''), ['C208']);
  assert.deepStrictEqual(typesOf('Grand Caravan Pilot', ''), ['C208']);
  assert.deepStrictEqual(typesOf('Cessna 172 Station Pilot', ''), ['C172']);
  assert.deepStrictEqual(typesOf('BN-2 Islander Pilot', ''), ['BN2']);
  assert.deepStrictEqual(typesOf('Saab 340 First Officer', ''), ['SAAB340']);
  assert.deepStrictEqual(typesOf('Saab 2000 Captain', ''), ['SAAB2000']);
  assert.deepStrictEqual(typesOf('Global Express First Officer', ''), ['GLOBALEXPRESS']);
});

test('companyKey collapses slug + generic-tail (Skyservice) but keeps brands distinct', () => {
  assert.strictEqual(companyKey('skyservice-english'), companyKey('Skyservice Business Aviation'));
  assert.strictEqual(companyKey('Leidos'), companyKey('Leidos LLC'));
  assert.strictEqual(companyKey('Pilatus Aircraft'), companyKey('Pilatus Aircraft Ltd'));
  assert.notStrictEqual(companyKey('LV Aero, LLC'), companyKey('Luxaviation')); // initials/abbrev never merge
});

test('recruiter-only clusters on a soft base are NOT auto-merged (could be different client airlines)', () => {
  const r = resolver();
  const members = (jobs) => jobs.map((j) => ({ company: j.company, ident: identityOf(j, r) }));
  // the three HOLD cases — all recruiter-labelled, type present, base country/office
  assert.strictEqual(shouldAutoMerge(members([
    { company: 'Aviation JobSearch Europa', title: 'B737NG First Officer - Middle East', location: 'Guildford', country: 'United Kingdom' },
    { company: 'Aviation JobSearch Europa', title: 'B737NG First Officer: Tax-Free Pay', location: 'Guildford', country: 'United Kingdom' },
  ])), false);
  assert.strictEqual(shouldAutoMerge(members([
    { company: 'Pilot Assessments', title: 'Global Express First Officer', country: 'Switzerland' },
    { company: 'Pilot Assessments', title: 'Elite Global Express First Officer', country: 'Switzerland' },
  ])), false);
  assert.strictEqual(shouldAutoMerge(members([
    { company: 'Pilot Assessments', title: 'BN-2 Islander First Officer', country: 'United Kingdom' },
    { company: 'Pilot Assessments', title: 'BN-2 Islander First Officer — Training', country: 'United Kingdom' },
  ])), false);
  // but an OPERATOR cluster with a type still merges, and recruiters sharing a hard ICAO base do
  assert.strictEqual(shouldAutoMerge(members([
    { company: 'Westair', title: 'Captain F406/C425', location: 'Johannesburg', country: 'South Africa' },
    { company: 'Westair', title: 'Flight Crew - Captain F406/C425', location: 'Johannesburg', country: 'South Africa' },
  ])), true);
});

test('non-type-rated title reads as non-rated (not ambiguous)', () => {
  assert.strictEqual(variantOf('Dash 8 First Officer – Non-Type Rated, Training Provided', ''), 'non-rated');
  // and a Dash 8 ad with no stated rated status stays unknown → will not merge with it
  assert.strictEqual(variantOf('Dash 8 First Officer — Regional Turboprop Training', ''), '');
});

test('resolver keeps DHL Air Bahrain distinct from DHL Air UK via base', () => {
  const r = resolver();
  const bah = { company: 'DHL', title: 'B767 First Officer', location: 'Manama', country: 'Bahrain', description: 'DHL Air Bahrain.' };
  const uk = { company: 'DHL', title: 'B767 First Officer', location: 'East Midlands', country: 'United Kingdom', description: 'DHL Air UK.' };
  assert.ok(!same(bah, uk, r)); // same employer, different base → different jobs
});

// ── C#8: NetJets-style regional FO postings never auto-merge ──────────────────
test('C#8 region variant + no-type/no-base guard keep regional postings apart', () => {
  // Different "X Region" → distinct variants → different identity keys.
  const west = identityOf({ title: 'Pilot (First Officer) - West Region', company: 'NetJets', location: '', country: 'United States' }, null);
  const east = identityOf({ title: 'Pilot (First Officer) - East Region', company: 'NetJets', location: '', country: 'United States' }, null);
  assert.notStrictEqual(west.key, east.key);
  // No type + no named base → not safe to auto-merge even within one key.
  const a = identityOf({ title: 'Concierge Private Pilot - First Officer', company: 'NetJets', location: '', country: 'United States' }, null);
  const b = identityOf({ title: 'Elite Private Aviation Pilot - First Officer', company: 'NetJets', location: '', country: 'United States' }, null);
  assert.strictEqual(a.key, b.key); // same weak key…
  assert.strictEqual(shouldAutoMerge([{ company: 'NetJets', ident: a }, { company: 'NetJets', ident: b }]), false); // …but HELD, never merged
});

// ── Guards added before the dedup rollout (2026-10-08) ──────────────────────
// Holding is the safe direction: an uncertain cluster stays live and visible.
// The ONLY way past a no-type or unknown-base hold is proof the two rows are the
// same ad — near-identical titles, or ≥90%-similar descriptions.
const { subBrandOf, diceSimilarity } = require('../jobIdentity');

test('no aircraft type on either side → HELD, unless the ads are provably the same', () => {
  const r = resolver();
  const m = (jobs) => jobs.map((j) => ({ company: j.company, ident: identityOf(j, r), title: j.title, description: j.description }));
  // the live Qantas pair: no type in either title, two different campaigns
  assert.strictEqual(shouldAutoMerge(m([
    { company: 'Qantas Group', title: 'First Officer: Regional Pilot — Home Bases in Australia', country: 'Australia', location: 'Victoria' },
    { company: 'Qantas Group', title: 'Direct Entry First Officer', country: 'Australia', location: 'Victoria' },
  ])), false);
  // same company, no type, but the SAME ad worded identically → still merges
  assert.strictEqual(shouldAutoMerge(m([
    { company: 'Porter Airlines', title: 'First Officer', country: 'Canada', location: 'Toronto' },
    { company: 'Porter Airlines', title: 'First Officer', country: 'Canada', location: 'Toronto' },
  ])), true);
});

test('unknown base ("?") → HELD, unless the ads are provably the same', () => {
  const r = resolver();
  const m = (jobs) => jobs.map((j) => ({ company: j.company, ident: identityOf(j, r), title: j.title, description: j.description }));
  // the live AirX pair: type is certain (CL604) but neither row names a base
  const held = m([
    { company: 'airx', title: 'Challenger CL604/605 First Officer – Growth & Training' },
    { company: 'airx', title: 'First Officer - Challenger CL604/605' },
  ]);
  assert.ok(!held[0].ident.base.base, 'precondition: base is unknown');
  assert.strictEqual(shouldAutoMerge(held), false);
  // identical titles with no base still merge — same ad, twice
  assert.strictEqual(shouldAutoMerge(m([
    { company: 'airx', title: 'Challenger CL604/605 First Officer' },
    { company: 'airx', title: 'Challenger CL604/605 First Officer' },
  ])), true);
});

test('a shared body releases an unknown-BASE hold, but never a no-TYPE hold', () => {
  const r = resolver();
  const body = 'We are recruiting a first officer for our corporate fleet. '
    + 'The successful candidate holds an ATPL, a valid Class 1 medical and ICAO English Level 4 or above. '
    + 'Minimum 1500 hours total time and 500 hours multi-engine. Roster is 15 days on, 15 days off, with travel provided.';
  const m = (jobs) => jobs.map((j) => ({ company: j.company, ident: identityOf(j, r), title: j.title, description: j.description, location: j.location, country: j.country }));
  // TYPE is pinned (CL604), base unknown, bodies match → the body is enough
  assert.strictEqual(shouldAutoMerge(m([
    { company: 'Acme Air', title: 'CL604 First Officer Wanted', description: body },
    { company: 'Acme Air', title: 'Join Us As A CL604 First Officer', description: `${body} Apply today.` },
  ])), true);
  // NO type: an identical body only proves a shared template. Perimeter ran the
  // same text for "Dash First Officer" and "Metro First Officer" — two fleets.
  assert.strictEqual(shouldAutoMerge(m([
    { company: 'Perimeter Aviation LP', title: 'Dash First Officer', description: body, location: 'Winnipeg' },
    { company: 'Perimeter Aviation LP', title: 'Metro First Officer', description: body, location: 'Winnipeg' },
  ])), false);
  // genuinely different bodies stay held even with a type
  assert.strictEqual(shouldAutoMerge(m([
    { company: 'Acme Air', title: 'CL604 First Officer Wanted', description: body },
    { company: 'Acme Air', title: 'CL604 First Officer Opening', description: 'Cabin crew opportunity in our Dubai office, no flying duties, shift work, customer service focus and a competitive salary package for the right person.' },
  ])), false);
});

test('QantasLink is a separate employer from Qantas', () => {
  const r = resolver();
  const parent = identityOf({ company: 'Qantas Group', title: 'First Officer: Regional Pilot — Home Bases in Australia', location: 'Victoria', country: 'Australia' }, r);
  const sub = identityOf({ company: 'Qantas Group', title: 'QantasLink Direct Entry First Officer', location: 'Victoria', country: 'Australia' }, r);
  assert.notStrictEqual(parent.key, sub.key, 'a QantasLink ad must not key to plain qantas');
  assert.match(sub.key, /^qantaslink\|/);
  assert.strictEqual(subBrandOf('Qantas Group', 'QantasLink Direct Entry First Officer').name, 'QantasLink');
  assert.strictEqual(subBrandOf('Qantas Group', 'Direct Entry First Officer'), null);
});

test('diceSimilarity: identical = 1, unrelated ≈ 0', () => {
  assert.strictEqual(diceSimilarity('first officer a320 dubai', 'first officer a320 dubai'), 1);
  assert.ok(diceSimilarity('first officer a320 dubai', 'cabin crew recruitment london') < 0.2);
});

test('a stated location difference vetoes the same-ad escape hatch', () => {
  const r = resolver();
  const body = 'Demonstration and sales support flying on the SR-series. '
    + 'Requires a commercial licence, instrument rating and 1000 hours total time. '
    + 'You will support customers, deliver aircraft and fly demo missions across the territory.';
  const m = (jobs) => jobs.map((j) => ({ company: j.company, ident: identityOf(j, r), title: j.title, description: j.description, location: j.location, country: j.country }));
  // the live Cirrus pair: one template, two countries — two jobs, not one
  assert.strictEqual(shouldAutoMerge(m([
    { company: 'Cirrus Aircraft', title: 'Sales Support Pilot - Germany', description: body, country: 'Germany' },
    { company: 'Cirrus Aircraft', title: 'Sales Support Pilot - Pontiac, Michigan', description: body, country: 'United States', location: 'Pontiac, Michigan' },
  ])), false);
  // same title, same place → one ad (titles carry the proof; no type needed)
  assert.strictEqual(shouldAutoMerge(m([
    { company: 'Cirrus Aircraft', title: 'Sales Support Pilot', description: body, country: 'Germany' },
    { company: 'Cirrus Aircraft', title: 'Sales Support Pilot', description: body, country: 'Germany' },
  ])), true);
  // a missing location is not a difference
  assert.strictEqual(shouldAutoMerge(m([
    { company: 'Cirrus Aircraft', title: 'Sales Support Pilot', description: body, country: 'Germany' },
    { company: 'Cirrus Aircraft', title: 'Sales Support Pilot', description: body },
  ])), true);
});

test('titleQualifier reads the trailing place/fleet suffix, and differing suffixes veto a merge', () => {
  const { titleQualifier } = require('../jobIdentity');
  assert.strictEqual(titleQualifier('Sales Support Pilot - Germany'), 'Germany');
  assert.strictEqual(titleQualifier('Sales Support Pilot - Pontiac, Michigan'), 'Pontiac, Michigan');
  assert.strictEqual(titleQualifier('Pilot In Command'), '');
  const r = resolver();
  const body = 'x'.repeat(260);
  const m = (jobs) => jobs.map((j) => ({ company: j.company, ident: identityOf(j, r), title: j.title, description: j.description, location: j.location, country: j.country }));
  // identical bodies, identical location column, different suffix → two jobs
  assert.strictEqual(shouldAutoMerge(m([
    { company: 'Cirrus Aircraft', title: 'Sales Support Pilot - Germany', description: body, location: 'US', country: 'US' },
    { company: 'Cirrus Aircraft', title: 'Sales Support Pilot - Pontiac, Michigan', description: body, location: 'US', country: 'US' },
  ])), false);
});
