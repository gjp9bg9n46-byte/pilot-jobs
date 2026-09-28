'use strict';

// Application readiness + match-based profile strength for the redesigned Profile
// page. Readiness = the documents/checks that are expired, expiring or missing.
// Strength + nudge reuse the SAME shared job-match function as the Jobs page's
// "Complete your profile" group, so the numbers agree.

const prisma = require('../config/database');
const { buildMatchContext, matchJob } = require('./jobMatch');

const DAY = 86400000;

// Training validity defaults (months) when a record has no explicit expiresAt.
// Explicit expiresAt always wins. Editable later via the training record.
const TRAINING_VALIDITY_MONTHS = { CRM: 12, DGR: 24, 'FIRST AID': 24, SMS: 12 };

function trainingDue(rec) {
  if (rec.expiresAt) return new Date(rec.expiresAt);
  const months = TRAINING_VALIDITY_MONTHS[String(rec.type || '').trim().toUpperCase()];
  if (!months || !rec.completedAt) return null;
  const d = new Date(rec.completedAt);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Map a date to a readiness status relative to now.
//   null date        → 'missing' (grey)
//   past             → 'expired'  (red)
//   ≤7 days          → 'expiring' (red)
//   ≤90 days         → 'due'      (amber)
//   else             → 'ok'
function statusFor(date) {
  if (!date) return { level: 'missing', days: null };
  const days = Math.floor((new Date(date).getTime() - Date.now()) / DAY);
  if (days < 0) return { level: 'expired', days };
  if (days <= 7) return { level: 'expiring', days };
  if (days <= 90) return { level: 'due', days };
  return { level: 'ok', days };
}

// Build the readiness item list. `needsAttention` items (expired/expiring/due/
// missing) drive the strip; 'ok' items are omitted. A blocker is a licence,
// medical or passport that is expired or expiring within 7 days.
async function computeReadiness(pilotId) {
  const pilot = await prisma.pilot.findUnique({
    where: { id: pilotId },
    include: { certificates: true, ratings: true, medicals: true, trainingRecords: true, rightToWork: true },
  });
  if (!pilot) return { items: [], blockers: 0 };

  const items = [];
  const push = (type, label, date, { fix = '/profile', blockerEligible = false, extra = {} } = {}) => {
    const s = statusFor(date);
    if (s.level === 'ok') return;
    const blocker = blockerEligible && (s.level === 'expired' || s.level === 'expiring');
    items.push({ type, label, date: date ? new Date(date).toISOString() : null, level: s.level, days: s.days, fix, blocker, ...extra });
  };

  // Licences (non-ELP). Missing entirely → one grey "Add your licence" item.
  const licences = pilot.certificates.filter((c) => c.type !== 'ELP');
  if (!licences.length) {
    push('licence', 'Add your licence', null, { blockerEligible: false });
  } else {
    for (const c of licences) {
      push('licence', `${c.type} licence`, c.expiryDate, { blockerEligible: true, extra: { itemId: c.id } });
    }
    // Authority still unknown (migrated from bogus "ICAO") on ANY licence → ONE grey
    // prompt, never red. The shared match reads it as ? until the pilot picks it.
    if (licences.some((c) => String(c.issuingAuthority || '').toLowerCase() === 'unknown')) {
      items.push({ type: 'authority', label: 'Pick your licence authority', date: null, level: 'missing', days: null, fix: '/profile', blocker: false });
    }
  }

  // Medical (latest by expiry). Missing → grey; expiry → can block.
  const medical = [...pilot.medicals].sort((a, b) => new Date(b.expiryDate) - new Date(a.expiryDate))[0];
  if (!medical) push('medical', 'Add your medical', null);
  else push('medical', `Class ${String(medical.medicalClass).replace('CLASS_', '')} medical`, medical.expiryDate, { blockerEligible: true });

  // Passport (stored on the pilot; null → grey "Not set").
  push('passport', 'Passport', pilot.passportExpiry, { blockerEligible: true });

  // English (ELP cert expiry).
  const elp = pilot.certificates.find((c) => c.type === 'ELP');
  if (elp && elp.expiryDate) push('english', 'English (ICAO) expiry', elp.expiryDate);

  // Type-rating proficiency checks (LPC/OPC) + line checks.
  for (const r of pilot.ratings) {
    if (r.proficiencyCheckDue) push('proficiency', `${r.aircraftType} proficiency check`, r.proficiencyCheckDue, { extra: { itemId: r.id } });
  }

  // Recurrent training (next due = explicit expiry, else completedAt + default validity).
  for (const t of pilot.trainingRecords) {
    const due = trainingDue(t);
    if (due) push('training', `${t.type}`, due, { extra: { itemId: t.id } });
  }

  // Right to work expiry.
  for (const w of pilot.rightToWork) {
    if (w.expiresAt) push('rtw', `Right to work — ${w.country}`, w.expiresAt, { extra: { itemId: w.id } });
  }

  // Order: expired first, then expiring, then due, then missing.
  const rank = { expired: 0, expiring: 1, due: 2, missing: 3 };
  items.sort((a, b) => (rank[a.level] - rank[b.level]) || ((a.days ?? 1e9) - (b.days ?? 1e9)));
  const blockers = items.filter((i) => i.blocker).length;
  return { items, blockers };
}

// Match-driving field checklist → profile strength %. These are exactly the
// fields the shared match reads (licence type, real authority, type rating,
// medical, English, right-to-work, education, logged hours).
function strengthFromContext(ctx) {
  if (!ctx) return { pct: 0, have: [], missing: [] };
  const fields = [
    { key: 'licence', label: 'Licence', done: ctx.hasCerts },
    { key: 'authority', label: 'Licence authority', done: ctx.hasAuthorities }, // 'unknown' doesn't count (normAuth drops it)
    { key: 'typeRating', label: 'Type rating', done: ctx.hasRatings },
    { key: 'medical', label: 'Medical', done: ctx.hasMedical },
    { key: 'english', label: 'English (ICAO)', done: ctx.elpLevel != null },
    { key: 'workAuth', label: 'Right to work', done: ctx.hasRtw },
    { key: 'education', label: 'Education', done: ctx.education != null },
    { key: 'hours', label: 'Logbook hours', done: (ctx.totals && ctx.totals.totalTime > 0) },
  ];
  const have = fields.filter((f) => f.done);
  const missing = fields.filter((f) => !f.done);
  return { pct: Math.round((have.length / fields.length) * 100), have: have.map((f) => f.key), missing };
}

// The SAME nudge the Jobs page shows for the "Complete your profile" (incomplete)
// group: the profile fields whose absence blocks the most otherwise-qualifying
// jobs, top 3, plus how many jobs completing them would unlock.
const NUDGE_LABEL = {
  authority: 'licence authority', licence: 'licence', medical: 'medical certificate',
  typeRating: 'type ratings', english: 'English level (ICAO)', workAuth: 'work authorisation',
  education: 'education', totalHours: 'logbook hours', picHours: 'PIC hours',
  instrumentHours: 'instrument hours', multiHours: 'multi-engine hours', turbineHours: 'turbine hours', ccHours: 'cross-country hours',
};

async function computeStrengthAndNudge(pilotId) {
  const ctx = await buildMatchContext(pilotId, prisma);
  const strength = strengthFromContext(ctx);
  if (!ctx || !ctx.matchable) return { strength, nudge: null, qualifyCount: 0, incompleteCount: 0 };

  // Match against ACTIVE jobs — same input the Jobs list uses.
  const jobs = await prisma.job.findMany({ where: { status: 'ACTIVE' } });
  let qualifyCount = 0;
  const incomplete = [];
  for (const j of jobs) {
    const m = matchJob(j, ctx);
    if (m.fitGroup === 'qualify') qualifyCount++;
    else if (m.fitGroup === 'incomplete') incomplete.push(m);
  }
  let nudge = null;
  if (incomplete.length) {
    const tally = {};
    for (const m of incomplete) for (const k of (m.unknownKeys || [])) tally[k] = (tally[k] || 0) + 1;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, n]) => ({ field: NUDGE_LABEL[k] || k, jobs: n }));
    if (top.length) nudge = { fields: top, incompleteJobs: incomplete.length };
  }
  return { strength, nudge, qualifyCount, incompleteCount: incomplete.length };
}

module.exports = { computeReadiness, computeStrengthAndNudge, trainingDue, TRAINING_VALIDITY_MONTHS };
