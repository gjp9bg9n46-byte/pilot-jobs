'use strict';

/**
 * Deduplication logic.
 *
 * Two levels:
 *
 * 1. Same-source dedup (handled by the upsert in runner.js via the
 *    @@unique([sourcePlatform, externalId]) constraint — not this file).
 *
 * 2. Cross-source dedup: if two jobs from different sources look like the
 *    same posting (same company + normalised title + normalised location),
 *    keep the one with the richer description and mark the other's
 *    mergedInto field pointing at the canonical row's ID.
 *
 * Called by runner.js after all sources have been upserted in a run.
 */

const prisma = require('../config/database');
const logger = require('../config/logger');
const { normalizeCompany, coreCompanyKey } = require('../services/airlineEnrichmentService');
const { sourceTypeRank } = require('./sourceType');

function normaliseKey(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Pick the canonical row for a group of cross-source duplicates.
 * Ranks the apply destination FIRST (direct_ats > operator_direct > aggregator),
 * description length only as a tiebreak — so a direct-ATS row displaces its
 * aggregator clone even when the aggregator's description is longer. Pure +
 * non-mutating so it's unit-testable.
 *
 * @param {Array<{sourceType?:string, description?:string}>} group
 * @returns {object} the canonical member
 */
function pickCanonical(group) {
  return [...group].sort((a, b) => {
    const byType = sourceTypeRank(b.sourceType) - sourceTypeRank(a.sourceType);
    if (byType !== 0) return byType;
    return (b.description?.length || 0) - (a.description?.length || 0);
  })[0];
}

// ─── Fuzzy cross-source matching (aggregator → clean twin displacement) ─────────
//
// Exact (company|title|location) grouping misses aggregator variants of the same
// job (Adzuna "Direct Entry Captain - Pilot" @ "Dubai International Airport" vs
// the direct "Direct Entry Captain" @ "Dubai, United Arab Emirates"). We match by
// NOISE-NORMALISATION + exact multiset equality — NOT edit distance/overlap:
// strip a CLOSED allowlist of noise tokens, then require the remaining title
// token multiset (and city core) to match EXACTLY. Anything not on the allowlist
// is signal and is kept — crucially aircraft/type designators (A320, B777) are
// NEVER stripped, so "First Officer A320" and "First Officer B777" stay distinct.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// CLOSED allowlist — noise phrases only. Contains NO type/aircraft designators.
const TITLE_NOISE_PHRASES = [
  /\bpilot jobs\b/g,
  /\bapply now\b/g,
  /\(\s*m\s*\/\s*[fw]\s*\/\s*[dm]\s*\)/g,   // (m/f/d) (m/w/d)
];
const TITLE_TRAILING_DECORATOR = /\s*[-–—]\s*(pilots?|officer|careers?)\s*$/; // trailing "- Pilot"/"- Officer"/"- Careers"
// Only strip a trailing req-id that has an EXPLICIT marker (# / req / ref / job id).
// A BARE trailing number is left as signal — it may be an aircraft designator
// ("First Officer 777"/"787"), and a wrong strip that merges two jobs is far worse
// than a missed merge.
const TITLE_TRAILING_REQID = /\s*[-–—(]?\s*(?:#\s*|\b(?:req|ref|requisition|job\s*id)\b[\s.:#-]*)\d{2,}\)?\s*$/i;

// Known multi-base cities — first-token city reduction can't tell their bases
// apart (London Heathrow vs Gatwick both → "london"); flagged for manual review.
const MULTI_BASE_CITIES = new Set(['london', 'newyork', 'new', 'paris', 'tokyo', 'moscow', 'chicago', 'washington', 'houston', 'dallas', 'berlin', 'milan', 'rome', 'seoul', 'shanghai', 'sao', 'buenos', 'osaka', 'istanbul']);

// Freshness window for canonical selection — mirrors the runner's expireUnseen
// backstop (JOB_UNSEEN_MAX_DAYS, default 14). A row not seen within it cannot be
// chosen as a displacement canonical. lastSeenAt is authoritative; updatedAt is
// the fallback for rows that predate lastSeenAt (refreshed on every re-see).
const freshMaxDays = () => Math.max(1, parseInt(process.env.JOB_UNSEEN_MAX_DAYS || '14', 10));
function isFresh(row) {
  const ts = row.lastSeenAt || row.updatedAt;
  if (!ts) return false; // no freshness signal at all → not eligible as canonical
  return (Date.now() - new Date(ts).getTime()) / 864e5 <= freshMaxDays();
}

// Fold diacritics so an aggregator's "Montréal" matches an ATS "Montreal"
// (both → "montreal"). Without this, the ASCII-only tokenisers below split
// "montréal" into ["montr","al"] and the twin never matches.
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

function cityCore(location) {
  const first = fold(location).split(',')[0].trim().toLowerCase();
  return (first.match(/[a-z]+/g) || [])[0] || '';
}

function titleCore(title, company, location) {
  let t = ` ${fold(title).toLowerCase()} `;
  // repeated employer name + repeated location (city) suffixes are noise
  const emp = String(company || '').toLowerCase().replace(/\bgroup\b/g, ' ');
  for (const w of emp.split(/\s+/)) if (w.length > 2) t = t.replace(new RegExp(`\\b${esc(w)}\\b`, 'g'), ' ');
  const city = cityCore(location);
  if (city) t = t.replace(new RegExp(`\\b${esc(city)}\\b`, 'g'), ' ');
  for (const re of TITLE_NOISE_PHRASES) t = t.replace(re, ' ');
  let prev;
  do { prev = t; t = t.replace(TITLE_TRAILING_DECORATOR, ' '); } while (t !== prev); // strip repeated trailing decorators
  t = t.replace(TITLE_TRAILING_REQID, ' ');
  // Remaining alphanumeric tokens as a sorted multiset. Keep 1-char tokens only
  // if numeric; everything else (incl. A320/B777/CRJ9) is signal and kept.
  const tokens = (t.match(/[a-z0-9]+/g) || []).filter((x) => x.length > 1 || /\d/.test(x));
  return tokens.sort().join(' ');
}

/**
 * Displace aggregator rows that have a clean (direct_ats/operator_direct) twin.
 *
 * ASYMMETRIC by construction: canonical is chosen from the CLEAN rows only, so an
 * aggregator can only ever LOSE to a clean twin — never merge two clean rows, and
 * never expire a clean row. INVARIANT (asserted at runtime): an aggregator is
 * expired only if its canonical clean row is live; otherwise skip + log.
 *
 * Shadow by default (dryRun:true) — logs/returns the pairs it WOULD merge, writes
 * nothing. Flip to { dryRun:false } to apply after review.
 *
 * OVER-TIME behaviour (canonical later expires): DECISION = accept it.
 *  - If the direct source has a TOTAL failure (gated/down → 0 rows), the runner's
 *    zero-result guard skips expiry, so the canonical SURVIVES and the merge stays
 *    valid — the realistic glitch (Emirates edge-gating) is covered here.
 *  - If the canonical is legitimately gone (role filled), both sides expiring is
 *    correct — the job is off the board.
 *  - A rare persistent single-row drop is indistinguishable from a fill; we treat
 *    it as one. The merged aggregator row is EXPIRED but RETAINED (never deleted),
 *    and self-heals if the direct source returns the row (upsert reactivates the
 *    canonical; the sticky-merge keeps the aggregator hidden while the direct row
 *    covers the job). Merges are also logged (below) as a permanent audit trail.
 *
 * @returns {Promise<{pairs:object[], merged:number}>}
 */
async function collapseAggregatorDuplicates(sourcePlatforms, { dryRun = true } = {}) {
  const jobs = await prisma.job.findMany({
    where: { sourcePlatform: { in: sourcePlatforms }, status: 'ACTIVE', mergedInto: null },
    select: { id: true, sourcePlatform: true, sourceType: true, company: true, title: true, location: true, applyUrl: true, description: true, lastSeenAt: true, updatedAt: true },
  });

  const groups = new Map();
  for (const j of jobs) {
    const tc = titleCore(j.title, j.company, j.location);
    if (!tc) continue; // no signal left → never group
    const key = [normaliseKey(j.company), tc, cityCore(j.location)].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(j);
  }

  const pairs = [];
  let merged = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // FRESHNESS PRECONDITION: a stale clean row cannot win canonical — otherwise
    // we'd hide a working aggregator link behind a dead/ancient direct one, which
    // is worse than the duplicate. Freshness = seen within the backstop window
    // (lastSeenAt, or updatedAt for rows predating the field).
    const clean = group.filter((j) => j.sourceType && j.sourceType !== 'aggregator' && isFresh(j));
    const aggs = group.filter((j) => j.sourceType === 'aggregator');
    if (!clean.length || !aggs.length) continue; // need BOTH a FRESH clean twin and an aggregator

    const canonical = pickCanonical(clean); // best CLEAN row (guaranteed non-aggregator)
    if (!canonical || canonical.sourceType === 'aggregator') {
      logger.warn({ msg: 'aggregator-dedup: canonical not clean — skipping group (invariant)', title: aggs[0].title });
      continue;
    }
    for (const agg of aggs) {
      pairs.push({
        aggId: agg.id, aggTitle: agg.title, aggLocation: agg.location, aggType: agg.sourceType, aggApplyUrl: agg.applyUrl,
        canonId: canonical.id, canonTitle: canonical.title, canonLocation: canonical.location, canonType: canonical.sourceType, canonApplyUrl: canonical.applyUrl,
        winner: 'canonical (clean)', multiBaseCityReview: MULTI_BASE_CITIES.has(cityCore(canonical.location)),
      });
      if (!dryRun) {
        // Runtime INVARIANT: only expire the aggregator if the canonical is live.
        const live = await prisma.job.findUnique({ where: { id: canonical.id }, select: { status: true, sourceType: true } });
        if (!live || live.status !== 'ACTIVE' || live.sourceType === 'aggregator') {
          logger.warn({ msg: 'aggregator-dedup: canonical not live/clean at write time — skipping merge (invariant)', agg: agg.id, canonical: canonical.id });
          continue;
        }
        await prisma.job.update({ where: { id: agg.id }, data: { mergedInto: canonical.id, status: 'EXPIRED' } });
        merged++;
        // Permanent audit trail: every displacement, both sides.
        logger.info({
          msg: 'aggregator displaced by clean twin',
          canonicalId: canonical.id,
          aggregator: { id: agg.id, title: agg.title, applyUrl: agg.applyUrl },
          canonical: { title: canonical.title, sourceType: canonical.sourceType, applyUrl: canonical.applyUrl },
        });
      }
    }
  }
  logger.info({ msg: dryRun ? 'aggregator-dedup SHADOW (no writes)' : 'aggregator-dedup applied', candidatePairs: pairs.length, merged });
  return { pairs, merged };
}

/**
 * After upserting a batch of jobs, collapse cross-source duplicates.
 * Only looks at ACTIVE jobs that were touched in this run (by sourcePlatform).
 *
 * @param {string[]} sourcePlatforms  platforms that ran in this pass
 */
async function collapseXSourceDuplicates(sourcePlatforms) {
  if (!sourcePlatforms.length) return;

  // Load all active, non-merged jobs from the involved sources
  const jobs = await prisma.job.findMany({
    where: {
      sourcePlatform: { in: sourcePlatforms },
      status: 'ACTIVE',
      mergedInto: null,
    },
    select: {
      id: true,
      sourcePlatform: true,
      sourceType: true,
      company: true,
      title: true,
      location: true,
      description: true,
    },
  });

  // Group by (company, title, location) key
  const groups = new Map();
  for (const job of jobs) {
    const key = [
      normaliseKey(job.company),
      normaliseKey(job.title),
      normaliseKey(job.location),
    ].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job);
  }

  let merged = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;

    // Canonical selection ranks the apply destination FIRST (see pickCanonical):
    // a direct-ATS duplicate displaces its aggregator clone (→ EXPIRED +
    // mergedInto) even when the aggregator's description is longer. This is the
    // only lever left on the aggregator share once expiry + URL-rewrite are off
    // the table (Adzuna's API terms forbid resolving redirect_url).
    const canonical = pickCanonical(group);
    const duplicates = group.filter((j) => j.id !== canonical.id);

    for (const dup of duplicates) {
      if (dup.sourcePlatform === canonical.sourcePlatform) continue; // same source = not our job
      await prisma.job.update({
        where: { id: dup.id },
        data: { mergedInto: canonical.id, status: 'EXPIRED' },
      });
      merged++;
      logger.debug({
        msg: 'cross-source duplicate merged',
        kept: canonical.id,
        merged: dup.id,
        title: canonical.title,
      });
    }
  }

  if (merged > 0) logger.info({ msg: `dedup: merged ${merged} cross-source duplicates` });
}

