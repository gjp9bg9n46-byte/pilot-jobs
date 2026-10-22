import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Camera, Check, Loader2, Upload } from 'lucide-react';
import LightPage from '../components/primitives/LightPage';
import Button from '../components/primitives/Button';
import SectorForm from '../components/logbook/SectorForm';
import RowCrop from '../components/logbook/RowCrop';
import ImportModal from '../components/ImportModal';
import { logbookApi, flightLogApi } from '../services/api';
import '../components/logbook/logbook.css';

/**
 * Add flights — the desktop half of the scan mockup.
 *
 * Drop a photo or a PDF on the left and the form on the right fills itself,
 * one tab per sector, amber where the server wants a second pair of eyes.
 * Nothing reaches the logbook until Save: the review is a staging area, and
 * the server re-checks every field it is sent.
 */
export default function AddFlights() {
  const navigate = useNavigate();
  // Return trip / Next leg / Duplicate arrive here with the flight filled in.
  const { state } = useLocation();
  const prefill = state?.manual || null;
  const fileRef = useRef(null);
  // Scanning is behind a server flag until its accuracy is signed off, so the
  // page opens on manual entry and only offers the scan when it is live.
  const [mode, setMode] = useState('manual');                     // scan | manual
  const [prefs, setPrefs] = useState(null);
  const [quota, setQuota] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [over, setOver] = useState(false);
  const [scan, setScan] = useState(null);            // { id, header, sectors }
  const [active, setActive] = useState(0);
  const [answered, setAnswered] = useState({});
  const [preview, setPreview] = useState(null);      // object URL of the dropped file
  const [showImport, setShowImport] = useState(false);
  const [saved, setSaved] = useState(null);
  // 'suggestion' | 'keep' — a flagged date cannot be saved until this is set.
  const [dateChoice, setDateChoice] = useState(null);
  const [manual, setManual] = useState({
    date: '', flightNumber: '', from: '', to: '', aircraftType: '', registration: '',
    out: '', off: '', on: '', in: '', pilotFlying: null, landings: '', commander: '', approach: '', remarks: '',
    ...(prefill || {}),
  });

  useEffect(() => {
    logbookApi.prefs().then(({ data }) => {
      setPrefs(data);
      // Remembered values fill the blanks; anything carried in from a return
      // trip or next leg stays exactly as it was handed over.
      setManual((m) => ({
        ...m,
        date: m.date || new Date().toISOString().slice(0, 10),
        aircraftType: m.aircraftType || data.last.aircraftType || '',
        registration: m.registration || data.last.registration || '',
        commander: m.commander || data.last.commander || '',
      }));
    }).catch(() => {});
    logbookApi.scanQuota()
      .then(({ data }) => { setQuota(data); if (data.enabled && !prefill) setMode('scan'); })
      .catch(() => {});
  }, []);

  const upload = useCallback(async (file) => {
    if (!file) return;
    setError(null); setBusy(true); setSaved(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
    const body = new FormData();
    body.append('file', file);
    try {
      const { data } = await logbookApi.scan(body);
      setScan(data);
      setActive(0);
      setQuota((q) => (q ? { ...q, left: data.scansLeftToday } : q));
    } catch (e) {
      setError(e?.response?.data?.error || "Couldn't read this photo — try again or enter manually.");
    } finally {
      setBusy(false);
    }
  }, [preview]);

  const onDrop = (e) => {
    e.preventDefault(); setOver(false);
    upload(e.dataTransfer.files?.[0]);
  };

  const setSector = (i, next) => setScan((s) => ({ ...s, sectors: s.sectors.map((x, n) => (n === i ? { ...x, ...next } : x)) }));
  const setHeader = (patch) => setScan((s) => ({ ...s, header: { ...s.header, ...patch } }));

  const saveScan = async () => {
    setBusy(true); setError(null);
    try {
      const { data } = await logbookApi.saveScan(scan.id, { header: scan.header, sectors: scan.sectors, dateChoice });
      setSaved(data);
      setScan(null);
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not save these flights.');
    } finally { setBusy(false); }
  };

  const saveManual = async () => {
    setBusy(true); setError(null);
    try {
      await flightLogApi.create({ ...manual, landings: manual.landings === '' ? undefined : Number(manual.landings) });
      navigate('/logbook');
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not save that flight.');
    } finally { setBusy(false); }
  };

  // Questions are optional: answering improves the record, ignoring one still
  // files the flight. Only the page date must be answered explicitly.
  const openQuestions = (i, sec) => (sec.questions || []).filter((q) => !answered[`${i}:${q.id}`]);
  const totalOpen = scan
    ? scan.sectors.reduce((n, sec, i) => n + (sec.duplicate || sec.include === false ? 0 : openQuestions(i, sec).length), 0)
    : 0;
  const keeping = scan ? scan.sectors.filter((s) => s.include !== false && !s.duplicate).length : 0;

  return (
    <LightPage>
      <div className="lb">
        <div className="lb-head">
          <div>
            <h1>{state?.title || 'Add flights'}</h1>
            <p className="sub">
              {state?.title
                ? 'Times only — the aircraft, crew and date came from the last flight.'
                : quota?.enabled ? 'From a voyage report photo or PDF, or type them in.' : 'Type the flight in, or import a file.'}
            </p>
          </div>
          <div className="lb-actions">
            <Button variant="secondary" onClick={() => setShowImport(true)} style={{ gap: 7 }}><Upload size={14} /> Import a file</Button>
            <Button variant="secondary" onClick={() => navigate('/logbook')}>Cancel</Button>
          </div>
        </div>

        {quota?.enabled && (
          <div className="lb-tabs" style={{ marginTop: 20 }}>
            <button type="button" className={mode === 'scan' ? 'on' : ''} onClick={() => setMode('scan')}>
              Scan a voyage report <span className="lb-beta">Beta</span>
            </button>
            <button type="button" className={mode === 'manual' ? 'on' : ''} onClick={() => setMode('manual')}>Enter manually</button>
          </div>
        )}

        {error && <div className="lb-warn" role="alert"><AlertTriangle size={16} style={{ color: 'var(--lb-amber)', flex: 'none' }} /><span>{error}</span></div>}

        {saved && (
          <div className="lb-card" style={{ padding: '18px 20px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <Check size={20} style={{ color: 'var(--lb-green)' }} />
            <div style={{ flex: 1 }}>
              <b>{saved.saved} {saved.saved === 1 ? 'flight' : 'flights'} added.</b>
              {saved.skipped > 0 && <span style={{ color: 'var(--text-secondary)' }}> {saved.skipped} already in your logbook, skipped.</span>}
              <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 4 }}>
                {saved.imageKept ? 'The photo is kept, as you asked.' : 'The photo has been deleted.'} Totals, your CV and your job matches are updated.
              </div>
            </div>
            <Button onClick={() => navigate('/logbook')}>View logbook</Button>
          </div>
        )}

        {mode === 'scan' && quota?.enabled ? (
          <div className="lb-wrap" style={{ marginTop: 16 }}>
            <div className="lb-card" style={{ padding: 16 }}>
              <div
                className={`lb-drop${over ? ' over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
              >
                {busy && !scan ? (
                  <><Loader2 size={22} className="spin" /><b>Reading the report…</b><span style={{ fontSize: 13 }}>This takes a few seconds.</span></>
                ) : preview ? (
                  <img src={preview} alt="The voyage report you uploaded" />
                ) : (
                  <>
                    <Camera size={26} style={{ color: 'var(--accent)' }} />
                    <b style={{ color: 'var(--text-primary)' }}>Drop a photo or PDF of your voyage report</b>
                    <span style={{ fontSize: 13 }}>
                      Every sector on it becomes a flight you check before saving.
                      <br />Reading handwriting is new here — check the amber fields against the photo.
                    </span>
                    <Button variant="secondary" onClick={() => fileRef.current?.click()} style={{ marginTop: 6 }}>Choose a file</Button>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <span>{scan ? `${scan.sectors.length} ${scan.sectors.length === 1 ? 'sector' : 'sectors'} read` : quota ? `${quota.left} of ${quota.limit} scans left today` : ''}</span>
                {preview && <button type="button" className="linklike" onClick={() => fileRef.current?.click()} style={{ background: 'none', border: 0, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>Replace photo</button>}
              </div>
            </div>

            <div className="lb-card" style={{ padding: '18px 22px' }}>
              {!scan ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
                  The form fills itself once a report is read. Times are taken as written (UTC); block, airborne and night are worked out here, never typed.
                </p>
              ) : (
                <>
                  <div className="lb-tabs">
                    {scan.sectors.map((s, i) => (
                      <button key={i} type="button" className={i === active ? 'on' : ''} onClick={() => setActive(i)}>
                        {s.flightNumber || `Sector ${i + 1}`} · {s.from}–{s.to}
                        {s.dayOffset > 0 && <span className="lb-nextday"> · {s.sectorDate}</span>}
                        {s.duplicate ? <span className="warnDot"> · already logged</span>
                          : openQuestions(i, s).length
                            ? <span className="warnDot"> · {openQuestions(i, s).length} quick {openQuestions(i, s).length === 1 ? 'question' : 'questions'}</span>
                            : null}
                      </button>
                    ))}
                  </div>

                  {/* Each question on the sector it belongs to, with its answer
                      one click away — never a reason the save is refused. */}
                  {openQuestions(active, scan.sectors[active] || {}).map((q) => (
                    <div className="lb-q" key={q.id}>
                      <p className="t">{q.title}</p>
                      <p className="b">{q.body}</p>
                      <div className="a">
                        {(q.actions || []).map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className={a.id === 'confirm' ? 'main' : undefined}
                            onClick={() => setAnswered((prev) => ({ ...prev, [`${active}:${q.id}`]: true }))}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="lb-gl"><span>Report</span><span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{scan.header.commander ? `Capt ${scan.header.commander}` : ''}</span></div>
                  <div className="lb-fg">
                    <div className={`lb-f span2${scan.header.flags?.date ? ' q' : ''}`}>
                      <label htmlFor="h-date">Date</label>
                      <input id="h-date" type="date" value={scan.header.date || ''} onChange={(e) => setHeader({ date: e.target.value })} />
                      {scan.header.flags?.date && (
                        <div className="why">
                          <p style={{ margin: 0 }}>{scan.header.flags.date.message}</p>
                          <div className="lb-choice">
                            {scan.header.dateSuggestion && (
                              <button
                                type="button"
                                className={dateChoice === 'suggestion' ? 'on' : undefined}
                                onClick={() => { setDateChoice('suggestion'); setHeader({ date: scan.header.dateSuggestion }); }}
                              >
                                Use {scan.header.dateSuggestion}
                              </button>
                            )}
                            <button
                              type="button"
                              className={dateChoice === 'keep' ? 'on' : undefined}
                              onClick={() => setDateChoice('keep')}
                            >
                              Keep {scan.header.date}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className={`lb-f${scan.header.flags?.aircraftType ? ' q' : ''}`}>
                      <label htmlFor="h-type">Type{scan.header.typeInferred && <span className="rem"> · inferred</span>}</label>
                      <input id="h-type" value={scan.header.aircraftType || ''} onChange={(e) => setHeader({ aircraftType: e.target.value })} />
                    </div>
                    <div className="lb-f span2">
                      <label htmlFor="h-reg">Registration</label>
                      <input id="h-reg" value={scan.header.registration || ''} onChange={(e) => setHeader({ registration: e.target.value })} />
                    </div>
                    <div className="lb-f span2">
                      <label htmlFor="h-role">Your role</label>
                      <select id="h-role" value={scan.header.pilotRole || 'SIC'} onChange={(e) => setHeader({ pilotRole: e.target.value })}>
                        <option value="SIC">First Officer (SIC)</option>
                        <option value="PIC">Captain (PIC)</option>
                      </select>
                    </div>
                  </div>

                  {/* The photo of this row, beside the fields to check */}
                  {scan.sectors[active] && Object.keys(scan.sectors[active].flags || {}).length > 0 && (
                    <RowCrop scanId={scan.id} index={active} />
                  )}

                  {scan.sectors[active] && (
                    <SectorForm
                      value={scan.sectors[active]}
                      flags={scan.sectors[active].flags || {}}
                      night={scan.sectors[active].night}
                      nightNote={scan.sectors[active].nightSource === 'form' ? 'from the report' : 'calculated'}
                      onChange={(next) => setSector(active, next)}
                    />
                  )}

                  <div className="lb-foot">
                    <span className="s">
                      {scan.header.flags?.date && !dateChoice
                        ? 'Choose which date these flights belong to before saving.'
                        : totalOpen > 0
                          ? `${totalOpen} quick ${totalOpen === 1 ? 'question' : 'questions'} above. Everything else is ready.`
                        : <>Nothing is saved until you click Save.{' '}
                          {scan.sectors.filter((x) => x.duplicate).map((x) => `${x.flightNumber || 'A sector'} is already in your logbook (${x.duplicateReason}) and will be skipped.`).join(' ')}</>}
                    </span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <Button variant="secondary" onClick={() => { logbookApi.discardScan(scan.id).catch(() => {}); setScan(null); setPreview(null); }}>Discard</Button>
                      <Button onClick={saveScan} disabled={busy || !keeping || (!!scan.header.flags?.date && !dateChoice)}>
                        {busy ? 'Saving…' : `Save ${keeping} ${keeping === 1 ? 'flight' : 'flights'}`}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="lb-card" style={{ padding: '18px 22px', marginTop: 16, maxWidth: 860 }}>
            {prefs && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F4F8FD', border: '1px solid #D3E1F2', borderRadius: 10, padding: '9px 12px', fontSize: 12.5 }}>
                <span>Preset: <b>{prefs.rolePresets.find((p) => p.key === prefs.rolePreset)?.label}</b> — {prefs.rolePreset === 'airline_captain' ? 'this flight is logged as PIC' : 'this flight is logged as SIC'}</span>
                <select
                  value={prefs.rolePreset}
                  onChange={async (e) => { const { data } = await logbookApi.updatePrefs({ rolePreset: e.target.value }); setPrefs(data); }}
                  style={{ border: 0, background: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}
                >
                  {prefs.rolePresets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
            )}
            <div className="lb-gl"><span>Flight</span></div>
            <div className="lb-fg">
              <div className="lb-f span2"><label htmlFor="m-date">Date</label><input id="m-date" type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></div>
              <div className="lb-f span2"><label htmlFor="m-type">Aircraft{prefs?.last.aircraftType && <span className="rem"> · remembered</span>}</label><input id="m-type" value={manual.aircraftType} onChange={(e) => setManual({ ...manual, aircraftType: e.target.value })} /></div>
              <div className="lb-f span2"><label htmlFor="m-reg">Registration{prefs?.last.registration && <span className="rem"> · remembered</span>}</label><input id="m-reg" value={manual.registration} onChange={(e) => setManual({ ...manual, registration: e.target.value })} /></div>
              <div className="lb-f span2"><label htmlFor="m-cmd">Commander{prefs?.last.commander && <span className="rem"> · remembered</span>}</label><input id="m-cmd" value={manual.commander} onChange={(e) => setManual({ ...manual, commander: e.target.value })} /></div>
            </div>
            <SectorForm value={manual} onChange={setManual} night={null} nightNote="calculated on save" />
            <div className="lb-foot">
              <span className="s">Block and night are worked out from your times.</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={() => navigate('/logbook')}>Cancel</Button>
                <Button onClick={saveManual} disabled={busy || !manual.date || !manual.from || !manual.to}>{busy ? 'Saving…' : 'Save flight'}</Button>
              </div>
            </div>
          </div>
        )}

        {showImport && <ImportModal onClose={() => setShowImport(false)} onImportDone={() => navigate('/logbook')} />}
      </div>
    </LightPage>
  );
}
