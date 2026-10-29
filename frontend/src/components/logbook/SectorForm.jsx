import React from 'react';
import { spanMinutes, minutesToHHMM, parseBlockHours } from '../../lib/logbookFormat';

/**
 * One sector, in the layout the mockup uses on the desktop "Add flights" page.
 *
 * The same form serves manual entry and a scan review: `flags` comes from the
 * server for a scanned sector (amber = please look) and is empty for a typed
 * one. Airborne and night are never inputs — they are shown as derived values,
 * and the server derives them again when saving. Block follows OUT and IN when
 * both are there; when they are not, it can be typed, because a page copied out
 * of a paper logbook often records the block time and nothing else.
 */
export default function SectorForm({ value, flags = {}, onChange, onFieldFocus, night, nightNote, compact = false }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const blockFromTimes = spanMinutes(value.out, value.in);
  const typedBlock = parseBlockHours(value.blockTyped);
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
        {field('from', 'From', { span: 'span2', placeholder: 'CAI' })}
        {field('to', 'To', { span: 'span2', placeholder: 'HRG' })}
      </div>

      <div className="lb-gl"><span>Times · UTC</span></div>
      <div className="lb-fg">
        {/* A time-shaped placeholder reads as a value: an empty OUT showing
            "07:26" looks filled in at a glance, and on a review screen that is
            the one thing it must never look like. The placeholder states the
            format instead. */}
        {field('out', 'Out', { mono: true, placeholder: 'hh:mm' })}
        {field('off', 'Off', { mono: true, placeholder: 'hh:mm' })}
        {field('on', 'On', { mono: true, placeholder: 'hh:mm' })}
        {field('in', 'In', { mono: true, placeholder: 'hh:mm' })}
        {blockFromTimes !== null
          ? (
            <div className="lb-f calc">
              <label>Block <span className="rem">· calc.</span></label>
              <div className="mono">{minutesToHHMM(blockFromTimes)}</div>
            </div>
          )
          : field('blockTyped', 'Block', { mono: true, placeholder: 'hh:mm', hint: 'or 1.5' })}
        <div className="lb-f calc">
          <label>Airborne <span className="rem">· calc.</span></label>
          <div className="mono">{minutesToHHMM(airborne)}</div>
        </div>
        {typedBlock !== null && blockFromTimes === null && (
          <p className="why span6" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12 }}>
            Saved as {minutesToHHMM(Math.round(typedBlock * 60))} of block. Off, on and night stay blank — there is nothing here to work them out from.
          </p>
        )}
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
            {flags.night && <p className="why span6" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12 }}>{flags.night.message}</p>}
            {field('approach', 'Approach', { span: 'span3', placeholder: 'ILS 34L' })}
            {field('remarks', 'Remarks', { span: 'span3', placeholder: 'Optional' })}
          </div>
        </>
      )}
    </>
  );
}
