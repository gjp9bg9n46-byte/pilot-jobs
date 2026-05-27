import React, { useState, useMemo, useRef } from 'react';
import { ChevronDown, ChevronUp, Upload, FileText, Table2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { flightLogApi } from '../services/api';
import { useIsMobile } from '../hooks/useIsMobile';

// ─── Field label map (for mapping dropdowns) ─────────────────────────────────
const FIELD_LABELS = {
  date:            'Date *',
  flightNumber:    'Flight Number',
  aircraftType:    'Aircraft Type',
  registration:    'Registration',
  departure:       'Departure (ICAO)',
  arrival:         'Arrival (ICAO)',
  offBlocksTime:   'Off Blocks',
  onBlocksTime:    'On Blocks',
  takeoffTime:     'Takeoff Time',
  landingTime:     'Landing Time',
  picName:         'Captain (PIC)',
  sicName:         'First Officer (SIC)',
  picTime:         'PIC Hours',
  sicTime:         'SIC Hours',
  totalTime:       'Total / Block Time',
  nightTime:       'Night Time',
  instrumentTime:  'Instrument Time',
  multiEngineTime: 'Multi-Engine',
  turbineTime:     'Turbine',
  landingsDay:     'Day Landings',
  landingsNight:   'Night Landings',
  remarks:         'Remarks',
};

// Required field — import blocked if unmapped
const REQUIRED_FIELDS = ['date'];
// Important optional fields shown prominently in mapping UI
const KEY_FIELDS = ['date', 'departure', 'arrival', 'registration', 'offBlocksTime', 'onBlocksTime'];

// ─── Client-side validation (lightweight) ────────────────────────────────────
function clientValidate(fields) {
  const date = (fields.date || '').toString().trim();
  if (!date) return 'Missing date';
  const looksOk =
    /^\d{4}-\d{2}-\d{2}/.test(date) ||
    /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(date) ||
    /^\d{1,2}[\s\/\-][A-Za-z]{3}[\s\/\-]\d{2,4}$/.test(date) ||
    /^\d{4,5}$/.test(date);
  if (!looksOk) return `Invalid date: "${date}"`;
  return null;
}

// Apply fieldName→headerName mapping to rawRows, return displayRows
function applyMapping(rawRows, headers, mapping, duplicateSet = new Set()) {
  const headerIdx = {};
  headers.forEach((h, i) => { headerIdx[h] = i; });

  return rawRows
    .map((raw, i) => {
      const fields = {};
      for (const [field, header] of Object.entries(mapping)) {
        if (header && headerIdx[header] !== undefined) {
          fields[field] = raw[headerIdx[header]] ?? '';
        }
      }
      if (Object.values(fields).every(v => !v)) return null; // skip blank rows
      const error = clientValidate(fields);
      return { rowIndex: i + 1, fields, error, duplicate: duplicateSet.has(i) };
    })
    .filter(Boolean);
}

function formatRoute(fields) {
  const dep = (fields.departure || '').toUpperCase();
  const arr = (fields.arrival || '').toUpperCase();
  if (dep && arr) return `${dep} → ${arr}`;
  return dep || arr || '—';
}

function formatBlock(fields) {
  const off = fields.offBlocksTime;
  const on  = fields.onBlocksTime;
  if (off && on) {
    const parseMin = t => { const [h, m] = (t || '').split(':').map(Number); return h * 60 + m; };
    const offM = parseMin(off), onM = parseMin(on);
    if (!isNaN(offM) && !isNaN(onM)) {
      const diff = onM >= offM ? onM - offM : 1440 - offM + onM;
      return `${(diff / 60).toFixed(1)}h`;
    }
  }
  if (fields.totalTime) return `${parseFloat(fields.totalTime).toFixed(1)}h`;
  return '—';
}

// ─── Inline styles ────────────────────────────────────────────────────────────
const css = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 12,
  },
  modal: {
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 20,
    width: '100%', maxWidth: 820, maxHeight: '92dvh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    padding: '20px 24px 16px', borderBottom: '1px solid #1E3050',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
  },
  title: { fontSize: 18, fontWeight: 800, color: '#fff' },
  body: { flex: 1, overflowY: 'auto', padding: '20px 24px' },
  footer: {
    padding: '16px 24px', borderTop: '1px solid #1E3050',
    display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0,
  },
  cancelBtn: {
    background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10,
    padding: '11px 20px', color: '#7A8CA0', fontWeight: 600, fontSize: 14, cursor: 'pointer',
  },
  primaryBtn: (disabled) => ({
    background: disabled ? '#1B2B4B' : 'linear-gradient(135deg, #00B4D8, #0077A8)',
    border: 'none', borderRadius: 10, padding: '11px 22px',
    color: disabled ? '#4A6080' : '#fff', fontWeight: 700, fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  formatCard: (active) => ({
    flex: 1, padding: '20px 16px', borderRadius: 14, cursor: 'pointer', textAlign: 'center',
    background: active ? 'rgba(0,180,216,0.1)' : '#1B2B4B',
    border: `2px solid ${active ? '#00B4D8' : '#243050'}`,
    transition: 'all 0.15s',
  }),
  dropZone: (drag) => ({
    border: `2px dashed ${drag ? '#00B4D8' : '#243050'}`,
    borderRadius: 14, padding: '48px 24px', textAlign: 'center',
    background: drag ? 'rgba(0,180,216,0.06)' : '#1B2B4B',
    cursor: 'pointer', transition: 'all 0.15s',
  }),
  errorBanner: {
    background: '#2D1A1A', border: '1px solid #5C2626', borderRadius: 8,
    padding: '10px 14px', color: '#FF6B6B', fontSize: 13, marginBottom: 16,
  },
  statsBar: {
    display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
    padding: '12px 16px', background: '#0A1628', borderRadius: 10, marginBottom: 16,
    fontSize: 13,
  },
  mappingSection: {
    background: '#0A1628', border: '1px solid #1E3050', borderRadius: 10, marginBottom: 16,
  },
  mappingHeader: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
    cursor: 'pointer', userSelect: 'none',
  },
  mappingBody: { padding: '0 16px 16px' },
  tableWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  th: {
    fontSize: 11, fontWeight: 700, color: '#4A6080', textTransform: 'uppercase',
    letterSpacing: 0.5, padding: '0 12px 8px', textAlign: 'left', whiteSpace: 'nowrap',
  },
  td: { padding: '10px 12px', background: '#0A1628', fontSize: 13, color: '#fff', whiteSpace: 'nowrap' },
  tdFirst: { borderLeft: '1px solid #1E3050', borderRadius: '8px 0 0 8px', paddingLeft: 14 },
  tdLast:  { borderRight: '1px solid #1E3050', borderRadius: '0 8px 8px 0', paddingRight: 14 },
  select: {
    background: '#1B2B4B', border: '1px solid #243050', borderRadius: 6,
    padding: '7px 10px', color: '#fff', fontSize: 13, outline: 'none', cursor: 'pointer',
    width: '100%',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportModal({ onClose, onImportDone }) {
  const isMobile = useIsMobile();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState('source'); // source | preview | confirming | done
  const [format, setFormat] = useState('csv');
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // From /parse response
  const [parsedData, setParsedData] = useState(null); // { headers, mapping, rawRows }
  // User overrides to the auto-detected mapping
  const [userMapping, setUserMapping] = useState({});
  const [mappingOpen, setMappingOpen] = useState(false);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);

  // Result
  const [result, setResult] = useState(null); // { imported, skipped }

  // Effective mapping = server auto-detect + user overrides
  const effectiveMapping = useMemo(
    () => ({ ...(parsedData?.mapping ?? {}), ...userMapping }),
    [parsedData, userMapping]
  );

  // Derived display rows (re-computed when mapping changes — no API call)
  const displayRows = useMemo(() => {
    if (!parsedData) return [];
    const dupSet = new Set(parsedData.duplicateIndices || []);
    return applyMapping(parsedData.rawRows, parsedData.headers, effectiveMapping, dupSet);
  }, [parsedData, effectiveMapping]);

  const validRows     = useMemo(() => displayRows.filter(r => !r.error), [displayRows]);
  const errorRows     = useMemo(() => displayRows.filter(r =>  r.error), [displayRows]);
  const duplicateRows = useMemo(() => validRows.filter(r => r.duplicate), [validRows]);
  // Rows that will actually be submitted (excludes duplicates unless user opts in)
  const toImportRows  = useMemo(
    () => validRows.filter(r => includeDuplicates || !r.duplicate),
    [validRows, includeDuplicates]
  );
  const datesMapped = REQUIRED_FIELDS.every(f => effectiveMapping[f]);

  // Which columns to show in the preview table
  const previewCols = isMobile
    ? ['status', 'date', 'route', 'block']
    : ['status', 'date', 'route', 'registration', 'flightNumber', 'block', 'picTime'];

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleFile(file) {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await flightLogApi.importParse(fd);
      setParsedData(data);
      setUserMapping({});
      setStep('preview');
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not parse file.');
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleConfirm() {
    setError('');
    setStep('confirming');
    try {
      const toSubmit = toImportRows.map(r => r.fields);
      const { data } = await flightLogApi.importConfirm(toSubmit);
      setResult({ imported: data.imported, skipped: data.skipped });
      setStep('done');
      onImportDone?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Import failed. Please try again.');
      setStep('preview');
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={css.overlay}>
      <div style={css.modal}>
        {/* Header */}
        <div style={css.header}>
          <div style={css.title}>
            {step === 'done' ? 'Import Complete' : 'Import Flights'}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#7A8CA0', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={css.body}>

          {/* ── Step: source (format picker) ── */}
          {step === 'source' && (
            <>
              <div style={{ fontSize: 14, color: '#7A8CA0', marginBottom: 20 }}>
                Choose the file format to import from.
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                <div
                  style={css.formatCard(format === 'csv')}
                  onClick={() => setFormat('csv')}
                  role="button"
                >
                  <FileText size={28} color={format === 'csv' ? '#00B4D8' : '#4A6080'} style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 700, color: '#fff', marginBottom: 4 }}>CSV</div>
                  <div style={{ fontSize: 12, color: '#7A8CA0' }}>Comma-separated values</div>
                </div>
                <div
                  style={css.formatCard(format === 'xlsx')}
                  onClick={() => setFormat('xlsx')}
                  role="button"
                >
                  <Table2 size={28} color={format === 'xlsx' ? '#00B4D8' : '#4A6080'} style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 700, color: '#fff', marginBottom: 4 }}>Excel</div>
                  <div style={{ fontSize: 12, color: '#7A8CA0' }}>.xlsx spreadsheet</div>
                </div>
              </div>

              {format === 'xlsx' && (
                <div style={{ background: '#1B2B4B', border: '1px solid #243050', borderRadius: 8, padding: '10px 14px', color: '#7A8CA0', fontSize: 13, marginBottom: 20 }}>
                  Excel (.xlsx) support is coming soon. Please export your file as CSV for now.
                </div>
              )}

              {/* Drop zone (shown inline in source step as "Browse" shortcut) */}
              {format === 'csv' && (
                <div
                  style={css.dropZone(drag)}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={32} color="#4A6080" style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#D0E8F8', marginBottom: 6 }}>
                    {isMobile ? 'Tap to browse' : 'Drop your CSV here, or click to browse'}
                  </div>
                  <div style={{ fontSize: 12, color: '#4A6080' }}>
                    .csv files only · max 10 MB · max 500 rows
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFile(e.target.files[0])}
                  />
                </div>
              )}

              {uploading && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#7A8CA0', fontSize: 14 }}>
                  Parsing file…
                </div>
              )}

              {error && <div style={{ ...css.errorBanner, marginTop: 16 }}>{error}</div>}
            </>
          )}

          {/* ── Step: preview ── */}
          {(step === 'preview' || step === 'confirming') && parsedData && (
            <>
              {error && <div style={css.errorBanner}>{error}</div>}

              {/* Stats bar */}
              <div style={css.statsBar}>
                <span style={{ color: '#2ECC71', fontWeight: 700 }}>
                  ✓ {validRows.length} ready
                </span>
                {duplicateRows.length > 0 && (
                  <span style={{ color: '#F39C12', fontWeight: 700 }}>
                    ⚠ {duplicateRows.length} {duplicateRows.length === 1 ? 'duplicate' : 'duplicates'}
                  </span>
                )}
                {errorRows.length > 0 && (
                  <span style={{ color: '#FF4757', fontWeight: 700 }}>
                    ✗ {errorRows.length} {errorRows.length === 1 ? 'error' : 'errors'}
                  </span>
                )}
                <span style={{ color: '#4A6080', marginLeft: 'auto', fontSize: 12 }}>
                  {parsedData.rawRows.length} rows parsed from file
                </span>
              </div>

              {/* Include duplicates checkbox — only shown when duplicates exist */}
              {duplicateRows.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#7A8CA0', cursor: 'pointer', marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    checked={includeDuplicates}
                    onChange={e => setIncludeDuplicates(e.target.checked)}
                    style={{ accentColor: '#00B4D8', width: 15, height: 15 }}
                  />
                  Include duplicates in import ({duplicateRows.length} flight{duplicateRows.length !== 1 ? 's' : ''} already in your logbook)
                </label>
              )}

              {/* Column mapping section */}
              <div style={css.mappingSection}>
                <div style={css.mappingHeader} onClick={() => setMappingOpen(v => !v)}>
                  {datesMapped ? (
                    <CheckCircle2 size={15} color="#2ECC71" />
                  ) : (
                    <AlertTriangle size={15} color="#F39C12" />
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600, color: datesMapped ? '#2ECC71' : '#F39C12', flex: 1 }}>
                    {datesMapped
                      ? `Column mapping — ${Object.keys(effectiveMapping).length} fields detected`
                      : 'Column mapping — date column not detected (required)'}
                  </span>
                  {mappingOpen ? <ChevronUp size={14} color="#4A6080" /> : <ChevronDown size={14} color="#4A6080" />}
                </div>

                {mappingOpen && (
                  <div style={css.mappingBody}>
                    <div style={{ fontSize: 12, color: '#7A8CA0', marginBottom: 12 }}>
                      Map each field to a column from your file. Leave blank to skip.
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: 10,
                    }}>
                      {Object.entries(FIELD_LABELS).map(([field, label]) => {
                        const isRequired = REQUIRED_FIELDS.includes(field);
                        const current = effectiveMapping[field] || '';
                        return (
                          <div key={field}>
                            <label style={{ display: 'block', fontSize: 11, color: isRequired ? '#F39C12' : '#7A8CA0', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                              {label}
                            </label>
                            <select
                              value={current}
                              onChange={(e) => setUserMapping(m => ({ ...m, [field]: e.target.value || undefined }))}
                              style={css.select}
                            >
                              <option value="">(not mapped)</option>
                              {parsedData.headers.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Preview table */}
              <div style={css.tableWrap}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', minWidth: isMobile ? 300 : 560 }}>
                  <thead>
                    <tr>
                      {previewCols.map(col => (
                        <th key={col} style={css.th}>
                          {col === 'status' ? '' : col === 'route' ? 'Route' : col === 'block' ? 'Block' : FIELD_LABELS[col]?.replace(' *', '') ?? col}
                        </th>
                      ))}
                      {errorRows.length > 0 && <th style={css.th}>Issue</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.slice(0, 200).map((row, i) => {
                      const isErr = !!row.error;
                      const isDup = !isErr && row.duplicate;
                      const rowStyle = {
                        ...css.td,
                        borderTop: '1px solid #1B2B4B',
                        borderBottom: '1px solid #1B2B4B',
                        background: isErr ? 'rgba(255,71,87,0.05)' : isDup ? 'rgba(243,156,18,0.04)' : '#0A1628',
                        color: isErr ? '#FF6B6B' : isDup ? '#C89A4A' : '#fff',
                      };
                      const cols = previewCols.map((col, ci) => {
                        let content = '';
                        if (col === 'status') content = isErr ? '✗' : isDup ? '⚠' : '✓';
                        else if (col === 'date') content = row.fields.date || '—';
                        else if (col === 'route') content = formatRoute(row.fields);
                        else if (col === 'block') content = formatBlock(row.fields);
                        else content = row.fields[col] || '—';
                        return (
                          <td
                            key={col}
                            style={{
                              ...rowStyle,
                              ...(ci === 0 ? css.tdFirst : {}),
                              ...(ci === previewCols.length - 1 && errorRows.length === 0 ? css.tdLast : {}),
                              color: col === 'status'
                                ? (isErr ? '#FF4757' : isDup ? '#F39C12' : '#2ECC71')
                                : col === 'route'
                                ? (isDup ? '#C89A4A' : '#D0E8F8')
                                : rowStyle.color,
                              fontWeight: col === 'status' ? 800 : col === 'route' ? 700 : 400,
                            }}
                          >
                            {content}
                          </td>
                        );
                      });
                      if (errorRows.length > 0) {
                        cols.push(
                          <td key="err" style={{ ...rowStyle, ...css.tdLast, fontSize: 12, color: '#FF4757' }}>
                            {row.error || ''}
                          </td>
                        );
                      }
                      return <tr key={row.rowIndex}>{cols}</tr>;
                    })}
                  </tbody>
                </table>
                {displayRows.length > 200 && (
                  <div style={{ padding: '10px 0', fontSize: 12, color: '#4A6080', textAlign: 'center' }}>
                    Showing first 200 of {displayRows.length} rows.
                  </div>
                )}
              </div>

              {!datesMapped && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.3)', borderRadius: 8, fontSize: 13, color: '#F39C12' }}>
                  The date column is required. Expand "Column mapping" above and map it before importing.
                </div>
              )}
            </>
          )}

          {/* ── Step: done ── */}
          {step === 'done' && result && (
            <div style={{ textAlign: 'center', padding: '32px 0 16px' }}>
              <CheckCircle2 size={52} color="#2ECC71" style={{ marginBottom: 16 }} />
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
                {result.imported} {result.imported === 1 ? 'flight' : 'flights'} imported
              </div>
              {result.skipped > 0 && (
                <div style={{ fontSize: 14, color: '#7A8CA0', marginBottom: 4 }}>
                  {result.skipped} {result.skipped === 1 ? 'row' : 'rows'} had errors and were skipped.
                </div>
              )}
              <div style={{ fontSize: 13, color: '#4A6080', marginTop: 8 }}>
                Your logbook has been updated.
              </div>
            </div>
          )}

        </div>{/* end body */}

        {/* Footer */}
        <div style={css.footer}>
          {step === 'done' ? (
            <button style={css.primaryBtn(false)} onClick={onClose}>Done</button>
          ) : step === 'source' ? (
            <button style={css.cancelBtn} onClick={onClose}>Cancel</button>
          ) : (
            <>
              <button
                style={{ ...css.cancelBtn, ...(step === 'confirming' ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
                onClick={step !== 'confirming' ? () => { setStep('source'); setParsedData(null); setError(''); setUserMapping({}); } : undefined}
                disabled={step === 'confirming'}
              >
                ← Back
              </button>
              <button
                style={css.primaryBtn(!datesMapped || toImportRows.length === 0 || step === 'confirming')}
                onClick={handleConfirm}
                disabled={!datesMapped || toImportRows.length === 0 || step === 'confirming'}
              >
                {step === 'confirming'
                  ? 'Importing…'
                  : `Import ${toImportRows.length} ${toImportRows.length === 1 ? 'Flight' : 'Flights'}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
