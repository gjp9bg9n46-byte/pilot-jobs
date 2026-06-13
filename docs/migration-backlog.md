# Design-migration backlog

Tickets surfaced during the editorial-light migration. These are **not** bugs
introduced by the migration — they are pre-existing issues or follow-ups
deferred so each phase stays presentation-only and tightly scoped.

## Quality sweep — Landing

Findings from the Landing (`/`) quality audit. The "fix-now" batch (stats wiring,
cadence copy, employer CTA, focus-visible ring, alt cleanup, freshness helper)
shipped; the items below were deferred.

- **#1 Footer About / Privacy / Terms are dead links (`href="#"`).** Navigate
  nowhere (jump to top). Privacy Policy + Terms are **legal exposure** for a
  product handling pilot PII; About needs content. Deferred per user — needs real
  destinations/pages before code.
- **#3 Hardcoded factfile fleet stats will drift.** `FACTFILES`
  (Emirates/Lufthansa/Delta) hardcodes fleet strings (e.g. "117 777-300ER · 116
  A380-800") that diverge from the live factfile data the cards link to. Fetch
  from the same source, or mark as illustrative.
- **#6 Unverified capability claims in feature copy** — verify each is true:
  - "Instant push alerts … within minutes" — confirm push delivery is actually live.
  - "Import from ForeFlight CSV" — the importer is generic column-mapped CSV;
    confirm ForeFlight-specific support vs generic.
  - `SOURCES` chips (Shield AI, Joby, Wisk, Ameriflight, "+ more added weekly") —
    confirm each is actively monitored.
- **#10 "Daily" in the 56px JetBrains Mono numeral slot.** The third data-strip
  stat renders the word "Daily" in a slot styled for digits — reads awkwardly
  beside "185"/"175". Typographic decision deferred.
- **#11 Logged-in pilot at `/` sees the full Landing** (no redirect to `/jobs`).
  Defensible (public marketing page; CTAs route correctly via `/login`→`/jobs`).
  Noted, not actioned.
- **#12(b) "+ more added weekly" styled as a source chip** among real source
  names — label/data ambiguity.
- **#12(c) ✈ emoji wordmark** glyph renders inconsistently across platforms
  (system-wide nit; consistent with the rest of the app).
- **#12(d) Three routes to `/login`** (nav CTA, hero CTA, footer "Web App") — not
  a problem, just noted.
- **#15 + #16 Three feature card photos pending sourcing** (Phase A in flight):
  Always-fresh listings (replace), Instant push alerts (add), Digital logbook
  (add). Ship in a follow-up commit once candidates are picked.

## Quality sweep — Login + Register

From page audit #2 (`/login`, `/register`). The "fix-now" batch (network-error
copy, pilot `errors[]` parsing + client email check, `role="alert"` /
`aria-live` a11y, per-field `autoComplete`, Register first-field autofocus)
shipped in its own commit. Remaining:

- **#5 No password-reset flow (HIGH PRIORITY).** No "Forgot password?" link, no
  `/auth/forgot-password` endpoint, no reset-token generation/validation, no
  email send. Needs its own session — pairs naturally with Resend integration
  since both need transactional-email infra. Anyone who forgets a password is
  locked out today.
- **#6 No email verification on pilot signup (normal).** Account goes live
  immediately with an unverified address. Lower urgency — a real, reachable
  email is already required for job alerts, and verification adds signup friction.
- **#7 No password show/hide toggle** on any password field (Login + both
  Register modes). Standard affordance; cuts typos on the `noValidate` forms.
- **#8 Pilot register validation is banner-only,** inconsistent with employer
  mode which sets per-field `fieldErrors`. Move pilot to per-field errors for parity.
- **#11 No `:focus-visible` ring** on the custom segmented Pilot/Employer toggle,
  the submit `<button>`s, or footer links (these are real `<button>`/`<Link>`,
  unlike Landing's all-anchor case). Add an accent outline rule.
- **#12b body-bg restore is hardcoded** to `#0A1628` on unmount in Login/Register
  (Landing saves/restores the previous value). Brittle if the app default
  changes, harmless today. Adopt the save/restore pattern.
- **#12c No scroll-to-first-error** on the long employer register form — if a
  field below the fold fails, both banner and field error can be off-screen.

Resolved (no action): **#9** no loading spinner (text feedback is sufficient);
**#10** pilot has no confirm-password field (intentional — lighter pilot signup).

## Quality sweep — Jobs

From page audit #3 (`/jobs`). The "fix-now" batch (search placeholder copy,
a11y labels on sort/search/save, profile-notice info treatment, cadence copy,
min-salary null-hiding) shipped in its own commit. Remaining:

