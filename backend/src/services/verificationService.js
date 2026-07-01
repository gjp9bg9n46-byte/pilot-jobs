'use strict';

// Email-verification token helpers (Phase B2), shared by the pilot + employer
// registration paths and the /auth/resend-verification endpoint.

const crypto = require('crypto');
const prisma = require('../config/database');
const logger = require('../config/logger');
const { sendEmail } = require('./emailService');
const { renderWelcomeVerifyEmail, renderResendVerifyEmail } = require('./emailTemplates');

const APP_URL = process.env.APP_URL || 'https://cockpithire.com';
const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — welcome emails may sit unread

function verifyUrlFor(userType, token) {
  return userType === 'employer'
    ? `${APP_URL}/employer/verify-email?token=${token}`
    : `${APP_URL}/verify-email?token=${token}`;
}

async function createToken(email, userType) {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.emailVerificationToken.create({
    data: { token, email, userType, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
  });
  return token;
}

// Fire-and-log welcome + verify on registration. NEVER throws — a failed email
// must not fail the registration (the user is already created; they can resend).
async function sendWelcomeVerify({ email, userType, recipientName, employerPendingApproval = false }) {
  try {
    const token = await createToken(email, userType);
    const result = await sendEmail({
      to: [email],
      subject: 'Welcome to CockpitHire — verify your email',
      html: renderWelcomeVerifyEmail({ recipientName, verifyUrl: verifyUrlFor(userType, token), userType, employerPendingApproval }),
      tags: { type: 'welcome-verify', userType, phase: 'B2' },
    });
    if (!result.success) {
      logger.error({ message: `welcome_verify_email_failed | ${email} | ${result.error}`, type: 'welcome_verify_email_failed', email, error: result.error });
    }
  } catch (err) {
    logger.error({ message: `welcome_verify_failed | ${email} | ${err.message}`, type: 'welcome_verify_failed', email, error: err.message });
  }
}

// Resend: delete existing unused tokens for this email, then create + send a new
// one. Returns the sendEmail result ({ success, ... }).
async function sendResendVerify({ email, userType, recipientName }) {
  await prisma.emailVerificationToken.deleteMany({ where: { email, usedAt: null } });
  const token = await createToken(email, userType);
  return sendEmail({
    to: [email],
    subject: 'Verify your CockpitHire email',
    html: renderResendVerifyEmail({ recipientName, verifyUrl: verifyUrlFor(userType, token) }),
    tags: { type: 'resend-verify', userType, phase: 'B2' },
  });
}

module.exports = { sendWelcomeVerify, sendResendVerify, verifyUrlFor };
