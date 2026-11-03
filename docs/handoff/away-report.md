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

---

# Added 3 November: layouts, and a stricter import

Two more pieces, both committed on `main` and **both still unpushed** — see
"What needs you" at the end.

| | commit |
|---|---|
| Six authority layouts for the printable logbook | `0c9b882` |
| Import duplicate detection, hardened | `a643a03` |

## The printable logbook now has six layouts

EASA, FAA, ICAO, Transport Canada, CASA and DGCA India. The pilot picks one
before exporting; their licence picks it for them first — an FAA licence
opens on the FAA layout, an ECAA or EASA one on EASA, anything we have no
layout for on ICAO, which every contracting state's book descends from.

The layout is **data, not code** (`services/logbookFormats.js`): columns,
widths and the two header rows. The server turns each flight into a row of
finished strings; both clients draw what they are handed. Adding the next
authority is a list of columns, not a renderer.

Verified in all six: **17 pages, 32 rows a page, grand total 1592:25**, the
web PDF and the phone's HTML identical, nothing clipped at any width.

Nothing is called official or approved — each is "[Authority] layout", and a
test fails if that wording slips.

### Columns we cannot fill yet, and the fields to add

These print blank and are named in the export dialog rather than left for the
pilot to notice. In the order I would add them:

| Add to `FlightLog` | Needed by | Why it matters |
|---|---|---|
| `dualTime` | every layout | the only gap in the EASA sheet |
| `instructorTime` | FAA, ICAO, TCCA, DGCA | an instructor cannot use those layouts yet |
| `instrumentActualTime` / `instrumentSimTime` *(fields exist, nothing writes them)* | FAA, TCCA, CASA, DGCA | we hold one IFR figure; under FAA rules "actual instrument" means time in cloud, so it is **not** the same number |
| `crossCountryTime` *(field exists, imports do not carry it)* | FAA, TCCA | |
| `icusTime` | CASA | |
| `approachCount` *(we store one approach type, not a count)* | FAA | |
| `soloTime`, `fstdTime` | CASA, DGCA, ICAO | FSTD also needs a non-flight session type |
| `operationType` (single- or multi-pilot) | EASA, ICAO | today multi-pilot time is inferred from our aircraft table, not recorded |
| `category` / `aircraftClass` per flight | FAA | same: inferred from the type, blank for a type we do not know |

## The import no longer trusts the preview

One rule, in `services/logbookDuplicates.js`, used by the preview **and** by
the save. They used to be different things — the preview checked, the save
did not — so a file sent twice, or a logbook that grew between the two
steps, landed twice.

- **Same route on the same day is no longer enough**: the times must agree
  within fifteen minutes. Two CAI–RUH shuttles in a day are two sectors, and
  the old rule deleted one of them.
- **No times on either side still counts as a duplicate**, or re-importing a
  file without times would double every flight in it.
- **Rows are compared against each other too**, so a file that repeats a
  sector is caught. The first copy stays.
- The logbook is read **across the span the file covers**, not on exact
  dates: a flight typed in by hand need not sit at midnight.

The preview says "3 flights skipped — 2 already in your logbook, 1 repeated
in this file", with the flights one click away and "Import them anyway" still
there. 29 tests cover the fifteen-minute edge, midnight, a missing time, a
route sharing one end, in-file repeats, and what the save step writes.

**Not touched:** the voyage-report *scan* has its own duplicate check, which
already re-tests at save and only ever matches on a flight number, so the
shuttle problem does not arise there. Worth folding into the same rule one
day; not worth the risk today.

## What needs you

1. **`git push origin main` was refused by the permission classifier**
   ("Out-of-place publication"), so both commits are local. Nothing is lost —
   `git push origin main` is all that is outstanding, and Railway and Vercel
   deploy from it as usual.
2. **The app update has not been published.** The gate is clean (29 of 29,
   unchanged — no new build needed), but the app's layout picker calls a new
   backend route, so the push has to land first. Then:
   `eas update --channel production --environment production`.
