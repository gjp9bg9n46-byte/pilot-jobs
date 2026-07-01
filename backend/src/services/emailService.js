'use strict';

// ─── Email service (Resend) ───────────────────────────────────────────────────
// Single abstraction every notification goes through. Callers get a predictable
// { success, id?, error? } shape and this NEVER throws — an email failure must
// not break the calling transaction. When RESEND_API_KEY is unset (local dev),
// sends are logged only, preserving the old stub behaviour.
//
// Adding a new email type: write a template in emailTemplates.js and call
// sendEmail() from the trigger point. See docs/notifications.md.

const { Resend } = require('resend');
const logger = require('../config/logger');

// Lazily created so the module loads fine without a key (dev / test).
let client = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Test seam — inject a fake client in unit tests.
function __setClientForTests(fake) { client = fake; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Very small HTML → text fallback (block tags → newlines, strip the rest,
// decode a handful of entities, collapse whitespace).
function htmlToText(html) {
  return String(html || '')
    .replace(/<\s*(br|\/p|\/div|\/tr|\/h[1-6]|\/li)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim();
}

// Normalize `tags` (object {k:v} or array [{name,value}]) to Resend's tag shape.
// Resend restricts tag name/value to ASCII letters, numbers, _ and -.
function normalizeTags(tags) {
  if (!tags) return [];
  const clean = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256);
  const entries = Array.isArray(tags)
    ? tags.map((t) => [t.name, t.value])
    : Object.entries(tags);
  return entries
    .filter(([n, v]) => n != null && v != null)
    .map(([n, v]) => ({ name: clean(n), value: clean(v) }));
}

function isRateLimit(err) {
  return err?.statusCode === 429 || /rate.?limit|too.?many/i.test(`${err?.name || ''} ${err?.message || ''}`);
}

/**
 * Send an email. Never throws.
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendEmail({ to, subject, html, text, tags } = {}) {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : (to ? [to] : []);

  if (recipients.length === 0) {
    return { success: false, error: 'No recipient' };
  }

  // Dev / no-key: log the intended send and return a synthetic id.
  if (!process.env.RESEND_API_KEY) {
    logger.info({
      message: `email_log_only | to=${recipients.join(',')} | subject=${subject}`,
      type: 'email_log_only', to: recipients, subject,
    });
    return { success: true, id: `log-only-${Date.now()}` };
  }

  if (!client) client = new Resend(process.env.RESEND_API_KEY);

  const payload = {
    from: `${process.env.RESEND_FROM_NAME || 'CockpitHire'} <${process.env.RESEND_FROM_EMAIL}>`,
    to: recipients,
    subject,
    html,
    text: text || htmlToText(html),
  };
  const normTags = normalizeTags(tags);
  if (normTags.length) payload.tags = normTags;

  const attempt = async () => {
    try {
      const { data, error } = await client.emails.send(payload);
      return error ? { error } : { data };
    } catch (err) {
      return { error: { message: err.message, statusCode: err.statusCode, name: err.name } };
    }
  };

  let result = await attempt();
  if (result.error && isRateLimit(result.error)) {
    await sleep(1000); // one retry on rate-limit
    result = await attempt();
  }

  if (result.error) {
    logger.error({
      message: `email_send_failed | to=${recipients.join(',')} | ${result.error.message}`,
      type: 'email_send_failed', error: result.error.message, to: recipients, subject,
    });
    return { success: false, error: result.error.message };
  }

  return { success: true, id: result.data?.id };
}

module.exports = { sendEmail, htmlToText, normalizeTags, __setClientForTests };
