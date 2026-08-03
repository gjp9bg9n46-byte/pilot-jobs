'use strict';

const prisma = require('../config/database');
const { sendEmail } = require('../services/emailService');
const { renderTestEmail } = require('../services/emailTemplates');
const { keysToStampOnEdit, ALL_LOGICAL_FIELDS } = require('../services/fieldDateKeys');

// POST /admin/notifications/test — admin-only health check for the Resend
// integration. Sends a test email to the calling admin's own address.
exports.sendTestNotification = async (req, res, next) => {
  try {
    const admin = req.pilot;
    if (!admin?.email) return res.status(400).json({ error: 'Admin has no email on file.' });
    const recipientName = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.email;

    const result = await sendEmail({
      to: [admin.email],
      subject: 'CockpitHire notifications test',
      html: renderTestEmail({ recipientName }),
      tags: { type: 'test', phase: 'A' },
    });

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Email send failed', sentTo: admin.email });
    }
    res.json({ success: true, messageId: result.id, sentTo: admin.email });
  } catch (err) {
    next(err);
  }
};

// Admin dashboard metrics — one aggregation call, all cheap _count queries.
exports.getStats = async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 30 * 86400000); // rolling 30 days
    const [
      pendingContributions, pendingEmployers,
      activePilots, activeEmployers, activeAirlines,
      jobsPosted, applicationsSubmitted, newContributions,
    ] = await Promise.all([
      prisma.airlineFactContribution.count({ where: { status: 'PENDING' } }),
      prisma.employer.count({ where: { status: 'PENDING' } }),
      prisma.pilot.count(),
      prisma.employer.count({ where: { status: 'APPROVED' } }),
      prisma.airline.count(),
      prisma.job.count({ where: { createdAt: { gte: since } } }),
      prisma.application.count({ where: { appliedAt: { gte: since } } }),
      prisma.airlineFactContribution.count({ where: { createdAt: { gte: since } } }),
    ]);
    res.json({
      actionQueues: { pendingContributions, pendingEmployers },
      platform:     { activePilots, activeEmployers, activeAirlines },
      recent30d:    { jobsPosted, applicationsSubmitted, newContributions },
    });
  } catch (err) {
    next(err);
  }
};

// All factfile fields that can be merged from proposedChanges into Airline
const MERGEABLE_FIELDS = new Set([
  'headquarters', 'description', 'bases', 'fleet', 'fleetDetail', 'hiringStatus', 'hiringFrequency',
  'payRanges', 'rosterPattern', 'contractType', 'workAuthRequired', 'avgResponseDays',
  'interviewStages', 'simType', 'upgradeTimeMinYears', 'upgradeTimeMaxYears', 'notes', 'region',
]);

// Airline fields returned alongside each contribution for diff rendering
const AIRLINE_DIFF_SELECT = {
  id: true, name: true,
  headquarters: true, description: true, bases: true, fleet: true, fleetDetail: true,
  hiringStatus: true, hiringFrequency: true, payRanges: true,
  rosterPattern: true, contractType: true, workAuthRequired: true,
  avgResponseDays: true, interviewStages: true, simType: true,
  upgradeTimeMinYears: true, upgradeTimeMaxYears: true, notes: true,
  region: true, verifiedContributors: true, lastUpdatedAt: true,
};

exports.getContributions = async (req, res, next) => {
  try {
    const pageNum  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const [total, rawItems] = await Promise.all([
      prisma.airlineFactContribution.count({ where: { status: 'PENDING' } }),
      prisma.airlineFactContribution.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        select: {
          id: true, proposedChanges: true, createdAt: true, contributorId: true,
          airline:     { select: AIRLINE_DIFF_SELECT },
          contributor: { select: { role: true, country: true } },
        },
      }),
    ]);

    // Batch approved-count lookup — avoids N+1
    const contributorIds = [...new Set(rawItems.map((r) => r.contributorId))];
    const approvedGroups = contributorIds.length
      ? await prisma.airlineFactContribution.groupBy({
          by: ['contributorId'],
          where: { contributorId: { in: contributorIds }, status: 'APPROVED' },
          _count: { id: true },
        })
      : [];
    const approvedMap = Object.fromEntries(approvedGroups.map((g) => [g.contributorId, g._count.id]));

    const items = rawItems.map(({ contributorId, contributor, ...c }) => ({
      ...c,
      contributorContext: {
        role:          contributor.role    ?? null,
        country:       contributor.country ?? null,
        approvedCount: approvedMap[contributorId] ?? 0,
      },
    }));

    res.json({ items, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    next(err);
  }
};

