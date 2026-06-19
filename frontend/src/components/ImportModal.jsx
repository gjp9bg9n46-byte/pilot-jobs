import React, { useState, useMemo, useRef } from 'react';
import { ChevronDown, ChevronUp, Upload, FileText, Table2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { flightLogApi } from '../services/api';
import { useIsMobile } from '../hooks/useIsMobile';
import { Input, Button, Modal } from './primitives';

// Semantic status colors remapped to light-AA shades (meaning preserved):
//   dark #2ECC71 → #166534 (ok), #F39C12/#C89A4A → #92400E (warn/duplicate),
//   #FF4757/#FF6B6B → #991B1B (error). Matches the Badge palette.
const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };

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

// RFC-4180 cell escaping — used to serialize parsed Excel rows back into a CSV
// string that flows through the SAME server parse endpoint as a real CSV upload
// (so xlsx gets identical auto-mapping + duplicate detection, no backend change).
function toCsvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ─── Inline styles ─── (overlay/modal/header/title/body retired — now uses the
// <Modal size="lg"> primitive for backdrop, title, X, scroll-lock, focus, escape)
const css = {
  footer: {
    padding: '16px 24px', borderTop: '1px solid var(--border)',
    display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0,
  },
  formatCard: (active) => ({
    flex: 1, padding: '20px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
    background: active ? 'rgba(0,63,136,0.06)' : 'var(--bg)',
    border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    transition: 'all 0.15s',
  }),
  dropZone: (drag) => ({
    border: `2px dashed ${drag ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 12, padding: '48px 24px', textAlign: 'center',
    background: drag ? 'rgba(0,63,136,0.04)' : 'var(--bg)',
    cursor: 'pointer', transition: 'all 0.15s',
  }),
  errorBanner: {
    background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8,
    padding: '10px 14px', color: '#991B1B', fontSize: 13, marginBottom: 16,
  },
  statsBar: {
    display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
    padding: '12px 16px', background: 'var(--bg)', borderRadius: 10, marginBottom: 16,
    fontSize: 13,
  },
  mappingSection: {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16,
  },
  mappingHeader: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
    cursor: 'pointer', userSelect: 'none',
  },
  mappingBody: { padding: '0 16px 16px' },
  tableWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  th: {
    fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase',
    letterSpacing: 0.5, padding: '0 12px 8px', textAlign: 'left', whiteSpace: 'nowrap',
  },
  td: { padding: '10px 12px', background: 'var(--surface)', fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap' },
  tdFirst: { borderLeft: '1px solid var(--border)', borderRadius: '8px 0 0 8px', paddingLeft: 14 },
  tdLast:  { borderRight: '1px solid var(--border)', borderRadius: '0 8px 8px 0', paddingRight: 14 },
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
  const [sheetNote, setSheetNote] = useState(''); // multi-sheet xlsx note for the preview

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

  // Excel (.xlsx/.xls): parse in-browser via SheetJS (lazy-loaded), take the first
  // sheet, serialize back to CSV, and reuse the exact CSV pipeline (server parse →
  // auto-map + duplicate detection → preview → confirm). Frontend-only; no backend change.
  async function handleExcelFile(file) {
    if (!file) return;
    setError('');
    setSheetNote('');
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      let workbook;
      try {
        const XLSX = await import('xlsx'); // dynamic import — keeps ~600KB off the main chunk
        workbook = XLSX.read(buf, { type: 'array', cellDates: true });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw Object.assign(new Error('This file has no readable sheets.'), { handled: true });
        }
        const firstSheet = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheet];
        // header:1 → array-of-arrays; raw:false applies cell formatting;
        // cellDates + dateNF normalize Excel serial dates to ISO strings.
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', blankrows: false });
        const nonEmpty = rows.filter((r) => Array.isArray(r) && r.some((c) => c != null && String(c).trim() !== ''));
        if (nonEmpty.length === 0) {
          throw Object.assign(new Error('The first sheet is empty.'), { handled: true });
        }
        // Header-only (or a benign non-spreadsheet that SheetJS parsed as one text
        // cell): catch client-side so we don't round-trip to the server for a 422.
        if (nonEmpty.length < 2) {
          throw Object.assign(new Error('The first sheet has no data rows — only a header row was found.'), { handled: true });
        }
        // Note (don't block) when other sheets are present — v1 uses the first only.
        if (workbook.SheetNames.length > 1) {
          const others = workbook.SheetNames.length - 1;
          setSheetNote(`Using sheet "${firstSheet}" — ${others} other sheet${others === 1 ? '' : 's'} ignored.`);
        }
        const csv = nonEmpty.map((row) => row.map(toCsvCell).join(',')).join('\r\n');
        const baseName = (file.name || 'import').replace(/\.[^.]+$/, '');
        const csvFile = new File([new Blob([csv], { type: 'text/csv' })], `${baseName}.csv`, { type: 'text/csv' });
        await handleFile(csvFile); // reuse the CSV path (sets parsedData + step=preview, manages its own errors)
      } catch (e) {
        if (e.handled) throw e;
        throw new Error("Couldn't read this file — it may be corrupted or in an unsupported format.");
      }
    } catch (err) {
      setError(err?.message || "Couldn't read this file.");
    } finally {
      setUploading(false);
    }
  }

  // Route a chosen/dropped file to the parser for the active format.
  function routeFile(file) {
    if (!file) return;
    if (format === 'xlsx') handleExcelFile(file);
    else handleFile(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) routeFile(file);
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
      const timedOut = err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '');
      setError(
        timedOut
          ? 'Import is taking longer than expected. Please try again or split the file into smaller batches.'
          : err?.response?.data?.error || err?.message || 'Import failed. Please try again.'
      );
      setStep('preview');
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal isOpen onClose={onClose} title={step === 'done' ? 'Import Complete' : 'Import Flights'} size="lg">
        <div>

          {/* ── Step: source (format picker) ── */}
          {step === 'source' && (
            <>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
                Choose the file format to import from.
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                <div
                  style={css.formatCard(format === 'csv')}
                  onClick={() => setFormat('csv')}
                  role="button"
                >
                  <FileText size={28} color={format === 'csv' ? 'var(--accent)' : 'var(--text-secondary)'} style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>CSV</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Comma-separated values</div>
                </div>
                <div
                  style={css.formatCard(format === 'xlsx')}
                  onClick={() => setFormat('xlsx')}
                  role="button"
                >
                  <Table2 size={28} color={format === 'xlsx' ? 'var(--accent)' : 'var(--text-secondary)'} style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Excel</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>.xlsx spreadsheet</div>
                </div>
              </div>

              {/* Drop zone — adapts to the selected format (CSV or Excel) */}
              <div
                style={css.dropZone(drag)}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={32} color="var(--text-secondary)" style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {isMobile
                    ? 'Tap to browse'
                    : `Drop your ${format === 'xlsx' ? 'Excel file' : 'CSV'} here, or click to browse`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {format === 'xlsx'
                    ? '.xlsx / .xls files · max 10 MB · max 5,000 rows · first sheet only'
                    : '.csv files only · max 10 MB · max 5,000 rows'}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={format === 'xlsx' ? '.xlsx,.xls' : '.csv'}
                  style={{ display: 'none' }}
                  onChange={(e) => routeFile(e.target.files[0])}
                />
              </div>

              {uploading && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
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
                <span style={{ color: SEM.green, fontWeight: 700 }}>
                  ✓ {validRows.length} ready
                </span>
                {duplicateRows.length > 0 && (
                  <span style={{ color: SEM.amber, fontWeight: 700 }}>
                    ⚠ {duplicateRows.length} {duplicateRows.length === 1 ? 'duplicate' : 'duplicates'}
                  </span>
                )}
                {errorRows.length > 0 && (
                  <span style={{ color: SEM.red, fontWeight: 700 }}>
                    ✗ {errorRows.length} {errorRows.length === 1 ? 'error' : 'errors'}
                  </span>
                )}
                <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto', fontSize: 12 }}>
                  {parsedData.rawRows.length} rows parsed from file
                </span>
              </div>

              {/* Multi-sheet note (xlsx only) — v1 uses the first sheet */}
              {sheetNote && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  <Table2 size={14} color="var(--text-secondary)" /> {sheetNote}
                </div>
              )}

              {/* Include duplicates checkbox — only shown when duplicates exist */}
              {duplicateRows.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    checked={includeDuplicates}
                    onChange={e => setIncludeDuplicates(e.target.checked)}
                    style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
                  />
                  Include duplicates in import ({duplicateRows.length} flight{duplicateRows.length !== 1 ? 's' : ''} already in your logbook)
                </label>
              )}

              {/* Column mapping section */}
              <div style={css.mappingSection}>
                <div style={css.mappingHeader} onClick={() => setMappingOpen(v => !v)}>
                  {datesMapped ? (
                    <CheckCircle2 size={15} color={SEM.green} />
                  ) : (
                    <AlertTriangle size={15} color={SEM.amber} />
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600, color: datesMapped ? SEM.green : SEM.amber, flex: 1 }}>
                    {datesMapped
                      ? `Column mapping — ${Object.keys(effectiveMapping).length} fields detected`
                      : 'Column mapping — date column not detected (required)'}
                  </span>
                  {mappingOpen ? <ChevronUp size={14} color="var(--text-secondary)" /> : <ChevronDown size={14} color="var(--text-secondary)" />}
                </div>

                {mappingOpen && (
                  <div style={css.mappingBody}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                      Map each field to a column from your file. Leave blank to skip.
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: 10,
                    }}>
                      {Object.entries(FIELD_LABELS).map(([field, label]) => {
                        const current = effectiveMapping[field] || '';
                        return (
                          <Input
                            key={field}
                            as="select"
                            label={label}
                            value={current}
                            onChange={(e) => setUserMapping(m => ({ ...m, [field]: e.target.value || undefined }))}
                            style={{ fontSize: 13, padding: '8px 10px' }}
                          >
                            <option value="">(not mapped)</option>
                            {parsedData.headers.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </Input>
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
                        borderTop: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        background: isErr ? '#FEF2F2' : isDup ? '#FFFBEB' : 'var(--surface)',
                        color: isErr ? SEM.red : isDup ? SEM.amber : 'var(--text-primary)',
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
                                ? (isErr ? SEM.red : isDup ? SEM.amber : SEM.green)
                                : col === 'route'
                                ? (isDup ? SEM.amber : 'var(--text-primary)')
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
                          <td key="err" style={{ ...rowStyle, ...css.tdLast, fontSize: 12, color: SEM.red }}>
                            {row.error || ''}
                          </td>
                        );
                      }
                      return <tr key={row.rowIndex}>{cols}</tr>;
                    })}
                  </tbody>
                </table>
                {displayRows.length > 200 && (
                  <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>
                    Showing first 200 of {displayRows.length} rows.
                  </div>
                )}
              </div>

              {!datesMapped && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(146,64,14,0.08)', border: '1px solid rgba(146,64,14,0.3)', borderRadius: 8, fontSize: 13, color: SEM.amber }}>
                  The date column is required. Expand "Column mapping" above and map it before importing.
                </div>
              )}
            </>
          )}

          {/* ── Step: done ── */}
          {step === 'done' && result && (
            <div style={{ textAlign: 'center', padding: '32px 0 16px' }}>
              <CheckCircle2 size={52} color={SEM.green} style={{ marginBottom: 16 }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 8 }}>
                {result.imported} {result.imported === 1 ? 'flight' : 'flights'} imported
              </div>
              {result.skipped > 0 && (
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {result.skipped} {result.skipped === 1 ? 'row' : 'rows'} had errors and were skipped.
                </div>
              )}
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                Your logbook has been updated.
              </div>
            </div>
          )}

        </div>{/* end body */}

        {/* Footer */}
        <div style={{ ...css.footer, paddingLeft: 0, paddingRight: 0, marginTop: 4 }}>
          {step === 'done' ? (
            <Button onClick={onClose}>Done</Button>
          ) : step === 'source' ? (
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={step !== 'confirming' ? () => { setStep('source'); setParsedData(null); setError(''); setUserMapping({}); setSheetNote(''); } : undefined}
                disabled={step === 'confirming'}
              >
                ← Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!datesMapped || toImportRows.length === 0 || step === 'confirming'}
              >
                {step === 'confirming'
                  ? 'Importing…'
                  : `Import ${toImportRows.length} ${toImportRows.length === 1 ? 'Flight' : 'Flights'}`}
              </Button>
            </>
          )}
        </div>
    </Modal>
  );
}
