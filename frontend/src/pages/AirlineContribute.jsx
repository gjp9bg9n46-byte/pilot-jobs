import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { airlineApi } from '../services/api';
import { LightPage, Input, Button, Badge } from '../components/primitives';
import AircraftCombobox from '../components/AircraftCombobox';

// Seed the structured fleet editor: prefer fleetDetail; otherwise lift the flat
// fleet[] into rows with empty counts (lets a contributor enrich it into fleetDetail).
const seedFleet = (a) => {
  if (a?.fleetDetail?.length) {
    return a.fleetDetail.map((r) => ({
      type: r.type ?? '',
      inService: r.inService != null ? String(r.inService) : '',
      ordered:   r.ordered   != null ? String(r.ordered)   : '',
      retired:   r.retired   != null ? String(r.retired)   : '',
    }));
  }
  return (a?.fleet || []).map((type) => ({ type, inService: '', ordered: '', retired: '' }));
};

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
    fleetDetail:         seedFleet(a),
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

  // Fleet — structured rows → full-replace fleetDetail (+ keep flat fleet in sync)
  const toNum = (s) => {
    const t = (s ?? '').toString().trim();
    if (t === '') return null;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  };
  const nextDetail = (form.fleetDetail || [])
    .map((r) => ({ type: (r.type || '').trim(), inService: toNum(r.inService), ordered: toNum(r.ordered), retired: toNum(r.retired) }))
    .filter((r) => r.type !== '');
  const curDetail = (airline.fleetDetail || []).map((r) => ({
    type: r.type, inService: r.inService ?? null, ordered: r.ordered ?? null, retired: r.retired ?? null,
  }));
  if (JSON.stringify(nextDetail) !== JSON.stringify(curDetail)) {
    changes.fleetDetail = nextDetail;
    const nextFlat = nextDetail.map((r) => r.type);
    const curFlat = airline.fleet || [];
    if (JSON.stringify(nextFlat) !== JSON.stringify(curFlat)) changes.fleet = nextFlat;
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

// Readable labels for the proposedChanges summary ("Updated: Fleet, Headquarters").
const CONTRIB_FIELD_LABELS = {
  headquarters: 'Headquarters', description: 'Description', bases: 'Bases', fleet: 'Fleet',
  fleetDetail: 'Fleet', hiringStatus: 'Hiring Status', hiringFrequency: 'Hiring Frequency',
  payRanges: 'Pay Ranges', rosterPattern: 'Roster Pattern', contractType: 'Contract Type',
  workAuthRequired: 'Work Auth', avgResponseDays: 'Avg Response Days', interviewStages: 'Interview Stages',
  simType: 'Sim Type', upgradeTimeMinYears: 'Upgrade Min Years', upgradeTimeMaxYears: 'Upgrade Max Years',
  notes: 'Notes', region: 'Region',
};
const contribSummary = (proposed) => {
  const labels = [...new Set(Object.keys(proposed || {}).map((k) => CONTRIB_FIELD_LABELS[k] || k))];
  return labels.length ? labels.join(', ') : '—';
};
const CONTRIB_STATUS = {
  PENDING:  { variant: 'warning', msg: 'Under review — usually replied within a few days.' },
  APPROVED: { variant: 'success', msg: null }, // "Applied on <date>" rendered inline
  REJECTED: { variant: 'error',   msg: null }, // reviewer feedback panel rendered below
};
const fmtContribDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

const S = {
  page: { maxWidth: 740, margin: '0 auto', paddingBottom: 80 },
  back: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', marginBottom: 20, background: 'none', border: 'none', padding: 0,
    fontFamily: 'var(--font-body)',
  },
  title: { fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 4 },
  sub:   { fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 },
  banner: {
    background: 'rgba(0,63,136,0.06)', border: '1px solid rgba(0,63,136,0.2)',
    borderRadius: 10, padding: '10px 16px', marginBottom: 20,
    fontSize: 13, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8,
  },
  section: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '20px 24px', marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16,
  },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' },
  hint:  { fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 },
  fleetRow: {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '12px 14px', marginBottom: 8,
  },
  fleetRowHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  fleetRowLabel: { fontSize: 12, fontWeight: 700, color: 'var(--accent)' },
  fleetRemove: {
    background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B',
    fontSize: 16, lineHeight: 1, padding: 4, borderRadius: 6,
  },
  fleetCounts: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 },
  fleetAddBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4,
    background: 'rgba(0,63,136,0.06)', border: '1px dashed rgba(0,63,136,0.3)',
    borderRadius: 10, padding: '9px 14px', cursor: 'pointer',
    color: 'var(--accent)', fontSize: 13, fontWeight: 600,
  },
  payGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
  },
  submitRow: {
    display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end', flexWrap: 'wrap',
  },
  success: {
    textAlign: 'center', padding: '60px 20px',
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
  },
  successIcon: { fontSize: 36, marginBottom: 16, color: '#166534' },
  successTitle: { fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: '#166534', marginBottom: 8 },
  successMsg: { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 },
  toastWrap: {
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 10,
    padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 9999,
    boxShadow: '0 4px 24px rgba(15,20,25,0.12)',
  },
};

