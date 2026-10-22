import React from 'react';
import { Moon, ArrowLeftRight } from 'lucide-react';
import { duration, landsNextDay, shortDayLabel } from '../../lib/logbookFormat';

const toMin = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};
const span = (a, b) => (a == null || b == null ? null : (b >= a ? b - a : 1440 - a + b));

/**
 * Where OFF and ON sit along the OUT→IN line, as percentages. Null when the
 * middle two times are missing — the row then draws the gate-to-gate line
 * rather than inventing a taxi time.
 */
export function trackPoints(log) {
  const out = toMin(log.offBlocksTime), off = toMin(log.takeoffTime);
  const on = toMin(log.landingTime), inn = toMin(log.onBlocksTime);
  const block = span(out, inn);
  if (!block || off == null || on == null) return null;
  const toOff = span(out, off), toIn = span(on, inn);
  if (toOff == null || toIn == null) return null;
  return {
    left: Math.min(45, Math.max(0, (toOff / block) * 100)),
    right: Math.min(45, Math.max(0, (toIn / block) * 100)),
  };
}

/**
 * One sector, built around the four-point OUT · OFF · ON · IN track: grey ends
 * for the gate, a navy line for airborne, so taxi time is visible at a glance.
 * Night is written as a duration — an hour of night is information, an icon on
 * its own is decoration.
 */
export default function FlightRow({ log, timeFormat, overnightFrom, overlap, showDate, onOpen }) {
  const pts = trackPoints(log);
  // null means we could not work it out (no resolvable airport, nothing on the
  // form). That is not a day flight, and it shows as "—".
  const nightUnknown = log.nightTime === null || log.nightTime === undefined;
  const night = Number(log.nightTime) || 0;
  const role = log.pilotFlying === true ? 'PF' : log.pilotFlying === false ? 'PM' : null;
  const type = log.displayType || log.aircraftType;

  return (
    <button type="button" className="lb-fc" onClick={() => onOpen(log)}>
      <span className="lb-fc-meta">
        {showDate && <span className="d">{shortDayLabel(log.date)}</span>}
        <b className="mono">{log.flightNumber || '—'}</b>
        {type && <span className="t">{type}</span>}
        <span className="r">
          {nightUnknown
            ? <span className="night"><Moon size={12} aria-hidden /><span className="mono">—</span></span>
            : night > 0 && (
              <span className="night"><Moon size={12} aria-hidden /><span className="mono">{duration(night, timeFormat)}</span></span>
            )}
          {role && <span className={`tag ${role.toLowerCase()}`}>{role}</span>}
        </span>
      </span>

      <span className="lb-fc-route">
        <span className="ap">
          <span className="c">{log.departure || '—'}</span>
          <span className="tm mono">{log.offBlocksTime || '—'}</span>
        </span>
        <span className="mid">
          <span className="blk mono">{duration(log.totalTime, timeFormat)}</span>
          <span className="track" aria-label="Out, off, on and in">
            <i className="base" />
            <i className="air" style={pts ? { left: `${pts.left}%`, right: `${pts.right}%` } : { left: 0, right: 0 }} />
            <i className="dot g" style={{ left: 0 }} />
            {pts && <i className="dot" style={{ left: `${pts.left}%`, marginLeft: -4 }} />}
            {pts && <i className="dot" style={{ right: `${pts.right}%`, marginRight: -4 }} />}
            <i className="dot g" style={{ right: 0 }} />
          </span>
        </span>
        <span className="ap end">
          <span className="c">{log.arrival || '—'}</span>
          <span className="tm mono">
            {log.onBlocksTime || '—'}
            {landsNextDay(log.offBlocksTime, log.onBlocksTime) && <sup title="Lands the next day">+1</sup>}
          </span>
        </span>
      </span>

      <span className="lb-fc-foot">
        <span className="mono">{log.registration || ''}</span>
        {overlap
          ? <span className="ov">{overlap}</span>
          : overnightFrom
            ? <span className="night"><ArrowLeftRight size={12} aria-hidden /> Return from {overnightFrom}</span>
            : <span />}
      </span>
    </button>
  );
}
