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
const { identityOf, makeResolver, shouldAutoMerge, rankOf, typesOf, subBrandOf, diceSimilarity, variantOf } = require('./jobIdentity');
// Category + instructor/examiner come from the MATCHER, not a second copy of
// the rules — these are the same classifiers the pilot-facing match uses.
const { jobAircraftCategory, jobInstructorKind } = require('../services/jobMatch');
const { classifyJob } = require('./aviationFilter');
const { normalizeCompany, coreCompanyKey } = require('../services/airlineEnrichmentService');
const { sourceTypeRank } = require('./sourceType');

function normaliseKey(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// Aggregator precedence: among aggregators (all tie at sourceTypeRank 1),
// WhatJobs — our PARTNER API whose applyUrl is the paid click-through — supersedes
// the scraped aggregators (Adzuna/Careerjet/Jooble/Reed). Higher = preferred.
// This NEVER outranks a clean row: direct_ats/operator_direct still win via
// sourceTypeRank, which is compared first.
// Canonical rule: direct_ats/operator_direct (via sourceTypeRank) > Adzuna /
// Careerjet > other aggregators > WhatJobs. WhatJobs ranks LOWEST so an
// Adzuna/Careerjet twin keeps its (non-cpl) apply link.
const AGGREGATOR_PRIORITY = { ADZUNA: 3, CAREERJET: 3, JOOBLE: 2, REED: 2, WHATJOBS: 1 };
function aggregatorPriority(sourcePlatform) {
  const k = String(sourcePlatform || '').toUpperCase();
  return (k in AGGREGATOR_PRIORITY) ? AGGREGATOR_PRIORITY[k] : 2; // unknown aggregators mid (above WhatJobs)
}

/**
 * Pick the canonical row for a group of cross-source duplicates.
 * Ranks the apply destination FIRST (direct_ats > operator_direct > aggregator),
 * then aggregator precedence (WhatJobs > other aggregators), then description
 * length — so a direct-ATS row displaces its aggregator clone even when the
 * aggregator's description is longer, and among aggregators WhatJobs wins. Pure +
 * non-mutating so it's unit-testable.
 *
 * @param {Array<{sourceType?:string, sourcePlatform?:string, description?:string}>} group
 * @returns {object} the canonical member
 */
function pickCanonical(group) {
  return [...group].sort((a, b) => {
    const byType = sourceTypeRank(b.sourceType) - sourceTypeRank(a.sourceType);
    if (byType !== 0) return byType;
    const byAgg = aggregatorPriority(b.sourcePlatform) - aggregatorPriority(a.sourcePlatform);
    if (byAgg !== 0) return byAgg;
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


// ── Cross-rank / cross-type guard for the LEGACY passes ─────────────────────
// The identity engine keys on rank+type+base, so it can never merge a Captain
// ad into a First Officer one. The legacy passes have no such protection:
// collapseSameAdAcrossLocations deliberately drops the TITLE from its key when
// the ad body is long, which is how one Emirates campaign body merged a
// "Direct Entry Captain" posting with three "First Officer/Senior First
// Officer" ones, and how "First Officer" swallowed "Flight Qualified Leader
// (Assistant Chief Pilot, Check Airman)".
//
// Rule (owner, 2026-10-08): never merge across a different RANK or a different
// AIRCRAFT TYPE. A location difference on its own is still fine to merge — that
// is what these passes are for. Governing principle: showing a duplicate is
// better than hiding a real job, so anything ambiguous is left alone.
//
// Returns a reason string when the merge must be BLOCKED, else null.
//
// Model tokens generalise "different aircraft" beyond the curated typesOf()
// vocabulary: KC-10 vs KC-135 are different aircraft but neither is in it. Only
// a token that looks like an airframe designation counts (letters+digits, or a
// bare 3–4 digit number), and only when BOTH titles carry one — "First Officer"
// vs "First Officer A321" is still allowed to merge.
const MODEL_TOKEN = /^(?:[a-z]{1,3}\d{2,4}[a-z]?|\d{3,4})$/;
function modelTokens(title) {
  const t = String(title || '').toLowerCase().normalize('NFKD')
    // join a hyphenated designation first — "kc-135" is one airframe, not
    // "kc" and "135", and splitting it loses the whole signal
    .replace(/\b([a-z]{1,3})[-\s]?(\d{2,4})\b/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ');
  return new Set((t.match(/[a-z0-9]+/g) || []).filter((x) => MODEL_TOKEN.test(x)));
}
// The variant axes the identity engine already keys on, reused verbatim rather
// than re-implemented: cadet / ab-initio, type-rated vs non-type-rated,
// "for X pilots only" restricted eligibility, accelerated-command and regional
// postings. variantOf() reads the TITLE only, so a passing mention in a body
// never retags a straight line job.
function variantClash(titleA, titleB) {
  const pa = new Set(variantOf(titleA, '').split('|').filter(Boolean));
  const pb = new Set(variantOf(titleB, '').split('|').filter(Boolean));
  // The RATED axis is two-sided by design (owner: "type-rated vs
  // non-type-rated"): a title that simply does not mention rating is UNSTATED,
  // not "non-rated", and splitting on that would refuse real duplicates such as
  // "A320 Type-rated First Officer" ← "Airbus A320 Family First Officer".
  const ratedOf = (p) => (p.has('rated') ? 'rated' : p.has('non-rated') ? 'non-rated' : null);
  const ra = ratedOf(pa); const rb = ratedOf(pb);
  if (ra && rb && ra !== rb) return `variant ${ra} vs ${rb}`;
  // Every other axis — cadet / ab-initio, "for X pilots only", accelerated
  // command, regional posting — is a positive claim about the role, so a
  // one-sided claim is still a difference.
  const rest = (p) => [...p].filter((x) => x !== 'rated' && x !== 'non-rated').sort().join('|');
  const xa = rest(pa); const xb = rest(pb);
  return xa === xb ? null : `variant "${xa || 'none'}" vs "${xb || 'none'}"`;
}

// Rotor vs fixed wing is not a wording difference — it is a different licence.
// Deliberately NOT jobAircraftCategory(): that infers a category from aircraft
// types and generic words ("airline pilot"), which is right for matching a
// pilot to a job but far too loose as a merge veto — it would refuse
// "Flight Crew - Captain F406/C425" ← "Captain, F406/C425 – Airline Pilot",
// which is plainly one job. Only an EXPLICIT category claim counts here, and
// then any disagreement blocks, including one-sided: "Rotor Wing Pilot" states
// helicopter and "Pilot - Full Time" states nothing, and merging the first into
// the second silently drops the category.
const ROTOR_CLAIM = /\b(rotor[- ]?wing|rotary[- ]?wing|helicopters?|heli|hems)\b/;
const FIXED_CLAIM = /\bfixed[- ]?wing\b/;
function statedCategory(title) {
  const t = fold(String(title || '')).toLowerCase();
  if (ROTOR_CLAIM.test(t)) return 'helicopter';
  if (FIXED_CLAIM.test(t)) return 'aeroplane';
  return null;
}
function categoryClash(titleA, titleB) {
  const ca = statedCategory(titleA); const cb = statedCategory(titleB);
  return ca === cb ? null : `category ${ca || 'unstated'} vs ${cb || 'unstated'}`;
}

// An examiner post is not an instructor post.
function instructorKindClash(titleA, titleB) {
  const ka = jobInstructorKind({ title: titleA });
  const kb = jobInstructorKind({ title: titleB });
  return ka && kb && ka !== kb ? `kind ${ka} vs ${kb}` : null;
}

function mergeBlocked(titleA, titleB, companyA, companyB) {
  // A named sub-brand is a positive claim about the employer: QantasLink is not
  // Qantas (owner, 2026-10-08). Differing claims — including one side naming a
  // brand the other does not — are not the same vacancy.
  const sa = subBrandOf(companyA, titleA); const sb = subBrandOf(companyB, titleB);
  if ((sa && sa.key) !== (sb && sb.key)) return `sub-brand ${sa ? sa.key : '—'} vs ${sb ? sb.key : '—'}`;
  const ra = rankOf(titleA); const rb = rankOf(titleB);
  if (ra && rb && ra !== rb) return `rank ${ra} vs ${rb}`;
  const ta = typesOf(titleA, ''); const tb = typesOf(titleB, '');
  if (ta.length && tb.length && !ta.some((x) => tb.includes(x))) return `type ${ta.join('+')} vs ${tb.join('+')}`;
  const ma = modelTokens(titleA); const mb = modelTokens(titleB);
  if (ma.size && mb.size) {
    let shared = false;
    for (const x of ma) if (mb.has(x)) shared = true;
    if (!shared) return `model ${[...ma].join('+')} vs ${[...mb].join('+')}`;
  }
  return categoryClash(titleA, titleB)
    || instructorKindClash(titleA, titleB)
    || variantClash(titleA, titleB);
}


// ── Extra test for the FINGERPRINT pass only ────────────────────────────────
// collapseSameAdAcrossLocations drops the TITLE from its key when the ad body
// is long, so one boilerplate body groups unrelated vacancies that
// mergeBlocked() cannot separate (same rank, no aircraft named): "Safety Pilot"
// ← "Pilot Transport", "Rotor Wing Pilot in Command" ← "Pilot Transport".
// Rule (owner, 2026-10-08): no aircraft type on EITHER side AND titles that
// share nothing (Dice < 0.5) ⇒ block.
//
// Place words are stripped from both titles first, using BOTH rows' own
// location/country plus the usual campaign phrasing, so per-city variants of
// one ad ("… – Sydney" vs "… – Melbourne") still read as identical and still
// merge. That is the whole point of this pass.
const PLACE_NOISE = /\b(multiple\s+locations?|home\s*bases?|based|location|various|nationwide|remote|region|regional)\b/g;
// Aviation words that LOOK like an airport code (3–4 letters, upper-case in the
// original title) but are not one. Everything else of that shape is treated as
// an ICAO/IATA code and stripped — "First Officer - Embraer E195-E2 (Toronto)
// YYZ" and its Montréal twin must compare equal once places are gone.
const NOT_A_CODE = /^(ATPL|CPL|MPL|PPL|ICAO|EASA|FAA|CASA|TCCA|CAAC|DGCA|NTR|IFR|VFR|PIC|SIC|HEMS|VIP|TRI|TRE|SFI|SFE|LPC|OPC|CRM|AOC|SAR|EMS|MCC|JOC|FTO|ATO|RHS|LHS|SOP|QRH|USA|UAE|UK|EU)$/;
function stripPlaces(title, rowA, rowB) {
  const raw = String(title || '');
  // Airport codes first, off the ORIGINAL casing — a bare "yyz" in a lower-case
  // title is indistinguishable from a word, so only upper-case tokens qualify.
  let t = ` ${fold(raw)} `.replace(/\b[A-Z]{3,4}\b/g, (m) => (NOT_A_CODE.test(m) ? m : ' '));
  t = ` ${t.toLowerCase()} `;
  for (const r of [rowA, rowB]) {
    for (const src of [r && r.location, r && r.country]) {
      for (const w of String(src || '').toLowerCase().split(/[^a-z]+/)) {
        if (w.length > 2) t = t.replace(new RegExp(`\\b${esc(w)}\\b`, 'g'), ' ');
      }
    }
  }
  t = t.replace(PLACE_NOISE, ' ');
  return t.replace(/[^a-z0-9]+/g, ' ').trim();
}
const TITLES_UNRELATED = 0.5;
function unrelatedTitles(rowA, rowB) {
  const ta = rowA.titleEn || rowA.title; const tb = rowB.titleEn || rowB.title;
  // only when NEITHER side names an aircraft — a named type is identity enough
  if (typesOf(ta, '').length || typesOf(tb, '').length) return null;
  if (modelTokens(ta).size || modelTokens(tb).size) return null;
  const sa = stripPlaces(ta, rowA, rowB); const sb = stripPlaces(tb, rowA, rowB);
  if (!sa || !sb) return null;
  const sim = diceSimilarity(sa, sb);
  if (sim >= TITLES_UNRELATED) return null;
  return `unrelated titles (no type, dice ${sim.toFixed(2)}: "${sa}" vs "${sb}")`;
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
  let merged = 0; let skippedByGuard = 0;
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
 * Aggregator precedence (fuzzy twin): Adzuna/Careerjet beat WhatJobs. The
 * highest-priority fresh aggregator is canonical; the rest (incl. WhatJobs) are
 * merged into it, so the surviving apply link is the non-cpl one.
 *
 * Same fuzzy fingerprint (employer + title-core-with-aircraft + city) as the
 * clean-displacement pass, but here the WINNER is the WhatJobs twin and the
 * LOSERS are the OTHER aggregators (Adzuna/Careerjet/Jooble/Reed). WhatJobs is
 * our partner API and its applyUrl is the paid click-through, so its version
 * supersedes a scraped-aggregator clone: the loser is EXPIRED + mergedInto the
 * WhatJobs row (collapsed, never shown twice; its applyUrl is replaced).
 *
 * SAFE by construction — the query is scoped to `sourceType: 'aggregator'`, so a
 * clean (direct_ats/operator_direct) row is NEVER loaded here and can never be
 * displaced. Run this AFTER collapseAggregatorDuplicates so a direct twin still
 * beats WhatJobs (WhatJobs would already be merged into the clean row by then).
 * ASYMMETRIC: lower aggregators never displace WhatJobs. Freshness precondition:
 * a stale WhatJobs row can't hide a live lower-aggregator twin.
 *
 * Runs across ALL active aggregators (not just this run) → retroactive +
 * continuous: a stored Adzuna/Careerjet job migrates to an incoming WhatJobs twin.
 *
 * @returns {Promise<{pairs:object[], merged:number}>}
 */
async function collapseAggregatorPriority({ dryRun = true } = {}) {
  const jobs = await prisma.job.findMany({
    where: { sourceType: 'aggregator', status: 'ACTIVE', mergedInto: null },
    select: { id: true, sourcePlatform: true, sourceType: true, company: true, title: true, location: true, applyUrl: true, description: true, lastSeenAt: true, updatedAt: true },
  });

  const groups = new Map();
  for (const j of jobs) {
    const tc = titleCore(j.title, j.company, j.location);
    if (!tc) continue;
    const key = [normaliseKey(j.company), tc, cityCore(j.location)].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(j);
  }

  const pairs = [];
  let merged = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const fresh = group.filter(isFresh);
    if (!fresh.length) continue;
    // Canonical = highest-priority FRESH aggregator (Adzuna/Careerjet beat
    // WhatJobs). Losers = everything else in the group, incl. WhatJobs.
    const canonical = pickCanonical(fresh);
    const losers = group.filter((j) => j.id !== canonical.id);
    if (!losers.length) continue;
    for (const loser of losers) {
      const blocked = mergeBlocked(loser.title, canonical.title, loser.company, canonical.company);
      if (blocked) { skippedByGuard += 1; logger.info({ msg: 'aggregator-priority: merge BLOCKED by the rank/type guard', reason: blocked, loser: loser.title, canonical: canonical.title }); continue; }
      pairs.push({
        loserId: loser.id, loserPlatform: loser.sourcePlatform, loserTitle: loser.title, loserApplyUrl: loser.applyUrl,
        canonId: canonical.id, canonPlatform: canonical.sourcePlatform, canonApplyUrl: canonical.applyUrl,
        multiBaseCityReview: MULTI_BASE_CITIES.has(cityCore(canonical.location)),
      });
      if (!dryRun) {
        // INVARIANT: only expire the loser if the chosen canonical is still live.
        const live = await prisma.job.findUnique({ where: { id: canonical.id }, select: { status: true } });
        if (!live || live.status !== 'ACTIVE') {
          logger.warn({ msg: 'aggregator-priority: canonical not live at write time — skipping (invariant)', loser: loser.id, canonical: canonical.id });
          continue;
        }
        await prisma.job.update({ where: { id: loser.id }, data: { mergedInto: canonical.id, status: 'EXPIRED' } });
        merged++;
        logger.info({
          msg: 'aggregator displaced by higher-priority aggregator',
          canonical: { id: canonical.id, platform: canonical.sourcePlatform, applyUrl: canonical.applyUrl },
          loser: { id: loser.id, platform: loser.sourcePlatform, applyUrl: loser.applyUrl },
        });
      }
    }
  }
  logger.info({ msg: dryRun ? 'aggregator-priority SHADOW (no writes)' : 'aggregator-priority applied', candidatePairs: pairs.length, merged, skippedByGuard });
  return { pairs, merged, skippedByGuard };
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

  let merged = 0; let skippedByGuard = 0;
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
      const blocked = mergeBlocked(dup.title, canonical.title, dup.company, canonical.company);
      if (blocked) { skippedByGuard += 1; logger.info({ msg: 'x-source: merge BLOCKED by the rank/type guard', reason: blocked, loser: dup.title, canonical: canonical.title }); continue; }
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

  let collapsed = 0; let skippedByGuard = 0;
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
    // The TITLE is deliberately not in this pass's key, so one campaign body can
    // group several RANKS. Filter them out here rather than loosening the key.
    const mergeable = [];
    for (const dup of duplicates) {
      const blocked = mergeBlocked(dup.title, canonical.title, dup.company, canonical.company)
        || unrelatedTitles(dup, canonical);
      if (blocked) { skippedByGuard += 1; logger.info({ msg: 'same-ad-across-locations: merge BLOCKED', reason: blocked, loser: dup.title, canonical: canonical.title }); continue; }
      mergeable.push(dup);
    }
    for (const dup of mergeable) {
      await prisma.job.update({
        where: { id: dup.id },
        data: { mergedInto: canonical.id, status: 'EXPIRED' },
      });
      collapsed++;
    }
    // One campaign = one notification: drop unread alerts for the clones.
    await prisma.jobAlert.deleteMany({
      where: { jobId: { in: mergeable.map((d) => d.id) }, readAt: null },
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

// ─── Identity-based dedup (src/scrapers/jobIdentity.js) ──────────────────────
// Conservative collapse of EXACT-identity clusters only (resolved employer ·
// rank · aircraft type · base · variant). A cluster is merged only when it is
// CERTAIN — some member states an aircraft type OR its employer resolved to an
// airline. No-type + unresolved groups are left live and counted as review.
// Canonical priority: direct_ats/operator_direct > Adzuna/Careerjet > WhatJobs,
// then an employer apply link, then the operator-labelled row, then description.
function canonicalByIdentity(group) {
  const dom = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const empLink = (u) => { const d = dom(u); return !!d && !/whatjobs\.com|adzuna|careerjet|jooble|reed\.co|indeed|talent\.com/i.test(d); };
  const agg = (sp) => { const s = String(sp || '').toUpperCase(); if (/ADZUNA|CAREERJET/.test(s)) return 4; if (/JOOBLE/.test(s)) return 2; if (/WHATJOBS/.test(s)) return 1; return 3; };
  const isOp = (x) => x._emp && x._emp.via && x._emp.via !== 'company-asis';
  return [...group].sort((a, b) =>
    (sourceTypeRank(b.sourceType) - sourceTypeRank(a.sourceType)) ||
    (agg(b.sourcePlatform) - agg(a.sourcePlatform)) ||
    ((empLink(b.applyUrl) ? 1 : 0) - (empLink(a.applyUrl) ? 1 : 0)) ||
    ((isOp(b) ? 1 : 0) - (isOp(a) ? 1 : 0)) ||
    ((b.description ? b.description.length : 0) - (a.description ? a.description.length : 0)))[0];
}

async function collapseByIdentity({ dryRun = true } = {}) {
  const airlines = await prisma.airline.findMany({ select: { name: true, country: true, headquarters: true, bases: true } });
  const resolver = makeResolver(airlines);
  const jobs = await prisma.job.findMany({ where: { status: 'ACTIVE', mergedInto: null }, select: { id: true, title: true, titleEn: true, company: true, location: true, country: true, sourcePlatform: true, sourceType: true, applyUrl: true, description: true, descriptionEn: true } });
  const groups = new Map();
  for (const j of jobs) { const ident = identityOf({ ...j, description: j.descriptionEn || j.description }, resolver); j._ident = ident; j._emp = ident.employer; if (!groups.has(ident.key)) groups.set(ident.key, []); groups.get(ident.key).push(j); }
  let clustersMerged = 0, rowsHidden = 0, reviewGroups = 0; const perSource = {};
  for (const [, g] of groups) {
    if (g.length < 2) continue;
    // Safety gate: certain cluster, and NOT a recruiter-only group on a soft base
    // (those could be different client airlines — leave live, logged).
    // title + description go in so the gate can tell "same ad, worded twice"
    // from "two different vacancies" when there's no type or no base.
    if (!shouldAutoMerge(g.map((x) => ({
      company: x.company, ident: x._ident,
      title: x.titleEn || x.title, description: x.descriptionEn || x.description,
      location: x.location, country: x.country,
    })))) { reviewGroups++; continue; }
    const canon = canonicalByIdentity(g);
    clustersMerged++;
    for (const d of g) {
      if (d.id === canon.id) continue;
      rowsHidden++; perSource[d.sourcePlatform || '?'] = (perSource[d.sourcePlatform || '?'] || 0) + 1;
      if (!dryRun) {
        await prisma.job.update({ where: { id: d.id }, data: { mergedInto: canon.id, status: 'EXPIRED' } });
        // Flatten chains: rows that were merged into this dupe re-point to the new
        // canonical. Indexed on mergedInto (Job_mergedInto_idx) and batched at
        // ≤5000 ids/transaction so it never runs an unbounded full-table write.
        for (;;) {
          const chained = await prisma.job.findMany({ where: { mergedInto: d.id }, select: { id: true }, take: 5000 });
          if (!chained.length) break;
          await prisma.job.updateMany({ where: { id: { in: chained.map((c) => c.id) } }, data: { mergedInto: canon.id } });
          if (chained.length < 5000) break;
        }
      }
    }
  }
  logger.info({ msg: dryRun ? 'identity-dedup SHADOW (no writes)' : 'identity-dedup applied', clustersMerged, rowsHidden, reviewGroups, perSource });
  return { clustersMerged, rowsHidden, reviewGroups, perSource };
}

// Re-run the aviation classifier over EXISTING live jobs (intake only screens new
// rows). Reversible hide (EXPIRED + REMOVED, sticky via runner keepInactive).
async function reScreenNonAviation({ dryRun = true } = {}) {
  const jobs = await prisma.job.findMany({ where: { status: 'ACTIVE', mergedInto: null }, select: { id: true, title: true, company: true, description: true, sourceType: true, sourcePlatform: true } });
  let hidden = 0; const perSource = {};
  for (const j of jobs) {
    if (classifyJob({ title: j.title, company: j.company, description: j.description, sourceType: j.sourceType }).verdict !== 'reject') continue;
    hidden++; perSource[j.sourcePlatform || '?'] = (perSource[j.sourcePlatform || '?'] || 0) + 1;
    if (!dryRun) await prisma.job.update({ where: { id: j.id }, data: { status: 'EXPIRED', moderationStatus: 'REMOVED', notes: 'non-aviation (nightly re-screen); reversible' } });
  }
  logger.info({ msg: dryRun ? 'non-aviation re-screen SHADOW (no writes)' : 'non-aviation re-screen applied', hidden, perSource });
  return { hidden, perSource };
}

module.exports = { mergeBlocked, modelTokens, unrelatedTitles, stripPlaces, variantClash, categoryClash, instructorKindClash, statedCategory, collapseXSourceDuplicates, collapseSameAdAcrossLocations, pickCanonical, collapseAggregatorDuplicates, collapseAggregatorPriority, aggregatorPriority, titleCore, cityCore, collapseByIdentity, reScreenNonAviation };
