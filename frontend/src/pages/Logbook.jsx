import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { flightLogApi, profileApi } from '../services/api';
import { setLogs, setTotals, addLog, removeLog } from '../store';

const css = {
  totalsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 14, marginBottom: 32,
  },
  totalCard: {
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 14,
    padding: '18px 16px', textAlign: 'center',
  },
  totalValue: { fontSize: 26, fontWeight: 800, color: '#00B4D8', marginBottom: 4 },
  totalLabel: { fontSize: 11, color: '#4A6080', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  toolbar: { display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center' },
  addBtn: {
    background: 'linear-gradient(135deg, #00B4D8, #0077A8)',
    border: 'none', borderRadius: 10, padding: '11px 20px',
    color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
  importBtn: {
    background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10,
    padding: '11px 20px', color: '#7A8CA0', fontWeight: 600, fontSize: 14, cursor: 'pointer',
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
    fontSize: 16, padding: 4,
  },
  hours: { color: '#00B4D8', fontWeight: 700 },
  route: { color: '#7A8CA0', fontSize: 12, marginTop: 2 },
  emptyRow: { textAlign: 'center', padding: '60px 0', color: '#4A6080' },

  // Modal
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 24,
  },
  modal: {
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 20,
    padding: 36, maxWidth: 680, width: '100%', maxHeight: '90vh', overflowY: 'auto',
  },
  modalTitle: { fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 24 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  formFull: { gridColumn: '1 / -1' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#7A8CA0', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  hint: { fontSize: 11, color: '#4A6080', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 },
  input: {
    width: '100%', background: '#1B2B4B', border: '1px solid #243050',
    borderRadius: 8, padding: '11px 12px', color: '#fff', fontSize: 14, outline: 'none',
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

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  aircraftType: '', registration: '',
  departure: '', arrival: '',
  totalTime: '', picTime: '', sicTime: '',
  multiEngineTime: '', turbineTime: '',
  instrumentTime: '', nightTime: '',
  landingsDay: '', landingsNight: '',
  remarks: '',
};

function AddFlightModal({ onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.date || !form.aircraftType || !form.totalTime) {
      return setError('Date, aircraft type, and total time are required.');
    }
    setSaving(true);
    try {
      await onSave({
        ...form,
        date: new Date(form.date).toISOString(),
        totalTime: parseFloat(form.totalTime) || 0,
        picTime: parseFloat(form.picTime) || 0,
        sicTime: parseFloat(form.sicTime) || 0,
        multiEngineTime: parseFloat(form.multiEngineTime) || 0,
        turbineTime: parseFloat(form.turbineTime) || 0,
        instrumentTime: parseFloat(form.instrumentTime) || 0,
        nightTime: parseFloat(form.nightTime) || 0,
        landingsDay: parseInt(form.landingsDay) || 0,
        landingsNight: parseInt(form.landingsNight) || 0,
      });
      onClose();
    } catch {
      setError('Could not save flight. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ k, label, hint, span, type = 'text' }) => (
    <div style={span === 'full' ? css.formFull : {}}>
      <label style={css.label}>{label}{hint && <span style={css.hint}>{hint}</span>}</label>
      <input style={css.input} type={type} value={form[k]} onChange={set(k)}
        placeholder={hint?.replace('e.g. ', '') || ''} />
    </div>
  );

  return (
    <div style={css.overlay}>
      <div style={css.modal}>
        <div style={css.modalTitle}>Log a Flight</div>
        {error && (
          <div style={{ background: '#2D1A1A', border: '1px solid #5C2626', borderRadius: 8, padding: '10px 14px', color: '#FF6B6B', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={css.sectionTitle}>✈  Flight Details</div>
        <div style={css.formGrid}>
          <Field k="date" label="Date *" type="date" />
          <Field k="aircraftType" label="Aircraft Type *" hint="e.g. B737, A320, C172" />
          <Field k="registration" label="Registration" hint="e.g. A6-EKA" />
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><Field k="departure" label="From" hint="e.g. OMDB" /></div>
            <div style={{ paddingBottom: 10, color: '#4A6080', fontSize: 18 }}>→</div>
            <div style={{ flex: 1 }}><Field k="arrival" label="To" hint="e.g. EGLL" /></div>
          </div>
        </div>

        <div style={css.sectionTitle}>⏱  Flight Hours  <span style={{ fontSize: 11, color: '#4A6080', fontWeight: 400 }}>Enter as decimals — 1h 30m = 1.5</span></div>
        <div style={css.formGrid}>
          <Field k="totalTime" label="Total Time *" type="number" />
          <Field k="picTime" label="PIC (Captain)" type="number" />
          <Field k="sicTime" label="SIC (Co-pilot)" type="number" />
          <Field k="multiEngineTime" label="Multi-Engine" type="number" />
          <Field k="turbineTime" label="Turbine" type="number" />
          <Field k="instrumentTime" label="Instrument (IMC)" type="number" />
          <Field k="nightTime" label="Night" type="number" />
        </div>

        <div style={css.sectionTitle}>🛬  Landings</div>
        <div style={css.formGrid}>
          <Field k="landingsDay" label="Day Landings" type="number" />
          <Field k="landingsNight" label="Night Landings" type="number" />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={css.label}>Remarks</label>
          <textarea
            style={{ ...css.input, height: 70, resize: 'vertical', fontFamily: 'inherit' }}
            value={form.remarks}
            onChange={set('remarks')}
            placeholder="Any notes about this flight..."
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button style={css.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...css.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Flight'}
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

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this flight from your logbook?')) return;
    await flightLogApi.delete(id);
    dispatch(removeLog(id));
  };

  const handleSave = async (payload) => {
    const { data } = await flightLogApi.create(payload);
    dispatch(addLog(data));
    fetchData();
  };

  const TOTALS_DISPLAY = [
    { key: 'totalTime', label: 'Total Hours' },
    { key: 'picTime', label: 'PIC Hours' },
    { key: 'sicTime', label: 'SIC Hours' },
    { key: 'multiEngineTime', label: 'Multi-Engine' },
    { key: 'turbineTime', label: 'Turbine' },
    { key: 'instrumentTime', label: 'Instrument' },
    { key: 'nightTime', label: 'Night' },
  ];

  return (
    <div>
      {totals && (
        <div style={css.totalsGrid}>
          {TOTALS_DISPLAY.map(({ key, label }) => (
            <div key={key} style={css.totalCard}>
              <div style={css.totalValue}>{(totals[key] || 0).toFixed(1)}</div>
              <div style={css.totalLabel}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={css.toolbar}>
        <button style={css.addBtn} onClick={() => setShowModal(true)}>+ Log a Flight</button>
        <label style={css.importBtn}>
          ↑ Import from ForeFlight / Logbook Pro
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const src = window.prompt('Which app?\n\nType: FOREFLIGHT or LOGBOOK_PRO');
            if (!src) return;
            const fd = new FormData();
            fd.append('file', file);
            fd.append('source', src.toUpperCase());
            try {
              const { data } = await flightLogApi.import(fd);
              alert(`✅ ${data.imported} flights imported successfully!`);
              fetchData();
            } catch {
              alert('Import failed. Check the file format and try again.');
            }
          }} />
        </label>
        <span style={{ color: '#4A6080', fontSize: 13, marginLeft: 'auto' }}>{logs.length} flights</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#7A8CA0' }}>Loading your logbook...</div>
      ) : (
        <table style={css.table}>
          <thead>
            <tr>
              {['Date', 'Aircraft', 'Route', 'Total', 'PIC', 'Multi', 'Turbine', 'Night', ''].map((h) => (
                <th key={h} style={css.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr><td colSpan={9} style={css.emptyRow}>No flights logged yet. Click "Log a Flight" to get started.</td></tr>
            )}
            {logs.map((log) => (
              <tr key={log.id}>
                <td style={{ ...css.td, ...css.tdFirst, color: '#7A8CA0', fontSize: 12 }}>
                  {new Date(log.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td style={css.td}>
                  <div style={{ fontWeight: 600 }}>{log.aircraftType}</div>
                  {log.registration && <div style={css.route}>{log.registration}</div>}
                </td>
                <td style={css.td}>
                  {log.departure || log.arrival
                    ? <div style={css.route}>{log.departure} → {log.arrival}</div>
                    : <span style={{ color: '#4A6080' }}>—</span>}
                </td>
                <td style={{ ...css.td, ...css.hours }}>{log.totalTime.toFixed(1)}</td>
                <td style={css.td}>{log.picTime > 0 ? log.picTime.toFixed(1) : '—'}</td>
                <td style={css.td}>{log.multiEngineTime > 0 ? log.multiEngineTime.toFixed(1) : '—'}</td>
                <td style={css.td}>{log.turbineTime > 0 ? log.turbineTime.toFixed(1) : '—'}</td>
                <td style={css.td}>{log.nightTime > 0 ? log.nightTime.toFixed(1) : '—'}</td>
                <td style={{ ...css.td, ...css.tdLast }}>
                  <button style={css.deleteBtn} onClick={() => handleDelete(log.id)} title="Delete">🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && <AddFlightModal onClose={() => setShowModal(false)} onSave={handleSave} />}
    </div>
  );
}
