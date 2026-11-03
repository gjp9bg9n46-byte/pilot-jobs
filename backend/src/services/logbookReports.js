'use strict';
// ── Logbook Reports ─────────────────────────────────────────────────────────
//
// ONE endpoint behind GET /logbook/reports, so the web and the app can never
// disagree about a number. Everything is derived here; the clients format and
// lay out, and compute nothing.
//
// Two rules run through the whole file:
//
//  · CARRY-FORWARD is part of a CAREER total and part of nothing else. Hours a
//    pilot flew before this logbook have no date, no route and no aircraft, so
//    they cannot belong to a 28-day window, a distance, a map or a year. Every
//    windowed figure below is computed from logged flights only, and the
//    payload carries `basis` so the client can say "Based on N logged flights".
//
//  · A FIELD NOTHING WROTE TO IS NOT ZERO. An import with no instrument column
//    leaves instrumentTime at its 0 default; reporting "0.0 h IFR" over 517
//    sectors states something we do not know. computeDerivedTotals returns a
//    `recorded` map and anything false here is reported as unknown.
//
// No crew names appear in this payload. The printable logbook (phase 4) is a
// personal document and is served elsewhere; reports and share cards are not.
const prisma = require('../config/database');
const { computeDerivedTotals, landingsCoverage, LANDINGS_COVERAGE_MIN, _internals } = require('./logbookSummary');
// blockHours/resolveType live behind _internals — the same derivation the
// logbook summary uses, so the two screens cannot drift apart.
const { resolveType, blockHours } = _internals;
const { getActiveJobs } = require('./activeJobs');
const { withTotals, matchJob, jobAircraftCategory } = require('./jobMatch');
const { buildPlaces } = require('./logbookPlaces');
const { getMatchContext } = require('./matchContextCache');

// The fields computeDerivedTotals, the windows, recency and type resolution
// actually read. Everything else on a FlightLog is dead weight over the wire.
const FLIGHT_SELECT = {
  date: true, totalTime: true, offBlocksTime: true, onBlocksTime: true,
  picTime: true, sicTime: true, nightTime: true, instrumentTime: true,
  crossCountryTime: true, multiEngineTime: true, turbineTime: true, jetTime: true,
  landingsDay: true, landingsNight: true, landingsRecorded: true,
  aircraftType: true, registration: true,
  departure: true, arrival: true,
};

const DAY = 86400000;
const round1 = (n) => Math.round(n * 10) / 10;

// EASA ORO.FTL.210 block-hour ceilings. A planning aid: the operator holds the
// official record, and the client says so.
const FTL = { last28Days: 100, calendarYear: 900, last12Months: 1000 };
// EASA FCL.060(b): three take-offs and landings in the preceding 90 days.
const RECENCY_WINDOW_DAYS = 90;
const RECENCY_REQUIRED = 3;
// Fewer than this many months with any flying and a projected date is noise.
const PACE_MIN_MONTHS_FLOWN = 3;
const PACE_WINDOW_MONTHS = 12;

const MILESTONES = [500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 20000];

/** Month key in UTC: "2026-11". */
const ym = (d) => d.toISOString().slice(0, 7);

/** The N calendar months ending with the current one, oldest first. */
function recentMonthKeys(now, n) {
  const out = [];
  const y = now.getUTCFullYear(); const m = now.getUTCMonth();
  for (let i = n - 1; i >= 0; i--) out.push(ym(new Date(Date.UTC(y, m - i, 1))));
  return out;
}

// ── Flight time against the FTL ceilings ────────────────────────────────────
function flightTimeLimits(logs, now) {
  const t = now.getTime();
  const from28 = t - 28 * DAY;
  const from365 = t - 365 * DAY;
  const yearStart = Date.UTC(now.getUTCFullYear(), 0, 1);
  let b28 = 0; let bYear = 0; let b365 = 0; let inWindow = 0;
  for (const log of logs) {
    const at = log.date.getTime();
    const block = blockHours(log);
    if (at >= from28) b28 += block;
    if (at >= yearStart) bYear += block;
    if (at >= from365) { b365 += block; inWindow += 1; }
  }
  // Nothing in twelve months: three empty bars say less than no card at all.
  if (!inWindow) return null;
  return {
    last28Days: { hours: round1(b28), limit: FTL.last28Days },
    calendarYear: { hours: round1(bYear), limit: FTL.calendarYear, year: now.getUTCFullYear() },
    last12Months: { hours: round1(b365), limit: FTL.last12Months },
  };
}

