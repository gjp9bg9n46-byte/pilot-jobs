'use strict';

// Precompute + persist each Job's identity cluster (identityKey) and the cluster's
// earliest first-seen (identityFirstSeenAt), so request paths (notably
// /api/dashboard) never run the O(jobs × airlines) clustering on the event loop.
// Runs in the background: at ingest and after each scrape/dedup run, plus a
// one-time backfill on boot. Only rows whose value actually changed are written.

const prisma = require('../config/database');
const { makeResolver, identityOf } = require('../scrapers/jobIdentity');
const logger = require('../config/logger');

// identityOf needs only these columns; keep the scan light.
const SELECT = { id: true, title: true, titleEn: true, company: true, location: true, country: true, createdAt: true, identityKey: true, identityFirstSeenAt: true };

async function recomputeJobIdentity() {
  const [airlines, jobs] = await Promise.all([
    prisma.airline.findMany({ select: { name: true, country: true, headquarters: true, bases: true } }),
    // Cluster across EVERY job (any status) so a re-post inherits the original's
    // first-seen and never re-registers as "new".
    prisma.job.findMany({ select: SELECT }),
  ]);
  const resolver = makeResolver(airlines);

  // Pass 1 — key each job + track the cluster's earliest createdAt.
  const keyOf = new Map();            // jobId -> key
  const firstSeen = new Map();        // key -> earliest createdAt (ms)
  for (const j of jobs) {
    const key = identityOf({ ...j, description: j.titleEn || j.title }, resolver).key;
    keyOf.set(j.id, key);
    const c = new Date(j.createdAt).getTime();
    if (!firstSeen.has(key) || c < firstSeen.get(key)) firstSeen.set(key, c);
  }

  // Pass 2 — write only the rows whose (key, firstSeen) changed.
  let updated = 0;
  const ops = [];
  for (const j of jobs) {
    const key = keyOf.get(j.id);
    const fsMs = firstSeen.get(key);
    const fs = new Date(fsMs);
    const curFs = j.identityFirstSeenAt ? new Date(j.identityFirstSeenAt).getTime() : null;
    if (j.identityKey === key && curFs === fsMs) continue;
    ops.push(prisma.job.update({ where: { id: j.id }, data: { identityKey: key, identityFirstSeenAt: fs } }));
    updated += 1;
  }
  // Batch to keep any single transaction small.
  for (let i = 0; i < ops.length; i += 200) {
    await prisma.$transaction(ops.slice(i, i + 200));
  }
  logger.info(`job-identity recompute: ${updated} of ${jobs.length} rows updated (${firstSeen.size} clusters)`);
  return { jobs: jobs.length, updated, clusters: firstSeen.size };
}

module.exports = { recomputeJobIdentity };
