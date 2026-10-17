import React from 'react';
import { spanMinutes, minutesToHHMM } from '../../lib/logbookFormat';

/**
 * One sector, in the layout the mockup uses on the desktop "Add flights" page.
 *
 * The same form serves manual entry and a scan review: `flags` comes from the
 * server for a scanned sector (amber = please look) and is empty for a typed
 * one. Block, airborne and night are never inputs — they are shown as derived
 * values, and the server derives them again when saving.
 */
export default function SectorForm({ value, flags = {}, onChange, onFieldFocus, night, nightNote, compact = false }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const block = spanMinutes(value.out, value.in);
  const airborne = spanMinutes(value.off, value.on);

  const field = (k, label, extra = {}) => (
    <div className={`lb-f${flags[k] ? ' q' : ''}${extra.span ? ` ${extra.span}` : ''}`} style={extra.style}>
      <label htmlFor={`f-${k}`}>{label}{extra.hint && <span className="rem"> · {extra.hint}</span>}</label>
      <input
        id={`f-${k}`}
        className={extra.mono ? 'mono' : undefined}
        value={value[k] ?? ''}
        onChange={set(k)}
        onFocus={() => onFieldFocus?.(k)}
        placeholder={extra.placeholder || ''}
        inputMode={extra.mono ? 'numeric' : undefined}
        autoComplete="off"
      />
      {flags[k] && <p className="why">{flags[k].message}</p>}
    </div>
  );

  return (
    <>
      <div className="lb-gl"><span>Flight</span></div>
      <div className="lb-fg">
        {field('flightNumber', 'Flight no.', { span: 'span2' })}
        {field('from', 'From', { placeholder: 'CAI' })}
        {field('to', 'To', { placeholder: 'HRG' })}
        {field('registration', 'Registration', { span: 'span2', hint: 'remembered' })}
      </div>

      <div className="lb-gl"><span>Times · UTC</span></div>
      <div className="lb-fg">
        {field('out', 'Out', { mono: true, placeholder: '07:26' })}
        {field('off', 'Off', { mono: true, placeholder: '07:39' })}
        {field('on', 'On', { mono: true, placeholder: '11:47' })}
        {field('in', 'In', { mono: true, placeholder: '11:53' })}
        <div className="lb-f calc">
          <label>Block <span className="rem">· calc.</span></label>
          <div className="mono">{minutesToHHMM(block)}</div>
        </div>
        <div className="lb-f calc">
          <label>Airborne <span className="rem">· calc.</span></label>
          <div className="mono">{minutesToHHMM(airborne)}</div>
        </div>
      </div>

      {!compact && (
        <>
          <div className="lb-gl"><span>Duty</span></div>
          <div className="lb-fg">
            <div className="lb-f span2">
              <label htmlFor="f-pf">Pilot flying</label>
              <select
                id="f-pf"
                value={value.pilotFlying === true ? 'pf' : value.pilotFlying === false ? 'pm' : ''}
                onChange={(e) => onChange({ ...value, pilotFlying: e.target.value === '' ? null : e.target.value === 'pf' })}
              >
                <option value="">Not marked</option>
                <option value="pf">Pilot flying</option>
                <option value="pm">Monitoring</option>
              </select>
              {flags.pilotFlying && <p className="why">{flags.pilotFlying.message}</p>}
            </div>
            {field('landings', 'Landings', { mono: true })}
            <div className="lb-f calc span3">
              <label>Night <span className="rem">· {nightNote || 'calculated'}</span></label>
              <div className="mono">{minutesToHHMM(night)}</div>
            </div>
            {flags.night && <p className="why span6" style={{ margin: 0, color: 'var(--lb-amber)', fontSize: 12 }}>{flags.night.message}</p>}
            {field('approach', 'Approach', { span: 'span3', placeholder: 'ILS 34L' })}
            {field('remarks', 'Remarks', { span: 'span3', placeholder: 'Optional' })}
          </div>
        </>
      )}
    </>
  );
}
