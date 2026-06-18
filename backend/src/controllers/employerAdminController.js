'use strict';

const prisma = require('../config/database');
const { notifyEmployerApproved, notifyEmployerRejected, notifyEmployerSuspended } = require('../services/employerEmails');
const logger = require('../config/logger');

// Public-safe employer projection (never exposes passwordHash).
const EMPLOYER_SELECT = {
  id: true,
  companyName: true,
  companyType: true,
  country: true,
  headquartersCity: true,
  website: true,
  description: true,
  logoUrl: true,
  iataCode: true,
  icaoCode: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  status: true,
  approvedAt: true,
  approvedBy: true,
  rejectionReason: true,
  airlineId: true,
  lastActiveAt: true,
  createdAt: true,
  updatedAt: true,
};

exports.listPendingEmployers = async (req, res, next) => {
  try {
    const employers = await prisma.employer.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' }, // oldest first
      select: EMPLOYER_SELECT,
    });
    res.json(employers);
  } catch (err) {
    next(err);
  }
};

// All employers (every status) for the moderation UI's tabs, with a job count
// for the detail view. No passwordHash (EMPLOYER_SELECT).
exports.listEmployers = async (req, res, next) => {
  try {
    const employers = await prisma.employer.findMany({
      orderBy: { createdAt: 'desc' },
      select: { ...EMPLOYER_SELECT, _count: { select: { postedJobs: true } } },
    });
    res.json(employers);
  } catch (err) {
    next(err);
  }
};

exports.approveEmployer = async (req, res, next) => {
  try {
    const employer = await prisma.employer.findUnique({ where: { id: req.params.id } });
    if (!employer) return res.status(404).json({ error: 'Employer not found' });

    // Idempotent: already approved → return unchanged, no duplicate email.
    if (employer.status === 'APPROVED') {
      const { passwordHash, ...rest } = employer;
      return res.json(rest);
    }

    const updated = await prisma.employer.update({
      where: { id: employer.id },
      data: { status: 'APPROVED', approvedAt: new Date(), approvedBy: req.pilot.id },
      select: EMPLOYER_SELECT,
    });

    notifyEmployerApproved(updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.rejectEmployer = async (req, res, next) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length < 1 || reason.length > 500) {
      return res.status(400).json({ error: 'A rejection reason (1–500 characters) is required.' });
    }

    const employer = await prisma.employer.findUnique({ where: { id: req.params.id } });
    if (!employer) return res.status(404).json({ error: 'Employer not found' });

    if (employer.status === 'REJECTED') {
      const { passwordHash, ...rest } = employer;
      return res.json(rest);
    }

    const updated = await prisma.employer.update({
      where: { id: employer.id },
      data: { status: 'REJECTED', rejectionReason: reason },
      select: EMPLOYER_SELECT,
    });

    notifyEmployerRejected(updated, reason);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.suspendEmployer = async (req, res, next) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length < 1 || reason.length > 500) {
      return res.status(400).json({ error: 'A suspension reason (1–500 characters) is required.' });
    }

    const employer = await prisma.employer.findUnique({ where: { id: req.params.id } });
    if (!employer) return res.status(404).json({ error: 'Employer not found' });

    if (employer.status === 'SUSPENDED') {
      const { passwordHash, ...rest } = employer;
      return res.json(rest);
    }

    // Suspension blocks NEW posting (via requireApprovedEmployer); existing jobs
    // are intentionally left untouched.
    const updated = await prisma.employer.update({
      where: { id: employer.id },
      data: { status: 'SUSPENDED', rejectionReason: reason },
      select: EMPLOYER_SELECT,
    });

    logger.info({ type: 'employer_suspended', employerId: updated.id, reason });
    notifyEmployerSuspended(updated, reason);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.listPendingJobs = async (req, res, next) => {
  try {
    // Dormant in v1 (approved employers auto-approve their jobs) — returns [].
    const jobs = await prisma.job.findMany({
      where: { moderationStatus: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    res.json(jobs);
  } catch (err) {
    next(err);
  }
};
