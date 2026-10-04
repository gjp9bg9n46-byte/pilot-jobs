'use strict';

const prisma = require('../config/database');
const { makeResolver, identityOf, isRecruiter } = require('../scrapers/jobIdentity');

// Public landing-page aggregates. Server-side cached for 5 min so the landing
// load doesn't hammer the DB. Read-only counts — no auth, no personal data.
const TTL_MS = 5 * 60 * 1000;
let cache = { data: null, expires: 0 };

exports.getStats = async (req, res, next) => {
  try {
    if (cache.data && Date.now() < cache.expires) {
      return res.json(cache.data);
    }

    const [airlinesCount, activeJobsCount, fleetProfilesCount, lastJob] = await Promise.all([
      prisma.airline.count(),
      prisma.job.count({ where: { status: 'ACTIVE' } }),
      prisma.airline.count({ where: { fleetDetail: { not: null } } }),
      prisma.job.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ]);

    cache = {
      data: {
        airlinesCount,
        activeJobsCount,
        fleetProfilesCount,
        lastScrapedAt: lastJob?.updatedAt ?? null,
      },
      expires: Date.now() + TTL_MS,
    };

    res.json(cache.data);
  } catch (err) {
    next(err);
  }
};

// ── Landing page live content: hero job (checked against a sample A320 FO),
// real "qualifying" jobs for the notification/alert, top hiring operators
// (recruiters excluded) and factfiles with open jobs. Read-only, cached. ──────
const LAND_TTL = 15 * 60 * 1000;
let landCache = { data: null, expires: 0 };
// Illustrative sample pilot used ONLY to render the example ticks on the hero.
const SAMPLE = { certs: ['ATPL', 'CPL', 'MPL', 'ATP'], authorities: ['EASA', 'CAA'], types: ['A320', 'A319', 'A321', 'A320NEO'], totalHours: 1515, picHours: 600, english: 5 };
const U = (a) => (a || []).map((x) => String(x).toUpperCase());
function sampleQualifies(j) {
  if (j.reqMinTotalHours != null && SAMPLE.totalHours < j.reqMinTotalHours) return false;
  if (j.reqMinPicHours != null && SAMPLE.picHours < j.reqMinPicHours) return false;
  if (j.reqEnglishLevel != null && SAMPLE.english < j.reqEnglishLevel) return false;
  if (j.reqMedicalClass && j.reqMedicalClass !== 'CLASS_1') return false;
  if (j.reqCertificates?.length && !U(j.reqCertificates).some((c) => SAMPLE.certs.includes(c))) return false;
  if (j.reqAuthorities?.length && !U(j.reqAuthorities).some((a) => SAMPLE.authorities.includes(a))) return false;
  if (j.reqAircraftTypes?.length && !U(j.reqAircraftTypes).some((t) => SAMPLE.types.includes(t))) return false;
  return true;
}
const statedReqCount = (j) => ['reqCertificates', 'reqAuthorities', 'reqAircraftTypes'].filter((k) => j[k]?.length).length + ['reqMinTotalHours', 'reqMinPicHours', 'reqMedicalClass', 'reqEnglishLevel', 'reqWorkAuthorization'].filter((k) => j[k] != null).length;
const isNarrow = (j) => U(j.reqAircraftTypes).some((t) => /^A3[12]|A320|737|B737/.test(t)) || /a320|a319|a321|737|narrowbody/i.test(j.titleEn || j.title || '');
function heroRows(j) {
  const rows = [];
  if (j.reqCertificates?.length) rows.push({ label: 'ATPL / frozen ATPL', value: 'ATPL · ' + (j.reqAuthorities?.[0] || 'EASA'), status: 'met' });
  if (j.reqMinTotalHours != null) rows.push({ label: `${j.reqMinTotalHours.toLocaleString('en')} h total time`, value: '1,515 h logged', status: SAMPLE.totalHours >= j.reqMinTotalHours ? 'met' : 'notmet' });
  if (j.reqMedicalClass) rows.push({ label: 'Class 1 medical', value: 'Valid to Nov 2026', status: 'met' });
  if (j.reqEnglishLevel != null) rows.push({ label: `ICAO English ${j.reqEnglishLevel}+`, value: 'Level 5', status: 'met' });
  if (j.reqAircraftTypes?.length) rows.push({ label: 'Type rating', value: j.reqAircraftTypes.join(', '), status: U(j.reqAircraftTypes).some((t) => SAMPLE.types.includes(t)) ? 'met' : 'notmet' });
  else rows.push({ label: 'Type rating', value: 'Not stated by airline', status: 'notstated' });
  return rows.slice(0, 5);
}
const FAMILY = (t) => { const m = String(t).match(/Boeing \d{3}|Airbus A\d{3}|Embraer E\d{3}(?:-E\d)?|Dash 8|CRJ ?\d*|ATR ?\d+|Gulfstream G?\d+|Challenger \d+/i); return m ? m[0].replace(/-E(\d)/, '-E$1') : null; };
function fleetSummary(fleetDetail) {
  if (!Array.isArray(fleetDetail)) return null;
  const fams = [];
  for (const x of [...fleetDetail].sort((a, b) => (b.inService || 0) - (a.inService || 0))) { const f = FAMILY(x.type); if (f && !fams.includes(f)) fams.push(f); }
  return fams.slice(0, 3).join(', ') || null;
}
const baseLabel = (a) => { const b = (a.bases && a.bases[0]) || a.headquarters || null; return b ? b.replace(/\s+International Airport$/i, '').replace(/\s+City Airport$/i, '').replace(/\s+Airport$/i, '') : null; };
const applyParts = (url) => { try { const u = new URL(url); let p = u.pathname.replace(/\/+$/, ''); if (p.length > 42) p = p.slice(0, 41) + '…'; return { host: u.hostname.replace(/^www\./, ''), path: p }; } catch { return null; } };
// A hero needs a real posting link, not a generic contacts/careers-root page.
const goodApply = (url) => { try { const u = new URL(url); const p = u.pathname.toLowerCase(); if (p.replace(/\/+$/, '').length < 10) return false; if (/office-contact|\/contact|\/about|\/home|\/careers\/?$|\/jobs\/?$/.test(p)) return false; return true; } catch { return false; } };
const titleCase = (s) => { s = String(s || '').trim(); return (s === s.toLowerCase() || s === s.toUpperCase()) ? s.replace(/\b([a-z])/gi, (c) => c.toUpperCase()) : s; };
const cleanLoc = (s) => { const first = String(s || '').split(',')[0].trim(); return first.length > 2 && first.length <= 28 ? first : (s ? String(s).slice(0, 28) : null); };
const isFO = (j) => j.role === 'FIRST_OFFICER' || /first officer|f\/o/i.test(j.titleEn || j.title || '');

