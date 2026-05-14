# Prompt: Build the job ingestion pipeline (Lever + Greenhouse + Workday)

Paste this into Claude Code in VS Code at the repo root (`pilot-jobs/`). This is a **backend-only** prompt — you'll be working in `backend/`, not `mobile/`.

---

We're building the pipeline that populates the `Job` table in our pilot-jobs app. The mobile app already queries it; we now need actual listings flowing in. Phase 1 sources are Lever, Greenhouse, and Workday — chosen because their public surfaces are the lowest legal/engineering risk among the major ATS platforms.

Read these first:

- `backend/prisma/schema.prisma` — the `Job` model. Note exactly which fields exist (title, company, location, requirements, salary, applyUrl, etc.). The pipeline must conform to this; if a field you'd want to populate is missing, propose the migration in your summary rather than inventing one.
- `backend/src/controllers/jobController.js` and `backend/src/routes/jobs.js` — see how jobs are read.
- `backend/src/services/matchingService.js` — note which fields the matcher uses, so the scrapers populate those reliably.
- `backend/package.json` — see what's already installed (axios? bullmq? node-cron?). Reuse rather than introduce.

Start your reply with the existing Job model (just the fields, no need for the full Prisma block) and a short table of any new fields the pipeline needs that aren't there yet, marked **needs migration**. Don't write scraper code that depends on backend fields you haven't proposed.

## Legal posture — must be designed in, not bolted on

Bake these constraints into the shared HTTP layer so individual scrapers can't accidentally violate them:

- **Never log in.** All requests are unauthenticated. If a source requires auth, drop it from the pipeline — don't try to work around.
- **No clickwrap.** Never accept terms of service on any of these platforms with an account.
- **Identifiable User-Agent.** Every request sets `User-Agent: PilotJobsIngest/1.0 (+contact: <CONTACT_EMAIL>)` where `CONTACT_EMAIL` comes from `.env`. This is good faith and makes us easy to talk to instead of blocked.
- **Respect `robots.txt`.** Fetch and cache `robots.txt` per host on first contact; honor `Disallow` rules for our user-agent and for `*`. If `robots.txt` blocks the path we want, skip that source for that employer and log it.
- **Rate-limit per host.** Default 1 request every 3 seconds per host, configurable per source. Never exceed 30 req/min to any single host.
- **No anti-bot evasion.** If a host returns 403/429 with anti-bot indicators (Cloudflare challenge page, captcha, "access denied"), pause that source for 24 hours and surface in logs. Don't rotate proxies, spoof headers, or solve captchas — that crosses from "legal scraping" to "circumventing access controls."
- **Link back, don't replace.** Every `Job` row we create has `applyUrl` pointing to the *original* posting on the source. Users apply on the source's site. We don't host the application flow.
- **Paraphrase, don't bulk-copy.** Store the raw description as `description` for matching, but show users that the description is sourced from the employer's site with a visible attribution and link. (UI work is for the Search prompt; the backend just needs to expose `sourcePlatform` and `sourceUrl` on the job so the frontend can render that attribution.)

These rules apply to all three sources below. Put them in `backend/src/scrapers/http.js` as a single shared client, and have every scraper use it. Don't write `axios.get` directly in any source-specific file.

## What to build

### 1. Repository structure

Create:

```
backend/src/scrapers/
  http.js              # shared client (User-Agent, rate limit, robots.txt, retry)
  config/
    employers.js       # static employer list (see §5)
  sources/
    lever.js           # Lever JSON API
    greenhouse.js      # Greenhouse boards-api JSON
    workday/
      index.js         # entrypoint
      runner.js        # Playwright-driven, per-employer
      configs/         # one file per Workday employer
        united.js      # example placeholder
  normalize.js         # raw payload → Job-shape mapping per source
  dedup.js             # cross-source dedup
  filters.js           # aviation-only post-filter (see §6)
  runner.js            # orchestrates a full pass across all sources
  index.js             # public entry: runIngestion()
backend/scripts/
  scrape.js            # CLI: `node scripts/scrape.js` runs runIngestion() once
```

No admin endpoint. The pipeline is invoked by the scheduler (§7) and by the CLI for manual runs / testing.

### 2. Shared HTTP layer — `backend/src/scrapers/http.js`

A single function `fetchJSON(url, { source, host })` and `fetchHTML(url, { source, host })`:

