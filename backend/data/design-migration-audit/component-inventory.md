# Shared Component Inventory

Components that affect multiple pages. Usage derived from `import` grep across
`pages/` + `components/`.

| Component | File | Used by | LOC | Current visual treatment |
|-----------|------|---------|-----|--------------------------|
| **Layout** (auth shell: sidebar, top bar, mobile drawer) | `components/Layout.jsx` | **All** pilot-auth + admin pages (via `App.jsx` pathless route) + logged-in airline pages | 433 | 🌑 Dark navy (`#0D1E35` sidebar, `#0A1628` bg, `#00B4D8` active). 17 cyan refs, 11 navy. **Highest-leverage single file.** |
| **PublicLayout** (slim shell for logged-out airline pages) | `components/PublicLayout.jsx` | `App.jsx` (AirlineChrome, logged-out) | 33 | 🌑 **Dark** (`#0A1628`, cyan CTA) — *not* light. Renders `SiteFooter`. |
| **SiteFooter** | `components/SiteFooter.jsx` | `PublicLayout` only (Landing now has its own light footer) | 64 | 🌑 **Dark** (`#E8F0FA` text on dark, cyan, `#243050` border). |
| **AircraftCombobox** | `components/AircraftCombobox.jsx` | `Profile`, `Logbook`, `employer/EmployerJobForm` | 258 | 🌑 Dark dropdown (1 navy, 1 surface, 1 cyan + rgba). Shared form control. |
| **ImportModal** (logbook CSV import) | `components/ImportModal.jsx` | `Logbook` | 566 | 🌑 Dark modal, **75 hex refs** (8 surface, 7 cyan, 5 navy). Heavy. |
| **JobPreviewCard** (live employer preview) | `pages/employer/JobPreviewCard.jsx` | `employer/EmployerJobForm` | 61 | 🌑 Dark — **must mirror the public Jobs card** post-migration. |
| **CV templates** (PDF render) | `components/cv/TemplateApproach.jsx` (402), `TemplateFinal.jsx` (438) | `CVBuilder` | 840 | 🎨 **PDF output — DO NOT migrate.** Uses `accentPalette` user colors. |
| **accentPalette** (CV theme presets) | `components/cv/accentPalette.js` | `CVBuilder`, both CV templates | 22 | 🎨 10 user-selectable CV colors baked into PDF. **DO NOT change.** |
| Employer route guards | `components/employer/RequireEmployerAuth.jsx` (18), `RequireEmployerStatus.jsx` (27) | Employer routes | 45 | Logic-only (a tiny loading/redirect state, 1 navy each). Trivial. |

## Patterns that are NOT extracted into shared components (rolled inline per page)
These are **duplicated** across pages and are the real migration tax:

- **Status badges** — `hiringBadge()` (Airlines, AirlineDetail: green/amber/red/grey), `MatchCountBadge` (Jobs), employer-status badges (AdminEmployers, Employer pages), job-status badges. Each defined **inline** with hardcoded semantic hex. No shared `<Badge>`.
- **Match badge / salary chip** — defined **inline inside `Jobs.jsx`** (`MatchCountBadge`, salary chips). `JobPreviewCard` re-implements the employer-side version. No shared component.
- **Modals / dialogs** — **no shared `<Modal>`**. Inline `position:fixed` overlays in: `Jobs`, `Alerts`, `Logbook`, `AdminEmployers`, `AirlineContribute`, `employer/EmployerDashboard`, plus `ImportModal` (extracted) and the `Layout` mobile drawer. **9 distinct modal implementations.**
- **Toast / notification** — **no shared toast system** (no `react-toastify`). Ad-hoc inline toast/banner state in `Support`, `Logbook`, `Settings`, `AirlineContribute`, `AdminEmployers`, `employer/*`. Each styled independently.
- **Form inputs** — inline styled `<input>/<select>/<textarea>` repeated in every form page (Login, Register, Profile, Settings, AirlineContribute, EmployerJobForm, etc.). Same dark recipe (`#0D1E35` bg, `#1E3050` border) copy-pasted ~dozens of times.
- **Tables** — bespoke per page: Logbook (flight table), AdminModeration / AdminEmployers (queues), AirlineDetail (fleet table). No shared table.

## Styling infrastructure
- **Only one CSS file:** `src/styles/landing-tokens.css` (imported **only** by `Landing.jsx`, scoped to `.landing-root`).
- **Everything else is inline `style={{}}` objects** with hardcoded hex — no CSS modules, no CSS-in-JS lib, no Tailwind.
- **Global styles live in `index.html`** `<style>`: `body { background:#0A1628; color:#fff }` + dark scrollbar (`#0A1628` track, `#243050` thumb). Shared by every page.
- `hooks/useIsMobile.js` drives all responsive breakpoints.

**Implication:** there is almost no shared styling layer to swap. The migration is
~1,200 inline-hex edits across ~30 files, plus building the missing shared
primitives (Badge / Modal / Input / Toast) would massively reduce future tax but is
a larger refactor (flag for Phase 2 scope decision).
