import React from 'react';
import { groupByDay, duration, hoursToHHMM } from '../../lib/logbookFormat';

/**
 * Sectors grouped by the day they were flown, so a CAI–HRG–CAI rotation reads
 * as one block with the day's total beside it — the list from the mockup.
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
              return (
                <button type="button" key={f.id} className="lb-leg" onClick={() => onOpen(f)}>
                  <span>
                    <b>{f.departure || '—'} → {f.arrival || '—'}</b>
                    {f.pilotFlying === true && <span className="lb-pf">PF</span>}
                    {f.source === 'SCAN' && <span className="lb-scan">scanned</span>}
                    <small>{[f.flightNumber, type, f.registration].filter(Boolean).join(' · ') || 'No details'}</small>
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
