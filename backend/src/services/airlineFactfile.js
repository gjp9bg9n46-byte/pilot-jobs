'use strict';

/**
 * What an airline looks like to THIS pilot.
 *
 * Two things the fact file needs that the airline row cannot answer on its own:
 * how many of its current vacancies are open to this pilot, and whether the
 * things those vacancies ask for are things the pilot already has. Both are
 * answered with the SAME matcher the Jobs page uses — a requirement ticked
 * green here and a job in the "you qualify" group there cannot disagree,
 * because they are the same code reading the same context.
 */

const prisma = require('../config/database');
const { matchJob } = require('./jobMatch');
const { getMatchContext } = require('./matchContextCache');
const { makeResolver, identityOf, companyKey } = require('../scrapers/jobIdentity');

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Which airline a job belongs to, for counting.
 *
 * Matching the company column letter for letter was not enough: Emirates'
 * vacancies are filed under "Emirates", "Emirates Airline Mexico" and under a
 * recruiter's name with Emirates in the title. The card counted 11, a pilot
 * searching the Jobs list saw 13, and both were describing the same airline.
 * The identity resolver already folds those together for dedup, so the counts
 * use it too and the two numbers cannot drift apart again.
 */
async function employerResolver() {
  const airlines = await prisma.airline.findMany({ select: { name: true, country: true, headquarters: true, bases: true } });
  return makeResolver(airlines);
}

/** The airline key a job counts towards, or null when nothing resolves. */
function employerKeyOf(job, resolver) {
  const ident = identityOf(job, resolver);
  return ident.employer?.name ? companyKey(ident.employer.name) : null;
}

const JOB_FIELDS = {
  id: true, company: true, title: true, titleEn: true, role: true, location: true, country: true,
  reqMinTotalHours: true, reqMinPicHours: true, reqCertificates: true, reqTypeRatings: true,
  reqAircraftTypes: true, reqAuthorities: true, reqEnglishLevel: true, reqMedicalClass: true,
  reqWorkAuthorization: true, reqEducation: true, reqMinMultiEngineHours: true,
  reqMinTurbineHours: true, reqMinInstrumentHours: true, reqMinCrossCountryHours: true,
};

// Keyed by the airline NAME as passed in (lower-cased), so callers keep the
// lookup they already use; the bucketing underneath is by resolved identity.
async function activeJobsFor(names) {
  const wanted = new Map();                       // resolved key → name as asked for
  for (const n of names) { const k = companyKey(n); if (k) wanted.set(k, norm(n)); }
  if (!wanted.size) return new Map();
  const [jobs, resolver] = await Promise.all([
    prisma.job.findMany({ where: { status: 'ACTIVE', mergedInto: null }, select: JOB_FIELDS }),
    employerResolver(),
  ]);
  const byCompany = new Map();
  for (const j of jobs) {
    const key = employerKeyOf(j, resolver);
    const asked = key && wanted.get(key);
    if (!asked) continue;
    if (!byCompany.has(asked)) byCompany.set(asked, []);
    byCompany.get(asked).push(j);
  }
  return byCompany;
}

/**
 * Open / qualify / close counts per airline name.
 * `close` is the CHECK + SHORT groups — "more are close" on the fact file CTA.
 */
async function jobStatsFor(names, pilotId) {
  const byCompany = await activeJobsFor(names);
  const ctx = pilotId ? await getMatchContext(pilotId, prisma) : null;
  const out = new Map();
  for (const [company, jobs] of byCompany) {
    let qualify = 0;
    let close = 0;
    if (ctx && ctx.matchable) {
      for (const j of jobs) {
        const m = matchJob(j, ctx);
        if (m.fitGroup === 'qualify') qualify += 1;
        else if (m.fitGroup === 'check' || m.fitGroup === 'short') close += 1;
      }
    }
    out.set(company, { open: jobs.length, qualify, close, matchable: !!(ctx && ctx.matchable) });
  }
  return out;
}

