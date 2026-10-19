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

const norm = (s) => String(s || '').trim().toLowerCase();

// Jobs are tied to airlines by company name — the same join the fact file's
// requirements already use.
async function activeJobsFor(names) {
  const wanted = new Set(names.map(norm).filter(Boolean));
  if (!wanted.size) return new Map();
  const jobs = await prisma.job.findMany({
    where: { status: 'ACTIVE', mergedInto: null },
    select: {
      id: true, company: true, title: true, role: true, location: true, country: true,
      reqMinTotalHours: true, reqMinPicHours: true, reqCertificates: true, reqTypeRatings: true,
      reqAircraftTypes: true, reqAuthorities: true, reqEnglishLevel: true, reqMedicalClass: true,
      reqWorkAuthorization: true, reqEducation: true, reqMinMultiEngineHours: true,
      reqMinTurbineHours: true, reqMinInstrumentHours: true, reqMinCrossCountryHours: true,
    },
  });
  const byCompany = new Map();
  for (const j of jobs) {
    const key = norm(j.company);
    if (!wanted.has(key)) continue;
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(j);
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

module.exports = { jobStatsFor, requirementChecks, activeJobsFor };
