# Scraper setup — path to 750+ real pilot jobs

Last updated: 2026-07-08

The backend already scrapes on a schedule (every `SCRAPE_INTERVAL_HOURS`, default 6).
Every new job automatically runs through the matching engine → creates alerts →
sends push notifications. Nothing extra to wire — you only need to add API keys.

All sources are official APIs (legal, real jobs, original apply links):

| Source | Coverage | Key needed | Where to register |
|---|---|---|---|
| USAJobs.gov | US government pilot jobs (large volume) | `USAJOBS_API_KEY` + `USAJOBS_USER_AGENT` | https://developer.usajobs.gov (free, instant email key) |
| Adzuna | Europe (UK, FR, DE, IT, ES, NL, PL, AT) | `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | https://developer.adzuna.com (free) |
| Jooble | North Africa (Egypt, Morocco, Tunisia, Algeria) | `JOOBLE_API_KEY` | https://jooble.org/api/about (free, short form) |
| Careerjet | Gulf + North Africa (UAE, Qatar, Saudi, Kuwait, Egypt, Morocco, Tunisia, Algeria) + UK/US | `CAREERJET_API_KEY` | https://www.careerjet.com/partners (free publisher API key) |
| Lever / Greenhouse / Workday | ~30 configured airlines & operators (US-heavy) | none | already active |

## Steps (15 minutes total)

1. **USAJobs**: go to https://developer.usajobs.gov → Request API Key → you receive
   the key by email. The "user agent" is simply the email you registered with.
2. **Adzuna**: go to https://developer.adzuna.com → register → dashboard shows your
   Application ID and Application Key.
3. **Jooble**: go to https://jooble.org/api/about → fill the short request form →
   key arrives by email.
3b. **Careerjet**: go to https://www.careerjet.com/partners → sign up as a
   partner (free) → your API key shows under Access API in the publisher dashboard.
4. **Railway**: open your backend service → Variables → add:

   ```
   USAJOBS_API_KEY=…
   USAJOBS_USER_AGENT=your-registered-email
   ADZUNA_APP_ID=…
   ADZUNA_APP_KEY=…
   JOOBLE_API_KEY=…
   CAREERJET_API_KEY=…
   ```

5. Deploy (Railway redeploys on variable change). The next scheduled run pulls all
   sources; to trigger immediately, redeploy or restart the service and wait for
   the first cron tick (top of the hour, every 6 hours by default). Set
   `SCRAPE_INTERVAL_HOURS=3` temporarily if you want faster cycles at first.

## Quality guarantees built in

- **Real jobs only** — every job comes from an official API and links back to the
  original posting. Machine-estimated salaries (Adzuna) are discarded, and
  free-text salaries (Jooble) are not parsed — no invented data.
- **Fixed-wing pilot roles only** — the shared title filter accepts pilot /
  captain / first & second officer / instructor / examiner roles and rejects:
  drones (drone, UAS, UAV, sUAS, unmanned, remote pilot), helicopters (helicopter,
  rotorcraft, rotary-wing), maritime pilots (harbour/marine pilot, yacht, vessel,
  ship, tug, cruise), and "pilot program/project" business roles.
- **Politeness** — robots.txt honoured, per-host rate limiting, retry with backoff.
  PilotCareerCentre disallowed us in robots.txt; the code respects that block.
  (If you want PCC volume, email them about API/partnership access.)
- **Dedup + expiry** — cross-source duplicates collapse; jobs that disappear from
  a source get expired automatically.

## Volume expectations (rough)

- USAJobs: several hundred active federal fixed-wing postings.
- Adzuna Europe (8 countries × 2 queries): typically 200–400 pilot-title matches.
- Jooble North Africa: tens (the region posts less through aggregators).
- ATS boards (NetJets, Flexjet, Republic, Allegiant, Southwest, VistaJet…): tens.

That combination should clear 750 within a few scrape cycles. If it lands short,
the next levers are: more Adzuna countries (`ADZUNA_COUNTRIES`), more Jooble
locations (e.g. `Saudi Arabia,UAE,Qatar` for Gulf coverage), and adding more
verified ATS slugs to `backend/src/scrapers/config/employers.js`.

## Config notes (changed 2026-07-08)

- USAJobs now runs through the fixed-wing filter (was `skipFilter: true`) so
  federal helicopter/UAS roles are excluded.
- Pyka and Zipline were **disabled** (not deleted) in `employers.js` — they are
  drone-only operators, per the fixed-wing-only policy. Re-enable anytime by
  removing `disabled: true`.
