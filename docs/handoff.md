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

## REMAINING — do each, commit after each
1. **#7a Nationality INPUT (UI)** — the only feature piece left. Country pick-list, **multi-select** (dual citizens), web + mobile personal-info edit. MATCHING ONLY: not on public profile header, never sent to employers unless the pilot applies (already true — not in employer DTO).
   - Storage DONE: `Pilot.nationalities String[]`; API accepts `nationalities[]`; matcher reads it. Just the UI remains.
   - **Web** `frontend/src/pages/ProfileRedesign.jsx`: the personal-info/identity edit sheet. Find the edit-sheet for name/country/etc. (search `openEdit(` / `editing.kind` / where `country`/`city` are *edited*, not just displayed — earlier grep only found displays, so the edit input may need adding). Add a multi-select country picker bound to `profile.nationalities`; POST via the existing profile update (sends `nationalities`). A country list util may already exist (check `frontend/src/lib` for a countries list; else a small `<select multiple>` or chip-add).
   - **Mobile** `mobile/app/(app)/(tabs)/profile/index.tsx`: same, in the personal-info edit sheet; bind to `profile.nationalities`; PATCH via the existing profile update.
   - **"Add nationality" link**: the matcher gap for key `nationality` → `ADD_LABEL.nationality='your nationality'`, `gapPhrase` → "add your nationality to check". Web `JobDetailPanel.jsx` has `ADD_LINK` map (key→route) → add `nationality:'/profile'` (and `clearance` if wanted). Mobile detail: the nationality "add" row should route to `/profile`.
   - Confirm profile GET returns `nationalities` (check the profile controller GET select; prisma full-row returns it unless a select omits it).
2. **tsc + build**: `cd mobile && ./node_modules/.bin/tsc --noEmit`; `cd frontend && npm run build`; `node --test backend/src/services/__tests__/jobMatch.test.js` + `jobIdentity.test.js`.
3. **v3 screenshots** → `docs/design/screens/*-v3.png`: web 1280/820/390 (`npm run build` → `vite preview :4173` → `scratchpad/shoot-web.js`, but UPDATE its output names to `-v3`) + mobile (`gen-payloads.js` → stub-data → expo web :8081 from main/mobile → `scratchpad/shoot.js`, update names to `-v3`). Regenerate payloads first (`node scratchpad/gen-payloads.js` from backend/). The v2 shots already proved the pipeline; v3 just needs the new names + nationality-input shots.
4. **Push** (see checklist). NOTE: there is now a SECOND pending migration `20261007120000_pilot_nationalities` (plus the 4 already-applied ones from the A/B deploy — check `prisma migrate status`; only the new one should be pending).

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
1. **#7a nationality UI** (web + mobile input + "Add nationality" link) — see REMAINING §1.
2. **tsc / build / tests** — see REMAINING §2.
3. **v3 screenshots** — see REMAINING §3.
4. **Push** — pre-flight + post-deploy checks (PUSH CHECKLIST). After healthy → user sets `IDENTITY_DEDUP_APPLY=1` → report first nightly merges.
5. **A** — real-device findings above (items 1–8).
6. **B** — mobile-web-as-reference port, starting with Jobs (inventory + side-by-side first).
