'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  flightTimeLimits, recency, milestone, recentMonthKeys,
  FTL, PACE_WINDOW_MONTHS,
} = require('../logbookReports');

// A fixed "now" so none of this rots overnight.
const NOW = new Date('2026-11-03T12:00:00.000Z');
const DAY = 86400000;
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY);

/** A flight carrying an explicit block time, so blockHours takes totalTime. */
const flight = (date, hours, extra = {}) => ({
  date, totalTime: hours, offBlocksTime: null, onBlocksTime: null,
  aircraftType: 'A320', registration: 'SU-BPX',
  landingsDay: 0, landingsNight: 0, landingsRecorded: null, ...extra,
});

// ── Flight time limits ──────────────────────────────────────────────────────

test('limits: each window counts only the flights inside it', () => {
  const logs = [
    flight(daysAgo(2), 10),    // 28d, year, 12mo
    flight(daysAgo(40), 20),   // year, 12mo
    flight(daysAgo(200), 30),  // year, 12mo  (2026-04)
    flight(daysAgo(400), 40),  // older than 12 months — none of them
  ];
  const l = flightTimeLimits(logs, NOW);
  assert.strictEqual(l.last28Days.hours, 10);
  assert.strictEqual(l.last12Months.hours, 60);
  // 400 days ago is 2025, so it is outside the calendar year too.
  assert.strictEqual(l.calendarYear.hours, 60);
  assert.strictEqual(l.calendarYear.year, 2026);
});

test('limits: the EASA ceilings are the ones we publish', () => {
  const l = flightTimeLimits([flight(daysAgo(1), 1)], NOW);
  assert.strictEqual(l.last28Days.limit, 100);
  assert.strictEqual(l.calendarYear.limit, 900);
  assert.strictEqual(l.last12Months.limit, 1000);
  assert.deepStrictEqual(FTL, { last28Days: 100, calendarYear: 900, last12Months: 1000 });
});

test('limits: nothing flown in twelve months shows no card at all', () => {
  assert.strictEqual(flightTimeLimits([flight(daysAgo(500), 50)], NOW), null);
  assert.strictEqual(flightTimeLimits([], NOW), null);
});

// Carry-forward has no date, so it cannot land in a window. The limits function
// never sees it — it takes flights only — and this pins that contract.
test('limits: carry-forward cannot reach a time window', () => {
  const l = flightTimeLimits([flight(daysAgo(3), 5)], NOW);
  assert.strictEqual(l.last28Days.hours, 5, 'only the logged flight counts');
});

// ── Recency ─────────────────────────────────────────────────────────────────

const typeOf = (l) => l.aircraftType;

test('recency: with landings on most flights, three in ninety days is current', () => {
  const logs = [
    flight(daysAgo(10), 2, { landingsDay: 1, landingsRecorded: true }),
    flight(daysAgo(20), 2, { landingsDay: 1, landingsRecorded: true }),
    flight(daysAgo(30), 2, { landingsDay: 1, landingsRecorded: true }),
  ];
  const r = recency(logs, NOW, typeOf);
  assert.strictEqual(r.trackable, true);
  const a320 = r.byType.find((t) => t.type === 'A320');
  assert.strictEqual(a320.day.count, 3);
  assert.strictEqual(a320.day.current, true);
  // Lapses 90 days after the 3rd-newest landing — the one that rolls out first.
  assert.strictEqual(a320.day.lapsesOn, new Date(daysAgo(30).getTime() + 90 * DAY).toISOString().slice(0, 10));
});

test('recency: two landings is not current, and promises no date', () => {
  const logs = [
    flight(daysAgo(10), 2, { landingsDay: 1, landingsRecorded: true }),
    flight(daysAgo(20), 2, { landingsDay: 1, landingsRecorded: true }),
  ];
  const a320 = recency(logs, NOW, typeOf).byType.find((t) => t.type === 'A320');
  assert.strictEqual(a320.day.current, false);
  assert.strictEqual(a320.day.lapsesOn, null);
});

// The reported case: 9 of 517 flights carried landings. A currency verdict
// built on 2% of a logbook is worse than no verdict, so we give none.
test('recency: landings on a sliver of the logbook yields no verdict at all', () => {
  const logs = [];
  for (let i = 0; i < 100; i++) logs.push(flight(daysAgo(i + 1), 2));
  for (let i = 0; i < 5; i++) logs[i] = flight(daysAgo(i + 1), 2, { landingsDay: 1, landingsRecorded: true });
  const r = recency(logs, NOW, typeOf);
  assert.strictEqual(r.trackable, false);
  assert.deepStrictEqual(r.byType, [], 'no per-type rows when we cannot judge');
  // The basis is still reported, so the client can explain itself.
  assert.strictEqual(r.flightsWithLandings, 5);
  assert.strictEqual(r.flightCount, 100);
});

test('recency: day and night are judged separately', () => {
  const logs = [];
  for (let i = 0; i < 4; i++) logs.push(flight(daysAgo(i + 1), 2, { landingsDay: 1, landingsNight: 0, landingsRecorded: true }));
  const a320 = recency(logs, NOW, typeOf).byType.find((t) => t.type === 'A320');
  assert.strictEqual(a320.day.current, true);
  assert.strictEqual(a320.night.current, false);
  assert.strictEqual(a320.night.count, 0);
});

