import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { airlineApi } from '../services/api';

const HIRING_STATUSES = [
  { value: 'ACTIVELY_HIRING', label: 'Actively Hiring' },
  { value: 'OCCASIONAL',      label: 'Occasional'       },
  { value: 'PAUSED',          label: 'Paused'            },
  { value: 'UNKNOWN',         label: 'Unknown'           },
];
const HIRING_FREQUENCIES = [
  { value: 'CONTINUOUS', label: 'Continuous' },
  { value: 'PERIODIC',   label: 'Periodic'   },
  { value: 'RARE',       label: 'Rare'       },
  { value: 'UNKNOWN',    label: 'Unknown'    },
];
const CONTRACT_TYPES = [
  { value: 'PERMANENT',   label: 'Permanent'   },
  { value: 'FIXED_TERM',  label: 'Fixed Term'  },
  { value: 'AGENCY',      label: 'Agency'      },
  { value: 'PAY_TO_FLY',  label: 'Pay-to-Fly'  },
  { value: 'MIXED',       label: 'Mixed'       },
];
const REGIONS = ['Europe', 'Americas', 'Asia-Pacific', 'Middle East', 'Africa'];

// Convert array → newline-separated string for textarea
const arrToText = (arr) => (arr || []).join('\n');
// Convert newline-separated string → trimmed non-empty array
const textToArr = (s) => s.split('\n').map((v) => v.trim()).filter(Boolean);

function initForm(a) {
  if (!a) return {};
  const pr = a.payRanges || {};
  return {
    headquarters:        a.headquarters        ?? '',
    description:         a.description         ?? '',
    fleet:               arrToText(a.fleet),
    bases:               arrToText(a.bases),
    hiringStatus:        a.hiringStatus        ?? '',
    hiringFrequency:     a.hiringFrequency     ?? '',
    contractType:        a.contractType        ?? '',
    rosterPattern:       a.rosterPattern       ?? '',
    workAuthRequired:    arrToText(a.workAuthRequired),
    region:              a.region              ?? '',
    avgResponseDays:     a.avgResponseDays     != null ? String(a.avgResponseDays) : '',
    interviewStages:     arrToText(a.interviewStages),
    simType:             a.simType             ?? '',
    upgradeTimeMinYears: a.upgradeTimeMinYears != null ? String(a.upgradeTimeMinYears) : '',
    upgradeTimeMaxYears: a.upgradeTimeMaxYears != null ? String(a.upgradeTimeMaxYears) : '',
    notes:               a.notes              ?? '',
    // pay ranges — split out of JSON
    captainMin:      pr.captain?.min      != null ? String(pr.captain.min)      : '',
    captainMax:      pr.captain?.max      != null ? String(pr.captain.max)      : '',
    captainCurrency: pr.captain?.currency ?? '',
    captainPeriod:   pr.captain?.period   ?? '',
    foMin:           pr.fo?.min           != null ? String(pr.fo.min)           : '',
    foMax:           pr.fo?.max           != null ? String(pr.fo.max)           : '',
    foCurrency:      pr.fo?.currency      ?? '',
    foPeriod:        pr.fo?.period        ?? '',
  };
}

