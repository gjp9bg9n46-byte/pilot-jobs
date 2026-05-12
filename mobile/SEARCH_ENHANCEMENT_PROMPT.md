# Prompt: Make the jobs search page a real search experience

Paste this into Claude Code in VS Code at the repo root (`pilot-jobs/`).

---

We're overhauling the jobs search experience in our React Native / Expo pilot-jobs app. The codebase has `mobile/` (RN + Redux Toolkit + axios) and `backend/` (Node + Prisma). Before writing any UI, read these end-to-end:

- `mobile/src/screens/jobs/JobsScreen.tsx` — the list + filters + search bar you'll rebuild
- `mobile/src/screens/jobs/JobDetailScreen.tsx` — needs related changes (save, share, requirements-vs-profile)
- `mobile/src/services/api.ts` — current `jobApi` surface
- `mobile/src/store/index.ts` — jobs slice (`setJobs` exists; you'll likely add `appendJobs`, `setSavedJobs`, `toggleSavedJob`, `setSearchHistory`)
- `mobile/src/screens/jobs/AlertsScreen.tsx` — see coordination note below
- `backend/prisma/schema.prisma` — `Job` model (look at what fields exist: salary, postedAt, applyUrl, requirements, etc.) and check for `SavedJob`
- `backend/src/routes/jobs.js` + `backend/src/controllers/jobController.js` — what the list endpoint accepts as query params today
- `backend/src/services/matchingService.js` — the source of truth for "does this pilot qualify" and the per-criterion breakdown

Start your reply with a short table marking each new field or endpoint as **backend ready**, **backend partial (explain)**, or **needs backend work (propose migration + route change)**. Scaffold UI for backend-pending fields behind `// TODO: backend` comments and call them out in your summary.

## Coordination with other work

- **Saved jobs vs Saved searches.** This prompt owns "saved jobs" (bookmarked individual listings — a heart on a job card). The Alerts prompt owns "saved searches" (filter rules that generate alerts). Don't conflate them — they need different backend tables (`SavedJob` here, `SavedSearch` there).
- **Match-score breakdown.** Both this prompt and the Alerts prompt need per-criterion match info from `matchingService.js`. If you extend that service to return a breakdown (`{ score, matched: [...], missing: [...] }`), do it once and reuse on both screens.

## What to build

### 1. Server-side search (the headline fix)

`JobsScreen.tsx` currently does `jobs.filter(...)` on the client, *after* `jobApi.list` returns 50 jobs filtered only by authority. That means searching "Emirates" misses listings in the database that aren't on the current page. Fix:

- Extend `jobApi.list` to accept `q` (free-text), the existing `authority`, and the new filters described in §3 below. Send them as query params.
- Backend route should search across `title`, `company`, `location`, and `description`. If Postgres `tsvector` isn't already set up, propose a migration that adds a generated `searchVector` column + GIN index on the `Job` model.
- Debounce the text input 250ms before firing the request.
- Add an "×" clear button inside the search input (right side, only visible when there's text).
- Memoize derived values (`useMemo`) — currently the in-memory filter recomputes on every render.

### 2. "Jobs I qualify for" toggle

A single switch above the list, default off:

- When on, `jobApi.list` sends `qualifiedOnly=true`. The backend filters out listings where the pilot falls short on hours, authority, medical, or aircraft.
- This reuses the matching logic that already powers alerts. If `matchingService.js` exposes a "qualifies?" helper, lift it into a query filter. If not, propose the refactor.
- Show a small explanation row when the toggle is on ("Hiding 14 jobs that require more hours or licences you don't hold yet") — counts come from the response (`{ jobs, total, hiddenByQualification }`).

### 3. Filters sheet

Replace the inline authority chip bar with a single "Filters" button (with a badge showing the active-filter count) that opens a bottom sheet. Keep authority chips inline as a one-tap quick filter, but move *everything else* into the sheet:

- **Authority** (multi-select chips — current is single-select, broaden it)
- **Aircraft type** (multi-select picker, default-populated with the user's profile type ratings as a "Your rated aircraft" pinned section)
- **Region / country** (multi-select, sourced from the countries data the Settings work adds)
- **Role** (Captain / First Officer / Either) — backend filter on `reqPicHours > 0` or a `role` column if it exists
- **Contract type** (multi-select: Permanent / Fixed-term / Contract / Per-diem)
- **Minimum hours threshold** (numeric stepper — "Show jobs requiring at least X hours" — useful for senior pilots filtering out junior listings)
- **Salary range** (dual slider with currency picker — reuse the currency picker from the Settings work)
- **Base city** (text input with the same airport autocomplete used in the logbook work)
- **Posted within** (chips: 24h / 7d / 30d / Any time)

Sheet has a sticky "Apply" / "Clear all" footer. Apply triggers one API call with the consolidated params. Don't fire requests as the user toggles each filter inside the sheet.

### 4. Card upgrades — show what pilots actually decide on

The current `JobCard` shows title, company, location, authority, min hours. Add to each card:

- **Salary** as a prominent badge (e.g. "$120–160k / yr" — read from `job.salaryMin` / `job.salaryMax` / `job.salaryCurrency` / `job.salaryPeriod`; propose backend additions if missing).
- **Posted X days ago** in small text near the location.
- **Fit indicator** — a small colored chip showing match score from `matchingService.js`. Use the same color scale as `AlertsScreen.matchLabel` (don't duplicate the function — extract it to `mobile/src/utils/matchLabel.ts` and import from both).
- **Save heart** in the top-right corner of the card. Tap toggles saved state, optimistic. Calls a new `jobApi.saveJob(id)` / `jobApi.unsaveJob(id)`; backend needs a `SavedJob` table (propose if missing).
- **Inline qualification check** under the hours requirement: if `job.reqMinTotalHours > userTotalHours`, show "Min 5,000 hrs · You have 4,200 ✗" in amber. If the user meets it, show a small green check. Pull the user's total hours from the existing `profile.totals` (which the Profile work surfaces).
- **Applied badge** if the user has tapped Apply on this job before (see §10).

### 5. Sort

Small dropdown next to the Filters button:

- Newest (default)
- Highest match
- Highest salary
- Soonest closing date (if `closesAt` exists)
- Closest to me (requires user's home base from profile + `job.lat`/`job.lon`; if those aren't on the schema, propose them)

Send as a `sort` query param. Persist last choice in AsyncStorage.

### 6. Pagination

`jobApi.list` returns 50 and that's it today. Wire `onEndReached`:

- Accept `page` and `limit` params (default `page=1`, `limit=50`) on `jobApi.list`.
- Add `appendJobs({ jobs, total })` to the jobs slice.
- Show a footer spinner while the next page fetches.
- When filters or search change, reset to page 1 and replace (`setJobs`); when scrolling, increment and append (`appendJobs`).

### 7. Empty + error states that actually help

- **No results because of filters:** show the active filters as removable chips inline ("Authority: EASA × · Posted: 7 days ×"), each tap clears that one filter. A "Clear all filters" button below.
- **No results, no filters:** show the existing search-outline icon + "No jobs match — try a different search term" with a "Browse all jobs" button.
- **API error:** new state with a red icon + "Couldn't load jobs" + a Retry button that calls `fetchJobs`. Today the screen silently shows the empty state on any API failure.
- **First-time empty (no profile yet):** "Complete your profile to see jobs matched to you" + a button to Profile.

### 8. Search history + suggestions

Persist last 8 searches in AsyncStorage. When the search input is focused and empty, render them as tappable chips above the list. Suggestion behavior on input:

- 2+ chars → suggest from a static list of common aircraft type designators (`B737`, `B777`, `A320`, …) and airline names (extracted from the loaded jobs over time, deduped, persisted).
- Suggestions render as a dropdown overlay below the input, tap to commit.

Both lists live in `mobile/src/data/` and `AsyncStorage`. Don't ship anything heavy here — `aircraftTypes.json` (~200 entries) and a dynamic airline list are plenty.

### 9. JobDetailScreen — finish the loop

The detail screen needs to mirror the card upgrades:

- **Save heart** in the header (use `headerRight` via `navigation.setOptions`).
- **Share button** next to it — uses `expo-sharing` (or the platform share sheet via `Share.share`). Shares a deep link to the job (`yourapp://jobs/:id` plus an https fallback when deep links aren't installed).
- **Requirements vs profile comparison.** Each existing `Req` row gets a status icon on the right: green check (you meet it), amber dash (marginal — e.g. within 10% of the minimum), red x (you don't). Pull comparison logic from `matchingService.js` rather than reimplementing client-side. Add a small "Why this matters" expandable for each missing criterion.
- **Apply tracking.** When the user taps Apply (which currently does `Linking.openURL(job.applyUrl)`), also POST to a new endpoint that records `{ jobId, appliedAt }`. Surface as an "Applied 2 days ago" badge on cards and the detail page on subsequent visits. Optimistic UI; don't block the URL open. Backend needs an `Application` table (or extend `SavedJob` with a status enum) — propose if missing.
- **Report this listing** as a low-key text link at the bottom — opens a sheet ("Stale link", "Misleading title", "Spam", "Other") + optional notes. POST to a new endpoint. Useful signal for moderation; minimal UI.

### 10. Quick wins

- Extract the existing `matchLabel(score)` helper from `AlertsScreen.tsx` into `mobile/src/utils/matchLabel.ts` and import from both screens.
- When changing the authority filter (or any filter), keep the current list visible with a subtle linear-progress bar across the top, instead of swapping to a centered spinner. Less jarring.
- Replace the apply-bar `Alert.alert` flow on small errors with non-blocking toasts. Add a tiny `useToast` hook in `mobile/src/hooks/`; no new lib needed.
- The current `JobCard` has no test for `job.location` being empty — guard the meta row.

## Conventions

- Keep the existing visual language: `#0A1628` background, `#1B2B4B` cards, `#00B4D8` accent, amber `#F5A524` warnings, red `#FF4757` destructive, Ionicons icons.
- No new state libs — stay on Redux Toolkit. Add `savedJobs`, `searchHistory`, and `appliedJobIds` to the jobs slice (or a new `savedJobs` slice).
- Replace `any` types on new code with real interfaces. Add `mobile/src/types/job.ts` covering Job, JobFilters, MatchBreakdown, SavedJob, Application.
- Keep `JobsScreen.tsx` readable. If it grows past ~500 lines, split into `JobsHeader`, `JobsFilterSheet`, `JobCard`, `JobsEmptyState` under `mobile/src/screens/jobs/components/`.
- All API calls should debounce or cancel previous in-flight requests (use an `AbortController`) so rapid typing doesn't show stale results.
- Match-score breakdown logic stays on the backend; the client just renders it. Do not reimplement matching client-side.

## Deliverables

1. Backend-support table at the top of your reply.
2. The modified and new files.
3. The proposed Prisma migration + new route signatures for anything that needed backend work (text search index, `SavedJob`, `Application`, sort params, qualification filter, geo fields, reporting).
4. A short summary at the end: what shipped end-to-end, what's stubbed pending backend work, and anything you deliberately deferred (e.g. map view, deep-link routing) with rationale.

Do not start writing UI until you've read the Job model and the jobs list controller. The goal is to wire the client to what the server supports today and only propose schema changes where the UX win is clear.
