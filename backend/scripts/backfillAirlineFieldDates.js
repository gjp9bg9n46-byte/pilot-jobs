'use strict';

/**
 * One-off honest backfill of AirlineFieldDate from approved contribution history.
 *
 * The ONLY real per-field dates we can recover are the reviewedAt of approved
 * AirlineFactContributions: when a field was community-updated + approved, that
 * is a genuine "recorded" date. Contributions carry whole-field values, so we
 * date at FIELD LEVEL (the fallback key) — going-forward edits/re-affirms add
 * precise per-item keys on top. Everything else stays absent → renders "—".
 * Nothing is stamped with now(); no fabricated dates.
 *
 * Idempotent: run as many times as needed. Latest reviewedAt wins per field.
 * Run: node scripts/backfillAirlineFieldDates.js
 */

const prisma = require('../src/config/database');
const { toLogical, ALL_LOGICAL_FIELDS } = require('../src/services/fieldDateKeys');

(async () => {
  const approved = await prisma.airlineFactContribution.findMany({
    where: { status: 'APPROVED', reviewedAt: { not: null } },
    select: { airlineId: true, proposedChanges: true, reviewedAt: true },
    orderBy: { reviewedAt: 'asc' }, // oldest first so latest overwrites
  });

  const logical = new Set(ALL_LOGICAL_FIELDS);
  let written = 0;
  for (const c of approved) {
    for (const raw of Object.keys(c.proposedChanges || {})) {
      const field = toLogical(raw);
      if (!logical.has(field)) continue; // skip non-factfile keys
      await prisma.airlineFieldDate.upsert({
        where: { airlineId_field: { airlineId: c.airlineId, field } },
        update: { recordedAt: c.reviewedAt, source: 'backfill' },
        create: { airlineId: c.airlineId, field, recordedAt: c.reviewedAt, source: 'backfill' },
      });
      written++;
    }
  }

  const total = await prisma.airlineFieldDate.count();
  console.log(`backfill: processed ${approved.length} approved contributions, ${written} field-date upserts`);
  console.log(`AirlineFieldDate now holds ${total} real field-dates (everything else renders "—")`);
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => { console.error('BACKFILL FAILED:', e.message); process.exit(1); });
