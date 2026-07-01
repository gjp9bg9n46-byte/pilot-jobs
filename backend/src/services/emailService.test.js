'use strict';

// Unit tests for the email foundation (Phase A). Run: node --test (npm test).
// No network / no Resend key required — the real client is replaced with a fake
// via __setClientForTests, and the log-only path exercises the keyless branch.

const { test } = require('node:test');
const assert = require('node:assert');
const { sendEmail, htmlToText, normalizeTags, __setClientForTests } = require('./emailService');
const { renderBaseTemplate, renderTestEmail } = require('./emailTemplates');

const KEY = 'RESEND_API_KEY';
const withKey = (v, fn) => { const prev = process.env[KEY]; if (v == null) delete process.env[KEY]; else process.env[KEY] = v; return Promise.resolve(fn()).finally(() => { if (prev == null) delete process.env[KEY]; else process.env[KEY] = prev; }); };

// ── (c) log-only stub when no key ──────────────────────────────────────────────
test('sendEmail: no RESEND_API_KEY → log-only stub, success shape, does not crash', () =>
  withKey(null, async () => {
    const r = await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '<p>x</p>' });
    assert.strictEqual(r.success, true);
    assert.match(r.id, /^log-only-\d+$/);
  }));

// ── (b) mock success / error shapes ────────────────────────────────────────────
test('sendEmail: with a mock client → { success: true, id } on success', () =>
  withKey('re_test', async () => {
    let sent = null;
    __setClientForTests({ emails: { send: async (p) => { sent = p; return { data: { id: 'mock-123' }, error: null }; } } });
    const r = await sendEmail({ to: 'admin@x.com', subject: 'S', html: '<p>hello</p>', tags: { type: 'test' } });
    assert.deepStrictEqual(r, { success: true, id: 'mock-123' });
    assert.strictEqual(sent.from, `${process.env.RESEND_FROM_NAME || 'CockpitHire'} <${process.env.RESEND_FROM_EMAIL}>`);
    assert.deepStrictEqual(sent.to, ['admin@x.com']);
    assert.deepStrictEqual(sent.tags, [{ name: 'type', value: 'test' }]);
    assert.ok(sent.text && sent.text.includes('hello'), 'text auto-generated from html');
    __setClientForTests(null);
  }));

test('sendEmail: Resend error → { success: false, error } (never throws)', () =>
  withKey('re_test', async () => {
    __setClientForTests({ emails: { send: async () => ({ data: null, error: { message: 'boom' } }) } });
    const r = await sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>x</p>' });
    assert.deepStrictEqual(r, { success: false, error: 'boom' });
    __setClientForTests(null);
  }));

test('sendEmail: thrown network error is caught → { success: false }', () =>
  withKey('re_test', async () => {
    __setClientForTests({ emails: { send: async () => { throw new Error('network down'); } } });
    const r = await sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>x</p>' });
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.error, 'network down');
    __setClientForTests(null);
  }));

// ── 429 retry-once ─────────────────────────────────────────────────────────────
test('sendEmail: 429 rate-limit retries once then succeeds', () =>
  withKey('re_test', async () => {
    let calls = 0;
    __setClientForTests({ emails: { send: async () => { calls += 1; return calls === 1 ? { error: { statusCode: 429, message: 'rate limit' } } : { data: { id: 'ok-after-retry' } }; } } });
    const r = await sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>x</p>' });
    assert.strictEqual(calls, 2);
    assert.deepStrictEqual(r, { success: true, id: 'ok-after-retry' });
    __setClientForTests(null);
  }));

test('sendEmail: no recipient → { success: false }', async () => {
  const r = await sendEmail({ to: [], subject: 'S', html: '<p>x</p>' });
  assert.strictEqual(r.success, false);
});

