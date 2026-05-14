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

module.exports = { collapseXSourceDuplicates };