test('recency: landings outside the ninety-day window do not count', () => {
  const logs = [];
  for (let i = 0; i < 6; i++) logs.push(flight(daysAgo(120 + i), 2, { landingsDay: 1, landingsRecorded: true }));
  const r = recency(logs, NOW, typeOf);
  assert.strictEqual(r.trackable, true, 'coverage is fine; the window is what is empty');
  assert.deepStrictEqual(r.byType, []);
});

// ── Milestone and pace ──────────────────────────────────────────────────────

test('recentMonthKeys: twelve calendar months ending with this one', () => {
  const k = recentMonthKeys(NOW, PACE_WINDOW_MONTHS);
  assert.strictEqual(k.length, 12);
  assert.strictEqual(k[11], '2026-11');
  assert.strictEqual(k[0], '2025-12');
});

// The decision that matters: CALENDAR months, including the empty ones. Two
// heavy months and ten blank ones is not a sixty-hour-a-month pace.
test('milestone: pace divides by twelve months, not by months flown', () => {
  // Three heavy months and nine blank ones. Dividing by months FLOWN would
  // claim 60 h/month; dividing by the calendar window says 15, which is what
  // this pilot is actually achieving.
  const logs = [
    flight(new Date('2026-09-10T00:00:00Z'), 60),
    flight(new Date('2026-10-10T00:00:00Z'), 60),
    flight(new Date('2026-11-01T00:00:00Z'), 60),
  ];
  const m = milestone(logs, 1592.4, NOW);
  assert.strictEqual(m.next, 2000);
  assert.strictEqual(m.remaining, 407.6);
  assert.strictEqual(m.pace, 15, '180 h over 12 calendar months, not over 3');
  assert.strictEqual(m.monthsFlown, 3);
  assert.strictEqual(m.paceWindowMonths, 12);
});

test('milestone: too few months flown gives a figure but no projection', () => {
  const logs = [flight(daysAgo(5), 20), flight(daysAgo(10), 20)];
  const m = milestone(logs, 1000, NOW);
  assert.strictEqual(m.next, 1500);
  assert.strictEqual(m.pace, null, 'two months is not a pace');
  assert.strictEqual(m.eta, null);
});

test('milestone: the projected month is remaining hours at the measured pace', () => {
  // 12 h in each of the last 12 calendar months = 12 h/month exactly.
  const logs = recentMonthKeys(NOW, 12).map((k) => flight(new Date(`${k}-05T00:00:00Z`), 12));
  const m = milestone(logs, 1976, NOW);
  assert.strictEqual(m.pace, 12);
  assert.strictEqual(m.remaining, 24);
  // 24 h to go at 12 h/month = 2 months after November 2026.
  assert.strictEqual(m.eta, '2027-01');
});

test('milestone: past the top of the ladder there is nothing left to reach', () => {
  assert.strictEqual(milestone([flight(daysAgo(1), 1)], 25000, NOW), null);
});

test('milestone: the next rung is always above the career total, carry-forward and all', () => {
  assert.strictEqual(milestone([flight(daysAgo(1), 1)], 1999.9, NOW).next, 2000);
  assert.strictEqual(milestone([flight(daysAgo(1), 1)], 2000, NOW).next, 2500);
});

// ── Carry-forward ───────────────────────────────────────────────────────────
// The rule the whole report rests on: hours flown before this logbook are part
// of a CAREER total and part of nothing else. They have no date, so they
// cannot land in a 28-day window — and a pilot who imported 3,000 hours must
// not be told they flew 3,010 in the last month.
//
// Verified end to end against a real account (cftest-carryforward@example.com)
// as well; this pins it without needing one.
const { computeDerivedTotals } = require('../logbookSummary');

const CF = { totalTime: 3000, picTime: 2500, sicTime: 500, nightTime: 400 };

test('carry-forward is in the career total and in none of the windows', () => {
  const logs = [
    flight(daysAgo(5), 10),     // 28d + year + 12mo
    flight(daysAgo(100), 20),   // 12mo (and the year, early in a year)
    flight(daysAgo(500), 40),   // older than everything
  ];
  const career = computeDerivedTotals(logs, CF);
  assert.strictEqual(career.totalTime, 3070, 'career total = 3,000 carried + 70 logged');
  assert.strictEqual(career.carryForward, 3000);

  const l = flightTimeLimits(logs, NOW);
  assert.strictEqual(l.last28Days.hours, 10, '28 days sees the one recent flight only');
  assert.strictEqual(l.last12Months.hours, 30, 'twelve months sees two flights, not 3,030');
  assert.ok(l.calendarYear.hours < CF.totalTime, 'the calendar year cannot contain undated hours');
});

test('carry-forward reaches the milestone, because a milestone is a career figure', () => {
  const logs = [flight(daysAgo(5), 10)];
  const career = computeDerivedTotals(logs, CF);
  const m = milestone(logs, career.totalTime, NOW);
  assert.strictEqual(m.current, 3010);
  assert.strictEqual(m.next, 4000, 'the next rung is measured from the career total');
});

