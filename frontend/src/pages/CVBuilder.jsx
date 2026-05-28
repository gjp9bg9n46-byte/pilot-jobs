import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PDFDownloadLink, usePDF } from '@react-pdf/renderer';
import { Plus, Trash2, ChevronDown, ChevronUp, FileText, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';
import { cvApi } from '../services/api';
import TemplateApproach from '../components/cv/TemplateApproach';
import TemplateFinal from '../components/cv/TemplateFinal';
import { ACCENT_PALETTE, DEFAULT_ACCENT } from '../components/cv/accentPalette';

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
    borderRadius: 14, overflow: 'hidden',
    border: '1px solid #1E3050',
  },
  previewFrame: {
    flex: 1, display: 'flex', flexDirection: 'column',
    border: '1px solid #1E3050', borderRadius: 12, overflow: 'hidden',
    background: '#0A1628', position: 'relative',
  },
  previewFrameStacked: {
    flex: 1, display: 'flex', flexDirection: 'column',
    background: '#0A1628', position: 'relative',
  },
  previewHeader: {
    padding: '10px 16px', background: '#0D1E35', borderBottom: '1px solid #1E3050',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0,
  },
  previewPlaceholder: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    color: '#4A6080', gap: 12,
  },
  previewUpdatingBadge: {
    position: 'absolute', top: 8, right: 8, zIndex: 10,
    background: 'rgba(13,30,53,0.9)', border: '1px solid #1E3050', borderRadius: 8,
    padding: '4px 10px', fontSize: 11, color: '#7A8CA0', fontWeight: 600,
  },
  // Mobile tab bar
  tabBar: {
    display: 'flex', marginBottom: 16,
    background: '#0D1E35', borderRadius: 10, padding: 3,
    border: '1px solid #1E3050',
  },
  tabBtn: (active) => ({
    flex: 1, padding: '8px 12px', borderRadius: 8,
    background: active ? '#1B2B4B' : 'transparent',
    border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
    color: active ? '#fff' : '#4A6080', transition: 'all 0.15s',
  }),
  // Auto-fill badges
  badgeFromProfile: {
    fontSize: 11, fontWeight: 600, color: '#2ECC71',
    background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.25)',
    borderRadius: 8, padding: '2px 8px', marginRight: 8, whiteSpace: 'nowrap',
  },
  badgeCustom: {
    fontSize: 11, fontWeight: 600, color: '#F39C12',
    background: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.25)',
    borderRadius: 8, padding: '2px 8px', marginRight: 8,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  },
  badgeResetBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#F39C12', fontWeight: 600, fontSize: 11, padding: 0,
    textDecoration: 'underline', lineHeight: 1,
  },
  page:        { maxWidth: 960, margin: '0 auto' },
  heading:     { fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 4 },
  sub:         { fontSize: 13, color: '#7A8CA0', marginBottom: 28 },
  // Template cards
  tmplGrid:    { display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' },
  tmplCard:    (active) => ({
    flex: '1 1 200px', padding: '0 0 16px', borderRadius: 16, cursor: 'pointer',
    border: `2px solid ${active ? '#00B4D8' : '#1E3050'}`,
    background: active ? 'rgba(0,180,216,0.06)' : '#0D1E35',
    transition: 'all 0.15s', overflow: 'hidden',
  }),
  tmplThumb:   { height: 120, display: 'flex', overflow: 'hidden', borderRadius: '14px 14px 0 0', marginBottom: 10 },
  tmplLabel:   { padding: '0 14px', fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 },
  tmplDesc:    { padding: '0 14px', fontSize: 11, color: '#7A8CA0' },
  activeCheck: { padding: '0 14px', marginTop: 5, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#00B4D8', fontWeight: 600 },
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
  // Accent colour picker
  swatchRow:   { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  swatchWrap:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  swatchCircle:(active, hex) => ({
    width: 44, height: 44, borderRadius: '50%', background: hex,
    cursor: 'pointer', border: 'none', padding: 0,
    outline: active ? `3px solid ${hex}` : 'none',
    outlineOffset: active ? 3 : 0,
    boxShadow: active ? `0 0 0 5px rgba(255,255,255,0.25)` : 'none',
    transition: 'all 0.12s',
  }),
  swatchLabel: { fontSize: 10, color: '#4A6080', fontWeight: 600, whiteSpace: 'nowrap' },
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
          ? <AlertTriangle size={15} color="#F39C12" />
          : <CheckCircle2 size={15} color="#2ECC71" />}
        <span style={css.accTitle}>{title}</span>
        {headerExtra}
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

// ─── Auto-fill source: 'from-profile' | 'custom' | null ──────────────────────
// Returns 'from-profile' if cv field is empty and profile has data.
// Returns 'custom' if cv field has data and profile also has data (user overrode).
// Returns null if no profile data exists (no badge needed).
function autoFillSource(cvValue, profileValue) {
  const hasProfile = profileValue != null &&
    (Array.isArray(profileValue) ? profileValue.length > 0 : true);
  if (!hasProfile) return null;
  const hasCv = cvValue != null &&
    (Array.isArray(cvValue) ? cvValue.length > 0 : true);
  return hasCv ? 'custom' : 'from-profile';
}

// ─── Profile badge component ──────────────────────────────────────────────────
function ProfileBadge({ source, onReset }) {
  if (source === 'from-profile') {
    return <span style={css.badgeFromProfile}>From profile</span>;
  }
  if (source === 'custom') {
    return (
      <span style={css.badgeCustom} onClick={e => e.stopPropagation()}>
        Custom ·{' '}
        <button
          style={css.badgeResetBtn}
          onClick={e => { e.stopPropagation(); onReset(); }}
        >
          Reset
        </button>
      </span>
    );
  }
  return null;
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
  const [typeRatings, setTypeRatings]   = useState([]);
  const [licenses, setLicenses]         = useState([]);
  const [medical, setMedical]           = useState(null);
  const [icaoEnglish, setIcaoEnglish]   = useState(null);
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
        setTypeRatings(data.cv?.typeRatings ?? []);
        setLicenses(data.cv?.licenses ?? []);
        setMedical(data.cv?.medical ?? null);
        setIcaoEnglish(data.cv?.icaoEnglish ?? null);
        setPhotoUrl(data.cv?.photoUrl ?? null);
        setAccentColor(data.cv?.accentColor ?? DEFAULT_ACCENT);
        setSummary(data.cv?.summary ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Auto-save editable fields (debounced 1.5s) ─────────────────────────────
  const scheduleSave = useCallback((edu, lang, sk, oth, tr, lic, med, icao, ac, sum) => {
    clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(() => {
      cvApi.update({ education: edu, languages: lang, skills: sk, other: oth,
                     typeRatings: tr, licenses: lic, medical: med, icaoEnglish: icao,
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

  const ss = (edu, lang, sk, oth, tr, lic, med, icao, ac, sum) =>
    scheduleSave(edu, lang, sk, oth, tr, lic, med, icao, ac, sum);

  const updateEducation   = (v) => { setEducation(v);   ss(v, languages, skills, other, typeRatings, licenses, medical, icaoEnglish, accentColor, summary); };
  const updateLanguages   = (v) => { setLanguages(v);   ss(education, v, skills, other, typeRatings, licenses, medical, icaoEnglish, accentColor, summary); };
  const updateSkills      = (v) => { setSkills(v);      ss(education, languages, v, other, typeRatings, licenses, medical, icaoEnglish, accentColor, summary); };
  const updateOther       = (v) => { setOther(v);       ss(education, languages, skills, v, typeRatings, licenses, medical, icaoEnglish, accentColor, summary); };
  const updateTypeRatings = (v) => { setTypeRatings(v); ss(education, languages, skills, other, v, licenses, medical, icaoEnglish, accentColor, summary); };
  const updateLicenses    = (v) => { setLicenses(v);    ss(education, languages, skills, other, typeRatings, v, medical, icaoEnglish, accentColor, summary); };
  const updateMedical     = (v) => { setMedical(v);     ss(education, languages, skills, other, typeRatings, licenses, v, icaoEnglish, accentColor, summary); };
  const updateIcaoEnglish = (v) => { setIcaoEnglish(v); ss(education, languages, skills, other, typeRatings, licenses, medical, v, accentColor, summary); };
  const updateSummary     = (v) => { setSummary(v);     ss(education, languages, skills, other, typeRatings, licenses, medical, icaoEnglish, accentColor, v); };

  const handleAccentChange = (hex) => {
    setAccentColor(hex);
    // Instant preview: bypass the 400ms debounce (same as handleTemplateChange)
    if (pdfData) {
      clearTimeout(previewTimer.current);
      setDebouncedPdfData({ ...pdfData, cv: { ...pdfData.cv, accentColor: hex } });
      setPreviewUpdating(false);
    }
    scheduleSave(education, languages, skills, other, typeRatings, licenses, medical, icaoEnglish, hex, summary);
  };

  // ── Build PDF data bundle (memoised to stabilise the debounce effect) ───────
  const pdfData = useMemo(() => serverData ? {
    ...serverData,
    cv: { education, languages, skills, other, photoUrl, typeRatings, licenses, medical, icaoEnglish, accentColor, summary },
  } : null, [serverData, education, languages, skills, other, photoUrl, typeRatings, licenses, medical, icaoEnglish, accentColor, summary]);

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
    <div style={{ textAlign: 'center', paddingTop: 80, color: '#7A8CA0' }}>Loading your CV data…</div>
  );
  if (!serverData) return (
    <div style={{ textAlign: 'center', paddingTop: 80, color: '#FF6B6B' }}>Could not load CV data. Please refresh.</div>
  );

  const { pilot, certificates, ratings, medicals, training, totals, recency, aircraftTypes } = serverData;
  const topLicence = ['ATPL','MPL','CPL','PPL'].map(t => certificates?.find(c => c.type === t)).find(Boolean);

  // ── Profile-derived values for auto-fill badges ─────────────────────────────
  const profileLicenses = (certificates ?? [])
    .filter(c => ['ATPL', 'MPL', 'CPL', 'PPL'].includes(c.type))
    .map(c => ({ type: c.type, number: c.certificateNumber || '', authority: c.issuingAuthority || '', issueDate: c.issueDate || '' }));

  const profileTypeRatings = (ratings ?? [])
    .map(r => ({ aircraftType: r.aircraftType, capacity: r.capacity || 'PIC', dateIssued: '', expiryDate: r.expiryDate || '' }));

  const m0 = medicals?.[0];
  const profileMedical = m0
    ? { class: (m0.medicalClass || '').replace('CLASS_', '') || '1', country: m0.issuingAuthority || '', issueDate: m0.issueDate || '', expiryDate: m0.expiryDate || '' }
    : null;

  const elpCert = (certificates ?? []).find(c => c.type === 'ELP');
  const profileIcaoEnglish = elpCert
    ? { level: elpCert.englishLevel || '6', dateIssued: elpCert.issueDate || '', expiryDate: elpCert.expiryDate || '', otherLanguages: [] }
    : null;

  const licSource = autoFillSource(licenses,    profileLicenses);
  const trSource  = autoFillSource(typeRatings, profileTypeRatings);
  const medSource = autoFillSource(medical,     profileMedical);
  const elpSource = autoFillSource(icaoEnglish, profileIcaoEnglish);

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
        <span style={{ fontSize: 12, fontWeight: 600, color: '#7A8CA0', letterSpacing: 0.3 }}>
          Live Preview
        </span>
        {pdfInstanceHasUrl && showUpdatingBadge && (
          <span style={{ fontSize: 11, color: '#4A6080' }}>Updating…</span>
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
            background: '#0A1628',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid #1B2B4B', borderTopColor: '#00B4D8', animation: 'uc-spin 0.8s linear infinite' }} />
            <span style={{ fontSize: 13, color: '#4A6080' }}>Generating preview…</span>
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
      <div style={css.heading}>CV Builder</div>
      <div style={css.sub}>Build and download a professional pilot CV from your profile and logbook data.</div>

      {/* ── Template selector ── */}
      <div style={{ fontSize: 12, color: '#4A6080', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Choose a template</div>
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
        <div style={{ fontSize: 12, color: '#4A6080', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Colour Theme</div>
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

      {/* Professional Profile */}
      <Accordion title="Professional Profile" defaultOpen>
        {(() => {
          const over = summary.length > 800;
          return (
            <>
              <textarea
                value={summary}
                onChange={(e) => updateSummary(e.target.value)}
                rows={5}
                placeholder="Airline transport pilot with 2,400+ hours across A320 and B737 fleets. EU and UK work authorisation. Seeking long-haul First Officer position with a major carrier."
                style={{
                  ...css.textarea,
                  minHeight: 100,
                  fontSize: isMobileLayout ? 16 : 13,
                  borderColor: over ? '#F39C12' : '#243050',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, flexWrap: 'wrap', gap: 4 }}>
                <span style={{ fontSize: 11, color: '#4A6080' }}>
                  Appears at the top of your CV. Keep it concise — recruiters scan the first 5 seconds.
                </span>
                <span style={{ fontSize: 11, color: over ? '#F39C12' : '#4A6080', fontWeight: over ? 600 : 400, whiteSpace: 'nowrap' }}>
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
        <div style={{ marginTop: 8, fontSize: 12, color: '#4A6080' }}>
          Edit personal details on the <a href="/profile" style={{ color: '#00B4D8' }}>Profile page</a>.
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
        {(recency?.hours90d > 0 || recency?.hours12m > 0) && (
          <div style={{ display: 'flex', gap: 20, marginTop: 12, paddingTop: 12, borderTop: '1px solid #1B2B4B', flexWrap: 'wrap' }}>
            {recency.hours90d > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#00B4D8' }}>{fmt(recency.hours90d)}h</div>
                <div style={{ fontSize: 11, color: '#4A6080' }}>Last 90 days</div>
              </div>
            )}
            {recency.hours12m > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#00B4D8' }}>{fmt(recency.hours12m)}h</div>
                <div style={{ fontSize: 11, color: '#4A6080' }}>Last 12 months</div>
              </div>
            )}
            {recency.sectors90 > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#00B4D8' }}>{recency.sectors90}</div>
                <div style={{ fontSize: 11, color: '#4A6080' }}>Takeoffs / Sectors (90d)</div>
              </div>
            )}
            {(recency.landingsDay90 > 0 || recency.landingsNight90 > 0) && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#00B4D8' }}>
                  {(recency.landingsDay90 ?? 0) + (recency.landingsNight90 ?? 0)}
                </div>
                <div style={{ fontSize: 11, color: '#4A6080' }}>Landings (90 days)</div>
              </div>
            )}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: '#4A6080' }}>
          Hours are aggregated from your <a href="/logbook" style={{ color: '#00B4D8' }}>Logbook</a>.
        </div>
      </Accordion>

      {/* Licences & ratings (read-only from profile) */}
      <Accordion title="Licences & Type Ratings (Profile)" badge={(certificates?.length ?? 0) + (ratings?.length ?? 0) || null} defaultOpen={false}>
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

      {/* Medical (read-only from profile) */}
      <Accordion title="Medical (Profile)" badge={medicals?.length || null} defaultOpen={false}>
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

      {/* ─── Editable: Type Ratings (overrides profile on PDF) ── */}
      <Accordion
        title="Type Ratings"
        badge={typeRatings.length || null}
        defaultOpen={false}
        headerExtra={
          <ProfileBadge
            source={trSource}
            onReset={() => updateTypeRatings([])}
          />
        }
      >
        <div style={{ fontSize: 12, color: '#4A6080', marginBottom: 12 }}>
          {trSource === 'from-profile'
            ? 'PDF uses your profile type ratings. Add entries here to override them all (all-or-nothing).'
            : trSource === 'custom'
            ? 'PDF uses these custom entries instead of your profile ratings. Remove all to revert to profile.'
            : 'Manually enter your type ratings. These override any ratings pulled from your profile on the PDF.'}
        </div>
        {typeRatings.map((r, i) => (
          <div key={i} style={css.listItem}>
            <div style={{ ...css.listItemFields, gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Aircraft Type" value={r.aircraftType} onChange={v => updateTypeRatings(typeRatings.map((x,j) => j===i ? {...x, aircraftType: v} : x))} placeholder="e.g. B737-800, A320" />
              <div>
                <div style={css.inputLabel}>Capacity</div>
                <select value={r.capacity} onChange={e => updateTypeRatings(typeRatings.map((x,j) => j===i ? {...x, capacity: e.target.value} : x))} style={css.input}>
                  <option value="PIC">PIC</option>
                  <option value="SIC">SIC</option>
                </select>
              </div>
              <Field label="Date Issued" value={r.dateIssued || ''} onChange={v => updateTypeRatings(typeRatings.map((x,j) => j===i ? {...x, dateIssued: v} : x))} type="date" />
              <Field label="Expiry Date (optional)" value={r.expiryDate || ''} onChange={v => updateTypeRatings(typeRatings.map((x,j) => j===i ? {...x, expiryDate: v} : x))} type="date" />
            </div>
            <button style={css.deleteBtn} onClick={() => updateTypeRatings(typeRatings.filter((_,j) => j!==i))}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button style={css.addBtn} onClick={() => updateTypeRatings([...typeRatings, { aircraftType: '', capacity: 'PIC', dateIssued: '', expiryDate: '' }])}>
          <Plus size={14} /> Add Type Rating
        </button>
      </Accordion>

      {/* ─── Editable: Licenses (overrides profile on PDF) ── */}
      <Accordion
        title="Licences"
        badge={licenses.length || null}
        defaultOpen={false}
        headerExtra={
          <ProfileBadge
            source={licSource}
            onReset={() => updateLicenses([])}
          />
        }
      >
        <div style={{ fontSize: 12, color: '#4A6080', marginBottom: 12 }}>
          {licSource === 'from-profile'
            ? 'PDF uses your profile licences. Add entries here to override them all (all-or-nothing).'
            : licSource === 'custom'
            ? 'PDF uses these custom entries instead of your profile licences. Remove all to revert to profile.'
            : 'Manually enter your pilot licences. These override profile-sourced licences on the PDF.'}
        </div>
        {licenses.map((l, i) => (
          <div key={i} style={css.listItem}>
            <div style={{ ...css.listItemFields, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <div style={css.inputLabel}>Licence Type</div>
                <select value={l.type} onChange={e => updateLicenses(licenses.map((x,j) => j===i ? {...x, type: e.target.value} : x))} style={css.input}>
                  <option value="ATPL">ATPL</option>
                  <option value="MPL">MPL</option>
                  <option value="CPL">CPL</option>
                  <option value="PPL">PPL</option>
                </select>
              </div>
              <Field label="Licence Number" value={l.number || ''} onChange={v => updateLicenses(licenses.map((x,j) => j===i ? {...x, number: v} : x))} placeholder="e.g. 12345678" />
              <Field label="Issuing Authority / Country" value={l.authority || ''} onChange={v => updateLicenses(licenses.map((x,j) => j===i ? {...x, authority: v} : x))} placeholder="e.g. EASA, UAE-GCAA, FAA" />
              <Field label="Issue Date" value={l.issueDate || ''} onChange={v => updateLicenses(licenses.map((x,j) => j===i ? {...x, issueDate: v} : x))} type="date" />
            </div>
            <button style={css.deleteBtn} onClick={() => updateLicenses(licenses.filter((_,j) => j!==i))}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button style={css.addBtn} onClick={() => updateLicenses([...licenses, { type: 'ATPL', number: '', authority: '', issueDate: '' }])}>
          <Plus size={14} /> Add Licence
        </button>
      </Accordion>

      {/* ─── Editable: Medical (overrides profile on PDF) ── */}
      <Accordion
        title="Medical Certificate"
        badge={medical ? `Class ${medical.class}` : null}
        defaultOpen={!medical}
        headerExtra={
          <ProfileBadge
            source={medSource}
            onReset={() => updateMedical(null)}
          />
        }
      >
        <div style={{ fontSize: 12, color: '#4A6080', marginBottom: 12 }}>
          {medSource === 'from-profile'
            ? 'PDF uses your profile medical. Add a record here to override it.'
            : medSource === 'custom'
            ? 'PDF uses this custom record instead of your profile medical. Remove it to revert to profile.'
            : 'Single medical record for your CV. Overrides profile-sourced medical on the PDF.'}
        </div>
        {medical ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 14 }}>
              <div>
                <div style={css.inputLabel}>Class</div>
                <select value={medical.class} onChange={e => updateMedical({...medical, class: e.target.value})} style={css.input}>
                  <option value="1">Class 1</option>
                  <option value="2">Class 2</option>
                </select>
              </div>
              <Field label="Country / Authority" value={medical.country || ''} onChange={v => updateMedical({...medical, country: v})} placeholder="e.g. EASA, UAE, FAA" />
              <Field label="Date Issued" value={medical.issueDate || ''} onChange={v => updateMedical({...medical, issueDate: v})} type="date" />
              <Field label="Expiry Date" value={medical.expiryDate || ''} onChange={v => updateMedical({...medical, expiryDate: v})} type="date" />
            </div>
            <button onClick={() => updateMedical(null)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', color: '#FF6B6B', fontSize: 13, fontWeight: 600 }}>
              <Trash2 size={13} /> Remove Medical
            </button>
          </div>
        ) : (
          <button style={css.addBtn} onClick={() => updateMedical({ class: '1', country: '', issueDate: '', expiryDate: '' })}>
            <Plus size={14} /> Add Medical Certificate
          </button>
        )}
      </Accordion>

      {/* ─── Editable: ICAO English (overrides profile on PDF) ── */}
      <Accordion
        title="ICAO English Proficiency"
        badge={icaoEnglish ? `Level ${icaoEnglish.level}` : null}
        defaultOpen={!icaoEnglish}
        headerExtra={
          <ProfileBadge
            source={elpSource}
            onReset={() => updateIcaoEnglish(null)}
          />
        }
      >
        <div style={{ fontSize: 12, color: '#4A6080', marginBottom: 12 }}>
          {elpSource === 'from-profile'
            ? 'PDF uses your profile ELP certificate. Add a record here to override it.'
            : elpSource === 'custom'
            ? 'PDF uses this custom record instead of your profile ELP. Remove it to revert to profile.'
            : 'Add your ELP certificate here. Other languages added below will appear on the CV instead of the Languages section above.'}
        </div>
        {icaoEnglish ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 16 }}>
              <div>
                <div style={css.inputLabel}>ICAO Level</div>
                <select value={icaoEnglish.level} onChange={e => updateIcaoEnglish({...icaoEnglish, level: e.target.value})} style={css.input}>
                  <option value="4">Level 4 — Operational</option>
                  <option value="5">Level 5 — Extended</option>
                  <option value="6">Level 6 — Expert</option>
                </select>
              </div>
              <Field label="Date Issued" value={icaoEnglish.dateIssued || ''} onChange={v => updateIcaoEnglish({...icaoEnglish, dateIssued: v})} type="date" />
              <Field label="Expiry Date (optional)" value={icaoEnglish.expiryDate || ''} onChange={v => updateIcaoEnglish({...icaoEnglish, expiryDate: v})} type="date" />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#7A8CA0', marginBottom: 8 }}>Other Languages</div>
            {(icaoEnglish.otherLanguages ?? []).map((l, i) => (
              <div key={i} style={css.listItem}>
                <div style={{ ...css.listItemFields, gridTemplateColumns: '1fr 1fr' }}>
                  <Field label="Language" value={l.language} onChange={v => updateIcaoEnglish({...icaoEnglish, otherLanguages: (icaoEnglish.otherLanguages ?? []).map((x,j) => j===i ? {...x, language: v} : x)})} placeholder="e.g. Arabic" />
                  <div>
                    <div style={css.inputLabel}>Proficiency</div>
                    <select value={l.proficiency} onChange={e => updateIcaoEnglish({...icaoEnglish, otherLanguages: (icaoEnglish.otherLanguages ?? []).map((x,j) => j===i ? {...x, proficiency: e.target.value} : x)})} style={css.input}>
                      <option value="Basic">Basic</option>
                      <option value="Conversational">Conversational</option>
                      <option value="Fluent">Fluent</option>
                      <option value="Native">Native</option>
                    </select>
                  </div>
                </div>
                <button style={css.deleteBtn} onClick={() => updateIcaoEnglish({...icaoEnglish, otherLanguages: (icaoEnglish.otherLanguages ?? []).filter((_,j) => j!==i)})}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button style={css.addBtn} onClick={() => updateIcaoEnglish({...icaoEnglish, otherLanguages: [...(icaoEnglish.otherLanguages ?? []), { language: '', proficiency: 'Fluent' }]})}>
                <Plus size={14} /> Add Language
              </button>
              <button onClick={() => updateIcaoEnglish(null)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', color: '#FF6B6B', fontSize: 13, fontWeight: 600 }}>
                <Trash2 size={13} /> Remove ELP Record
              </button>
            </div>
          </div>
        ) : (
          <button style={css.addBtn} onClick={() => updateIcaoEnglish({ level: '6', dateIssued: '', expiryDate: '', otherLanguages: [] })}>
            <Plus size={14} /> Add ELP Certificate
          </button>
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
    </>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
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
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
                Open PDF to preview
              </div>
              <div style={{ fontSize: 13, color: '#7A8CA0', marginBottom: 24 }}>
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
              <div style={{ fontSize: 11, color: '#4A6080', marginTop: 16 }}>
                Opens in a new tab — save or share from there.
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