// ── Recency ─────────────────────────────────────────────────────────────────
// Per type, because currency is per type. Honest about its own basis: if most
// flights carry no landings, we show no verdict at all.
function recency(logs, now, resolveTypeOf) {
  const from = now.getTime() - RECENCY_WINDOW_DAYS * DAY;
  const window = logs.filter((l) => l.date.getTime() >= from);

  const withLandings = logs.filter(
    (l) => l.landingsRecorded === true || (l.landingsDay || 0) + (l.landingsNight || 0) > 0,
  ).length;
  // The same rule the logbook summary applies, from the same module.
  const trackable = logs.length > 0 && landingsCoverage(logs) >= LANDINGS_COVERAGE_MIN;

  const base = {
    trackable,
    windowDays: RECENCY_WINDOW_DAYS,
    required: RECENCY_REQUIRED,
    flightsWithLandings: withLandings,
    flightCount: logs.length,
  };
  if (!trackable) return { ...base, byType: [] };

  // Newest first: the Nth-most-recent landing is the one whose roll-out date
  // drops the count below the requirement.
  const byType = new Map();
  for (const l of [...window].sort((a, b) => b.date - a.date)) {
    const type = resolveTypeOf(l) || 'Unknown';
    if (!byType.has(type)) byType.set(type, { type, day: [], night: [] });
    const e = byType.get(type);
    for (let i = 0; i < (l.landingsDay || 0); i++) e.day.push(l.date);
    for (let i = 0; i < (l.landingsNight || 0); i++) e.night.push(l.date);
  }
  const verdict = (dates) => {
    const count = dates.length;
    const current = count >= RECENCY_REQUIRED;
    // Currency lapses 90 days after the flight carrying the 3rd-newest landing.
    const pivot = current ? dates[RECENCY_REQUIRED - 1] : null;
    return {
      count,
      current,
      lapsesOn: pivot ? new Date(pivot.getTime() + RECENCY_WINDOW_DAYS * DAY).toISOString().slice(0, 10) : null,
    };
  };
  return {
    ...base,
    byType: [...byType.values()]
      .map((e) => ({ type: e.type, day: verdict(e.day), night: verdict(e.night) }))
      .sort((a, b) => (b.day.count + b.night.count) - (a.day.count + a.night.count)),
  };
}

// ── Next milestone, from the pace of the last 12 CALENDAR months ────────────
// Calendar months, including the ones with no flying: a pilot who flew hard in
// two months and not at all for ten is not on a 60-hour-a-month pace.
function milestone(logs, careerTotal, now) {
  const next = MILESTONES.find((h) => h > careerTotal);
  if (!next) return null;
  const remaining = round1(next - careerTotal);

  const keys = recentMonthKeys(now, PACE_WINDOW_MONTHS);
  const inWindow = new Set(keys);
  const perMonth = new Map(keys.map((k) => [k, 0]));
  for (const log of logs) {
    const k = ym(log.date);
    if (inWindow.has(k)) perMonth.set(k, perMonth.get(k) + blockHours(log));
  }
  const flown = [...perMonth.values()];
  const monthsFlown = flown.filter((h) => h > 0).length;
  const pace = flown.reduce((a, b) => a + b, 0) / PACE_WINDOW_MONTHS;

  const base = { current: round1(careerTotal), next, remaining };
  // Too little to extrapolate from, or no flying at all in the window.
  if (monthsFlown < PACE_MIN_MONTHS_FLOWN || pace <= 0) return { ...base, pace: null, eta: null };

  const monthsToGo = Math.ceil(remaining / pace);
  const eta = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsToGo, 1));
  return {
    ...base,
    pace: round1(pace),
    paceWindowMonths: PACE_WINDOW_MONTHS,
    monthsFlown,
    eta: eta.toISOString().slice(0, 7),
  };
}

// ── Jobs: unlocked this year, command minimums, and the closest gaps ────────
function totalsAsOf(logs, cf, cutoff) {
  return computeDerivedTotals(logs.filter((l) => l.date.getTime() < cutoff), cf);
}

const median = (xs) => {
  const a = xs.filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : null;
};

/** How many of these jobs the pilot qualifies for, under the shared matcher. */
function qualifyingCount(jobs, ctx) {
  let n = 0;
  for (const job of jobs) {
    const m = matchJob(job, ctx);
    if (m && m.status === 'QUALIFY') n += 1;
  }
  return n;
}

