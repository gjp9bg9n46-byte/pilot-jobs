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

## Quality sweep — Alerts

From page audit #4 (`/alerts`). The "fix-now" batch (PlaneSave size 18→28,
match-badge typographic lockup [item B], mark-all-read store fix, empty-flash
fix, Matches-tab error+Retry, a11y labels, "+ New Saved Search" terminology,
subtitle copy) shipped in its own commit. Remaining:

- **Item C — Normalize `computeAlertScore` (HIGH PRIORITY — backend matching
  session).** Alerts display a raw additive points total (max **135**), never
  normalized: the base criteria sum to 100 even when the job doesn't specify them
  (the `else` branches award full points), then up to +35 of "new criteria"
  bonuses are added with **no matching denominator** → pilots score 110–135%
  (reproduced live at **110%** on a job with `workAuthorization: matched`). It's
  a real stored value (`JobMatch.matchScore`), not a display artifact. **Fix:**
  adopt the dynamic-`maxScore` normalization the sibling `computeMatchScore`
  already uses (`Math.min(Math.round((score / maxScore) * 100), 100)`,
  [matchingService.js:305](../backend/src/services/matchingService.js#L305)) — a
  cap alone would hide the bug and distort meaning. **Interim shipped:** the
  Alerts badge now clamps the *display* with `Math.min(Math.round(score), 100)`
  so >100% no longer shows to users — but the stored score is still un-normalised,
  so this is cosmetic only and the real fix below still stands. Self-heals on the
  next `run-match` after deploy. Touches **protected backend** (`matchingService.js`)
  — bundle with the matching backend session alongside Jobs #1 (server-side
  relevance), Login #5 (password reset + Resend), and the Alerts saved-search
  schema fix.
- **#4 Filter chips + tab pills lack ARIA.** All/Unread/Saved/Dismissed chips and
  the Matches/Saved Searches/Applications pills are plain `<button>`s with
  color-only active state. Add `role="tab"`/`aria-selected` on the tab pills and
  `aria-pressed` on the filter chips.
- **#8 Saved-search create gives no error feedback.** Beyond the schema mismatch
  itself, `handleSave` swallows the error → the modal stays open silently and the
  Save button re-enables with no message. Bundle with the backend schema fix in
  one coordinated frontend+backend change (same session).
- **#9 "Dismissed" filter empty-state.** The chip filters server-side, but no
  dismiss action is visible on cards in this UI. Investigate: is dismiss a
  supported action that's just hidden, or vestigial? If unsupported, hide the
  chip; if supported, surface the action.

Resolved (no action this sweep): Applications tab is an intentional "coming soon"
placeholder; filter/sort survive tab switches (parent state).

Still open (pre-existing, verified this sweep — not re-logged): saved-search
schema mismatch (**worse than previously known** — create 400s into a dead-end
with zero user feedback; pairs with #8); `triggerMatch()` on every mount;
`savedMap` not server-hydrated (confirmed save→reload resets 1→0, and it also
resets on tab switch — **Jobs handles this correctly via `j.isSaved`, so Alerts
is the outlier; the fix pattern already exists**); saved-search response-shape
guess (`data.searches ?? data ?? []`); PlaneSave duplicated (Jobs + Alerts) —
**now also a size mismatch** (Jobs 36px / Alerts 28px) for the eventual dedup.

## Quality sweep — Profile

From page audit #5 (`/profile`). The page audited clean overall (all 8 cards +
CRUD work, inline validation fires with no `alert()`, delete modal mechanics
solid, backend↔frontend schema aligned). The "fix-now" batch (education-clear
backend fix, Medical expiry-warning band) shipped in its own commit. Remaining:

- **✅ RESOLVED (Airlines Expansion Session 1) — #3 AircraftCombobox
  `aria-label`/`id` passthrough.** The component now accepts `id` + `ariaLabel`
  props passed through to the inner `<input>` (additive, backward-compatible).
  Used by the new fleet editor in AirlineContribute. The Profile Type Ratings
  call site can now adopt `ariaLabel="Aircraft type"` in a trivial follow-up to
  fully close its label association.
- **#4 SaveStatus + dirty indicator not announced to screen readers.** "● Unsaved
  changes" and "✓ Saved HH:MM" / "⚠ Save failed" are colored text with no
  `aria-live` (shared across all 7 cards). Wrap `SaveStatus` in
  `aria-live="polite"`; mark the decorative "●" `aria-hidden`.
- **#5 Per-card empty-state flash (ELP / Recurrent / RTW).** These cards init
  `items = []` and render "No … records" until their own `GET` resolves, so a
  pilot with records sees a brief empty flash. Add a loaded-once guard per card.
- **#6 Delete failure is silent.** `confirmDelete` closes the modal then runs
  `fn()`; if the delete API throws, the `setState` filter never runs and nothing
  surfaces. Add a catch + small error feedback (reuse the `SaveStatus` error
  pattern).
- **#7 [BUNDLE WITH MATCHING SESSION] Type ratings hardcode
  `category: 'Multi-Engine'`.** Every rating added via the form is stored with
  `category: 'Multi-Engine'` regardless of aircraft (a C172 single gets
  "Multi-Engine"). Not surfaced in the card display today (it uses `capacity`),
  but matching may consume `category` in future — fix the stored value (derive
  from the selected aircraft; AircraftCombobox likely knows the engine class)
  **before** matching starts depending on it. Logged for the matching backend
  session alongside the other matching/data-correctness items.

Resolved (no action): **#8** Save-button label inconsistency ("Save Changes" vs
"Save") — minor; **#9** one-click default licence creation — defensible
(licences legitimately have optional dates).