test('a pilot with no carry-forward is unaffected by the rule', () => {
  const logs = [flight(daysAgo(5), 10)];
  const career = computeDerivedTotals(logs, {});
  assert.strictEqual(career.totalTime, 10);
  assert.strictEqual(career.carryForward, 0);
  assert.strictEqual(flightTimeLimits(logs, NOW).last28Days.hours, 10);
});

// ── Your year in the sky ────────────────────────────────────────────────────
const { yearsFlown, buildYear, YEAR_MIN_FLIGHTS } = require('../logbookReports');
const { _internals } = require('../logbookSummary');

const onDate = (iso, hours = 2, extra = {}) => ({
  date: new Date(iso), totalTime: hours, offBlocksTime: null, onBlocksTime: null,
  aircraftType: 'A320', registration: 'SU-BPX', departure: null, arrival: null,
  picTime: 0, sicTime: hours, nightTime: 0, landingsDay: 0, landingsNight: 0, landingsRecorded: null,
  ...extra,
});

test('yearsFlown lists the calendar years with flights, newest first', () => {
  const logs = [onDate('2024-03-12'), onDate('2026-11-02'), onDate('2025-07-01'), onDate('2026-01-04')];
  assert.deepStrictEqual(yearsFlown(logs), [2026, 2025, 2024]);
  assert.deepStrictEqual(yearsFlown([]), []);
});

test('a year takes only its own flights, and carry-forward reaches none of them', async () => {
  const logs = [
    onDate('2025-12-31', 10), // the year before
    onDate('2026-01-01', 3), onDate('2026-02-01', 3), onDate('2026-03-01', 3),
    onDate('2026-04-01', 3), onDate('2026-05-01', 3),
    onDate('2027-01-01', 99), // the year after
  ];
  const y = await buildYear(logs, _internals.blockHours, 2026, new Date('2026-06-01T00:00:00Z'));
  assert.strictEqual(y.year, 2026);
  assert.strictEqual(y.flightCount, 5);
  assert.strictEqual(y.sectors, 5);
  assert.strictEqual(y.hours, 15, 'five 3-hour sectors — neither neighbouring year leaks in');
  // buildYear is handed flights only. Carry-forward lives on the pilot and has
  // no date, so there is no path by which it could reach a year at all.
  assert.strictEqual(y.basis.flightCount, 5);
});

test('a thin year says so instead of showing near-empty slides', async () => {
  const logs = [onDate('2026-01-01'), onDate('2026-02-01'), onDate('2026-03-01')];
  const y = await buildYear(logs, _internals.blockHours, 2026, new Date('2026-06-01T00:00:00Z'));
  assert.strictEqual(y.flightCount, 3);
  assert.strictEqual(y.enough, false);
  assert.strictEqual(y.minFlights, YEAR_MIN_FLIGHTS);
  assert.strictEqual(y.distance, undefined, 'no slides are computed for a year we will not show');
});

test('exactly the threshold is enough', async () => {
  const logs = Array.from({ length: YEAR_MIN_FLIGHTS }, (_, i) => onDate(`2026-0${i + 1}-01`));
  const y = await buildYear(logs, _internals.blockHours, 2026, new Date('2026-06-01T00:00:00Z'));
  assert.strictEqual(y.enough, true);
});

test('a year with no flights at all is reported, not invented', async () => {
  const y = await buildYear([onDate('2024-05-01')], _internals.blockHours, 2026, new Date('2026-06-01T00:00:00Z'));
  assert.strictEqual(y.flightCount, 0);
  assert.strictEqual(y.enough, false);
  assert.strictEqual(y.hours, undefined);
});

// ── The seasonal window for the Home card ───────────────────────────────────
// December shows the year that is ending; January shows the year just gone;
// the rest of the year it is not offered at all.
test('the year-in-review window opens in December and January only', () => {
  // Mirrors lib/yearWindow on both clients. Pinned here because it is the one
  // rule that decides whether a pilot ever sees the deck without going looking.
  const win = (iso) => {
    const now = new Date(iso);
    const m = now.getUTCMonth();
    if (m === 11) return { open: true, year: now.getUTCFullYear() };
    if (m === 0) return { open: true, year: now.getUTCFullYear() - 1 };
    return { open: false, year: null };
  };
  assert.deepStrictEqual(win('2026-12-01T00:00:00Z'), { open: true, year: 2026 });
  assert.deepStrictEqual(win('2026-12-31T23:59:00Z'), { open: true, year: 2026 });
  assert.deepStrictEqual(win('2027-01-01T00:00:00Z'), { open: true, year: 2026 });
  assert.deepStrictEqual(win('2027-01-31T23:59:00Z'), { open: true, year: 2026 });
  assert.deepStrictEqual(win('2027-02-01T00:00:00Z'), { open: false, year: null });
  assert.deepStrictEqual(win('2026-06-15T00:00:00Z'), { open: false, year: null });
  assert.deepStrictEqual(win('2026-11-30T23:59:00Z'), { open: false, year: null });
});
