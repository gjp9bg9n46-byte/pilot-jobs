// Logbook durations, written the way the pilot asked for them.
//
// hh:mm is what a voyage report and most airline logbooks use; decimal is what
// an application form asks for. The choice is stored per pilot, so both
// platforms show the same thing — these helpers are the only place it is applied.

export function hoursToHHMM(hours) {
  const total = Math.round((Number(hours) || 0) * 60);
  const sign = total < 0 ? '-' : '';
  const abs = Math.abs(total);
  return `${sign}${Math.floor(abs / 60).toLocaleString()}:${String(abs % 60).padStart(2, '0')}`;
}

export function minutesToHHMM(minutes) {
  if (minutes == null) return '—';
  return hoursToHHMM(minutes / 60);
}

export function hoursToDecimal(hours) {
  return (Number(hours) || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// One entry point: format a duration in hours per the pilot's setting.
export function duration(hours, format) {
  return format === 'decimal' ? hoursToDecimal(hours) : hoursToHHMM(hours);
}

// "HHMM" / "HH:MM" → minutes, mirroring the server's parser.
export function timeToMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

// Block/airborne as the server derives them: one midnight crossing allowed.
export function spanMinutes(from, to) {
  const a = timeToMinutes(from);
  const b = timeToMinutes(to);
  if (a == null || b == null) return null;
  return b >= a ? b - a : b + 1440 - a;
}

const DAY_FMT = { weekday: 'short', day: 'numeric', month: 'short' };

// Sectors grouped by the day they were flown, newest first — a CAI–HRG–CAI
// rotation reads as one block, as on the mockup.
export function groupByDay(logs) {
  const days = new Map();
  for (const log of logs) {
    const key = String(log.date).slice(0, 10);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(log);
  }
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, flights]) => ({
      date,
      label: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { ...DAY_FMT, timeZone: 'UTC' }),
      hours: flights.reduce((n, f) => n + (Number(f.totalTime) || 0), 0),
      flights: [...flights].sort((a, b) => String(a.offBlocksTime || '').localeCompare(String(b.offBlocksTime || ''))),
    }));
}

// "Oldest drops 2 Dec" — the day the 90-day window loses the third landing,
// which is the day currency lapses.
export function dropOffLabel(currentUntil) {
  if (!currentUntil) return null;
  return new Date(`${currentUntil}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