- **#1 Wire server-side relevance / match-score into the `/jobs` list endpoint
  (HIGH PRIORITY).** The list response carries no per-pilot `matchScore` (0/19
  live jobs), which is the root cause of three separate symptoms: the "Most
  Relevant" sort is a silent no-op (`jobController.getJobs` has no `relevant`
  case → falls through to `postedAt desc`, identical to "Newest"); the card
  `matchLabel(job.matchScore)` badge is dead code (#3); and it overlaps the
  existing client/server match-duplication item below. Touches **protected
  backend files** (`jobController`, `matchingService`) — needs its own
  audit→plan→implement→verify session after the audit cycle. Landing this also
  turns the min-salary null-handling (#2, shipped as a client guard) into a
  clean product decision and lets the client-side `computeMatchCount`
  duplication retire.
- **#3 Dead card match-score badge.** `matchLabel(job.matchScore)` never renders
  because the list endpoint omits `matchScore`. Resolves automatically when #1
  lands (or remove the badge if #1 is deferred indefinitely).
- **#7 Card-level click + factfile cross-link are mouse-only.** The "View
  {airline} factfile →" shortcut is a `<div onClick>` (no role/tabindex/keydown)
  — the real a11y gap; make it a real `<button>`/link. The card-level click is
  acceptable as-is since the focusable "View Details" button covers keyboard users.
- **#9 No clear (×) affordance on the search field.** Clearing requires manual
  select-all + delete. Touches the `<Input>` primitive — note as a potential
  primitive enhancement (clearable variant).
- **#10 "Clear All" only resets pending filter values, not applied filters.**
  Clicking Clear All then closing the panel without Apply leaves the applied
  filters (and the badge count) active — confusing. Clarify semantics (auto-apply
  on Clear All, or relabel).
- **#11 Min Salary filter is currency-naive.** No `salaryCurrency` awareness; a
  single numeric threshold across mixed currencies drifts once non-USD jobs land
  (all USD today).

Resolved (no action): **#12** Qualified-only defaults ON for new pilots
(intentional — coherent with the profile-completion nudge); **#13** no loading
skeleton (consistent with the app-wide text-feedback pattern).

Still open (pre-existing, verified this sweep — not re-logged): `filtered`
null-field crash (latent — the scraper writes empty strings, not nulls, so it
doesn't fire today, but one true `null` location would still crash search);
URL-state sync (filter changes still produce no query params); no pagination
(still `limit:1000`; 19 jobs live); client/server match duplication (resolves
with #1).

## Primitives / follow-ups

- **✅ RESOLVED (Phase 10) — `<Modal>` `size` prop.** Additive `size` prop
  (`sm=480` default / `md=680` / `lg=960`) added in Phase 10; `JobModal` now
  consumes `<Modal size="md">`. Default `sm` keeps all existing callers
  unchanged. **Queued (separate primitive-consolidation commit, NOT Phase 10):**
  retrofit Logbook `AddFlightModal` (→ `md`) and `ImportModal` (→ `lg`) off
  their bespoke overlays onto `<Modal size>`.

- **✅ RESOLVED (primitive consolidation) — Retrofit bespoke overlays onto
  `<Modal size>`.** `AddFlightModal` → `<Modal size="md">` (680), `ImportModal`
  → `<Modal size="lg">` (960); bespoke overlay/modal/header css retired. The
  primitive now owns backdrop, title+X, focus, scroll-lock, escape +
  backdrop-click close, and the mobile bottom-sheet. Verified e2e (multi-/single-
  leg save; CSV upload→preview→confirm; focus/escape/backdrop/mobile parity).

- **✅ RESOLVED (primitive consolidation) — Collapse `AircraftCombobox` `light`
  prop.** Prop + dark style branch removed; single token-based style adapts to
  warm `.app-light` and cool `.app-b2b` automatically. `light={true}` dropped
  from all three call sites (Profile, Logbook, EmployerJobForm). Verified on all
  three surfaces.

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

## Employer portal (Phase 14)

- **✅ AircraftCombobox `light` prop — ready to collapse.** Phase 14 flipped the
  last dark consumer (EmployerJobForm → `light`). The prop now has ZERO dark
  consumers (Logbook/Profile/EmployerJobForm all pass `light`). Queued follow-up
  (separate mechanical commit): remove the `light` prop + the `t` dark/light
  branch in AircraftCombobox.jsx, collapse to a single light style, drop `light`
  from all three call sites.

- **Pre-existing: EmployerJobForm preview sticky releases past its cell.** The
  live-preview column is `position:sticky, top:24` inside a grid with
  `alignItems:start`, so its cell is content-height (~one screen). The preview
  unpins once scrolled past that — pre-existing (structure preserved verbatim by
  the migration, not a regression). Fix if desired: drop `alignItems:start` on
  that grid or give the preview cell full row height.

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