function Hint({ children }) {
  return children ? <div style={S.hint}>{children}</div> : null;
}

export default function AirlineContribute() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [airline, setAirline]   = useState(null);
  const [form, setForm]         = useState({});
  const [myContribs, setMyContribs] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [fleetError, setFleetError] = useState('');
  const [toast, setToast]       = useState(null);
  const [success, setSuccess]   = useState(false);

  const fleetRows = form.fleetDetail || [];
  const setFleetRow = (i, key, val) => {
    setFleetError('');
    setForm((f) => ({ ...f, fleetDetail: (f.fleetDetail || []).map((r, j) => (j === i ? { ...r, [key]: val } : r)) }));
  };
  const addFleetRow = () => setForm((f) => ({ ...f, fleetDetail: [...(f.fleetDetail || []), { type: '', inService: '', ordered: '', retired: '' }] }));
  const removeFleetRow = (i) => { setFleetError(''); setForm((f) => ({ ...f, fleetDetail: (f.fleetDetail || []).filter((_, j) => j !== i) })); };

  useEffect(() => {
    Promise.all([airlineApi.get(id), airlineApi.getMine(id)])
      .then(([{ data: a }, { data: mine }]) => {
        setAirline(a);
        setForm(initForm(a));
        setMyContribs(mine);
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

    // Fleet validation: a row with counts needs a type; counts must be whole numbers >= 0.
    const rows = form.fleetDetail || [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const hasCount = ['inService', 'ordered', 'retired'].some((k) => (r[k] ?? '').toString().trim() !== '');
      if (!(r.type || '').trim()) {
        if (hasCount) { setFleetError(`Aircraft ${i + 1}: enter an aircraft type, or clear its counts.`); return; }
        continue; // fully-empty row — dropped on submit
      }
      for (const k of ['inService', 'ordered', 'retired']) {
        const t = (r[k] ?? '').toString().trim();
        if (t !== '' && !/^\d+$/.test(t)) { setFleetError(`Aircraft ${i + 1}: counts must be whole numbers of 0 or more.`); return; }
      }
    }
    setFleetError('');

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

  if (loading) return <LightPage style={{ fontFamily: 'var(--font-body)' }}><div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div></LightPage>;
  if (!airline) return null;

  if (success) {
    return (
      <LightPage style={{ fontFamily: 'var(--font-body)' }}>
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
      </LightPage>
    );
  }

  // ── Light form-control helpers (Input primitive + preserved hint) ──
  const inp = (key, label, hint, extra = {}) => (
    <div style={S.field}>
      <Input label={label} error={fieldErrors[key]} value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} {...extra} />
      <Hint>{hint}</Hint>
    </div>
  );

  const ta = (key, label, hint, rows = 3) => (
    <div style={S.field}>
      <Input as="textarea" label={label} error={fieldErrors[key]} value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} style={{ minHeight: rows * 24 + 16 }} />
      <Hint>{hint}</Hint>
    </div>
  );

  const sel = (key, label, hint, options, withBlank = true) => (
    <div style={S.field}>
      <Input as="select" label={label} error={fieldErrors[key]} value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)}>
        {withBlank && <option value="">— Not specified —</option>}
        {options.map((o) => (
          <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
            {typeof o === 'string' ? o : o.label}
          </option>
        ))}
      </Input>
      <Hint>{hint}</Hint>
    </div>
  );

  return (
    <LightPage style={{ fontFamily: 'var(--font-body)' }}>
      <div style={S.page}>
        {toast && <div style={S.toastWrap} role="alert">{toast}</div>}

        <button style={S.back} onClick={() => navigate(`/airlines/${id}`)}>
          ← Back to {airline.name}
        </button>

        <div style={S.title}>Suggest an edit — {airline.name}</div>
        <div style={S.sub}>
          Only fields you change will be submitted. All contributions are reviewed before going live.
        </div>

        {myContribs.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={S.sectionTitle}>Your contributions</div>
            {myContribs.map((c) => {
              const st = CONTRIB_STATUS[c.status] || CONTRIB_STATUS.PENDING;
              return (
                <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                      Updated: {contribSummary(c.proposedChanges)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtContribDate(c.createdAt)}</span>
                      <Badge variant={st.variant}>{c.status.charAt(0) + c.status.slice(1).toLowerCase()}</Badge>
                    </div>
                  </div>
                  {c.status === 'PENDING' && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{st.msg}</div>
                  )}
                  {c.status === 'APPROVED' && (
                    <div style={{ fontSize: 12, color: '#166534', marginTop: 6, fontWeight: 600 }}>
                      ✓ Applied{c.reviewedAt ? ` on ${fmtContribDate(c.reviewedAt)}` : ''}. Thanks for helping the community.
                    </div>
                  )}
                  {c.status === 'REJECTED' && c.reviewNote && (
                    <div style={{ marginTop: 8, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#991B1B', marginBottom: 3, letterSpacing: '0.04em' }}>REVIEWER FEEDBACK</div>
                      <div style={{ fontSize: 13, color: '#991B1B', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.reviewNote}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* Operations */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Operations</div>
            {inp('headquarters', 'Headquarters', "City or country where the airline's main HQ is located.", { placeholder: 'e.g. Dublin, Ireland' })}
            {ta('description', 'Description', 'A short factual overview of the airline — fleet size, routes, market position.', 4)}

            {/* Fleet — structured editor (replaces the old free-text list) */}
            <div style={S.field}>
              <label style={S.label}>Fleet</label>
              <div style={S.hint}>Add each aircraft type with its in-service / on-order / retired counts. Leave a count blank if unknown.</div>
              {fleetRows.map((row, i) => (
                <div key={i} style={{ ...S.fleetRow, marginTop: i === 0 ? 8 : undefined }}>
                  <div style={S.fleetRowHead}>
                    <span style={S.fleetRowLabel}>Aircraft {i + 1}</span>
                    <button type="button" aria-label={`Remove aircraft ${i + 1}`} style={S.fleetRemove} onClick={() => removeFleetRow(i)}>✕</button>
                  </div>
                  <AircraftCombobox
                    value={row.type}
                    ariaLabel={`Aircraft ${i + 1} type`}
                    onChange={(v) => setFleetRow(i, 'type', v)}
                  />
                  <div style={S.fleetCounts}>
                    <Input label="In service" type="number" min="0" value={row.inService} onChange={(e) => setFleetRow(i, 'inService', e.target.value)} placeholder="—" />
                    <Input label="On order"   type="number" min="0" value={row.ordered}   onChange={(e) => setFleetRow(i, 'ordered', e.target.value)}   placeholder="—" />
                    <Input label="Retired"    type="number" min="0" value={row.retired}   onChange={(e) => setFleetRow(i, 'retired', e.target.value)}   placeholder="—" />
                  </div>
                </div>
              ))}
              {fleetError && <div style={{ fontSize: 12, color: '#991B1B', marginTop: 6 }}>{fleetError}</div>}
              <button type="button" style={S.fleetAddBtn} onClick={addFleetRow}>+ Add aircraft</button>
            </div>

            {ta('bases', 'Bases', 'One base (airport IATA code or city) per line, e.g. DUB', 3)}
            {sel('contractType', 'Contract Type', 'The primary type of employment contract offered.', CONTRACT_TYPES)}
            {inp('rosterPattern', 'Roster Pattern', 'How the duty/off cycle typically works, e.g. "5 on / 4 off".', { placeholder: 'e.g. 5 on / 4 off' })}
            {ta('workAuthRequired', 'Work Auth Required', 'One country or region per line where work authorisation is required to be considered.', 3)}
            {sel('region', 'Region', 'The geographic region this airline operates from.', REGIONS, false)}
          </div>

          {/* Compensation */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Compensation</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Enter the pay range you know about. Leave blank for fields you don't know.
            </div>

            <div style={S.field}>
              <label style={S.label}>Captain — Min / Max</label>
              <div style={S.payGrid}>
                <Input aria-label="Captain pay minimum" error={fieldErrors.captainMin} value={form.captainMin ?? ''} onChange={(e) => set('captainMin', e.target.value)} placeholder="Min (e.g. 90000)" type="number" min="0" />
                <Input aria-label="Captain pay maximum" error={fieldErrors.captainMax} value={form.captainMax ?? ''} onChange={(e) => set('captainMax', e.target.value)} placeholder="Max (e.g. 150000)" type="number" min="0" />
              </div>
              <Hint>Gross annual salary range (or monthly — set Period accordingly).</Hint>
            </div>

            <div style={S.field}>
              <label style={S.label}>Captain — Currency / Period</label>
              <div style={S.payGrid}>
                <Input aria-label="Captain pay currency" value={form.captainCurrency ?? ''} onChange={(e) => set('captainCurrency', e.target.value)} placeholder="Currency (e.g. EUR)" maxLength={4} />
                <Input aria-label="Captain pay period" value={form.captainPeriod ?? ''} onChange={(e) => set('captainPeriod', e.target.value)} placeholder="Period (e.g. year)" />
              </div>
            </div>

            <div style={S.field}>
              <label style={S.label}>First Officer — Min / Max</label>
              <div style={S.payGrid}>
                <Input aria-label="First Officer pay minimum" error={fieldErrors.foMin} value={form.foMin ?? ''} onChange={(e) => set('foMin', e.target.value)} placeholder="Min" type="number" min="0" />
                <Input aria-label="First Officer pay maximum" error={fieldErrors.foMax} value={form.foMax ?? ''} onChange={(e) => set('foMax', e.target.value)} placeholder="Max" type="number" min="0" />
              </div>
              <Hint>Gross salary range for FO.</Hint>
            </div>

            <div style={S.field}>
              <label style={S.label}>First Officer — Currency / Period</label>
              <div style={S.payGrid}>
                <Input aria-label="First Officer pay currency" value={form.foCurrency ?? ''} onChange={(e) => set('foCurrency', e.target.value)} placeholder="Currency (e.g. EUR)" maxLength={4} />
                <Input aria-label="First Officer pay period" value={form.foPeriod ?? ''} onChange={(e) => set('foPeriod', e.target.value)} placeholder="Period (e.g. year)" />
              </div>
            </div>
          </div>

          {/* Career */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Career</div>
            {sel('hiringStatus', 'Hiring Status', 'Is the airline actively recruiting pilots right now?', HIRING_STATUSES)}
            {sel('hiringFrequency', 'Hiring Frequency', 'How often does the airline open pilot recruitment cycles?', HIRING_FREQUENCIES)}
            {inp('upgradeTimeMinYears', 'Upgrade Min Years', 'Minimum number of years typically required before upgrade to Captain.', { type: 'number', min: '0', step: '0.5', placeholder: 'e.g. 3' })}
            {inp('upgradeTimeMaxYears', 'Upgrade Max Years', 'Maximum years before upgrade (typical ceiling).', { type: 'number', min: '0', step: '0.5', placeholder: 'e.g. 7' })}
          </div>

          {/* Application Process */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Application Process</div>
            {inp('avgResponseDays', 'Avg Response Days', 'How many days did your application take to get a first response?', { type: 'number', min: '0', placeholder: 'e.g. 14' })}
            {ta('interviewStages', 'Interview Stages', 'List each stage on a new line, in order, e.g. HR screen, Technical sim, Medical.', 4)}
            {inp('simType', 'Sim Type', 'The simulator aircraft/model used in the type rating or selection process.', { placeholder: 'e.g. Boeing 737 Full Flight Sim Level D' })}
          </div>

          {/* Notes */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Notes</div>
            {ta('notes', 'General Notes', "Anything useful for fellow pilots that doesn't fit the above sections — culture, pay structure quirks, seniority system, etc.", 5)}
          </div>

          <div style={S.submitRow}>
            <Button type="button" variant="secondary" onClick={() => navigate(`/airlines/${id}`)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit contribution'}
            </Button>
          </div>
        </form>
      </div>
    </LightPage>
  );
}
