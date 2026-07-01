'use strict';

// ─── Email templates ──────────────────────────────────────────────────────────
// Plain HTML strings with a shared header/footer (renderBaseTemplate). Email
// clients strip <style> and web fonts, so everything is INLINE CSS + system
// fonts. Palette matches the editorial-light app: cream bg, near-black text,
// navy accent. Add a new email type by writing a render*() that wraps
// renderBaseTemplate({ title, body, unsubscribeUrl? }).

const BG = '#F8F6F1';      // cream
const SURFACE = '#FFFFFF'; // card
const TEXT = '#0F1419';    // near-black
const MUTED = '#5B6673';   // secondary text
const ACCENT = '#003F88';  // navy
const BORDER = '#E4E0D7';
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Base wrapper: header (CockpitHire wordmark) + body slot + footer.
 * @param {{ title: string, body: string, unsubscribeUrl?: string }} opts
 *   `body` is inserted verbatim (already-safe HTML). `title` is escaped.
 */
function renderBaseTemplate({ title, body, unsubscribeUrl } = {}) {
  const unsubscribeLine = unsubscribeUrl
    ? `<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:${MUTED};">
         Don't want these emails?
         <a href="${esc(unsubscribeUrl)}" style="color:${ACCENT};text-decoration:underline;">Unsubscribe</a>.
       </p>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${esc(title || 'CockpitHire')}</title>
  </head>
  <body style="margin:0;padding:0;background:${BG};color:${TEXT};font-family:${FONT};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(title || '')}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
            <tr>
              <td style="padding:0 8px 16px;">
                <span style="font-size:20px;font-weight:800;letter-spacing:-0.01em;color:${ACCENT};">CockpitHire</span>
                <span style="font-size:12px;color:${MUTED};margin-left:8px;">Aviation careers worldwide</span>
              </td>
            </tr>
            <tr>
              <td style="background:${SURFACE};border:1px solid ${BORDER};border-radius:12px;padding:28px 28px 24px;">
                ${body || ''}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 8px 0;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED};">
                  Sent by CockpitHire · <a href="https://cockpithire.com" style="color:${ACCENT};text-decoration:none;">cockpithire.com</a>
                </p>
                ${unsubscribeLine}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Reusable body building blocks (keep templates consistent).
function heading(text) {
  return `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:700;color:${TEXT};">${esc(text)}</h1>`;
}
function paragraph(text) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${TEXT};">${esc(text)}</p>`;
}

// Email-safe CTA button (table-wrapped, inline styles, white text on navy).
function ctaButton(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
    <tr>
      <td style="border-radius:6px;background:${ACCENT};">
        <a href="${esc(url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:6px;">${esc(label)}</a>
      </td>
    </tr>
  </table>`;
}

/** Password reset email (Phase B1). */
function renderPasswordResetEmail({ recipientName, resetUrl, expiresInMinutes = 60 } = {}) {
  const greeting = recipientName ? `Hi ${esc(recipientName)},` : 'Hi,';
  const body = `
    ${heading('Reset your password')}
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${TEXT};">${greeting}</p>
    ${paragraph(`You (or someone using this email address) requested to reset the password for your CockpitHire account. Click the button below to set a new password. This link expires in ${Number(expiresInMinutes)} minutes.`)}
    ${ctaButton('Reset password', resetUrl)}
    <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${esc(resetUrl)}" style="color:${ACCENT};word-break:break-all;">${esc(resetUrl)}</a>
    </p>
    <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">
      If you didn't request this, you can safely ignore this email — your password won't change.
    </p>
  `;
  return renderBaseTemplate({ title: 'Reset your CockpitHire password', body });
}

/** Phase-A health-check email. */
function renderTestEmail({ recipientName } = {}) {
  const greeting = recipientName ? `Hi ${esc(recipientName)},` : 'Hi,';
  const body = `
    ${heading('Notifications are live')}
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${TEXT};">${greeting}</p>
    ${paragraph("This is a test email from CockpitHire's notification system. If you can read this, the Resend integration is working correctly.")}
    <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">Sent from the admin health-check endpoint.</p>
  `;
  return renderBaseTemplate({ title: 'CockpitHire notifications test', body });
}

module.exports = { renderBaseTemplate, renderTestEmail, renderPasswordResetEmail, ctaButton, heading, paragraph, PALETTE: { BG, SURFACE, TEXT, MUTED, ACCENT, BORDER } };
