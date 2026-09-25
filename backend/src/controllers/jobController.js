const prisma = require('../config/database');
const {
  getPilotFlightTotals, runMatchForPilot, computeAlertScore, computeMatchScore, computeMatchBreakdown,
  getQualifiedMedicalClasses,
} = require('../services/matchingService');
const { EDU_RANK, parseElpLevel } = require('../lib/eduRank');
const {
  buildMatchContext, matchJob, regionForCountry, defaultRegionForPilot, REGIONS,
} = require('../services/jobMatch');

const EU_COUNTRIES_RTW = new Set([
  'austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech republic',
  'denmark', 'estonia', 'finland', 'france', 'germany', 'greece',
  'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg',
  'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia',
  'slovenia', 'spain', 'sweden',
]);

// Derived display fields (computed at serve time, no schema change):
//   visaSponsorship — the ad explicitly offers visa/work-permit sponsorship.
//   typeRatingStatus — 'NTR' (no type rating required / training provided),
//                      'RATED' (job requires a type rating), or null.
const VISA_RE = /visa\s+(?:sponsorship|sponsored|provided|support(?:ed)?)|sponsorship\s+(?:is\s+)?(?:available|provided|offered)|work\s+permit\s+(?:provided|sponsor)|we\s+sponsor/i;
const NTR_RE = /no\s+type\s+rating\s+required|non[-\s]?type[-\s]?rated|\bNTR\b|type\s+rating\s+(?:not\s+required|provided|paid|funded|offered)|rating\s+course\s+provided/i;

function deriveJobBadges(j) {
  const text = `${j.titleEn ?? j.title ?? ''} ${j.descriptionEn ?? j.description ?? ''}`;
  const visaSponsorship = VISA_RE.test(text);
  const typeRatingStatus = NTR_RE.test(text)
    ? 'NTR'
    : ((j.reqAircraftTypes?.length || 0) > 0 ? 'RATED' : null);
  return { visaSponsorship, typeRatingStatus };
}

// English-first presentation: when a job has been machine-translated, serve the
// English text as title/description and keep the original for reference.
// A still-listed vacancy whose posting date is older than this reads as stale
// even though it's live (rolling "Direct Entry Captain, ongoing" recruitment).
// The client reframes these as "Ongoing recruitment · still listed" rather than
// showing a misleading old posting date, and demotes them below fresh listings.
const evergreenDays = () => Math.max(1, parseInt(process.env.JOB_EVERGREEN_DAYS || '90', 10));
function isEvergreen(j) {
  if (!j.postedAt || j.status !== 'ACTIVE') return false;
  return (Date.now() - new Date(j.postedAt).getTime()) / 864e5 > evergreenDays();
}

