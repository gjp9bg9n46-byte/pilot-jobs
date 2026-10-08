# Handoff — Batch C round 3 → **PUSHED + HEALTHY** (origin/main 40bb928, 2026-10-07)

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
- `d0eb894` **B — Jobs ported to the mobile-web reference.** Region tabs + counts, Hours/Filters/Visa/Qualified-only rail, Salary sort, applied-filter chips + Clear all, empty-profile banner, subtitle gains "N you qualify for"; card rebuilt as web's (verdict checklist, Apply-direct/salary footer, no % pill, no chevron); detail gains web's verdict sentence, grouped Must-haves/Hours/Ratings rows, role chip and green "Apply on the source ↗" (Save + safety note kept). Side-by-side re-shot.
- `5a2d79b` **ELP implicit baseline + one shared Jobs ordering** (web fit groups, nationality-barred last, on both platforms). Verified on prod: 374 live jobs → 112 QUALIFY with a current ELP, **0** with a lapsed one.
- `bd70f6d` **A (real-device items 1–8) SHIPPED** — one badge (Home tab only), Dashboard→**Home** + tab-bar geometry fixed (labels were clipped vertically; active highlight squared the pill's curve), `useTabBarClearance()` on EVERY scrollable tab screen (4 had none at all), Jobs defaults to **Best match** with nationality-barred rows last, new subtitle, Browse/Matches toggle gone, `1,500 h` everywhere via `src/lib/format.ts` (device-locale bug), and `displayTitle()` shared web↔app with a fixed acronym rule. Shots: `mobile-A-*.png`.
- `6580952` **B step 1 — Jobs inventory** (`docs/design/jobs-web-vs-app-inventory.md`) + side-by-side `jobs-web-vs-app.png` / `job-detail-web-vs-app.png`. **Nothing ported yet — awaiting decisions.**
- `8dab906` **English (ICAO) expiry — one source + blocker wording.** Stored value is **30 Sep 2026 (EXPIRED)**; the "15 Nov 2026" on the old dashboard shot was never in the DB (hand-written stub blockers). Profile's English row now reads the SAME readiness item as the dashboard, and its no-item fallback checks the date instead of assuming "valid" (it used to render an expired ELP green). Label `English (ICAO)` (was `English (ICAO) expiry` → "expiry expires"); web blocker's leading "·" before Update removed.
- `5ddd8c8` **v3 screenshots, PII-free.** gen-payloads.js redacts phone + email in every stub payload, and blockers/readiness now come from the real `profileReadiness` service (no invented dates). OCR sweep over every PNG in `docs/design/screens` AND every image blob reachable from `main` (114): zero real phone/email.
- `eb02de4` **#7a nationality UI (web + mobile)** — chip multi-select over the existing country list; "+ Add nationality" opens the same searchable combo; × removes a chip. Legacy `Pilot.nationality` kept in sync with the FIRST entry (CV templates, completeness widget, older reads). `pilotNationalities(profile)` exported from both edit sheets (array, falling back to the legacy column). Read views show the full list ("Nationalities" when >1); web marks it "matching only". Web `ADD_LINK` gains `nationality` + `clearance` → `/profile`; mobile job-detail "add" rows are now TAPPABLE and route through the same map (`/profile` or `/logbook`).
- `5b741f8` **v3 screenshots** (19 files, `docs/design/screens/*-v3.png`) — dashboard 1280/820/390 + mobile, plus the new nationality shots: `profile-nationality-{read,sheet,add}-{1280,390}-v3`, `job-detail-nationality-{1280,390}-v3`, `mobile-profile-nationality-{read,sheet,add}-v3`, `mobile-job-detail-nationality-v3`.
- `6f5ab00` #8 NetJets dedup guard (region variant + no-base/no-type hold) + test. Shadow: 11 merge / 11 hide / 21 held. The two Luxaviation(+Group) Lineage-Dubai rows MERGE (C#4); Pilot Assessments pair HELD (recruiter). User will set IDENTITY_DEDUP_APPLY=1 AFTER a healthy push.
- `aa991c6` #1 web+mobile card: location via `locationName`, removed country flag emoji (keyed on HQ). #2 web tab "All". #3 web row (% + View one line, pill under meta). #4 web blocker one-line red/amber + "Sep".
- `aca4bb4` #7b nationality ADJACENT (country next to national/citizen) + exclude "or permanent resident". Result: **11 genuine** nationality reqs (list below); SAAB + Air Transat false positives GONE. 43 jobMatch tests pass.
- `6514c7f` #7a BACKEND: `Pilot.nationalities String[]` (migration `20261007120000_pilot_nationalities`), `ctx.nationalities` (match if ANY), profileController accepts `nationalities[]`. NOT in employer DTO (no leak).
- `6ca3ff3` mobile dashboard: tabs "All", one-line blocker (red/amber), "Sep".
- `ac897ae` mobile detail: full title (`titleEn||title`), location via `locationName`, Required/You column header, drop duplicate synth requirements list when match rows exist.
- `244e81d` #6 mobile tab bar: widen pill (marginH 28→14, padH 8→4, h 64→66, padBottom 10→12), label 10→9/lh12, removed `overflow:'hidden'` (fixes "Dashboarc" horizontal clip). USER CONFIRMS ON DEVICE.
- (earlier) tranche 1+2+fixes; SDK 54→57 `cb93df0 2571039 46bb606`; EAS re-link to @aladinnn `0c7b49a` (projectId 950ece23…).

### #7b final nationality list (11 ACTIVE) — re-run `scratchpad/C-reports.js`
UAE National ×3 (Air Arabia + 2 Unknown, title); Sealift Command (US citizen); Aerotime + Fly Fofa ×2 + Airlink (South African citizenship); CAE ×2 C-130J (Australian Citizenship); Air Canada AC Express (Canadian citizenship). SAAB/Canadian Inclusion + Air Transat correctly EXCLUDED ("or permanent resident").

## POST-DEPLOY (push 40bb928, Railway redeploy ~23:51Z / 02:51 local)
- **Backup**: `~/pilot-jobs-backups/predeploy-2026-10-07.dump` — 11 MB, `pg_restore --list` 184 TOC entries, 30 TABLE DATA (Pilot/Job/Application/PilotCertificate/Airline present).
- **Migration applied**: `prisma migrate status` → "Database schema is up to date" (26/26). Prod `GET /profile` now returns `nationalities: []` and legacy `nationality: null`.
- **Key-set diff**: `/api/jobs` 61 keys → 61, **no removals, no additions**, no identity-field leaks. `/api/jobs/:id` 200, 65 keys, no leaks.
- **Readiness on prod**: english item is `label="English (ICAO)" level=expired date=2026-09-30` ✅ (wording + single-source fix live). Blockers: `ATPL licence (expired)` only.
- **CronRun**: `totals-backfill OK 1479ms` + `startup-cleanup OK 300704ms`, both `commit=40bb928` ✅.
- **5xx**: **one** 502, at 23:51:56Z — the Railway restart itself. The monitor then probed `/api/jobs`, `/api/stats/landing`, `/api/airlines` and the public web root every 60 s for **64 minutes** with **zero** further 5xx. Final sweep: `/api/jobs` 200, `/api/stats/landing` 200, `/api/airlines` 200, `/health` 200, `/health/requirements-coverage` 200, `https://cockpithire.com/` 200.
- **identityFirstSeenAt**: **360/360 ACTIVE** ✅ (the 3 gaps seen right after the deploy were rows the startup scrape had just inserted; the next pass filled them). Still worth setting at insert so there is never a window — see follow-ups.
- **Nightly scrape ran on the new code**: `CronRun scrape OK 923922ms commit=40bb928` at 00:00Z, plus `disk-check OK`. So the jobIdentity/#8 changes have now run in anger once.
- **Dedup still shadow-only for the identity engine.** `mergedInto` total went 10926 → 10946 (+20) across that scrape — the **legacy, ungated** `src/scrapers/dedup.js` passes, which have always run; `collapseByIdentity` stays `dryRun` until `IDENTITY_DEDUP_APPLY=1`.
- **Timings — no regression from this push.** Unauthenticated `/jobs?limit=20&_perf=1`: `fetch 0ms, matchJS 1ms` on repeat calls, i.e. the 45 s job-data cache is working perfectly. Authenticated calls cost ~760–1650 ms in the `fetch` phase, but that phase is `Promise.all(getCandidates, buildMatchContext, fetchPilotJobSets)` and the per-pilot **`buildMatchContext` is deliberately never cached** — that read, not the job scan, is the cost. Pre-existing design, and the obvious next perf target. (This push did add `requirementsText`/`description` to the match selects for the nationality/clearance detection, which makes the cached candidate scan heavier — but the scan itself measures 0 ms on a cache hit.)
- **Requirements coverage gate: 77.8 %** (280/360 active), below the 80.4 % recorded when the gate was set. Not caused by this push — it tracks the scraped job mix (WHATJOBS 141/200). Flagging it as drift to watch.

### ✅ RESOLVED — the one prod write I caused (not profile data)
`postdeploy.js` calls `GET /api/dashboard` **as the pilot**, and that endpoint advances the visit window:
- `dashboardSeenAt` 2026-10-06T22:13:51.229Z → **23:55:46.222Z**
- `previousDashboardSeenAt` 2026-10-06T19:50:11.406Z → **22:13:51.229Z**
Profile fields were untouched (`nationality: null`, `nationalities: []`, phone/country/city/education unchanged). A second pair of calls (the timing re-run, 00:56Z) moved it again.
**Restored 2026-10-07** by raw SQL — raw on purpose, because a `prisma.update()` would bump `@updatedAt` again, and the point was to leave the row exactly as it was: `dashboardSeenAt` = 22:13:51.229Z, `previousDashboardSeenAt` = 19:50:11.406Z, `updatedAt` = 22:29:10.664Z. Verified equal to the pre-interference values.
**Standing rule (user, 2026-10-07): post-deploy dashboard checks NEVER run as the user's account.** All check scripts (`postdeploy.js`, `timing.js`, `perf.js`, `verify-nat.js`) now authenticate as `CHECK_PILOT = cvtest-0y9ilqy4@example.com`. Caveat: that pilot has no certificates or logbook, so `buildMatchContext` is cheaper for it — treat authenticated timings from it as a floor, not a representative number.

## IDENTITY_DEDUP_APPLY — status 2026-10-08
- **Flag set by the user; the service restarted at 00:35:23Z** (fresh `startup-cleanup` + `totals-backfill` pair on commit a962142, then again at ~00:53Z for 5a2d79b).
- **No gated run had fired yet at the time of writing.** The flag is read at call time inside the cron callbacks, so the first run to see it is `nightly-rescreen` at **03:30 UTC**; the per-scrape pass follows at 06:00 UTC. The last recorded run, 2026-10-07T03:30Z, has `identityDedupApplied: false` in its CronRun counts.
- **Authoritative proof is persisted**: `CronRun.counts.identityDedupApplied` for `nightly-rescreen`. A watcher (`scratchpad/merge-report.js`) polls for the first completed post-flag run and writes `scratchpad/merge-report.txt` + `merge-revert-ids.json`.
- **Dry-run preview of what that run will do** (read-only, taken 00:44Z): **11 clusters / 12 rows hidden** — WHATJOBS 9, CAREERJET 2, ADZUNA 1 — and **27 clusters held for review** (recruiter-only / soft-base, never auto-merged). Every pair is one operator, one type, one base, differently-worded titles; two are byte-identical titles from the same source.
- **One to watch**: `qantas|FO|?|victoria` pairs *"First Officer: Regional Pilot — Home Bases in Australia"* with *"QantasLink Direct Entry First Officer"* — no type in either title, so the key rests on employer + base. Plausibly two campaigns. Flagged, not blocked.
- **Reversible**: the engine only ever sets `mergedInto` + `status='EXPIRED'` (dedup.js:643); nothing is deleted, and the runner's sticky-merge keeps a merged row from flapping back on re-scrape. Revert = `UPDATE "Job" SET "mergedInto"=NULL, status='ACTIVE' WHERE id IN (…)`, ids captured in `merge-revert-ids.json`.

## DECISIONS 2026-10-08 (user)
1. **ELP implicit baseline — YES.** An expired English (ICAO) now injects a not-met row into EVERY job, exactly like an expired licence/medical, so nothing reads QUALIFY while the dashboard shows the ELP blocker. Only an EXPIRED endorsement adds a row (a current one, or none on file, adds nothing), so the % denominator is unchanged for everyone else. 4 tests.
2. **App page heading stays "Dashboard"**; the tab label stays "Home".
3. **Jobs ordering — web's fit groups win**, with the A#4 nationality demotion applied INSIDE each group. The same `orderRank` (barred → fresh → direct → newest) now runs on web and app, and the app renders web's FIT_GROUPS headers.
4. **Remaining inventory rows: default to mobile-web unless it conflicts with a handoff decision.** Resolutions are recorded row-by-row in `docs/design/jobs-web-vs-app-inventory.md`. Summary: subtitle keeps A#5 (+ web's qualify count), Qualified-only keeps the A#8 chip (and gets ported to web), verdict chips replace the app's card model, chevron removed, detail banner uses web's sentence above the app's %, CTA takes web's label/colour while keeping Save + the safety note. **Two flagged unsure:** dropping the card's `% match` pill (4.1) and the safety note having no web equivalent (5.5).

## BACKLOG (after A and B)
1. **Cache `buildMatchContext` per pilot** — the authenticated `/jobs` cost is this read, not the job scan (unauthenticated repeats measure `fetch 0ms`). Target ~1.2 s → cached. Invalidate on any profile / logbook / certificate / medical / rating change (the same events that recompute `derivedTotals` are the natural hook). Must stay correct the instant a pilot edits their profile — that is why it was never cached.
2. **Requirements-coverage drop to 77.8 %** (was 80.4 %) — find which sources and which fields regressed. `/health/requirements-coverage` already breaks down per source (WHATJOBS 141/200 covered, 59 thin) and per bucket (verbatim / structured_strong / honest / structured_thin). Report-only first; no re-extract without a decision.
3. **Implicit-baseline row for an expired ELP** — jobMatch injects a not-met row for an expired licence/medical even when the ad is silent, so such a job can never read QUALIFY. English is not in that list, so a job that says nothing about English can still read QUALIFY while the dashboard shows English as a blocker. Decide whether to make it consistent (it moves the % on every job for a pilot with a lapsed ELP).
4. **`upsert-*.test.js` fixtures can't run here** — requiring `runner.js` pulls `@puppeteer/browsers`' CLI, which breaks on Node 26 with a yargs ESM/CJS error. Pre-existing (the older `upsert-sticky.test.js` fails identically). Worth unblocking so the DB fixtures are runnable.

## PRE-PUSH AUDIT (user-requested, 2026-10-07)
1. **Did any screenshot step write to prod? NO.** Prod `Pilot.nationality` is still **null** and the `nationalities` column does not exist on prod at all, so the "Egypt + United Kingdom" in the shots can only have come from the stub payload. `Pilot.updatedAt` = 2026-10-06T22:29:10Z, i.e. **before** this session's first command (~22:56Z) — and it is explained by the app's own `dashboardSeenAt` write at 22:13Z. Mechanically: `gen-payloads.js` only reads (findFirst/findMany/findUnique + fs.writeFileSync); both shooters run `page.setRequestInterception(true)` and answer **every** URL containing `/api/` from `stub-data` — web `baseURL` is `/api`, mobile `EXPO_PUBLIC_API_URL=https://cockpithire.com/api`, so all traffic was captured; Save was never clicked. **Rule: screenshot data is mocked, never written.**
2. **PII in screenshots — fixed at the source.** 6 v3 images had the real phone. Those commits were **rewritten locally before any push** (reset → re-commit), so no pushable commit ever contains them; the old blobs survive only as unreachable objects in the local reflog (`git reflog expire --expire-unreachable=now --all && git gc --prune=now` to drop them). Payloads are now redacted (`+20 ••• ••• ••00`, `pilot@example.com`). An OCR sweep (`scratchpad/ocr`, Vision framework) covers every PNG in the folder and every image blob in `main`'s history — the only email/number hits are synthetic `*@example.com` test accounts and `contact@cockpithire.com` in the old `backend/data/design-migration-audit/` shots.
3. **Deploy scoping.** `backend/railway.json` (Railway service root = `backend/`; its start command runs `npx prisma migrate deploy`) and `frontend/vercel.json` (Vercel root = `frontend/`, with the `/api/*` rewrite to Railway). There is **no root `package.json`**, so neither platform can build from the repo root. `mobile/` has no deploy config and is not referenced by either. Dashboard "Root Directory" settings are the final authority and were NOT verifiable from here (Railway CLI unauthenticated, Vercel CLI absent) — worth a 30-second check.
4. **Open question (not changed):** `profileReadiness` only makes licence / medical / passport blocker-eligible, so an **expired English (ICAO) is not a dashboard blocker** — it shows in the readiness strip. Say if it should block.
5. **Superseded `*-v2.png` dashboard shots** still show the old phantom "English (ICAO) expiry (expires 15 Nov 2026)". No PII; left as-is.

## REMAINING
1. ~~#7a nationality INPUT (UI)~~ — **DONE** (`eb02de4`).
2. ~~tsc + build + tests~~ — **DONE, all green**: `mobile tsc --noEmit` clean · `frontend npm run build` OK (ProfileRedesign chunk 40.9 kB / 11.5 kB gzip) · `jobMatch` 43 pass · `jobIdentity` 32 pass.
3. ~~v3 screenshots~~ — **DONE** (`5b741f8`).
4. **PUSH — waiting on the user's OK.** Plan below; nothing is pushed and nothing is hidden until then.
5. **A** — real-device findings (items 1–8 below).
6. **B** — mobile-web-as-reference port, starting with Jobs (inventory + side-by-side first).

### Push plan as it stands (pre-flight already run, read-only)
- **26 unpushed commits** on `main`; 58 files, +2843 / −3695 (most of the delta is `mobile/package-lock.json` from the SDK 54→57 bump).
- **Backend in the push**: `jobMatch.js` (events/eligibility/multi-nationality), `jobIdentity.js` (+#8 guard), `profileController.js` (accepts `nationalities[]`), `dashboardController.js`, `jobController.js`, both test files, `schema.prisma`, and ONE pending migration.
- **Pending migration (the only one)**: `20261007120000_pilot_nationalities` —
  `ALTER TABLE "Pilot" ADD COLUMN "nationalities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];`
  Additive, no data change, no backfill. `prisma migrate status` shows 26 found / this one unapplied; the other 25 are already applied on prod.
- **Dedup shadow is untouched**: `IDENTITY_DEDUP_APPLY` stays unset — the engine still only shadows. The user sets it on Railway AFTER the push is confirmed healthy.
- Pre-flight remaining before the push itself: `pg_dump` prod backup → `~/pilot-jobs-backups/predeploy-<date>.dump` (+ verify size and `pg_restore --list`).

### Screenshot pipeline notes (v3)
- Scripts live in this session's scratchpad: `gen-payloads.js`, `shoot-web.js`, `shoot.js`, `stub-data/`.
- `gen-payloads.js` now also writes `profile.json`, `applications.json` and `detail-nationality.json`. Two gotchas it encodes:
  - the pilot row is read with an explicit `select` that **omits `nationalities`** — the column doesn't exist on prod yet, so a full-row read throws P2022;
  - the stub `profile.json` seeds **two** nationalities (Egypt + United Kingdom) purely so the shot shows the dual-citizen case. Nothing is written back.
  - `/api/jobs/applications` must be stubbed as an **array** (the mobile profile screen does `apps.slice`); returning `{}` crashes that screen.
- `detail-nationality.json` = the live "Captain-A320 (UAE National)" job matched against a context with no nationality → the row renders as "add your nationality to check".

## OPEN DECISIONS
- ~~**Nationality storage**~~ — **SETTLED**: new `Pilot.nationalities String[]` (additive migration `20261007120000_pilot_nationalities`), legacy `nationality` kept and written with the first entry. Still needs the user's OK on shipping the extra migration with this push.
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

---

## A. Real-device findings (Expo Go on iPhone, @aladinnn tunnel — Jobs tab)
1. **One badge only**, on the **Dashboard tab**, = **new matches since last visit** (the bell, a "Matches" tab, and the Dashboard tab all showed 34 — collapse to a single source on the Dashboard tab).
2. **"Dashboard" tab label clipped on device; badge overlaps it.** Rename the tab to **"Home"** (or shrink labels further). (NB: the #6 pill-widen `244e81d` was not enough on device.)
3. **Floating tab bar hides content.** Add bottom inset = **tab bar height + safe-area** on ALL scroll screens (there's a helper in `mobile/src/theme/tabBar.ts` — `TAB_BAR_SCROLL_PADDING` or similar; apply it everywhere a ScrollView/FlatList can scroll under the bar).
4. **Jobs default sort for signed-in pilots = Best match** (status, then %, then newest); **unmet-citizenship rows last**; **Newest** as a selectable option.
5. **Jobs subtitle** → "All cockpit roles, with your match on each."
6. **Remove the Browse/Matches toggle** on Jobs (matches live on the Dashboard).
7. **Hours format "1,500 h" everywhere** — device showed "1.500" (locale thousands separator bug; force `en-US`/comma + " h").
8. **ALL-CAPS titles → Title Case** (keep acronyms like A320/ATPL/CPL); **consistent card layout**; **"Qualified only" as a proper filter chip** (not the current toggle styling).
(The blue floating gear is Expo Go's dev menu — ignore it.)

## B. New rule — mobile web (390 px) is the REFERENCE DESIGN for the app
Port the app to match the mobile web screen-for-screen (visually identical: fonts/spacing/colors from `mobile/src/theme/tokens.ts` = `frontend/src/styles/design-tokens.css`; native components where needed).
- **Start with Jobs**: region chips (Middle East / Europe / Asia / Americas / …), filters, sort, search, card design + content + order, badges ("Direct apply", match pill + reason), counts, empty states, pagination/infinite scroll, and the job detail page. **Reuse the same API params the web uses** for regions/filters — no app-only logic.
- Then compare **Dashboard, Job detail, Profile, Logbook, CV** web-vs-app and **list the differences for review BEFORE porting** each.
- **Side-by-side screenshots** (web 390 vs app) per screen → `docs/design/screens/<screen>-web-vs-app.png`. Commit per screen; keep this handoff updated.

## NEXT-SESSION ORDER
1. **Read `scratchpad/merge-report.txt`** — the first apply-run's real numbers (per source, 20 samples, suspicious, reversibility). Compare against the 11/12 preview above.
2. **Port back to web** what the app gained and web lacks: the Qualified-only chip, the fraud-safety note on the apply bar, and the airline logo tile on the detail header.
3. **Dashboard, Profile, Logbook, CV** — same inventory-first treatment as Jobs.
4. **Backlog** (match-context cache, requirements-coverage drop, upsert test fixtures).