// Build the proposedChanges diff: only fields that changed from source airline
function buildDiff(form, airline) {
  const changes = {};

  const str = (key, airlineKey) => {
    const v = form[key].trim();
    const cur = airline[airlineKey] ?? null;
    const next = v === '' ? null : v;
    if (next !== cur) changes[airlineKey] = next;
  };

  const arr = (key, airlineKey) => {
    const next = textToArr(form[key]);
    const cur  = airline[airlineKey] || [];
    if (JSON.stringify(next) !== JSON.stringify(cur)) changes[airlineKey] = next;
  };

  const num = (key, airlineKey, isInt) => {
    const v = form[key].trim();
    const cur = airline[airlineKey] ?? null;
    const next = v === '' ? null : (isInt ? parseInt(v, 10) : parseFloat(v));
    if (next !== cur) changes[airlineKey] = next;
  };

  const sel = (key, airlineKey) => {
    const v = form[key];
    const cur = airline[airlineKey] ?? null;
    const next = v === '' ? null : v;
    if (next !== cur) changes[airlineKey] = next;
  };

  str('headquarters',        'headquarters');
  str('description',         'description');
  str('rosterPattern',       'rosterPattern');
  str('simType',             'simType');
  str('notes',               'notes');
  arr('fleet',               'fleet');
  arr('bases',               'bases');
  arr('workAuthRequired',    'workAuthRequired');
  arr('interviewStages',     'interviewStages');
  sel('hiringStatus',        'hiringStatus');
  sel('hiringFrequency',     'hiringFrequency');
  sel('contractType',        'contractType');
  sel('region',              'region');
  num('avgResponseDays',     'avgResponseDays',     true);
  num('upgradeTimeMinYears', 'upgradeTimeMinYears', false);
  num('upgradeTimeMaxYears', 'upgradeTimeMaxYears', false);

  // Pay ranges: reconstruct object, compare to original
  const hasPay = form.captainMin || form.captainMax || form.captainCurrency ||
                 form.foMin || form.foMax || form.foCurrency;
  const origPay = airline.payRanges;

  const captain = {};
  if (form.captainMin)      captain.min      = parseFloat(form.captainMin);
  if (form.captainMax)      captain.max      = parseFloat(form.captainMax);
  if (form.captainCurrency) captain.currency = form.captainCurrency.trim().toUpperCase();
  if (form.captainPeriod)   captain.period   = form.captainPeriod.trim();

  const fo = {};
  if (form.foMin)       fo.min      = parseFloat(form.foMin);
  if (form.foMax)       fo.max      = parseFloat(form.foMax);
  if (form.foCurrency)  fo.currency = form.foCurrency.trim().toUpperCase();
  if (form.foPeriod)    fo.period   = form.foPeriod.trim();

  const newPay = hasPay ? {
    captain: Object.keys(captain).length ? captain : undefined,
    fo:      Object.keys(fo).length ? fo : undefined,
  } : null;

  if (JSON.stringify(newPay) !== JSON.stringify(origPay)) {
    changes.payRanges = newPay;
  }

  return changes;
}

