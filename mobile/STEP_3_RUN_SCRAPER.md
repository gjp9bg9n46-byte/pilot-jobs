# Step 3 of 5 (effectively the last): Run the real scraper and verify the job appears

Paste this into Claude Code in VS Code at the repo root (`pilot-jobs/`). Operational prompt — running the scraper and checking what landed. Assumes step 1 (backend running) and step 2 (Shield AI verified in `employers.js`) are both done.

Context for you: the database already has ~10 seed jobs with real airline names (Singapore, Lufthansa, etc.) that were loaded by `prisma db seed` previously. Those are legitimate test data, not garbage — don't touch them. The scraper should add the Shield AI pilot job *alongside* the seed data, not replace it. The upsert + dedup logic (`sourcePlatform` + `externalId` unique index) should make this automatic.

## 0. Read these first

- `backend/src/scrapers/runner.js` and `index.js` — to confirm how a full run is invoked
- `backend/scripts/scrape.js` — the CLI entry
- `backend/src/scrapers/normalize.js` — to know which `Job` fields the Shield AI row will populate vs leave null (matters for the verification queries below)

## 1. Baseline — what's in the DB right now

```bash
cd backend
npx prisma db execute --stdin <<'SQL'
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE "sourcePlatform" = 'LEVER') AS lever,
       COUNT(*) FILTER (WHERE "sourcePlatform" IS NULL)   AS seed_or_unscraped
FROM "Job";
SQL
```

Report the three numbers. We expect roughly `total=10, lever=0, seed_or_unscraped=10`. If lever is already >0, the scraper has been run before — note that and continue (the upsert should make a re-run idempotent).

## 2. Run the scraper for real

```bash
node scripts/scrape.js --source LEVER
```

Don't pass `--dry-run` this time. Capture the full stdout. Report:

- Per-employer fetched / kept / errors counts
- Any warnings about rate limits, robots.txt, or normalization
- Total runtime

If anything errors hard (not just "0 jobs from X" — actual exceptions), stop and paste the stack.

## 3. Verify the row landed

```bash
npx prisma db execute --stdin <<'SQL'
SELECT id, title, company, location, "sourcePlatform", "externalId", "applyUrl", "createdAt"
FROM "Job"
WHERE "sourcePlatform" = 'LEVER'
ORDER BY "createdAt" DESC;
SQL
```

Confirm at least one row exists with `sourcePlatform = 'LEVER'`, `company = 'Shield AI'` (or whatever string the normalizer set), and a populated `applyUrl` pointing at `jobs.lever.co/shield-ai/...`. If the row is missing fields we'd want (location, postedAt, etc.), note which — those become normalization tweaks for later, not blockers now.

## 4. Verify the API exposes it

Use the bearer token from step 1's smoke test (if it's expired, log in again to mint a fresh one):

```bash
TOKEN="<paste-token>"
curl -sS "http://localhost:3000/api/jobs" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.jobs[] | select(.sourcePlatform == "LEVER") | { title, company, applyUrl }'
```

Confirm the Shield AI job comes back in the response. If `/api/jobs` doesn't include a `sourcePlatform` field on the serialized job, that's a backend-side mapping omission — flag it but don't try to fix in this step. The job's other fields should be visible regardless.

## 5. Verify it shows in the mobile app

This is the actual win condition. Make sure Expo is running (`npm start` from `mobile/`), open the app on your phone or simulator, go to the Jobs tab, and pull-to-refresh. The list should now show one more entry than before — title containing "Pilot" with Shield AI as the company.

If it doesn't appear:

- Check whether the authority filter chip at the top is restricting results — Shield AI almost certainly has no `reqAuthorities`, so a non-"All" filter would hide it. Set the chip back to "All" and pull again.
- If still missing, fetch `/api/jobs` from your phone (or curl) and see whether the Shield AI row is in the JSON the mobile is receiving. If yes, the issue is a client-side filter; if no, the auth user's account might be filtering jobs in some way (some matching services exclude jobs below a personal threshold).

## 6. Report

Reply with:

- Baseline counts from §1
- Scraper run output from §2
- The Shield AI row's key fields from §3
- Whether `/api/jobs` returned it in §4
- **Whether the Shield AI job appeared in Expo Go** — this is the milestone

If yes to the last one: we're done with the 5-step bootstrap. The end-to-end pipeline (scrape → DB → API → mobile) is proven on real data.

If not, report exactly where the chain breaks (DB has it but API doesn't, API has it but mobile doesn't, etc.) and stop — we'll debug from there rather than guessing.

## Future note (don't do this now, just so it's in writing)

Before launching to real users, the seed-data rows (Singapore, Lufthansa, etc.) should be cleared — they have real airline names but synthetic apply links could mislead users. Easiest approach: add a `seed = true` boolean to those rows (or identify them by `sourcePlatform IS NULL`) and have a one-shot script delete them once the real ingestion produces enough volume. Not a step 3 task — just flagging.
