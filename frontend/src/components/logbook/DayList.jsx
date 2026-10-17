import React from 'react';
import { Moon } from 'lucide-react';
import { groupByDay, duration, landsNextDay, overnightReturnOf } from '../../lib/logbookFormat';

/**
 * Sectors grouped by the day they were flown, so a CAI–HRG–CAI rotation reads
 * as one block with the day's total beside it.
 *
 * A sector belongs to the date it pushed back on and is never split: a leg that
 * lands after midnight shows "+1" on its arrival, and the return that follows
 * the next morning says where it came from, so an overnight trip reads as one
 * thing across two days instead of two orphans.
 */
export default function DayList({ logs, timeFormat, onOpen }) {
  const days = groupByDay(logs || []);
  if (!days.length) return null;
  return (
    <div>
      {days.map((day) => (
        <section key={day.date}>
          <div className="lb-day"><span>{day.label}</span><span className="mono">{duration(day.hours, timeFormat)}</span></div>
          <div className="lb-pair">
            {day.flights.map((f) => {
              const type = f.displayType || f.aircraftType;
              const nextDay = landsNextDay(f.offBlocksTime, f.onBlocksTime);
              const from = overnightReturnOf(f, logs);
              return (
                <button type="button" key={f.id} className="lb-leg" onClick={() => onOpen(f)}>
                  <span>
                    <b>{f.departure || '—'} → {f.arrival || '—'}</b>
                    {nextDay && <span className="lb-plus1" title="Lands the next day">+1</span>}
                    {f.pilotFlying === true && <span className="lb-pf">PF</span>}
                    {Number(f.nightTime) > 0 && <Moon size={13} className="lb-moon" aria-label="Night time logged" />}
                    {f.source === 'SCAN' && <span className="lb-scan">scanned</span>}
                    <small>{[f.flightNumber, type, f.registration].filter(Boolean).join(' · ') || 'No details'}</small>
                    {from && <small className="lb-link">Return of overnight trip from {from}</small>}
                  </span>
                  <span className="mono">{duration(f.totalTime, timeFormat)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
