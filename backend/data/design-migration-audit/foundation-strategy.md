# Foundation Strategy — moving tokens without breaking the still-dark app

## The core problem
Tokens currently live on `.landing-root` in `src/styles/landing-tokens.css`, imported
only by `Landing.jsx`. To migrate other pages we need the tokens available app-wide.
But the app has **two global coupling points** that make a naive flip dangerous:

1. `index.html` → `body { background:#0A1628; color:#fff }` + dark scrollbar — shared by every page.
2. ~1,033 hardcoded dark chrome hexes spread across ~30 files that won't change until each file is migrated.

If we flip the global background to cream before pages are migrated, every dark page
renders dark cards floating on cream with white-on-cream invisible text. Unacceptable
mid-migration state.

## The three options

### Option A — `:root` tokens + explicit legacy tokens
Move the new tokens to `:root` globally. Also define the **old** colors as named legacy
variables (`--legacy-bg-navy: #0A1628`, `--legacy-surface: #1B2B4B`, `--legacy-cyan: #00B4D8`, …).
As a first mechanical pass, replace hardcoded darks with the legacy variables so **nothing
changes visually**, then migrate each page by repointing its legacy vars → new tokens.
- ✅ Zero breakage at every step; clean diffs; easy rollback per page.
- ❌ Adds an extra mechanical pass (hardcoded→legacy var) before the real work — touches
  every file twice. Legacy vars linger until the last page is done.

### Option B — `:root` tokens, accept ugly transition
Move new tokens to `:root`, flip `index.html`, migrate pages opportunistically and accept
that un-migrated pages look broken until their turn.
- ✅ Fastest to start; no legacy scaffolding.
- ❌ The app is **visibly broken in production** for the entire multi-week migration unless
  every page ships in one mega-PR. Unacceptable for a live product with real users.

### Option C — keep per-wrapper scoping (`.landing-root` model) ✅ **RECOMMENDED**
Promote the token **definitions** to `:root` (so any page can reference them) **but do
not change `index.html`'s body bg**. Each page/shell opts into the light theme by adopting
a wrapper class (e.g. `.app-light`, mirroring `.landing-root`) that sets
`background:var(--bg); color:var(--text-primary)` on its own subtree. A page is "dark"
until it's wrapped. The global body bg stays navy until the **very last** page is migrated,
then flips in a trivial final step.
- ✅ **Zero risk to non-migrated pages** — they never reference the new tokens, never change.
- ✅ No double-touch of files (no legacy-var pass). Each page migrated exactly once.
- ✅ Matches the pattern already proven on the landing (`.landing-root` + runtime body-bg).
- ✅ The shared `Layout` shell can adopt `.app-light` in one move, which lights the chrome
  for all pilot pages at once; individual page bodies then migrate behind it.
- ❌ A wrapper class per surface (cheap). Two themes coexist in `:root` briefly (fine —
  they're differently named tokens; no collision).

## Recommendation: **Option C**, with a precise sequence

1. **Generalize the token file:** rename/extend `landing-tokens.css` → a shared
   `design-tokens.css` that defines tokens under **both** `:root` and a reusable
   `.app-light` class (keep `.landing-root` as an alias so the landing keeps working
   untouched). Import it once globally (e.g. in `main.jsx`). **Definitions only — no
   global `body` change.** This is inert: nothing references the tokens yet except landing.
2. **Body bg via wrapper, not `index.html`:** the migrated `Layout` (and each
   standalone page like Login) sets its own `--bg` surface + the runtime
   `document.body.style.background` trick on mount (already proven on landing). Leave
   `index.html` navy until step N.
3. **Migrate shell first** (`Layout` + `PublicLayout` + `SiteFooter`) wrapped in
   `.app-light` → lights the chrome for everything that renders inside it.
4. **Migrate page bodies** one phase at a time (see migration-order.md). Each is an
   isolated, reviewable diff; un-migrated pages are visually unaffected.
5. **Final step:** once every surface is light, flip `index.html` body bg → `#F8F6F1`
   + scrollbar, and remove the per-page runtime body-bg hack. One-line, last.

**Why not A:** A's safety is real but its double-touch (hardcoded→legacy, then legacy→new)
roughly doubles the mechanical edits and leaves dead legacy vars to clean up. C gets the
same zero-breakage guarantee by *scoping adoption* instead of *renaming every hardcode*.

**Why not B:** unacceptable for a live app — extended broken state.

### Open Phase-2 decision (flag, don't decide here)
Pair the foundation with **extracting shared primitives** (`<Input>`, `<Badge>`, `<Modal>`)?
Doing so during foundation (before page migration) drastically cuts per-page edits and the
"missed instance" risk, at the cost of a bigger Phase 2. Recommend extracting at minimum a
light **form-input** style helper and a **Badge** (semantic-aware) before high-volume pages.