- Reads `CONTACT_EMAIL` from `process.env` (add to `.env.example`).
- Sets the User-Agent above.
- Per-host token-bucket rate limiter (in-memory, keyed by hostname).
- Fetches and caches `robots.txt` per host (5-minute TTL). If the target path is disallowed, throws `RobotsDisallowedError`.
- Exponential backoff on 429 / 5xx; surrenders after 3 attempts.
- If the response contains a Cloudflare challenge marker, captcha, or "access denied," throws `AntiBotBlockedError` — the runner pauses that source-employer combo for 24h.
- Logs every request to a structured log (use the existing `backend/src/config/logger.js`).

No proxies, no header randomization. Same identity every request.

### 3. Lever source — `backend/src/scrapers/sources/lever.js`

Lever exposes a public JSON endpoint per employer: `https://api.lever.co/v0/postings/{slug}?mode=json`. No auth, no scraping HTML — this is the cleanest source.

- Input: a Lever slug (e.g. `joby-aviation`).
- Output: list of raw postings as Lever returns them.
- Maps to the `Job` model in `normalize.js`:
  - `title` → posting.text
  - `company` → from the employer config (Lever doesn't include it reliably)
  - `location` → posting.categories.location
  - `description` → posting.description + posting.lists (concatenated, plain text)
  - `applyUrl` → posting.hostedUrl
  - `postedAt` → posting.createdAt
  - `sourcePlatform` → `'LEVER'`
  - `sourceUrl` → posting.hostedUrl
  - Pilot-relevant requirement fields (hours, authority, aircraft types, medical) are parsed from the description with a best-effort regex pass in `normalize.js`. Be conservative — leave fields null if not confidently extracted. False positives in requirements break matching badly.

### 4. Greenhouse source — `backend/src/scrapers/sources/greenhouse.js`

Greenhouse exposes `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`. Not officially documented as public but stable and widely used.

- Input: Greenhouse board slug (e.g. `boomsupersonic`).
- Output: list of jobs with `content` (HTML description).
- Normalize fields:
  - `title` → job.title
  - `company` → from employer config
  - `location` → job.location.name
  - `description` → strip job.content HTML to plain text
  - `applyUrl` → job.absolute_url
  - `postedAt` → job.updated_at (Greenhouse doesn't always expose created_at on this endpoint — note in summary)
  - `sourcePlatform` → `'GREENHOUSE'`
- Same conservative regex pass for pilot requirements.

Add a small comment in this file noting that the endpoint isn't officially public — if it disappears or changes shape, this source breaks and we'd need to revisit.

### 5. Workday source — `backend/src/scrapers/sources/workday/`

Workday is the hardest. Each employer hosts their own themed careers site (`careers.example.com`) backed by a tenant-specific Workday API. The page itself is public; the data comes from a POST endpoint the page calls internally.

Use Playwright (add to `backend/package.json` if not present; `playwright` chromium-only is fine). Per-employer config:

```js
// backend/src/scrapers/sources/workday/configs/united.js
export default {
  slug: 'united',
  company: 'United Airlines',
  startUrl: 'https://careers.united.com/...',  // the public Workday-hosted careers page
  // Add CSS/role selectors here for the list item, pagination, etc.
  // Workday markup is roughly consistent across tenants but each theme can break us.
};
```

The Workday runner:

- Launches a headless Chromium.
- Navigates to `startUrl`.
- Waits for the job-list selector, scrolls / paginates to enumerate listings.
- Extracts title, location, posted date, applyUrl from the list (don't visit every detail page — too slow; pull description only if it's cheap, otherwise leave description empty and accept lower match quality for Workday-sourced jobs).
- Closes the browser cleanly even on failure (`try { ... } finally { browser.close() }`).

Important rules baked in:

- Maximum one Workday employer scraped concurrently (Playwright is heavy).
- Same rate-limit budget as the other sources — 1 navigation per 3 seconds equivalent.
- If a page shows a Cloudflare or "are you human" interstitial, treat as `AntiBotBlockedError`. Don't try to wait it out.
- Don't ship more than 2–3 employer configs in this PR; they're labor-intensive to maintain. Leave clear comments showing how to add another so we can expand later.

### 6. Employer config — `backend/src/scrapers/config/employers.js`

A static array, committed to the repo:

```js
export default [
  { source: 'LEVER', slug: '<example-slug>', company: '<Display Name>' },
  { source: 'LEVER', slug: '<example-slug>', company: '<Display Name>' },
  { source: 'GREENHOUSE', slug: '<example-slug>', company: '<Display Name>' },
  { source: 'WORKDAY', config: 'united' /* references configs/united.js */ },
  // …
];
```

Seed it with **placeholder entries** — don't fabricate real employer slugs. Add a comment at the top of the file telling the operator (us) how to verify and add a new employer: visit the source platform's public URL for the company, confirm it returns data without auth, add the slug. Aviation employers known to use these platforms tend to be newer-tech operators (eVTOL, supersonic, advanced air mobility startups) for Lever/Greenhouse, and legacy carriers for Workday — leave a comment listing those broad categories without committing to specific names that may have moved platforms.

### 7. Aviation filter — `backend/src/scrapers/filters.js`

Most of these employers post non-aviation roles (engineering, marketing, etc.) alongside pilot jobs. We only want pilot roles. After normalization, filter:

- Title contains any of: `pilot`, `captain`, `first officer`, `flight officer`, `aviator`, `flight instructor`, `check airman`, `examiner`, `chief pilot`, plus aircraft-specific titles (`B737 captain`, `A320 first officer`, etc.) — keep this list in `filters.js` as a single `AVIATION_TITLE_PATTERNS` regex.
- Exclude common false positives: `pilot program` (used in tech for trials), `auto-pilot`, `pilot study`, `pilot deployment`.

Anything that doesn't match is dropped silently (not stored). Log a count of dropped vs kept per source per run.

### 8. Normalization + dedup

`normalize.js` produces a uniform `RawJob` shape from each source, then `dedup.js` collapses:

- **Same source + same external ID** → upsert (update existing row).
- **Different sources, same `(company, title, location)` after lowercasing/trimming** → keep the one with the more complete description; mark the duplicate as `mergedInto`.

Store a stable external identifier on the `Job` row (`sourcePlatform` + `externalId`) so re-runs upsert rather than duplicate. Propose adding these two fields to the schema if not present.

### 9. Scheduling — `backend/src/scrapers/index.js`

Export `runIngestion()` that:

- Reads the employer config.
- For each employer, runs the relevant source.
- Aggregates, normalizes, filters (§7), dedups, upserts.
- Marks jobs as `inactive` if they're absent from the source's current listing (don't delete — keep the record for users who have a `SavedJob` pointing at it; surface as "no longer accepting applications" in the mobile UI).

Schedule it:

- If BullMQ is already a dependency, register a repeating job: every 6 hours.
- Otherwise, use `node-cron` (add if needed) on the same cadence.
- Provide an immediate run on server start in development (gated behind `NODE_ENV !== 'production'`), so devs see fresh data on `npm run dev`.

### 10. CLI for manual runs — `backend/scripts/scrape.js`

A simple script:

```bash
node scripts/scrape.js                # full pass across all employers
node scripts/scrape.js --source LEVER # one source
node scripts/scrape.js --employer joby-aviation # one employer
node scripts/scrape.js --dry-run      # fetch + normalize, print counts, don't write to DB
```

Useful for testing new employer configs without committing them to the schedule.

### 11. Observability

For every ingestion run, log: timestamp, source, employer, requests made, jobs fetched, jobs kept after aviation filter, jobs upserted, jobs marked inactive, errors. Use the existing logger. No new monitoring dependency — just clean structured logs.

## Conventions

- ES module syntax matching the rest of the backend (or CommonJS — match what `backend/` already uses; don't mix styles).
- No `any`-equivalent in JSDoc / TS — type the `RawJob` and `NormalizedJob` shapes explicitly (in a `backend/src/scrapers/types.js` JSDoc block, or `.d.ts` if backend uses TS).
- No new state libraries, no new ORMs. Use the existing Prisma client.
- Don't write code that depends on `mobile/` — this PR is backend-only.

## Deliverables

1. The schema-fields table at the top of your reply.
2. The new files listed in §1.
3. Any proposed Prisma migrations for new fields (`sourcePlatform`, `externalId`, `mergedInto`, `inactive` flag, attribution fields).
4. A short summary at the end: what shipped, what's stubbed pending real employer slugs being added, and any source you ran into that needs a different approach than this PR took.

Do not start coding until you've read the `Job` model and the existing scraper-adjacent code (if any). The goal is to extend what's there cleanly, not introduce a parallel structure.
