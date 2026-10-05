'use strict';

const prisma = require('../config/database');
const { buildMatchContext, matchJob } = require('../services/jobMatch');
const { computeReadiness, computeStrengthAndNudge } = require('../services/profileReadiness');
const { makeResolver, identityOf } = require('../scrapers/jobIdentity');

// Fields the unified matcher reads (explicit select overrides the global omit of the
// two new columns). These rows are matched/clustered, not serialized wholesale.
const MATCH_SELECT = {
  id: true, title: true, titleEn: true, company: true, location: true, country: true,
  role: true, sourceType: true, applyUrl: true, postedAt: true, createdAt: true, status: true,
  salaryMin: true, salaryMax: true,
  reqCertificates: true, reqAuthorities: true, reqAircraftTypes: true, aircraftTypes: true, reqTypeRatings: true,
  reqMedicalClass: true, reqMinTotalHours: true, reqMinPicHours: true, reqMinMultiEngineHours: true,
  reqMinTurbineHours: true, reqMinInstrumentHours: true, reqMinCrossCountryHours: true,
  reqEducation: true, reqWorkAuthorization: true, reqEnglishLevel: true,
};

// A slim, shape-stable job card for the dashboard (never exposes the omitted columns).
function card(j, match) {
  return {
    id: j.id, title: j.titleEn || j.title, company: j.company, location: j.location,
    country: j.country, role: j.role, sourceType: j.sourceType, postedAt: j.postedAt,
    salaryMin: j.salaryMin ?? null, salaryMax: j.salaryMax ?? null,
    match: match ? { status: match.status, pct: match.pct, shortfall: match.shortfall, category: match.category } : null,
  };
}