async function jobsSection(jobsP, ctxP, logs, cf, careerDerived, now) {
  // Both were started at the top of the build and have been loading while the
  // flights were read, so this is a join, not a fetch.
  const [jobs, ctxNow] = await Promise.all([jobsP, ctxP]);
  if (!jobs || !jobs.length || !ctxNow) return { unlocked: null, command: null, almostThere: [] };

  // ── ONE pass over the job list, not three. Today's qualify count and the
  //    one-requirement-short list come from the same verdict per job.
  let today = 0;
  const almost = [];
  for (const job of jobs) {
    const m = matchJob(job, ctxNow);
    if (!m) continue;
    if (m.status === 'QUALIFY') { today += 1; continue; }
    if (m.status !== 'SHORT') continue;
    if (jobAircraftCategory(job) === 'helicopter') continue;
    const row = (m.requirements || []).find((r) => r.status === 'unmet');
    const need = row && row.group === 'hours' ? Number(String(row.reqText).replace(/[^\d.]/g, '')) : null;
    const have = row && row.group === 'hours' ? Number(String(row.pilotText || '').replace(/[^\d.]/g, '')) : null;
    almost.push({
      id: job.id,
      title: job.title,
      company: job.company,
      requirement: row ? row.label : null,
      shortfall: m.shortfall,
      gapHours: Number.isFinite(need) && Number.isFinite(have) && need > have ? Math.round(need - have) : null,
    });
  }

  // ── Unlocked since 1 January: the same matcher against the totals the pilot
  //    had then. Only hours move backwards — licences and ratings are taken as
  //    they are today, because we do not store when they were earned and
  //    inventing that would be worse than leaving it out.
  const jan1 = Date.UTC(now.getUTCFullYear(), 0, 1);
  const flownThisYear = logs.some((l) => l.date.getTime() >= jan1);
  let unlocked;
  if (!flownThisYear) {
    // Nothing logged this year, so the January context is today's context and
    // a second pass over 613 jobs could only return the same number.
    unlocked = { today, onJan1: today, delta: 0, activeJobs: jobs.length, since: new Date(jan1).toISOString().slice(0, 10) };
  } else {
    const ctxJan = withTotals(ctxNow, totalsAsOf(logs, cf, jan1));
    const onJan1 = qualifyingCount(jobs, ctxJan);
    unlocked = { today, onJan1, delta: today - onJan1, activeJobs: jobs.length, since: new Date(jan1).toISOString().slice(0, 10) };
  }

  // ── Command: the real minimums in live Captain vacancies, preferring the
  //    pilot's own main type so the comparison is one they can act on.
  const mainType = ((careerDerived.byType || [])[0] || {}).type || null;
  const captains = jobs.filter((j) => String(j.role || '').toUpperCase() === 'CAPTAIN'
    && jobAircraftCategory(j) !== 'helicopter'
    && (Number(j.reqMinTotalHours) > 0 || Number(j.reqMinPicHours) > 0));
  const onType = mainType
    ? captains.filter((j) => (j.aircraftTypes || []).concat(j.reqTypeRatings || [])
      .some((t) => String(t).toUpperCase().includes(mainType)))
    : [];
  const pool = onType.length >= 3 ? onType : captains;
  const command = pool.length ? {
    type: onType.length >= 3 ? mainType : null,
    sampleSize: pool.length,
    medianTotalHours: median(pool.map((j) => Number(j.reqMinTotalHours))),
    medianPicHours: median(pool.map((j) => Number(j.reqMinPicHours))),
    yourTotalHours: careerDerived.totalTime,
    yourPicHours: careerDerived.picTime,
  } : null;

  // Closest gap first; a non-numeric shortfall sorts last but is still shown.
  almost.sort((a, b) => {
    if (a.gapHours == null && b.gapHours == null) return 0;
    if (a.gapHours == null) return 1;
    if (b.gapHours == null) return -1;
    return a.gapHours - b.gapHours;
  });
  return { unlocked, command, almostThere: almost.slice(0, 6) };
}

