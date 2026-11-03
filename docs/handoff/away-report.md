# Away report — Logbook Reports, phases 1–4

Written 3 November 2026. All four phases are built, pushed and live.
OTA delivery is confirmed working (you saw update `01a1a205` on your phone).

---

## What shipped

| | commit | app update (iOS) |
|---|---|---|
| Phase 1 · Useful | `ffb125c` | `01a1a1e5-786c-7255-8dfb-d3fc16dfb7f1` |
| Perf + carry-forward proof | `56df4bb` | — (server only) |
| Logbook toolbar fix | `aef16f0` | `01a1a205-45a2-721d-bd0f-22065d7818eb` |
| Phase 2 · Distance & patterns | `0ea2f38` | `01a1a21e-cc55-7bd9-994b-dbac22885e60` |
| Phase 3 · Year in the sky | `c9394f3` | `01a1a248-c68e-792c-a88b-6bc87239c871` |
| Phase 4 · Printable PDF | `74cd3cd` | `01a1a257-f03b-7c4a-b121-ed7344b14641` |

All on runtime `583ddcc…` (build 10). The native-module gate was run before
every publish: **29 of 29, unchanged** each time. No new build was needed and
none was made.

**Phase 3 is live 27 days before its 30 November deadline.**

---

## Decisions I made without asking

**Printable logbook includes the PIC name.** The no-crew-names rule covers
reports and share cards, which get posted. A logbook page is signed by its
holder and shown to an authority.

**A missing value prints blank, never 0:00.** An empty Part-FCL cell means
"not recorded"; a nought means "none, and we checked". Only total time always
prints.

**"Previous pages" includes flights before a chosen date range**, not just
carry-forward. Otherwise a pilot printing October alone saw a total-to-date of
37 hours against a real 1,592. A range export now reaches the same grand total
as a full one.

**32 rows a page** (17 pages for 517 flights). Measured off a rendered sheet —
at 14 the page was half empty.

**Dual/training prints blank.** No training column exists yet; it arrives with
the experience-report import.

**Year deck: below 5 flights nothing is computed at all**, not merely hidden,
so no client can render thin slides by mistake.

**Pace uses 12 calendar months including empty ones.** Months-flown gave
36.5 h/month and October 2027; the calendar window gives 22.1 and June 2028.
The second is true.

**Moon line needed a third wording.** Past 200%, "and 160% of the way back" is
not a sentence, so it becomes "to the Moon and back, and X% of the way there
again". This logbook is at 259.6%.

---

## Things worth knowing

**A test pilot now exists in production:** `cftest-carryforward@example.com`
(`b64155bc`), carrying 3,000 h plus 7 logged sectors. It exists to prove
carry-forward never leaks: career total **3,082 h**, 2026 deck **42 h**, 28-day
window **10 h**. Delete it whenever you like — I did not, because you may want
to re-check.

**The Home "year in the sky" card will not appear until 1 December.** That is
the rule (1 Dec – 31 Jan). Everything else is visible now.

**Reports got much faster.** Uncached build on production: **134–187 ms**, down
from ~8 s. The matcher was never the cost — it was database round trips run in
sequence. `GET /logbook/reports?_perf=1` returns per-phase timings and bypasses
the cache.

**Two bugs I found by looking at output rather than trusting a check:**
the logbook toolbar was 446 px wide inside a 390 px screen (my own overflow
probe had been excusing it, because `html/body` carry `overflow-x:hidden`,
which *masks* overflow); and `RouteMapCard` relied on whichever page imported
`logbook.css`, so on Reports its footer read "59 airportsTap to explore".

**One inconsistency closed:** the logbook said "Current until 24 Jan" while
Reports declined to judge recency. Reports was right — 16 of 517 flights carry
landings. The rule now lives once, server-side, as `currency.trackable`.

---

## What needs you

1. **Nothing is blocked.** All four phases are complete.
2. **Build 11, when you want one.** Everything since build 10 has gone out as
   JS. A new build is only needed for the app icon — the placeholder Expo
   chevron is still there, waiting on your 1024×1024 logo.
3. **Take a look at the Reports pages on your phone** and tell me if any
   wording feels off. Every figure is real, but I have only your account and
   one synthetic one to judge against.
4. **Decide on the carry-forward test account** — keep or delete.

---

## Screenshots

- `docs/design/screens/logbook-reports/` — phases 1 and 2, web and app
- `docs/design/screens/year-in-the-sky/` — all 11 slides, both share cards
- `docs/design/screens/logbook-print/` — the PDF, the dialog, the app HTML
- `docs/design/screens/logbook-fix/` — the toolbar before and after

## Tests

460 backend, 19 mobile, tsc clean, lint clean on every new file.