// Aggregator feeds ship truncated snippets (Adzuna ~500 chars, Careerjet ~127),
// usually cut mid-sentence. Flag them so the client labels "Excerpt — see full
// posting on the official careers site", and trim to whole sentences so the
// text never ends (or starts) mid-thought.
const AGGREGATOR_SOURCES = new Set(['ADZUNA', 'CAREERJET', 'JOOBLE', 'AVIATIONJOBSEARCH', 'REED', 'WHATJOBS']);
function isSnippetExcerpt(sourcePlatform, description) {
  if (!AGGREGATOR_SOURCES.has(sourcePlatform)) return false;
  const d = String(description || '').trim();
  // Enriched aggregator descriptions are long and end cleanly; snippets don't.
  return d.length > 0 && d.length < 800 && !/[.!?"'”’)\]]$/.test(d);
}
function toWholeSentences(text) {
  let t = String(text || '').trim();
  if (!t) return t;
  const lastEnd = Math.max(t.lastIndexOf('.'), t.lastIndexOf('!'), t.lastIndexOf('?'));
  if (lastEnd >= 40) t = t.slice(0, lastEnd + 1).trim();       // drop trailing partial sentence
  if (/^[a-z]/.test(t)) {                                       // starts mid-sentence → drop the fragment
    const cap = t.search(/[A-Z]/);
    if (cap > 0 && cap < 60) t = t.slice(cap).trim();
  }
  return t;
}

// Apply-link trust (source badges). direct_ats / operator_direct → the pilot
// applies straight with the airline/operator; aggregator → a third-party board
// redirect. Surfaced on cards + detail and used to boost direct listings.
const AGGREGATOR_VIA_LABELS = { ADZUNA: 'Adzuna', CAREERJET: 'Careerjet', JOOBLE: 'Jooble', AVIATIONJOBSEARCH: 'Aviation Job Search', REED: 'Reed', WHATJOBS: 'WhatJobs' };
function deriveApplyTrust(j) {
  const st = j.sourceType || null;
  const applyIsDirect = st === 'direct_ats' || st === 'operator_direct';
  const applyVia = !applyIsDirect && st === 'aggregator'
    ? (AGGREGATOR_VIA_LABELS[j.sourcePlatform] || 'a job board')
    : null;
  return { applyIsDirect, applyVia };
}

// Light projection for the candidate fetch — every field matching/region/sort/facets
// need, and nothing heavy (no description/descriptionEn). Keep in sync with matchJob.
const CANDIDATE_SELECT = {
  id: true, company: true, country: true, sourceType: true, postedAt: true, role: true,
  salaryMax: true, salaryMin: true, expiresAt: true,
  reqCertificates: true, reqAuthorities: true, reqAircraftTypes: true, reqMedicalClass: true,
  reqMinTotalHours: true, reqMinPicHours: true, reqMinMultiEngineHours: true, reqMinTurbineHours: true,
  reqMinInstrumentHours: true, reqMinCrossCountryHours: true,
  reqEducation: true, reqWorkAuthorization: true, reqEnglishLevel: true,
};

function presentJob(j) {
  if (!j) return j;
  const badges = deriveJobBadges(j);
  const rawDescription = j.descriptionEn ?? j.description;
  const descriptionIsExcerpt = isSnippetExcerpt(j.sourcePlatform, rawDescription);
  const description = descriptionIsExcerpt ? toWholeSentences(rawDescription) : rawDescription;
  const base = { ...j, ...badges, ...deriveApplyTrust(j), evergreen: isEvergreen(j), description, descriptionIsExcerpt };
  if (!j.titleEn && !j.descriptionEn) return base;
  return {
    ...base,
    title: j.titleEn ?? j.title,
    originalTitle: j.title,
    originalDescription: j.description,
    originalLanguage: j.sourceLanguage,
  };
}

async function enrichJobs(jobs, pilotId) {
  const [saved, applied] = await Promise.all([
    prisma.savedJob.findMany({ where: { pilotId }, select: { jobId: true } }),
    prisma.application.findMany({ where: { pilotId }, select: { jobId: true } }),
  ]);
  const savedSet = new Set(saved.map((s) => s.jobId));
  const appliedSet = new Set(applied.map((a) => a.jobId));
  return jobs.map((j) => ({ ...presentJob(j), isSaved: savedSet.has(j.id), isApplied: appliedSet.has(j.id) }));
}

// ─── "No requirements specified" definition (shared by alerts noreq filter
// and the qualified-unread badge count) ───────────────────────────────────────
const NO_REQ_JOB_WHERE = {
  reqCertificates: { isEmpty: true },
  reqAuthorities: { isEmpty: true },
  reqAircraftTypes: { isEmpty: true },
  reqMinTotalHours: null,
  reqMinPicHours: null,
  reqMinMultiEngineHours: null,
  reqMinTurbineHours: null,
  reqMinInstrumentHours: null,
  reqMinCrossCountryHours: null,
  reqMedicalClass: null,
  reqEducation: null,
  reqWorkAuthorization: null,
  reqEnglishLevel: null,
};

function jobHasRequirements(job) {
  return (
    (job.reqCertificates?.length || 0) > 0 ||
    (job.reqAuthorities?.length || 0) > 0 ||
    (job.reqAircraftTypes?.length || 0) > 0 ||
    job.reqMinTotalHours != null || job.reqMinPicHours != null ||
    job.reqMinMultiEngineHours != null || job.reqMinTurbineHours != null ||
    job.reqMinInstrumentHours != null || job.reqMinCrossCountryHours != null ||
    job.reqMedicalClass != null || job.reqEducation != null ||
    job.reqWorkAuthorization != null || job.reqEnglishLevel != null
  );
}

exports.getJobs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      q,
      country,
      authority,
      aircraft,
      role,
      contractType,
      region,
      maxReqHours,
      hoursMin,
      hoursMax,
      salaryMin,
      postedWithin,
      sort = 'newest',
      qualifiedOnly,
      visa,
      typeRating,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const where = { status: 'ACTIVE' };
    const andConditions = [];

    // Text search across key fields
    if (q) {
      andConditions.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { company: { contains: q, mode: 'insensitive' } },
          { location: { contains: q, mode: 'insensitive' } },
          { country: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    // Scalar filters
    if (country) where.country = { contains: country, mode: 'insensitive' };
    if (role) where.role = role;
    if (contractType) where.contractType = contractType;
    // Region is derived from the job's country in JS (jobMatch.regionForCountry) and
    // applied after fetch, so the tab counts and the filter share one taxonomy.

    // Authority: comma-separated list → hasSome
    if (authority) {
      const authorities = authority.split(',').map((a) => a.trim()).filter(Boolean);
      if (authorities.length > 0) where.reqAuthorities = { hasSome: authorities };
    }

    // Aircraft: comma-separated list → hasSome
    if (aircraft) {
      const types = aircraft.split(',').map((a) => a.trim()).filter(Boolean);
      if (types.length > 0) where.reqAircraftTypes = { hasSome: types };
    }

    // Visa sponsorship — DB proxy for the deriveJobBadges() regex: match the
    // common ad phrasings. (contains-based; the badge itself is exact.)
    if (visa === 'true') {
      const visaPhrases = ['visa sponsor', 'visa provided', 'visa support', 'sponsorship available', 'sponsorship provided', 'sponsorship offered', 'work permit provided', 'we sponsor'];
      andConditions.push({
        OR: visaPhrases.flatMap((p) => [
          { description: { contains: p, mode: 'insensitive' } },
          { descriptionEn: { contains: p, mode: 'insensitive' } },
        ]),
      });
    }

    // Type-rating status — 'ntr' matches "no type rating / rating provided"
    // ads; 'rated' means the job names required type ratings.
    if (typeRating === 'ntr') {
      const ntrPhrases = ['no type rating', 'non type rated', 'non-type rated', 'type rating provided', 'type rating not required', 'type rating paid', 'type rating funded', 'type rating offered', 'rating course provided', 'NTR'];
      andConditions.push({
        OR: ntrPhrases.flatMap((p) => [
          { title: { contains: p, mode: p === 'NTR' ? undefined : 'insensitive' } },
          { description: { contains: p, mode: p === 'NTR' ? undefined : 'insensitive' } },
          { descriptionEn: { contains: p, mode: p === 'NTR' ? undefined : 'insensitive' } },
        ]),
      });
    } else if (typeRating === 'rated') {
      andConditions.push({ reqAircraftTypes: { isEmpty: false } });
    }

    // Max hours required by the job (show jobs requiring ≤ maxReqHours)
    if (maxReqHours) {
      andConditions.push({
        OR: [
          { reqMinTotalHours: null },
          { reqMinTotalHours: { lte: Number(maxReqHours) } },
        ],
      });
    }

    // Milestone hours window (from the Logbook "next milestone" jobs hook): jobs
    // whose reqMinTotalHours is in (hoursMin, hoursMax]. Mirrors the summary's
    // jobsUnlocked query EXACTLY — gt excludes null-requirement jobs — so the
    // "+N jobs → See them" link returns the same N the dashboard counted.
    if (hoursMin != null && hoursMin !== '') {
      andConditions.push({ reqMinTotalHours: { gt: Number(hoursMin) } });
    }
    if (hoursMax != null && hoursMax !== '') {
      andConditions.push({ reqMinTotalHours: { lte: Number(hoursMax) } });
    }

    // Min salary expected: job's salaryMax must be >= requested salaryMin
    if (salaryMin) {
      andConditions.push({
        OR: [
          { salaryMax: null },
          { salaryMax: { gte: Number(salaryMin) } },
        ],
      });
    }

    // Posted within N days
    if (postedWithin) {
      const since = new Date();
      since.setDate(since.getDate() - Number(postedWithin));
      where.postedAt = { gte: since };
    }

    // Qualified-only + fitGroup filtering now happens in JS after fetch (see the
    // shared jobMatch service). qualifiedOnly === "true" keeps only fitGroup "qualify".

    if (andConditions.length > 0) where.AND = andConditions;

    // Sort order
    let orderBy;
    switch (sort) {
      case 'salary_high':
        orderBy = [{ salaryMax: { sort: 'desc', nulls: 'last' } }, { postedAt: 'desc' }];
        break;
      case 'salary_low':
        orderBy = [{ salaryMin: { sort: 'asc', nulls: 'last' } }, { postedAt: 'desc' }];
        break;
      case 'hours_asc':
        orderBy = [{ reqMinTotalHours: { sort: 'asc', nulls: 'last' } }, { postedAt: 'desc' }];
        break;
      case 'deadline':
        orderBy = [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { postedAt: 'desc' }];
        break;
      case 'oldest':
        orderBy = { postedAt: 'asc' };
        break;
      default:
        // Default ("newest"): boost DIRECT apply links above aggregator ones,
        // then newest-first within each tier. sourceType sorted descending gives
        // operator_direct > direct_ats > aggregator (every ACTIVE row is
        // classified; nulls, if any legacy rows exist, sort last). This is the
        // apply-link-trust ranking — a pilot sees airline/operator-direct jobs
        // first. NOTE: relies on that alphabetical ordering of the three values;
        // a new sourceType value must be checked against it.
        orderBy = [{ sourceType: { sort: 'desc', nulls: 'last' } }, { postedAt: 'desc' }];
    }

    // Fetch the full candidate set (all non-region, non-fit filters applied at the
    // DB) — match, region grouping, fit-group filtering and "best" sort all run in
    // JS so every surface shares one match definition. Capped at 2000 as a backstop.
    // Perf (guardrail 4): the candidate fetch OMITS the heavy description fields —
    // matching/counting/sorting never read them; only the paged rows are re-fetched
    // in full for the presentation layer.
    const candidates = await prisma.job.findMany({ where, orderBy, take: 2000, select: CANDIDATE_SELECT });

    const ctx = req.pilot ? await buildMatchContext(req.pilot.id, prisma) : null;

    // Attach region + (when logged in) match to every candidate.
    const matched = candidates.map((j) => ({
      job: j,
      region: regionForCountry(j.country),
      match: ctx ? matchJob(j, ctx) : null,
    }));

    // Region tab counts — over the current filters EXCLUDING the region tab itself.
    const regionCounts = { All: matched.length };
    for (const r of REGIONS) regionCounts[r] = 0;
    for (const m of matched) regionCounts[m.region] += 1;

    // Apply the selected region tab (JS). Absent / "All" → no region filter.
    const regionSel = region && region !== 'All' ? region : null;
    let view = regionSel ? matched.filter((m) => m.region === regionSel) : matched;

    // Fit-group counts over the region-filtered view (drives the header + groups).
    const fitGroupCounts = { qualify: 0, incomplete: 0, oneShort: 0, other: 0 };
    if (ctx) for (const m of view) fitGroupCounts[m.match.fitGroup] += 1;

    // Profile nudge for the "Complete your profile to check" (incomplete) group:
    // the profile fields whose absence blocks the MOST incomplete jobs, top 3.
    let profileNudge = null;
    if (ctx && fitGroupCounts.incomplete > 0) {
      const NUDGE_LABEL = {
        authority: 'licence authority', licence: 'licence', medical: 'medical certificate',
        typeRating: 'type ratings', english: 'English level (ICAO)', workAuth: 'work authorisation',
        education: 'education', totalHours: 'logbook hours', picHours: 'PIC hours',
        instrumentHours: 'instrument hours', multiHours: 'multi-engine hours', turbineHours: 'turbine hours', ccHours: 'cross-country hours',
      };
      const tally = {};
      for (const m of view) {
        if (m.match.fitGroup !== 'incomplete') continue;
        for (const k of (m.match.unknownKeys || [])) tally[k] = (tally[k] || 0) + 1;
      }
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([k, n]) => ({ field: NUDGE_LABEL[k] || k, jobs: n }));
      if (top.length) profileNudge = { fields: top, incompleteJobs: fitGroupCounts.incomplete };
    }

    // Facet counts for the filter dropdowns, over the region-filtered view.
    const facetCounts = { aircraft: {}, role: {}, authority: {} };
    for (const m of view) {
      for (const t of (m.job.reqAircraftTypes || [])) facetCounts.aircraft[t] = (facetCounts.aircraft[t] || 0) + 1;
      if (m.job.role) facetCounts.role[m.job.role] = (facetCounts.role[m.job.role] || 0) + 1;
      for (const a of (m.job.reqAuthorities || [])) facetCounts.authority[a] = (facetCounts.authority[a] || 0) + 1;
    }

    // qualifiedOnly === "true" now means fitGroup "qualify" (unknowns allowed).
    if (qualifiedOnly === 'true' && ctx) view = view.filter((m) => m.match.fitGroup === 'qualify');

    // "best" (new default when logged in): qualify → oneShort → other, then keep the
    // base orderBy (direct-first, newest) within each group via a STABLE sort.
    const effectiveSort = req.query.sort || (ctx ? 'best' : 'newest');
    if (effectiveSort === 'best' && ctx) {
      // qualify → incomplete → oneShort → other, base order preserved (stable).
      const rank = { qualify: 0, incomplete: 1, oneShort: 2, other: 3 };
      view = view.map((m, i) => ({ m, i })).sort((a, b) => (rank[a.m.match.fitGroup] - rank[b.m.match.fitGroup]) || (a.i - b.i)).map((x) => x.m);
    }

    const total = view.length;
    const start = (Number(page) - 1) * Number(limit);
    const pageItems = view.slice(start, start + Number(limit));

    // Re-fetch the paged rows in FULL (descriptions/titles) for presentation, then
    // restore the computed order.
    const pageIds = pageItems.map((m) => m.job.id);
    const fullRows = pageIds.length
      ? await prisma.job.findMany({ where: { id: { in: pageIds } } })
      : [];
    const fullById = new Map(fullRows.map((r) => [r.id, r]));
    const pageJobs = pageIds.map((id) => fullById.get(id)).filter(Boolean);

    // Public (logged-out) requests have no pilot → no isSaved/isApplied state,
    // but they still get the full presentation layer (English-first titles,
    // visa/NTR badges) — logged-out browsing is a pilot's first impression.
    const enrichedArr = req.pilot
      ? await enrichJobs(pageJobs, req.pilot.id)
      : pageJobs.map((j) => ({ ...presentJob(j), isSaved: false, isApplied: false }));

    // Attach each job's match (new field; existing fields unchanged for back-compat).
    const matchById = new Map(pageItems.map((m) => [m.job.id, m.match]));
    const enriched = enrichedArr.map((j) => ({ ...j, match: matchById.get(j.id) || null }));

    res.json({
      jobs: enriched,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      // New (additive) — ignored by the current mobile client:
      regionCounts,
      fitGroupCounts: ctx ? fitGroupCounts : null,
      profileNudge,
      facetCounts,
      defaultRegion: ctx ? defaultRegionForPilot(ctx.country) : null,
      qualifyCount: ctx ? fitGroupCounts.qualify : null,
    });
  } catch (err) {
    next(err);
  }
};

