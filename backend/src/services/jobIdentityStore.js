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

// ─── Ingest-time identity ────────────────────────────────────────────────────
// A job inserted by the scraper used to get identityKey/identityFirstSeenAt only
// from the next recompute pass, so for up to a cron cycle a brand-new row had
// neither — and a RE-POST of an older ad looked "new" on the dashboard, because
// the new-since-last-visit test falls back to createdAt when identityFirstSeenAt
// is null. We now stamp both at insert.
//
// The resolver is airline-list-derived and rebuilt at most every RESOLVER_TTL_MS;
// building it per job would be O(airlines) on every upsert.
const RESOLVER_TTL_MS = Number(process.env.IDENTITY_RESOLVER_TTL_MS || 10 * 60 * 1000);
let _resolver = null;
let _resolverExp = 0;

async function getResolver() {
  if (_resolver && _resolverExp > Date.now()) return _resolver;
  const airlines = await prisma.airline.findMany({ select: { name: true, country: true, headquarters: true, bases: true } });
  _resolver = makeResolver(airlines);
  _resolverExp = Date.now() + RESOLVER_TTL_MS;
  return _resolver;
}
function clearResolverCache() { _resolver = null; _resolverExp = 0; }

// The identity columns for a job about to be INSERTED. `identityFirstSeenAt` is
// the cluster's earliest first-seen: a re-post inherits the original's date (so
// it is not "new"), and a genuinely new cluster starts at now.
// `now` is injectable for tests.
async function identityForInsert(job, { now = new Date() } = {}) {
  const resolver = await getResolver();
  const key = identityOf({ ...job, description: job.titleEn || job.title || '' }, resolver).key;
  // Oldest row already in this cluster, if any. identityKey is indexed.
  const prior = await prisma.job.findFirst({
    where: { identityKey: key },
    orderBy: [{ identityFirstSeenAt: 'asc' }, { createdAt: 'asc' }],
    select: { identityFirstSeenAt: true, createdAt: true },
  });
  const inherited = prior ? (prior.identityFirstSeenAt || prior.createdAt) : null;
  return { identityKey: key, identityFirstSeenAt: inherited || now };
}

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

module.exports = { recomputeJobIdentity, identityForInsert, getResolver, clearResolverCache };
