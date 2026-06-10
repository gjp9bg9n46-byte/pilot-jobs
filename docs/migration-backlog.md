# Design-migration backlog

Tickets surfaced during the editorial-light migration. These are **not** bugs
introduced by the migration — they are pre-existing issues or follow-ups
deferred so each phase stays presentation-only and tightly scoped.

## Primitives / follow-ups

- **✅ RESOLVED (Phase 10) — `<Modal>` `size` prop.** Additive `size` prop
  (`sm=480` default / `md=680` / `lg=960`) added in Phase 10; `JobModal` now
  consumes `<Modal size="md">`. Default `sm` keeps all existing callers
  unchanged. **Queued (separate primitive-consolidation commit, NOT Phase 10):**
  retrofit Logbook `AddFlightModal` (→ `md`) and `ImportModal` (→ `lg`) off
  their bespoke overlays onto `<Modal size>`.

- **Retrofit bespoke overlays onto `<Modal size>`.** `AddFlightModal` (680px)
  and `ImportModal` (820px) still use bespoke recolored fixed overlays. Now that
  `<Modal size>` exists, migrate both in a dedicated primitive-consolidation
  commit after Phase 10 ships clean. Verify focus/escape/backdrop/scroll-lock
  parity.

- **Collapse `AircraftCombobox` `light` prop.** Additive `light` prop (Phase 8)
  is still theme-split because `EmployerJobForm.jsx` remains dark. Once the
  employer job form migrates, remove the `light` prop + the `t` dark/light
  branch, collapse to a single light style, and drop `light` from all callers
  (Profile, Logbook). As of Phase 9, Logbook passes `light` and renders correctly.

## Latent backend (log only — do not fix during migration)

- **`DELETE /api/auth/account` returns 500 when `password` is missing.**
  `authController.deleteAccount` calls `bcrypt.compare(undefined, hash)` before
  validating that `password` was supplied, throwing instead of returning a 400.
  Works correctly when `{ password }` is provided. Input-validation gap only.
  (Observed Phase 9 verification; pre-existing, unrelated to migration.)

## Jobs page (Phase 10) — pre-existing, do NOT fix this phase

- **`Jobs.jsx` client search crashes on null fields.** `filtered` (L721–723)
  calls `j.location.toLowerCase()` / `j.title` / `j.company` assuming non-null.
  A job with `location: null` (etc.) throws during search. Fix = null-safe
  coalesce (`(j.location || '')`).

- **No URL-state sync for Jobs filters.** `authority`/`aircraftType`/`role`/
  `contractType`/`postedWithin`/`minSalary`/`search`/`sort`/`qualifiedOnly` live
  in React state only — never written to the query string. Page reload and
  shared links lose all filter/search/sort state.

- **No pagination on Jobs.** A single `jobApi.list({ limit: 1000 })` fetch loads
  everything client-side; the UI has no pagination/infinite-scroll. Won't scale
  past 1000 jobs.

- **Client/server match-logic duplication.** `computeMatchCount` (frontend)
  mirrors the server-side `qualifiedOnly` filter in `jobController.getJobs`.
  They must stay in sync by hand (already flagged in an in-file comment). Drift
  risk — long-term, compute server-side and return in the API response.

## Alerts page (Phase 11) — pre-existing, do NOT fix this phase

- **`triggerMatch()` fires on every Alerts mount.** `Alerts` POSTs
  `/jobs/alerts/run-match` once per mount (the `matchTriggered` ref resets on
  every navigation/remount), so opening Alerts re-runs matching each visit.
  Potentially expensive — consider debouncing or server-side scheduling.

- **Matches `savedMap` never hydrated from server.** `MatchesTab` inits
  `savedMap` all-false and never reads each alert's real saved state, so the
  PlaneSave toggle is optimistic-only — save state does not survive reload.

- **Saved-search response-shape uncertainty.** `SavedSearchesTab` reads
  `data.searches ?? data ?? []`, guessing the API envelope. Confirm the
  `/jobs/saved-searches` GET contract and pin the frontend to it.

