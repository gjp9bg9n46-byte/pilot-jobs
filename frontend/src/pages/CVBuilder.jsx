import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PDFDownloadLink, usePDF } from '@react-pdf/renderer';
import { Plus, Trash2, ChevronDown, ChevronUp, FileText, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';
import { cvApi } from '../services/api';
import TemplateApproach from '../components/cv/TemplateApproach';
import TemplateFinal from '../components/cv/TemplateFinal';
import { ACCENT_PALETTE, DEFAULT_ACCENT } from '../components/cv/accentPalette';
import { LightPage, Input } from '../components/primitives';

// ─── Inline styles ────────────────────────────────────────────────────────────
const css = {
  // Layout
  outerSplit:  { display: 'flex', gap: 32, alignItems: 'flex-start', maxWidth: 1440, margin: '0 auto' },
  outerStack:  { maxWidth: 960, margin: '0 auto' },
  editorPane:  { flex: '0 0 58%', minWidth: 0 },
  // Preview pane — sticky (desktop ≥1024px)
  // Desktop header is padding:16px*2 + fontSize:20*lineHeight:1.2 + border:1px ≈ 57px
  previewPaneSticky: {
    position: 'sticky', top: 0,
    flex: 1, minWidth: 340,
    height: 'calc(100vh - 57px)',
    display: 'flex', flexDirection: 'column',
  },
  // Preview pane — stacked below editor (tablet 768–1023px)
  previewPaneStacked: {
    height: 720, marginTop: 28,
    display: 'flex', flexDirection: 'column',
    borderRadius: 12, overflow: 'hidden',
    border: '1px solid var(--border)',
  },
  // Preview CONTAINER chrome (cream backdrop; the iframe inside renders the PDF)
  previewFrame: {
    flex: 1, display: 'flex', flexDirection: 'column',
    border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
    background: 'var(--bg)', position: 'relative',
  },
  previewFrameStacked: {
    flex: 1, display: 'flex', flexDirection: 'column',
    background: 'var(--bg)', position: 'relative',
  },
  previewHeader: {
    padding: '10px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0,
  },
  previewPlaceholder: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-secondary)', gap: 12,
  },
  previewUpdatingBadge: {
    position: 'absolute', top: 8, right: 8, zIndex: 10,
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '4px 10px', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600,
  },
  // Mobile tab bar
  tabBar: {
    display: 'flex', marginBottom: 16,
    background: 'var(--surface)', borderRadius: 10, padding: 3,
    border: '1px solid var(--border)',
  },
  tabBtn: (active) => ({
    flex: 1, padding: '8px 12px', borderRadius: 8,
    background: active ? 'rgba(0,63,136,0.06)' : 'transparent',
    border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
    color: active ? 'var(--accent)' : 'var(--text-secondary)', transition: 'all 0.15s',
  }),
  // Auto-fill badges
  badgeFromProfile: {
    fontSize: 11, fontWeight: 600, color: '#166534',
    background: '#DCFCE7', border: '1px solid #BBF7D0',
    borderRadius: 8, padding: '2px 8px', marginRight: 8, whiteSpace: 'nowrap',
  },
  badgeCustom: {
    fontSize: 11, fontWeight: 600, color: '#92400E',
    background: '#FEF3C7', border: '1px solid #FDE68A',
    borderRadius: 8, padding: '2px 8px', marginRight: 8,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  },
  badgeResetBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#92400E', fontWeight: 600, fontSize: 11, padding: 0,
    textDecoration: 'underline', lineHeight: 1,
  },
  page:        { maxWidth: 960, margin: '0 auto' },
  heading:     { fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 8 },
  sub:         { fontSize: 15, color: 'var(--text-secondary)', marginBottom: 28 },
  // Template cards
  tmplGrid:    { display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' },
  tmplCard:    (active) => ({
    flex: '1 1 200px', padding: '0 0 16px', borderRadius: 12, cursor: 'pointer',
    border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'rgba(0,63,136,0.06)' : 'var(--surface)',
    transition: 'all 0.15s', overflow: 'hidden',
  }),
  tmplThumb:   { height: 120, display: 'flex', overflow: 'hidden', borderRadius: '10px 10px 0 0', marginBottom: 10 },
  tmplLabel:   { padding: '0 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 },
  tmplDesc:    { padding: '0 14px', fontSize: 11, color: 'var(--text-secondary)' },
  activeCheck: { padding: '0 14px', marginTop: 5, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--accent)', fontWeight: 600 },
  // Download bar
  dlBar:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px', marginBottom: 28 },
  dlBarText:   { fontSize: 13, color: 'var(--text-secondary)' },
  dlBtn:       (disabled) => ({
    background: disabled ? 'var(--border)' : 'var(--accent)',
    border: 'none', borderRadius: 4, padding: '10px 22px',
    color: disabled ? 'var(--text-secondary)' : '#fff', fontWeight: 500, fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 7,
  }),
  saveStatus:  { fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 },
  // Section accordion
  accordion:   { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  accHeader:   { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer', userSelect: 'none' },
  accTitle:    { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', flex: 1 },
  accBadge:    { background: 'rgba(0,63,136,0.08)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, padding: '1px 8px', borderRadius: 10 },
  accBody:     { padding: '0 20px 20px' },
  // Read-only info rows
  infoGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px 16px' },
  infoRow:     { display: 'flex', flexDirection: 'column', padding: '6px 0', borderBottom: '1px solid var(--border)' },
  infoLabel:   { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  infoValue:   { fontSize: 13, color: 'var(--text-primary)' },
  // Badges
  badgeRow:    { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  badge:       () => ({ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--text-primary)' }),
  // Editable list
  listItem:    { display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 },
  listItemFields: { flex: 1, display: 'grid', gap: 8 },
  deleteBtn:   { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4, borderRadius: 6, flexShrink: 0 },
  addBtn:      { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,63,136,0.06)', border: '1px dashed rgba(0,63,136,0.3)', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, fontWeight: 600, marginTop: 4 },
  // Skill tags
  skillsWrap:  { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  skillTag:    { display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 10px 4px 12px', fontSize: 13, color: 'var(--text-primary)' },
  skillTagDel: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14, padding: 0, lineHeight: 1 },
  // Totals table
  totalsTable: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginTop: 4 },
  totalCell:   { background: 'var(--bg)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' },
  totalVal:    { fontSize: 16, fontWeight: 800, color: 'var(--accent)' },
  totalLabel:  { fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 },
  // Accent colour picker — swatch FILL stays the palette hex (frozen); only the
  // selected-ring chrome is editorial (cream gap + accent ring, reads on cream).
  swatchRow:   { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  swatchWrap:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  swatchCircle:(active, hex) => ({
    width: 44, height: 44, borderRadius: '50%', background: hex,
    cursor: 'pointer', border: 'none', padding: 0,
    boxShadow: active ? '0 0 0 3px var(--bg), 0 0 0 5px var(--accent)' : 'none',
    transition: 'all 0.12s',
  }),
  swatchLabel: { fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' },
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
function Accordion({ title, badge, defaultOpen = false, warning = false, headerExtra, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={css.accordion}>
      <div style={css.accHeader} onClick={() => setOpen(v => !v)}>
        {warning
          ? <AlertTriangle size={15} color="#92400E" />
          : <CheckCircle2 size={15} color="#166534" />}
        <span style={css.accTitle}>{title}</span>
        {headerExtra}
        {badge != null && <span style={css.accBadge}>{badge}</span>}
        {open ? <ChevronUp size={15} color="var(--text-secondary)" /> : <ChevronDown size={15} color="var(--text-secondary)" />}
      </div>
      {open && <div style={css.accBody}>{children}</div>}
    </div>
  );
}

// ─── Labelled input ───────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <Input
      label={label}
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

// ─── PDF preview iframe ───────────────────────────────────────────────────────
// Uses usePDF directly instead of PDFViewer so we can:
//   (a) keep the old PDF visible during regeneration — usePDF preserves url in
//       state while loading: setState(prev=>({...prev, loading:true})) keeps old url
//   (b) expose instance.loading to the parent so the "Updating…" badge covers
//       the full render cycle, not just the 400ms debounce window.
function PdfPreviewIframe({ doc, onLoadingChange }) {
  const [instance, updateInstance] = usePDF();

  useEffect(() => {
    if (doc) updateInstance(doc);
  }, [doc]);

  // Report loading + hasUrl to parent on every state change
  useEffect(() => {
    onLoadingChange(instance.loading, !!instance.url);
  }, [instance.loading, instance.url, onLoadingChange]);

  // No url yet → parent renders the spinner placeholder instead
  if (!instance.url) return null;

  return (
    <iframe
      src={`${instance.url}#toolbar=0`}
      width="100%"
      height="100%"
      style={{ border: 'none', display: 'block' }}
      title="CV Preview"
    />
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CVBuilder() {
  const [loading, setLoading]           = useState(true);
  const [serverData, setServerData]     = useState(null);
  const [education, setEducation]       = useState([]);
  const [languages, setLanguages]       = useState([]);
  const [skills, setSkills]             = useState([]);
  const [other, setOther]               = useState([]);
  const [template, setTemplate]         = useState('approach');
  const [saveStatus, setSaveStatus]     = useState('');
  const [skillInput, setSkillInput]     = useState('');
  const [photoUrl, setPhotoUrl]         = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError]     = useState('');
  const [dragging, setDragging]         = useState(false);
  const [accentColor, setAccentColor]   = useState(DEFAULT_ACCENT);
  const [summary, setSummary]           = useState('');

  // Preview state
  const [debouncedPdfData, setDebouncedPdfData] = useState(null);
  const [previewUpdating, setPreviewUpdating]   = useState(false);
  const [pdfInstanceLoading, setPdfInstanceLoading] = useState(false);
  const [pdfInstanceHasUrl, setPdfInstanceHasUrl]   = useState(false);
  const [activeTab, setActiveTab]               = useState('edit'); // mobile only
  const [windowWidth, setWindowWidth]           = useState(() => window.innerWidth);

  // Stable callback for PdfPreviewIframe to report instance.loading/url changes
  const handlePdfLoadingChange = useCallback((loading, hasUrl) => {
    setPdfInstanceLoading(loading);
    setPdfInstanceHasUrl(hasUrl);
  }, []);

  const saveTimer    = useRef(null);
  const previewTimer = useRef(null);
  const fileInputRef = useRef(null);

  // Window width tracking for responsive layout
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const isMobileLayout  = windowWidth < 768;   // matches Layout.jsx useIsMobile(768)
  const isDesktopSplit  = windowWidth >= 1024;  // side-by-side split
  // 768–1023px: tablet — desktop sidebar shown, but not wide enough for side-by-side

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
        setAccentColor(data.cv?.accentColor ?? DEFAULT_ACCENT);
        setSummary(data.cv?.summary ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Auto-save editable fields (debounced 1.5s) ─────────────────────────────
  const scheduleSave = useCallback((edu, lang, sk, oth, ac, sum) => {
    clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(() => {
      cvApi.update({ education: edu, languages: lang, skills: sk, other: oth,
                     accentColor: ac, summary: sum })
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

  const ss = (edu, lang, sk, oth, ac, sum) =>
    scheduleSave(edu, lang, sk, oth, ac, sum);

  const updateEducation = (v) => { setEducation(v); ss(v, languages, skills, other, accentColor, summary); };
  const updateLanguages = (v) => { setLanguages(v); ss(education, v, skills, other, accentColor, summary); };
  const updateSkills    = (v) => { setSkills(v);    ss(education, languages, v, other, accentColor, summary); };
  const updateOther     = (v) => { setOther(v);     ss(education, languages, skills, v, accentColor, summary); };
  const updateSummary   = (v) => { setSummary(v);   ss(education, languages, skills, other, accentColor, v); };

  const handleAccentChange = (hex) => {
    setAccentColor(hex);
    // Instant preview: bypass the 400ms debounce (same as handleTemplateChange)
    if (pdfData) {
      clearTimeout(previewTimer.current);
      setDebouncedPdfData({ ...pdfData, cv: { ...pdfData.cv, accentColor: hex } });
      setPreviewUpdating(false);
    }
    scheduleSave(education, languages, skills, other, hex, summary);
  };

  // ── Build PDF data bundle (memoised to stabilise the debounce effect) ───────
  const pdfData = useMemo(() => serverData ? {
    ...serverData,
    cv: { education, languages, skills, other, photoUrl, accentColor, summary },
  } : null, [serverData, education, languages, skills, other, photoUrl, accentColor, summary]);

  // ── Debounce pdfData → debouncedPdfData (400ms) ────────────────────────────
  useEffect(() => {
    if (!pdfData) return;
    setPreviewUpdating(true);
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      setDebouncedPdfData(pdfData);
      setPreviewUpdating(false);
    }, 400);
    return () => clearTimeout(previewTimer.current);
  }, [pdfData]);

  // Template change is instant — skip the debounce
  const handleTemplateChange = (id) => {
    setTemplate(id);
    if (pdfData) {
      clearTimeout(previewTimer.current);
      setDebouncedPdfData(pdfData);
      setPreviewUpdating(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const fmt = (n) => n ? Math.round(n).toLocaleString() : '0';
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—';

  if (loading) return (
    <LightPage style={{ fontFamily: 'var(--font-body)' }}><div style={{ textAlign: 'center', paddingTop: 80, color: 'var(--text-secondary)' }}>Loading your CV data…</div></LightPage>
  );
  if (!serverData) return (
    <LightPage style={{ fontFamily: 'var(--font-body)' }}><div style={{ textAlign: 'center', paddingTop: 80, color: '#991B1B' }}>Could not load CV data. Please refresh.</div></LightPage>
  );

  const { pilot, certificates, ratings, medicals, training, rtw, totals, recency, aircraftTypes } = serverData;
  const topLicence = ['ATPL','MPL','CPL','PPL'].map(t => certificates?.find(c => c.type === t)).find(Boolean);

  // ── Documents ───────────────────────────────────────────────────────────────
  // PdfDoc: live data for the download button
  const PdfDoc = pdfData
    ? (template === 'approach'
        ? <TemplateApproach data={pdfData} />
        : <TemplateFinal    data={pdfData} />)
    : null;

  // PreviewDoc: debounced data for the PDFViewer (keeps old doc visible while updating)
  const PreviewDoc = debouncedPdfData
    ? (template === 'approach'
        ? <TemplateApproach data={debouncedPdfData} />
        : <TemplateFinal    data={debouncedPdfData} />)
    : null;

  const fileName = `${pilot?.firstName ?? 'CV'}-${pilot?.lastName ?? ''}-CV.pdf`.replace(/\s+/g, '-');

  // Updating badge: true during debounce wait AND during actual PDF blob generation
  const showUpdatingBadge = previewUpdating || pdfInstanceLoading;

  // ── Preview panel (non-mobile) ───────────────────────────────────────────────
  // PdfPreviewIframe is always mounted inside the flex container so it can
  // generate its first blob URL and call back via onLoadingChange.
  // The spinner is an absolute overlay that covers it until the first URL is
  // ready, then disappears permanently. Subsequent regenerations show only the
  // small corner badge so the existing PDF stays visible during updates.
  const previewInner = (
    <>
      <div style={css.previewHeader}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.3 }}>
          Live Preview
        </span>
        {pdfInstanceHasUrl && showUpdatingBadge && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Updating…</span>
        )}
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Always-mounted iframe — must not be gated by any loading state */}
        {PreviewDoc && (
          <PdfPreviewIframe doc={PreviewDoc} onLoadingChange={handlePdfLoadingChange} />
        )}

        {/* First-render spinner: absolute overlay, removed once first URL is ready */}
        {!pdfInstanceHasUrl && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2,
            background: 'var(--bg)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'uc-spin 0.8s linear infinite' }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Generating preview…</span>
          </div>
        )}

        {/* Corner badge during subsequent regenerations — old PDF stays visible */}
        {pdfInstanceHasUrl && showUpdatingBadge && (
          <div style={css.previewUpdatingBadge}>Updating…</div>
        )}
      </div>
    </>
  );

  // ── Editor content ───────────────────────────────────────────────────────────
  const editorContent = (
    <>
      <h1 style={css.heading}>CV Builder</h1>
      <div style={css.sub}>Build and download a professional pilot CV from your profile and logbook data.</div>

      {/* ── Template selector ── */}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Choose a template</div>
      <div style={css.tmplGrid}>
        {[
          { id: 'approach', label: 'Approach', desc: 'Two-column · navy sidebar · traditional', Thumb: ThumbApproach },
          { id: 'final',    label: 'Final',    desc: 'Full-width header · modern blocks',       Thumb: ThumbFinal },
        ].map(({ id, label, desc, Thumb }) => (
          <div key={id} style={css.tmplCard(template === id)} onClick={() => handleTemplateChange(id)}>
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

      {/* ── Colour Theme ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Colour Theme</div>
        <div style={css.swatchRow}>
          {ACCENT_PALETTE.map(({ name, hex }) => (
            <div key={hex} style={css.swatchWrap}>
              <button
                style={css.swatchCircle(accentColor === hex, hex)}
                onClick={() => handleAccentChange(hex)}
                title={name}
              />
              <span style={css.swatchLabel}>{name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Download bar ── */}
      <div style={css.dlBar}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
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
          {saveStatus === 'saved'  && <span style={{ ...css.saveStatus, color: '#166534' }}>Saved</span>}
          {saveStatus === 'error'  && <span style={{ ...css.saveStatus, color: '#991B1B' }}>Save failed</span>}
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

      {/* Professional Profile */}
      <Accordion title="Professional Profile" defaultOpen>
        {(() => {
          const over = summary.length > 800;
          return (
            <>
              <Input
                as="textarea"
                value={summary}
                onChange={(e) => updateSummary(e.target.value)}
                rows={5}
                placeholder="Airline transport pilot with 2,400+ hours across A320 and B737 fleets. EU and UK work authorisation. Seeking long-haul First Officer position with a major carrier."
                style={{
                  minHeight: 100,
                  fontSize: isMobileLayout ? 16 : 13,
                  ...(over ? { borderColor: '#92400E' } : null),
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, flexWrap: 'wrap', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Appears at the top of your CV. Keep it concise — recruiters scan the first 5 seconds.
                </span>
                <span style={{ fontSize: 11, color: over ? '#92400E' : 'var(--text-secondary)', fontWeight: over ? 600 : 400, whiteSpace: 'nowrap' }}>
                  {summary.length} / 800
                </span>
              </div>
            </>
          );
        })()}
      </Accordion>

      {/* Personal information (read-only — canonical from profile) */}
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
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          Edit personal details on the <a href="/profile" style={{ color: 'var(--accent)' }}>Profile page</a>.
          Personal info always appears as entered in your profile (v1 — not overridable here).
        </div>
      </Accordion>

      {/* ─── Photo / Headshot ── */}
      <Accordion title="Photo / Headshot" defaultOpen={!photoUrl} warning={false}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={e => { handlePhotoSelect(e.target.files[0]); e.target.value = ''; }}
        />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
          <div
            onClick={() => !photoLoading && !photoUrl && fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); if (!photoUrl && !photoLoading) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); if (!photoUrl) handlePhotoSelect(e.dataTransfer.files[0]); }}
            style={{
              width: 110, height: 110, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              border: photoUrl
                ? '2.5px solid var(--accent)'
                : `2px dashed ${dragging ? 'var(--accent)' : 'rgba(0,63,136,0.35)'}`,
              background: photoUrl ? 'transparent' : dragging ? 'rgba(0,63,136,0.12)' : 'rgba(0,63,136,0.04)',
              cursor: photoLoading || photoUrl ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            {photoLoading ? (
              <div style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'uc-spin 0.8s linear infinite' }} />
            ) : photoUrl ? (
              <img src={photoUrl} alt="Headshot" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Upload size={22} color="rgba(0,63,136,0.5)" />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            {photoUrl ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginBottom: 4 }}>Photo uploaded</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                  Appears as a circular headshot on your CV. Upload again to replace it.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => fileInputRef.current?.click()} disabled={photoLoading} style={css.addBtn}>
                    <Upload size={13} /> Replace
                  </button>
                  <button
                    onClick={handlePhotoDelete}
                    disabled={photoLoading}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, padding: '8px 14px', cursor: photoLoading ? 'not-allowed' : 'pointer', color: '#991B1B', fontSize: 13, fontWeight: 600 }}
                  >
                    <Trash2 size={13} /> {photoLoading ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Add a headshot</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Optional. Appears as a circular photo on your CV.
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14 }}>
                  JPEG · PNG · WebP &nbsp;·&nbsp; Min 200×200 px &nbsp;·&nbsp; Max 5 MB
                </div>
                <button onClick={() => fileInputRef.current?.click()} disabled={photoLoading} style={css.addBtn}>
                  <Upload size={13} /> Choose photo
                </button>
              </>
            )}
            {photoError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#991B1B', marginTop: 10 }}>
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
        {(recency?.hours90d > 0 || recency?.hours12m > 0) && (
          <div style={{ display: 'flex', gap: 20, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            {recency.hours90d > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>{fmt(recency.hours90d)}h</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Last 90 days</div>
              </div>
            )}
            {recency.hours12m > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>{fmt(recency.hours12m)}h</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Last 12 months</div>
              </div>
            )}
            {recency.sectors90 > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>{recency.sectors90}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Takeoffs / Sectors (90d)</div>
              </div>
            )}
            {(recency.landingsDay90 > 0 || recency.landingsNight90 > 0) && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>
                  {(recency.landingsDay90 ?? 0) + (recency.landingsNight90 ?? 0)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Landings (90 days)</div>
              </div>
            )}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          Hours are aggregated from your <a href="/logbook" style={{ color: 'var(--accent)' }}>Logbook</a>.
        </div>
      </Accordion>

      {/* Medical (read-only from profile) */}
      <Accordion title="Medical (Profile)" badge={medicals?.length || null} defaultOpen={false}>
        {medicals?.map((m, i) => (
          <div key={i} style={{ ...css.listItem, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{m.medicalClass.replace('_', ' ')} — {m.issuingAuthority}</div>
              <div style={{ fontSize: 12, color: '#166534' }}>Valid to {fmtDate(m.expiryDate)}</div>
            </div>
          </div>
        ))}
        {!medicals?.length && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No medical records added yet.</div>}
      </Accordion>

      {/* Licences (read-only from profile) */}
      <Accordion title="Licences (Profile)" badge={certificates?.filter(c => c.type !== 'ELP').length || null} defaultOpen={false}>
        {certificates?.filter(c => c.type !== 'ELP').map((c, i) => (
          <div key={i} style={{ ...css.listItem, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{c.type} — {c.issuingAuthority}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {c.certificateNumber ? `#${c.certificateNumber}` : ''}
                {c.certificateNumber && c.expiryDate ? ' · ' : ''}
                {c.expiryDate ? `Expires ${fmtDate(c.expiryDate)}` : 'No expiry'}
              </div>
            </div>
          </div>
        ))}
        {!certificates?.filter(c => c.type !== 'ELP').length && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            No licences added yet. Add them on the <a href="/profile" style={{ color: 'var(--accent)' }}>Profile page</a>.
          </div>
        )}
      </Accordion>

      {/* Type Ratings (read-only from profile) */}
      <Accordion title="Type Ratings (Profile)" badge={ratings?.length || null} defaultOpen={false}>
        {ratings?.map((r, i) => (
          <div key={i} style={{ ...css.listItem, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.aircraftType} — {r.issuingAuthority}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {r.capacity || r.category}
                {r.hoursOnType ? ` · ${fmt(r.hoursOnType)}h on type` : ''}
                {r.expiryDate ? ` · Expires ${fmtDate(r.expiryDate)}` : ''}
              </div>
            </div>
          </div>
        ))}
        {!ratings?.length && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            No type ratings added yet. Add them on the <a href="/profile" style={{ color: 'var(--accent)' }}>Profile page</a>.
          </div>
        )}
      </Accordion>

      {/* Right to Work (read-only from profile) */}
      <Accordion title="Right to Work (Profile)" badge={rtw?.length || null} defaultOpen={false}>
        {rtw?.map((r, i) => (
          <div key={i} style={{ ...css.listItem, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.country}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {r.documentType}
                {r.documentNumber ? ` · #${r.documentNumber}` : ''}
                {r.expiresAt ? ` · Expires ${fmtDate(new Date(r.expiresAt))}` : ' · No expiry'}
              </div>
            </div>
          </div>
        ))}
        {!rtw?.length && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            No right-to-work documents added yet. Add them on the <a href="/profile" style={{ color: 'var(--accent)' }}>Profile page</a>.
          </div>
        )}
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
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
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
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <Input
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
            />
          </div>
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
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Add any other sections — e.g. Awards, Publications, Volunteer Work.
        </div>
        {other.map((sec, i) => (
          <div key={i} style={css.listItem}>
            <div style={{ ...css.listItemFields, gridTemplateColumns: '1fr' }}>
              <Field label="Section Title" value={sec.title} onChange={v => updateOther(other.map((x,j) => j===i ? {...x, title: v} : x))} placeholder="e.g. Awards & Recognition" />
              <Input
                as="textarea"
                label="Content"
                value={sec.content ?? ''}
                onChange={e => updateOther(other.map((x,j) => j===i ? {...x, content: e.target.value} : x))}
                placeholder="Describe this section…"
                style={{ minHeight: 80 }}
              />
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
    </>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <LightPage style={{ fontFamily: 'var(--font-body)' }}>
      <style>{`@keyframes uc-spin { to { transform: rotate(360deg); } }`}</style>

      {/* ─── Desktop split (≥1024px): editor left 58%, preview right sticky ─── */}
      {isDesktopSplit && (
        <div style={css.outerSplit}>
          <div style={css.editorPane}>
            {editorContent}
          </div>
          <div style={css.previewPaneSticky}>
            <div style={css.previewFrame}>
              {previewInner}
            </div>
          </div>
        </div>
      )}

      {/* ─── Tablet (768–1023px): editor full width, preview stacked below ─── */}
      {!isDesktopSplit && !isMobileLayout && (
        <div style={css.outerStack}>
          {editorContent}
          <div style={css.previewPaneStacked}>
            {previewInner}
          </div>
        </div>
      )}

      {/* ─── Mobile (<768px): Edit / Preview tab switch ─── */}
      {isMobileLayout && (
        <div style={css.outerStack}>
          <div style={css.tabBar}>
            <button style={css.tabBtn(activeTab === 'edit')}    onClick={() => setActiveTab('edit')}>Edit</button>
            <button style={css.tabBtn(activeTab === 'preview')} onClick={() => setActiveTab('preview')}>Preview</button>
          </div>

          {activeTab === 'edit' && editorContent}

          {/* Mobile preview: PDFDownloadLink → open in new tab.
              PDFViewer (blob-URL iframe) is not used on mobile due to iOS Safari
              reliability issues with blob URLs in iframes. */}
          {activeTab === 'preview' && (
            <div style={{ textAlign: 'center', padding: '48px 0 32px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                Open PDF to preview
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
                Tap the button below to generate and open your CV as a PDF.
              </div>
              {PdfDoc && (
                <PDFDownloadLink document={PdfDoc} fileName={fileName}>
                  {({ url, loading: pdfLoading }) =>
                    url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" style={css.dlBtn(false)}>
                        <FileText size={15} /> Open PDF
                      </a>
                    ) : (
                      <span style={{ ...css.dlBtn(true), display: 'inline-flex' }}>
                        <FileText size={15} /> {pdfLoading ? 'Generating…' : 'Open PDF'}
                      </span>
                    )
                  }
                </PDFDownloadLink>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 16 }}>
                Opens in a new tab — save or share from there.
              </div>
            </div>
          )}
        </div>
      )}
    </LightPage>
  );
}
