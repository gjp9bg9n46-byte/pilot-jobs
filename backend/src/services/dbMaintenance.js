'use strict';

// Database maintenance: keep the JobAlert table from unbounded growth (jobs expire
// by status change, not deletion, so their alerts would accumulate forever — the
// bloat that filled the disk on 2026-09-25), and warn before the volume fills.
const prisma = require('../config/database');
const logger = require('../config/logger');
const { sendEmail } = require('./emailService');

// Volume size (bytes) — set DB_VOLUME_BYTES to the Railway volume; default 5 GB.
const VOLUME_BYTES = Number(process.env.DB_VOLUME_BYTES || 5 * 1024 ** 3);
const ALERT_PCT = Number(process.env.DB_DISK_ALERT_PCT || 75);
const ALERT_TO = process.env.DISK_ALERT_EMAIL || process.env.SCRAPER_ALERT_EMAIL || null;

// Delete alerts whose job is EXPIRED, in small transactions so no single statement
// bloats WAL. Space is reused internally by future inserts (no VACUUM FULL).
async function pruneExpiredJobAlerts({ batchSize = 5000, maxBatches = 1000 } = {}) {
  let removed = 0, batch = 0;
  for (; batch < maxBatches; batch++) {
    const n = await prisma.$executeRaw`
      DELETE FROM "JobAlert" WHERE id IN (
        SELECT a.id FROM "JobAlert" a JOIN "Job" j ON j.id = a."jobId"
        WHERE j.status = 'EXPIRED' LIMIT ${batchSize})`;
    removed += n;
    if (n === 0) break;
    await new Promise((r) => setTimeout(r, 300)); // breathe between transactions
  }
  if (removed) logger.info({ source: 'DB-MAINT', msg: `pruned ${removed} expired-job alerts`, batches: batch });
  return { removed, batches: batch };
}

// Physical-usage estimate = this database + WAL, against the known volume size.
async function getDiskUsage() {
  const rows = await prisma.$queryRaw`
    SELECT pg_database_size(current_database())::bigint db,
           (SELECT coalesce(sum(size), 0) FROM pg_ls_waldir())::bigint wal`;
  const dbBytes = Number(rows[0].db);
  const walBytes = Number(rows[0].wal);
  const usedBytes = dbBytes + walBytes;
  return { dbBytes, walBytes, usedBytes, volumeBytes: VOLUME_BYTES, pct: Math.round((usedBytes / VOLUME_BYTES) * 100) };
}

// Log usage every run; email the ops address once it crosses the threshold.
async function checkDiskAndAlert() {
  try {
    const u = await getDiskUsage();
    logger.info({ source: 'DB-MAINT', msg: 'disk check', pct: u.pct, dbMB: Math.round(u.dbBytes / 1e6), walMB: Math.round(u.walBytes / 1e6) });
    if (u.pct >= ALERT_PCT && ALERT_TO) {
      const line = `Database volume usage is at ${u.pct}% (${Math.round(u.usedBytes / 1e6)} MB of ${Math.round(u.volumeBytes / 1e6)} MB): db ${Math.round(u.dbBytes / 1e6)} MB + WAL ${Math.round(u.walBytes / 1e6)} MB.`;
      await sendEmail({
        to: ALERT_TO,
        subject: `⚠️ CockpitHire DB disk at ${u.pct}%`,
        text: `${line}\n\nAction: increase the Railway Postgres volume and/or run the expired-alert prune.`,
        html: `<p>${line}</p><p><b>Action:</b> increase the Railway Postgres volume and/or run the expired-alert prune.</p>`,
        tags: ['db-disk'],
      });
      logger.warn({ source: 'DB-MAINT', msg: `disk ${u.pct}% ≥ ${ALERT_PCT}% — alerted ${ALERT_TO}` });
    }
    return u;
  } catch (err) {
    logger.error({ source: 'DB-MAINT', err: err.message, msg: 'disk check failed' });
    return null;
  }
}

// Weekly report of apply links stuck on HTTP 403. The nightly liveness checker
// SKIPS 403 (can't tell an anti-bot block from a genuinely gone page), so these
// jobs never expire on their own — they need a human to check/replace the URL.
// We report rows whose 403 run has lasted at least MIN_DAYS (default 5), i.e.
// seen 403 across several nightly sweeps, to skip one-off anti-bot blips.
async function reportStuck403({ minDays = Number(process.env.STUCK_403_MIN_DAYS || 5) } = {}) {
  const cutoff = new Date(Date.now() - minDays * 864e5);
  const jobs = await prisma.job.findMany({
    where: { status: 'ACTIVE', liveness403Since: { not: null, lte: cutoff } },
    select: { id: true, company: true, title: true, applyUrl: true, sourcePlatform: true, liveness403Since: true },
    orderBy: { liveness403Since: 'asc' },
  });
  logger.info({ source: 'DB-MAINT', msg: `stuck-403 report: ${jobs.length} job(s) ≥ ${minDays}d`, count: jobs.length });
  if (!jobs.length || !ALERT_TO) return { count: jobs.length, jobs };

  const row = (j) => {
    const days = Math.floor((Date.now() - new Date(j.liveness403Since).getTime()) / 864e5);
    return { j, days };
  };
  const lines = jobs.map(row).map(({ j, days }) => `• [${days}d] ${j.company} — ${j.title} (${j.sourcePlatform || '—'})\n  ${j.applyUrl}`);
  const html = jobs.map(row).map(({ j, days }) =>
    `<li><b>${days}d</b> — ${j.company} — ${j.title} <i>(${j.sourcePlatform || '—'})</i><br><a href="${j.applyUrl}">${j.applyUrl}</a></li>`).join('');
  await sendEmail({
    to: ALERT_TO,
    subject: `CockpitHire: ${jobs.length} apply link(s) stuck on 403`,
    text: `${jobs.length} ACTIVE job(s) have returned HTTP 403 for ≥ ${minDays} days. The liveness checker skips 403, so these won't expire on their own — check whether each URL is genuinely gone or just anti-bot, and fix/expire manually:\n\n${lines.join('\n')}`,
    html: `<p>${jobs.length} ACTIVE job(s) have returned HTTP 403 for ≥ ${minDays} days. The liveness checker skips 403, so these won't expire on their own — check each and fix/expire manually:</p><ul>${html}</ul>`,
    tags: ['stuck-403'],
  });
  logger.warn({ source: 'DB-MAINT', msg: `stuck-403 report emailed to ${ALERT_TO}`, count: jobs.length });
  return { count: jobs.length, jobs };
}

module.exports = { pruneExpiredJobAlerts, getDiskUsage, checkDiskAndAlert, reportStuck403 };
