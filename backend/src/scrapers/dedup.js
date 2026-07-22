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

function normaliseKey(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
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

    // Keep the job with the longest description (most complete data)
    group.sort((a, b) => (b.description?.length || 0) - (a.description?.length || 0));
    const canonical = group[0];
    const duplicates = group.slice(1);

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

module.exports = { collapseXSourceDuplicates, collapseSameAdAcrossLocations };
