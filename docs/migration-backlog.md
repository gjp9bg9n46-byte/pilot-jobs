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
