# Handoff — Batch C round 3 (display polish + #7 nationality) → push

Living doc. Keep updated as items land. Everything is on local `main`, **unpushed**.
Backend talks to prod DB (migrations already applied in the earlier A/B deploy).
`:8082` = Expo Go tunnel under **@aladinnn** (SDK 57 + batch C); keep it up.

## Context / where things live
- Monorepo: `/Users/mohamedalaa/pilot-jobs` (backend/, frontend/, mobile/).
- Mobile is **SDK 57** on `main` now (merged from `mobile-sdk57`). `main/mobile` has SDK-57 node_modules.
- Matcher: `backend/src/services/jobMatch.js` (events/eligibility/baseline). Tests: `backend/src/services/__tests__/jobMatch.test.js`.
- Identity/dedup: `backend/src/scrapers/jobIdentity.js` + `__tests__/jobIdentity.test.js`.
- Display helpers (dedupe location, company alias, airport codes, NO emoji): `frontend/src/lib/displayNames.js`, `mobile/src/lib/displayNames.ts`.
- Web Dashboard: `frontend/src/pages/Dashboard.jsx`. Web nav/bell: `frontend/src/components/Layout.jsx`.
- Mobile Dashboard: `mobile/app/(app)/(tabs)/dashboard.tsx`. Mobile tabs: `mobile/app/(app)/(tabs)/_layout.tsx` + `mobile/src/theme/tabBar.ts`.
- Mobile job detail: `mobile/app/(app)/(tabs)/jobs/[id].tsx`. Mobile job card: `mobile/src/components/JobCardShared.tsx`.
- Profile (edit): web `frontend/src/pages/ProfileRedesign.jsx`; mobile `mobile/app/(app)/(tabs)/profile/index.tsx`. API: `backend/src/controllers/profileController.js` (already accepts `nationality` scalar; schema `Pilot.nationality String?`).
- Scratch scripts: `/private/tmp/claude-501/.../scratchpad/` — `C-reports.js` (event/nat/clearance lists), `dedup-focus.js` (NetJets/Lineage), `gen-payloads.js` + `shoot.js` (mobile shots), `shoot-web.js` (web shots), `postdeploy.js` (key-diff/timing/CronRun), `mon5xx.sh` (30-min 5xx).

## DONE (committed on main, unpushed)
- `6f5ab00` #8 NetJets dedup guard (region variant + no-base/no-type hold) + test. Shadow: 11 merge / 11 hide / 21 held.
- `aa991c6` round-3 partial: #1 location via `locationName` + removed flag emoji (web JobCard/JobDetailPanel, mobile JobCardShared); #2 web tab "All matches"→"All"; #3 web row % + View on one line, pill under meta; #4 web blocker one-line red/amber + "Sep".
- (earlier) tranche 1 + 2 + fixes: `9859f83 ac88641 3b1811e 8841687` etc.; SDK 54→57 `cb93df0 2571039 46bb606`; EAS re-link `0c7b49a`.