// ── helpers ────────────────────────────────────────────────────────────────────
test('normalizeTags: object and array → [{name,value}] sanitized', () => {
  assert.deepStrictEqual(normalizeTags({ type: 'test', phase: 'A' }), [{ name: 'type', value: 'test' }, { name: 'phase', value: 'A' }]);
  assert.deepStrictEqual(normalizeTags([{ name: 'a b', value: 'c@d' }]), [{ name: 'a_b', value: 'c_d' }]);
  assert.deepStrictEqual(normalizeTags(undefined), []);
});

test('htmlToText: strips tags, keeps readable text', () => {
  const t = htmlToText('<h1>Title</h1><p>Line one</p><p>Line two &amp; more</p>');
  assert.match(t, /Title/);
  assert.match(t, /Line one/);
  assert.match(t, /Line two & more/);
  assert.ok(!/</.test(t), 'no angle brackets remain');
});

// ── (d) template rendering ─────────────────────────────────────────────────────
test('renderBaseTemplate: valid HTML with inline styles + palette', () => {
  const html = renderBaseTemplate({ title: 'T', body: '<p>Body here</p>' });
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /CockpitHire/);
  assert.match(html, /Body here/);
  assert.match(html, /#F8F6F1/);      // cream bg
  assert.match(html, /#003F88/);      // navy accent
  assert.match(html, /style="/);      // inline styles
  assert.match(html, /Sent by CockpitHire/);
  assert.ok(!/<style/i.test(html), 'no <style> blocks (clients strip them)');
});

test('renderBaseTemplate: unsubscribe link only when unsubscribeUrl provided', () => {
  assert.ok(!/Unsubscribe/i.test(renderBaseTemplate({ title: 'T', body: 'x' })));
  assert.match(renderBaseTemplate({ title: 'T', body: 'x', unsubscribeUrl: 'https://c.h/u?t=abc' }), /Unsubscribe/i);
});

test('renderTestEmail: contains the expected copy + recipient name', () => {
  const html = renderTestEmail({ recipientName: 'Jane' });
  assert.match(html, /Hi Jane,/);
  assert.match(html, /Resend integration is working correctly/);
});

// ── Password reset template (Phase B1) ─────────────────────────────────────────
const { renderPasswordResetEmail } = require('./emailTemplates');
test('renderPasswordResetEmail: greeting, CTA to resetUrl, expiry, ignore-note', () => {
  const url = 'https://cockpithire.com/reset-password?token=abc123';
  const html = renderPasswordResetEmail({ recipientName: 'Jane', resetUrl: url, expiresInMinutes: 60 });
  assert.match(html, /Hi Jane,/);
  assert.match(html, /Reset password/);
  assert.ok(html.includes(url), 'CTA links to the reset URL');
  assert.match(html, /expires in 60 minutes/);
  assert.match(html, /you can safely ignore this email/i);
  assert.match(html, /#003F88/); // navy CTA button
});

// ── Welcome + verify templates (Phase B2) ──────────────────────────────────────
const { renderWelcomeVerifyEmail, renderResendVerifyEmail } = require('./emailTemplates');
test('renderWelcomeVerifyEmail: pilot copy + CTA + optional footnote', () => {
  const url = 'https://cockpithire.com/verify-email?token=t1';
  const html = renderWelcomeVerifyEmail({ recipientName: 'Jane', verifyUrl: url, userType: 'pilot' });
  assert.match(html, /Welcome to CockpitHire, Jane!/);
  assert.match(html, /job alerts and application updates/);
  assert.ok(html.includes(url));
  assert.match(html, /Verification is optional/);
});
test('renderWelcomeVerifyEmail: employer PENDING copy', () => {
  const html = renderWelcomeVerifyEmail({ recipientName: 'Acme Air', verifyUrl: 'https://x/v?token=t', userType: 'employer', employerPendingApproval: true });
  assert.match(html, /Welcome to CockpitHire, Acme Air!/);
  assert.match(html, /pending approval/);
});
test('renderResendVerifyEmail: greeting + CTA', () => {
  const html = renderResendVerifyEmail({ recipientName: 'Jane', verifyUrl: 'https://x/v?token=t' });
  assert.match(html, /Hi Jane,/);
  assert.match(html, /Verify email/);
});
