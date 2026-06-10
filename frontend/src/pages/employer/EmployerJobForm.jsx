import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { employerApi } from '../../services/employerApi';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import AircraftCombobox from '../../components/AircraftCombobox';
import JobPreviewCard from './JobPreviewCard';
import { Input, Button } from '../../components/primitives';

const ROLES = [['', '—'], ['CAPTAIN', 'Captain'], ['FIRST_OFFICER', 'First Officer'], ['INSTRUCTOR', 'Instructor']];
// Backend whitelist (employerJobController VALID_CONTRACT_TYPES) — NOT the Airline enum.
const CONTRACT_TYPES = [['', '—'], ['PERMANENT', 'Permanent'], ['CONTRACT', 'Fixed-term / Contract'], ['FREELANCE', 'Freelance / Agency'], ['PART_TIME', 'Part-time']];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'AED', 'SGD', 'CHF', 'JPY', 'INR', 'BRL', 'ZAR'];
const PERIODS = [['', '—'], ['YEAR', 'Per year'], ['MONTH', 'Per month'], ['HOUR', 'Per hour']];
const AUTHORITIES = ['EASA', 'FAA', 'CAA', 'TCCA', 'CASA', 'JCAB', 'GCAA', 'ANAC', 'DGCA', 'CAAC', 'CAA_NZ', 'CAAS', 'DGAC', 'FATA', 'ICAO', 'Other'];
const CERTIFICATES = ['ATPL', 'CPL', 'MPL', 'PPL'];
const MEDICAL = [['', '—'], ['CLASS_1', 'Class 1'], ['CLASS_2', 'Class 2'], ['CLASS_3', 'Class 3']];
const EDUCATION = [['', '—'], ['high_school', 'High School'], ['technical', 'Technical'], ['bachelor', 'Bachelor'], ['masters', 'Masters'], ['doctorate', 'Doctorate']];
const WORKAUTH = [['', '—'], ['EU', 'EU'], ['US', 'US'], ['UK', 'UK'], ['required', 'Required (any)'], ['Other', 'Other']];
const ENGLISH = [['', '—'], ['4', 'ICAO Level 4'], ['5', 'ICAO Level 5'], ['6', 'ICAO Level 6']];

const HOUR_FIELDS = [
  ['reqMinTotalHours', 'Total hours min'], ['reqMinPicHours', 'PIC hours min'],
  ['reqMinMultiEngineHours', 'Multi-engine hours min'], ['reqMinTurbineHours', 'Turbine hours min'],
  ['reqMinInstrumentHours', 'Instrument hours min'], ['reqMinCrossCountryHours', 'Cross-country hours min'],
];

const DESC_MAX = 10000;

// Warm pilot palette for the "Live preview" island (WYSIWYG of pilot output)
// inside the cool .app-b2b form. Mirrors :root / .app-light token values.
const WARM = { '--bg': '#F8F6F1', '--surface': '#FFFFFF', '--border': '#E5E1D8', '--text-primary': '#0F1419', '--text-secondary': '#5A5F66', '--accent': '#003F88', '--accent-hover': '#002B5C' };

