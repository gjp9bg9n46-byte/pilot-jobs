'use strict';

// Shared logbook-summary computation for GET /logbook/summary (web + app).
// All derived values are computed at READ time — stored flight rows are never
// rewritten. See the Part-0 data check: this pilot's import left aircraftType,
// picTime/sicTime, multiEngine/turbine and landings blank, so those are derived
// here (type from registration, class from type) rather than read from columns.

const prisma = require('../config/database');

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

  // ── Per-flight derivation + accumulation ──────────────────────────────────
  let loggedTotal = 0, loggedPic = 0, loggedSic = 0, loggedNight = 0, loggedIfr = 0;
  let derivedMulti = 0, derivedTurbine = 0, loggedLandings = 0;
  let anyLandingLogged = false;
  const byTypeMap = new Map();   // typeKey -> { hours, regs:Set, inferred }
  const monthMap = new Map();    // 'YYYY-MM' -> { hours, flights }

  for (const log of sorted) {
    const block = blockHours(log);
    loggedTotal += block;
    loggedPic += log.picTime || 0;
    loggedSic += log.sicTime || 0;
    loggedNight += log.nightTime || 0;
    loggedIfr += log.instrumentTime || 0;
    const ldg = (log.landingsDay || 0) + (log.landingsNight || 0);
    loggedLandings += ldg;
    if (ldg > 0) anyLandingLogged = true;

    const { type, inferred } = resolveType(log);
    const cls = classForType(type);
    // Multi/turbine: stored hours win; else count this flight's block if its
    // resolved type is in that class.
    derivedMulti += (log.multiEngineTime > 0) ? log.multiEngineTime : (cls && cls.multi ? block : 0);
    derivedTurbine += (log.turbineTime > 0) ? log.turbineTime : (cls && cls.turbine ? block : 0);

    if (type) {
      if (!byTypeMap.has(type)) byTypeMap.set(type, { hours: 0, regs: new Set(), inferred });
      const e = byTypeMap.get(type);
      e.hours += block;
      if (log.registration) e.regs.add(log.registration);
      if (inferred) e.inferred = true;
    }

    const ym = log.date.toISOString().slice(0, 7);
    if (!monthMap.has(ym)) monthMap.set(ym, { hours: 0, flights: 0 });
    const mm = monthMap.get(ym);
    mm.hours += block;
    mm.flights += 1;
  }

  // ── Totals (carry-forward added once, all-time only) ──────────────────────
  const total = round1(loggedTotal + cfNum('totalTime'));
  const pic = round1(loggedPic + cfNum('picTime'));
  const sic = round1(loggedSic + cfNum('sicTime'));
  const night = round1(loggedNight + cfNum('nightTime'));
  const ifr = round1(loggedIfr + cfNum('instrumentTime'));
  const multiEngine = round1(derivedMulti + cfNum('multiEngineTime'));
  const turbine = round1(derivedTurbine + cfNum('turbineTime'));
  const landings = loggedLandings + cfNum('landingsDay') + cfNum('landingsNight');
  const carryForward = round1(cfNum('totalTime'));

  // PIC/SIC split is only trustworthy when pic+sic ≈ total. This pilot's
  // carry-forward has pic 1500 AND sic 1500 vs a ~1515 total → invalid, hide it.
  const picSicSplitValid = total > 0 && (pic + sic) <= total * 1.05 && (pic + sic) >= total * 0.5;

  const lastFlightDate = sorted.length ? sorted[sorted.length - 1].date.toISOString().slice(0, 10) : null;

  const totals = {
    total, pic, sic, night, ifr, multiEngine, turbine, landings,
    carryForward, flightCount: logs.length, lastFlightDate, picSicSplitValid,
  };

  // ── byType ────────────────────────────────────────────────────────────────
  const byType = [...byTypeMap.entries()]
    .map(([type, e]) => ({
      type, hours: round1(e.hours), regs: [...e.regs].sort(),
      ...(e.inferred ? { note: 'type inferred from registration' } : {}),
    }))
    .sort((a, b) => b.hours - a.hours);

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

// Display type for a flight-log row: stored aircraftType, else inferred from
// registration (read-time; nothing stored). Shared by the list endpoint so the
// Aircraft column can show a type even when the import left aircraftType blank.
function displayTypeFor(log) {
  return resolveType(log).type || '';
}

module.exports = {
  buildLogbookSummary,
  displayTypeFor,
  // exported for unit tests
  _internals: { blockFromTimes, normaliseType, classForType, typeFromRegistration, resolveType, buildLadder },
};