const num = (n) => Number(n || 0).toLocaleString('en-GB');

/**
 * The "What they ask for" list: one line per thing the airline's current
 * vacancies ask for, each with a verdict against this pilot.
 *   met     — the pilot has it
 *   not-met — the pilot does not
 *   unknown — nothing on the profile says either way, or it is expiring
 */
function requirementChecks(derived, ctx) {
  if (!derived) return [];
  const rows = [];
  const add = (label, status, you) => rows.push({ label, status, you: you || null });
  const know = (v) => v != null && v !== '';

  // Licence
  if (derived.certificates && derived.certificates.length) {
    const want = derived.certificates.map((c) => String(c).toUpperCase());
    const held = ctx ? [...ctx.certTypes].map((c) => String(c).toUpperCase()) : [];
    const has = want.some((w) => held.includes(w));
    add(`${want.join(' or ')} licence`,
      !ctx || !held.length ? 'unknown' : has ? 'met' : 'not-met',
      held.length ? `you: ${held.filter((h) => !['ELP', 'IR', 'ME', 'SE'].includes(h)).join(', ') || held.join(', ')}` : null);
  }
  // Type rating
  if (derived.aircraftTypes && derived.aircraftTypes.length) {
    const want = derived.aircraftTypes.map((t) => String(t).toUpperCase());
    const held = ctx ? [...ctx.ratingTypes].map((t) => String(t).toUpperCase()) : [];
    const has = want.some((w) => held.includes(w));
    add(`${want.join(' or ')} type rating`,
      !ctx || !held.length ? 'unknown' : has ? 'met' : 'not-met',
      held.length ? `you: ${held.join(', ')}` : null);
  }
  // Total hours
  if (know(derived.minTotalHours)) {
    const mine = ctx && ctx.totals ? Number(ctx.totals.totalTime || 0) : null;
    add(`${num(derived.minTotalHours)} h total`,
      mine == null ? 'unknown' : mine >= derived.minTotalHours ? 'met' : 'not-met',
      mine == null ? null : `you: ${num(Math.round(mine))} h`);
  }
  // PIC hours, where the vacancies ask for them
  if (know(derived.minPicHours)) {
    const mine = ctx && ctx.totals ? Number(ctx.totals.picTime || 0) : null;
    add(`${num(derived.minPicHours)} h PIC`,
      mine == null ? 'unknown' : mine >= derived.minPicHours ? 'met' : 'not-met',
      mine == null ? null : `you: ${num(Math.round(mine))} h`);
  }
  // Licence authority
  if (derived.authorities && derived.authorities.length) {
    const want = derived.authorities.map((a) => String(a).toUpperCase());
    const held = ctx ? [...ctx.certAuthorities].map((a) => String(a).toUpperCase()) : [];
    const has = want.some((w) => held.includes(w));
    add(`${want.join(' or ')} licence authority`,
      !held.length ? 'unknown' : has ? 'met' : 'not-met',
      held.length ? `you: ${held.join(', ')}` : null);
  }
  // ICAO English — expiring counts as "look at this", not as met.
  if (know(derived.englishLevel)) {
    const level = ctx ? ctx.elpLevel : null;
    const expiringSoon = ctx && ctx.elpExpiry
      && (new Date(ctx.elpExpiry) - Date.now()) / 86400000 < 60;
    const status = level == null ? 'unknown'
      : level < derived.englishLevel ? 'not-met'
        : (!ctx.elpValid || expiringSoon) ? 'unknown' : 'met';
    add(`ICAO English level ${derived.englishLevel}+`,
      status,
      level == null ? null : (!ctx.elpValid ? `yours: level ${level}, expired` : `you: level ${level}`));
  }
  return rows;
}

module.exports = {
  employerResolver, employerKeyOf, jobStatsFor, requirementChecks, activeJobsFor };
