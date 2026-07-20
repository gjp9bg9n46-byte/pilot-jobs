const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const prisma = require('../config/database');
const logger = require('../config/logger');
const { sendEmail } = require('../services/emailService');
const { renderPasswordResetEmail } = require('../services/emailTemplates');
const { sendWelcomeVerify, sendResendVerify } = require('../services/verificationService');

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
    // Registration is email+password only (owner directive: keep signup
    // frictionless) — name defaults to the email's local part and can be
    // completed later on the Profile page.
    const defaultName = firstName || String(email).split('@')[0];
    const pilot = await prisma.pilot.create({
      data: { email, passwordHash, firstName: defaultName, lastName: lastName || '', phone, country, city },
      select: { id: true, email: true, firstName: true, lastName: true, emailVerified: true },
    });

    const token = signToken(pilot.id);
    await createSession(pilot.id, req, token);
    // Welcome + verify email (Phase B2) — never blocks registration.
    await sendWelcomeVerify({ email: pilot.email, userType: 'pilot', recipientName: [pilot.firstName, pilot.lastName].filter(Boolean).join(' ') || pilot.email });
    res.status(201).json({ token, pilot });
  } catch (err) {
    next(err);
  }
};

// Google sign-in: the client obtains an ID token from Google and posts it
// here. We verify it against Google's official tokeninfo endpoint (checks the
// signature server-side), confirm it was issued for OUR client ID and that the
// email is verified, then find-or-create the pilot and issue our normal JWT.
// Existing email/password accounts with the same email simply log in — one
// account per email, regardless of sign-in method.
exports.googleAuth = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(503).json({ error: 'Google sign-in not configured' });
    if (!idToken) return res.status(400).json({ error: 'idToken required' });

    const axios = require('axios');
    let claims;
    try {
      const { data } = await axios.get(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
        { timeout: 10000 },
      );
      claims = data;
    } catch {
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    if (claims.aud !== clientId) return res.status(401).json({ error: 'Token not issued for this app' });
    if (claims.email_verified !== 'true' && claims.email_verified !== true) {
      return res.status(401).json({ error: 'Google email not verified' });
    }

    const email = String(claims.email).toLowerCase();
    let pilot = await prisma.pilot.findUnique({ where: { email } });
    if (pilot?.deletedAt) return res.status(403).json({ error: 'This account has been deleted.' });

    let created = false;
    if (!pilot) {
      // Random unguessable password — the account can always add a real one
      // later via password reset; Google remains the sign-in method.
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      pilot = await prisma.pilot.create({
        data: {
          email,
          passwordHash,
          firstName: claims.given_name || String(email).split('@')[0],
          lastName: claims.family_name || '',
          emailVerified: true, // Google already verified ownership
        },
      });
      created = true;
      logger.info({ pilotId: pilot.id, msg: 'pilot created via Google sign-in' });
    }

    const token = signToken(pilot.id);
    await createSession(pilot.id, req, token);
    const { passwordHash: _ph, ...pilotData } = pilot;
    res.status(created ? 201 : 200).json({ token, pilot: pilotData });
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

// ─── Email verification (Phase B2) — shared by pilots and employers ────────────

// POST /auth/verify-email  { token }  (public)
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Invalid verification link' });

    const record = await prisma.emailVerificationToken.findUnique({ where: { token } });
    if (!record) return res.status(400).json({ error: 'Invalid verification link' });
    if (record.usedAt) return res.status(200).json({ success: true, message: 'Email verified.' }); // idempotent
    if (record.expiresAt < new Date()) return res.status(400).json({ error: 'This link has expired. Request a new one.' });

    if (record.userType === 'employer') {
      await prisma.employer.updateMany({ where: { contactEmail: record.email }, data: { emailVerified: true } });
    } else {
      await prisma.pilot.updateMany({ where: { email: record.email }, data: { emailVerified: true } });
    }

    // Mark this token used + drop any other unused siblings for the email.
    await prisma.emailVerificationToken.update({ where: { token }, data: { usedAt: new Date() } });
    await prisma.emailVerificationToken.deleteMany({ where: { email: record.email, usedAt: null } });

    return res.json({ success: true, message: 'Email verified.' });
  } catch (err) {
    next(err);
  }
};

// POST /auth/resend-verification  (auth: pilot OR employer via authAnyUser)
exports.resendVerification = async (req, res, next) => {
  try {
    const { userType, email, emailVerified, name } = req.account;
    if (emailVerified) return res.status(400).json({ error: 'Email already verified' });

    const result = await sendResendVerify({ email, userType, recipientName: name });
    if (!result.success) {
      logger.error({ message: `resend_verify_email_failed | ${email} | ${result.error}`, type: 'resend_verify_email_failed', email, error: result.error });
    }
    // Don't leak delivery failures — token was created; tell the user to check.
    return res.json({ success: true, message: 'Verification link sent. Please check your email.' });
  } catch (err) {
    next(err);
  }
};
