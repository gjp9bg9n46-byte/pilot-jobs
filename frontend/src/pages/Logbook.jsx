import React, { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  ChevronDown, ChevronRight, ChevronUp,
  Pencil, Copy, Trash2, Clock, Upload,
} from 'lucide-react';
import SunCalc from 'suncalc';
import { flightLogApi, profileApi } from '../services/api';
import { setLogs, setTotals, addLog, removeLog } from '../store';
import AIRPORTS from '../data/airports.json';
import ImportModal from '../components/ImportModal';

const css = {
  totalsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 14, marginBottom: 20,
  },
  totalCard: {
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 14,
    padding: '18px 16px', textAlign: 'center',
  },
  totalValue: { fontSize: 26, fontWeight: 800, color: '#00B4D8', marginBottom: 4 },
  totalLabel: { fontSize: 11, color: '#4A6080', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },

  searchBar: {
    width: '100%', background: '#1B2B4B', border: '1px solid #243050',
    borderRadius: 10, padding: '12px 16px', color: '#fff', fontSize: 14,
    outline: 'none', marginBottom: 20,
  },
  currencyCard: {
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 14,
    padding: '18px 22px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
  },
  currencyTitle: { fontSize: 13, fontWeight: 700, color: '#7A8CA0', textTransform: 'uppercase', letterSpacing: 0.6, marginRight: 8 },
  pillCurrent: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'rgba(0,200,100,0.12)', border: '1px solid rgba(0,200,100,0.35)',
    borderRadius: 20, padding: '5px 14px', fontSize: 13, fontWeight: 700, color: '#00C864',
  },
  pillNotCurrent: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.35)',
    borderRadius: 20, padding: '5px 14px', fontSize: 13, fontWeight: 700, color: '#FF4757',
  },

  toolbar: { display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  addBtn: {
    background: 'linear-gradient(135deg, #00B4D8, #0077A8)',
    border: 'none', borderRadius: 10, padding: '11px 20px',
    color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
  importBtn: {
    background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10,
    padding: '11px 20px', color: '#7A8CA0', fontWeight: 600, fontSize: 14, cursor: 'pointer',
  },

  searchInput: {
    flex: 1, background: '#0D1E35', border: '1px solid #1E3050',
    borderRadius: 10, padding: '11px 16px', color: '#fff', fontSize: 14,
    outline: 'none', maxWidth: 420,
  },

  table: { width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' },
  th: {
    fontSize: 11, fontWeight: 700, color: '#4A6080',
    textTransform: 'uppercase', letterSpacing: 0.5,
    padding: '0 14px 8px', textAlign: 'left',
  },
  td: {
    padding: '14px', background: '#0D1E35', fontSize: 14, color: '#fff',
    borderTop: '1px solid #1E3050', borderBottom: '1px solid #1E3050',
  },
  tdFirst: { borderLeft: '1px solid #1E3050', borderRadius: '10px 0 0 10px', paddingLeft: 18 },
  tdLast: { borderRight: '1px solid #1E3050', borderRadius: '0 10px 10px 0', paddingRight: 18 },
  deleteBtn: {
    background: 'none', border: 'none', color: '#FF4757', cursor: 'pointer',
    padding: '8px 6px', display: 'inline-flex', alignItems: 'center',
  },
  editBtn: {
    background: 'none', border: 'none', color: '#00B4D8', cursor: 'pointer',
    padding: '8px 6px', display: 'inline-flex', alignItems: 'center',
  },
  cloneBtn: {
    background: 'none', border: 'none', color: '#7A8CA0', cursor: 'pointer',
    padding: '8px 6px', display: 'inline-flex', alignItems: 'center',
  },
  hours: { color: '#00B4D8', fontWeight: 700 },
  route: { color: '#7A8CA0', fontSize: 12, marginTop: 2 },
  routeMain: { fontSize: 15, fontWeight: 800, color: '#D0E8F8', letterSpacing: 0.2 },
  routeArrow: { color: '#00B4D8', margin: '0 5px' },
  emptyRow: { textAlign: 'center', padding: '60px 0', color: '#4A6080' },

  // Modal
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 12,
  },
  modal: {
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 20,
    padding: '24px 20px', maxWidth: 680, width: '100%', maxHeight: '90vh', overflowY: 'auto',
  },
  modalTitle: { fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 24 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 16 },
  formFull: { gridColumn: '1 / -1' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#7A8CA0', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  hint: { fontSize: 11, color: '#4A6080', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 },
  input: {
    width: '100%', background: '#1B2B4B', border: '1px solid #243050',
    borderRadius: 8, padding: '11px 12px', color: '#fff', fontSize: 14, outline: 'none',
  },
  readOnlyField: {
    width: '100%', background: '#0A1628', border: '1px solid #1E3050',
    borderRadius: 8, padding: '11px 12px', color: '#7A8CA0', fontSize: 14, cursor: 'not-allowed',
  },
  readOnlyBlue: {
    width: '100%', background: '#0A1628', border: '1px solid rgba(0,180,216,0.35)',
    borderRadius: 8, padding: '11px 12px', color: '#00B4D8', fontSize: 14,
    fontWeight: 700, cursor: 'not-allowed',
  },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: '#00B4D8', marginBottom: 12, marginTop: 4 },
  saveBtn: {
    background: 'linear-gradient(135deg, #00B4D8, #0077A8)',
    border: 'none', borderRadius: 10, padding: '13px 28px',
    color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
  },
  cancelBtn: {
    background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10,
    padding: '13px 24px', color: '#7A8CA0', fontWeight: 600, fontSize: 15, cursor: 'pointer',
    marginRight: 12,
  },
};

const TAIL_PREFIXES = ['', 'A6-', 'N', 'G-', 'OE-', 'D-', 'F-', 'HB-', 'TC-', 'SU-', 'AP-', 'VT-', '7T-', 'HL', 'B-', 'JA', 'VH-', 'ZS-', 'C-', 'OY-', 'SE-', 'LN-', 'OH-', 'PH-', 'CS-', 'EC-', 'EI-', 'TS-', 'CN-', 'EP-'];

// Civil twilight threshold per EASA Part-FCL / ICAO Annex 2 (sun 6° below horizon)
const CIVIL_TWILIGHT_RAD = -6 * Math.PI / 180;

function timeToMinutes(hhmm) {
  if (!hhmm || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function blockTimeFromTimes(off, on) {
  const offMin = timeToMinutes(off);
  const onMin = timeToMinutes(on);
  if (offMin === null || onMin === null) return null;
  const diff = onMin >= offMin ? onMin - offMin : 1440 - offMin + onMin;
  return parseFloat((diff / 60).toFixed(2));
}

// Samples position every minute along the great-circle approximation and counts
// minutes where sun altitude < civil twilight threshold.
function computeNightHours(dateStr, takeoffHHMM, landingHHMM, depICAO, arrICAO) {
  const dep = AIRPORTS[(depICAO || '').toUpperCase()];
  const arr = AIRPORTS[(arrICAO || '').toUpperCase()];
  const toffMin = timeToMinutes(takeoffHHMM);
  const landMin = timeToMinutes(landingHHMM);
  if (!dep || !arr || toffMin === null || landMin === null) return null;

  const base = new Date(dateStr + 'T00:00:00Z').getTime();
  let toffMs = base + toffMin * 60000;
  let landMs  = base + landMin * 60000;
  if (landMs <= toffMs) landMs += 86400000; // midnight crossing

  const durationMs = landMs - toffMs;
  if (durationMs === 0) return 0;

  let nightCount = 0;
  let total = 0;
  for (let t = toffMs; t <= landMs; t += 60000) {
    const frac = (t - toffMs) / durationMs;
    const lat = dep.lat + frac * (arr.lat - dep.lat);
    const lon = dep.lon + frac * (arr.lon - dep.lon);
    if (SunCalc.getPosition(new Date(t), lat, lon).altitude < CIVIL_TWILIGHT_RAD) nightCount++;
    total++;
  }
  return parseFloat(((nightCount / total) * (durationMs / 3600000)).toFixed(2));
}

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  flightNumber: '', tailPrefix: '', aircraftType: '', registration: '',
  departure: '', arrival: '',
  offBlocksTime: '', takeoffTime: '', landingTime: '', onBlocksTime: '',
  picName: '', sicName: '',
  picTime: '', sicTime: '',
  multiEngineTime: '', turbineTime: '', jetTime: '',
  instrumentTime: '', instrumentActualTime: '', instrumentSimTime: '',
  crossCountryTime: '', nightTime: '',
  landingsDay: '', landingsNight: '',
  remarks: '',
};

function formFromLog(log) {
  return {
    date: log.date ? new Date(log.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    flightNumber: log.flightNumber || '',
    tailPrefix: log.tailPrefix || '',
    aircraftType: log.aircraftType || '',
    registration: log.registration || '',
    departure: log.departure || '',
    arrival: log.arrival || '',
    offBlocksTime: log.offBlocksTime || '',
    takeoffTime: log.takeoffTime || '',
    landingTime: log.landingTime || '',
    onBlocksTime: log.onBlocksTime || '',
    picName: log.picName || '',
    sicName: log.sicName || '',
    picTime: log.picTime != null ? String(log.picTime) : '',
    sicTime: log.sicTime != null ? String(log.sicTime) : '',
    multiEngineTime:      log.multiEngineTime      != null ? String(log.multiEngineTime)      : '',
    turbineTime:          log.turbineTime          != null ? String(log.turbineTime)          : '',
    jetTime:              log.jetTime              != null ? String(log.jetTime)              : '',
    instrumentTime:       log.instrumentTime       != null ? String(log.instrumentTime)       : '',
    instrumentActualTime: log.instrumentActualTime != null ? String(log.instrumentActualTime) : '',
    instrumentSimTime:    log.instrumentSimTime    != null ? String(log.instrumentSimTime)    : '',
    crossCountryTime:     log.crossCountryTime     != null ? String(log.crossCountryTime)     : '',
    nightTime:            log.nightTime            != null ? String(log.nightTime)            : '',
    landingsDay: log.landingsDay != null ? String(log.landingsDay) : '',
    landingsNight: log.landingsNight != null ? String(log.landingsNight) : '',
    remarks: log.remarks || '',
    _legacyTotal: log.totalTime != null ? String(log.totalTime) : '0',
  };
}

function Field({ value, onChange, label, hint, span, type = 'text' }) {
  return (
    <div style={span === 'full' ? css.formFull : {}}>
      <label style={css.label}>{label}{hint && <span style={css.hint}>{hint}</span>}</label>
      <input style={css.input} type={type} value={value} onChange={onChange}
        placeholder={hint?.replace('e.g. ', '') || ''} />
    </div>
  );
}

function TimeField({ value, onChange, label }) {
  const [err, setErr] = useState('');
  const validate = () => {
    if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) setErr('Use HH:MM (24 h)');
    else setErr('');
  };
  return (
    <div>
      <label style={css.label}>{label}<span style={css.hint}>HH:MM UTC</span></label>
      <input
        style={{ ...css.input, ...(err ? { borderColor: '#FF4757' } : {}) }}
        type="time" value={value} onChange={onChange} onBlur={validate}
      />
      {err && <div style={{ color: '#FF4757', fontSize: 11, marginTop: 3 }}>{err}</div>}
    </div>
  );
}

function AddFlightModal({ onClose, onSave, onSaveBulk, initial, title }) {
  const [legs, setLegs] = useState(initial ? [formFromLog(initial)] : [{ ...EMPTY_FORM }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setLegField = (idx, k) => (e) =>
    setLegs((prev) => prev.map((leg, i) => i === idx ? { ...leg, [k]: e.target.value } : leg));

  const addLeg = () => {
    const prev = legs[legs.length - 1];
    setLegs((l) => [...l, {
      ...EMPTY_FORM,
      date: prev.date,
      tailPrefix: prev.tailPrefix,
      aircraftType: prev.aircraftType,
      registration: prev.registration,
      picName: prev.picName,
      sicName: prev.sicName,
      departure: prev.arrival,
    }]);
  };

  const removeLeg = (idx) => setLegs((l) => l.filter((_, i) => i !== idx));

  // Derived per-leg values — recomputed only when leg data changes
  const derivedLegs = useMemo(() => legs.map((leg) => {
    const blockTime = blockTimeFromTimes(leg.offBlocksTime, leg.onBlocksTime);
    const computedNight = (leg.takeoffTime && leg.landingTime && leg.departure && leg.arrival && leg.date)
      ? computeNightHours(leg.date, leg.takeoffTime, leg.landingTime, leg.departure, leg.arrival)
      : null;
    const nightHours = computedNight !== null ? computedNight : (parseFloat(leg.nightTime) || 0);
    const dayHours = blockTime !== null
      ? parseFloat(Math.max(0, blockTime - nightHours).toFixed(2))
      : null;
    return { blockTime, computedNight, nightHours, dayHours };
  }), [legs]);

  const buildPayload = (leg, derived) => {
    const {
      tailPrefix, _legacyTotal, nightTime: nightRaw,
      picTime, sicTime,
      multiEngineTime, turbineTime, jetTime,
      instrumentTime, instrumentActualTime, instrumentSimTime,
      crossCountryTime,
      landingsDay, landingsNight,
      ...rest
    } = leg;
    const totalTime = derived.blockTime !== null
      ? derived.blockTime
      : (parseFloat(_legacyTotal) || 0);
    return {
      ...rest,
      registration: tailPrefix ? `${tailPrefix}${leg.registration}` : leg.registration,
      date: new Date(leg.date).toISOString(),
      totalTime,
      picTime:              parseFloat(picTime)              || 0,
      sicTime:              parseFloat(sicTime)              || 0,
      multiEngineTime:      parseFloat(multiEngineTime)      || 0,
      turbineTime:          parseFloat(turbineTime)          || 0,
      jetTime:              parseFloat(jetTime)              || 0,
      instrumentTime:       parseFloat(instrumentTime)       || 0,
      instrumentActualTime: parseFloat(instrumentActualTime) || 0,
      instrumentSimTime:    parseFloat(instrumentSimTime)    || 0,
      crossCountryTime:     parseFloat(crossCountryTime)     || 0,
      nightTime:            derived.nightHours,
      landingsDay:          parseInt(landingsDay)            || 0,
      landingsNight:        parseInt(landingsNight)          || 0,
    };
  };

  const handleSave = async () => {
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const d = derivedLegs[i];
      if (!leg.date || !leg.aircraftType) {
        return setError(`Leg ${i + 1}: date and aircraft type are required.`);
      }
      if (d.blockTime === null && !(parseFloat(leg._legacyTotal) > 0)) {
        return setError(`Leg ${i + 1}: off-blocks and on-blocks times are required.`);
      }
    }
    setSaving(true);
    try {
      const payloads = legs.map((leg, i) => buildPayload(leg, derivedLegs[i]));
      if (payloads.length === 1) {
        await onSave(payloads[0]);
      } else {
        await onSaveBulk(payloads);
      }
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not save flight. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={css.overlay}>
      <div style={css.modal}>
        <div style={css.modalTitle}>{title || 'Log a Flight'}</div>
        {error && (
          <div style={{ background: '#2D1A1A', border: '1px solid #5C2626', borderRadius: 8, padding: '10px 14px', color: '#FF6B6B', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {legs.map((leg, idx) => {
          const set = (k) => setLegField(idx, k);
          const derived = derivedLegs[idx];
          const airportsKnown = !!(
            leg.takeoffTime && leg.landingTime && leg.departure && leg.arrival &&
            AIRPORTS[(leg.departure || '').toUpperCase()] && AIRPORTS[(leg.arrival || '').toUpperCase()]
          );
          const airportsEntered = !!(leg.takeoffTime && leg.landingTime && leg.departure && leg.arrival);

          return (
            <div key={idx}>
              {legs.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#00B4D8' }}>Leg {idx + 1}</div>
                  {idx > 0 && (
                    <button
                      onClick={() => removeLeg(idx)}
                      style={{ background: 'none', border: 'none', color: '#FF4757', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Trash2 size={13} /> Remove leg
                    </button>
                  )}
                </div>
              )}

              <div style={css.sectionTitle}>Flight Details</div>
              <div style={css.formGrid}>
                <Field value={leg.date} onChange={set('date')} label="Date *" type="date" />
                <Field value={leg.flightNumber} onChange={set('flightNumber')} label="Flight Number" hint="e.g. QR435, EK201" />
                <Field value={leg.aircraftType} onChange={set('aircraftType')} label="Aircraft Type *" hint="e.g. B737, A320, C172" />
                <div>
                  <label style={css.label}>Tail Number (Registration)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={leg.tailPrefix} onChange={set('tailPrefix')} style={{ ...css.input, width: 90, padding: '11px 6px', flexShrink: 0 }}>
                      {TAIL_PREFIXES.map((p) => <option key={p} value={p}>{p || 'Prefix'}</option>)}
                    </select>
                    <input style={{ ...css.input, flex: 1 }} value={leg.registration} onChange={set('registration')} placeholder="EKA, 123AB..." />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}><Field value={leg.departure} onChange={set('departure')} label="From" hint="e.g. OMDB" /></div>
                  <div style={{ paddingBottom: 10, color: '#4A6080', fontSize: 18 }}>&#x2192;</div>
                  <div style={{ flex: 1 }}><Field value={leg.arrival} onChange={set('arrival')} label="To" hint="e.g. EGLL" /></div>
                </div>
                <Field value={leg.picName} onChange={set('picName')} label="Pilot in Command" hint="e.g. Capt. Al Rashid" />
                <Field value={leg.sicName} onChange={set('sicName')} label="Second in Command" hint="e.g. F/O Smith" />
              </div>

              <div style={css.sectionTitle}>Block &amp; Flight Times (UTC)</div>
              <div style={css.formGrid}>
                <TimeField value={leg.offBlocksTime} onChange={set('offBlocksTime')} label="Off Blocks *" />
                <TimeField value={leg.takeoffTime} onChange={set('takeoffTime')} label="Takeoff" />
                <TimeField value={leg.landingTime} onChange={set('landingTime')} label="Landing" />
                <TimeField value={leg.onBlocksTime} onChange={set('onBlocksTime')} label="On Blocks *" />
                <div>
                  <label style={css.label}>Block Time<span style={css.hint}>auto-computed</span></label>
                  <div style={derived.blockTime !== null ? css.readOnlyBlue : css.readOnlyField}>
                    {derived.blockTime !== null ? `${derived.blockTime.toFixed(2)} hrs` : 'Enter off / on blocks'}
                  </div>
                </div>
              </div>

              <div style={css.sectionTitle}>Night / Day Time</div>
              <div style={css.formGrid}>
                {derived.computedNight !== null ? (
                  <>
                    <div>
                      <label style={css.label}>Night Time<span style={css.hint}>civil twilight, auto</span></label>
                      <div style={css.readOnlyBlue}>{derived.nightHours.toFixed(2)} hrs</div>
                    </div>
                    <div>
                      <label style={css.label}>Day Time<span style={css.hint}>auto-computed</span></label>
                      <div style={css.readOnlyField}>
                        {derived.dayHours !== null ? `${derived.dayHours.toFixed(2)} hrs` : '—'}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <Field value={leg.nightTime} onChange={set('nightTime')} label="Night Time" hint="manual entry" type="number" />
                    {airportsEntered && !airportsKnown && (
                      <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#4A6080', marginTop: -8, padding: '6px 10px', background: '#0A1628', borderRadius: 6 }}>
                        Airport not in database — enter night time manually. Auto-calc requires departure and arrival ICAO codes.
                      </div>
                    )}
                    {!airportsEntered && (
                      <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#4A6080', marginTop: -8 }}>
                        Fill in takeoff, landing, departure (From), and arrival (To) ICAO codes to auto-calculate.
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={css.sectionTitle}>
                Flight Hours
                <span style={{ fontSize: 11, color: '#4A6080', fontWeight: 400, marginLeft: 8 }}>decimals — 1h 30m = 1.5</span>
              </div>
              <div style={css.formGrid}>
                <Field value={leg.picTime} onChange={set('picTime')} label="PIC (Captain)" type="number" />
                <Field value={leg.sicTime} onChange={set('sicTime')} label="SIC (Co-pilot)" type="number" />
                <Field value={leg.multiEngineTime} onChange={set('multiEngineTime')} label="Multi-Engine" type="number" />
                <Field value={leg.turbineTime} onChange={set('turbineTime')} label="Turbine" hint="jet + turboprop" type="number" />
                <Field value={leg.jetTime} onChange={set('jetTime')} label="Jet" hint="subset of turbine — jet engines only" type="number" />
                <Field value={leg.crossCountryTime} onChange={set('crossCountryTime')} label="Cross-Country" type="number" />
                <Field value={leg.instrumentActualTime} onChange={set('instrumentActualTime')} label="IFR Actual (IMC)" type="number" />
                <Field value={leg.instrumentSimTime} onChange={set('instrumentSimTime')} label="IFR Sim (FNPT/SIM)" type="number" />
              </div>

              <div style={css.sectionTitle}>Landings</div>
              <div style={css.formGrid}>
                <Field value={leg.landingsDay} onChange={set('landingsDay')} label="Day Landings" type="number" />
                <Field value={leg.landingsNight} onChange={set('landingsNight')} label="Night Landings" type="number" />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={css.label}>Remarks</label>
                <textarea
                  style={{ ...css.input, height: 70, resize: 'vertical', fontFamily: 'inherit' }}
                  value={leg.remarks}
                  onChange={set('remarks')}
                  placeholder="Any notes about this flight..."
                />
              </div>

              {idx < legs.length - 1 && (
                <div style={{ borderTop: '1px solid #1E3050', margin: '4px 0 28px' }} />
              )}
            </div>
          );
        })}

        {!initial && (
          <button
            onClick={addLeg}
            style={{
              width: '100%', background: 'transparent', border: '1px dashed #00B4D8',
              borderRadius: 10, padding: '11px', color: '#00B4D8',
              fontWeight: 600, fontSize: 14, cursor: 'pointer', marginBottom: 24,
            }}
          >
            + Add another leg
          </button>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button style={css.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...css.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : legs.length > 1 ? `Save ${legs.length} Legs` : 'Save Flight'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Logbook() {
  const dispatch = useDispatch();
  const { logs, totals } = useSelector((s) => s.logbook);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editFlight, setEditFlight] = useState(null);
  const [cloneFlight, setCloneFlight] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedDuties, setExpandedDuties] = useState(new Set());
  const [cfHover, setCfHover] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const toggleDuty = (id) => setExpandedDuties((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [showCarryForward, setShowCarryForward] = useState(false);
  const [carryForward, setCarryForward] = useState(() => {
    try { return JSON.parse(localStorage.getItem('logbook_carry_forward') || '{}'); } catch { return {}; }
  });
  const [carryForwardForm, setCarryForwardForm] = useState({});
  const [carryForwardSaved, setCarryForwardSaved] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [logsRes, totalsRes] = await Promise.all([flightLogApi.list(), profileApi.getTotals()]);
      dispatch(setLogs({ logs: logsRes.data.logs, total: logsRes.data.total }));
      dispatch(setTotals(totalsRes.data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const currency = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    let dayLandings = 0;
    let nightLandings = 0;
    for (const log of logs) {
      if (log.date && new Date(log.date) >= cutoff) {
        dayLandings += parseInt(log.landingsDay) || 0;
        nightLandings += parseInt(log.landingsNight) || 0;
      }
    }
    return { dayCurrent: dayLandings >= 3, nightCurrent: nightLandings >= 1 };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) =>
      (log.aircraftType || '').toLowerCase().includes(q) ||
      (log.registration || '').toLowerCase().includes(q) ||
      (log.departure || '').toLowerCase().includes(q) ||
      (log.arrival || '').toLowerCase().includes(q)
    );
  }, [logs, search]);

  const groupedRows = useMemo(() => {
    const groups = [];
    const seenDuty = new Set();
    for (const log of filteredLogs) {
      if (!log.dutyId) {
        groups.push({ type: 'single', id: log.id, log });
      } else if (!seenDuty.has(log.dutyId)) {
        seenDuty.add(log.dutyId);
        const legs = filteredLogs.filter((l) => l.dutyId === log.dutyId);
        if (legs.length === 1) {
          groups.push({ type: 'single', id: log.id, log });
        } else {
          groups.push({ type: 'duty', id: log.dutyId, legs });
        }
      }
    }
    return groups;
  }, [filteredLogs]);

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this flight from your logbook?')) return;
    await flightLogApi.delete(id);
    dispatch(removeLog(id));
  };

  const handleSaveNew = async (payload) => {
    const { data } = await flightLogApi.create(payload);
    dispatch(addLog(data));
    fetchData();
  };

  const handleSaveEdit = async (payload) => {
    await flightLogApi.update(editFlight.id, payload);
    fetchData();
  };

  const handleSaveClone = async (payload) => {
    const { data } = await flightLogApi.create(payload);
    dispatch(addLog(data));
    fetchData();
  };

  const handleSaveBulk = async (payloads) => {
    await flightLogApi.bulkCreate({ legs: payloads });
    fetchData();
  };

  const TOTALS_DISPLAY = [
    { key: 'totalTime', label: 'Block Hours' },
    { key: 'picTime', label: 'PIC Hours' },
    { key: 'sicTime', label: 'SIC Hours' },
    { key: 'multiEngineTime', label: 'Multi-Engine' },
    { key: 'turbineTime', label: 'Turbine' },
    { key: 'instrumentTime', label: 'Instrument' },
    { key: 'nightTime', label: 'Night' },
  ];

  const saveCarryForward = () => {
    const parsed = {};
    Object.entries(carryForwardForm).forEach(([k, v]) => {
      parsed[k] = k === 'aircraftType' ? (v || '') : (parseFloat(v) || 0);
    });
    setCarryForward(parsed);
    localStorage.setItem('logbook_carry_forward', JSON.stringify(parsed));
    setCarryForwardSaved(true);
    setTimeout(() => setCarryForwardSaved(false), 2000);
  };

  const totalWithCarry = (key) => ((totals?.[key] || 0) + (carryForward[key] || 0)).toFixed(1);

  const cloneInitial = cloneFlight ? { ...cloneFlight, date: '' } : null;

  const cfHasSavedData = Object.entries(carryForward).some(([k, v]) => k !== 'aircraftType' && v > 0);

  return (
    <div>
      <div style={css.totalsGrid}>
        {TOTALS_DISPLAY.map(({ key, label }) => (
          <div key={key} style={css.totalCard}>
            <div style={css.totalValue}>{totalWithCarry(key)}</div>
            <div style={css.totalLabel}>{label}</div>
            {carryForward[key] > 0 && (
              <div style={{ fontSize: 10, color: '#4A6080', marginTop: 2 }}>
                +{carryForward[key].toFixed(1)} carry-fwd
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Previous / Carry-Forward Hours */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => {
            setShowCarryForward((v) => !v);
            setCarryForwardForm(Object.fromEntries(Object.entries(carryForward).map(([k, v]) => [k, v || ''])));
          }}
          onMouseEnter={() => setCfHover(true)}
          onMouseLeave={() => setCfHover(false)}
          style={{
            background: '#0D1E35',
            border: `1px solid ${cfHover ? '#00B4D8' : 'rgba(0,180,216,0.25)'}`,
            borderRadius: 10,
            padding: '12px 18px',
            color: '#D0E8F8',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            textAlign: 'left',
            transition: 'border-color 0.15s',
          }}
        >
          <Clock size={15} color="#00B4D8" />
          Previous / carry-forward hours
          {cfHasSavedData && (
            <span style={{ background: '#00B4D820', border: '1px solid #00B4D840', color: '#00B4D8', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 7px' }}>
              {carryForward.aircraftType ? carryForward.aircraftType : 'active'}
            </span>
          )}
          <ChevronDown
            size={14}
            color="#4A6080"
            style={{ marginLeft: 'auto', transform: showCarryForward ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
          />
        </button>

        {showCarryForward && (
          <div style={{ background: '#0D1E35', border: '1px solid #1E3050', borderRadius: '0 0 10px 10px', borderTop: 'none', padding: 20 }}>
            <div style={{ fontSize: 12, color: '#7A8CA0', marginBottom: 14 }}>
              Enter hours from your previous logbooks. These are added to the totals above.
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#7A8CA0', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Aircraft Type</label>
              <input
                type="text"
                style={{ width: '100%', maxWidth: 240, background: '#1B2B4B', border: '1px solid #243050', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                value={carryForwardForm.aircraftType ?? ''}
                onChange={(e) => setCarryForwardForm((f) => ({ ...f, aircraftType: e.target.value }))}
                placeholder="e.g. A320, B737"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {TOTALS_DISPLAY.map(({ key, label }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: 11, color: '#7A8CA0', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</label>
                  <input
                    type="number" min="0" step="0.1"
                    style={{ width: '100%', background: '#1B2B4B', border: '1px solid #243050', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    value={carryForwardForm[key] ?? ''}
                    onChange={(e) => setCarryForwardForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder="0.0"
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
              <button
                onClick={saveCarryForward}
                style={{ background: 'linear-gradient(135deg, #00B4D8, #0077A8)', border: 'none', borderRadius: 8, padding: '10px 22px', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                Save
              </button>
              {carryForwardSaved && <span style={{ color: '#2ECC71', fontSize: 13, fontWeight: 600 }}>&#x2713; Saved</span>}
            </div>
          </div>
        )}
      </div>

      {/* Currency card */}
      <div style={css.currencyCard}>
        <span style={css.currencyTitle}>Currency (90 days)</span>
        <span style={currency.dayCurrent ? css.pillCurrent : css.pillNotCurrent}>
          {currency.dayCurrent ? '✓ Day Current' : '✕ Day Not Current'}
        </span>
        <span style={currency.nightCurrent ? css.pillCurrent : css.pillNotCurrent}>
          {currency.nightCurrent ? '✓ Night Current' : '✕ Night Not Current'}
        </span>
      </div>

      <div style={css.toolbar}>
        <button style={css.addBtn} onClick={() => setShowModal(true)}>+ Log a Flight</button>
        <button
          style={{ ...css.importBtn, display: 'inline-flex', alignItems: 'center', gap: 7 }}
          onClick={() => setShowImport(true)}
        >
          <Upload size={14} /> Import
        </button>
        <span style={{ color: '#4A6080', fontSize: 13, marginLeft: 'auto' }}>
          {groupedRows.length} {groupedRows.length !== logs.length ? `entries (${logs.length} sectors)` : 'flights'}
        </span>
      </div>

      <input
        style={css.searchBar}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by aircraft, registration, or airport..."
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#7A8CA0' }}>Loading your logbook...</div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ ...css.table, minWidth: 700 }}>
            <thead>
              <tr>
                {['Date', 'Aircraft', 'Route', 'Block', 'PIC', 'Multi', 'Turbine', 'Night', 'Ldg', ''].map((h) => (
                  <th key={h} style={css.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedRows.length === 0 && (
                <tr><td colSpan={10} style={css.emptyRow}>
                  {search ? 'No flights match your search.' : 'No flights logged yet. Click "Log a Flight" to get started.'}
                </td></tr>
              )}
              {groupedRows.map((row) => {
                if (row.type === 'single') {
                  const log = row.log;
                  const blockHrs = blockTimeFromTimes(log.offBlocksTime, log.onBlocksTime);
                  const displayBlock = blockHrs !== null
                    ? `${blockHrs.toFixed(1)}h`
                    : (log.totalTime > 0 ? `${log.totalTime.toFixed(1)}h` : '—');
                  return (
                    <tr key={log.id}>
                      <td style={{ ...css.td, ...css.tdFirst, color: '#7A8CA0', fontSize: 12 }}>
                        {new Date(log.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={css.td}>
                        <div style={{ fontWeight: 600 }}>{log.aircraftType}</div>
                        {log.registration && <div style={css.route}>{log.registration}</div>}
                      </td>
                      <td style={css.td}>
                        {log.departure || log.arrival ? (
                          <div style={css.routeMain}>
                            {log.departure}
                            <span style={css.routeArrow}>&#x2192;</span>
                            {log.arrival}
                          </div>
                        ) : (
                          <span style={{ color: '#4A6080' }}>&#x2014;</span>
                        )}
                      </td>
                      <td style={{ ...css.td, ...css.hours }}>{displayBlock}</td>
                      <td style={css.td}>{log.picTime > 0 ? log.picTime.toFixed(1) : '—'}</td>
                      <td style={css.td}>{log.multiEngineTime > 0 ? log.multiEngineTime.toFixed(1) : '—'}</td>
                      <td style={css.td}>{log.turbineTime > 0 ? log.turbineTime.toFixed(1) : '—'}</td>
                      <td style={css.td}>{log.nightTime > 0 ? log.nightTime.toFixed(1) : '—'}</td>
                      <td style={css.td}>{(log.landingsDay || 0) + (log.landingsNight || 0)}</td>
                      <td style={{ ...css.td, ...css.tdLast, whiteSpace: 'nowrap' }}>
                        <button style={css.editBtn} onClick={() => setEditFlight(log)} title="Edit"><Pencil size={14} /></button>
                        <button style={css.cloneBtn} onClick={() => setCloneFlight(log)} title="Clone"><Copy size={14} /></button>
                        <button style={css.deleteBtn} onClick={() => handleDelete(log.id)} title="Delete"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                }

                const { id: dutyId, legs } = row;
                const first = legs[0];
                const last  = legs[legs.length - 1];
                const dutyBlock = (() => {
                  const b = blockTimeFromTimes(first.offBlocksTime, last.onBlocksTime);
                  if (b !== null) return `${b.toFixed(1)}h`;
                  const tot = legs.reduce((s, l) => s + (l.totalTime || 0), 0);
                  return tot > 0 ? `${tot.toFixed(1)}h` : '—';
                })();
                const totalPic     = legs.reduce((s, l) => s + (l.picTime || 0), 0);
                const totalMulti   = legs.reduce((s, l) => s + (l.multiEngineTime || 0), 0);
                const totalTurbine = legs.reduce((s, l) => s + (l.turbineTime || 0), 0);
                const totalNight   = legs.reduce((s, l) => s + (l.nightTime || 0), 0);
                const totalLdg     = legs.reduce((s, l) => s + (l.landingsDay || 0) + (l.landingsNight || 0), 0);
                const isExpanded   = expandedDuties.has(dutyId);

                return (
                  <React.Fragment key={dutyId}>
                    <tr onClick={() => toggleDuty(dutyId)} style={{ cursor: 'pointer' }}>
                      <td style={{ ...css.td, ...css.tdFirst, color: '#7A8CA0', fontSize: 12 }}>
                        {new Date(first.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={css.td}>
                        <div style={{ fontWeight: 600 }}>{first.aircraftType}</div>
                        {first.registration && <div style={css.route}>{first.registration}</div>}
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#00B4D8', background: 'rgba(0,180,216,0.12)', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4 }}>
                          {legs.length} sectors
                        </span>
                      </td>
                      <td style={css.td}>
                        <div style={css.routeMain}>
                          {first.departure || '?'}
                          <span style={css.routeArrow}>&#x2192;</span>
                          {last.arrival || '?'}
                        </div>
                        <div style={{ fontSize: 11, color: '#4A6080', marginTop: 3 }}>
                          {legs.map((l) => `${l.departure || '?'}→${l.arrival || '?'}`).join(' · ')}
                        </div>
                      </td>
                      <td style={{ ...css.td, ...css.hours }}>{dutyBlock}</td>
                      <td style={css.td}>{totalPic > 0 ? totalPic.toFixed(1) : '—'}</td>
                      <td style={css.td}>{totalMulti > 0 ? totalMulti.toFixed(1) : '—'}</td>
                      <td style={css.td}>{totalTurbine > 0 ? totalTurbine.toFixed(1) : '—'}</td>
                      <td style={css.td}>{totalNight > 0 ? totalNight.toFixed(1) : '—'}</td>
                      <td style={css.td}>{totalLdg}</td>
                      <td style={{ ...css.td, ...css.tdLast, color: '#7A8CA0' }}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </td>
                    </tr>
                    {isExpanded && legs.map((log, idx) => {
                      const legBlock = blockTimeFromTimes(log.offBlocksTime, log.onBlocksTime);
                      const legBlockDisplay = legBlock !== null ? `${legBlock.toFixed(1)}h` : (log.totalTime > 0 ? `${log.totalTime.toFixed(1)}h` : '—');
                      return (
                        <tr key={log.id} style={{ opacity: 0.9 }}>
                          <td style={{ ...css.td, ...css.tdFirst, color: '#4A6080', fontSize: 11, paddingLeft: 28 }}>
                            Leg {idx + 1}
                          </td>
                          <td style={{ ...css.td, color: '#4A6080', fontSize: 12 }}>—</td>
                          <td style={css.td}>
                            <div style={css.routeMain}>
                              {log.departure}
                              <span style={css.routeArrow}>&#x2192;</span>
                              {log.arrival}
                            </div>
                          </td>
                          <td style={{ ...css.td, ...css.hours, fontSize: 13 }}>{legBlockDisplay}</td>
                          <td style={{ ...css.td, fontSize: 13 }}>{log.picTime > 0 ? log.picTime.toFixed(1) : '—'}</td>
                          <td style={{ ...css.td, fontSize: 13 }}>{log.multiEngineTime > 0 ? log.multiEngineTime.toFixed(1) : '—'}</td>
                          <td style={{ ...css.td, fontSize: 13 }}>{log.turbineTime > 0 ? log.turbineTime.toFixed(1) : '—'}</td>
                          <td style={{ ...css.td, fontSize: 13 }}>{log.nightTime > 0 ? log.nightTime.toFixed(1) : '—'}</td>
                          <td style={{ ...css.td, fontSize: 13 }}>{(log.landingsDay || 0) + (log.landingsNight || 0)}</td>
                          <td style={{ ...css.td, ...css.tdLast, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            <button style={css.editBtn} onClick={() => setEditFlight(log)} title="Edit"><Pencil size={14} /></button>
                            <button style={css.cloneBtn} onClick={() => setCloneFlight(log)} title="Clone"><Copy size={14} /></button>
                            <button style={css.deleteBtn} onClick={() => handleDelete(log.id)} title="Delete"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AddFlightModal
          onClose={() => setShowModal(false)}
          onSave={handleSaveNew}
          onSaveBulk={handleSaveBulk}
          title="Log a Flight"
        />
      )}

      {editFlight && (
        <AddFlightModal
          onClose={() => setEditFlight(null)}
          onSave={handleSaveEdit}
          initial={editFlight}
          title="Edit Flight"
        />
      )}

      {cloneFlight && (
        <AddFlightModal
          onClose={() => setCloneFlight(null)}
          onSave={handleSaveClone}
          initial={cloneInitial}
          title="Clone Flight"
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImportDone={fetchData}
        />
      )}
    </div>
  );
}
