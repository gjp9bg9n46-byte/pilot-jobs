# Page Inventory

All user-facing pages. **Visual state is the key column**: everything except the
landing is still the dark navy theme. Auth tiers derived from `frontend/src/App.jsx`.

> ⚠️ **Correction to the brief:** `PublicLayout.jsx` is **NOT** light — it renders
> dark navy (`#0A1628`, cyan `#00B4D8`). So logged-out airline pages are dark, not
> "partially migrated." The *only* light surface in the app is `Landing.jsx`.

| # | Route | File (`frontend/src/`) | Auth tier | LOC | Complexity | Visual state |
|---|-------|------------------------|-----------|-----|------------|--------------|
| 1 | `/` | `pages/Landing.jsx` | public | 331 | Multi-section marketing | ✅ **Light (migrated)** |
| 2 | `/login` | `pages/auth/Login.jsx` | public | 111 | Simple form | 🌑 Dark |
| 3 | `/register` | `pages/auth/Register.jsx` | public | 189 | Simple multi-field form | 🌑 Dark |
| 4 | `/jobs` | `pages/Jobs.jsx` | pilot-auth | 979 | **Dense list + filters + match badges + modal** | 🌑 Dark |
| 5 | `/alerts` | `pages/Alerts.jsx` | pilot-auth | 682 | Dense list + breakdown chips + modal | 🌑 Dark |
| 6 | `/airlines` | `pages/Airlines.jsx` | public **or** pilot (AirlineChrome) | 202 | Card grid + filters | 🌑 Dark (Layout *and* PublicLayout) |
| 7 | `/airlines/:id` | `pages/AirlineDetail.jsx` | public **or** pilot (AirlineChrome) | 387 | Multi-section detail + **fleet table** | 🌑 Dark |
| 8 | `/airlines/:id/contribute` | `pages/AirlineContribute.jsx` | pilot-auth | 515 | Large multi-field form | 🌑 Dark |
| 9 | `/profile` | `pages/Profile.jsx` | pilot-auth | 1128 | **Many cards, micro-layouts** (largest) | 🌑 Dark |
| 10 | `/cv` | `pages/CVBuilder.jsx` | pilot-auth (lazy) | 1049 | **Editor + live PDF preview** | 🌑 Dark (⚠ PDF) |
| 11 | `/logbook` | `pages/Logbook.jsx` | pilot-auth | 1029 | **Dense table + import modal + combobox** | 🌑 Dark |
| 12 | `/settings` | `pages/Settings.jsx` | pilot-auth | 786 | Multi-section forms/toggles | 🌑 Dark |
| 13 | `/support` | `pages/Support.jsx` | pilot-auth | 148 | Simple form / FAQ | 🌑 Dark |
| 14 | `/admin/moderation` | `pages/AdminModeration.jsx` | admin (pilot-auth, UI-gated) | 314 | Dense moderation queue | 🌑 Dark |
| 15 | `/admin/employers` | `pages/AdminEmployers.jsx` | admin (pilot-auth, UI-gated) | 207 | Dense queue + action modals | 🌑 Dark |
| 16 | `/employer/dashboard` | `pages/employer/EmployerDashboard.jsx` | employer-auth | 164 | Cards + job list | 🌑 Dark |
| 17 | `/employer/profile` | `pages/employer/EmployerProfile.jsx` | employer-auth | 131 | Form | 🌑 Dark |
| 18 | `/employer/jobs/new` · `/jobs/:id/edit` | `pages/employer/EmployerJobForm.jsx` | employer-auth (APPROVED) | 321 | **Large form + live JobPreviewCard** | 🌑 Dark |
| 19 | `/employer/pending-approval` | `pages/employer/EmployerPendingApproval.jsx` | employer-auth | 68 | Simple status notice | 🌑 Dark |
| 20 | `/employer/rejected` · `/suspended` | `pages/employer/EmployerStatusNotice.jsx` | employer-auth | 47 | Simple status notice | 🌑 Dark |

## Notes / extras found
- **`pages/employer/EmployerLogin.jsx` (86 LOC)** and **`EmployerRegister.jsx` (215 LOC)** exist on disk but are **NOT routed** — `App.jsx` redirects `/employer/login|register` to the unified `/login?as=employer` / `/register?as=employer`. **Dead code** — do not migrate (or delete in a separate cleanup); flag so effort isn't wasted.
- **`pages/employer/JobPreviewCard.jsx` (61 LOC)** is a component (imported by `EmployerJobForm`), not a routed page — see component inventory. It mirrors the public Jobs card and must visually track the Jobs migration.
- Auth pages render **outside** `Layout` (their own full-screen dark styling). Employer pages also render outside `Layout` (own dark chrome + `EmployerAuthProvider`).
- All pilot-auth + admin pages render **inside `components/Layout.jsx`** (the dark sidebar shell) via a pathless `<Route element={<RequireAuth><Layout/></RequireAuth>}>`.

**Totals:** 20 routed page surfaces (+2 dead employer auth files). ~10,200 LOC of page code, of which only Landing (331 LOC) is migrated.
