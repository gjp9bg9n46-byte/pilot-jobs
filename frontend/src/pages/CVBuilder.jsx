import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pdf } from '@react-pdf/renderer';
import { AlertCircle, CheckCircle2, Download, GripVertical, Link2, Share2 } from 'lucide-react';
import { LightPage } from '../components/primitives';
import { cvApi } from '../services/api';
import CvSheet, { ACCENTS } from '../components/cv/CvSheet';
import CvPdf from '../components/cv/CvPdf';
import '../components/cv/cvBuilder.css';

const SUMMARY_MAX = 600;
const SECTION_LABEL = {
  experience: 'Flight experience', licences: 'Licences & ratings', medical: 'Medical & English',
  training: 'Training', employment: 'Employment history', rtw: 'Right to work',
  education: 'Education & languages', photo: 'Photo',
};
// What each section is built from — the hint next to its name.
const SECTION_HINT = (k, counts) => ({
  experience: 'logbook',
  licences: counts.licences ? String(counts.licences) : null,
  training: counts.training ? String(counts.training) : null,
  rtw: counts.rtw ? String(counts.rtw) : null,
  education: counts.education ? String(counts.education) : null,
}[k] || null);

const DOT = { red: '#B42318', amber: '#B45309', green: '#15803D' };

export default function CVBuilder() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('preview');     // phone only
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(null);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const saveTimer = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data: d } = await cvApi.document();
      setData(d);
      setSummary(d.document.summary || '');
    } catch (e) { setErr(e?.response?.data?.error || 'Could not load your CV.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const doc = data?.document;

  // Settings write through to the server, then the document is rebuilt so the
  // preview always shows what is actually stored (no optimistic drift).
  const save = useCallback(async (patch) => {
    setBusy('save');
    try { await cvApi.settings(patch); await load(); }
    catch (e) { setErr(e?.response?.data?.error || 'Could not save.'); }
    finally { setBusy(null); }
  }, [load]);

  // The summary is typed, so it debounces rather than saving every keystroke.
  const onSummary = (v) => {
    setSummary(v);
    clearTimeout(saveTimer.current);
    if (v.length > SUMMARY_MAX) return;
    saveTimer.current = setTimeout(() => save({ summary: v }), 700);
  };

  const rewrite = async () => {
    setBusy('rewrite');
    try {
      const { data: r } = await cvApi.rewrite();
      setSummary(r.summary || '');
      await load();
    } catch (e) { setErr(e?.response?.data?.error || 'Could not rewrite the summary.'); }
    finally { setBusy(null); }
  };

  const toggleShare = async () => {
    setBusy('share');
    try {
      const { data: r } = await cvApi.setShare(!data.share.enabled);
      await load();
      if (r.enabled && r.token) {
        const url = `${window.location.origin}/cv/s/${r.token}`;
        try { await navigator.clipboard.writeText(url); } catch { /* clipboard may be blocked */ }
      }
    } catch (e) { setErr(e?.response?.data?.error || 'Could not change the share link.'); }
    finally { setBusy(null); }
  };

  const download = async () => {
    setBusy('pdf');
    try {
      // The PDF is the ONLY place contact details appear, so it is fetched with
      // audience=pdf rather than reusing the masked preview document.
      const { data: d } = await cvApi.document('pdf');
      const blob = await pdf(<CvPdf doc={d.document} />).toBlob();
      const name = `${d.document.header.name.replace(/\s+/g, '-')}-CV.pdf`;
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setErr(e?.response?.data?.error || 'Could not build the PDF.'); }
    finally { setBusy(null); }
  };

  // drag to reorder
  const onDrop = (toKey) => {
    if (!drag || drag === toKey) { setDrag(null); setOver(null); return; }
    const order = [...doc.order];
    const from = order.findIndex((o) => o.key === drag);
    const to = order.findIndex((o) => o.key === toKey);
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    setDrag(null); setOver(null);
    save({ sections: order });
  };

  const issues = data?.issues || [];
  const toFix = issues.filter((i) => i.level !== 'green');
  const goFix = (to) => { if (to.startsWith('#')) { document.getElementById('summary')?.focus(); } else navigate(to); };

  const checkPanel = useMemo(() => {
    if (!data) return null;
    const clean = toFix.length === 0;
    return (
      <div className={`check${clean ? ' clean' : ''}`}>
        <h3>
          {clean ? <CheckCircle2 size={16} color={DOT.green} /> : <AlertCircle size={16} color={DOT.amber} />}
          {clean ? 'Before you send · nothing to fix' : `Before you send · ${toFix.length} ${toFix.length === 1 ? 'thing' : 'things'} to fix`}
        </h3>
        {issues.map((i, n) => (
          <div className="ci" key={n}>
            <span className="d" style={{ background: DOT[i.level] }} />
            <span>{i.text}</span>
            {i.fixTo && <button type="button" onClick={() => goFix(i.fixTo)}>{i.fixLabel}</button>}
          </div>
        ))}
      </div>
    );
  }, [data, issues, toFix.length]);

  if (err && !data) return <LightPage><div className="cvb" style={{ padding: 40 }}>{err}</div></LightPage>;
  if (!doc) return <LightPage><div className="cvb" style={{ padding: 40, color: 'var(--accent)' }}>Loading your CV…</div></LightPage>;

  const accentName = ACCENTS.find((a) => a.key === doc.accent)?.label || 'Navy';
  const over600 = summary.length > SUMMARY_MAX;

  return (
    <LightPage>
      <div className={`cvb${tab === 'edit' ? ' edit' : ''}`}>
        <div className="tabs">
          <button type="button" className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>Preview</button>
          <button type="button" className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>Edit</button>
        </div>

        <div className="cvb-wrap">
          <aside>
            <h1>Your CV</h1>
            <p className="intro">Built from your profile and logbook. Update a licence or log a flight and your CV updates with it.</p>

            <div className="sec">{checkPanel}</div>

            <div className="sec">
              <h2>Summary</h2>
              <textarea id="summary" value={summary} onChange={(e) => onSummary(e.target.value)}
                placeholder="A short paragraph for recruiters. This is the only text that is not taken from your profile." />
              <div className="meta">
                <button type="button" onClick={rewrite} disabled={busy === 'rewrite'}>
                  {busy === 'rewrite' ? 'Rewriting…' : 'Rewrite from my profile'}
                </button>
                <span className={over600 ? 'over' : undefined}>{summary.length} / {SUMMARY_MAX}</span>
              </div>
            </div>

            <div className="sec">
              <h2>Template</h2>
              <div className="tpls">
                <button type="button" className={`tpl${doc.template === 'classic' ? ' on' : ''}`} onClick={() => save({ template: 'classic' })}>
                  <div className="thumb">
                    <i style={{ left: 8, top: 9, width: '56%', height: 5, background: '#0B1F3A' }} />
                    <i style={{ left: 8, top: 18, width: '36%' }} />
                    <i style={{ left: 8, top: 28, width: '84%', height: 1, background: '#0B1F3A' }} />
                    <i style={{ left: 8, top: 36, width: '40%' }} /><i style={{ left: '54%', top: 36, width: '38%' }} />
                    <i style={{ left: 8, top: 44, width: '36%' }} /><i style={{ left: '54%', top: 44, width: '30%' }} />
                  </div><span>Classic</span>
                </button>
                <button type="button" className={`tpl${doc.template === 'modern' ? ' on' : ''}`} onClick={() => save({ template: 'modern' })}>
                  <div className="thumb">
                    <i style={{ left: 0, top: 0, width: '32%', height: 64, background: '#E3E8EF', borderRadius: 0 }} />
                    <i style={{ left: '38%', top: 9, width: '48%', height: 5, background: '#0B1F3A' }} />
                    <i style={{ left: '38%', top: 20, width: '52%' }} /><i style={{ left: '38%', top: 28, width: '44%' }} />
                    <i style={{ left: '6%', top: 12, width: '20%' }} /><i style={{ left: '6%', top: 20, width: '16%' }} />
                  </div><span>Modern</span>
                </button>
              </div>
              <div className="accents">
                {ACCENTS.map((a) => (
                  <button type="button" key={a.key} aria-label={a.label} title={a.label}
                    className={`acc${doc.accent === a.key ? ' on' : ''}`} style={{ background: a.hex }}
                    onClick={() => save({ accent: a.key })} />
                ))}
              </div>
            </div>

            <div className="sec">
              <h2>Sections</h2>
              <ul className="rows">
                {doc.order.map((o) => {
                  const hint = SECTION_HINT(o.key, doc.counts);
                  return (
                    <li key={o.key} draggable
                      className={`${o.visible ? '' : 'off'}${drag === o.key ? ' drag' : ''}${over === o.key ? ' over' : ''}`}
                      onDragStart={() => setDrag(o.key)}
                      onDragOver={(e) => { e.preventDefault(); setOver(o.key); }}
                      onDragLeave={() => setOver((k) => (k === o.key ? null : k))}
                      onDrop={() => onDrop(o.key)}
                      onDragEnd={() => { setDrag(null); setOver(null); }}>
                      <span className="grip"><GripVertical size={14} /></span>
                      <span className="n">{SECTION_LABEL[o.key]}{hint && <small> · {hint}</small>}</span>
                      <button type="button" aria-label={`${o.visible ? 'Hide' : 'Show'} ${SECTION_LABEL[o.key]}`}
                        className={`tg${o.visible ? '' : ' off'}`}
                        onClick={() => save({ sections: doc.order.map((x) => (x.key === o.key ? { ...x, visible: !x.visible } : x)) })} />
                    </li>
                  );
                })}
              </ul>
              <p className="foot">Drag to reorder. To change what a section says,{' '}
                <button type="button" onClick={() => navigate('/profile')}>edit it in Profile</button>.</p>
            </div>
          </aside>

          <main>
            <div className="bar">
              <span className="t"><b>{doc.template === 'modern' ? 'Modern' : 'Classic'} · {accentName}</b> · A4 · 1 page</span>
              <div className="sp">
                <button type="button" className="btn" onClick={toggleShare} disabled={busy === 'share'}>
                  {data.share.enabled ? <Link2 size={16} /> : <Share2 size={16} />}
                  {data.share.enabled ? 'Link copied · turn off' : 'Share link'}
                </button>
                <button type="button" className="btn p" onClick={download} disabled={busy === 'pdf'}>
                  <Download size={16} />{busy === 'pdf' ? 'Building…' : 'Download PDF'}
                </button>
              </div>
            </div>

            <div className="ph-check">{checkPanel}</div>

            <div className="cv-stage">
              <div className="sheetbox"><CvSheet doc={doc} /></div>
            </div>
            <p className="zoom">Pinch to zoom · 1 page</p>
          </main>
        </div>

        <div className="mbar">
          <button type="button" className="btn" onClick={toggleShare} disabled={busy === 'share'}>
            <Share2 size={16} />{data.share.enabled ? 'Sharing on' : 'Share'}
          </button>
          <button type="button" className="btn p" onClick={download} disabled={busy === 'pdf'}>
            <Download size={16} />{busy === 'pdf' ? 'Building…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </LightPage>
  );
}