- **`PlaneSave` duplicated (Jobs + Alerts).** Byte-identical copies now live in
  both pages (2 consumers). Per the "extract at 3+ consumers" rule, keep
  page-local for now; dedupe to a shared primitive/component at a 3rd consumer.

- **Saved-search create/display/edit schema mismatch (pre-existing; feature
  broken).** Discovered during Phase 11 verification. The backend stores filters
  nested as `{ name, filters: { authority, aircraftType }, frequency }`, but the
  frontend `SavedSearchModal`/`SavedSearchesTab`:
  (1) **Create** posts flat `{ name, frequency, authority, aircraftType }` →
      backend returns **400 "name and filters are required"**, so creating a
      saved search from the UI has never worked.
  (2) **Display** reads `s.authority` / `s.aircraftType` (always `undefined` —
      data lives under `s.filters.*`), so the authority/aircraft meta chips
      never render.
  (3) **Edit** initialises the form from `initial.authority` / `initial.aircraftType`
      (also `undefined`), so editing loses the filters.
  Fix = align the frontend to the `{ name, filters: {...}, frequency }` envelope
  (create payload, row display, edit prefill). The Phase-11 migration preserved
  all three verbatim (presentation-only) and did NOT fix them. Name, frequency,
  pause/resume, and delete work correctly; only the `filters` plumbing is broken.

## Airlines (Phase 12 / 12.1) — pre-existing, do NOT fix this phase

- **AirlineDetail "Open jobs at X" link is inert.** It navigates to
  `/jobs?q=<airline name>`, but Jobs reads its search from local state and never
  parses the query string (see the "No URL-state sync for Jobs filters" item
  above) — so the link lands on an *unfiltered* Jobs list. Fix is the same
  URL-state-sync work already queued for Jobs.

- **Airlines list search has no debounce.** `q` is a `fetchAirlines` dependency,
  so every keystroke fires a `GET /airlines` request. Add debounce.

- **`DELETE /auth/account` returns 500 when the pilot has airline
  contributions.** Discovered during Phase 12.1 verification: after a pilot
  submits an airline contribution, `authController.deleteAccount`'s hard
  `prisma.pilot.delete()` fails on a foreign-key constraint (the
  `AirlineContribution` relation has no `onDelete: Cascade`), returning 500 and
  orphaning the account. Pilots with flight logs / saved searches / alerts delete
  fine (those cascade), so only the contributions relation is missing the rule.
  Pre-existing, unrelated to migration. (Compounds the earlier missing-password
  500 already logged.)

## CV Builder (Phase 13) — pre-existing, do NOT fix this phase

- **Selected template is not persisted.** `template` is local component state and
  is omitted from the `cvApi.update` PUT payload (`{education, languages, skills,
  other, accentColor, summary}`); `getData` never restores it. So a pilot who
  picks "Final" gets "Approach" back on reload. `accentColor` IS persisted, so
  the gap is template-only. Pre-existing, presentation migration did not touch
  the save payload.

## Settings notification preferences (product + backend)

- **`PUT /api/.../preferences` 500 — schema mismatch.** Open since Phase 6
  (also tracked in memory `settings-double-api-bugs`). Not fixed during
  migration.

- **PRODUCT DECISION — alert cadence model (`frequency` ↔ `alertDigest`).**
  Consolidated into this Settings-preferences ticket (per Phase 11). Alerts'
  saved-search rules carry a per-rule `frequency` (INSTANT/DAILY/WEEKLY) while
  Settings' Notifications card has a single global `alertDigest` email toggle.
  No control is duplicated today, but the two models are conceptually adjacent:
  a global digest channel vs per-rule cadence. Product should decide whether
  these unify (e.g. per-rule cadence drives digest batching, or a global
  cadence with per-rule overrides) before the notification system grows.
  Migration changed neither; logged for product review.
