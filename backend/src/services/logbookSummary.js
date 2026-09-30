'use strict';

// Shared logbook-summary computation for GET /logbook/summary (web + app).
// All derived values are computed at READ time — stored flight rows are never
// rewritten. See the Part-0 data check: this pilot's import left aircraftType,
// picTime/sicTime, multiEngine/turbine and landings blank, so those are derived
// here (type from registration, class from type) rather than read from columns.

const prisma = require('../config/database');
const logger = require('../config/logger');

// ── Time helpers ───────────────────────────────────────────────────────────
// Block time is authoritatively re-derived from the off/on-block strings when a
// row's numeric totalTime is missing/zero, matching the web row display exactly.
function timeToMinutes(s) {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
function blockFromTimes(off, on) {
  const a = timeToMinutes(off), b = timeToMinutes(on);
  if (a === null || b === null) return null;
  const diff = b >= a ? b - a : 1440 - a + b; // midnight wrap
  return diff / 60;
}
// A flight's block hours: prefer the stored total, else derive from block strings.
function blockHours(log) {
  if (log.totalTime > 0) return log.totalTime;
  const d = blockFromTimes(log.offBlocksTime, log.onBlocksTime);
  return d != null ? d : 0;
}

// ── Aircraft type → engine class ───────────────────────────────────────────
// Normalise a raw type to a family key (A320-200 → A320, B737-800 → B737).
function normaliseType(raw) {
  const t = String(raw || '').toUpperCase().trim();
  if (!t) return '';
  // Family key = first token before any variant separator: B737-800 → B737.
  return t.split(/[\s\-/]+/)[0];
}
// multi = >1 engine; turbine = jet/turboprop powerplant.
const TYPE_CLASS = {
  A319: { multi: true, turbine: true }, A320: { multi: true, turbine: true },
  A321: { multi: true, turbine: true }, A318: { multi: true, turbine: true },
  B737: { multi: true, turbine: true }, B738: { multi: true, turbine: true },
  B739: { multi: true, turbine: true }, B777: { multi: true, turbine: true },
  B787: { multi: true, turbine: true }, B747: { multi: true, turbine: true },
  E170: { multi: true, turbine: true }, E190: { multi: true, turbine: true },
  ATR72: { multi: true, turbine: true }, ATR42: { multi: true, turbine: true },
  DH8: { multi: true, turbine: true }, Q400: { multi: true, turbine: true },
  DA42: { multi: true, turbine: false }, BE76: { multi: true, turbine: false },
  PA34: { multi: true, turbine: false }, C172: { multi: false, turbine: false },
  C152: { multi: false, turbine: false }, PA28: { multi: false, turbine: false },
  DA40: { multi: false, turbine: false }, SR22: { multi: false, turbine: false },
};
function classForType(typeKey) {
  return TYPE_CLASS[typeKey] || null; // null = unknown, don't guess a class
}

// ── Registration → type (read-time heuristic) ──────────────────────────────
// aircraftType is empty in the current import, so infer the type from the
// registration. Per-operator and intentionally not general — extend as needed.
// Air Cairo (flight numbers "SM …") flies SU-B** A320-family; the import stored
// the reg truncated to its 3 trailing letters (e.g. "BPX" = SU-BPX).
const REG_TYPE_RULES = [
  { test: (reg) => /^B[A-Z]{2}$/.test(reg), type: 'A320', note: 'type inferred from registration' },
];
function typeFromRegistration(reg) {
  const r = String(reg || '').toUpperCase().trim();
  for (const rule of REG_TYPE_RULES) if (rule.test(r)) return rule;
  return null;
}
// Resolve a flight's type: stored aircraftType wins; else infer from reg.
function resolveType(log) {
  const stored = normaliseType(log.aircraftType);
  if (stored) return { type: stored, inferred: false, note: null };
  const rule = typeFromRegistration(log.registration);
  if (rule) return { type: rule.type, inferred: true, note: rule.note };
  return { type: '', inferred: false, note: null };
}

// ── Milestone ladder ───────────────────────────────────────────────────────
function buildLadder() {
  const rungs = [{ hours: 250, label: 'CPL' }, { hours: 1500, label: 'ATPL' }];
  for (let h = 2000; h <= 20000; h += 1000) rungs.push({ hours: h, label: `${h.toLocaleString()} h` });
  return rungs;
}

const round1 = (n) => Math.round(n * 10) / 10;

async function buildLogbookSummary(pilotId) {
  const [logs, pilot] = await Promise.all([
    prisma.flightLog.findMany({ where: { pilotId } }),
    prisma.pilot.findUnique({ where: { id: pilotId }, select: { carryForward: true } }),
  ]);
  const cf = (pilot && pilot.carryForward) || {};
  const cfNum = (k) => (Number.isFinite(+cf[k]) ? +cf[k] : 0);

  // Sort ascending by date for cumulative milestone crossings + months.
  const sorted = [...logs].sort((a, b) => a.date - b.date);

  // ── Totals + byType: the ONE canonical derivation (computeDerivedTotals), the
  // same values stored on Pilot.derivedTotals and read by matching. Refresh the
  // stored copy so viewing the summary self-heals any drift (best-effort). ───────
  const d = computeDerivedTotals(logs, cf);
  prisma.pilot.update({ where: { id: pilotId }, data: { derivedTotals: d } }).catch(() => {});
  const total = d.totalTime;
  const totals = {
    total: d.totalTime, pic: d.picTime, sic: d.sicTime, night: d.nightTime, ifr: d.instrumentTime,
    multiEngine: d.multiEngineTime, turbine: d.turbineTime, landings: d.landings,
    carryForward: d.carryForward, flightCount: d.flightCount, lastFlightDate: d.lastFlightDate,
    picSicSplitValid: d.picSicSplitValid,
  };
  const byType = d.byType;
  const anyLandingLogged = sorted.some((l) => (l.landingsDay || 0) + (l.landingsNight || 0) > 0);

  // Per-month hours (list section headers) — display-only, straight from flights.
  const monthMap = new Map();
  for (const log of sorted) {
    const ym = log.date.toISOString().slice(0, 7);
    if (!monthMap.has(ym)) monthMap.set(ym, { hours: 0, flights: 0 });
    const mm = monthMap.get(ym);
    mm.hours += blockHours(log);
    mm.flights += 1;
  }

  // ── Milestone ─────────────────────────────────────────────────────────────
  const ladder = buildLadder();
  const next = ladder.find((r) => r.hours > total) || null;
  const passedRungs = ladder.filter((r) => r.hours <= total);
  const currentRung = passedRungs.length ? passedRungs[passedRungs.length - 1] : null;

  // date of the flight where cumulative (incl carry-forward) first crossed each rung
  const crossingDate = (rungHours) => {
    let cum = cfNum('totalTime');
    if (cum >= rungHours) return undefined; // crossed before any logged flight → unknown
    for (const log of sorted) {
      cum += blockHours(log);
      if (cum >= rungHours) return log.date.toISOString().slice(0, 10);
    }
    return undefined;
  };
  const passed = passedRungs.map((r) => {
    const date = crossingDate(r.hours);
    return { hours: r.hours, label: r.label, ...(date ? { date } : {}) };
  });

  let jobsUnlocked = 0;
  if (next) {
    jobsUnlocked = await prisma.job.count({
      where: { status: 'ACTIVE', reqMinTotalHours: { gt: total, lte: next.hours } },
    });
  }
  const milestone = {
    current: total,
    next: next ? next.hours : null,
    remaining: next ? round1(next.hours - total) : 0,
    passed,
    jobsUnlocked,
    ...(currentRung ? { currentLabel: currentRung.label } : {}),
  };

  // ── EASA block-time limits (ORO.FTL.210) ──────────────────────────────────
  const now = Date.now();
  const DAY = 86400000;
  const d28 = now - 28 * DAY, d365 = now - 365 * DAY;
  const yearStart = new Date(new Date().getUTCFullYear(), 0, 1).getTime();
  let b28 = 0, bYear = 0, b365 = 0, flightsIn12mo = 0;
  for (const log of sorted) {
    const t = log.date.getTime();
    const block = blockHours(log);
    if (t >= d28) b28 += block;
    if (t >= yearStart) bYear += block;
    if (t >= d365) { b365 += block; flightsIn12mo += 1; }
  }
  const limits = flightsIn12mo === 0 ? null : {
    last28Days: { hours: round1(b28), limit: 100 },
    calendarYear: { hours: round1(bYear), limit: 900 },
    last12Months: { hours: round1(b365), limit: 1000 },
  };

  // ── Currency (rolling 90 days, EASA 3-in-90) ──────────────────────────────
  const d90 = now - 90 * DAY;
  const recent = sorted.filter((l) => l.date.getTime() >= d90);
  // count day / night landings in the window, newest first for the roll-out date
  const dayLdgDates = [], nightLdgDates = [];
  for (const l of recent) {
    for (let i = 0; i < (l.landingsDay || 0); i++) dayLdgDates.push(l.date);
    for (let i = 0; i < (l.landingsNight || 0); i++) nightLdgDates.push(l.date);
  }
  // currentUntil = 90 days after the flight that is the 3rd-most-recent landing
  // (when it rolls out of the window the count drops below 3).
  const currentUntil = (dates) => {
    if (dates.length < 3) return null;
    const sortedDesc = [...dates].sort((a, b) => b - a);
    const third = sortedDesc[2];
    return new Date(third.getTime() + 90 * DAY).toISOString().slice(0, 10);
  };
  const currency = {
    day: { landings: dayLdgDates.length, required: 3, currentUntil: currentUntil(dayLdgDates) },
    night: { landings: nightLdgDates.length, required: 3, currentUntil: currentUntil(nightLdgDates) },
    landingsLogged: anyLandingLogged,
  };

  // ── Months (most recent first, for list section headers) ──────────────────
  const months = [...monthMap.entries()]
    .map(([month, e]) => ({ month, hours: round1(e.hours), flights: e.flights }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));

  return { totals, byType, milestone, limits, currency, months };
}

// ── Canonical derived totals (single source for matching + the summary) ────────
// The full derivation runs once from the loaded flights (block time from off/on-
// blocks; multi-engine/turbine credited from the resolved aircraft type when the
// raw columns are blank — this is why matching credits A320 hours as ME/turbine,
// exactly as /logbook/summary shows). The result is stored on Pilot.derivedTotals
// and recomputed on every change that affects totals, so matching reads ONE field
// instead of loading every flight on each /jobs request. Pure — no I/O.
function computeDerivedTotals(logs, cf) {
  const cfNum = (k) => (Number.isFinite(+((cf || {})[k])) ? +cf[k] : 0);
  let total = 0, pic = 0, sic = 0, night = 0, ifr = 0, cc = 0, multi = 0, turbine = 0, landings = 0;
  let lastDate = null;
  const byTypeMap = new Map();
  for (const log of logs) {
    const block = blockHours(log);
    total += block; pic += log.picTime || 0; sic += log.sicTime || 0;
    night += log.nightTime || 0; ifr += log.instrumentTime || 0; cc += log.crossCountryTime || 0;
    landings += (log.landingsDay || 0) + (log.landingsNight || 0);
    const { type, inferred } = resolveType(log);
    const cls = classForType(type);
    multi += (log.multiEngineTime > 0) ? log.multiEngineTime : (cls && cls.multi ? block : 0);
    turbine += (log.turbineTime > 0) ? log.turbineTime : (cls && cls.turbine ? block : 0);
    if (type) {
      if (!byTypeMap.has(type)) byTypeMap.set(type, { hours: 0, regs: new Set(), inferred });
      const e = byTypeMap.get(type); e.hours += block;
      if (log.registration) e.regs.add(log.registration);
      if (inferred) e.inferred = true;
    }
    if (!lastDate || log.date > lastDate) lastDate = log.date;
  }
  const T = round1(total + cfNum('totalTime'));
  const P = round1(pic + cfNum('picTime'));
  const S = round1(sic + cfNum('sicTime'));
  const byType = [...byTypeMap.entries()]
    .map(([type, e]) => ({ type, hours: round1(e.hours), regs: [...e.regs].sort(), ...(e.inferred ? { note: 'type inferred from registration' } : {}) }))
    .sort((a, b) => b.hours - a.hours);
  return {
    totalTime: T, picTime: P, sicTime: S,
    nightTime: round1(night + cfNum('nightTime')),
    instrumentTime: round1(ifr + cfNum('instrumentTime')),
    crossCountryTime: round1(cc + cfNum('crossCountryTime')),
    multiEngineTime: round1(multi + cfNum('multiEngineTime')),
    turbineTime: round1(turbine + cfNum('turbineTime')),
    landings: landings + cfNum('landingsDay') + cfNum('landingsNight'),
    carryForward: round1(cfNum('totalTime')),
    flightCount: logs.length,
    lastFlightDate: lastDate ? lastDate.toISOString().slice(0, 10) : null,
    picSicSplitValid: T > 0 && (P + S) <= T * 1.05 && (P + S) >= T * 0.5,
    byType,
  };
}

// Recompute from the DB and store on Pilot.derivedTotals. Call after any change
// that affects totals (flight add/edit/delete, import, carry-forward, type edit).
async function recomputeDerivedTotals(pilotId) {
  const [logs, pilot] = await Promise.all([
    prisma.flightLog.findMany({ where: { pilotId } }),
    prisma.pilot.findUnique({ where: { id: pilotId }, select: { carryForward: true } }),
  ]);
  const d = computeDerivedTotals(logs, (pilot && pilot.carryForward) || {});
  await prisma.pilot.update({ where: { id: pilotId }, data: { derivedTotals: d } });
  return d;
}

// Read the stored totals; self-heal (backfill) if a pilot has none yet.
async function getStoredTotals(pilotId) {
  const p = await prisma.pilot.findUnique({ where: { id: pilotId }, select: { derivedTotals: true } });
  if (p && p.derivedTotals) return p.derivedTotals;
  return recomputeDerivedTotals(pilotId);
}

// Job-match shape (the 8 hour fields matchJob reads) — from the stored totals.
async function getMatchTotals(pilotId) {
  const d = await getStoredTotals(pilotId);
  return {
    totalTime: d.totalTime || 0, picTime: d.picTime || 0, sicTime: d.sicTime || 0,
    multiEngineTime: d.multiEngineTime || 0, turbineTime: d.turbineTime || 0,
    instrumentTime: d.instrumentTime || 0, crossCountryTime: d.crossCountryTime || 0, nightTime: d.nightTime || 0,
  };
}

const AUDIT_KEYS = ['totalTime', 'picTime', 'sicTime', 'multiEngineTime', 'turbineTime', 'instrumentTime', 'crossCountryTime', 'nightTime', 'landings', 'flightCount'];
function totalsDiffer(a, b) {
  return AUDIT_KEYS.some((k) => Math.round((Number(a?.[k]) || 0) * 10) !== Math.round((Number(b?.[k]) || 0) * 10));
}

// One-off backfill: store derivedTotals for pilots that have none yet. Run at
// startup so a fresh deploy populates everyone; a no-op once all are filled.
async function backfillMissingDerivedTotals() {
  const pilots = await prisma.pilot.findMany({ where: { deletedAt: null, derivedTotals: { equals: null } }, select: { id: true } });
  for (const p of pilots) { try { await recomputeDerivedTotals(p.id); } catch (err) { logger.error({ source: 'TOTALS-BACKFILL', pilotId: p.id, err: err.message }); } }
  if (pilots.length) logger.info({ source: 'TOTALS-BACKFILL', filled: pilots.length, msg: 'derivedTotals backfilled' });
  return { filled: pilots.length };
}

// Nightly: recompute every pilot's totals and log + FIX any that drifted from the
// stored value (a missed recompute hook, a manual DB edit, a logic change).
async function auditAllDerivedTotals() {
  const pilots = await prisma.pilot.findMany({ where: { deletedAt: null }, select: { id: true, derivedTotals: true } });
  let checked = 0, drifted = 0;
  for (const p of pilots) {
    checked++;
    try {
      const [logs, pl] = await Promise.all([
        prisma.flightLog.findMany({ where: { pilotId: p.id } }),
        prisma.pilot.findUnique({ where: { id: p.id }, select: { carryForward: true } }),
      ]);
      const fresh = computeDerivedTotals(logs, (pl && pl.carryForward) || {});
      if (totalsDiffer(p.derivedTotals, fresh)) {
        drifted++;
        logger.warn({ source: 'TOTALS-AUDIT', pilotId: p.id, msg: 'derivedTotals drift — fixing', storedTotal: p.derivedTotals?.totalTime ?? null, freshTotal: fresh.totalTime });
        await prisma.pilot.update({ where: { id: p.id }, data: { derivedTotals: fresh } });
      }
    } catch (err) { logger.error({ source: 'TOTALS-AUDIT', pilotId: p.id, err: err.message }); }
  }
  logger.info({ source: 'TOTALS-AUDIT', checked, drifted, msg: 'nightly derived-totals audit complete' });
  return { checked, drifted };
}

// Display type for a flight-log row: stored aircraftType, else inferred from
// registration (read-time; nothing stored). Shared by the list endpoint so the
// Aircraft column can show a type even when the import left aircraftType blank.
function displayTypeFor(log) {
  return resolveType(log).type || '';
}

module.exports = {
  buildLogbookSummary,
  getMatchTotals,
  recomputeDerivedTotals,
  getStoredTotals,
  computeDerivedTotals,
  backfillMissingDerivedTotals,
  auditAllDerivedTotals,
  displayTypeFor,
  // exported for unit tests
  _internals: { blockFromTimes, normaliseType, classForType, typeFromRegistration, resolveType, buildLadder },
};
