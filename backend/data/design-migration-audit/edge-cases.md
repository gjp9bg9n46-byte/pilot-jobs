# Edge Cases

Places where the migration needs judgment, not a mechanical token swap.

## 1. CV Builder PDF preview — **HARD BOUNDARY** 🎨
- **Files:** `components/cv/TemplateApproach.jsx` (402), `TemplateFinal.jsx` (438), `accentPalette.js` (22).
- The generated PDF is intentionally colorful using the **user-selected `CvData.accentColor`** (10 presets, each with pre-computed `light`/`dark` variants). This is product output the user controls — **must render identically before and after.**
- **Rule:** migrate **only the `CVBuilder.jsx` editor chrome** (panels, inputs, buttons, tab rail — 143 chrome hex). Treat `TemplateApproach/TemplateFinal/accentPalette` as **frozen**.
- Watch-out: `DEFAULT_ACCENT = '#0D1E35'` and several preset hexes (`#1B2B4B`, `#0D1E35`) **collide with old app surface/panel hexes**. A naive find-replace of `#0D1E35 → token` across the repo would corrupt the CV palette. **Scope every replace to a single file; never repo-wide sed.**

## 2. Jobs match badges — semantic colors **stay** 🟢🟠
- `MatchCountBadge` in `Jobs.jsx`: green `#2ECC71` (full match) / amber `#F39C12` (partial). Requirement rows use green/amber/red for matched/marginal/missing.
- **Rule:** keep the semantic palette (green=meets, amber=marginal, red=missing). Only migrate the **card/panel chrome** around them. May lightly tune the green/amber for contrast on white, but **meaning and hue family must not change.**

## 3. Alerts breakdown chips — same semantic concern 🟢🟠🔴
- `Alerts.jsx` (102 hex, 22 cyan) renders per-requirement breakdown chips with the same green/amber/red semantics. Migrate chrome; preserve semantics. High cyan count = lots of accent chrome to swap to aviation blue.

## 4. Employer Job Form live preview — **coupled to Jobs** 🔗
- `EmployerJobForm.jsx` renders `JobPreviewCard.jsx`, a live preview that should look like a real public Jobs card.
- **Rule:** migrate `JobPreviewCard` **in lockstep with `Jobs.jsx`'s card**, ideally extracting a shared job-card so they can't drift. If kept separate, migrate both in the same phase.

## 5. Airline detail fleet table — straightforward ✅
- `AirlineDetail.jsx` fleet table (`FS` styles) is structural (borders, mono numerals, em-dash for null). Migration is a clean chrome swap: dark borders→`--border`, light-text→`--text-*`, mono stays mono. **Low risk.** This is the exact surface already shown (dark) in the landing screenshot — see #11.

## 6. Admin moderation queues — dense, tight decisions ⚠️
- `AdminModeration.jsx` (314) and `AdminEmployers.jsx` (207, 9 rgba, action modals) are dense queue tables with inline action buttons, status badges, and approve/reject modals. Light theme reduces the contrast headroom dark tables enjoy — row striping/hover/borders need deliberate light-theme values, not just inverted darks. **Designer-ish judgment on table density.**

## 7. Profile page card grid — many micro-layouts ⚠️
- `Profile.jsx` (1128 LOC, 78 hex, 14 cyan) is the largest page: many cards (certificates, ratings, medicals, recurrent, RTW, ELP, preferences), each a mini-layout with its own add/delete affordances and empty states. High surface area for inconsistency. Budget extra review; consider a shared card/section primitive first.

## 8. Login + Register — confirmed in scope ✅
- `Login.jsx` (111) / `Register.jsx` (189) render outside `Layout` with their own full-screen dark styling (centered card on navy, cyan submit). Self-contained, simple — good **early wins** to validate the token system on a real auth surface. Register also hosts the employer toggle (`?as=employer`) — verify both tab states.

## Additional edge cases found during audit

- **9. `index.html` global `body { background:#0A1628 }` + dark scrollbar.** Shared by every page. Flipping it to `#F8F6F1` instantly makes **all non-migrated pages** show a navy-card-on-cream mismatch. This is the crux of the foundation strategy (see foundation-strategy.md). The landing already works around it with a runtime `document.body.style.background` set on mount/unmount.

- **10. `PublicLayout` + `SiteFooter` are still DARK** (brief assumed light). Logged-out `/airlines` + `/airlines/:id` are dark. They must migrate too — and `SiteFooter` migration only affects PublicLayout now (Landing has its own light footer), so it's safe to migrate independently.

- **11. The landing hero screenshot (`/screenshot-hero.webp`) is a DARK Emirates factfile.** Already noted as a follow-up: once `AirlineDetail` migrates to light, recapture the screenshot so the landing preview matches reality. Cross-phase dependency: landing screenshot swap should happen *after* AirlineDetail migrates.

- **12. No shared primitives (Modal/Toast/Input/Badge).** 9 inline modal implementations, ad-hoc toasts, dozens of copy-pasted dark input recipes. Pure token-swapping leaves this duplication intact (and risks missing instances). **Decision for Phase 2:** extract shared light-theme `<Modal>/<Input>/<Badge>/<Toast>` primitives first (more upfront, far less per-page tax and inconsistency), vs. swap-in-place (faster start, permanent duplication + higher miss rate). Recommend extracting at least `Input` and `Badge` early.

- **13. `AircraftCombobox` is shared across 3 pages** (Profile, Logbook, EmployerJobForm). Migrate once, early — it unblocks consistent form styling on all three.

- **14. Dead employer auth files** (`EmployerLogin.jsx`, `EmployerRegister.jsx`) are unrouted. Don't migrate; consider deleting in cleanup so they don't get "helpfully" migrated and re-imported.

- **15. Mobile drawer in `Layout.jsx`** is a separate code path (≈lines 109–313) from the desktop sidebar. Both must be migrated and **both verified at 390px** — easy to migrate desktop and forget the drawer.