const css = {
  page: { minHeight: '100vh', background: 'var(--bg)', padding: '24px 0 64px', fontFamily: 'var(--font-body)' },
  wrap: { maxWidth: 1100, margin: '0 auto', padding: '0 20px' },
  top: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  h1: { fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' },
  back: { color: 'var(--text-secondary)', fontSize: 14, textDecoration: 'none', cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'var(--font-body)' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 400px', gap: 28, alignItems: 'start' },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 },
  section: { fontSize: 13, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '22px 0 12px' },
  field: { marginBottom: 16 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },
  label: { display: 'block', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, marginBottom: 6 },
  hint: { color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 9px', color: 'var(--text-primary)', fontSize: 13 },
  chipX: { cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 700 },
  multi: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  pill: (on) => ({ cursor: 'pointer', userSelect: 'none', fontSize: 13, fontWeight: 600, padding: '7px 12px', borderRadius: 6, border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)'), background: on ? 'rgba(0,63,136,0.08)' : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--text-secondary)' }),
  check: { display: 'flex', alignItems: 'center', gap: 9, color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer' },
  banner: { background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '12px 14px', color: '#991B1B', fontSize: 13, marginBottom: 18 },
  previewWrap: { position: 'sticky', top: 24 },
  previewLabel: { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },
  previewIsland: { background: 'var(--bg)', borderRadius: 12, padding: 16 },
  tabs: { display: 'flex', gap: 8, marginBottom: 16 },
  tab: (on) => ({ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 14, background: on ? 'rgba(0,63,136,0.08)' : 'transparent', border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)'), color: on ? 'var(--accent)' : 'var(--text-secondary)' }),
};

const EMPTY = {
  title: '', role: '', location: '', country: '', contractType: '', description: '', applyUrl: '',
  salaryMin: '', salaryMax: '', salaryCurrency: 'USD', salaryPeriod: '',
  reqAuthorities: [], reqCertificates: [], reqAircraftTypes: [],
  reqMinTotalHours: '', reqMinPicHours: '', reqMinMultiEngineHours: '', reqMinTurbineHours: '',
  reqMinInstrumentHours: '', reqMinCrossCountryHours: '',
  reqMedicalClass: '', reqEducation: '', reqWorkAuthorization: '', reqEnglishLevel: '', reqWillingToRelocate: false,
};

export default function EmployerJobForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { employer } = useEmployerAuth();

  const [form, setForm] = useState(EMPTY);
  const [aircraftInput, setAircraftInput] = useState('');
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingJob, setLoadingJob] = useState(isEdit);
  const [tab, setTab] = useState('form'); // mobile: form | preview

  // Edit: load the job from the employer's own list, redirect if not theirs.
  useEffect(() => {
    if (!isEdit) return;
    employerApi.listJobs().then(({ data }) => {
      const job = data.find((j) => j.id === id);
      if (!job) { navigate('/employer/dashboard', { state: { toast: 'Job not found.' } }); return; }
      setForm({
        ...EMPTY, ...job,
        role: job.role || '', contractType: job.contractType || '',
        salaryMin: job.salaryMin ?? '', salaryMax: job.salaryMax ?? '', salaryCurrency: job.salaryCurrency || 'USD', salaryPeriod: job.salaryPeriod || '',
        reqAuthorities: job.reqAuthorities || [], reqCertificates: job.reqCertificates || [], reqAircraftTypes: job.reqAircraftTypes || [],
        reqMinTotalHours: job.reqMinTotalHours ?? '', reqMinPicHours: job.reqMinPicHours ?? '',
        reqMinMultiEngineHours: job.reqMinMultiEngineHours ?? '', reqMinTurbineHours: job.reqMinTurbineHours ?? '',
        reqMinInstrumentHours: job.reqMinInstrumentHours ?? '', reqMinCrossCountryHours: job.reqMinCrossCountryHours ?? '',
        reqMedicalClass: job.reqMedicalClass || '', reqEducation: job.reqEducation || '',
        reqWorkAuthorization: job.reqWorkAuthorization || '', reqEnglishLevel: job.reqEnglishLevel ?? '',
        reqWillingToRelocate: !!job.reqWillingToRelocate,
      });
    }).catch(() => navigate('/employer/dashboard', { state: { toast: 'Could not load job.' } }))
      .finally(() => setLoadingJob(false));
  }, [id, isEdit, navigate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleArr = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));
  const addAircraft = () => {
    const v = aircraftInput.trim();
    if (v && !form.reqAircraftTypes.includes(v)) setForm((f) => ({ ...f, reqAircraftTypes: [...f.reqAircraftTypes, v] }));
    setAircraftInput('');
  };

  // 300ms-debounced copy for the live preview
  const [debounced, setDebounced] = useState(form);
  useEffect(() => { const t = setTimeout(() => setDebounced(form), 300); return () => clearTimeout(t); }, [form]);
  const previewJob = useMemo(() => ({
    ...debounced,
    salaryMin: debounced.salaryMin === '' ? null : Number(debounced.salaryMin),
    salaryMax: debounced.salaryMax === '' ? null : Number(debounced.salaryMax),
    reqMinTotalHours: debounced.reqMinTotalHours === '' ? null : Number(debounced.reqMinTotalHours),
  }), [debounced]);

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = 'Title is required';
    else if (form.title.length > 200) e.title = 'Title must be 200 characters or fewer';
    if (!form.description.trim()) e.description = 'Description is required';
    else if (form.description.length > DESC_MAX) e.description = `Description must be ${DESC_MAX.toLocaleString()} characters or fewer`;
    if (!form.applyUrl.trim()) e.applyUrl = 'Apply URL is required';
    else { try { new URL(form.applyUrl.trim()); } catch { e.applyUrl = 'Enter a valid URL (including https://)'; } }
    const min = form.salaryMin === '' ? null : Number(form.salaryMin);
    const max = form.salaryMax === '' ? null : Number(form.salaryMax);
    if (min != null && max != null && max < min) e.salaryMax = 'Maximum salary must be ≥ minimum';
    return e;
  };

  const buildPayload = () => {
    const p = {
      title: form.title.trim(), description: form.description.trim(),
      location: form.location.trim(), applyUrl: form.applyUrl.trim(),
    };
    if (form.country.trim()) p.country = form.country.trim();
    if (form.role) p.role = form.role;
    if (form.contractType) p.contractType = form.contractType;
    if (form.salaryMin !== '') p.salaryMin = Number(form.salaryMin);
    if (form.salaryMax !== '') p.salaryMax = Number(form.salaryMax);
    if (form.salaryCurrency) p.salaryCurrency = form.salaryCurrency;
    if (form.salaryPeriod) p.salaryPeriod = form.salaryPeriod;
    if (form.reqAuthorities.length) p.reqAuthorities = form.reqAuthorities;
    if (form.reqCertificates.length) p.reqCertificates = form.reqCertificates;
    if (form.reqAircraftTypes.length) p.reqAircraftTypes = form.reqAircraftTypes;
    for (const [k] of HOUR_FIELDS) if (form[k] !== '') p[k] = Number(form[k]);
    if (form.reqMedicalClass) p.reqMedicalClass = form.reqMedicalClass;
    if (form.reqEducation) p.reqEducation = form.reqEducation;
    if (form.reqWorkAuthorization) p.reqWorkAuthorization = form.reqWorkAuthorization;
    if (form.reqEnglishLevel !== '') p.reqEnglishLevel = Number(form.reqEnglishLevel);
    p.reqWillingToRelocate = !!form.reqWillingToRelocate;
    return p;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBanner('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) { setTab('form'); return; }
    setLoading(true);
    try {
      if (isEdit) {
        await employerApi.updateJob(id, buildPayload());
        navigate('/employer/dashboard', { state: { toast: 'Job updated!' } });
      } else {
        await employerApi.createJob(buildPayload());
        navigate('/employer/dashboard', { state: { toast: 'Job posted!' } });
      }
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) { navigate('/employer/pending-approval'); return; }
      if (status === 400 && Array.isArray(err.response?.data?.errors)) {
        const se = {}; for (const x of err.response.data.errors) if (x.path) se[x.path] = x.msg;
        setErrors(se); setBanner('Please correct the highlighted fields.'); setTab('form');
      } else setBanner(err.response?.data?.error || 'Could not save the job. Please try again.');
    } finally { setLoading(false); }
  };

  if (loadingJob) return <div className="app-b2b" style={{ ...css.page, color: 'var(--text-secondary)', textAlign: 'center', paddingTop: 80 }}>Loading…</div>;

  const numField = (k, label) => (
    <div style={css.field} key={k}>
      <Input label={label} type="number" min="0" value={form[k]} onChange={set(k)} placeholder="—" error={errors[k]} />
    </div>
  );
  const selField = (k, label, options) => (
    <div style={css.field}>
      <Input as="select" label={label} value={form[k]} onChange={set(k)} error={errors[k]}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Input>
    </div>
  );

  const formCol = (
    <form onSubmit={handleSubmit} style={css.card} noValidate>
      {banner && <div style={css.banner}>{banner}</div>}

      <div style={{ ...css.section, marginTop: 0 }}>Basic info</div>
      <div style={css.field}>
        <Input label="Title *" value={form.title} onChange={set('title')} placeholder="e.g. Captain — Citation CJ3" maxLength={200} autoFocus error={errors.title} />
      </div>
      <div style={css.row2}>
        {selField('role', 'Role', ROLES)}
        {selField('contractType', 'Contract Type', CONTRACT_TYPES)}
      </div>
      <div style={css.row2}>
        <div style={css.field}><Input label="Location" value={form.location} onChange={set('location')} placeholder="e.g. Lisbon, PT" /></div>
        <div style={css.field}><Input label="Country" value={form.country} onChange={set('country')} placeholder="e.g. Portugal" /></div>
      </div>

      <div style={css.section}>Description *</div>
      <div style={css.field}>
        <Input as="textarea" value={form.description} onChange={set('description')} maxLength={DESC_MAX} error={errors.description}
          placeholder="Describe the role, requirements, schedule, and any details applicants need." style={{ minHeight: 140 }} />
        <div style={css.hint}>{form.description.length.toLocaleString()}/{DESC_MAX.toLocaleString()} · Plain text, not rich text.</div>
      </div>

      <div style={css.section}>Apply URL *</div>
      <div style={css.field}>
        <Input value={form.applyUrl} onChange={set('applyUrl')} placeholder="https://your-careers-page.com/apply" error={errors.applyUrl} />
        <div style={css.hint}>Where pilots will apply — the "Apply" button on the job card links here.</div>
      </div>

      <div style={css.section}>Salary (optional)</div>
      <div style={css.row2}>
        <div style={css.field}><Input label="Minimum" type="number" min="0" value={form.salaryMin} onChange={set('salaryMin')} placeholder="—" /></div>
        <div style={css.field}><Input label="Maximum" type="number" min="0" value={form.salaryMax} onChange={set('salaryMax')} placeholder="—" error={errors.salaryMax} /></div>
      </div>
      <div style={css.row2}>
        {selField('salaryCurrency', 'Currency', CURRENCIES.map((c) => [c, c]))}
        {selField('salaryPeriod', 'Period', PERIODS)}
      </div>

      <div style={css.section}>Requirements (all optional)</div>
      <div style={css.field}>
        <label style={css.label}>Authorities required</label>
        <div style={css.multi}>{AUTHORITIES.map((a) => <span key={a} style={css.pill(form.reqAuthorities.includes(a))} onClick={() => toggleArr('reqAuthorities', a)}>{a}</span>)}</div>
      </div>
      <div style={css.field}>
        <label style={css.label}>Certificates required</label>
        <div style={css.multi}>{CERTIFICATES.map((c) => <span key={c} style={css.pill(form.reqCertificates.includes(c))} onClick={() => toggleArr('reqCertificates', c)}>{c}</span>)}</div>
      </div>
      <div style={css.field}>
        <label style={css.label}>Aircraft types</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}><AircraftCombobox value={aircraftInput} onChange={setAircraftInput} light inputStyle={{ fontSize: 16, padding: '11px 13px' }} /></div>
          <Button type="button" onClick={addAircraft} style={{ padding: '11px 16px', fontSize: 14 }}>Add</Button>
        </div>
        {form.reqAircraftTypes.length > 0 && (
          <div style={css.chips}>{form.reqAircraftTypes.map((a) => <span key={a} style={css.chip}>{a}<span style={css.chipX} onClick={() => toggleArr('reqAircraftTypes', a)}>×</span></span>)}</div>
        )}
      </div>
      <div style={css.row3}>{HOUR_FIELDS.map(([k, l]) => numField(k, l))}</div>
      <div style={css.row3}>
        {selField('reqMedicalClass', 'Medical class', MEDICAL)}
        {selField('reqEducation', 'Education', EDUCATION)}
        {selField('reqWorkAuthorization', 'Work authorization', WORKAUTH)}
      </div>
      <div style={css.row2}>
        {selField('reqEnglishLevel', 'English level', ENGLISH)}
        <div style={{ ...css.field, display: 'flex', alignItems: 'center', paddingTop: 26 }}>
          <label style={css.check}><input type="checkbox" checked={form.reqWillingToRelocate} onChange={(e) => setForm((f) => ({ ...f, reqWillingToRelocate: e.target.checked }))} style={{ accentColor: 'var(--accent)' }} /> Willing to relocate required</label>
        </div>
      </div>

      <Button type="submit" disabled={loading} style={{ width: '100%', marginTop: 14, padding: '14px 22px', fontSize: 16 }}>
        {loading ? 'Saving…' : (isEdit ? 'Save Changes' : 'Post Job')}
      </Button>
    </form>
  );

  const previewCol = (
    <div style={css.previewWrap}>
      <div style={css.previewLabel}>Live preview — how pilots will see it</div>
      {/* Warm pilot-palette island: the preview shows actual (warm) pilot output,
          not the cool employer chrome around it. */}
      <div className="app-light" style={{ ...WARM, ...css.previewIsland }}>
        <JobPreviewCard job={previewJob} company={employer?.companyName} />
      </div>
    </div>
  );

  return (
    <div className="app-b2b" style={css.page}>
      <div style={css.wrap}>
        <div style={css.top}>
          <div style={css.h1}>{isEdit ? 'Edit Job' : 'Post New Job'}</div>
          <button style={css.back} onClick={() => navigate('/employer/dashboard')}>← Back to dashboard</button>
        </div>

        {isMobile && (
          <div style={css.tabs}>
            <div style={css.tab(tab === 'form')} onClick={() => setTab('form')}>Form</div>
            <div style={css.tab(tab === 'preview')} onClick={() => setTab('preview')}>Preview</div>
          </div>
        )}

        {isMobile
          ? (tab === 'form' ? formCol : previewCol)
          : <div style={css.grid}>{formCol}{previewCol}</div>}
      </div>
    </div>
  );
}
