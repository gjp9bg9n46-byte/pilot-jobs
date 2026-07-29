# Adding a job source — setup & probe order

Every `applyUrl` we store must point at the official carrier ATS, never a
third-party aggregator link. The job of a new source is to reach that carrier
data politely and reliably. Where you get it from matters: probe in this order
and stop at the first one that works.

## Probe order (default)

1. **The carrier's OWN careers front-end.**
   Look for a public JSON API or an embedded data blob before touching any HTML
   parser:
   - a JSON endpoint the site's own search widget calls
     (e.g. Emirates `www.emiratesgroupcareers.com/api/v1/jobs`,
     flydubai `careers.flydubai.com/api/jobs`),
   - or an embedded data blob in the page: `__NEXT_DATA__` (Next.js Pages
     Router), a React Server Component flight payload (`self.__next_f`),
     `application/ld+json` JobPosting, or a `window.__…` global.

   Find the endpoint by grepping the page's JS bundles for the path the widget
   fetches (that's how Emirates' `/api/v1/jobs` and flydubai's Jibe `/api/jobs`
   were found).

2. **The ATS's public API, if one exists.**
   Taleo `POST /careersection/rest/jobboard/searchjobs`, SmartRecruiters JSON,
   Workday REST, iCIMS JSON-LD detail pages, etc.

3. **The ATS HTML portal — last resort.**
   Only when there is no API and no embedded data.

### Why this order

Front-ends win on **data quality** (full descriptions + structured
location/category/dates), on **fragility** (they're built to be consumed, so
the shape is stable-ish and machine-readable), and on **accessibility**. ATS
portals are the ones that gate direct navigation, redirect to marketing sites,
and clamp pagination. Three-for-three so far the carrier front-end beat the ATS
backend: Emirates (`/api/v1/jobs`), flydubai (Jibe `/api/jobs`), easyJet
(Next.js server-render).

### The counterweight

Front-end endpoints are **undocumented** and can change shape without warning.
So **shape validation is mandatory on every one of them**: assert the response
has the array you expect, count how many rows are dropped for missing required
fields, and emit a `SHAPE ALERT` (and abort the source) when the response
doesn't look like what you parsed against. Aborting returns `[]`, which the
runner's zero-result guard treats as a failed run — it skips expiry rather than
wiping the source. See `sources/jibe.js` / `sources/avature.js` for the pattern.

## Non-negotiable checks before enabling a source

- **robots.txt for the exact host + paths you fetch** — and it governs *that*
  host only. A carrier's own front-end can be allowed even when the ATS backend
  it embeds is `Disallow: /` (that's exactly why flydubai's iCIMS tenant is
  off-limits but `careers.flydubai.com` is fine; and why Ryanair's SF host is
  blocked but a vanity front-end may not be). All fetches go through `http.js`,
  which honours robots, sends an identifiable User-Agent, and rate-limits. Do
  not work around a `Disallow`, and do not use a third-party mirror of gated
  data.
- **Pagination is not silently clamped** — confirm the real page size by
  COUNTING returned rows, never by trusting the `limit`/`perPage` parameter
  (an Avature portal clamped `jobRecordsPerPage` to 6; a Jibe default served 10
  regardless of ask). Step by the actual returned count.
- **`applyUrl` lands on the carrier ATS** and `classifySourceType()` returns
  `direct_ats` / `operator_direct` (never `aggregator`). If the apply link is on
  a vanity domain, add that domain to the direct-ATS list in `sourceType.js`
  explicitly (as `emiratesgroupcareers.com` was).
- **Requirements extract** — a title-only feed won't pass the runner's
  `hasAnyRequirement` gate; pull the description so `extractRequirements` has
  text to work with.
- **The zero-result guard covers the source** — a failed/empty fetch must not
  expire everything for that employer.

## Closed sources — do not re-litigate without an ATS change

Recorded so these aren't re-probed every few months. Re-open only if the carrier
migrates ATS.

| Carrier | Why closed (as of 2026-07-28) |
|---|---|
| **Ryanair** | Own front-end `jobs.ryanair.com` is SAP SF Recruiting Marketing (RMK/"j2w"). The jobresults widget loads tiles from `/services/tile-search-results` (confirmed to exist — 406, not 404), and `robots.txt` there is `Disallow: /services/`. The `/search-jobs` shell is allowed but carries no job data. No allowed-path data endpoint → closed. (The SF backend `career2.successfactors.eu` is also `Disallow: /` + `Disallow: /*company`.) |
| **Wizz Air** | careers.wizzair.com only embeds `career5.successfactors.eu` (SF host robots `Disallow: /`). No own job-data domain/API. |
| **TUI** | careers.tuigroup.com **disallows its own `/search-jobs/`**, and only points to the blocked SF host. The public SF code `tuiinfotec` is the IT arm (0 pilot roles) anyway. |
| **easyJet** | Taleo `searchjobs` REST 500s whenever the portal param is supplied (their bug; unresolvable without their session). careers.easyjet.com is an App-Router marketing site — SSRs only 3 generic featured cards, full list client-rendered, only job host referenced is the same Taleo. `becomeapilot.easyjet.com` routes to that Taleo + a CAE-run cadet scheme. No scrapeable full pilot list. |
| **flydubai pilots portal** | `pilots-flydubai.icims.com` (and `careers-flydubai.icims.com`) are `Disallow: /`. Not needed: the Jibe feed already surfaces those roles (the FO's apply_url IS the pilots-portal link). flydubai is covered via `source: 'JIBE'`. |

## Wiring a new source

1. `sources/{name}.js` exporting `fetch{Name}(empConfig)` → array of
   pre-normalized job objects (shape validation inside).
2. `runner.js`: `require` it + add a `case` in `fetchForEmployer`.
3. `normalize.js`: add `case '{NAME}': return raw;` (pre-normalized).
4. `config/employers.js`: add the employer config, with a comment recording the
   recon (host, endpoint, robots status, verified pilot roles + date).
5. Verify in isolation (fetch → classify → `hasAnyRequirement`) before ingesting.