exports.getLanding = async (req, res, next) => {
  try {
    if (landCache.data && Date.now() < landCache.expires) return res.json(landCache.data);

    const [airlines, jobs, airlinesCount, activeJobsCount, lastJob] = await Promise.all([
      prisma.airline.findMany({ select: { id: true, name: true, country: true, headquarters: true, bases: true, fleetDetail: true } }),
      prisma.job.findMany({ where: { status: 'ACTIVE', mergedInto: null }, select: { id: true, title: true, titleEn: true, company: true, location: true, country: true, role: true, sourceType: true, applyUrl: true, postedAt: true, reqCertificates: true, reqAuthorities: true, reqAircraftTypes: true, reqMinTotalHours: true, reqMinPicHours: true, reqMedicalClass: true, reqEnglishLevel: true, reqWorkAuthorization: true } }),
      prisma.airline.count(),
      prisma.job.count({ where: { status: 'ACTIVE' } }),
      prisma.job.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ]);
    const resolver = makeResolver(airlines);
    for (const j of jobs) j._op = identityOf({ ...j }, resolver).employer;
    const resolved = (j) => j._op.via && j._op.via !== 'company-asis';
    const day = Math.floor(Date.now() / 864e5);
    const rot = (arr, off = 0) => (arr.length ? arr[(day + off) % arr.length] : null);

    // top operators by live count — resolved real airlines only, no recruiters
    const tally = new Map();
    for (const j of jobs) { if (!resolved(j) || isRecruiter(j.company)) continue; tally.set(j._op.name, (tally.get(j._op.name) || 0) + 1); }
    const topOperators = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name);

    // qualifying jobs for a sample A320 FO (resolved operator, a stated type/req)
    const qualifying = jobs.filter((j) => resolved(j) && sampleQualifies(j) && statedReqCount(j) >= 1);
    // hero: FO, >=4 stated reqs, a REAL posting link, direct preferred, narrowbody
    // preferred, daily-rotated among the best 5
    const heroPool = qualifying.filter((j) => isFO(j) && statedReqCount(j) >= 4 && goodApply(j.applyUrl))
      .sort((a, b) => (dir(b) - dir(a)) || (isNarrow(b) - isNarrow(a)) || (statedReqCount(b) - statedReqCount(a)) || (new Date(b.postedAt) - new Date(a.postedAt)));
    function dir(j) { return j.sourceType === 'direct_ats' || j.sourceType === 'operator_direct' ? 1 : 0; }
    const hero = rot(heroPool.slice(0, 5)) || heroPool[0] || null;
    const slimJob = (j) => j && { title: titleCase(j.titleEn || j.title), operator: j._op.name, location: cleanLoc(j.location || j.country) };
    // notif + alert: other FO jobs the sample qualifies for. Prefer DIRECT
    // sources (airline ATS) for cleaner titles; fall back to aggregators only if
    // there aren't enough direct ones. Then prefer A320/narrowbody + recent.
    const others = qualifying.filter((j) => isFO(j) && (!hero || j.id !== hero.id)).sort((a, b) => (dir(b) - dir(a)) || (isNarrow(b) - isNarrow(a)) || (new Date(b.postedAt) - new Date(a.postedAt)));
    const directOthers = others.filter((j) => dir(j));
    const npool = directOthers.length >= 2 ? directOthers : others;
    const notif = rot(npool.slice(0, 8), 1);
    const alert = rot(npool.filter((j) => !notif || j.id !== notif.id).slice(0, 8), 3);
    const recent = (j) => j && (Date.now() - new Date(j.postedAt)) / 864e5 <= 7;

    // factfiles: resolved operators with open jobs + fleet + base, top 3
    const openBy = new Map();
    for (const j of jobs) { if (resolved(j)) openBy.set(j._op.name, (openBy.get(j._op.name) || 0) + 1); }
    const factfiles = airlines.filter((a) => openBy.has(a.name) && fleetSummary(a.fleetDetail) && baseLabel(a))
      .map((a) => ({ id: a.id, name: a.name, country: a.country, fleet: fleetSummary(a.fleetDetail), base: baseLabel(a), open: openBy.get(a.name) }))
      .sort((x, y) => y.open - x.open).slice(0, 3);

    landCache = {
      data: {
        counts: { liveJobs: activeJobsCount, factfiles: airlinesCount, lastScrapedAt: lastJob?.updatedAt ?? null },
        hero: hero ? { title: titleCase(hero.titleEn || hero.title), operator: hero._op.name, location: cleanLoc(hero.location || hero.country), apply: applyParts(hero.applyUrl), reqs: heroRows(hero) } : null,
        notif: slimJob(notif),
        alert: notif ? { ...slimJob(alert || notif), postedToday: recent(alert || notif) } : null,
        topOperators, factfiles,
      },
      expires: Date.now() + LAND_TTL,
    };
    res.json(landCache.data);
  } catch (err) { next(err); }
};
