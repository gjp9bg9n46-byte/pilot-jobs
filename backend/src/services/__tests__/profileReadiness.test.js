'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { calendarDaysUntil } = require('../profileReadiness');

// The readiness "N days left" must be WHOLE CALENDAR days and stable through the
// day — not millisecond rounding that flips 31→30 as the clock advances. Both web
// and app render this one value, so it must be deterministic for a given date.
test('calendarDaysUntil: 1 Oct → 1 Nov is exactly 31, regardless of time of day', () => {
  const expiry = '2026-11-01T00:00:00.000Z';
  for (const hour of [0, 6, 12, 18, 23]) {
    const now = new Date(`2026-10-01T${String(hour).padStart(2, '0')}:30:00.000Z`);
    assert.strictEqual(calendarDaysUntil(expiry, now), 31, `hour ${hour} should still be 31`);
  }
});

test('calendarDaysUntil: same calendar day = 0 (expires today, not expired)', () => {
  const now = new Date('2026-10-01T09:00:00.000Z');
  assert.strictEqual(calendarDaysUntil('2026-10-01T23:59:00.000Z', now), 0);
  assert.strictEqual(calendarDaysUntil('2026-10-01T00:01:00.000Z', now), 0);
});

test('calendarDaysUntil: past date is negative (expired)', () => {
  const now = new Date('2026-10-01T09:00:00.000Z');
  assert.strictEqual(calendarDaysUntil('2026-09-30T00:00:00.000Z', now), -1);
  assert.strictEqual(calendarDaysUntil('2025-11-06T00:00:00.000Z', now), -329);
});

test('calendarDaysUntil: null / invalid → null', () => {
  assert.strictEqual(calendarDaysUntil(null), null);
  assert.strictEqual(calendarDaysUntil(''), null);
  assert.strictEqual(calendarDaysUntil('not-a-date'), null);
});

// ── English (ICAO) is a hard bar, like a licence or a medical ─────────────────
// Expired → red + dashboard blocker; expiring within 60 days → amber; beyond
// that → no item at all. The 60-day window is narrower than the 90-day default
// because renewing an ELP means booking a test. `now` is injected so these
// thresholds stay deterministic — a clock-relative test would rot overnight.
const { statusFor, ELP_DUE_DAYS, DEFAULT_DUE_DAYS } = require('../profileReadiness');

const NOW = new Date('2026-10-07T09:00:00.000Z');
const inDays = (d) => new Date(Date.UTC(2026, 9, 7 + d)).toISOString();
const elpStatus = (d) => statusFor(d, { dueDays: ELP_DUE_DAYS, now: NOW });

test('ELP thresholds: expired → red, ≤7d → red, ≤60d → amber, >60d → ok', () => {
  assert.strictEqual(ELP_DUE_DAYS, 60);
  assert.strictEqual(DEFAULT_DUE_DAYS, 90);
  assert.strictEqual(elpStatus(null).level, 'missing');
  assert.strictEqual(elpStatus(inDays(-1)).level, 'expired');
  assert.strictEqual(elpStatus(inDays(-329)).level, 'expired');
  assert.strictEqual(elpStatus(inDays(0)).level, 'expiring');  // expires today
  assert.strictEqual(elpStatus(inDays(7)).level, 'expiring');  // ≤7 days is red for every blocker
  assert.strictEqual(elpStatus(inDays(8)).level, 'due');       // amber starts here
  assert.strictEqual(elpStatus(inDays(60)).level, 'due');      // boundary: still amber
  assert.strictEqual(elpStatus(inDays(61)).level, 'ok');       // outside the window → no item
});

test('the ELP window is narrower than the default: day 75 is amber by default, ok for an ELP', () => {
  assert.strictEqual(statusFor(inDays(75), { now: NOW }).level, 'due');
  assert.strictEqual(elpStatus(inDays(75)).level, 'ok');
});

// ── A superseded licence must not ask for an authority ───────────────────────
// Reported from the app: a pilot holding an ATPL with its authority already set
// was still shown "Pick your licence authority". The per-licence loop skipped
// superseded licences correctly, but the authority check re-filtered the FULL
// list, so an old PPL left at "unknown" by the ICAO migration kept raising it.
// The two now share one definition; these pin that they agree.
const { selectActiveLicences, needsAuthorityPrompt } = require('../profileReadiness');

const lic = (type, issuingAuthority = 'EASA') => ({ id: `${type}-1`, type, issuingAuthority, expiryDate: null });

test('selectActiveLicences: the highest licence supersedes the lower ones', () => {
  const { active, hasAny } = selectActiveLicences([lic('PPL'), lic('ATPL'), lic('CPL')]);
  assert.strictEqual(hasAny, true);
  assert.deepStrictEqual(active.map((c) => c.type), ['ATPL']);
});

test('selectActiveLicences: ratings are not licences, and no licence is no licence', () => {
  assert.strictEqual(selectActiveLicences([{ type: 'ELP' }, { type: 'IR' }, { type: 'ME' }]).hasAny, false);
  assert.strictEqual(selectActiveLicences([]).hasAny, false);
  assert.strictEqual(selectActiveLicences(undefined).hasAny, false);
});

test('a superseded licence with authority "unknown" does NOT raise the prompt', () => {
  // The exact reported shape: current ATPL is set, an old PPL never was.
  assert.strictEqual(needsAuthorityPrompt([lic('ATPL', 'EASA'), lic('PPL', 'unknown')]), false);
});

test('the ACTIVE licence with authority "unknown" DOES raise the prompt', () => {
  assert.strictEqual(needsAuthorityPrompt([lic('ATPL', 'unknown'), lic('PPL', 'EASA')]), true);
  // Case and null are both "not set".
  assert.strictEqual(needsAuthorityPrompt([lic('ATPL', 'UNKNOWN')]), true);
  assert.strictEqual(needsAuthorityPrompt([lic('ATPL', null)]), false);
});

test('same-rank licences are both active, so either can raise the prompt', () => {
  const two = [lic('ATPL', 'EASA'), lic('ATPL', 'unknown')];
  assert.strictEqual(selectActiveLicences(two).active.length, 2);
  assert.strictEqual(needsAuthorityPrompt(two), true);
});