## Quality sweep — Logbook

From page audit #6 (`/logbook`). The page audited very healthy — all CRUD
(add/edit/clone/delete), multi-leg bulk, grouping/expand, block + night
autocompute, search, and the full CSV import flow work end-to-end. The "fix-now"
batch (AircraftCombobox Escape stopPropagation, night-currency threshold →3,
totals tile mono on Logbook + Profile, negative-hour `min="0"` guards) shipped in
its own commit. Remaining:

- **#4 Search fragments multi-leg duties.** `filteredLogs` filters individual
  legs, then `groupedRows` groups the survivors by `dutyId` — a search matching
  only some legs of a duty renders partial sectors with wrong block/PIC/night
  totals. Fix: group whole duties first, then filter (match a duty if any leg
  matches, keep all its legs). Low frequency.
- **#6 Multi-leg duty expand/collapse is mouse-only.** The duty summary row is a
  `<tr onClick={toggleDuty}>` with no `role`/`tabindex`/`onKeyDown`, and the
  chevron is a plain `<td>`. Make the chevron a real `<button>` with keyboard
  support so keyboard users can expand duties.
- **#7 a11y batch.** (a) Logbook search input has placeholder only — add
  `aria-label="Search logbook"` (same pattern as Jobs/Alerts). (b) ImportModal
  format cards (CSV/Excel) and the drop zone are `<div role="button">` /
  `<div onClick>` with no `tabindex`/keyboard handler — keyboard users can't pick
  a format or open the file browser; add `tabindex={0}` + Enter/Space `onKeyDown`.
- **#9 ImportModal Excel card is a dead-end.** Selecting "Excel" shows
  "coming soon — export as CSV" with no drop zone. Disable the card visually
  (greyed, non-selectable) with a "Coming soon" badge until `.xlsx` ships.

Resolved (no action): **#8** new-pilot wall of "0.0" totals tiles — defensible
(the Logbook is where totals live).

## Quality sweep — CV Builder

From page audit #7 (`/cv`, editor chrome only — templates/palette/PDF frozen per
Phase 13). The page audited very clean: every editable section round-trips, accent
persists, read-only sections populate, photo upload works (and auto-save doesn't
wipe it — the PUT `update` clause omits `photoUrl`), empty states render. The
"fix-now" batch (accordion + template-card keyboard support, save-status
`aria-live`, swatch `aria-pressed`, skill-input `aria-label`) shipped in its own
commit. Remaining:

- **#6 Auto-save error has no recovery path.** On a failed save the download bar
  shows "Save failed" but offers no retry — the only recovery is to keep editing
  (which reschedules the debounce). If the user stops after an error, the changes
  are silently unsaved. Add a manual "Retry save" affordance (or retry-on-interval
  with backoff).

Resolved (no action): **#7** photo upload occasionally 502s (transient
Uploadcare/gateway hiccup — succeeds on retry; the existing "Upload failed —
please try again" message handles it; flagged for ops if it recurs); **#8** skills
allow duplicates + summary over-limit doesn't block save (both minor/advisory);
**#9** "Saved" status never returns to idle (harmless).

Still open (pre-existing, verified this sweep — not re-logged): **CV template
selection not persisted** (see "CV Builder (Phase 13)" below) — confirmed live:
switch to Final → reload → reverts to Approach; needs a backend `template` schema
field, so it stays a dedicated change, not a sweep one-liner.

## Quality sweep — Airlines

From page audit #8 (`/airlines`, `/airlines/:id`, `/airlines/:id/contribute` +
PublicLayout). The surface family audited very healthy — dual-shell renders light
in both Layout and PublicLayout, contribute pre-fill passes the populated-state
calibration, the full contribution flow works (201 → success → redirect), and
detail renders correctly for populated + minimal airlines with no NaN leak. The
"fix-now" batch (list-card keyboard, list aria-labels, contribute pay-input
aria-labels, toast `role="alert"`) shipped in its own commit. Remaining:

