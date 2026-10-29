#!/usr/bin/env node
// Follow-up dry run: the 7-day burst rule.
//
// An aggregator reposts one vacancy over and over under slightly reworded
// titles. Pass 1 caught the pairs that look alike; this catches the rest by
// their shape instead: the same airline advertising the same rank on the same
// feed inside one week is one campaign, not five jobs.
//
// Deliberately narrow — every one of these has to hold:
//   airline  resolved to a real airline (never a recruiter, never "Confidential")
//   rank     the same normalised rank (CPT ≠ SFO ≠ FO ≠ CADET ≠ INSTRUCTOR …)
//   kind     flying ≠ ground/simulator — a sim instructor is not a line pilot
//   source   the same feed, so two independent sightings are never collapsed
//   window   postedAt within 7 days of the cluster's first row
// and the rule-C guards still apply on top: a named fleet word, an aircraft
// model or a place in the title must not disagree.
//
// Writes nothing. Produces a markdown document for review.
const fs = require('fs');
const prisma = require('../src/config/database');
const { makeResolver, identityOf, isRecruiter, companyKey } = require('../src/scrapers/jobIdentity');

const WINDOW_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// A ground/simulator role is a different kind of vacancy from a line one, even
// when the rank word is the same.
const GROUND_RE = /\b(synthetic|simulator|sim|ground|classroom|desk|office|training\s+centre|training\s+center)\b/;
const kindOf = (title) => (GROUND_RE.test(fold(title)) ? 'ground' : 'flying');

// Rule-C guards. "globals" (the Bombardier fleet, plural) counts as a fleet
// word; a bare "Global" does not — it is marketing in half these titles.
const FLEET_WORDS = ['airbus', 'boeing', 'embraer', 'bombardier', 'atr', 'dash', 'gulfstream', 'falcon', 'challenger', 'citation', 'legacy', 'praetor', 'phenom', 'learjet', 'hawker', 'king air', 'globals', 'global 6000', 'global 7500', 'bd700'];
const fleetWordsOf = (title) => FLEET_WORDS.filter((w) => fold(title).includes(w)).sort();

// "Boeing 737" and "B737" are the same aeroplane written two ways, and the
// first dry run merged an A320 Captain with a 737 Captain because only one of
// them matched the old pattern. Both now reduce to the same token.
const MODEL_RES = [
  [/\b(?:airbus\s*)?a\s?-?(\d{3})\b/g, (m) => `a${m}`],
  [/\b(?:boeing\s*)?b?\s?-?(7[0-9]7|7[0-9]{2})\b/g, (m) => `b${m}`],
  [/\b(?:embraer\s*)?e-?(1?\d{2})\b/g, (m) => `e${m}`],
  [/\bcrj\s?-?(\d{3})\b/g, (m) => `crj${m}`],
  [/\batr\s?-?(\d{2})\b/g, (m) => `atr${m}`],
  [/\bdhc-?(\d)\b/g, (m) => `dhc${m}`],
  [/\bmd-?(\d{2})\b/g, (m) => `md${m}`],
  [/\b(q400)\b/g, () => 'q400'],
];
function modelsOf(title) {
  const t = fold(title); const found = new Set();
  for (const [re, mk] of MODEL_RES) { let m; re.lastIndex = 0; while ((m = re.exec(t))) found.add(mk(m[1])); }
  return [...found].sort();
}
// A manufacturer named on one side and a model on the other still disagree:
// "Boeing 737 Captains" vs "A320 Captain" are two fleets, two vacancies.
const FAMILY = [[/^a\d{3}$/, 'airbus'], [/^b7/, 'boeing'], [/^e\d/, 'embraer'], [/^crj|^q400|^challenger|^global/, 'bombardier'], [/^atr/, 'atr'], [/^dhc/, 'dash'], [/^md/, 'mcdonnell']];
const familyOf = (tok) => (FAMILY.find(([re]) => re.test(tok)) || [, null])[1];
function familiesOf(j) {
  const fam = new Set();
  for (const w of j.fleet) fam.add(familyOf(w.replace(/\s.*/, '')) || w.replace(/\s.*/, ''));
  for (const m of j.models) { const f = familyOf(m); if (f) fam.add(f); }
  return [...fam].sort();
}

