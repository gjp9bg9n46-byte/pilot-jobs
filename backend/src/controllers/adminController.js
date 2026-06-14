'use strict';

const prisma = require('../config/database');

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

      const [airline, updated] = await Promise.all([
        tx.airline.update({
          where: { id: contribution.airlineId },
          data: { ...updateData, verifiedContributors: { increment: 1 } },
        }),
        tx.airlineFactContribution.update({
          where: { id: req.params.id },
          data: { status: 'APPROVED', reviewerId: req.pilot.id, reviewedAt: new Date() },
        }),
      ]);

      return { airline, contribution: updated };
    });

    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
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