// GET /jobs/hours-histogram — counts of jobs per reqMinTotalHours bucket for the
// CURRENT filters, EXCLUDING the hours filter itself (so the Hours dropdown shows
// the full distribution). Jobs with no hours requirement are counted separately
// ("noRequirement") and always included in results — never bucketed.
const HISTO_EDGES = [0, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000];
exports.getHoursHistogram = async (req, res, next) => {
  try {
    const { q, country, role, contractType, region, authority, aircraft, visa, typeRating, salaryMin, postedWithin, qualifiedOnly } = req.query;
    const where = { status: 'ACTIVE' };
    const AND = [];
    if (q) AND.push({ OR: ['title', 'company', 'location', 'country', 'description'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } })) });
    if (country) where.country = { contains: country, mode: 'insensitive' };
    if (role) where.role = role;
    if (contractType) where.contractType = contractType;
    if (authority) { const a = authority.split(',').map((x) => x.trim()).filter(Boolean); if (a.length) where.reqAuthorities = { hasSome: a }; }
    if (aircraft) { const a = aircraft.split(',').map((x) => x.trim()).filter(Boolean); if (a.length) where.reqAircraftTypes = { hasSome: a }; }
    if (salaryMin) AND.push({ OR: [{ salaryMax: null }, { salaryMax: { gte: Number(salaryMin) } }] });
    if (postedWithin) { const since = new Date(); since.setDate(since.getDate() - Number(postedWithin)); where.postedAt = { gte: since }; }
    if (AND.length) where.AND = AND;

    const rows = await prisma.job.findMany({ where, take: 2000, select: CANDIDATE_SELECT });
    const ctx = (qualifiedOnly === 'true' && req.pilot) ? await buildMatchContext(req.pilot.id, prisma) : null;
    const regionSel = region && region !== 'All' ? region : null;

    const buckets = HISTO_EDGES.map((lo, i) => ({ min: lo, max: HISTO_EDGES[i + 1] ?? null, count: 0 }));
    let noRequirement = 0;
    for (const j of rows) {
      if (regionSel && regionForCountry(j.country) !== regionSel) continue;
      if (ctx && matchJob(j, ctx).fitGroup !== 'qualify') continue;
      const h = j.reqMinTotalHours;
      if (h == null) { noRequirement += 1; continue; }
      let bi = buckets.length - 1;
      for (let i = 0; i < buckets.length; i++) { if (buckets[i].max == null || h < buckets[i].max) { bi = i; break; } }
      buckets[bi].count += 1;
    }
    res.json({ buckets, noRequirement });
  } catch (err) {
    next(err);
  }
};