const PLACE_RE = /\b(dubai|abu dhabi|doha|riyadh|jeddah|cairo|london|farnborough|luton|paris|nice|geneva|zurich|vienna|madrid|barcelona|lisbon|milan|rome|venezia|venice|amsterdam|brussels|frankfurt|munich|berlin|oslo|bodo|stockholm|copenhagen|helsinki|dublin|gatwick|heathrow|singapore|hong kong|bangkok|toronto|vancouver|winnipeg|miami|teterboro|new york|michigan|pontiac|phoenix|dallas|denver|seattle|sydney|melbourne|brisbane|perth|adelaide|cairns|darwin|auckland)\b/g;
const placesOf = (title) => [...new Set(fold(title).match(PLACE_RE) || [])].sort();

// A named entry programme is its own campaign. Emirates runs Direct Entry and
// Accelerated Command side by side and they are not the same vacancy.
const PROGRAMMES = [[/\baccelerated\s+command\b/, 'accelerated command'], [/\bdirect\s+entry\b/, 'direct entry'], [/\b(cadet|ab[- ]?initio)\b/, 'cadet']];
const programmesOf = (title) => PROGRAMMES.filter(([re]) => re.test(fold(title))).map(([, n]) => n).sort();

const same = (a, b) => a.join('|') === b.join('|');
/** Do two rows disagree on anything rule C says they must agree on? */
function guardsConflict(a, b) {
  const fa = familiesOf(a); const fb = familiesOf(b);
  if (fa.length && fb.length && !same(fa, fb)) return 'aircraft family';
  if (a.fleet.length && b.fleet.length && !same(a.fleet, b.fleet)) return 'fleet word';
  if (a.models.length && b.models.length && !same(a.models, b.models)) return 'aircraft model';
  if (a.places.length && b.places.length && !same(a.places, b.places)) return 'place in title';
  if (a.programmes.length && b.programmes.length && !same(a.programmes, b.programmes)) return 'entry programme';
  return null;
}

// The row that survives: a direct-ATS posting over an operator page over an
// aggregator, then the earliest sighting, then the fullest description.
const SOURCE_RANK = { direct_ats: 0, operator_direct: 1, aggregator: 2 };
// A "multiple roles available" ad is a notice board, not a vacancy, so it never
// becomes the row the cluster is shown under if a plain one exists.
const CATCHALL_RE = /\b(multiple roles|various roles|several (positions|roles)|all ranks|pilot recruitment|talent pool|register your interest|expression of interest)\b/;
function pickCanonical(rows) {
  return [...rows].sort((x, y) =>
    (SOURCE_RANK[x.sourceType] ?? 3) - (SOURCE_RANK[y.sourceType] ?? 3)
    || (CATCHALL_RE.test(fold(x.title)) ? 1 : 0) - (CATCHALL_RE.test(fold(y.title)) ? 1 : 0)
    || new Date(x.postedAt) - new Date(y.postedAt)
    || (y.description || '').length - (x.description || '').length)[0];
}

const short = (id) => id.slice(0, 8);
const row = (j) => `${short(j.id)} "${j.title}" — ${j.sourcePlatform || '—'}, ${j.location || '—'}, posted ${new Date(j.postedAt).toISOString().slice(0, 10)}`;

