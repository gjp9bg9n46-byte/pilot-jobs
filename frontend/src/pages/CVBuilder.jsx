import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { Plus, Trash2, ChevronDown, ChevronUp, FileText, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';
import { cvApi } from '../services/api';
import TemplateApproach from '../components/cv/TemplateApproach';
import TemplateFinal from '../components/cv/TemplateFinal';

// ─── Inline styles ────────────────────────────────────────────────────────────
const css = {
  page:        { maxWidth: 960, margin: '0 auto' },
  heading:     { fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 4 },
  sub:         { fontSize: 13, color: '#7A8CA0', marginBottom: 28 },
  // Template cards
  tmplGrid:    { display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' },
  tmplCard:    (active) => ({
    flex: '1 1 280px', padding: '0 0 16px', borderRadius: 16, cursor: 'pointer',
    border: `2px solid ${active ? '#00B4D8' : '#1E3050'}`,
    background: active ? 'rgba(0,180,216,0.06)' : '#0D1E35',
    transition: 'all 0.15s', overflow: 'hidden',
  }),
  tmplThumb:   { height: 140, display: 'flex', overflow: 'hidden', borderRadius: '14px 14px 0 0', marginBottom: 12 },
  tmplLabel:   { padding: '0 16px', fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2 },
  tmplDesc:    { padding: '0 16px', fontSize: 12, color: '#7A8CA0' },
  activeCheck: { padding: '0 16px', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#00B4D8', fontWeight: 600 },
  // Download bar
  dlBar:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 14, padding: '14px 20px', marginBottom: 28 },
  dlBarText:   { fontSize: 13, color: '#7A8CA0' },
  dlBtn:       (disabled) => ({
    background: disabled ? '#1B2B4B' : 'linear-gradient(135deg, #00B4D8, #0077A8)',
    border: 'none', borderRadius: 10, padding: '10px 22px',
    color: disabled ? '#4A6080' : '#fff', fontWeight: 700, fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 7,
  }),
  saveStatus:  { fontSize: 12, color: '#4A6080', marginLeft: 8 },
  // Section accordion
  accordion:   { background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
  accHeader:   { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer', userSelect: 'none' },
  accTitle:    { fontSize: 14, fontWeight: 700, color: '#fff', flex: 1 },
  accBadge:    { background: 'rgba(0,180,216,0.15)', color: '#00B4D8', fontSize: 12, fontWeight: 700, padding: '1px 8px', borderRadius: 10 },
  accBody:     { padding: '0 20px 20px' },
  // Read-only info rows
  infoGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px 16px' },
  infoRow:     { display: 'flex', flexDirection: 'column', padding: '6px 0', borderBottom: '1px solid #1B2B4B' },
  infoLabel:   { fontSize: 11, color: '#4A6080', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  infoValue:   { fontSize: 13, color: '#fff' },
  // Badges
  badgeRow:    { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  badge:       (color) => ({ background: `rgba(${color},0.1)`, border: `1px solid rgba(${color},0.3)`, borderRadius: 8, padding: '5px 10px', fontSize: 12, color: '#fff' }),
  // Editable list
  listItem:    { display: 'flex', alignItems: 'flex-start', gap: 10, background: '#0A1628', borderRadius: 10, padding: '12px 14px', marginBottom: 8 },
  listItemFields: { flex: 1, display: 'grid', gap: 8 },
  deleteBtn:   { background: 'none', border: 'none', cursor: 'pointer', color: '#4A6080', padding: 4, borderRadius: 6, flexShrink: 0 },
  addBtn:      { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,180,216,0.08)', border: '1px dashed rgba(0,180,216,0.3)', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', color: '#00B4D8', fontSize: 13, fontWeight: 600, marginTop: 4 },
  // Form inputs
  input:       { background: '#1B2B4B', border: '1px solid #243050', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' },
  textarea:    { background: '#1B2B4B', border: '1px solid #243050', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 80 },
  inputLabel:  { fontSize: 11, color: '#4A6080', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  // Skill tags
  skillsWrap:  { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  skillTag:    { display: 'flex', alignItems: 'center', gap: 5, background: '#0A1628', border: '1px solid #243050', borderRadius: 20, padding: '4px 10px 4px 12px', fontSize: 13, color: '#fff' },
  skillTagDel: { background: 'none', border: 'none', cursor: 'pointer', color: '#4A6080', fontSize: 14, padding: 0, lineHeight: 1 },
  skillInput:  { background: '#1B2B4B', border: '1px solid #243050', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', minWidth: 160 },
  // Totals table
  totalsTable: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginTop: 4 },
  totalCell:   { background: '#0A1628', borderRadius: 10, padding: '10px 12px', textAlign: 'center' },
  totalVal:    { fontSize: 16, fontWeight: 800, color: '#00B4D8' },
  totalLabel:  { fontSize: 11, color: '#4A6080', marginTop: 2 },
};

// ─── Template thumbnail components (HTML preview) ────────────────────────────
function ThumbApproach() {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', fontSize: 4 }}>
      <div style={{ width: '32%', background: '#0D1E35', padding: '8px 6px' }}>
        <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#1B2B4B', border: '1.5px solid #00B4D8', margin: '0 auto 4px' }} />
        <div style={{ height: 3, background: '#fff', borderRadius: 2, marginBottom: 2, width: '80%', margin: '0 auto 3px' }} />
        <div style={{ height: 2, background: '#00B4D8', borderRadius: 1, width: '60%', margin: '0 auto 8px' }} />
        {['#4A6080','#4A6080','#4A6080'].map((c,i) => (
          <div key={i} style={{ height: 1.5, background: c, borderRadius: 1, marginBottom: 2, width: '90%' }} />
        ))}
        <div style={{ height: 1, background: '#1B2B4B', margin: '5px 0' }} />
        {[1,2,3].map(i => <div key={i} style={{ height: 5, background: '#1B2B4B', borderRadius: 2, marginBottom: 2 }} />)}
        <div style={{ height: 1, background: '#1B2B4B', margin: '5px 0' }} />
        {[1,2].map(i => <div key={i} style={{ height: 5, background: '#1B2B4B', borderRadius: 2, marginBottom: 2 }} />)}
      </div>
      <div style={{ flex: 1, background: '#fff', padding: '8px 6px' }}>
        <div style={{ display: 'flex', gap: 3, marginBottom: 6, flexWrap: 'wrap' }}>
          {['#E0F4FA','#E0F4FA','#E0F4FA','#E0F4FA'].map((c,i) => (
            <div key={i} style={{ height: 12, width: 22, background: c, borderRadius: 3 }} />
          ))}
        </div>
        <div style={{ height: 1.5, background: '#00B4D8', marginBottom: 5, width: '80%' }} />
        {[1,2,3].map(i => <div key={i} style={{ height: 6, background: '#F0F4F8', borderRadius: 2, marginBottom: 3 }} />)}
        <div style={{ height: 1.5, background: '#00B4D8', marginBottom: 5, marginTop: 8, width: '80%' }} />
        {[1,2].map(i => <div key={i} style={{ height: 6, background: '#F0F4F8', borderRadius: 2, marginBottom: 3 }} />)}
      </div>
    </div>
  );
}

function ThumbFinal() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', fontSize: 4, background: '#fff' }}>
      <div style={{ background: '#0D1E35', padding: '10px 10px 8px' }}>
        <div style={{ height: 2, background: '#00B4D8', borderRadius: 1, marginBottom: 5 }} />
        <div style={{ height: 5, background: '#fff', borderRadius: 2, width: '55%', marginBottom: 3 }} />
        <div style={{ height: 2.5, background: '#00B4D8', borderRadius: 1, width: '35%', marginBottom: 6 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          {['#fff','#fff','#fff'].map((c,i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ height: 6, width: 14, background: c, borderRadius: 1, opacity: 0.9 }} />
              <div style={{ height: 1.5, width: 12, background: '#4A6080', borderRadius: 1, marginTop: 1 }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: '#F4F8FB', display: 'flex', gap: 8, padding: '4px 8px', borderBottom: '1px solid #D8E8F0' }}>
        {[1,2,3].map(i => <div key={i} style={{ height: 2, background: '#D0D8E0', borderRadius: 1, flex: 1 }} />)}
      </div>
      <div style={{ flex: 1, padding: '6px 8px' }}>
        <div style={{ display: 'flex', gap: 3, marginBottom: 5 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ flex: 1, height: 14, background: '#F0F4F8', borderRadius: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <div style={{ height: 3, width: 10, background: '#0D1E35', borderRadius: 1 }} />
            <div style={{ height: 1.5, width: 8, background: '#D0D8E0', borderRadius: 1 }} />
          </div>)}
        </div>
        {[1,2].map(i => <div key={i} style={{ height: 1.5, background: '#D8E8F0', marginBottom: 3 }} />)}
        {[1,2,3].map(i => <div key={i} style={{ height: 5, background: '#F0F4F8', borderRadius: 2, marginBottom: 2 }} />)}
      </div>
    </div>
  );
}

// ─── Section accordion ────────────────────────────────────────────────────────
function Accordion({ title, badge, defaultOpen = false, warning = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={css.accordion}>
      <div style={css.accHeader} onClick={() => setOpen(v => !v)}>
        {warning
          ? <AlertTriangle size={15} color="#F39C12" />
          : <CheckCircle2 size={15} color="#2ECC71" />}
        <span style={css.accTitle}>{title}</span>
        {badge != null && <span style={css.accBadge}>{badge}</span>}
        {open ? <ChevronUp size={15} color="#4A6080" /> : <ChevronDown size={15} color="#4A6080" />}
      </div>
      {open && <div style={css.accBody}>{children}</div>}
    </div>
  );
}

// ─── Labelled input ───────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <div style={css.inputLabel}>{label}</div>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={css.input}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CVBuilder() {
  const [loading, setLoading]     = useState(true);
  const [serverData, setServerData] = useState(null);  // read-only: profile+logbook
  const [education, setEducation] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [skills, setSkills]       = useState([]);
  const [other, setOther]         = useState([]);
  const [template, setTemplate]     = useState('approach');
  const [saveStatus, setSaveStatus] = useState('');  // '' | 'saving' | 'saved' | 'error'
  const [skillInput, setSkillInput] = useState('');
  const [photoUrl, setPhotoUrl]         = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError]     = useState('');
  const [dragging, setDragging]         = useState(false);
  const saveTimer   = useRef(null);
  const fileInputRef = useRef(null);

  // ── Load all CV data on mount ───────────────────────────────────────────────
  useEffect(() => {
    cvApi.getData()
      .then(({ data }) => {
        setServerData(data);
        setEducation(data.cv?.education ?? []);
        setLanguages(data.cv?.languages ?? []);
        setSkills(data.cv?.skills ?? []);
        setOther(data.cv?.other ?? []);
        setPhotoUrl(data.cv?.photoUrl ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Auto-save editable fields (debounced 1.5s) ─────────────────────────────
  const scheduleSave = useCallback((edu, lang, sk, oth) => {
    clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(() => {
      cvApi.update({ education: edu, languages: lang, skills: sk, other: oth })
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('error'));
    }, 1500);
  }, []);

  const handlePhotoSelect = async (file) => {
    if (!file) return;
    setPhotoError('');
    setPhotoLoading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const { data } = await cvApi.uploadPhoto(fd);
      setPhotoUrl(data.photoUrl);
    } catch (err) {
      setPhotoError(err?.response?.data?.error || 'Upload failed — please try again');
    } finally {
      setPhotoLoading(false);
    }
  };

  const handlePhotoDelete = async () => {
    setPhotoError('');
    setPhotoLoading(true);
    try {
      await cvApi.deletePhoto();
      setPhotoUrl(null);
    } catch {
      setPhotoError('Failed to remove photo');
    } finally {
      setPhotoLoading(false);
    }
  };

  const updateEducation = (val) => { setEducation(val); scheduleSave(val, languages, skills, other); };
  const updateLanguages = (val) => { setLanguages(val); scheduleSave(education, val, skills, other); };
  const updateSkills    = (val) => { setSkills(val);    scheduleSave(education, languages, val, other); };
  const updateOther     = (val) => { setOther(val);     scheduleSave(education, languages, skills, val); };

  // ── Build PDF data bundle ───────────────────────────────────────────────────
  const pdfData = serverData ? {
    ...serverData,
    cv: { education, languages, skills, other, photoUrl },
  } : null;

  const fileName = serverData
    ? `${serverData.pilot?.firstName ?? 'CV'}-${serverData.pilot?.lastName ?? ''}-CV.pdf`.replace(/\s+/g, '-')
    : 'CV.pdf';

  const PdfDoc = pdfData
    ? template === 'approach'
      ? <TemplateApproach data={pdfData} />
      : <TemplateFinal data={pdfData} />
    : null;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const fmt = (n) => n ? Math.round(n).toLocaleString() : '0';
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—';

  if (loading) return (
    <div style={{ textAlign: 'center', paddingTop: 80, color: '#7A8CA0' }}>Loading your CV data…</div>
  );
  if (!serverData) return (
    <div style={{ textAlign: 'center', paddingTop: 80, color: '#FF6B6B' }}>Could not load CV data. Please refresh.</div>
  );

  const { pilot, certificates, ratings, medicals, training, rtw, totals, aircraftTypes } = serverData;
  const topLicence = ['ATPL','MPL','CPL','PPL'].map(t => certificates?.find(c => c.type === t)).find(Boolean);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={css.page}>
      <div style={css.heading}>CV Builder</div>
      <div style={css.sub}>Build and download a professional pilot CV from your profile and logbook data.</div>

      {/* ── Template selector ── */}
      <div style={{ fontSize: 12, color: '#4A6080', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Choose a template</div>
      <div style={css.tmplGrid}>
        {[
          { id: 'approach', label: 'Approach', desc: 'Two-column · navy sidebar · traditional layout', Thumb: ThumbApproach },
          { id: 'final',    label: 'Final',    desc: 'Full-width header · modern blocks · spacious',  Thumb: ThumbFinal },
        ].map(({ id, label, desc, Thumb }) => (
          <div key={id} style={css.tmplCard(template === id)} onClick={() => setTemplate(id)}>
            <div style={css.tmplThumb}><Thumb /></div>
            <div style={css.tmplLabel}>{label}</div>
            <div style={css.tmplDesc}>{desc}</div>
            {template === id && (
              <div style={css.activeCheck}>
                <CheckCircle2 size={13} /> Selected
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Download bar ── */}
      <div style={css.dlBar}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
            {template === 'approach' ? 'Approach Template' : 'Final Template'}
          </div>
          <div style={css.dlBarText}>
            {totals?.totalTime ? `${fmt(totals.totalTime)}h total · ` : ''}
            {totals?.picTime   ? `${fmt(totals.picTime)}h PIC · ` : ''}
            {ratings?.length   ? `${ratings.length} type rating${ratings.length !== 1 ? 's' : ''}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saveStatus === 'saving' && <span style={css.saveStatus}>Saving…</span>}
          {saveStatus === 'saved'  && <span style={{ ...css.saveStatus, color: '#2ECC71' }}>Saved</span>}
          {saveStatus === 'error'  && <span style={{ ...css.saveStatus, color: '#FF6B6B' }}>Save failed</span>}
          {PdfDoc && (
            <PDFDownloadLink document={PdfDoc} fileName={fileName} style={css.dlBtn(false)}>
              {({ loading: pdfLoading }) => (
                <>
                  <FileText size={15} />
                  {pdfLoading ? 'Preparing…' : 'Download PDF'}
                </>
              )}
            </PDFDownloadLink>
          )}
        </div>
      </div>

      {/* ═══ EDITOR SECTIONS ═══ */}

      {/* Personal information (read-only) */}
      <Accordion title="Personal Information" badge={null} defaultOpen>
        <div style={css.infoGrid}>
          {[
            ['Name',        `${pilot?.firstName ?? ''} ${pilot?.lastName ?? ''}`.trim()],
            ['Email',       pilot?.email],
            ['Phone',       pilot?.phone],
            ['Nationality', pilot?.nationality],
            ['Date of Birth', pilot?.dateOfBirth ? fmtDate(pilot.dateOfBirth) : null],
            ['City',        [pilot?.city, pilot?.country].filter(Boolean).join(', ') || null],
          ].filter(([,v]) => v).map(([label, value]) => (
            <div key={label} style={css.infoRow}>
              <span style={css.infoLabel}>{label}</span>
              <span style={css.infoValue}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#4A6080' }}>
          Edit personal details on the <a href="/profile" style={{ color: '#00B4D8' }}>Profile page</a>.
        </div>
      </Accordion>

      {/* ─── Photo / Headshot ── */}
      <style>{`@keyframes uc-spin { to { transform: rotate(360deg); } }`}</style>
      <Accordion title="Photo / Headshot" defaultOpen={!photoUrl} warning={false}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={e => { handlePhotoSelect(e.target.files[0]); e.target.value = ''; }}
        />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>

          {/* Circle: preview or drop target */}
          <div
            onClick={() => !photoLoading && !photoUrl && fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); if (!photoUrl && !photoLoading) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); if (!photoUrl) handlePhotoSelect(e.dataTransfer.files[0]); }}
            style={{
              width: 110, height: 110, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              border: photoUrl
                ? '2.5px solid #00B4D8'
                : `2px dashed ${dragging ? '#00B4D8' : 'rgba(0,180,216,0.35)'}`,
              background: photoUrl ? 'transparent' : dragging ? 'rgba(0,180,216,0.12)' : 'rgba(0,180,216,0.04)',
              cursor: photoLoading || photoUrl ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            {photoLoading ? (
              <div style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid #1B2B4B', borderTopColor: '#00B4D8', animation: 'uc-spin 0.8s linear infinite' }} />
            ) : photoUrl ? (
              <img src={photoUrl} alt="Headshot" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Upload size={22} color="rgba(0,180,216,0.5)" />
            )}
          </div>

          {/* Right side */}
          <div style={{ flex: 1, minWidth: 180 }}>
            {photoUrl ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#2ECC71', marginBottom: 4 }}>Photo uploaded</div>
                <div style={{ fontSize: 12, color: '#7A8CA0', marginBottom: 14 }}>
                  Appears as a circular headshot on your CV. Upload again to replace it.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => fileInputRef.current?.click()} disabled={photoLoading} style={css.addBtn}>
                    <Upload size={13} /> Replace
                  </button>
                  <button
                    onClick={handlePhotoDelete}
                    disabled={photoLoading}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: 10, padding: '8px 14px', cursor: photoLoading ? 'not-allowed' : 'pointer', color: '#FF6B6B', fontSize: 13, fontWeight: 600 }}
                  >
                    <Trash2 size={13} /> {photoLoading ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Add a headshot</div>
                <div style={{ fontSize: 12, color: '#7A8CA0', marginBottom: 8 }}>
                  Optional. Appears as a circular photo on your CV.
                </div>
                <div style={{ fontSize: 11, color: '#4A6080', marginBottom: 14 }}>
                  JPEG · PNG · WebP &nbsp;·&nbsp; Min 200×200 px &nbsp;·&nbsp; Max 5 MB
                </div>
                <button onClick={() => fileInputRef.current?.click()} disabled={photoLoading} style={css.addBtn}>
                  <Upload size={13} /> Choose photo
                </button>
              </>
            )}
            {photoError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#FF6B6B', marginTop: 10 }}>
                <AlertTriangle size={12} /> {photoError}
              </div>
            )}
          </div>
        </div>
      </Accordion>

      {/* Logbook totals (read-only) */}
      <Accordion title="Logbook Summary" badge={totals?.totalTime ? `${fmt(totals.totalTime)}h` : null} defaultOpen={false}>
        <div style={css.totalsTable}>
          {[
            ['Total',        totals?.totalTime],
            ['PIC',          totals?.picTime],
            ['SIC',          totals?.sicTime],
            ['Night',        totals?.nightTime],
            ['IFR',          totals?.instrumentTime],
            ['Multi-Engine', totals?.multiEngineTime],
            ['Turbine',      totals?.turbineTime],
          ].map(([label, val]) => (
            <div key={label} style={css.totalCell}>
              <div style={css.totalVal}>{fmt(val)}h</div>
              <div style={css.totalLabel}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#4A6080' }}>
          Hours are aggregated from your <a href="/logbook" style={{ color: '#00B4D8' }}>Logbook</a>.
        </div>
      </Accordion>

      {/* Licences & ratings (read-only) */}
      <Accordion title="Licences & Type Ratings" badge={(certificates?.length ?? 0) + (ratings?.length ?? 0) || null} defaultOpen={false}>
        {certificates?.filter(c => c.type !== 'ELP').map((c, i) => (
          <div key={i} style={{ ...css.listItem, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{c.type} — {c.issuingAuthority}</div>
              <div style={{ fontSize: 12, color: '#7A8CA0' }}>
                {c.certificateNumber ? `#${c.certificateNumber} · ` : ''}
                {c.expiryDate ? `Expires ${fmtDate(c.expiryDate)}` : 'No expiry'}
              </div>
            </div>
          </div>
        ))}
        {ratings?.map((r, i) => (
          <div key={i} style={{ ...css.listItem, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{r.aircraftType} ({r.category})</div>
              <div style={{ fontSize: 12, color: '#7A8CA0' }}>
                {r.hoursOnType ? `${fmt(r.hoursOnType)}h on type · ` : ''}
                {r.expiryDate ? `Expires ${fmtDate(r.expiryDate)}` : ''}
              </div>
            </div>
          </div>
        ))}
        {(!certificates?.length && !ratings?.length) && (
          <div style={{ fontSize: 13, color: '#4A6080' }}>No licences or ratings added yet. Add them on the Profile page.</div>
        )}
      </Accordion>

      {/* Medical (read-only) */}
      <Accordion title="Medical" badge={medicals?.length || null} defaultOpen={false}>
        {medicals?.map((m, i) => (
          <div key={i} style={{ ...css.listItem, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{m.medicalClass.replace('_', ' ')} — {m.issuingAuthority}</div>
              <div style={{ fontSize: 12, color: '#2ECC71' }}>Valid to {fmtDate(m.expiryDate)}</div>
            </div>
          </div>
        ))}
        {!medicals?.length && <div style={{ fontSize: 13, color: '#4A6080' }}>No medical records added yet.</div>}
      </Accordion>

      {/* ─── Editable: Education ── */}
      <Accordion
        title="Education"
        badge={education.length || null}
        defaultOpen={education.length === 0}
        warning={education.length === 0}
      >
        {education.map((e, i) => (
          <div key={i} style={css.listItem}>
            <div style={{ ...css.listItemFields, gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Degree / Qualification" value={e.degree} onChange={v => updateEducation(education.map((x,j) => j===i ? {...x, degree: v} : x))} placeholder="e.g. BSc Aeronautical Engineering" />
              <Field label="Institution" value={e.institution} onChange={v => updateEducation(education.map((x,j) => j===i ? {...x, institution: v} : x))} placeholder="e.g. Embry-Riddle University" />
              <Field label="Field of Study" value={e.fieldOfStudy} onChange={v => updateEducation(education.map((x,j) => j===i ? {...x, fieldOfStudy: v} : x))} placeholder="e.g. Aviation Science" />
              <Field label="Year" value={e.year} onChange={v => updateEducation(education.map((x,j) => j===i ? {...x, year: v} : x))} placeholder="e.g. 2018" />
            </div>
            <button style={css.deleteBtn} onClick={() => updateEducation(education.filter((_,j) => j!==i))}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button style={css.addBtn} onClick={() => updateEducation([...education, { degree: '', institution: '', fieldOfStudy: '', year: '' }])}>
          <Plus size={14} /> Add Education
        </button>
      </Accordion>

      {/* ─── Editable: Languages ── */}
      <Accordion
        title="Languages"
        badge={languages.length || null}
        defaultOpen={languages.length === 0}
        warning={languages.length === 0}
      >
        <div style={{ fontSize: 12, color: '#4A6080', marginBottom: 12 }}>
          English ICAO level is pulled from your ELP certificate automatically. Add other languages here.
        </div>
        {languages.map((l, i) => (
          <div key={i} style={css.listItem}>
            <div style={{ ...css.listItemFields, gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Language" value={l.language} onChange={v => updateLanguages(languages.map((x,j) => j===i ? {...x, language: v} : x))} placeholder="e.g. Arabic" />
              <Field label="Proficiency Level" value={l.level} onChange={v => updateLanguages(languages.map((x,j) => j===i ? {...x, level: v} : x))} placeholder="e.g. Native, B2, ICAO Level 6" />
            </div>
            <button style={css.deleteBtn} onClick={() => updateLanguages(languages.filter((_,j) => j!==i))}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button style={css.addBtn} onClick={() => updateLanguages([...languages, { language: '', level: '' }])}>
          <Plus size={14} /> Add Language
        </button>
      </Accordion>

      {/* ─── Editable: Skills ── */}
      <Accordion
        title="Skills"
        badge={skills.length || null}
        defaultOpen={skills.length === 0}
        warning={skills.length === 0}
      >
        <div style={{ fontSize: 12, color: '#4A6080', marginBottom: 10 }}>
          Add relevant skills, qualifications, and competencies — e.g. CRM, RVSM, ETOPS, FMS, TCAS.
        </div>
        <div style={css.skillsWrap}>
          {skills.map((sk, i) => (
            <div key={i} style={css.skillTag}>
              {sk}
              <button style={css.skillTagDel} onClick={() => updateSkills(skills.filter((_,j) => j!==i))}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={skillInput}
            onChange={e => setSkillInput(e.target.value)}
            onKeyDown={e => {
              if ((e.key === 'Enter' || e.key === ',') && skillInput.trim()) {
                e.preventDefault();
                updateSkills([...skills, skillInput.trim()]);
                setSkillInput('');
              }
            }}
            placeholder="Type a skill and press Enter"
            style={css.skillInput}
          />
          <button
            style={{ ...css.addBtn, marginTop: 0, padding: '8px 14px' }}
            onClick={() => { if (skillInput.trim()) { updateSkills([...skills, skillInput.trim()]); setSkillInput(''); } }}
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </Accordion>

      {/* ─── Editable: Other sections ── */}
      <Accordion title="Custom Sections" badge={other.length || null} defaultOpen={false}>
        <div style={{ fontSize: 12, color: '#4A6080', marginBottom: 12 }}>
          Add any other sections — e.g. Awards, Publications, Volunteer Work.
        </div>
        {other.map((sec, i) => (
          <div key={i} style={css.listItem}>
            <div style={{ ...css.listItemFields, gridTemplateColumns: '1fr' }}>
              <Field label="Section Title" value={sec.title} onChange={v => updateOther(other.map((x,j) => j===i ? {...x, title: v} : x))} placeholder="e.g. Awards & Recognition" />
              <div>
                <div style={css.inputLabel}>Content</div>
                <textarea
                  value={sec.content ?? ''}
                  onChange={e => updateOther(other.map((x,j) => j===i ? {...x, content: e.target.value} : x))}
                  placeholder="Describe this section…"
                  style={css.textarea}
                />
              </div>
            </div>
            <button style={css.deleteBtn} onClick={() => updateOther(other.filter((_,j) => j!==i))}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button style={css.addBtn} onClick={() => updateOther([...other, { title: '', content: '' }])}>
          <Plus size={14} /> Add Section
        </button>
      </Accordion>

    </div>
  );
}
