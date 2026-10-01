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
