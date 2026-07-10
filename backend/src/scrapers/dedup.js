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
async function collapseSameAdAcrossLocations(sourcePlatforms = ['ADZUNA', 'JOOBLE']) {
  const jobs = await prisma.job.findMany({
    where: { sourcePlatform: { in: sourcePlatforms }, status: 'ACTIVE', mergedInto: null },
    select: {
      id: true, sourcePlatform: true, company: true, title: true,
      description: true, location: true, country: true, postedAt: true,
    },
  });

  const groups = new Map();
  for (const job of jobs) {
    // Location deliberately NOT in the key. Primary signal is the AD TEXT:
    // same company + identical full description = one campaign, even when the
    // title varies per posting ("Glass Cockpit First Officer" vs "First
    // Officer - Airbus A320" wrapping the same Etihad ad). Guard: only trust
    // descriptions long enough to be unique ad copy (≥200 chars) — short or
    // stub descriptions fall back to requiring the title to match too.
    const descKey = String(job.description || '');
    const key = descKey.length >= 200
      ? [job.sourcePlatform, normaliseKey(job.company), descKey].join('|')
      : [job.sourcePlatform, normaliseKey(job.company), normaliseKey(job.title), descKey].join('|');
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

    const countries = [...new Set(group.map((j) => j.country).filter(Boolean))];
    const newLocation = countries.length === 1 ? countries[0] : 'Multiple locations';

    await prisma.job.update({ where: { id: canonical.id }, data: { location: newLocation } });
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

  if (collapsed > 0) logger.info({ msg: `dedup: collapsed ${collapsed} multi-location clones of identical ads` });
  return collapsed;
}

module.exports = { collapseXSourceDuplicates, collapseSameAdAcrossLocations };
