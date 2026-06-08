# Design Primitives

Reusable, light-theme building blocks for the app-wide design-system migration.
Use them when migrating a page from the old dark theme so styling stays
consistent and — critically for `Badge` — semantically correct. They use the
global tokens from `src/styles/design-tokens.css` (`var(--bg)`, `var(--accent)`,
etc.) and follow the codebase's inline-styles pattern (no CSS files).

**Live showcase:** [`/dev/primitives`](https://cockpithire.com/dev/primitives) renders every primitive in every state.

```js
import { Badge, Input, Modal, Card } from '../components/primitives';
```

## Badge
Semantic status pill. **The one place status colors live** — never hand-type a
status hex. Invalid variant → dev warning + falls back to `neutral` (never throws).

```jsx
<Badge variant="success">Approved</Badge>     {/* green  — match, approved, active */}
<Badge variant="warning">Pending Review</Badge>{/* amber — marginal, expiring */}
<Badge variant="error">Rejected</Badge>        {/* red   — missing, rejected, expired */}
<Badge variant="info">In Progress</Badge>      {/* blue  — informational */}
<Badge variant="neutral">Inactive</Badge>      {/* gray  — default */}
```

## Input
Light form control. `forwardRef`s to the underlying element. `as` = `'input'`
(default) | `'textarea'` | `'select'`. Optional `label` and `error` props.

```jsx
<Input type="email" label="Email" value={email} onChange={onChange} />
<Input as="textarea" label="Description" rows={4} />
<Input as="select" label="Country" value={country} onChange={onChange}>
  <option value="">Select…</option>
</Input>
<Input label="Phone" error="Invalid phone number" />
```

## Modal
Dialog with backdrop. Centered above 640px, bottom-sheet below. Closes on
backdrop click / Escape / the X button; locks body scroll while open.
`isOpen={false}` renders nothing.

```jsx
<Modal isOpen={open} onClose={() => setOpen(false)} title="Approve employer?">
  <p>This will approve their account and unlock job posting.</p>
  <button onClick={onConfirm}>Confirm</button>
</Modal>
```

## Card
Surface container. `as` defaults to `'div'`. `hover` opts into a subtle shadow
lift (no translate).

```jsx
<Card><h3>Title</h3><p>Content</p></Card>
<Card as="article" hover className="custom">…</Card>
```

## Migration guidance
When migrating a page from the dark theme:
- Replace inline-styled `<input>/<select>/<textarea>` → `<Input>`.
- Replace status pills (hiring status, match, employer status, job status) → `<Badge variant="…">`. Map old semantics: green→`success`, amber→`warning`, red→`error`, blue/cyan→`info`, grey→`neutral`.
- Replace bespoke `position:fixed` overlays → `<Modal>`.
- Replace surface panels → `<Card>`.
- Wrap the migrated page (or its shell) in `className="app-light"` to adopt the light surface.

## Chrome hover utility classes
Inline styles can't express `:hover`, so migrated chrome uses these global
classes (defined in `src/styles/design-tokens.css`, scoped under `.app-light`).
The element must be inside an `.app-light` subtree.

| Class | Effect | Rule for use |
|-------|--------|--------------|
| `nav-link` | `:hover` → `background: rgba(0,63,136,0.05)` | **Don't** set an inline `background` (inline beats `:hover`). Active state uses a 3px left-border + accent text instead of a fill. |
| `icon-button` | `:hover` → `background: rgba(0,63,136,0.05)` | **Don't** set inline `background`. Give it a `border-radius` so the hover fill looks right. |
| `footer-link` | base `color: var(--text-primary)`, `:hover` → `var(--accent)` | **Don't** set inline `color` — the base color comes from the class so `:hover` can override it. |

Used by `Layout.jsx` (sidebar/drawer nav + icon buttons) and `SiteFooter.jsx`.

## Banned patterns
- **NEVER** run a repo-wide color replace, e.g. `find . -exec sed -i 's/#0D1E35/var(--surface)/g'`. Several hexes (`#0D1E35`, `#1B2B4B`) are **also** intentional CV-PDF accent colors in `components/cv/accentPalette.js` + `Template*.jsx` — a blind replace corrupts user PDFs. Migration is **per-file judgment**, never global sed.
- Don't tokenize the `Badge` semantic colors yet — they're deliberately internal until another primitive (Toast/Alert) needs to share them.
- Don't add CSS files for primitives — hover/focus/animation are done with React state + inline styles on purpose.
