# Migration Order

Ordered to (a) de-risk with the shell + small wins first, (b) keep each phase an
isolated reviewable PR, (c) front-load shared surfaces that unblock many pages.
Effort = focused Claude Code hours (implement + self-verify on live). Hex counts
from `style-pattern-counts.json`.

| Phase | Scope | Files | ~hex | Effort | Risk | Why here |
|------:|-------|-------|-----:|:------:|:----:|----------|
| **2 — Foundation** | Global `design-tokens.css` (`:root` + `.app-light`), import in `main.jsx`, **no** `index.html` body change yet. (Optional: extract `<Input>`/`<Badge>` primitives.) | `styles/`, `main.jsx` | 0 | **2–4h** | 🟢 Low | Inert definitions; nothing breaks. Optional primitives add 3–5h but pay back fast. |
| **3 — Shared chrome** | `Layout.jsx` (desktop sidebar **+** mobile drawer + top bar), `PublicLayout.jsx`, `SiteFooter.jsx` | 3 | ~61 | **5–7h** | 🟠 Med | Lights the shell for all pilot/airline pages at once; mobile drawer is a second code path. Most leverage. |
| **4 — Auth surfaces (warm-up)** | `Login.jsx`, `Register.jsx` (incl. employer toggle) | 2 | ~46 | **2–3h** | 🟢 Low | Self-contained, simple; validates tokens on real non-Layout pages. Early visible win. |
| **5 — Public airline pages** | `Airlines.jsx`, `AirlineDetail.jsx` (fleet table) + recapture `/screenshot-hero.webp` | 2 | ~63 | **4–6h** | 🟢-🟠 | Public-facing (visible to prospects); fleet table is clean; closes the landing screenshot follow-up. |
| **6 — Shared form control** | `AircraftCombobox.jsx` | 1 | ~12 | **1–2h** | 🟢 Low | Unblocks consistent inputs on Profile/Logbook/EmployerJobForm before those land. |
| **7 — High-traffic: Jobs** | `Jobs.jsx` + `employer/JobPreviewCard.jsx` (lockstep), preserve match-badge semantics | 2 | ~142 | **6–9h** | 🔴 High | Densest, highest-traffic, semantic colors + modal. Extract shared job-card if feasible. |
| **8 — CV Builder (UI only)** | `CVBuilder.jsx` chrome **only**; freeze `cv/Template*` + `accentPalette` | 1 | ~143 | **6–9h** | 🔴 High | Huge file; PDF boundary is the top correctness risk — must not touch templates/palette. |
| **9 — Logbook** | `Logbook.jsx` + `ImportModal.jsx` (566 LOC) | 2 | ~169 | **7–10h** | 🟠 Med | Dense table + heavy modal; uses the now-migrated combobox. |
| **10 — Profile** | `Profile.jsx` (many card micro-layouts) | 1 | ~78 | **6–8h** | 🟠 Med | Largest page; consistency risk across many cards. Benefits from Phase-2 card primitive. |
| **11 — Alerts** | `Alerts.jsx` (breakdown chips, semantics) | 1 | ~102 | **4–6h** | 🟠 Med | Semantic chips; lots of cyan chrome. |
| **12 — Settings + Support** | `Settings.jsx`, `Support.jsx` | 2 | ~65 | **4–6h** | 🟢 Low | Forms/toggles; Support is tiny. |
| **13 — AirlineContribute** | `AirlineContribute.jsx` (large form) | 1 | ~32 | **3–4h** | 🟢 Low | Big but repetitive form fields. |
| **14 — Admin** | `AdminModeration.jsx`, `AdminEmployers.jsx` (queues + action modals) | 2 | ~80 | **5–7h** | 🟠 Med | Dense tables need deliberate light values; low traffic so lower urgency. |
| **15 — Employer portal** | `EmployerDashboard`, `EmployerProfile`, `EmployerJobForm`, `EmployerPendingApproval`, `EmployerStatusNotice` (skip dead `EmployerLogin/Register`) | 5 | ~124 | **6–8h** | 🟠 Med | Separate auth chrome; JobPreviewCard already done in Phase 7. |
| **16 — Final flip + cleanup** | `index.html` body bg → `#F8F6F1` + scrollbar; remove per-page body-bg runtime hacks; delete dead employer auth files; final full-app sweep | 2+ | — | **2–4h** | 🟠 Med | Only safe once *every* surface is light. Full regression pass after. |

## Totals
- **~28 files** in active scope (excludes 3 frozen PDF files + 2 dead files).
- **Total effort: ~65–100 focused hours** (midpoint ≈ **80h**), spread across ~15 phases.
- The optional **shared-primitive extraction** in Phase 2 (+3–5h) reduces Phases 7–15 by an estimated 15–25% and sharply lowers inconsistency risk — recommended.

## Sequencing principles applied
- **Shell before bodies** (Phase 3) — one change lights the chrome for ~12 pages.
- **Small wins before monsters** (Auth/Airlines before Jobs/CV/Logbook) — proves the system on low-risk surfaces.
- **Shared controls before their consumers** (Combobox → Profile/Logbook/Employer; JobPreviewCard with Jobs).
- **Highest-risk in the middle**, when the system is proven but energy/attention is high.
- **Global body flip dead last** — the only step that can break everything at once.