exports.getJob = async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Resolve the airline factfile id from the company name (case-insensitive),
    // so the JobDetail "View factfile" link doesn't need the client airline map.
    // Also pull the airline's fleet for the "About the airline" detail row.
    let airlineId = null;
    let airlineFleet = null;
    if (job.company) {
      const airline = await prisma.airline.findFirst({
        where: { name: { equals: job.company, mode: 'insensitive' } },
        select: { id: true, fleet: true },
      });
      airlineId = airline?.id ?? null;
      airlineFleet = airline?.fleet?.length ? airline.fleet : null;
    }

    // Public-readable (optionalAuth): enrich isSaved/isApplied only when a pilot
    // is known; otherwise default to false.
    const enriched = req.pilot
      ? (await enrichJobs([job], req.pilot.id))[0]
      : { ...presentJob(job), isSaved: false, isApplied: false };

    // Per-requirement match (shared function) + "similar jobs you qualify for".
    let match = null;
    let similarJobs = [];
    if (req.pilot) {
      const ctx = await buildMatchContext(req.pilot.id, prisma);
      if (ctx) {
        match = matchJob(job, ctx);
        const family = new Set((job.reqAircraftTypes || []).map((t) => String(t).toUpperCase()));
        const cands = await prisma.job.findMany({
          where: { status: 'ACTIVE', id: { not: job.id } },
          orderBy: [{ sourceType: { sort: 'desc', nulls: 'last' } }, { postedAt: 'desc' }],
          take: 400, select: CANDIDATE_SELECT,
        });
        const picks = [];
        for (const c of cands) {
          if (matchJob(c, ctx).fitGroup !== 'qualify') continue;
          const sameAirline = job.company && c.company && String(c.company).toLowerCase() === String(job.company).toLowerCase();
          const sameFamily = family.size && (c.reqAircraftTypes || []).some((t) => family.has(String(t).toUpperCase()));
          if (sameAirline || sameFamily) { picks.push(c.id); if (picks.length >= 4) break; }
        }
        if (picks.length) {
          const rows = await prisma.job.findMany({ where: { id: { in: picks } } });
          const byId = new Map(rows.map((r) => [r.id, r]));
          similarJobs = picks.map((id) => byId.get(id)).filter(Boolean).map((j) => presentJob(j));
        }
      }
    }

    res.json({ ...enriched, airlineId, airlineFleet, match, similarJobs });
  } catch (err) {
    next(err);
  }
};

