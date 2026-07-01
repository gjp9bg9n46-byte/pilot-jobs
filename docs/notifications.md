# Notifications (email)

Transactional + notification email for CockpitHire, sent via **[Resend](https://resend.com)**.

Phase A (this doc's baseline) ships the **foundation only** — the `emailService`
abstraction, a base HTML template, a test email, and an admin health-check
endpoint. No user-facing email feature is wired yet; existing trigger points
(employer approval stubs, application-status logs, etc.) still log-only until
their phase lands.

## Architecture

```
trigger point (controller)
      │  calls
      ▼
emailService.sendEmail({ to, subject, html, text?, tags? })
      │  renders via
      ▼
emailTemplates.render*()  ──►  renderBaseTemplate({ title, body, unsubscribeUrl? })
      │  sends via
      ▼
Resend SDK  ──►  notifications@cockpithire.com  ──►  recipient inbox
```

- **`src/services/emailService.js`** — the single send abstraction. Returns
  `{ success, id?, error? }` and **never throws** (an email failure must not break
  the calling transaction). Callers inspect `result.success`.
- **`src/services/emailTemplates.js`** — HTML template functions. Plain strings
  with **inline CSS** and **system fonts** (email clients strip `<style>` blocks
  and web fonts).

## Sender identity

Single sender, from env vars (set in Railway):

| Var | Value |
|-----|-------|
| `RESEND_API_KEY` | Resend API key (secret) |
| `RESEND_FROM_EMAIL` | `notifications@cockpithire.com` |
| `RESEND_FROM_NAME` | `CockpitHire` |

`from` is rendered as `CockpitHire <notifications@cockpithire.com>`. Reply-to is
**no-reply** (Phase A). A shared inbox can be wired in a later phase if needed.

## Adding a new email type

1. **Write a template** in `emailTemplates.js`:
   ```js
   function renderWelcomeEmail({ firstName }) {
     const body = `
       ${heading('Welcome to CockpitHire')}
       ${paragraph(`Hi ${firstName}, your account is ready…`)}
     `;
     return renderBaseTemplate({ title: 'Welcome to CockpitHire', body });
   }
   ```
   - Wrap everything in `renderBaseTemplate` for the shared header/footer.
   - Use the exported `heading()` / `paragraph()` helpers, or write inline-styled
     HTML directly. **Escape any user-supplied values** (`heading`/`paragraph`
     already escape; raw `body` HTML is inserted verbatim, so escape yourself).
   - Stay on the editorial-light palette (below).

2. **Call `sendEmail` from the trigger point**:
   ```js
   const { sendEmail } = require('../services/emailService');
   const { renderWelcomeEmail } = require('../services/emailTemplates');

   const result = await sendEmail({
     to: pilot.email,
     subject: 'Welcome to CockpitHire',
     html: renderWelcomeEmail({ firstName: pilot.firstName }),
     tags: { type: 'welcome' },        // shows up in the Resend dashboard for filtering
   });
   if (!result.success) logger.error(`welcome email failed: ${result.error}`);
   ```
   - `to` accepts a string or an array.
   - `text` is auto-generated from `html` if omitted (simple tag-strip fallback).
   - `tags` (object or `[{name,value}]`) become Resend tags for dashboard
     filtering. Names/values are sanitized to `[A-Za-z0-9_-]`.
   - On rate-limit (429) `sendEmail` retries once after 1s, then gives up and
     logs.

## Template palette + constraints

Editorial-light, inline only:

| Token | Hex |
|-------|-----|
| Background (cream) | `#F8F6F1` |
| Card surface | `#FFFFFF` |
| Text | `#0F1419` |
| Muted text | `#5B6673` |
| Accent (navy) | `#003F88` |
| Border | `#E4E0D7` |

Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`.
No web fonts, no `<style>` blocks, no external CSS — everything inline.

## Unsubscribe

- **Phase A:** `renderBaseTemplate` renders an Unsubscribe link in the footer
  **only when** an `unsubscribeUrl` is passed (a signed-token URL). Marketing /
  digest emails should pass it; transactional emails (password reset, etc.) omit
  it.
- **Phase F:** a full notification-preferences UI ships in Settings (depends on
  the Settings preferences schema-drift fix in the backend cluster).

## Testing

### Local (no key)
When `RESEND_API_KEY` is unset, `sendEmail` **logs the intended send** and returns
`{ success: true, id: 'log-only-<ts>' }` — nothing is actually sent, so local dev
and tests don't require a key or hit the network.

### Unit tests
`src/services/emailService.test.js` (run `npm test`) covers the log-only stub, the
mock success/error shapes (via `__setClientForTests`), the 429 retry, tag
normalization, `htmlToText`, and template rendering.

### Live health check (admin-only)
```
POST /api/admin/notifications/test      (Bearer <admin JWT>)
→ 200 { success: true, messageId, sentTo }
```
Sends the test email to the **calling admin's own address**. Any admin can trigger
it from their session to confirm inbox delivery.

## Resend dashboard

Delivery status, opens, bounces, and per-message logs live in the Resend
dashboard: <https://resend.com/emails>. Filter by the `tags` set on each send
(e.g. `type=test`). Domain / DNS / deliverability config is under
<https://resend.com/domains> (`cockpithire.com`, verified).

## Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **A** | Foundation: emailService + base template + health-check endpoint | ✅ shipped |
| **B** | Auth transactional: password reset, email verification, welcome | next |
| **C** | ATS: applicant emails, employer digest, pilot status | after B |
| **D** | Contributions + admin: approve/reject, suspend notifications | after C |
| **E** | Alerts: job-alert emails per saved-search frequency | after D |
| **F** | Preferences UI in Settings (needs Settings schema-drift fix) | after E |
