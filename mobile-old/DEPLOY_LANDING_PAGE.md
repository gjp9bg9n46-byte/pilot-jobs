# Make cockpithire.com show a landing page instead of being blank

Paste this into Claude Code in VS Code at the repo root (`pilot-jobs/`). Operational. Backend already deployed to Railway. The domain resolves but `GET /` returns nothing because the Express app only mounts `/api/*` routes. We're adding a static landing page so the root URL renders.

---

## 0. Read first

- `backend/src/index.js` (or whatever the Express entry file is — `app.js`, `server.js`) — confirm the API is mounted under `/api` and that the file uses either ESM (`import` syntax) or CommonJS (`require`). This affects how we add the static file middleware.
- `backend/package.json` — confirm `express` is already a dependency (it has to be, but verify).

## 1. Create three static files

Make a new directory `backend/public/` and write these three files into it.

### `backend/public/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CockpitHire — Pilot jobs, matched to your licence</title>
  <meta name="description" content="Find airline and aviation pilot jobs worldwide, automatically matched to your licences, hours, and ratings." />
  <meta property="og:title" content="CockpitHire — Pilot jobs, matched to your licence" />
  <meta property="og:description" content="Find airline and aviation pilot jobs worldwide, automatically matched to your licences, hours, and ratings." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://cockpithire.com" />
  <meta name="theme-color" content="#0A1628" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Ctext%20y='26'%20font-size='28'%3E%E2%9C%88%3C/text%3E%3C/svg%3E" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: #0A1628;
      color: #C0CDE0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

    header {
      position: sticky; top: 0; z-index: 10;
      background: rgba(10, 22, 40, 0.85);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid #243050;
    }
    .nav {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 24px;
    }
    .logo { color: #00B4D8; font-weight: 800; font-size: 20px; letter-spacing: 0.3px; text-decoration: none; }
    nav a {
      color: #C0CDE0; text-decoration: none; margin-left: 28px;
      font-weight: 500; font-size: 14px;
      transition: color 150ms ease;
    }
    nav a:hover { color: #00B4D8; }

    .hero {
      padding: 100px 0 120px;
      background:
        radial-gradient(ellipse 800px 400px at 50% 0%, rgba(0, 180, 216, 0.10), transparent 70%),
        #0A1628;
    }
    .hero h1 {
      font-size: 52px; font-weight: 800;
      color: #fff;
      line-height: 1.1;
      margin-bottom: 24px;
      max-width: 800px;
      letter-spacing: -0.5px;
    }
    .hero .subtitle {
      font-size: 20px; color: #C0CDE0;
      max-width: 640px;
      margin-bottom: 36px;
    }
    .accent { color: #00B4D8; }
    .cta {
      display: inline-block;
      background: #00B4D8; color: #0A1628;
      padding: 16px 32px;
      border-radius: 10px;
      font-weight: 700; font-size: 16px;
      text-decoration: none;
      transition: transform 150ms ease, box-shadow 150ms ease;
    }
    .cta:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0, 180, 216, 0.25); }

    section { border-top: 1px solid #243050; }
    .features { padding: 100px 0; }
    .features h2, .beta h2 {
      text-align: center;
      font-size: 36px;
      color: #fff;
      margin-bottom: 56px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }
    .card {
      background: #1B2B4B;
      border-radius: 14px;
      padding: 32px;
      border: 1px solid #243050;
      transition: border-color 200ms ease, transform 200ms ease;
    }
    .card:hover { border-color: #00B4D8; transform: translateY(-3px); }
    .card .icon { font-size: 32px; margin-bottom: 16px; }
    .card h3 { color: #fff; font-size: 19px; margin-bottom: 10px; font-weight: 700; }
    .card p { color: #7A8CA0; font-size: 15px; line-height: 1.6; }

    .beta {
      padding: 100px 0;
      text-align: center;
      background: linear-gradient(to bottom, transparent, rgba(0, 180, 216, 0.06));
    }
    .beta p { font-size: 18px; color: #C0CDE0; margin-bottom: 32px; max-width: 540px; margin-left: auto; margin-right: auto; }
    .email-line { display: block; margin-top: 18px; color: #7A8CA0; font-size: 14px; }
    .email-line a { color: #00B4D8; text-decoration: none; }

    footer {
      padding: 40px 0;
      border-top: 1px solid #243050;
    }
    .footer-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
    }
    .links { display: flex; gap: 24px; }
    .links a {
      color: #7A8CA0; text-decoration: none;
      font-size: 14px;
      transition: color 150ms ease;
    }
    .links a:hover { color: #00B4D8; }
    .copyright { color: #4A6080; font-size: 13px; }

    @media (max-width: 720px) {
      .hero { padding: 60px 0 80px; }
      .hero h1 { font-size: 34px; }
      .hero .subtitle { font-size: 17px; }
      .grid { grid-template-columns: 1fr; }
      nav a { margin-left: 16px; font-size: 13px; }
      .features, .beta { padding: 60px 0; }
      .features h2, .beta h2 { font-size: 26px; margin-bottom: 36px; }
      .nav { padding: 14px 20px; }
      .footer-row { flex-direction: column; align-items: flex-start; }
    }
  </style>
</head>
<body>
  <header>
    <div class="container nav">
      <a href="/" class="logo">✈ CockpitHire</a>
      <nav>
        <a href="#features">Features</a>
        <a href="#beta">Join Beta</a>
      </nav>
    </div>
  </header>

  <section class="hero">
    <div class="container">
      <h1>Pilot jobs, matched to your <span class="accent">licence</span>.</h1>
      <p class="subtitle">
        CockpitHire scans airline and aviation career sites worldwide and surfaces only the jobs you actually qualify for — based on your hours, ratings, and authorities. Stop scrolling. Start applying.
      </p>
      <a href="#beta" class="cta">Join the beta →</a>
    </div>
  </section>

  <section id="features" class="features">
    <div class="container">
      <h2>Built for working pilots</h2>
      <div class="grid">
        <div class="card">
          <div class="icon">🎯</div>
          <h3>Matched, not flooded</h3>
          <p>Tell us your licences, hours, and aircraft. We hide the jobs you don't qualify for so you only see the ones worth applying to.</p>
        </div>
        <div class="card">
          <div class="icon">📓</div>
          <h3>Logbook included</h3>
          <p>Import from ForeFlight or log new flights in seconds. Totals, currency tracking, and exports all live alongside your job search.</p>
        </div>
        <div class="card">
          <div class="icon">🔔</div>
          <h3>Real-time alerts</h3>
          <p>Get notified the moment an airline posts a role that fits your profile, with a clear breakdown of why it's a match.</p>
        </div>
      </div>
    </div>
  </section>

  <section id="beta" class="beta">
    <div class="container">
      <h2>Get on the beta list</h2>
      <p>We're in private beta. Send us a note and we'll get you in.</p>
      <a href="mailto:contact@cockpithire.com?subject=CockpitHire%20beta%20access" class="cta">Email us</a>
      <span class="email-line">or write to <a href="mailto:contact@cockpithire.com">contact@cockpithire.com</a></span>
    </div>
  </section>

  <footer>
    <div class="container footer-row">
      <a href="/" class="logo">✈ CockpitHire</a>
      <div class="links">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="mailto:contact@cockpithire.com">Contact</a>
      </div>
      <div class="copyright">© 2026 CockpitHire</div>
    </div>
  </footer>
</body>
</html>
```

### `backend/public/privacy.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Privacy Policy — CockpitHire</title>
  <style>
    body { background: #0A1628; color: #C0CDE0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 0 auto; padding: 60px 24px; line-height: 1.6; }
    h1 { color: #fff; margin-bottom: 8px; }
    .updated { color: #7A8CA0; font-size: 14px; margin-bottom: 32px; }
    h2 { color: #fff; margin-top: 32px; margin-bottom: 12px; font-size: 18px; }
    p, li { margin-bottom: 12px; }
    a { color: #00B4D8; }
    .home { display: inline-block; color: #00B4D8; margin-bottom: 24px; text-decoration: none; }
  </style>
</head>
<body>
  <a href="/" class="home">← Back</a>
  <h1>Privacy Policy</h1>
  <p class="updated">Last updated: 14 May 2026</p>

  <p>This policy describes how CockpitHire ("we", "our") collects, uses, and protects information when you use our mobile app and website.</p>

  <h2>What we collect</h2>
  <p>To match you to jobs, we collect the information you provide in your profile: name, email, contact details, licences and ratings, total and category flight hours, medical certificates, and aircraft type endorsements. We also collect flight log entries you create or import.</p>

  <h2>How we use it</h2>
  <p>We use your profile data to match you to job postings, send you alerts you've enabled, and improve the matching service. We do not sell your data to third parties.</p>

  <h2>Where data is stored</h2>
  <p>Your data is stored in databases operated on our behalf by hosting providers. Access is restricted to systems that need it and to our engineering team.</p>

  <h2>Your rights</h2>
  <p>You can view, edit, export, or delete your data at any time from inside the app. Email <a href="mailto:contact@cockpithire.com">contact@cockpithire.com</a> if you need help.</p>

  <h2>Contact</h2>
  <p>Questions about this policy: <a href="mailto:contact@cockpithire.com">contact@cockpithire.com</a>.</p>
</body>
</html>
```

### `backend/public/terms.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Terms of Service — CockpitHire</title>
  <style>
    body { background: #0A1628; color: #C0CDE0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 0 auto; padding: 60px 24px; line-height: 1.6; }
    h1 { color: #fff; margin-bottom: 8px; }
    .updated { color: #7A8CA0; font-size: 14px; margin-bottom: 32px; }
    h2 { color: #fff; margin-top: 32px; margin-bottom: 12px; font-size: 18px; }
    p, li { margin-bottom: 12px; }
    a { color: #00B4D8; }
    .home { display: inline-block; color: #00B4D8; margin-bottom: 24px; text-decoration: none; }
  </style>
</head>
<body>
  <a href="/" class="home">← Back</a>
  <h1>Terms of Service</h1>
  <p class="updated">Last updated: 14 May 2026</p>

  <h2>Use of the service</h2>
  <p>CockpitHire aggregates publicly posted pilot job listings from airline and aviation career sites and matches them to your pilot profile. By using the app or website you agree to use the service for personal, non-commercial purposes.</p>

  <h2>Job listings</h2>
  <p>We do not employ pilots and we are not a recruitment agency. Jobs displayed in the app are public postings from third-party employers. All applications are made directly with the employer through the link we provide. We make no warranty about the accuracy, completeness, or current availability of any listing.</p>

  <h2>Your account</h2>
  <p>You are responsible for keeping your sign-in credentials secure. Notify us at <a href="mailto:contact@cockpithire.com">contact@cockpithire.com</a> if you suspect unauthorised use.</p>

  <h2>Termination</h2>
  <p>You can delete your account at any time from the Settings screen. We may suspend accounts that violate these terms or attempt to abuse the service.</p>

  <h2>Contact</h2>
  <p>Questions about these terms: <a href="mailto:contact@cockpithire.com">contact@cockpithire.com</a>.</p>
</body>
</html>
```

## 2. Wire Express to serve them

In the backend entry file (`backend/src/index.js` or equivalent), add static-file middleware **above** any catch-all 404 handler but it can sit anywhere relative to the `/api` mount. Both patterns below; pick whichever matches the file's existing import style:

**If the file uses ESM (`import express from 'express'`):**

```js
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static landing page from /public
app.use(express.static(path.join(__dirname, '../public')));
```

**If the file uses CommonJS (`const express = require('express')`):**

```js
const path = require('path');
app.use(express.static(path.join(__dirname, '../public')));
```

The path `../public` resolves to `backend/public/` when the entry is at `backend/src/index.js`. If the entry is at `backend/index.js` (one level up), use `./public` instead. Check before adding.

Do not move the API routes. The static middleware serves the three `.html` files at `/`, `/privacy.html`, `/terms.html`. Make sure Express is configured so that `/privacy` (no extension) also resolves — `express.static` does this automatically when you pass `{ extensions: ['html'] }`:

```js
app.use(express.static(path.join(__dirname, '../public'), { extensions: ['html'] }));
```

Use that variant so the footer links `/privacy` and `/terms` work without the `.html` suffix.

## 3. Smoke-test locally

From `backend/`:

```bash
npm run dev   # restart if it was already running
```

Then:

```bash
curl -i http://localhost:3000/        | head -10  # expect 200, content-type text/html
curl -i http://localhost:3000/privacy | head -10  # expect 200
curl -i http://localhost:3000/terms   | head -10  # expect 200
curl -i http://localhost:3000/api/health         # expect 200 still — API routes must not break
```

If `/api/health` regressed, the static middleware is intercepting something it shouldn't — surface the issue, don't try a fix in the dark.

## 4. Deploy

Commit and push:

```bash
git add backend/public backend/src/index.js
git commit -m "Add landing page, privacy, and terms"
git push
```

Railway will auto-deploy. Watch the deploy log; once it's live, hit `https://cockpithire.com/` in a browser. The landing page should render. Verify on a phone (use the og:image preview by sharing the link in iMessage / WhatsApp — should show a clean preview card).

## 5. Report

Reply with:

- Confirmation that all three pages return 200 locally
- Confirmation that `/api/health` (and any other API route) still returns 200
- Railway deploy status
- Whether `https://cockpithire.com` renders the landing page in your browser

If the share preview on iMessage looks bad (missing image, weird title), tell me and we'll add an `og:image` next. Not in scope for this step — just make it render.