exports.getMyAlerts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, filter = 'all', sort = 'newest' } = req.query;

    // Small per-pilot volumes: fetch once, classify in JS so every bucket uses
    // the SAME strict qualification the badge uses — the list and the number
    // can never disagree again.
    const [alerts, pilot, totals, saved] = await Promise.all([
      prisma.jobAlert.findMany({ where: { pilotId: req.pilot.id }, include: { job: true } }),
      prisma.pilot.findUnique({
        where: { id: req.pilot.id },
        include: { certificates: true, ratings: true, medicals: true, rightToWork: true },
      }),
      getPilotFlightTotals(req.pilot.id),
      prisma.savedJob.findMany({ where: { pilotId: req.pilot.id }, select: { jobId: true } }),
    ]);
    const savedSet = new Set(saved.map((x) => x.jobId));

    const isActive = (job) => !!job && job.status === 'ACTIVE';
    const isQualified = (job) =>
      isActive(job) && jobHasRequirements(job) && computeMatchScore(pilot, totals, job) != null;
    const isNoReq = (job) => isActive(job) && !jobHasRequirements(job);

    let bucket;
    if (filter === 'unread') {
      bucket = (a) => !a.dismissedAt && !a.readAt && isQualified(a.job);
    } else if (filter === 'partial') {
      // Below 100%: job states requirements and the pilot misses at least one.
      bucket = (a) => !a.dismissedAt && isActive(a.job) && jobHasRequirements(a.job) && !isQualified(a.job);
    } else if (filter === 'noreq') {
      bucket = (a) => !a.dismissedAt && isNoReq(a.job);
    } else if (filter === 'dismissed') {
      bucket = (a) => !!a.dismissedAt;
    } else if (filter === 'saved') {
      bucket = (a) => !a.dismissedAt && isActive(a.job) && savedSet.has(a.jobId);
    } else {
      // 'all' (default view): ONLY 100% matches — the badge counts these.
      bucket = (a) => !a.dismissedAt && isQualified(a.job);
    }

    let list = alerts.filter(bucket);

    if (sort === 'score') {
      list.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0) || (b.createdAt - a.createdAt));
    } else if (sort === 'deadline') {
      const exp = (a) => (a.job?.expiresAt ? new Date(a.job.expiresAt).getTime() : Infinity);
      list.sort((a, b) => exp(a) - exp(b) || (b.createdAt - a.createdAt));
    } else {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }

    const total = list.length;
    const skip = (Number(page) - 1) * Number(limit);
    const pageItems = list.slice(skip, skip + Number(limit))
      .map((a) => ({ ...a, qualified: isQualified(a.job), job: presentJob(a.job) }));

    res.json({ alerts: pageItems, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
};

exports.markAlertRead = async (req, res, next) => {
  try {
    await prisma.jobAlert.updateMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
      data: { readAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.getSavedJobs = async (req, res, next) => {
  try {
    const saved = await prisma.savedJob.findMany({
      where: { pilotId: req.pilot.id },
      include: { job: true },
      orderBy: { createdAt: 'desc' },
    });
    // Apply applied status too
    const jobs = saved.map((s) => s.job);
    const applied = await prisma.application.findMany({
      where: { pilotId: req.pilot.id, jobId: { in: jobs.map((j) => j.id) } },
      select: { jobId: true },
    });
    const appliedSet = new Set(applied.map((a) => a.jobId));
    res.json(jobs.map((j) => ({ ...j, isSaved: true, isApplied: appliedSet.has(j.id) })));
  } catch (err) {
    next(err);
  }
};

exports.saveJob = async (req, res, next) => {
  try {
    await prisma.savedJob.upsert({
      where: { pilotId_jobId: { pilotId: req.pilot.id, jobId: req.params.id } },
      create: { pilotId: req.pilot.id, jobId: req.params.id },
      update: {},
    });
    // Ensure a JobAlert exists so this job appears in the Saved filter on Alerts page
    const alertExists = await prisma.jobAlert.findUnique({
      where: { pilotId_jobId: { pilotId: req.pilot.id, jobId: req.params.id } },
    });
    if (!alertExists) {
      try {
        const [job, pilot] = await Promise.all([
          prisma.job.findUnique({ where: { id: req.params.id } }),
          prisma.pilot.findUnique({
            where: { id: req.pilot.id },
            include: { certificates: true, ratings: true, medicals: true },
          }),
        ]);
        const totals = await getPilotFlightTotals(req.pilot.id);
        const score = computeAlertScore(pilot, totals, job) ?? 0;
        const breakdown = computeMatchBreakdown(pilot, totals, job);
        await prisma.jobAlert.create({
          data: { pilotId: req.pilot.id, jobId: req.params.id, matchScore: score, breakdown },
        });
      } catch (_) {}
    }
    res.json({ saved: true });
  } catch (err) {
    next(err);
  }
};

exports.unsaveJob = async (req, res, next) => {
  try {
    await prisma.savedJob.deleteMany({
      where: { pilotId: req.pilot.id, jobId: req.params.id },
    });
    res.json({ saved: false });
  } catch (err) {
    next(err);
  }
};

exports.applyToJob = async (req, res, next) => {
  try {
    const jobId = req.params.id;
    const pilotId = req.pilot.id;

    // Idempotent: a re-click returns success without re-snapshotting (the match is
    // captured AS OF the first apply and must not drift on later clicks).
    const existing = await prisma.application.findUnique({
      where: { pilotId_jobId: { pilotId, jobId } },
      include: { job: { select: { applyUrl: true } } },
    });
    if (existing) return res.json({ applied: true, applyUrl: existing.job.applyUrl });

    const [pilot, totals, job] = await Promise.all([
      prisma.pilot.findUnique({
        where: { id: pilotId },
        include: { certificates: true, ratings: true, medicals: true, rightToWork: true },
      }),
      getPilotFlightTotals(pilotId),
      prisma.job.findUnique({ where: { id: jobId } }),
    ]);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Strict 0–100 match snapshot (null when the pilot hard-fails a requirement —
    // the employer still sees the application + the breakdown of what's missing).
    const matchScore = computeMatchScore(pilot, totals, job);
    const matchBreakdown = computeMatchBreakdown(pilot, totals, job);

    await prisma.application.create({
      data: { pilotId, jobId, matchScore, matchBreakdown },
    });

    // Phase D notification trigger (stub — Resend wiring is the backend cluster).
    console.log(`[notify] Employer digest trigger — new application: pilot=${pilotId} job=${jobId} score=${matchScore}`);

    res.json({ applied: true, applyUrl: job.applyUrl });
  } catch (err) {
    next(err);
  }
};

// Pilot's own applications (My Applications tab). Own rows only.
exports.getMyApplications = async (req, res, next) => {
  try {
    const apps = await prisma.application.findMany({
      where: { pilotId: req.pilot.id },
      orderBy: { appliedAt: 'desc' },
      include: {
        job: { select: { id: true, title: true, company: true, location: true, role: true, status: true } },
      },
    });
    res.json(apps.map((a) => ({
      id: a.id,
      job: a.job,
      status: a.status,
      appliedAt: a.appliedAt,
      statusUpdatedAt: a.statusUpdatedAt,
      matchScore: a.matchScore,
    })));
  } catch (err) {
    next(err);
  }
};

exports.reportJob = async (req, res, next) => {
  try {
    // Accept { field?, message } (new) and { reason } (legacy) for back-compat.
    const message = req.body.message ?? req.body.reason;
    const field = req.body.field ?? null;
    if (!message || !String(message).trim()) return res.status(400).json({ error: 'A message is required' });
    await prisma.jobReport.create({
      data: { pilotId: req.pilot.id, jobId: req.params.id, reason: String(message).trim(), field: field ? String(field).slice(0, 60) : null },
    });
    res.json({ reported: true });
  } catch (err) {
    next(err);
  }
};

exports.markAllAlertsRead = async (req, res, next) => {
  try {
    const { count } = await prisma.jobAlert.updateMany({
      where: { pilotId: req.pilot.id, readAt: null, dismissedAt: null },
      data: { readAt: new Date() },
    });
    res.json({ updated: count });
  } catch (err) {
    next(err);
  }
};

exports.dismissAlert = async (req, res, next) => {
  try {
    await prisma.jobAlert.updateMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
      data: { dismissedAt: new Date() },
    });
    res.json({ dismissed: true });
  } catch (err) {
    next(err);
  }
};

// ─── Saved searches ───────────────────────────────────────────────────────────

exports.getSavedSearches = async (req, res, next) => {
  try {
    const searches = await prisma.savedSearch.findMany({
      where: { pilotId: req.pilot.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(searches);
  } catch (err) {
    next(err);
  }
};

exports.createSavedSearch = async (req, res, next) => {
  try {
    const { name, filters, frequency = 'INSTANT' } = req.body;
    if (!name || !filters) return res.status(400).json({ error: 'name and filters are required' });
    const search = await prisma.savedSearch.create({
      data: { pilotId: req.pilot.id, name, filters, frequency },
    });
    res.status(201).json(search);
  } catch (err) {
    next(err);
  }
};

exports.updateSavedSearch = async (req, res, next) => {
  try {
    const { name, filters, frequency, paused } = req.body;
    const search = await prisma.savedSearch.updateMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
      data: {
        ...(name !== undefined && { name }),
        ...(filters !== undefined && { filters }),
        ...(frequency !== undefined && { frequency }),
        ...(paused !== undefined && { paused }),
      },
    });
    if (!search.count) return res.status(404).json({ error: 'Not found' });
    res.json({ updated: true });
  } catch (err) {
    next(err);
  }
};

exports.deleteSavedSearch = async (req, res, next) => {
  try {
    await prisma.savedSearch.deleteMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
    });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
};

exports.triggerMatch = async (req, res, next) => {
  try {
    const matched = await runMatchForPilot(req.pilot.id);
    res.json({ matched });
  } catch (err) {
    next(err);
  }
};

// Badge count: unread alerts the pilot actually QUALIFIES for (meets every
// specified requirement, strict). Jobs with no specified requirements are
// excluded here — they live in the Alerts 'noreq' bucket instead.
exports.getUnreadCount = async (req, res, next) => {
  try {
    const pilotId = req.pilot.id;
    const [alerts, pilot, totals] = await Promise.all([
      prisma.jobAlert.findMany({
        where: { pilotId, readAt: null, dismissedAt: null, job: { status: 'ACTIVE' } },
        include: { job: true },
      }),
      prisma.pilot.findUnique({
        where: { id: pilotId },
        include: { certificates: true, ratings: true, medicals: true, rightToWork: true },
      }),
      getPilotFlightTotals(pilotId),
    ]);

    let qualified = 0;
    let noReq = 0;
    for (const a of alerts) {
      if (!jobHasRequirements(a.job)) { noReq++; continue; }
      if (computeMatchScore(pilot, totals, a.job) != null) qualified++;
    }

    res.json({ unread: qualified, totalUnread: alerts.length, noReqUnread: noReq });
  } catch (err) {
    next(err);
  }
};
