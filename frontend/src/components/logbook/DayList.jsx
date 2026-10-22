import React from 'react';
import { groupBy, duration, findOverlaps, overlapLabel, overnightReturnOf } from '../../lib/logbookFormat';
import FlightRow from './FlightRow';

/**
 * Sectors grouped by month (the default) or by day, so a CAI–HRG–CAI rotation
 * reads as one block with its total beside it.
 *
 * A sector belongs to the date it pushed back on and is never split: a leg that
 * lands after midnight shows "+1" on its arrival, and the return that follows
 * the next morning says where it came from, so an overnight trip reads as one
 * thing across two days instead of two orphans.
 */
export default function DayList({ logs, timeFormat, grouping = 'month', onOpen }) {
  const groups = groupBy(logs || [], grouping);
  // Two flights cannot be in the air at once; where they are, both say so.
  const overlaps = findOverlaps(logs || []);
  if (!groups.length) return null;
  return (
    <div>
      {groups.map((g) => (
        <section key={g.date}>
          <div className="lb-day"><span>{g.label}</span><span className="mono">{duration(g.hours, timeFormat)}</span></div>
          {g.flights.map((f) => (
            <FlightRow
              key={f.id}
              log={f}
              timeFormat={timeFormat}
              overnightFrom={overnightReturnOf(f, logs)}
              overlap={overlaps.has(f.id) ? overlapLabel(overlaps.get(f.id)) : null}
              onOpen={onOpen}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
