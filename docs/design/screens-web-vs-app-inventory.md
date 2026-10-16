# B — Dashboard · Profile · Logbook · CV: mobile web (390) vs app (393)

Same treatment as the Jobs inventory: **differences listed, nothing ported.**
Mobile web is the reference (handoff rule B).

Decision rule carried over from 2026-10-08: **default to the mobile-web
behaviour unless it conflicts with a decision already in the handoff.** Each row
is marked **[default-to-web]**, **[kept — handoff conflict]**, **[port to web]**
(the app is better and web should follow) or **[?]** where I want your call.

Evidence (same stub payload on both sides, contact details redacted in the
payload before rendering):
- `docs/design/screens/dashboard-web-vs-app.png`
- `docs/design/screens/profile-web-vs-app.png`
- `docs/design/screens/logbook-web-vs-app.png`
- `docs/design/screens/cv-web-vs-app.png`

---

## 1. Dashboard — closest to parity of the four

| # | Web (reference) | App | Decision |
|---|---|---|---|
| 1.1 | Match % sits **under** the meta line, full-width row | % in a **right-hand column** beside the title | **[default-to-web] DONE.** The app row is now one column, mirroring web's `.dash-job` at ≤820px: title, meta and the pill row full width, then a row with the **% left and View right** (`.dash-jobside { justify-content: space-between }`). |
| 1.2 | Meta line shows `· Direct apply` | truncated away by the right column | **DONE** — the 1-line clamp is gone with the squeeze, so the full meta line including `· Direct apply` now shows. |
| 1.3 | — | email-verification banner above the content | App-wide chrome. Leave. |
| 1.4 | "Match % = stated requirements you meet ÷ stated requirements…" explainer | same explainer | Already in parity. |

## 2. Profile — effectively at parity

| # | Web | App | Decision |
|---|---|---|---|
| 2.1 | **"Preview as airline"** link under the header buttons | absent | **NOT PORTED — it is a dead link on web.** `/profile/preview` has no route in `App.jsx`; the catch-all `path="*"` redirects to `/dashboard`, so the button silently bounces the user to the Dashboard. Porting it would copy the bug. **Web fix needed:** build the preview page or remove the button. |
| 2.2 | everything else — readiness strip, stat grid, strength bar, licences, medical, training | identical | No action. |

## 3. Logbook — NOT PORTED (being redesigned; new mockups coming)

| # | Web | App | Decision |
|---|---|---|---|
| 3.1 | **Compact one-line flight rows** grouped by month: `CAI → ASW · 1.5h` with `22 May · A320 BWC` beneath | **Boarding-pass cards**: date block, both times, a dashed flight path, flight number + registration chips, and edit / duplicate / delete icons per flight | **[?]** The single biggest divergence. Strict default-to-web means adopting the compact rows — far more flights per screen — but the app's card exposes per-row actions web has no equivalent for. My suggestion: take web's compact row as the default and move the actions to swipe/long-press, but this one is worth your eyes on the two images first. |
| 3.2 | **Search field** over all flights (aircraft, registration, route) | absent | **[default-to-web]** Port. |
| 3.3 | Floating **"+ Log flight"** FAB, bottom-right | inline **"+ Log a Flight"** + **"Import"** buttons above the list | **[?]** Web's FAB stays reachable while scrolling; the app's Import is more discoverable than web's small header link. Suggest: keep web's FAB **and** keep an Import button — i.e. neither side as-is. |
| 3.4 | — | header subtitle `501 flights logged · last flight 22 May 2026` | **[port to web]** It answers "is my logbook up to date?" at a glance. |
| 3.5 | `Add previous / carry-forward hours · Edit` inline link only | a **"Previous / carry-forward hours"** accordion with an `active` badge | **[port to web]** The badge tells the pilot carry-forward is in play — web hides that fact. |
| 3.6 | Milestone card ends with **"See them →"** linking to the +24 jobs | the same card, no link | **[default-to-web]** Port the link — a dead-end stat is a wasted hook. |
| 3.7 | `Import` as a header link | `Import` as a button | Falls out of 3.3. |

## 4. CV Builder — NOT PORTED (being redesigned; new mockups coming)

| # | Web | App | Decision |
|---|---|---|---|
| 4.1 | Edit / Preview tabs **above** the title | tabs **below** the subtitle | **[default-to-web]** |
| 4.2 | Template cards **stacked full-width** (large previews) | **side-by-side**, half width | **[?]** Web's larger preview shows what you're choosing; the app's fits both without scrolling. Leaning web for legibility. |
| 4.3 | Colour swatches 6 per row | 5 per row | Cosmetic; follows from the container width. No action. |
| 4.4 | **"Download PDF"** inside the template summary card | only on the Preview tab | **[default-to-web]** Port — one tap instead of two. |
| 4.5 | Hint reads "…Keep it concise — **recruiters scan the first 5 seconds**." | truncated to "Keep it concise." | **[default-to-web]** Use web's full copy. |
| 4.6 | Photo / Headshot section | same section | Parity. |

---

## Status 2026-10-16
- **Dashboard — PORTED** (1.1, 1.2). Side-by-side re-shot.
- **Profile — nothing to port.** The only difference was 2.1, which is a dead link on web; everything else was already at parity.
- **Logbook, CV — not ported, by decision.** Both are being redesigned; the rows below are kept as a record of where they diverge today, not as a work list.

### Open for web
- `/profile/preview` route missing (2.1) — build it or drop the button.
- Back-ports already noted on Jobs: the Logbook header subtitle and the carry-forward `active` badge (3.4, 3.5) remain unported in either direction while Logbook is being redesigned.