/**
 * Same-ad multi-location collapse (aggregator spam pattern).
 *
 * Job boards syndicate one recruitment campaign across every province — the
 * Emirates Spain ad appeared ~40 times with only the location differing. Same
 * company + same title + IDENTICAL ad text ⇒ one campaign: keep the oldest
 * copy, point its location at the country ("Spain") or "Multiple locations",
 * and merge the clones away. Unread alerts for merged clones are deleted so
 * pilots aren't notified 40 times for one ad.
 *
 * Applied only to aggregate feeds (Adzuna/Jooble) — ATS boards post one req
 * per real vacancy, where identical titles at different bases are distinct
 * jobs and must never be collapsed.
 */
// Where does this airline ACTUALLY fly from? Ad campaigns are posted across
// whole countries ("Emirates" advertised in 40 Spanish provinces), so the ad's
// location is where it was SHOWN, not where the pilot will work. When the
// company resolves to an airline factfile, use its primary base/headquarters.
async function buildAirlineBaseMap() {
  const airlines = await prisma.airline.findMany({
    select: { name: true, headquarters: true, bases: true, country: true },
  });
  const map = new Map();
  for (const a of airlines) {
    const base = (a.bases && a.bases[0]) || a.headquarters || null;
    const entry = { base, country: a.country || null, name: a.name };
    for (const k of new Set([normalizeCompany(a.name), coreCompanyKey(a.name)])) {
      if (k && !map.has(k)) map.set(k, entry);
    }
  }
  return map;
}

