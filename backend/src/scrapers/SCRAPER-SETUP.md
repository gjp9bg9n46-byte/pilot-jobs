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
| **PilotsGlobal** (pilotsglobal.com) | robots.txt **names `ClaudeBot`, `GPTBot`, `ChatGPT-User` with `Disallow: /`** — explicitly bars us. PERMANENTLY off-limits; if it resurfaces as a candidate, the answer is no. Do not scrape, mirror, or work around. |
| **Airline Pilot Central** (airlinepilotcentral.com) | NOT a job board — a commercial payscale + hiring-status DB for 100+ NA carriers (owned by Internet Brands / MH Sub I, has a Terms of Use). robots blocks `GPTBot` (signal they don't want bulk AI ingestion); their data IS their product. robots doesn't name us, but scraping a protected commercial dataset against its evident wishes is out. **Manual-research REFERENCE only** — a human contributor may consult it and hand-enter facts (with attribution); no scraper, no automated ingestion. It maps straight onto our emptiest fields (hiringStatus 6%, payRanges ~0%), so it's the right thing to point *manual* verification effort at. |

| **UltiPro / UKG carriers** (Frontier, Sun Country) | recruiting.ultipro.com robots: `Allow: */JobBoard/` but **`Disallow: */JobBoardView`** — the only job-data endpoint (`/JobBoard/{guid}/JobBoardView/LoadSearchResults`) is under the disallowed path (longer-match rule wins over the JobBoard Allow). The JobBoard page itself is a React SPA with **no server-rendered job list** and no RSS/allowed alternative. Same shape as Ryanair RMK: data lives only behind a robots-disallowed endpoint → **closed, do not build.** (Recon had these as "needs UltiPro parser"; the robots check on the data endpoint closes them.) |
| **Alaska Airlines** (iCIMS) | Headless discovery 2026-08-07: careers.alaskaair.com is iCIMS (`careers-alaskaair` / `employee-alaskaair` .icims.com). Both tenants' robots are **`Disallow: /`**, and the search returns 0 pilot links anyway. No Jibe/other front-end fronting it (unlike SkyWest). Data endpoint robots-blocked → **closed.** Re-open only if Alaska migrates ATS or exposes an allowed feed. |
| **SmartRecruiters** career pages (Etihad `EtihadAirways5` 130 postings, Air Transat `TransatAT1`, + the 11 disabled SR airlines) | The per-company postings API `api.smartrecruiters.com/v1/companies/{co}/postings` returns live pilot roles but **`api.smartrecruiters.com/robots.txt` is `User-agent: * → Disallow: /`** (only LinkedInBot is allowed on `/v1/companies/`). The `jobs.smartrecruiters.com/{co}` career page is a **Cloudflare-protected SPA** whose postings are NOT server-rendered — it fetches them client-side from that same robots-blocked API (page HTML carries only `window.__CF` bot-management, no postings JSON/JSON-LD). So there is **no robots-permitted path** to the data → **closed, do not build** (verified 2026-09-22). **Coverage instead via WhatJobs** (partner API, robots-clean): the WhatJobs dry-run already returns "Pilot — Etihad Airways" with real ICAO ATPL / 3,000-hr requirements, so Etihad/Transat and the other SR-orphan carriers surface as aggregator rows there. |

**Undetected (headless surfaced no ATS host):** Atlas Air, Hawaiian, WestJet, Cathay Pacific, Envoy, PSA, Avelo — the careers page rendered no recognisable ATS network call or DOM tenant string (likely WAF/geo-gated, or a bespoke/SSR careers site). Not closed on robots grounds; simply undetected — needs a deeper manual probe before any build. Not worth further headless investment now.

**Qantas** → Workday `qantas.wd3.myworkdayjobs.com`, CXS site `Qantas_Careers` (reachable, robots OK). `searchText:"pilot"` returns **total=0** — no pilot roles posted there today (Qantas likely runs cadet/pilot hiring via a separate channel). Config withheld until pilot roles actually appear (would otherwise be dead weight); revisit if that changes.

**Note on job-board self-reported volumes:** bulk figures a job board quotes about *itself* ("50,000 aviation jobs!") are marketing claims, not verified counts — treat them as leads to check by actually querying the source, never as fact.

---
## Phase 2 expansion ledger (2026-08-07)

**Track 2 — direct Workday tenant probe (20 carriers).** Probed candidate tenants across `wd1..wd12`,`wd101/103/105` via `{tenant}.wd{N}.myworkdayjobs.com/robots.txt` (Sitemap lines reveal site codes; validated against qantas.wd3 + cae.wd3, and confirmed **HTTP 422 = Workday "invalid tenant"** via bogus controls). **Result: ZERO of the 20 on Workday** (Hawaiian, WestJet, Atlas Air, Envoy, PSA, Piedmont, Endeavor, Avelo, Breeze, Sun Country, Omni Air, Kalitta, ABX, ATI, Cathay, Singapore, Etihad, Qatar, Air Canada, Porter — all 422 under every reasonable tenant name). Also checked those on iCIMS (`careers-{name}.icims.com`) + Jibe (`careers.{name}.com/api/jobs`): no hits under standard names either. Notes: **Endeavor = iCIMS** `careers-endeavorair.icims.com` (robots-allowed) but the parser returns **0 pilot roles** (AA regional flow-through hiring) → not added. **Qatar = Avature** (edge-gated, prior finding). **Qantas** has a dedicated Workday **`Pilots`** site but it's currently **empty** (total=0). The rest hide their ATS behind SPA/WAF careers pages → would need headless (out of scope here). None added.

**Track 3 — new public-JSON ATS parsers.** Built `sources/{recruitee,teamtailor,ashby}.js` (all classified direct_ats). Live aviation configs added + dry-run-verified: **Transavia** (Recruitee `transavia.recruitee.com/api/offers/` → FO + Captain B737NG Brussels) and **Norse Atlantic** (Teamtailor `norse.teamtailor.com/jobs.json` → B787 First Officer). **Ashby**: parser built but **not enabled** — (a) no aviation pilot-employer uses Ashby (tech-startup ATS; Boom Supersonic = 0 pilot roles), and (b) `api.ashbyhq.com` is Cloudflare-fronted (`cf-ray`) which `http.js` `detectAntiBot` rejects; enabling would need an aviation Ashby board **and** a per-host anti-bot allowance. **Workable — NOT built (closed):** the public widget `apply.workable.com/api/v1/widget/accounts/{acct}?details=true` returns `jobs:[]` for essentially every account (job list is opt-in, rarely enabled — moonpay/glovo/deel/etc. all empty) and the real `{acct}.workable.com/spi/v3/jobs` needs a per-account token (401). Not a general public source; no aviation user found.

**Operator sweep on existing parsers (config-only, 2026-08-07).** Probed for pilot roles on parsers we have. **1 win: Vista America** → iCIMS `careers-vistaamerica.icims.com` (SEPARATE tenant from VistaJet's careers-vistaglobal), robots-allowed, **7 home-based bizav pilot roles** (FO/Captain on CL65/Global 6000/BD700/CL300-350) → ADDED (direct_ats). Dead ends: **GMR** (Global Medical Response) iCIMS `careers-gmr` exists but the search path `/jobs/search?…&pr=0` is **robots-Disallow** → skipped (also mostly rotary medevac). **Hi Fly = FactorialHR** (no parser). **Recruitee/Teamtailor**: none of Avion Express/SmartLynx/Airhub/Heston/Fly2Sky/Wamos/Privilege Style/European Air Charter/Xfly/Amapola/DAT/Air Greenland resolve on either (bespoke/SPA careers or other ATS). **Phenom**: only **Southwest** (careers.southwestair.com) is on Phenom but posts **0 pilot roles** (dedicated pilot portal); Frontier/Spirit/Sun Country are **NOT** Phenom. **Lever/Greenhouse re-check of disabled boards**: no revival — Shield AI's 16 "pilot" hits are *Autonomous Pilot Integration* SW-engineering roles (false positives); Zipline (265)/Pyka/Merlin Labs are drone/autonomous (0 pilots); the airline boards (Frontier/Sun Country/Silver/Southern/NetJets/Surf Air/Ameriflight/Contour/Air Methods/Textron) still 404. All stay disabled.

**Volume push (2026-08-09) — new parsers + track findings.**
- **NEW parsers (all direct_ats):** `bamboohr.js` ({co}.bamboohr.com/careers/list + /careers/{id}/detail), `personio.js` ({co}.jobs.personio.{de|com}/xml), + aggregator `reed.js` (reed.co.uk/api/1.0, needs REED_API_KEY). Wins: **Luxaviation (BambooHR, 8 pilots)**, **AirX Charter (BambooHR, 4)**, **Air Canada (Phenom careers.aircanada.com/ca/en, 1)**; ready boards (0 today): Comlux, Jetfly, FAI (BambooHR), GetJet (Personio, carries Airhub as subcompany).
- **http.js fix:** `detectAntiBot` no longer treats a bare `cf-ray`/`server:cloudflare` as a block (only a challenge STATUS 403/429/503 counts). Legit public JSON APIs (BambooHR, Ashby) are Cloudflare-fronted; the old check was silently blocking them.
- **JSON-LD long-tail (Track 1) — DEAD END, not built.** Built + ran a JobPosting-JSON-LD detector across ~40 operators + flight schools (Avion Express, SmartLynx, Airhub, Heston, Fly2Sky, Wamos, Privilege Style, Xfly, Amapola, DAT, Air Greenland, CAE, L3Harris, BAA Training, FTEJerez, Skyborne, Titan, Loganair, Bristow…). **0 JobPosting JSON-LD anywhere** — every careers listing is a client-rendered SPA with no server-side structured data. The "bespoke/SPA" dead-ends are dead *because* they don't server-render; JSON-LD can't rescue them. The productive path for these operators is the ATS parsers (BambooHR found Luxaviation/AirX that JSON-LD could not). Did not build the 150-operator registry — it would be dead weight.
- **Oracle ORC (Track 2a) — no config-only hits.** Careers hosts are SPAs that don't expose the ORC host/site in initial HTML; probed Air Canada (turned out **Phenom** → added), Qatar (**Avature**, edge-gated), Gulf Air/Oman/Kuwait/Royal Jordanian/LATAM/Copa/Avianca (no discoverable ORC endpoint without headless). ORC parser not built (no verified live endpoint to build against). Revisit with a headless pass to capture the `{pod}.fa.{region}.oraclecloud.com` host + siteNumber.
- **SAP SuccessFactors (Track 2b) — blocked, do not build.** JetBlue (performancemanager8), Lufthansa (career5), Jet Aviation (performancemanager) SF hosts are all robots `Disallow: /`; Saudia (rmkcdn) + Swissport are Recruiting-Marketing sites with job data behind robots-blocked `/services/` (same shape as Ryanair RMK). Consistent with the standing SF ledger above.

**Launch-plan volume push (2026-08-10).**
- **Breezy HR** parser built (`sources/breezy.js`, direct_ats, `{co}.breezy.hr/json` + `/json/{id}`). Probe of ledgered ACMI + flight academies + small operators: **0 aviation boards** (tech-SMB ATS like Ashby). Parser ready; no configs.
- **Headless XHR discovery round 2** (`scripts/xhr-discover.js`, Puppeteer, captures each SPA careers page's JSON/XHR endpoints). Findings — endpoints found but **0 pilot roles today**: **Heston → Traffit** (`hestonairlines.traffit.com/public/an/list/`, clean public JSON, robots-clear; 5 jobs, all non-flying — Crew Dispatcher/Accountant/Lawyer). **Airhub → Workable** (active widget, account 585677, but 0 jobs). **PrivilegeStyle** (`pvg-api-*.privilegestyle.com/api/…` bespoke content API, no jobs feed), **Gulf Air / Oman Air** (bespoke `/api/…`, no jobs endpoint captured). **SmartLynx / Wamos / Xfly / Amapola / DAT / Air Greenland / LATAM / Avianca** — no job-data endpoint captured (heavier SPA / deeper interaction). Traffit sweep (avionexpress/smartlynx/getjet/… .traffit.com) = only Heston. No new pilot configs; Traffit endpoint documented for when Heston posts pilots.
- **Adzuna depth math** (19 countries, ~4 cron runs/day): current 2 queries × MAX_PAGES=1 = **152 calls/day** (under the ~250 free tier). MAX_PAGES=2 (2 queries) = **304/day** → needs a raise. +captain query at MAX_PAGES=1 = 228/day (fits); +captain +flight-instructor = 304/day → needs a raise; 4 queries × MAX_PAGES=2 = **608/day**. Extra-query unique-gain not testable without the ADZUNA keys locally; recommend the owner raise the Adzuna daily limit to ~700/day to run MAX_PAGES=2 + the captain/flight-instructor queries.

**Track 4 — government boards (assess → do NOT build).** robots all permit us, but none offers a clean stateless public feed AND none carries meaningful aviation-pilot inventory: **UK Civil Service Jobs** (legacy SID-based CGI, no working RSS; gov "pilot" search = no aircrew). **Australia APSJobs** (Salesforce community SPA; data only via reverse-engineered Aura endpoints). **Canada Job Bank** (robots Allow, crawl-delay 5; has an RSS feed but it's **jsessionid-stateful → returns 0 items** without a search session, and `searchstring=pilot` returns caregivers/truck-drivers/company-name matches — no aviation roles). **Canada GC Jobs** (emploisfp, session-redirect legacy). Government aircrew recruit via dedicated military portals (forces.ca, adfcareers.gov.au, raf.mod.uk), not these general boards, and the rare civilian gov pilot role is already caught by our aggregators. Ledgered; revisit only if one exposes a clean keyword-filterable JSON/RSS feed.

## Expansion round 3 (2026-08-23) — 1 parser built (Traffit), 0 new pilot roles

**Track 1 — SmartRecruiters orphans (re-discovered current ATS; all closed/0-pilot).** Direct-tenant + headless XHR discovery on the 11 disabled SR airlines:
- **Ryanair, Wizz Air, TUI Group** → still SuccessFactors (`career2`/`career5.successfactors.eu`) — robots `Disallow: /` (unchanged from the SF ledger above). **Norwegian** → SF Recruiting-Marketing (`careers.norwegian.com`); robots **`Disallow: /services/`** AND the `/services/jobs` data endpoint returns **403 "Are you human?"** (WAF) → closed. **easyJet** → NOT on Workday (probed `easyjet.wd{1..103}` = all invalid-tenant); careers.easyjet.com is Akamai-bot-walled, no jobs endpoint captured. **Air France-KLM / KLM / Airlink / IndiGo** → heavy WAF/bot protection (hCaptcha on Airlink, Akamai/AEM elsewhere); headless captured only bot-check/analytics endpoints, no jobs feed. **AirAsia** → Phenom, robots names ClaudeBot `Disallow: /` (see above).
- **Vueling** → **Teamtailor** (`careers.vueling.com/jobs.json`, custom domain) — parser-compatible but **0 pilot roles today** (all ground/ops); not added (would also need custom-host support in the Teamtailor parser). **Result: 0 parseable pilot configs** — every SR orphan is SF-robots-blocked, WAF-walled, or 0-pilot.

**Track 2 — proven SMB parsers.** (a) Ready configs Comlux, Jetfly (BambooHR), GetJet (Personio) already enabled since 2026-08-09; re-verified — still 0 pilots. (b) **50+ operator sweep** (BambooHR/Personio/Recruitee/Teamtailor) → only the known Luxaviation (7) + AirX (1); comlux/jetfly/fai/getjet/globeair are live boards with 0 pilots; no NEW pilot-carrying operator surfaced. (c) **Traffit parser BUILT** (`sources/traffit.js`, `{company}.traffit.com/public/an/list/` → `{count,items}`, direct_ats) + **Heston Airlines** config added (dry-run 6 jobs, all ground/ops → **0 pilots**, ready config). Traffit sweep of Polish/CEE operators (Enter Air/SprintAir/LOT/SmartWings/…) → **only Heston has a Traffit board.**

**Track 3 — US SMB ATS trio (NOT built — gated/unconfirmed).** **JazzHR** (`{co}.applytojob.com`): the public RSS/JSON path is unconfirmed (known customers 302-redirect) and **no aviation operator surfaced** under ~45 Part-135/charter/cargo/HEMS/academy slugs. **ADP WorkforceNow** (`/careercenter/public/events/staffing/v1/job-requisitions`) and **Paylocity** (`/recruiting/v2/api/jobs`) are public but **GUID-keyed per employer** (require the exact `cid`/company GUID from each operator's career URL — not slug-sweepable) → 404/302 without it. Building against an endpoint with no validated live aviation operator would be dead-weight; ledgered pending per-operator GUID discovery (headless).

**Track 4 — free micro-APIs (probe → skip).** **Arbeitnow** (free, no key): scanned 450 jobs + `?search=pilot` (175 results) → **0 real aviation-pilot titles** (all "Pilotanlage"/pilot-plant German noise). **The Muse** (free): tech/corporate-focused, 0 pilot titles. Per the task's own rule ("build only if a quick probe shows pilot yield"), both skipped.

## Wiring a new source

1. `sources/{name}.js` exporting `fetch{Name}(empConfig)` → array of
   pre-normalized job objects (shape validation inside).
2. `runner.js`: `require` it + add a `case` in `fetchForEmployer`.
3. `normalize.js`: add `case '{NAME}': return raw;` (pre-normalized).
4. `config/employers.js`: add the employer config, with a comment recording the
   recon (host, endpoint, robots status, verified pilot roles + date).
5. Verify in isolation (fetch → classify → `hasAnyRequirement`) before ingesting.
