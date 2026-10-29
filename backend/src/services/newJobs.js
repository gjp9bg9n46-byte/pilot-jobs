'use strict';

// ── The ONE definition of "new jobs since your last visit" ────────────────────
// The dashboard line ("N new jobs since your last visit") and the Home badge
// (web nav + app tab) MUST show the same number measured from the same instant.
// They used to disagree badly (badge 12 / line "No new jobs"): the badge counted
// every unread alert ever, through the legacy scorer, while the line counted
// alerts whose identity cluster first appeared after the previous visit, through
// the shared matcher. Both now call the two functions below.
//
// Writing the visit window stays with GET /api/dashboard alone — a badge poll
// must never advance the window and silently zero the dashboard's own count.

const { matchJob } = require('./jobMatch');

// A new visit starts only when the last one is >30 min stale, so refreshing the
// dashboard inside a visit keeps the same "new" set.
const VISIT_GAP_MS = 30 * 60 * 1000;

// Fields the matcher + the new-check read. Mirrors the dashboard's MATCH_SELECT
// minus the card-only columns, for the badge's cheaper query.
const NEW_JOBS_SELECT = {
  id: true, title: true, titleEn: true, company: true, country: true,
  role: true, createdAt: true,
  isCampaign: true,   // matchJob needs it to tell a campaign from a vacancy
  reqCertificates: true, reqAuthorities: true, reqAircraftTypes: true, aircraftTypes: true, reqTypeRatings: true,
  reqMedicalClass: true, reqMinTotalHours: true, reqMinPicHours: true, reqMinMultiEngineHours: true,
  reqMinTurbineHours: true, reqMinInstrumentHours: true, reqMinCrossCountryHours: true,
  reqEducation: true, reqWorkAuthorization: true, reqEnglishLevel: true,
  requirementsText: true, description: true,
  identityKey: true, identityFirstSeenAt: true,
};

// Where "since your last visit" starts, from the pilot's two stored stamps.
// `prevSeenAt` is the instant both the line and the badge measure against.
function visitWindow(pilot, now = new Date()) {
  const last = pilot?.dashboardSeenAt ? new Date(pilot.dashboardSeenAt) : null;
  const newVisit = !last || (now - last) > VISIT_GAP_MS;
  const prevSeenAt = newVisit ? last : (pilot?.previousDashboardSeenAt ? new Date(pilot.previousDashboardSeenAt) : null);
  return { newVisit, last, prevSeenAt };
}

// The pilot's matched (alert) jobs that are live, canonical and real vacancies,
// each flagged isNew. One card per identity cluster, so a re-post isn't "new".
function selectNewJobs({ activeJobs, alerts, ctx, prevSeenAt }) {
  const alertJobIds = new Set((alerts || []).filter((a) => !a.dismissedAt).map((a) => a.jobId));
  const seenCard = new Set();
  const items = [];
  for (const j of activeJobs) {
    if (!alertJobIds.has(j.id)) continue;
    const key = j.identityKey || j.id;
    if (seenCard.has(key)) continue;
    seenCard.add(key);
    const m = ctx ? matchJob(j, ctx) : null;
    if (m && (m.status === 'WRONG_CATEGORY' || m.status === 'EVENT')) continue; // not vacancies for this pilot
    const firstSeen = j.identityFirstSeenAt ? new Date(j.identityFirstSeenAt).getTime() : new Date(j.createdAt).getTime();
    const isNew = prevSeenAt ? firstSeen > prevSeenAt.getTime() : true;
    items.push({ job: j, match: m, isNew });
  }
  return items;
}

module.exports = { VISIT_GAP_MS, NEW_JOBS_SELECT, visitWindow, selectNewJobs };
