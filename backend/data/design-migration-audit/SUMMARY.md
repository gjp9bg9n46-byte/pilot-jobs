# Design-System Propagation — Phase 1 Audit SUMMARY

**Scope:** propagate the editorial-light identity (shipped on `/`) to every
authenticated surface. This document is read-only analysis; no code changed.
Artifacts live in `backend/data/design-migration-audit/`.

## Headline assessment
The migration is **roughly 65–100 focused hours (~80h) across ~28 files** — a
large but almost entirely *mechanical* job: ~**1,216 hardcoded hex** + 110 rgba
references, of which ~**1,033 are dark chrome to swap** and **183 are semantic
status colors to preserve**. The **biggest risk is corrupting the CV PDF**
(`accentPalette`/`Template*` share hexes like `#0D1E35`/`#1B2B4B` with old app
surfaces — a repo-wide find/replace would silently break user PDFs), closely
followed by losing the **green/amber/red match semantics** and by **flipping the
global `index.html` body bg too early**. The **recommended order is: foundation
tokens (no global flip) → shared shell (`Layout`/`PublicLayout`/`SiteFooter`) →
auth pages → public airline pages → shared combobox → then high-traffic monsters
(Jobs, CV, Logbook, Profile) → Alerts/Settings/Support/Contribute → Admin →
Employer portal → final `index.html` flip + cleanup last.**

## Key correction to the brief
`PublicLayout.jsx` and `SiteFooter.jsx` are **still dark** (`#0A1628`/`#00B4D8`),
**not** "already migrated." The **only** light surface in the app is `Landing.jsx`.
Logged-out `/airlines` + `/airlines/:id` are dark and in scope.

## Key counts
| Metric | Value |
|---|---|
| Routed page surfaces | 20 (+2 dead unrouted employer auth files) |
| Total page LOC | ~10,200 (only Landing's 331 migrated) |
| Total hardcoded hex (pages+components) | **1,216** |
| Total rgb()/rgba() | 110 |
| Distinct hex values | 114 |
| Dark **chrome** to migrate | ~1,033 |
| **Semantic** to preserve (green 55 / amber 43 / red 85) | **183** |
| Files in active scope | ~28 |
| Frozen (CV PDF) | 3 (`Template*`, `accentPalette.js`) |
| Dead/unrouted | 2 (`EmployerLogin/Register.jsx`) |
| Only existing stylesheet | `styles/landing-tokens.css` (landing-only) |
| Global coupling | `index.html` `body{background:#0A1628}` + scrollbar |

## Heaviest files (effort hot-spots)
`CVBuilder.jsx` 143 hex (UI only) · `Jobs.jsx` 123 · `Alerts.jsx` 102 · `Logbook.jsx` 94 ·
`Profile.jsx` 78 · `ImportModal.jsx` 75 · `Layout.jsx` 53 (highest leverage) · `Settings.jsx` 53.
The four "monster" pages (Jobs/CV/Logbook/Profile ≈ 4,185 LOC, ~486 hex) dominate effort.

## Recommended foundation: **Option C (scoped adoption)**
Promote token *definitions* to `:root` + a reusable `.app-light` wrapper (keep
`.landing-root` working), import once globally, but **do not change `index.html`
body bg** until the very end. Each surface opts into light via a wrapper class +
the proven runtime `document.body.style.background` trick. Result: zero breakage
for non-migrated pages, each file migrated exactly once (no legacy-var double-touch
of Option A, no broken-in-prod window of Option B). **Open decision:** also extract
shared `<Input>`/`<Badge>`(/`<Modal>`) primitives in Phase 2 (+3–5h) to cut later
per-page tax ~15–25% and reduce "missed dark island" risk — recommended.

## Recommended migration order (phases 2–16)
2 Foundation tokens → 3 Shared shell → 4 Login/Register → 5 Airlines + AirlineDetail
(+ recapture landing screenshot) → 6 AircraftCombobox → 7 Jobs (+JobPreviewCard) →
8 CV Builder UI (freeze PDF) → 9 Logbook (+ImportModal) → 10 Profile → 11 Alerts →
12 Settings + Support → 13 AirlineContribute → 14 Admin ×2 → 15 Employer portal →
16 **Global `index.html` flip + cleanup (last)**.

## Top risks (see risks.md)
1. 🔴 **CV PDF corruption** — never repo-wide sed; freeze CV files; before/after PDF diff.
2. 🔴 **Semantic color loss** — preserve the 183 green/amber/red refs; migrate only surrounding chrome.
3. 🔴 **Early global body-bg flip** — gate to the final phase.
4. 🟠 Forgotten dark islands in 9 inline modals / ad-hoc toasts / copy-pasted inputs.
5. 🟠 Mobile drawer in `Layout` (separate path) + mobile contrast regressions on cream.

## Artifacts in this folder
`page-inventory.md` · `component-inventory.md` · `style-pattern-counts.json` ·
`edge-cases.md` · `foundation-strategy.md` · `migration-order.md` · `risks.md` · `SUMMARY.md`

**Status:** Phase 1 complete, read-only. No code changed, nothing staged/committed.
Awaiting review before Phase 2 (foundation) is planned separately.