## REMAINING — do each, commit after each
1. **Mobile job detail location/title (#1,#5)** — `mobile/app/(app)/(tabs)/jobs/[id].tsx`:
   - Show FULL title (currently shows `roleLabel || job.title` → shows just "First Officer"). Use `job.titleEn || job.title`.
   - Use `locationName(job.location||job.country)` in the header meta; no flag.
   - Requirement rows: label the two value columns **"Required"** and **"You"** (add a small header row above `ReqRow`s).
   - Drop the duplicate plain "Requirements" synth list when it repeats the match rows (keep the verbatim block only when there's no `job.match.requirements`).
2. **Mobile tabs clipping (#2)** — `mobile/app/(app)/(tabs)/dashboard.tsx` seg row: shorten "All matches"→"All" (match web) so the 3 segs fit at 390.
3. **Mobile blocker one-line (#4)** — `mobile/app/(app)/(tabs)/dashboard.tsx`: one row per item, red if `days<0` (expired), amber if expiring; "<label> expired/expires <date> · Update"; date via a MONTHS[] formatter (NOT toLocaleDateString, which gives "Sept").
4. **Mobile tab-bar safe-area clipping ("Dashboarc") (#6)** — `mobile/src/theme/tabBar.ts` (makeTabBarStyle) + `(tabs)/_layout.tsx`: ensure bottom safe-area inset + enough height/lineHeight so labels aren't cut. User will confirm on device.
5. **#7a Nationality input** — country pick-list, **multi-select** (dual citizens), web + mobile personal-info edit. MATCHING ONLY: not on public profile header, never sent to employers unless the pilot applies.
   - Schema: `Pilot.nationality` is a single `String?`. Multi-select needs either a `String[]` (migration) OR a comma-joined string. DECISION BELOW.
   - Wire the matcher: `jobMatch.js` reads `ctx.nationality` (single lowercased). If multi, make `ctx.nationalities` a list and `met` if ANY matches.
   - "Add nationality" gap link → the field (web `/profile` opens the identity edit sheet; mobile same).
6. **#7b Tighten nationality pattern** — `jobMatch.js` `jobEligibility`: require the country token **adjacent** to national/citizen (reuse `TITLE_NAT`-style regex on the sentence), not just co-occurring. Kills the Canadian Inclusion "SAAB First Officer / IATRA" false positive. Then re-run `C-reports.js` and re-list every ACTIVE nationality-tagged job + sentence (false positive must be gone).
7. **tsc + build**: `cd mobile && ./node_modules/.bin/tsc --noEmit`; `cd frontend && npm run build`; `node --test backend/src/services/__tests__/jobMatch.test.js` + `jobIdentity.test.js`.
8. **v3 screenshots** → `docs/design/screens/*-v3.png`: web 1280/820/390 (via `shoot-web.js` after `npm run build` + `vite preview :4173`) + mobile (via `gen-payloads.js` → stub → expo web :8081 from main/mobile → `shoot.js`). Regenerate payloads first (they feed both).
9. **Push** (see checklist).

## OPEN DECISIONS
- **Nationality storage**: single `String?` today. For multi-select, simplest reversible = add `Pilot.nationalities String[]` (additive migration) and keep old `nationality` for back-compat, OR store comma-joined in the existing column (no migration). → Leaning: **new `String[]` column** (clean), additive migration `*_pilot_nationalities`. Confirm if a migration is OK (it adds one more to the push).
- `IDENTITY_DEDUP_APPLY=1`: user sets on Railway AFTER push is confirmed healthy. Reversible (mergedInto + status EXPIRED). Then report first nightly run merges.

## PUSH CHECKLIST (same as last time)
Pre-flight:
1. `pg_dump` prod → `~/pilot-jobs-backups/predeploy-<date>.dump` (use `/opt/homebrew/opt/libpq/bin/pg_dump "$DATABASE_URL" -Fc --no-owner --no-privileges -f …`); verify size + `pg_restore --list`.
2. `git log --oneline origin/main..main` + `git diff --stat`.
3. Migrations: `npx prisma migrate status`; if a nationality migration was added, show SQL + `prisma migrate deploy` (Railway also runs it on deploy).
Deploy: `git push origin main` (Railway backend + Vercel web; mobile ships nothing to users — SDK/EAS is local/aladinnn only).
Post-deploy (first 30 min):
- Key-set diff `/api/jobs` + `/api/jobs/:id` (expect unchanged) — `postdeploy.js`.
- `/api/dashboard` prod cold/warm timing.
- 5xx monitor 30 min — `mon5xx.sh`.
- CronRun rows appearing; identityFirstSeenAt still 100% ACTIVE.
Rollback = `git revert` (migrations additive).
After healthy → tell user → they set `IDENTITY_DEDUP_APPLY=1` → report first nightly merges.
