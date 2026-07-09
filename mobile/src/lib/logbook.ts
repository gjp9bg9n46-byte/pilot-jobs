// Logbook math — ported 1:1 from frontend/src/pages/Logbook.jsx.
// The two bug fixes that MUST be preserved:
//   - Duty block = SUM of each leg's own block time (commit 1ac8076), NOT the
//     span from the first leg's off-blocks to the last leg's on-blocks.
//   - 90-day currency is derived from a SEPARATE fetch of the most-recent 50
//     flights (commit 51bb777), so it stays correct on any page.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Log = Record<string, any>;

export function timeToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Block time in hours (2-decimal), handling midnight wrap. Returns null if either
// time is missing/invalid.
export function blockTimeFromTimes(off: string | null | undefined, on: string | null | undefined): number | null {
  const offMin = timeToMinutes(off);
  const onMin = timeToMinutes(on);
  if (offMin === null || onMin === null) return null;
  const diff = onMin >= offMin ? onMin - offMin : 1440 - offMin + onMin;
  return parseFloat((diff / 60).toFixed(2));
}

// Duty aggregate block = sum of each leg's own block time (fallback to totalTime
// when off/on missing). Returns a number of hours.
export function dutyBlockSum(legs: Log[]): number {
  return legs.reduce((s, l) => {
    const b = blockTimeFromTimes(l.offBlocksTime, l.onBlocksTime);
    return s + (b !== null ? b : (l.totalTime || 0));
  }, 0);
}

// Display block for a single log: computed block (fallback totalTime), 1-decimal + 'h'.
export function displayBlock(log: Log): string {
  const b = blockTimeFromTimes(log.offBlocksTime, log.onBlocksTime);
  if (b !== null) return `${b.toFixed(1)}h`;
  return log.totalTime > 0 ? `${log.totalTime.toFixed(1)}h` : '—';
}

// Group a page of logs into single rows + multi-leg duty rows (grouping happens
// within the current page, matching web).
export type Grouped =
  | { type: 'single'; id: string; log: Log }
  | { type: 'duty'; id: string; legs: Log[] };

export function groupRows(logs: Log[]): Grouped[] {
  const groups: Grouped[] = [];
  const seen = new Set<string>();
  for (const log of logs) {
    if (!log.dutyId) {
      groups.push({ type: 'single', id: log.id, log });
    } else if (!seen.has(log.dutyId)) {
      seen.add(log.dutyId);
      const legs = logs.filter((l) => l.dutyId === log.dutyId);
      if (legs.length === 1) groups.push({ type: 'single', id: log.id, log });
      else groups.push({ type: 'duty', id: log.dutyId, legs });
    }
  }
  return groups;
}

// 90-day currency from the most-recent logs (page-1 fetch). Universal 3-landing
// floor, matching web's simplified rule.
export function computeCurrency(recentLogs: Log[]): { dayCurrent: boolean; nightCurrent: boolean } {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  let dayLandings = 0;
  let nightLandings = 0;
  for (const log of recentLogs) {
    if (log.date && new Date(log.date) >= cutoff) {
      dayLandings += parseInt(log.landingsDay) || 0;
      nightLandings += parseInt(log.landingsNight) || 0;
    }
  }
  return { dayCurrent: dayLandings >= 3, nightCurrent: nightLandings >= 3 };
}

// Numbered page window with ellipses (ported from web pageWindow):
// ≤7 pages → all; else [1, '…', ±2 around current, '…', last].
export function pageWindow(current: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  let start = Math.max(2, current - 2);
  let end = Math.min(totalPages - 1, current + 2);
  if (current <= 4) { start = 2; end = 5; }
  if (current >= totalPages - 3) { start = totalPages - 4; end = totalPages - 1; }
  const out: (number | '…')[] = [1];
  if (start > 2) out.push('…');
  for (let p = start; p <= end; p++) out.push(p);
  if (end < totalPages - 1) out.push('…');
  out.push(totalPages);
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatLogDate(d: string | Date): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dd} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}