// ── The payload ─────────────────────────────────────────────────────────────
async function buildLogbookReports(pilotId, { now = new Date(), perf = false } = {}) {
  // Phase timings, the same `?_perf=1` convention GET /jobs uses. Measuring
  // this from a laptop is measuring the laptop: every query crosses the
  // internet to Railway (~217 ms round trip here, ~1 ms in production), so
  // the only honest numbers come from the deployed server.
  const t0 = Date.now();
  const marks = {};
  const mark = (k) => { marks[k] = Date.now() - t0; };
  // Four independent reads, so they go out together rather than one after the
  // other. Sequentially this is four round trips stacked; in parallel it costs
  // the slowest of them. The job list and the match context are shared caches
  // that the Jobs tab and the dashboard usually have warm already.
  const jobsP = getActiveJobs();
  const ctxP = getMatchContext(pilotId, prisma);
  // Only the columns the derivation reads. A logbook is hundreds of rows and
  // the unused ones (remarks, flight numbers, scan ids) are the wide columns.
  const [pilot, logs] = await Promise.all([
    prisma.pilot.findUnique({ where: { id: pilotId }, select: { id: true, carryForward: true } }),
    prisma.flightLog.findMany({ where: { pilotId }, orderBy: { date: 'asc' }, select: FLIGHT_SELECT }),
  ]);
  mark('load');
  if (!pilot) {
    // Nothing to report on. Settle the in-flight promises so a rejection
    // cannot surface later as an unhandled rejection.
    jobsP.catch(() => {}); ctxP.catch(() => {});
    return null;
  }
  const cf = pilot.carryForward || {};
  const derived = computeDerivedTotals(logs, cf);
  mark('derive');
  const typeOf = (l) => resolveType(l).type || null;

  const carryForwardHours = round1(Number(cf.totalTime) || 0);
  const basis = {
    flightCount: logs.length,
    firstFlight: logs.length ? logs[0].date.toISOString().slice(0, 10) : null,
    lastFlight: logs.length ? logs[logs.length - 1].date.toISOString().slice(0, 10) : null,
    carryForwardHours,
  };

  const rec = derived.recorded || {};
  const totals = {
    // Career totals — carry-forward included, because that is what a career is.
    totalTime: derived.totalTime,
    picTime: derived.picTime,
    sicTime: derived.sicTime,
    // No training column exists yet, so the remainder is named for what it is.
    otherTime: round1(Math.max(0, derived.totalTime - derived.picTime - derived.sicTime)),
    nightTime: rec.nightTime ? derived.nightTime : null,
    instrumentTime: rec.instrumentTime ? derived.instrumentTime : null,
    crossCountryTime: rec.crossCountryTime ? derived.crossCountryTime : null,
    multiEngineTime: derived.multiEngineTime || null,
    turbineTime: derived.turbineTime || null,
    jetTime: derived.jetTime || null,
    carryForward: carryForwardHours,
    byType: derived.byType || [],
  };

  const jobs = await jobsSection(jobsP, ctxP, logs, cf, derived, now);
  mark('jobs');
  // Phase 2. Logged flights only — carry-forward has no route.
  const places = await buildPlaces(logs, blockHours, now);
  mark('places');

  mark('total');
  return {
    generatedAt: now.toISOString(),
    ...(perf ? { _timing: marks } : {}),
    basis,
    limits: flightTimeLimits(logs, now),
    recency: recency(logs, now, typeOf),
    totals,
    milestone: milestone(logs, derived.totalTime, now),
    distance: places.distance,
    places: places.places,
    tails: places.tails,
    sun: places.sun,
    activity: places.activity,
    night: places.night,
    // How much of the logbook each phase-2 figure could actually use.
    placesBasis: places.basis,
    jobsUnlocked: jobs.unlocked,
    command: jobs.command,
    almostThere: jobs.almostThere,
  };
}

// ── Cache ───────────────────────────────────────────────────────────────────
// The report is several seconds of work (517 flights × 613 jobs) and does not
// change between two taps. Same shape as matchContextCache: short TTL, and an
// explicit invalidate for the write paths that touch totals.
const TTL_MS = Number(process.env.REPORTS_CACHE_TTL_MS || 120000);
const cache = new Map();
const inflight = new Map();
const MAX = 200;

function invalidateReports(pilotId) { cache.delete(pilotId); }
function clearReportsCache() { cache.clear(); inflight.clear(); }

async function getLogbookReports(pilotId, opts) {
  if (!pilotId) return null;
  const hit = cache.get(pilotId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.payload;
  const pending = inflight.get(pilotId);
  if (pending) return pending;

  const p = buildLogbookReports(pilotId, opts)
    .then((payload) => {
      cache.delete(pilotId);
      cache.set(pilotId, { at: Date.now(), payload });
      while (cache.size > MAX) cache.delete(cache.keys().next().value);
      return payload;
    })
    .finally(() => inflight.delete(pilotId));
  inflight.set(pilotId, p);
  return p;
}

module.exports = {
  getLogbookReports,
  buildLogbookReports,
  invalidateReports,
  clearReportsCache,
  // exported for tests — pure, no database
  flightTimeLimits,
  recency,
  milestone,
  recentMonthKeys,
  FTL,
  LANDINGS_COVERAGE_MIN,
  PACE_WINDOW_MONTHS,
  MILESTONES,
};
