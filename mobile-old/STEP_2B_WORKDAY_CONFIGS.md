# Step 2b: Verify United + Southwest as Workday tenants and write the configs

Paste this into Claude Code in VS Code at the repo root (`pilot-jobs/`). Operational prompt — verification + two config files. Assumes step 2 (Lever/Greenhouse populated, Shield AI verified) is done.

---

Goal: by the end of this session we should have working Workday configs for **United Airlines** and either **Southwest Airlines** or a verified fallback. Each config must reach an actual `myworkdayjobs.com` tenant and the dry-run scrape must return at least one pilot-titled job per employer.

## 0. Read these first

- `backend/src/scrapers/sources/workday/index.js` and `runner.js` — see how a Workday source is invoked
- `backend/src/scrapers/sources/workday/configs/united.js` — the placeholder config, see what fields are expected
- `backend/src/scrapers/config/employers.js` — see how WORKDAY entries are added
- `backend/src/scrapers/filters.js` — the aviation title filter

## 1. Find the actual Workday URL for each candidate

Marketing careers pages usually redirect or embed an iframe to the real Workday tenant. Verify in this order:

```bash
# Follow redirects and inspect the final URL + body for Workday markers
curl -sLI "https://careers.united.com" | head -20
curl -sL  "https://careers.united.com" | grep -oE '[a-zA-Z0-9_-]+\.wd[0-9]+\.myworkdayjobs\.com[a-zA-Z0-9_/\-]*' | sort -u
curl -sLI "https://careers.southwestair.com" | head -20
curl -sL  "https://careers.southwestair.com" | grep -oE '[a-zA-Z0-9_-]+\.wd[0-9]+\.myworkdayjobs\.com[a-zA-Z0-9_/\-]*' | sort -u
```

A Workday tenant URL looks like `<tenant>.wd1.myworkdayjobs.com/<site>` or `wd5`, `wd103`, etc. Report what each grep finds. If a URL doesn't surface in the HTML directly, try the search page on each careers site (often `/jobs` or `/search`) and re-run the grep there.

If `careers.southwestair.com` returns no Workday URL, Southwest is on a different ATS (iCIMS, BrassRing, in-house). In that case skip Southwest and try one fallback in this order:

1. **Atlas Air** — try `https://careers.atlasair.com`
2. **JetBlue** — try `https://careers.jetblue.com`

Stop at the first one that's a confirmed Workday tenant. Report the result.

## 2. Confirm pilot roles exist on each tenant

Workday's underlying listing API is reachable via a single POST without auth:

```bash
TENANT_URL="https://<tenant>.wd1.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs"
curl -sS "$TENANT_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "User-Agent: PilotJobsIngest/1.0 (+contact: mohamed.alaa.azim@icloud.com)" \
  -d '{"limit":50,"offset":0,"searchText":"pilot"}' \
  | jq -r '.jobPostings[].title' \
  | grep -iE 'pilot|captain|first officer|aviator|flight instructor' \
  | grep -ivE 'pilot program|auto-?pilot|pilot study|pilot deployment'
```

Replace `<tenant>` and `<site>` with the values you found in step 1 (the URL fragment after `myworkdayjobs.com/` typically contains the site). If the POST returns 200 with `jobPostings[]`, that's our data path — record the exact URL.

If at least one pilot title comes back, the tenant qualifies.

**Important:** if this POST works, we can scrape Workday via plain HTTP without Playwright for these tenants. Note this in your reply — the original ingestion prompt scaffolded Playwright assuming it was always needed, but if the POST endpoint is reachable directly, a thinner HTTP-only path is cheaper and more reliable. Don't refactor the source code right now — just flag the finding so we can decide whether to simplify later. **Still** route the request through `backend/src/scrapers/http.js` so the User-Agent, rate-limit, and robots.txt rules apply.

## 3. Check robots.txt for each tenant

```bash
curl -sS https://<tenant>.wd1.myworkdayjobs.com/robots.txt
```

If the `/wday/cxs/` path or the site path is `Disallow`'d for `*` or `User-agent: *`, stop and tell me — we don't bypass robots.txt. If it's allowed (or robots.txt doesn't mention the path), proceed.

## 4. Write the configs

For each verified tenant, create/update a file under `backend/src/scrapers/sources/workday/configs/`:

```js
// backend/src/scrapers/sources/workday/configs/united.js
export default {
  slug: 'united',
  company: 'United Airlines',
  // Verified 2026-05-14: POST returned N pilot titles
  tenant: '<tenant-id>',          // e.g. 'united'
  site: '<site-path>',            // e.g. 'UnitedAirlinesCareers'
  // The full POST URL the runner will hit:
  jobsEndpoint: 'https://<tenant>.wd1.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs',
  // Optional: searchText biasing (set 'pilot' to only fetch likely pilot roles,
  // empty string to fetch everything and rely on the global aviation filter)
  searchText: 'pilot',
  // Workday paginates server-side; the runner should walk offset until empty
  pageSize: 50,
};
```

Match the field shape the existing Workday runner expects — if the runner reads different field names, adjust. Don't invent shapes; conform to what's already there.

Then add the corresponding entries to `backend/src/scrapers/config/employers.js` (grouped with the existing WORKDAY block, alphabetized by company name):

```js
// Verified 2026-05-14: <command summary> → N pilot titles
{ source: 'WORKDAY', config: 'united' },
```

## 5. Dry-run

```bash
cd backend
node scripts/scrape.js --source WORKDAY --dry-run
```

Confirm per-employer counts: fetched, kept after aviation filter, errors. Each verified employer should show at least 1 kept. If any shows 0, debug before reporting back — probably a selector or endpoint mismatch.

## 6. Report

Reply with:

- For each candidate (United, Southwest, possibly Atlas/JetBlue): the Workday tenant URL found (or "not Workday — skipped"), the matched pilot title count from the POST verification, and whether robots.txt allowed scraping.
- The exact files you wrote.
- The dry-run output.
- A short note on whether the Workday POST endpoint worked directly (so we can decide later whether to simplify away from Playwright for these tenants).

If anything blocks — endpoint shape isn't what we expected, robots.txt forbids, all candidates skipped — stop and report rather than improvising.
