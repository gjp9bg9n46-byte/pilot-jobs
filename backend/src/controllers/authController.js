const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const prisma = require('../config/database');
const logger = require('../config/logger');
const { sendEmail } = require('../services/emailService');
const { renderPasswordResetEmail } = require('../services/emailTemplates');

const APP_URL = process.env.APP_URL || 'https://cockpithire.com';
const RESET_TOKEN_TTL_MIN = 60;

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function createSession(pilotId, req, token) {
  const tokenHash = hashToken(token);
  const userAgent = req.headers['user-agent'] ?? null;
  const ip = req.ip ?? null;
  // Derive a friendly device label from UA
  let deviceLabel = 'Unknown device';
  if (userAgent) {
    if (/iPhone|iPad|iOS/.test(userAgent)) deviceLabel = 'iPhone / iPad';
    else if (/Android/.test(userAgent)) deviceLabel = 'Android device';
    else if (/Mac/.test(userAgent)) deviceLabel = 'Mac';
    else if (/Windows/.test(userAgent)) deviceLabel = 'Windows PC';
  }
  await prisma.pilotSession.upsert({
    where: { tokenHash },
    update: { lastUsedAt: new Date(), lastIp: ip },
    create: { pilotId, tokenHash, deviceLabel, lastIp: ip, lastUsedAt: new Date() },
  });
}

exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { email, password, firstName, lastName, phone, country, city } = req.body;

    const exists = await prisma.pilot.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const pilot = await prisma.pilot.create({
      data: { email, passwordHash, firstName, lastName: lastName || '', phone, country, city },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    const token = signToken(pilot.id);
    await createSession(pilot.id, req, token);
    res.status(201).json({ token, pilot });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const pilot = await prisma.pilot.findUnique({ where: { email } });
    if (!pilot || !(await bcrypt.compare(password, pilot.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (pilot.deletedAt) {
      return res.status(403).json({ error: 'This account has been deleted.' });
    }

    const token = signToken(pilot.id);
    await createSession(pilot.id, req, token);
    const { passwordHash, ...pilotData } = pilot;
    res.json({ token, pilot: pilotData });
  } catch (err) {
    next(err);
  }
};

exports.updateFcmToken = async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    await prisma.pilot.update({ where: { id: req.pilot.id }, data: { fcmToken: fcmToken ?? null } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res) => {
  const { passwordHash, ...pilot } = req.pilot;
  res.json(pilot);
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(422).json({ error: 'New password must be at least 8 characters' });
    }
    const pilot = await prisma.pilot.findUnique({ where: { id: req.pilot.id } });
    const valid = await bcrypt.compare(currentPassword, pilot.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.pilot.update({ where: { id: req.pilot.id }, data: { passwordHash } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.deleteAccount = async (req, res, next) => {
  try {
    const { password } = req.body;
    const pilot = await prisma.pilot.findUnique({ where: { id: req.pilot.id } });
    const valid = await bcrypt.compare(password, pilot.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Password is incorrect' });
    // Hard delete; soft-delete variant: update({ deletedAt: new Date() }) + a cleanup cron
    await prisma.pilot.delete({ where: { id: req.pilot.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── Sessions ────────────────────────────────────────────────────────────────

exports.getSessions = async (req, res, next) => {
  try {
    const currentToken = req.headers.authorization?.replace('Bearer ', '') ?? '';
    const currentHash  = hashToken(currentToken);
    const sessions = await prisma.pilotSession.findMany({
      where: { pilotId: req.pilot.id },
      orderBy: { lastUsedAt: 'desc' },
    });
    res.json(sessions.map((s) => ({ ...s, isCurrent: s.tokenHash === currentHash, tokenHash: undefined })));
  } catch (err) {
    next(err);
  }
};

exports.deleteSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    const session = await prisma.pilotSession.findUnique({ where: { id } });
    if (!session || session.pilotId !== req.pilot.id) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const currentToken = req.headers.authorization?.replace('Bearer ', '') ?? '';
    if (session.tokenHash === hashToken(currentToken)) {
      return res.status(400).json({ error: 'Cannot sign out the current session this way' });
    }
    await prisma.pilotSession.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.deleteAllSessions = async (req, res, next) => {
  try {
    const currentToken = req.headers.authorization?.replace('Bearer ', '') ?? '';
    const currentHash  = hashToken(currentToken);
    await prisma.pilotSession.deleteMany({
      where: { pilotId: req.pilot.id, NOT: { tokenHash: currentHash } },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── Password reset (Phase B1) — shared by pilots and employers ────────────────

// Neutral response — never reveals whether an email is registered.
const FORGOT_RESPONSE = {
  success: true,
  message: "If an account exists for this email, we've sent a reset link.",
};

// POST /auth/forgot-password  { email }
exports.forgotPassword = async (req, res, next) => {
  try {
    const input = (req.body.email || '').trim();
    if (!input) return res.status(200).json(FORGOT_RESPONSE); // don't leak validation state

    // Resolve account type (pilot first, then employer), case-insensitively —
    // emails are stored as-typed at registration.
    const pilot = await prisma.pilot.findFirst({ where: { email: { equals: input, mode: 'insensitive' } } });
    const employer = pilot ? null : await prisma.employer.findFirst({ where: { contactEmail: { equals: input, mode: 'insensitive' } } });
    const userType = pilot ? 'pilot' : (employer ? 'employer' : null);

    if (!userType) return res.status(200).json(FORGOT_RESPONSE); // unknown email → still 200

    // Store + send to the canonical (stored) address, not what was typed.
    const email = pilot ? pilot.email : employer.contactEmail;
    const token = crypto.randomBytes(32).toString('hex'); // ~64 chars
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);
    await prisma.passwordResetToken.create({ data: { token, email, userType, expiresAt } });

    const resetUrl = userType === 'employer'
      ? `${APP_URL}/employer/reset-password?token=${token}`
      : `${APP_URL}/reset-password?token=${token}`;
    const recipientName = pilot
      ? [pilot.firstName, pilot.lastName].filter(Boolean).join(' ') || email
      : (employer.contactName || employer.companyName || email);

    const result = await sendEmail({
      to: [email],
      subject: 'Reset your CockpitHire password',
      html: renderPasswordResetEmail({ recipientName, resetUrl, expiresInMinutes: RESET_TOKEN_TTL_MIN }),
      tags: { type: 'password-reset', userType, phase: 'B1' },
    });
    if (!result.success) {
      logger.error({ message: `password_reset_email_failed | ${email} | ${result.error}`, type: 'password_reset_email_failed', email, error: result.error });
    }

    // Always 200 (don't leak existence or delivery failures).
    return res.status(200).json(FORGOT_RESPONSE);
  } catch (err) {
    next(err);
  }
};

// POST /auth/reset-password  { token, newPassword }
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token) return res.status(400).json({ error: 'Invalid or expired reset link' });
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(422).json({ error: 'New password must be at least 8 characters' });
    }

    const record = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record) return res.status(400).json({ error: 'Invalid or expired reset link' });
    if (record.usedAt) return res.status(400).json({ error: 'This reset link has already been used.' });
    if (record.expiresAt < new Date()) return res.status(400).json({ error: 'This reset link has expired. Request a new one.' });

    const passwordHash = await bcrypt.hash(newPassword, 12);

    if (record.userType === 'employer') {
      const employer = await prisma.employer.findUnique({ where: { contactEmail: record.email } });
      if (!employer) return res.status(400).json({ error: 'Invalid or expired reset link' });
      await prisma.employer.update({ where: { id: employer.id }, data: { passwordHash } });
    } else {
      const pilot = await prisma.pilot.findUnique({ where: { email: record.email } });
      if (!pilot) return res.status(400).json({ error: 'Invalid or expired reset link' });
      await prisma.pilot.update({ where: { id: pilot.id }, data: { passwordHash } });
    }

    // Mark this token used + invalidate any other unused tokens for the same email.
    await prisma.passwordResetToken.updateMany({
      where: { email: record.email, usedAt: null },
      data: { usedAt: new Date() },
    });

    return res.json({ success: true, message: 'Password updated. You can now sign in with your new password.' });
  } catch (err) {
    next(err);
  }
};
