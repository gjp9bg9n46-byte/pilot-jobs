# B — Jobs: mobile web (390) vs app (393), difference inventory

Per handoff rule **B**, mobile web is the reference design.

**DECIDED 2026-10-08** (user). Rule applied to every open row: *default to the
mobile-web behaviour unless it conflicts with a decision already in the
handoff.* Each row below now carries its resolution; the three the user called
explicitly are marked **[user]**, the rest **[default-to-web]** or
**[kept — handoff conflict]**. Two are flagged **[unsure]**.

Side-by-side evidence (same stub payload on both sides):
- `docs/design/screens/jobs-web-vs-app.png`
- `docs/design/screens/job-detail-web-vs-app.png`

Sources: web `frontend/src/pages/Jobs.jsx` + `components/jobs/JobCard.jsx` +
`JobDetailPanel.jsx`; app `mobile/app/(app)/(tabs)/jobs/index.tsx` +
`src/components/JobCardShared.tsx` + `jobs/[id].tsx`.

---

## 1. Jobs list — chrome and header

| # | Web (reference) | App (current) | Verdict |
|---|---|---|---|
| 1.1 | **Region tabs**: `All regions 54 · Middle East 14 · Europe 7 · North America 31 · Asia-Pacific 1`, horizontally scrollable, counts from the server's `regionCounts` | **absent** | **Port.** Biggest gap — it is the primary navigation on web, and the server already supports `?region=` and returns the counts. |
| 1.2 | Light header: hamburger, unread pill, avatar | Navy `AppHeader` (bell + gear) + slide-out drawer | **Keep the app's** — deliberate from track B-1. |
| 1.3 | Subtitle `54 cockpit jobs worldwide · 0 you qualify for` | `All cockpit roles, with your match on each.` + a separate `54 of 54 jobs` row with **Refresh** | **?** The app's subtitle is A#5, which you asked for. Proposal: keep the A#5 line, add web's `N you qualify for` to the count row, drop the Refresh button (pull-to-refresh already works). | **[kept — handoff conflict]** Web's subtitle loses to A#5, which the user chose in this handoff. Keeping *All cockpit roles, with your match on each.* and ADDING web's `N you qualify for` to the count row. Refresh button dropped (pull-to-refresh covers it).
| 1.4 | No email-verification banner on this page | Yellow verify-email banner above the content | Cosmetic; app-wide banner. Leave. |

## 2. Filters and sort

