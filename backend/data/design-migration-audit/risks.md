# Risks — full app-wide migration

Severity = likelihood × blast radius if it ships.

| # | Risk | Severity | Mitigation |
|---|------|:--------:|------------|
| 1 | **Mid-migration inconsistency** (some pages light, some dark) visible to live users for weeks. | 🟠 Med | Option C scoping (foundation-strategy): un-migrated pages stay fully dark and self-consistent; the body bg stays navy until the final flip. No "half-broken" pages. Ship per-phase, never flip global early. |
| 2 | **CV PDF accidentally changed.** A repo-wide find/replace of `#0D1E35`/`#1B2B4B` (which appear in `accentPalette` *and* old app surfaces) corrupts user PDFs. | 🔴 High | **Never run repo-wide color sed.** Scope every edit to one file. Freeze `cv/Template*.jsx` + `accentPalette.js`. Add a verification step rendering a PDF before/after Phase 8 and diffing visually. |
| 3 | **Semantic colors mistakenly migrated** (match green/amber/red, status badges) — meaning lost. | 🔴 High | Maintain an explicit "preserve" list (style-pattern-counts.json → semantic_preserve, 183 refs). Migrate only chrome around badges. Tune semantic hues for white-bg contrast only if needed, keeping hue family + meaning. |
| 4 | **Forgotten dark refs in nested/inline components** (9 inline modals, ad-hoc toasts, copy-pasted inputs) leave dark islands. | 🟠 Med | Per-file `grep '#[0-9a-f]{6}'` must hit ~0 (minus semantic) before a phase is "done." Verify each migrated route at 1280px **and** 390px. Extracting shared `<Modal>/<Input>/<Badge>` (Phase 2 option) removes most hiding spots. |
| 5 | **Mobile drawer in `Layout.jsx` missed** (separate code path from desktop sidebar). | 🟠 Med | Phase 3 checklist explicitly includes the drawer (≈L109–313); verify open-drawer at 390px. |
| 6 | **Global `index.html` body bg / scrollbar flipped too early**, breaking every non-migrated page at once. | 🔴 High | The flip is the **last** step (Phase 16). Until then, body bg stays navy and migrated surfaces set their own bg via wrapper + runtime hack (proven on landing). |
| 7 | **Contrast/readability regressions on mobile** — dark-theme contrast assumptions don't hold on cream; faint `#7A8CA0`/`#4A6080` text becomes too light on white. | 🟠 Med | Map old muted texts to `--text-secondary (#5A5F66)` (WCAG-AA on cream), not a literal lightness invert. Spot-check AA contrast on dense pages (Jobs, Logbook, Admin) at 390px. |
| 8 | **JobPreviewCard ↔ Jobs card drift** — employer preview stops matching the real card. | 🟠 Med | Migrate both in Phase 7; ideally extract one shared job-card component so they can't diverge. |
| 9 | **Designer-level decisions on dense tables** (Admin queues, Logbook) — light tables need row striping/hover/border choices, not a mechanical invert; risk of muddy or low-contrast results. | 🟠 Med | Define light table conventions once (border `--border`, hover `--bg`, zebra optional) during Phase 9/14 and reuse. Surface a sample to you for sign-off before applying broadly. |
| 10 | **Scope creep into backend / protected files.** | 🟢 Low | Hard rule already set: no backend, no `matchingService/jobController/profileController/cvController/airlineController`. Migration is frontend-presentation only. |
| 11 | **Landing screenshot mismatch** — `/screenshot-hero.webp` stays a dark Emirates page after AirlineDetail goes light. | 🟢 Low | Recapture during Phase 5 (right after AirlineDetail migrates); already tracked as a follow-up. |
| 12 | **Effort underestimate** — 8 files exceed 500 LOC; "simple swap" balloons on Profile/CV/Logbook/Jobs. | 🟠 Med | Phased estimates include ranges; treat the 4 monster pages (Jobs/CV/Logbook/Profile ≈ 4,185 LOC, ~486 hex) as multi-session each. Re-estimate after Phase 7 actuals. |

## Top 3 to watch
1. **CV PDF corruption (#2)** — the one truly irreversible-feeling user-visible bug; enforce file-scoped edits + before/after PDF check.
2. **Semantic color loss (#3)** — silently breaks the product's core "do I qualify?" signal.
3. **Early global flip (#6)** — the single action that can break the whole app in one commit; gate it to last.