// Client-side validation (mirrors backend rules)
function validateDiff(changes) {
  const errors = {};
  for (const [field, value] of Object.entries(changes)) {
    if (value === null) continue;
    if (['headquarters','description','rosterPattern','simType','notes'].includes(field)) {
      if (typeof value === 'string' && value.trim() === '') {
        errors[field] = 'Cannot be empty — leave unchanged or set to null to clear.';
      }
    }
    if (['avgResponseDays','upgradeTimeMinYears','upgradeTimeMaxYears'].includes(field)) {
      if (value !== null && !Number.isFinite(value)) errors[field] = 'Must be a valid number.';
    }
  }
  return errors;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const S = {
  page: { maxWidth: 740, margin: '0 auto', paddingBottom: 80 },
  back: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    color: '#7A8CA0', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', marginBottom: 20, background: 'none', border: 'none', padding: 0,
  },
  title: { fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 },
  sub:   { fontSize: 13, color: '#4A6080', marginBottom: 20 },
  banner: {
    background: 'rgba(0,180,216,0.08)', border: '1px solid rgba(0,180,216,0.2)',
    borderRadius: 10, padding: '10px 16px', marginBottom: 20,
    fontSize: 13, color: '#00B4D8', display: 'flex', alignItems: 'center', gap: 8,
  },
  section: {
    background: '#0D1E35', border: '1px solid #1E3050',
    borderRadius: 14, padding: '20px 24px', marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: 800, color: '#4A6080',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16,
  },
  field: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: 700, color: '#7A8CA0', marginBottom: 4, display: 'block' },
  hint:  { fontSize: 11, color: '#4A6080', marginTop: 4, lineHeight: 1.5 },
  input: (err) => ({
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', borderRadius: 8,
    background: '#0A1628',
    border: `1px solid ${err ? '#E74C3C' : '#1E3050'}`,
    color: '#fff', fontSize: 14, outline: 'none',
  }),
  textarea: (err) => ({
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', borderRadius: 8,
    background: '#0A1628',
    border: `1px solid ${err ? '#E74C3C' : '#1E3050'}`,
    color: '#fff', fontSize: 14, outline: 'none',
    resize: 'vertical', minHeight: 80,
  }),
  select: (err) => ({
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', borderRadius: 8,
    background: '#0A1628',
    border: `1px solid ${err ? '#E74C3C' : '#1E3050'}`,
    color: '#C8D8E8', fontSize: 14, outline: 'none', cursor: 'pointer',
  }),
  fieldErr: { fontSize: 11, color: '#E74C3C', marginTop: 4 },
  payGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
  },
  submitRow: {
    display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end', flexWrap: 'wrap',
  },
  cancelBtn: {
    padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
    background: 'transparent', border: '1px solid #1E3050', color: '#7A8CA0', cursor: 'pointer',
  },
  submitBtn: (disabled) => ({
    padding: '10px 28px', borderRadius: 10, fontSize: 14, fontWeight: 700,
    background: disabled ? '#1B2B4B' : 'linear-gradient(135deg, #00B4D8, #0077A8)',
    border: 'none', color: disabled ? '#4A6080' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  success: {
    textAlign: 'center', padding: '60px 20px',
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 16,
  },
  successIcon: { fontSize: 36, marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: 800, color: '#2ECC71', marginBottom: 8 },
  successMsg: { fontSize: 14, color: '#7A8CA0', lineHeight: 1.6 },
  toastWrap: {
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: '#E74C3C', color: '#fff', borderRadius: 10,
    padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 9999,
  },
};

function Field({ label, hint, error, children }) {
  return (
    <div style={S.field}>
      <label style={S.label}>{label}</label>
      {children}
      {error && <div style={S.fieldErr}>{error}</div>}
      {hint && <div style={S.hint}>{hint}</div>}
    </div>
  );
}

export default function AirlineContribute() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [airline, setAirline]   = useState(null);
  const [form, setForm]         = useState({});
  const [pending, setPending]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast]       = useState(null);
  const [success, setSuccess]   = useState(false);

  useEffect(() => {
    Promise.all([airlineApi.get(id), airlineApi.getMine(id)])
      .then(([{ data: a }, { data: mine }]) => {
        setAirline(a);
        setForm(initForm(a));
        setPending(mine);
      })
      .catch(() => navigate('/airlines', { replace: true }))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const set = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => { const copy = { ...e }; delete copy[key]; return copy; });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const diff = buildDiff(form, airline);

    if (Object.keys(diff).length === 0) {
      setToast('No changes detected — edit at least one field before submitting.');
      setTimeout(() => setToast(null), 4000);
      return;
    }

    const clientErrors = validateDiff(diff);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    setSubmitting(true);
    try {
      await airlineApi.contribute(id, diff);
      setSuccess(true);
      setTimeout(() => navigate(`/airlines/${id}`), 3000);
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 400 && data?.fieldErrors) {
        setFieldErrors(data.fieldErrors);
      } else {
        setToast(data?.error || 'Something went wrong. Please try again.');
        setTimeout(() => setToast(null), 5000);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#7A8CA0' }}>Loading…</div>;
  if (!airline) return null;

  if (success) {
    return (
      <div style={S.page}>
        <div style={S.success}>
          <div style={S.successIcon}>✓</div>
          <div style={S.successTitle}>Contribution submitted!</div>
          <div style={S.successMsg}>
            Your contribution is in review. Thanks for helping the community.
            <br />Redirecting back to {airline.name} in a moment…
          </div>
        </div>
      </div>
    );
  }

  const inp = (key, extra = {}) => (
    <input
      style={S.input(fieldErrors[key])}
      value={form[key] ?? ''}
      onChange={(e) => set(key, e.target.value)}
      {...extra}
    />
  );

  const ta = (key, rows = 3) => (
    <textarea
      style={{ ...S.textarea(fieldErrors[key]), minHeight: rows * 24 + 16 }}
      value={form[key] ?? ''}
      onChange={(e) => set(key, e.target.value)}
    />
  );

  const sel = (key, options, withBlank = true) => (
    <select
      style={S.select(fieldErrors[key])}
      value={form[key] ?? ''}
      onChange={(e) => set(key, e.target.value)}
    >
      {withBlank && <option value="">— Not specified —</option>}
      {options.map((o) => (
        <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
          {typeof o === 'string' ? o : o.label}
        </option>
      ))}
    </select>
  );

  return (
    <div style={S.page}>
      {toast && <div style={S.toastWrap}>{toast}</div>}

      <button style={S.back} onClick={() => navigate(`/airlines/${id}`)}>
        ← Back to {airline.name}
      </button>

      <div style={S.title}>Suggest an edit — {airline.name}</div>
      <div style={S.sub}>
        Only fields you change will be submitted. All contributions are reviewed before going live.
      </div>

      {pending.length > 0 && (
        <div style={S.banner}>
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="9" r="7.5"/><line x1="9" y1="6" x2="9" y2="9.5"/><circle cx="9" cy="12.5" r="0.75" fill="currentColor" stroke="none"/>
          </svg>
          You have a pending edit for this airline awaiting review. You can still submit additional edits.
        </div>
      )}

      <form onSubmit={handleSubmit}>

        {/* Operations */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Operations</div>

          <Field label="Headquarters" hint="City or country where the airline's main HQ is located." error={fieldErrors.headquarters}>
            {inp('headquarters', { placeholder: 'e.g. Dublin, Ireland' })}
          </Field>

          <Field label="Description" hint="A short factual overview of the airline — fleet size, routes, market position." error={fieldErrors.description}>
            {ta('description', 4)}
          </Field>

          <Field label="Fleet" hint="One aircraft type per line, e.g. Boeing 737-800" error={fieldErrors.fleet}>
            {ta('fleet', 4)}
          </Field>

          <Field label="Bases" hint="One base (airport IATA code or city) per line, e.g. DUB" error={fieldErrors.bases}>
            {ta('bases', 3)}
          </Field>

          <Field label="Contract Type" hint="The primary type of employment contract offered." error={fieldErrors.contractType}>
            {sel('contractType', CONTRACT_TYPES)}
          </Field>

          <Field label="Roster Pattern" hint='How the duty/off cycle typically works, e.g. "5 on / 4 off".' error={fieldErrors.rosterPattern}>
            {inp('rosterPattern', { placeholder: 'e.g. 5 on / 4 off' })}
          </Field>

          <Field label="Work Auth Required" hint="One country or region per line where work authorisation is required to be considered." error={fieldErrors.workAuthRequired}>
            {ta('workAuthRequired', 3)}
          </Field>

          <Field label="Region" hint="The geographic region this airline operates from." error={fieldErrors.region}>
            {sel('region', REGIONS, false)}
          </Field>
        </div>

        {/* Compensation */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Compensation</div>
          <div style={{ fontSize: 12, color: '#4A6080', marginBottom: 14 }}>
            Enter the pay range you know about. Leave blank for fields you don't know.
          </div>

          <Field label="Captain — Min / Max" hint="Gross annual salary range (or monthly — set Period accordingly)." error={fieldErrors.captainMin || fieldErrors.captainMax}>
            <div style={S.payGrid}>
              <input style={S.input(fieldErrors.captainMin)} value={form.captainMin ?? ''} onChange={(e) => set('captainMin', e.target.value)} placeholder="Min (e.g. 90000)" type="number" min="0" />
              <input style={S.input(fieldErrors.captainMax)} value={form.captainMax ?? ''} onChange={(e) => set('captainMax', e.target.value)} placeholder="Max (e.g. 150000)" type="number" min="0" />
            </div>
          </Field>

          <Field label="Captain — Currency / Period" error={null}>
            <div style={S.payGrid}>
              <input style={S.input(null)} value={form.captainCurrency ?? ''} onChange={(e) => set('captainCurrency', e.target.value)} placeholder="Currency (e.g. EUR)" maxLength={4} />
              <input style={S.input(null)} value={form.captainPeriod ?? ''}   onChange={(e) => set('captainPeriod', e.target.value)}   placeholder="Period (e.g. year)" />
            </div>
          </Field>

          <Field label="First Officer — Min / Max" hint="Gross salary range for FO." error={fieldErrors.foMin || fieldErrors.foMax}>
            <div style={S.payGrid}>
              <input style={S.input(fieldErrors.foMin)} value={form.foMin ?? ''} onChange={(e) => set('foMin', e.target.value)} placeholder="Min" type="number" min="0" />
              <input style={S.input(fieldErrors.foMax)} value={form.foMax ?? ''} onChange={(e) => set('foMax', e.target.value)} placeholder="Max" type="number" min="0" />
            </div>
          </Field>

          <Field label="First Officer — Currency / Period" error={null}>
            <div style={S.payGrid}>
              <input style={S.input(null)} value={form.foCurrency ?? ''} onChange={(e) => set('foCurrency', e.target.value)} placeholder="Currency (e.g. EUR)" maxLength={4} />
              <input style={S.input(null)} value={form.foPeriod ?? ''}   onChange={(e) => set('foPeriod', e.target.value)}   placeholder="Period (e.g. year)" />
            </div>
          </Field>
        </div>

        {/* Career */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Career</div>

          <Field label="Hiring Status" hint="Is the airline actively recruiting pilots right now?" error={fieldErrors.hiringStatus}>
            {sel('hiringStatus', HIRING_STATUSES)}
          </Field>

          <Field label="Hiring Frequency" hint="How often does the airline open pilot recruitment cycles?" error={fieldErrors.hiringFrequency}>
            {sel('hiringFrequency', HIRING_FREQUENCIES)}
          </Field>

          <Field label="Upgrade Min Years" hint="Minimum number of years typically required before upgrade to Captain." error={fieldErrors.upgradeTimeMinYears}>
            {inp('upgradeTimeMinYears', { type: 'number', min: '0', step: '0.5', placeholder: 'e.g. 3' })}
          </Field>

          <Field label="Upgrade Max Years" hint="Maximum years before upgrade (typical ceiling)." error={fieldErrors.upgradeTimeMaxYears}>
            {inp('upgradeTimeMaxYears', { type: 'number', min: '0', step: '0.5', placeholder: 'e.g. 7' })}
          </Field>
        </div>

        {/* Application Process */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Application Process</div>

          <Field label="Avg Response Days" hint="How many days did your application take to get a first response?" error={fieldErrors.avgResponseDays}>
            {inp('avgResponseDays', { type: 'number', min: '0', placeholder: 'e.g. 14' })}
          </Field>

          <Field label="Interview Stages" hint="List each stage on a new line, in order, e.g. HR screen, Technical sim, Medical." error={fieldErrors.interviewStages}>
            {ta('interviewStages', 4)}
          </Field>

          <Field label="Sim Type" hint="The simulator aircraft/model used in the type rating or selection process." error={fieldErrors.simType}>
            {inp('simType', { placeholder: 'e.g. Boeing 737 Full Flight Sim Level D' })}
          </Field>
        </div>

        {/* Notes */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Notes</div>
          <Field label="General Notes" hint="Anything useful for fellow pilots that doesn't fit the above sections — culture, pay structure quirks, seniority system, etc." error={fieldErrors.notes}>
            {ta('notes', 5)}
          </Field>
        </div>

        <div style={S.submitRow}>
          <button type="button" style={S.cancelBtn} onClick={() => navigate(`/airlines/${id}`)}>
            Cancel
          </button>
          <button type="submit" style={S.submitBtn(submitting)} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit contribution'}
          </button>
        </div>
      </form>
    </div>
  );
}