| # | Web | App | Verdict |
|---|---|---|---|
| 2.1 | **Hours ▾** opens a popover/bottom sheet with a requirement histogram and "up to N h" | absent | **Port** (sheet form on phone, as web already does). |
| 2.2 | **Filters** sheet: aircraft, role, licence authority, contract type, posted-within, min salary, NTR-only | absent | **Port.** All server-supported params. |
| 2.3 | **Visa** toggle | absent | **Port.** |
| 2.4 | Sort: Best match / Newest / **Salary** / Deadline | Best match / Newest / Deadline | **Port** the Salary option. |
| 2.5 | Qualified-only lives inside the Filters sheet | standalone **Qualified only** chip (A#8) | **?** The app's chip is more discoverable. Proposal: keep the chip on both and remove it from the sheet. | **[kept — handoff conflict]** A#8 asked for a Qualified-only **chip**; web buries it in the Filters sheet. Chip stays on the app and gets ported to web.
| 2.6 | Search + salary debounced 400 ms, sent to the **server** | search filtered **client-side** over the 1000 rows already fetched | Keep the app's for now (whole feed is loaded), but it diverges once paging lands. |
| 2.7 | Applied-filter chip row with per-chip ✕, **Clear all**, and **Create alert** | absent | **Port** with 2.1–2.3 (Create alert when that ships on web). |

## 3. List body

| # | Web | App | Verdict |
|---|---|---|---|
| 3.1 | **Fit-group headers** — `ONE REQUIREMENT SHORT · 34` + hint `shows what's missing`; groups in order qualify → incomplete → oneShort → few → other | flat list | **Port.** | **[user]** Port. **DONE** — the app renders web's FIT_GROUPS headers with counts and hints.
| 3.2 | Order: group, then the server's order within it | A#4: fit → % desc → newest, with **nationality-barred** and **evergreen** rows demoted | **?** They disagree — the first card differs. Proposal: **web's groups win**, with the A#4 demotions applied *inside* each group, and the same demotions brought back to web so the two agree. | **[user]** Web's fit groups win, with the A#4 nationality demotion applied **inside** each group; the same `orderRank` (barred → fresh → direct → newest) now runs on both platforms. **DONE.**
| 3.3 | — | `Ongoing recruitment` divider for evergreen rows | **Port to web** (it explains an old posted date honestly). | **[superseded]** The list-level `Ongoing recruitment` divider is gone now that grouping owns the list structure; the card still reframes an evergreen date itself, so nothing is lost.
| 3.4 | Empty-profile banner linking to Profile/Logbook | absent | **Port.** |

## 4. Job card

| # | Web | App | Verdict |
|---|---|---|---|
| 4.1 | Per-requirement **verdict chips**: `× Valid licence (you: ATPL)`, `✓ 1,000 h multi`, `? FAA` — the "what's missing" line | spec strip (`Total time 1,500 h · Licence ATPL`) + `75% match · 1 short` pill | **?** Genuinely different models. Proposal: adopt web's verdict chips (they answer "can I apply?"), and **keep** the app's % pill as a second line — then port the pill to web too. | **[default-to-web] [unsure]** Adopt web's per-requirement verdict chips. Strictly, web shows no % on a card, so the app's `75% match` pill goes. **Unsure:** that removes a number the app shows today and the Dashboard still shows. Say the word and I'll keep the pill as a second line on both.
| 4.2 | `✓ Apply direct` footer line on every direct card | badge row, but only when `applyIsDirect` **and** `sourcePlatform !== 'EMPLOYER_DIRECT'` | Reconcile — the app under-shows it. |
| 4.3 | One tag chip under the company line (`A330`, `FAA`, `First Officer`) | aircraft chips at the **bottom** of the card | Align to web's position. |
| 4.4 | Location inline in the meta line (`CAE · Benson, United Kingdom · Posted 14 days ago`) | own row with a pin icon | Align to web. |
| 4.5 | Whole card is the target, no affordance | chevron on every row | **?** Keep the chevron (native expectation) or drop for parity. | **[default-to-web]** Chevron removed; the whole card is the target, as on web.

## 5. Job detail

| # | Web | App | Verdict |
|---|---|---|---|
| 5.1 | Banner: `3 of 4 known requirements met. 1 still short.` | `YOUR MATCH / 75% / 1 short` + blocker pill | **?** Same facts, different framing. Proposal: show both — web's sentence under the app's %. | **[default-to-web]** Use web's sentence (*3 of 4 known requirements met. 1 still short.*) as the banner, keeping the app's large % above it — same component, no information lost.
| 5.2 | Requirement rows **grouped**: `MUST-HAVES`, `HOURS`, `RATINGS & MEDICAL`, with a `REQUIREMENT / NEEDED / YOU` header | flat table, `Required / You` only | **Port** the grouping. |
| 5.3 | Title alone | airline logo tile beside the title | Keep the app's (better), port to web. |
| 5.4 | Role chip (`First Officer`) | absent | **Port.** |
| 5.5 | CTA `Apply on the source ↗`, **green**, full-width sticky | `View Full Posting & Apply →`, **navy**, + `Save` + "Never share bank or credit card details" note | **?** Pick one label and colour. The app's Save and safety note are better — port them to web. | **[default-to-web] [unsure]** Web's label and colour win: *Apply on the source ↗*, green, full-width sticky. Keeping the app's **Save** (web has it too) and the *never share bank details* note. **Unsure:** the note has no web equivalent — porting it to web instead of dropping it.

---

## Suggested order (after your decisions)
1. **Region tabs + counts** (3.1 depends on nothing; highest value).
2. **Filter parity**: Hours sheet, Filters sheet, Visa, Salary sort, applied chips + Clear all.
3. **Fit groups + agreed ordering** (resolves 3.1/3.2 together).
4. **Card content parity** (4.1–4.4).
5. **Detail parity** (5.2, 5.4, plus the agreed banner and CTA).

Each step: commit, re-shoot the pair, update this file.