exports.approve = async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const contribution = await tx.airlineFactContribution.findUnique({
        where: { id: req.params.id },
      });
      if (!contribution) throw Object.assign(new Error('Contribution not found'), { status: 404 });
      if (contribution.status !== 'PENDING') throw Object.assign(new Error('Already processed'), { status: 409 });

      // Build airline update payload — only keys present in proposedChanges, null = explicit clear
      const updateData = {};
      for (const [key, value] of Object.entries(contribution.proposedChanges)) {
        if (MERGEABLE_FIELDS.has(key)) updateData[key] = value;
      }

      // Old state (pre-merge) — needed to diff per-item fields so only the items
      // that actually changed get re-dated.
      const oldAirline = await tx.airline.findUnique({ where: { id: contribution.airlineId } });

      const reviewedAt = new Date();
      const [airline, updated] = await Promise.all([
        tx.airline.update({
          where: { id: contribution.airlineId },
          data: { ...updateData, verifiedContributors: { increment: 1 } },
        }),
        tx.airlineFactContribution.update({
          where: { id: req.params.id },
          data: { status: 'APPROVED', reviewerId: req.pilot.id, reviewedAt },
        }),
      ]);

      // Per-field dating: each changed field/item gets recordedAt = reviewedAt.
      // Only these keys move — every other field's date is untouched.
      const stampKeys = new Set();
      for (const key of Object.keys(updateData)) {
        for (const k of keysToStampOnEdit(key, airline, oldAirline)) stampKeys.add(k);
      }
      for (const field of stampKeys) {
        await tx.airlineFieldDate.upsert({
          where: { airlineId_field: { airlineId: contribution.airlineId, field } },
          update: { recordedAt: reviewedAt, source: 'contribution' },
          create: { airlineId: contribution.airlineId, field, recordedAt: reviewedAt, source: 'contribution' },
        });
      }

      return { airline, contribution: updated };
    });

    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

// Re-affirm a field WITHOUT changing its value ("fleet is still 12 A320s").
// Sets only that field/item's recordedAt to now, so accurate-but-old data stops
// reading as stale. `field` is a field-date key: whole ('rosterPattern') or
// per-item ('fleet:A320', 'payRanges:captain', 'interviewStages:0').
exports.reaffirmField = async (req, res, next) => {
  try {
    const { field } = req.body;
    if (!field || typeof field !== 'string') return res.status(400).json({ error: 'field is required' });
    if (!ALL_LOGICAL_FIELDS.includes(field.split(':')[0])) {
      return res.status(400).json({ error: `unknown factfile field: ${field}` });
    }
    const airline = await prisma.airline.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!airline) return res.status(404).json({ error: 'Airline not found' });

    const now = new Date();
    const fd = await prisma.airlineFieldDate.upsert({
      where: { airlineId_field: { airlineId: req.params.id, field } },
      update: { recordedAt: now, source: 'reaffirm' },
      create: { airlineId: req.params.id, field, recordedAt: now, source: 'reaffirm' },
    });
    res.json({ field: fd.field, recordedAt: fd.recordedAt });
  } catch (err) { next(err); }
};

exports.reject = async (req, res, next) => {
  try {
    const { note } = req.body;
    if (!note || typeof note !== 'string' || note.trim().length < 1) {
      return res.status(400).json({ error: 'Rejection note is required' });
    }
    if (note.trim().length > 500) {
      return res.status(400).json({ error: 'Rejection note must be 500 characters or fewer' });
    }

    const contribution = await prisma.airlineFactContribution.findUnique({
      where: { id: req.params.id },
    });
    if (!contribution) return res.status(404).json({ error: 'Contribution not found' });
    if (contribution.status !== 'PENDING') return res.status(409).json({ error: 'Already processed' });

    const updated = await prisma.airlineFactContribution.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED',
        reviewerId: req.pilot.id,
        reviewedAt: new Date(),
        reviewNote: note.trim(),
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};