// GET /api/dashboard — one call powering the Dashboard (replaces the slow Alerts page).
exports.getDashboard = async (req, res, next) => {
  try {
    const pilotId = req.pilot.id;
    const PAGE = Math.min(Number(req.query.limit) || 8, 24);

    const [pilot, ctx, readiness, strength, activeJobs, alerts, apps, prefs, savedSearches, savedJobs] = await Promise.all([
      prisma.pilot.findUnique({ where: { id: pilotId }, select: { dashboardSeenAt: true, derivedTotals: true, emailVerified: true } }),
      buildMatchContext(pilotId, prisma),
      computeReadiness(pilotId),
      computeStrengthAndNudge(pilotId),
      prisma.job.findMany({ where: { status: 'ACTIVE', mergedInto: null }, select: MATCH_SELECT }),
      prisma.jobAlert.findMany({ where: { pilotId }, select: { jobId: true, createdAt: true, readAt: true, dismissedAt: true } }),
      prisma.application.findMany({ where: { pilotId }, orderBy: { statusUpdatedAt: 'desc' }, select: { id: true, jobId: true, status: true, appliedAt: true, statusUpdatedAt: true, matchScore: true } }),
      prisma.pilotPreference.findUnique({ where: { pilotId } }),
      prisma.savedSearch.findMany({ where: { pilotId }, orderBy: { createdAt: 'desc' } }),
      prisma.savedJob.findMany({ where: { pilotId }, select: { jobId: true } }),
    ]);

    const prevSeenAt = pilot?.dashboardSeenAt ? new Date(pilot.dashboardSeenAt) : null;

    // ── Identity clustering over ACTIVE jobs (first-seen + replacement lookup) ──
    const airlines = await prisma.airline.findMany({ select: { name: true, country: true, headquarters: true, bases: true } });
    const resolver = makeResolver(airlines);
    const byId = new Map(activeJobs.map((j) => [j.id, j]));
    const clusterFirstSeen = new Map(); // identity key -> earliest createdAt across ACTIVE cluster
    const activeByKey = new Map();       // identity key -> a representative ACTIVE job (replacement target)
    for (const j of activeJobs) {
      const key = identityOf({ ...j, description: j.titleEn || j.title }, resolver).key;
      j._key = key;
      const c = new Date(j.createdAt).getTime();
      if (!clusterFirstSeen.has(key) || c < clusterFirstSeen.get(key)) clusterFirstSeen.set(key, c);
      if (!activeByKey.has(key)) activeByKey.set(key, j);
    }

    // ── New jobs for you: the pilot's matched (alert) jobs that are live + canonical ──
    const alertJobIds = new Set(alerts.filter((a) => !a.dismissedAt).map((a) => a.jobId));
    const seenCard = new Set();
    const items = [];
    for (const j of activeJobs) {
      if (!alertJobIds.has(j.id)) continue;
      if (seenCard.has(j._key)) continue; // one card per identity cluster (re-posts collapse)
      seenCard.add(j._key);
      const m = ctx ? matchJob(j, ctx) : null;
      if (m && m.status === 'WRONG_CATEGORY') continue; // excluded from "new jobs for you"
      // identity-first-seen: NEW only if the cluster first appeared after the last visit.
      const firstSeen = clusterFirstSeen.get(j._key);
      const isNew = prevSeenAt ? firstSeen > prevSeenAt.getTime() : true;
      items.push({ job: j, match: m, isNew });
    }
    items.sort((a, b) => (b.match?.pct ?? -1) - (a.match?.pct ?? -1) || (new Date(b.job.postedAt) - new Date(a.job.postedAt)));

    const qualify = items.filter((x) => x.match?.status === 'QUALIFY');
    const oneShort = items.filter((x) => x.match?.status === 'SHORT' || x.match?.status === 'CHECK');
    const newCount = items.filter((x) => x.isNew).length;
    const page = (arr) => arr.slice(0, PAGE).map((x) => ({ ...card(x.job, x.match), isNew: x.isNew }));

    // ── Applications (with replacement-follow for expired jobs) ──
    const appJobIds = apps.map((a) => a.jobId);
    const appJobs = new Map((await prisma.job.findMany({
      where: { id: { in: appJobIds } },
      select: { id: true, title: true, titleEn: true, company: true, location: true, status: true, applyUrl: true, createdAt: true },
    })).map((j) => [j.id, j]));
    const applications = apps.map((a) => {
      const j = appJobs.get(a.jobId);
      let followed = null;
      if (j && j.status !== 'ACTIVE') {
        const key = identityOf({ ...j, description: j.titleEn || j.title }, resolver).key;
        const repl = activeByKey.get(key);
        if (repl && repl.id !== j.id) followed = { id: repl.id, title: repl.titleEn || repl.title, company: repl.company, status: 'ACTIVE' };
      }
      return {
        id: a.id, status: a.status, appliedAt: a.appliedAt, statusUpdatedAt: a.statusUpdatedAt, matchScore: a.matchScore,
        job: j ? { id: j.id, title: j.titleEn || j.title, company: j.company, location: j.location, status: j.status } : null,
        replacement: followed, // live re-posting of an expired job, if any
      };
    });

    // ── Side panel ──
    const dt = pilot?.derivedTotals || {};
    const medItem = (readiness.items || []).find((i) => i.type === 'medical');

    const response = {
      blockers: { count: readiness.blockers || 0, items: (readiness.items || []).filter((i) => i.blocker) },
      newJobs: {
        newSinceLastVisit: newCount,
        lastVisit: prevSeenAt ? prevSeenAt.toISOString() : null,
        allNew: page(items), qualify: page(qualify), oneShort: page(oneShort),
        counts: { all: items.length, qualify: qualify.length, oneShort: oneShort.length },
      },
      applications,
      profile: {
        strength: strength.strength ?? null, nudge: strength.nudge ?? null, qualifyCount: strength.qualifyCount ?? 0,
        totalHours: Math.round(Number(dt.totalTime) || 0),
        flights: Number(dt.flightCount) || 0,
        medicalDaysLeft: medItem ? medItem.days : null,
      },
      alertSettings: prefs ? {
        matchesPush: prefs.notifyMatchesPush, alertsPush: prefs.notifyAlertsPush,
        matchesEmail: prefs.notifyMatchesEmail, emailVerified: !!(pilot && pilot.emailVerified),
      } : null,
      savedSearches: savedSearches.length ? savedSearches : [
        { id: null, name: 'A320 First Officer jobs', suggestion: true, filters: { aircraft: 'A320', role: 'FIRST_OFFICER' } },
        { id: null, name: 'Captain jobs in Europe', suggestion: true, filters: { role: 'CAPTAIN', region: 'Europe' } },
      ],
      savedCount: savedJobs.length,
    };

    // dashboardSeenAt: update AFTER computing "new since last visit".
    await prisma.pilot.update({ where: { id: pilotId }, data: { dashboardSeenAt: new Date() } });

    res.json(response);
  } catch (err) { next(err); }
};