(async () => {
  const [jobs, airlines] = await Promise.all([
    prisma.job.findMany({
      where: { status: 'ACTIVE', mergedInto: null },
      select: { id: true, title: true, titleEn: true, company: true, description: true, location: true, country: true, sourcePlatform: true, sourceType: true, postedAt: true },
      orderBy: { postedAt: 'asc' },
    }),
    prisma.airline.findMany({ select: { name: true, country: true, headquarters: true, bases: true } }),
  ]);
  const resolver = makeResolver(airlines);

  const out = [];
  const say = (s = '') => { out.push(s); console.log(s); };
  say('# Burst dry run — follow-up');
  say(`snapshot: ${new Date().toISOString()}`);
  say(`visible ACTIVE vacancies: ${jobs.length}`);
  say(`window: ${WINDOW_DAYS} days · limits: same airline + rank + kind + source feed`);
  say();

  // Group by the four limits.
  const groups = new Map();
  const notAirline = [];
  for (const j of jobs) {
    const title = j.titleEn || j.title || '';
    const ident = identityOf(j, resolver);
    // Real airlines only. A recruiter or a "Confidential" byline can carry two
    // genuinely different clients' vacancies under one name.
    if (isRecruiter(j.company) || ident.employer.via === 'company-asis') { notAirline.push(j); continue; }
    const key = [companyKey(ident.employer.name), ident.rank, kindOf(title), j.sourcePlatform || '—'].join('|');
    const enriched = { ...j, title, airline: ident.employer.name, rank: ident.rank, kind: kindOf(title), fleet: fleetWordsOf(title), models: modelsOf(title), places: placesOf(title), programmes: programmesOf(title) };
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(enriched);
  }

  // Inside a group, walk the rows in date order and open a new cluster whenever
  // a row falls outside the running 7-day window or trips a guard.
  const clusters = [];
  const held = [];
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    let bucket = [rows[0]];
    // One disagreeing row should cost one row, not the whole cluster: the
    // canonical is chosen first, then anything that contradicts it is set aside
    // and reported rather than merged.
    const flush = () => {
      if (bucket.length < 2) return;
      const w = pickCanonical(bucket);
      const keep = [w]; const out_ = [];
      for (const r of bucket) {
        if (r.id === w.id) continue;
        const c = guardsConflict(w, r);
        if (c) out_.push({ row: r, against: w, reason: c }); else keep.push(r);
      }
      if (out_.length) held.push({ key, airline: w.airline, out: out_ });
      if (keep.length >= 2) clusters.push({ key, rows: keep, canonical: w });
    };
    for (const r of rows.slice(1)) {
      if (new Date(r.postedAt) - new Date(bucket[0].postedAt) <= WINDOW_DAYS * DAY) bucket.push(r);
      else { flush(); bucket = [r]; }
    }
    flush();
  }

  const merges = clusters.reduce((n, c) => n + c.rows.length - 1, 0);
  say(`## Summary`);
  say(`clusters the burst rule would collapse: ${clusters.length}`);
  say(`rows merged away: ${merges}  →  ${jobs.length - merges} visible vacancies`);
  say(`rows a rule-C guard kept out: ${held.reduce((n, h) => n + h.out.length, 0)}`);
  say(`rows skipped because the employer is a recruiter or unresolved: ${notAirline.length}`);
  say();

  say('## Every merge it proposes');
  if (!clusters.length) say('_none_');
  for (const c of clusters.sort((a, b) => b.rows.length - a.rows.length)) {
    const w = c.canonical;
    const [, rank, kind] = c.key.split('|');
    say();
    say(`### ${w.airline} · ${c.rows.length} → 1 · rank=${rank} kind=${kind} feed=${w.sourcePlatform}`);
    say(`- KEEP  \`${w.id}\` ${row(w).slice(9)}`);
    for (const r of c.rows.filter((x) => x.id !== w.id)) say(`- merge \`${r.id}\` ${row(r).slice(9)}`);
  }
  say();

  say('## Rows a guard kept out (shown so you can overrule)');
  const heldRows = held.reduce((n, h) => n + h.out.length, 0);
  if (!heldRows) say('_none_');
  for (const h of held) {
    say();
    say(`### ${h.airline}`);
    for (const o of h.out) {
      say(`- kept out \`${o.row.id}\` ${row(o.row).slice(9)}`);
      say(`  - would have joined \`${short(o.against.id)}\` "${o.against.title}" — ${o.reason} differs`);
    }
  }
  say();

  // ── The two rows you asked to see side by side ────────────────────────────
  say('## "Experienced Captain" vs the Avature Direct Entry Captain');
  const emiratesRows = jobs.filter((j) => {
    const ident = identityOf(j, resolver);
    return companyKey(ident.employer.name) === companyKey('Emirates') || /\bemirates\b/i.test(j.company || '');
  });
  // Looked up across every status, not just the live feed: "Experienced
  // Captain" expired on its own between the two dry runs and the comparison is
  // still the thing you asked to see.
  const anyStatus = await prisma.job.findMany({
    where: { OR: [{ title: { contains: 'Experienced Captain' } }, { AND: [{ sourcePlatform: 'AVATURE' }, { title: { contains: 'Direct Entry Captain' } }] }] },
    select: { id: true, title: true, titleEn: true, company: true, description: true, location: true, country: true, sourcePlatform: true, sourceType: true, postedAt: true, status: true, mergedInto: true },
  });
  const pair = [
    anyStatus.find((j) => /experienced captain/i.test(j.titleEn || j.title) && /emirates/i.test(j.company || '')),
    anyStatus.find((j) => j.sourcePlatform === 'AVATURE' && /direct entry captain/i.test(j.titleEn || j.title)),
  ];
  if (pair.every(Boolean)) {
    say();
    say('| | "Experienced Captain" | Avature "Direct Entry Captain" |');
    say('| --- | --- | --- |');
    const cell = (v) => String(v ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 120);
    for (const [label, get] of [
      ['id', (j) => short(j.id)],
      ['status', (j) => (j.mergedInto ? `${j.status}, merged into ${short(j.mergedInto)}` : j.status)],
      ['company as filed', (j) => j.company],
      ['feed', (j) => j.sourcePlatform],
      ['source type', (j) => j.sourceType],
      ['location', (j) => `${j.location || '—'}${j.country ? `, ${j.country}` : ''}`],
      ['posted', (j) => new Date(j.postedAt).toISOString().slice(0, 10)],
      ['rank', (j) => identityOf(j, resolver).rank],
      ['description length', (j) => `${(j.description || '').length} chars`],
      ['description opens', (j) => (j.description || '').trim().slice(0, 110)],
    ]) say(`| ${label} | ${cell(get(pair[0]))} | ${cell(get(pair[1]))} |`);
    say();
    const sameFeed = pair[0].sourcePlatform === pair[1].sourcePlatform;
    say('Same airline, same rank (CPT), no aircraft type on either side, no place in either title.');
    say(`They sit on ${sameFeed ? 'the same feed' : 'different feeds'}, so the burst rule ${sameFeed ? 'would' : 'would NOT'} collapse them — the source limit is what keeps two independent sightings of a vacancy apart.`);
    if (pair.some((j) => j.status !== 'ACTIVE')) say('One of the two is no longer live, so nothing here is pending either way; it is shown because you asked to see them side by side.');
  } else {
    say('_one or both rows are no longer in the live feed_');
  }
  say();

  // ── The generic standing-campaign row ─────────────────────────────────────
  say('## The generic Emirates row');
  const generic = emiratesRows.find((j) => /^(piloto global|global pilot)/i.test(j.titleEn || j.title));
  if (generic) {
    say();
    say(`- \`${generic.id}\``);
    say(`- title now: "${generic.title}"${generic.titleEn ? ` (titleEn: "${generic.titleEn}")` : ''}`);
    say('- proposed title: "Pilot recruitment (general)"');
    say('- It is not one vacancy. It is the row the rewritten generic ads collapse into, so it should say so rather than read as a job.');
  } else {
    say('_not in the live feed_');
  }
  say();

  say('## Emirates — every row now visible');
  say();
  say('| row | title | feed | rank | after the burst rule |');
  say('| --- | --- | --- | --- | --- |');
  const burstLosers = new Map();
  for (const c of clusters) for (const r of c.rows) if (r.id !== c.canonical.id) burstLosers.set(r.id, c.canonical.id);
  for (const j of emiratesRows) {
    const t = (j.titleEn || j.title).replace(/\|/g, '\\|');
    const lost = burstLosers.get(j.id);
    say(`| \`${short(j.id)}\` | ${t} | ${j.sourcePlatform} | ${identityOf(j, resolver).rank} | ${lost ? `merged into ${short(lost)}` : 'STAYS'} |`);
  }
  const emiratesAfter = emiratesRows.filter((j) => !burstLosers.has(j.id)).length;
  say();
  say(`Emirates: ${emiratesRows.length} rows → ${emiratesAfter} visible vacancies`);

  say();
  say('## Calls worth overruling');
  say();
  say('- **A place in one title and none in the other does not block a merge.** "Perth-Based First Officer – Regional Airline (FIFO)" joins the Qantas cluster because the other four name no place. A reworded repost usually drops the city, so this is deliberate — but if Perth is a genuinely separate base, say so and it comes out.');
  say('- **The source limit keeps the same vacancy apart across feeds.** Emirates `755575e1` (Adzuna "First Officer - Pilot") stays beside the WhatJobs First Officer cluster, and the Avature Direct Entry Captain stays beside the WhatJobs one. Pass 1 is what crosses feeds, on evidence; the burst rule never does, on shape alone.');
  say('- **Air Dolomiti has two clusters a fortnight apart** (13–14 Oct and 27 Oct) for what reads as one campaign. The 7-day window keeps them separate. Widening the window would join them; it would also start joining genuinely new intakes.');
  say();

  const dest = process.argv[2];
  if (dest) { fs.writeFileSync(dest, `${out.join('\n')}\n`); console.error(`\nwritten to ${dest}`); }
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