function lookupAirlineBase(map, company) {
  return map.get(normalizeCompany(company)) ?? map.get(coreCompanyKey(company)) ?? null;
}

async function collapseSameAdAcrossLocations(sourcePlatforms = ['ADZUNA', 'JOOBLE', 'CAREERJET']) {
  const jobs = await prisma.job.findMany({
    where: { sourcePlatform: { in: sourcePlatforms }, status: 'ACTIVE', mergedInto: null },
    select: {
      id: true, sourcePlatform: true, company: true, title: true,
      description: true, location: true, country: true, postedAt: true,
    },
  });

  const airlineBases = await buildAirlineBaseMap();

  const groups = new Map();
  for (const job of jobs) {
    // Location deliberately NOT in the key. Primary signal is the AD TEXT
    // FINGERPRINT: letters-only, lowercased, first 500 chars — so trivial
    // variations (whitespace, punctuation, embedded city names' digits) don't
    // defeat the match. Same company + same fingerprint = one campaign, even
    // when the title varies per posting. Guard: only trust fingerprints from
    // real ad copy (≥150 letters) — short or stub descriptions fall back to
    // requiring the title to match too.
    const fp = String(job.description || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 500);
    // Company is deliberately NOT in the long-fingerprint key: ad networks
    // credit the same campaign to different publisher names ("Job-Room",
    // "Emirates", "Emirates Airlines"), and identical ad text IS the campaign.
    const key = fp.length >= 150
      ? [job.sourcePlatform, fp].join('|')
      : [job.sourcePlatform, normaliseKey(job.company), normaliseKey(job.title), fp].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job);
  }

  let collapsed = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const locations = new Set(group.map((j) => j.location));
    if (locations.size < 2) continue; // true same-location dupes are upsert's job

    group.sort((a, b) => new Date(a.postedAt) - new Date(b.postedAt));
    const canonical = group[0];
    const duplicates = group.slice(1);

    // Prefer the airline's real base over the ad campaign's target country.
    const home = lookupAirlineBase(airlineBases, canonical.company);
    const countries = [...new Set(group.map((j) => j.country).filter(Boolean))];
    const newLocation = home?.base
      ? home.base
      : (countries.length === 1 ? countries[0] : 'Multiple locations');

    await prisma.job.update({
      where: { id: canonical.id },
      data: { location: newLocation, ...(home?.country ? { country: home.country } : {}) },
    });
    for (const dup of duplicates) {
      await prisma.job.update({
        where: { id: dup.id },
        data: { mergedInto: canonical.id, status: 'EXPIRED' },
      });
      collapsed++;
    }
    // One campaign = one notification: drop unread alerts for the clones.
    await prisma.jobAlert.deleteMany({
      where: { jobId: { in: duplicates.map((d) => d.id) }, readAt: null },
    });
  }

  // Campaign collapse by SPECIFIC TITLE. Syndicated campaigns defeat the text
  // fingerprint two ways: per-city description preambles ("...role based in
  // Sydney, NSW" vs "...Melbourne, VIC") and publisher-name splits (the same
  // ad credited to "Jetstar Airways" AND "National Jet Systems Pty Ltd"). A
  // long, distinctive title (≥25 letters/digits — "A220 First Officer –
  // National Jet Systems") is itself a reliable campaign signature on
  // aggregators; generic titles ("First Officer", "Pilot") stay untouched.
  const titled = await prisma.job.findMany({
    where: { sourcePlatform: { in: sourcePlatforms }, status: 'ACTIVE', mergedInto: null },
    select: { id: true, sourcePlatform: true, company: true, title: true, location: true, country: true, postedAt: true },
  });
  const titleGroups = new Map();
  for (const job of titled) {
    const sig = String(job.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (sig.length < 25) continue;
    const k = [job.sourcePlatform, sig].join('|');
    if (!titleGroups.has(k)) titleGroups.set(k, []);
    titleGroups.get(k).push(job);
  }
  for (const [, group] of titleGroups) {
    if (group.length < 2) continue;
    group.sort((a, b) => new Date(a.postedAt) - new Date(b.postedAt));
    // Canonical: the copy credited to a real airline (factfile hit) if any —
    // it carries the honest company name — otherwise the oldest.
    const canonical = group.find((j) => lookupAirlineBase(airlineBases, j.company)) ?? group[0];
    const duplicates = group.filter((j) => j.id !== canonical.id);

    const home = lookupAirlineBase(airlineBases, canonical.company);
    const locations = new Set(group.map((j) => j.location));
    if (locations.size > 1 || home?.base) {
      const countries = [...new Set(group.map((j) => j.country).filter(Boolean))];
      const newLocation = home?.base
        ? home.base
        : (countries.length === 1 ? countries[0] : 'Multiple locations');
      await prisma.job.update({
        where: { id: canonical.id },
        data: { location: newLocation, ...(home?.country ? { country: home.country } : {}) },
      });
    }
    for (const dup of duplicates) {
      await prisma.job.update({
        where: { id: dup.id },
        data: { mergedInto: canonical.id, status: 'EXPIRED' },
      });
      collapsed++;
    }
    await prisma.jobAlert.deleteMany({
      where: { jobId: { in: duplicates.map((d) => d.id) }, readAt: null },
    });
  }

  // AIRLINE-CAMPAIGN COLLAPSE — the "once and for all" rule for recruitment
  // campaigns (owner directive). When an aggregator job's company resolves to
  // a known airline factfile, it is that airline's careers CAMPAIGN, not a
  // distinct vacancy: Emirates syndicates one campaign across countries,
  // languages, titles, and publisher names. One airline ⇒ ONE campaign
  // listing across ALL aggregator feeds. Ads naming different aircraft types
  // stay separate (an A380 Captain ad is not a 737 FO ad). ATS/career-site
  // jobs are untouched — those are real per-vacancy requisitions.
  const TYPE_TOKEN_RE = /\b(?:a\s?[23]\d{2}(?:neo)?|b?7[0-9]7|crj\d*|atr\s?\d*|dash\s?8|q400|e\d{3}|emb[-\s]?\d{3})\b/gi;
  const campaignJobs = await prisma.job.findMany({
    where: { sourcePlatform: { in: sourcePlatforms }, status: 'ACTIVE', mergedInto: null },
    select: {
      id: true, sourcePlatform: true, company: true, title: true, titleEn: true,
      location: true, country: true, postedAt: true, description: true,
    },
  });
  const campaignGroups = new Map();
  for (const job of campaignJobs) {
    const home = lookupAirlineBase(airlineBases, job.company);
    if (!home?.name) continue; // unknown companies: not provably one campaign
    const t = `${job.titleEn || job.title || ''}`;
    const types = [...new Set((t.match(TYPE_TOKEN_RE) || []).map((x) => x.replace(/[\s-]/g, '').toLowerCase()))].sort();
    const k = [home.name, types.join('+')].join('|'); // deliberately source-agnostic
    if (!campaignGroups.has(k)) campaignGroups.set(k, []);
    campaignGroups.get(k).push({ ...job, _home: home });
  }
  for (const [, group] of campaignGroups) {
    if (group.length < 2) continue;
    // Canonical: richest description wins (fullest ad copy), ties → oldest.
    group.sort((a, b) =>
      (String(b.description || '').length - String(a.description || '').length) ||
      (new Date(a.postedAt) - new Date(b.postedAt)));
    const canonical = group[0];
    const duplicates = group.slice(1);
    const home = canonical._home;
    await prisma.job.update({
      where: { id: canonical.id },
      data: {
        company: home.name, // honest airline name, not the ad publisher's
        ...(home.base ? { location: home.base } : {}),
        ...(home.country ? { country: home.country } : {}),
      },
    });
    for (const dup of duplicates) {
      await prisma.job.update({
        where: { id: dup.id },
        data: { mergedInto: canonical.id, status: 'EXPIRED' },
      });
      collapsed++;
    }
    await prisma.jobAlert.deleteMany({
      where: { jobId: { in: duplicates.map((d) => d.id) }, readAt: null },
    });
    logger.info({ airline: home.name, kept: canonical.id, merged: duplicates.length, msg: 'airline campaign collapsed' });
  }

  // Repost collapse: aggregators re-list the same vacancy under a fresh
  // externalId. Same source + company + title + location ⇒ keep the NEWEST
  // posting, merge the older copies into it.
  const stillActive = await prisma.job.findMany({
    where: { sourcePlatform: { in: sourcePlatforms }, status: 'ACTIVE', mergedInto: null },
    select: { id: true, sourcePlatform: true, company: true, title: true, location: true, postedAt: true },
  });
  const repostGroups = new Map();
  for (const job of stillActive) {
    const k = [job.sourcePlatform, normaliseKey(job.company), normaliseKey(job.title), normaliseKey(job.location)].join('|');
    if (!repostGroups.has(k)) repostGroups.set(k, []);
    repostGroups.get(k).push(job);
  }
  for (const [, group] of repostGroups) {
    if (group.length < 2) continue;
    group.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt)); // newest first
    const keep = group[0];
    const dupes = group.slice(1);
    for (const d of dupes) {
      await prisma.job.update({ where: { id: d.id }, data: { mergedInto: keep.id, status: 'EXPIRED' } });
      collapsed++;
    }
    await prisma.jobAlert.deleteMany({
      where: { jobId: { in: dupes.map((d) => d.id) }, readAt: null },
    });
  }

  if (collapsed > 0) logger.info({ msg: `dedup: collapsed ${collapsed} multi-location clones of identical ads` });
  return collapsed;
}

module.exports = { collapseXSourceDuplicates, collapseSameAdAcrossLocations, pickCanonical, collapseAggregatorDuplicates, titleCore, cityCore };
