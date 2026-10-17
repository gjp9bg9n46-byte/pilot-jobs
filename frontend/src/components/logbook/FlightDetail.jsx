import React from 'react';
import { ArrowRight, Repeat, X } from 'lucide-react';
import Button from '../primitives/Button';
import { minutesToHHMM, spanMinutes } from '../../lib/logbookFormat';

/**
 * One flight, as the mockup's detail screen: the four times across the top,
 * then what was derived from them, then the duty facts. Block, airborne and
 * night are labelled as calculated so nobody goes looking for a field to type
 * them into. The actions are the ones a line pilot actually needs next:
 * the return trip, the next leg, a duplicate, or delete.
 */
export default function FlightDetail({ flight, onClose, onEdit, onReturnTrip, onNextLeg, onDuplicate, onDelete }) {
  if (!flight) return null;
  const block = spanMinutes(flight.offBlocksTime, flight.onBlocksTime);
  const airborne = spanMinutes(flight.takeoffTime, flight.landingTime);
  const landings = (flight.landingsDay || 0) + (flight.landingsNight || 0);
  const role = (flight.picTime || 0) > 0 ? 'PIC' : 'SIC';
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

        <div style={{ marginTop: 10 }}>
          <div className="route">{flight.departure || '—'} <ArrowRight size={18} style={{ color: 'var(--text-faint)' }} /> {flight.arrival || '—'}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {date}{flight.flightNumber ? ` · ${flight.flightNumber}` : ''}{flight.displayType || flight.aircraftType ? ` · ${flight.displayType || flight.aircraftType}` : ''}{flight.registration ? ` · ${flight.registration}` : ''}
          </div>
        </div>

        <div className="lb-card">
          <div className="lb-grid4">
            {cell('Out', flight.offBlocksTime || '—')}
            {cell('Off', flight.takeoffTime || '—')}
            {cell('On', flight.landingTime || '—')}
            {cell('In', flight.onBlocksTime || '—')}
          </div>
          <div className="lb-kv">
            {kv('Block', minutesToHHMM(block))}
            {kv('Airborne', minutesToHHMM(airborne))}
            {kv('Night', minutesToHHMM(Math.round((flight.nightTime || 0) * 60)), 'calc.')}
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
