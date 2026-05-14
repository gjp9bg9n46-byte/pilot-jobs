# Step 2 of 5: Populate the employer config with verified aviation slugs

Paste this into Claude Code in VS Code at the repo root (`pilot-jobs/`). Operational prompt — you'll be running curl and editing one file. Assumes step 1 (backend running) is done.

---

Goal: by the end of this session, `backend/src/scrapers/config/employers.js` should contain a short list of **verified** aviation employer entries — each one confirmed by hitting the relevant public endpoint and confirmed to contain at least one pilot-role job after running it through the aviation title filter. No fabricated slugs. If you can't verify something, don't add it.

## 0. Read these first

- `backend/src/scrapers/config/employers.js` — current placeholder shape
- `backend/src/scrapers/sources/lever.js` and `greenhouse.js` — confirm the slug → URL mapping each source uses
- `backend/src/scrapers/sources/workday/configs/` — see the example config shape
- `backend/src/scrapers/filters.js` — pull the `AVIATION_TITLE_PATTERNS` regex; you'll use it locally to filter verification responses

If the AVIATION_TITLE_PATTERNS regex isn't already exported, just inline the equivalent: case-insensitive match against `pilot`, `captain`, `first officer`, `flight officer`, `aviator`, `flight instructor`, `check airman`, `examiner`, `chief pilot`, while excluding `pilot program`, `auto-pilot`, `pilot study`, `pilot deployment`.

## 1. Verification commands

For each candidate employer, verify it has a public, working endpoint and at least one pilot-matching job. Use these one-liners.

### Lever

```bash
SLUG="<slug>"
curl -sS "https://api.lever.co/v0/postings/${SLUG}?mode=json" \
  | jq -r '.[].text' \
  | grep -iE 'pilot|captain|first officer|aviator|flight instructor' \
  | grep -ivE 'pilot program|auto-?pilot|pilot study|pilot deployment'
```

- If the curl returns `404` or HTML, the slug is invalid — skip.
- If it returns JSON but the grep is empty, the company has a Lever board but no pilot roles right now — skip.
- If at least one title comes back, the slug qualifies.

### Greenhouse

```bash
SLUG="<slug>"
curl -sS "https://boards-api.greenhouse.io/v1/boards/${SLUG}/jobs" \
  | jq -r '.jobs[].title' \
  | grep -iE 'pilot|captain|first officer|aviator|flight instructor' \
  | grep -ivE 'pilot program|auto-?pilot|pilot study|pilot deployment'
```

Same logic.

### Workday

For Workday there's no equivalent one-liner; the page is JS-rendered. Verification is just: visit the careers URL in a browser (or `curl -sL` and grep for `workdayjobs` / `wd5.myworkdayjobs.com` in the HTML), confirm it's a Workday tenant, and confirm pilot roles exist by searching the page. Do not invent Workday configs without me confirming the URL — print the URLs you propose and wait for me to say yes before writing config files.

## 2. Candidate pool — verify each, keep the ones that pass

Aviation companies known historically to use one of these platforms. **Do not trust this list as ground truth** — verify each with the commands above. Companies move ATS platforms regularly.

Try each on Lever AND Greenhouse, since I don't have current information on which platform each uses:

- Joby Aviation
- Archer Aviation
- Wisk Aero
- Beta Technologies
- Boom Supersonic
- Eviation
- Reliable Robotics
- Xwing
- Merlin Labs
- Zipline
- Skydio
- Volocopter
- Heart Aerospace

Slug format is usually the company name kebab-cased (`joby-aviation`, `boomsupersonic`, etc.) but try a few variations if the obvious one 404s — e.g. `boom-supersonic`, `boomsupersonic`, `boom`.

For Workday, propose up to **two** legacy carrier candidates after browsing their careers pages — but as noted, print the URLs and wait for confirmation before adding configs. Don't ship more than two Workday configs in this step; they're expensive to maintain.

## 3. Write the file

For every employer that passed verification, add an entry to `backend/src/scrapers/config/employers.js` in the shape the file already defines. Above each entry, add a one-line comment with:

- The exact command you ran to verify
- The date you ran it (today's date)
- The count of matching pilot titles returned

Example:

```js
// Verified 2026-05-14: curl boards-api.greenhouse.io/v1/boards/boomsupersonic/jobs → 3 pilot titles
{ source: 'GREENHOUSE', slug: 'boomsupersonic', company: 'Boom Supersonic' },
```

Keep the file alphabetized by company name within each `source` group, and group entries by source (all LEVER together, then all GREENHOUSE, then WORKDAY).

If a candidate passed on BOTH Lever and Greenhouse (rare but possible during a migration), include only one entry — prefer Lever (better-documented public API). Add a comment noting the dual presence.

## 4. Don't add anything unverified

If after the round you only have, say, two LEVER entries and zero on Greenhouse, that's fine. Ship two real entries, not ten speculative ones. We can expand later. Do not fabricate slugs to pad the list.

## 5. Smoke-run the scraper in dry mode

Once the file is written, run:

```bash
cd backend
node scripts/scrape.js --dry-run
```

This should print per-source / per-employer counts (jobs fetched, jobs surviving the aviation filter) without writing to the database. Expect at least 1 job through the filter per verified employer; if any employer returns 0 after the filter, something changed between verification and the dry-run — drop or re-verify that entry.

## 6. Report

Reply with:

- The verification commands and their results (matched-title counts per slug attempted)
- The final list of employers added to `employers.js`
- Any candidates you tried that didn't verify (slug + reason: 404, no pilot roles, etc.)
- The dry-run output

If a verification step requires network access you don't have, stop and tell me — I'll run the curl locally and feed you the results.
