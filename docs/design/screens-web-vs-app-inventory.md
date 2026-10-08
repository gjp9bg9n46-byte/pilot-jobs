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
| 1.1 | Match % sits **under** the meta line, full-width row | % in a **right-hand column** beside the title | **[?]** The app's two-column is tighter, but it squeezes the title and truncates the meta ("33 day…"). Leaning **default-to-web** (stack it) to stop the truncation — but it costs vertical space on every row. |
| 1.2 | Meta line shows `· Direct apply` | truncated away by the right column | Falls out of 1.1. |
| 1.3 | — | email-verification banner above the content | App-wide chrome. Leave. |
| 1.4 | "Match % = stated requirements you meet ÷ stated requirements…" explainer | same explainer | Already in parity. |

## 2. Profile — effectively at parity

| # | Web | App | Decision |
|---|---|---|---|
| 2.1 | **"Preview as airline"** link under the header buttons | absent | **[default-to-web]** Port to the app. |
| 2.2 | everything else — readiness strip, stat grid, strength bar, licences, medical, training | identical | No action. |

## 3. Logbook — the biggest gap of the four

| # | Web | App | Decision |
|---|---|---|---|
| 3.1 | **Compact one-line flight rows** grouped by month: `CAI → ASW · 1.5h` with `22 May · A320 BWC` beneath | **Boarding-pass cards**: date block, both times, a dashed flight path, flight number + registration chips, and edit / duplicate / delete icons per flight | **[?]** The single biggest divergence. Strict default-to-web means adopting the compact rows — far more flights per screen — but the app's card exposes per-row actions web has no equivalent for. My suggestion: take web's compact row as the default and move the actions to swipe/long-press, but this one is worth your eyes on the two images first. |
| 3.2 | **Search field** over all flights (aircraft, registration, route) | absent | **[default-to-web]** Port. |
| 3.3 | Floating **"+ Log flight"** FAB, bottom-right | inline **"+ Log a Flight"** + **"Import"** buttons above the list | **[?]** Web's FAB stays reachable while scrolling; the app's Import is more discoverable than web's small header link. Suggest: keep web's FAB **and** keep an Import button — i.e. neither side as-is. |
| 3.4 | — | header subtitle `501 flights logged · last flight 22 May 2026` | **[port to web]** It answers "is my logbook up to date?" at a glance. |
| 3.5 | `Add previous / carry-forward hours · Edit` inline link only | a **"Previous / carry-forward hours"** accordion with an `active` badge | **[port to web]** The badge tells the pilot carry-forward is in play — web hides that fact. |
| 3.6 | Milestone card ends with **"See them →"** linking to the +24 jobs | the same card, no link | **[default-to-web]** Port the link — a dead-end stat is a wasted hook. |
| 3.7 | `Import` as a header link | `Import` as a button | Falls out of 3.3. |

## 4. CV Builder — close, mostly layout

| # | Web | App | Decision |
|---|---|---|---|
| 4.1 | Edit / Preview tabs **above** the title | tabs **below** the subtitle | **[default-to-web]** |
| 4.2 | Template cards **stacked full-width** (large previews) | **side-by-side**, half width | **[?]** Web's larger preview shows what you're choosing; the app's fits both without scrolling. Leaning web for legibility. |
| 4.3 | Colour swatches 6 per row | 5 per row | Cosmetic; follows from the container width. No action. |
| 4.4 | **"Download PDF"** inside the template summary card | only on the Preview tab | **[default-to-web]** Port — one tap instead of two. |
| 4.5 | Hint reads "…Keep it concise — **recruiters scan the first 5 seconds**." | truncated to "Keep it concise." | **[default-to-web]** Use web's full copy. |
| 4.6 | Photo / Headshot section | same section | Parity. |

---

## Suggested order (after your decisions)
1. **Profile 2.1** — one link, five minutes.
2. **CV 4.1 / 4.4 / 4.5** — layout + the Download button.
3. **Dashboard 1.1** — decide the row layout, then it is a single change.
4. **Logbook** — the real work: 3.1 (row design) gates 3.2–3.7.
5. **Back-ports to web**: 3.4, 3.5 (and the Jobs ones already noted).

Each step: commit, re-shoot the pair, update this file.
