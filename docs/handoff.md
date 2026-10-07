# Handoff — Batch C round 3 → **PUSHED 2026-10-07 (origin/main 40bb928)**, post-deploy watch

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
- **5xx**: one 502 at 23:51:56Z — the Railway restart itself. Clean afterwards (monitor running to ~00:22Z).
- **identityFirstSeenAt**: ACTIVE 365/368. The 3 gaps are rows the startup ADZUNA scrape inserted at 23:55 (Pacific Seafood, National Airlines, ABX Air) — i.e. **new rows are inserted without `identityFirstSeenAt`** and only get it from the backfill pass. Worth fixing at insert before the dedup rollout.
- **Dedup is still shadow-only for the identity engine** (`collapseByIdentity({ dryRun: !IDENTITY_DEDUP_APPLY })`, env unset). The 505 merged-away + 1347 plain-expiry rows touched since the deploy come from the **legacy, ungated** `src/scrapers/dedup.js` passes + the `expireUnseen` backstop, which run on every scrape — the same run pre-push (18:25, commit 822d6e4) touched 10408 + 13512, an order of magnitude more. ACTIVE feed: 368.
- **Timings (from my laptop, so network-inclusive; `/stats/landing` ≈ 250 ms is the RTT floor)**: `/jobs?limit=20` 3691 / 898 / 717 ms; `/dashboard` 3953 / 1314 / 2327 ms. Server-side `?_perf=1` on `/jobs`: `fetch` 858–1142 ms, `matchJS` 10–19 ms — i.e. the 45 s job-data cache was **not** hitting, which is expected while the startup scrape was still inserting rows and busting it. **No pre-push baseline was captured from this vantage** — re-measure once the feed is quiet before calling it a regression.

### ⚠️ One prod write I caused (not profile data)
`postdeploy.js` calls `GET /api/dashboard` **as the pilot**, and that endpoint advances the visit window:
- `dashboardSeenAt` 2026-10-06T22:13:51.229Z → **23:55:46.222Z**
- `previousDashboardSeenAt` 2026-10-06T19:50:11.406Z → **22:13:51.229Z**
Profile fields are untouched (`nationality: null`, `nationalities: []`, phone/country/city/education unchanged). Effect: the "new since your last visit" baseline moved. Exact prior values are recorded here and can be restored on request. **Fix for next time: health-check the dashboard with a throwaway pilot, or add a no-advance flag.**

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
1. **`IDENTITY_DEDUP_APPLY=1`** — user sets it on Railway once the watch is green; then report the first nightly merges.
2. **A** — real-device findings (items 1–8 below).
3. **B** — mobile-web-as-reference port, starting with Jobs (inventory + side-by-side first).
4. Small follow-ups surfaced by the deploy: set `identityFirstSeenAt` at insert (3 rows missed it); decide whether an expired English (ICAO) should be a dashboard blocker; re-measure `/jobs` + `/dashboard` on a quiet feed.