- **#5 `relativeDate` / contributor-count unguarded against null.**
  `relativeDate(airline.lastUpdatedAt)` returns "NaN … ago" for a null/invalid
  date, and "Submitted by {verifiedContributors} pilots" prints "undefined" if
  that field is ever null. **Latent today** (0/100 airlines have either null),
  but a future scraped/contributed row without them renders visibly broken. Add
  defensive guards: `if (!d) return 'recently'` and `?? 0` on the count.
- **#6 Fleet table `<th>` lacks `scope="col"`.** The FleetBlock column headers
  (Aircraft / In Service / On Order / Retired) have no `scope`, weakening the
  screen-reader association between the numeric cells and their headers. Add
  `scope="col"` to each.

## Airlines Expansion — Session 1 (fleet editability) — follow-ups

Shipped: structured `fleetDetail` editor in AirlineContribute (add/edit/remove
rows: aircraft + in-service/on-order/retired), full-replace diff carried through
contribution → moderator approval → `airline.fleetDetail`, minimal plain-text
moderator diff renderer, AircraftCombobox `id`/`ariaLabel` passthrough. Remaining:

- **Rich fleetDetail diff styling in AdminModeration (low priority).** The
  moderator render is currently minimal plain text (Removed/Added/Changed lines).
  A polished version could colour added rows green / removed red / changed amber
  and lay them out as a compact before→after table. Cosmetic only — the data and
  the readable diff already work. Defer until the moderator UI gets broader love.

In-flight (NOT backlog — actively planned): **#7 list cards have no
logos/avatars.** ✅ DELIVERED in Sessions 2–3 (real logos live on cards + hero,
initials fallback).

## Airlines Expansion — Sessions 2–3 (500 + logos) — follow-ups

Shipped: 468 airlines (185 + 283 OpenFlights/Wikidata-seeded), `logoUrl`/`domain`/
`logoSource` columns, logo display (card + hero + initials fallback), and logo
enrichment to **428/468 (91%)** via the Wikimedia Commons CDN (batched MediaWiki
`imageinfo` API; `logoSource='WIKIMEDIA_CDN'`). Remaining:

- **Self-host migration (deferred — was the locked storage choice).** Logos are
  currently **hotlinked** from `upload.wikimedia.org` because the free-tier
  Uploadcare key didn't persist files at bulk volume (404 on stored UUIDs, then
  403 rate-limit). The Uploadcare upload helper is **preserved (unused) in
  `enrich-airline-logos.js`** for a one-switch migration: with a paid Uploadcare
  plan or S3, re-enable the download→upload path and re-run filtered by
  `logoSource='WIKIMEDIA_CDN'` to self-host the hotlinked URLs. Hotlinking risk:
  Wikimedia could rename/remove a file (rare for airline logos) → that one logo
  404s → contribute-flow `logoUrl` override or the self-host migration fixes it.
- **Tier 3 (Wikipedia infobox) for the 40 logo misses.** The strict Wikidata v3
  gate (P31 airline + P154 + not-dissolved) excluded some carriers — notably a
  cluster of well-known ones: **China Airlines, Garuda Indonesia, China Eastern,
  China Southern, Hainan, Xiamen Air, Shenzhen Airlines, Thai Airways, SriLankan,
  Lion Air, Batik Air, SpiceJet, Virgin Australia, Sun Country, Uzbekistan,
  Viva Aerobus** (+ small/charter: Bristow, Flexjet, Luxaviation, Jet Aviation,
  GlobeAir, Kalitta, GoJet, Loganair, Endeavor, Eastern Airways, Republic, Juneyao,
  Precision, Fastjet, Nepal, SalamAir, Spring, Tunisair, Airlink, Air Mauritius,
  ASKY, FlySafair, DHL/European Air Transport). They render the initials fallback
  today. A Tier-3 Wikipedia-infobox-logo scrape (the cached `wikipedia-html-cache/`
  mechanism) would likely recover most majors → ~95%+. Low urgency (fallback is
  clean); do if you want the big Asian carriers logo'd.

Still open (pre-existing, verified this sweep — not re-logged): **/jobs?q= link
ignored** (URL-state cluster — resolves when Jobs URL-state lands); **list search
has no debounce**; **fleet data corrections + HQ granularity** (long-deferred data
work); **AirlineContribution FK-cascade bug** — `DELETE /auth/account` returns 500
once a pilot has a contribution (missing `onDelete: Cascade`), orphaning the
account; belongs to the **backend cluster**, not this sweep.

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
