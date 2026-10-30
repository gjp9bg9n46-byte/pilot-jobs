import React from 'react';
import { ArrowRight, Repeat, X } from 'lucide-react';
import Button from '../primitives/Button';
import { duration, greatCircleNm, landsNextDay, minutesToHHMM, overlapLabel, routeNames, spanMinutes } from '../../lib/logbookFormat';
import { useAirports } from '../../lib/useAirports';
import RouteMapCard from './RouteMapCard';

/**
 * One flight, as the mockup's detail screen: the four times across the top,
 * then what was derived from them, then the duty facts. Block, airborne and
 * night are labelled as calculated so nobody goes looking for a field to type
 * them into. The actions are the ones a line pilot actually needs next:
 * the return trip, the next leg, a duplicate, or delete.
 */
export default function FlightDetail({ flight, overlap, timeFormat = 'hhmm', onClose, onEdit, onReturnTrip, onNextLeg, onDuplicate, onDelete }) {
  // Hooks before the early return, or the order changes between renders.
  const air = useAirports();
  if (!flight) return null;
  // A flight typed in as a block time alone has no OUT and no IN to span, so
  // the figure it was saved with is the block.
  const block = spanMinutes(flight.offBlocksTime, flight.onBlocksTime)
    ?? (flight.totalTime > 0 ? Math.round(flight.totalTime * 60) : null);
  const airborne = spanMinutes(flight.takeoffTime, flight.landingTime);
  const landings = (flight.landingsDay || 0) + (flight.landingsNight || 0);
  const role = (flight.picTime || 0) > 0 ? 'PIC' : 'SIC';
  // The two ends, named where we can name them. An airport we cannot name
  // contributes only its code — nothing here is invented.
  const at = (code) => (code ? air.byCode.get(String(code).toUpperCase()) : undefined);
  const depAp = at(flight.departure);
  const arrAp = at(flight.arrival);
  const names = routeNames(
    { airport: depAp, code: flight.departure },
    { airport: arrAp, code: flight.arrival },
  );
  // Hidden when either end has no coordinates, rather than guessed at.
  const distanceNm = greatCircleNm(depAp, arrAp);
  const date = new Date(`${String(flight.date).slice(0, 10)}T00:00:00Z`)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  const cell = (label, value) => <div><span>{label}</span><b className="mono">{value}</b></div>;
  const kv = (label, value, note) => (
    <div><span>{label}{note && <span className="calc"> {note}</span>}</span><b>{value}</b></div>
  );

  return (
    <div className="lb-drawer" role="dialog" aria-modal="true" aria-label="Flight detail" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-secondary)', padding: 4, marginLeft: -4 }}><X size={20} /></button>
          <button type="button" onClick={onEdit} style={{ background: 'none', border: 0, color: 'var(--accent)', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Edit</button>
        </div>

        {/* Codes and the block time read together: the route on the left,
            the number a pilot came for on the right. */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="route">{flight.departure || '—'} <ArrowRight size={18} style={{ color: 'var(--text-faint)' }} /> {flight.arrival || '—'}</div>
            {names && <div className="lb-names">{names}</div>}
          </div>
          {block != null && (
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <div className="lb-blockv mono">{duration(block / 60, timeFormat)}</div>
              <div className="lb-blockk">BLOCK</div>
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {date}{flight.flightNumber ? ` · ${flight.flightNumber}` : ''}{flight.displayType || flight.aircraftType ? ` · ${flight.displayType || flight.aircraftType}` : ''}{flight.registration ? ` · ${flight.registration}` : ''}
          </div>
        </div>

        {/* This sector's own route — the app's card, same design, same
            single-sector scope. */}
        {flight.departure && flight.arrival && (
          <RouteMapCard
            sectors={[{ from: flight.departure, to: flight.arrival }]}
            scope="view"
            label="Route"
            note={distanceNm != null ? `${distanceNm.toLocaleString()} nm great circle` : undefined}
            pinLabels
          />
        )}

        <div className="lb-card">
          <div className="lb-grid4">
            {cell('Out', flight.offBlocksTime || '—')}
            {cell('Off', flight.takeoffTime || '—')}
            {cell('On', flight.landingTime || '—')}
            {cell('In', `${flight.onBlocksTime || '—'}${landsNextDay(flight.offBlocksTime, flight.onBlocksTime) ? ' +1' : ''}`)}
          </div>
          <div className="lb-kv">
            {kv('Block', minutesToHHMM(block))}
            {kv('Airborne', minutesToHHMM(airborne))}
            {kv('Night', flight.nightTime == null ? '\u2014' : minutesToHHMM(Math.round(flight.nightTime * 60)), flight.nightSource === 'form' ? 'from the form' : 'calc.')}
            {kv(role, minutesToHHMM(Math.round(((role === 'PIC' ? flight.picTime : flight.sicTime) || 0) * 60)), 'auto')}
          </div>
        </div>

        <div className="lb-card">
          <div className="lb-kv">
            {kv('Role', role === 'PIC' ? 'Captain' : 'First Officer')}
            {kv('Duty', flight.pilotFlying === true ? 'Pilot flying' : flight.pilotFlying === false ? 'Monitoring' : '—')}
            {kv('Commander', flight.picName || '—')}
            {kv('Landings', landings ? `${landings}${flight.landingsNight ? ' night' : ' day'}` : '0')}
            {kv('Approach', flight.approach || '—')}
            {kv('Remarks', flight.remarks || '—')}
          </div>
        </div>

        {overlap && <p className="lb-overlap-note">{overlapLabel(overlap)}</p>}

        {flight.source === 'SCAN' && (
          <p className="lb-src">From your voyage report scan, checked by you</p>
        )}

        <div className="lb-acts">
          <Button onClick={onReturnTrip} style={{ gap: 8 }}><Repeat size={15} /> Return trip</Button>
          <Button variant="secondary" onClick={onNextLeg} style={{ gap: 8 }}><ArrowRight size={15} /> Next leg</Button>
        </div>
        <div className="lb-acts" style={{ marginTop: 10 }}>
          <Button variant="secondary" onClick={onDuplicate}>Duplicate</Button>
          <Button variant="secondary" onClick={onDelete} style={{ color: 'var(--lb-red)' }}>Delete</Button>
        </div>
      </div>
    </div>
  );
}
