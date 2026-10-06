import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { profileApi } from '../services/api';
import AircraftCombobox from '../components/AircraftCombobox';

// Approved licence + medical authorities (Part-0 decision), ending in Other.
export const AUTHORITIES = ['ECAA', 'GCAA', 'GACA', 'QCAA', 'BCAA', 'CAA Oman', 'DGCA Kuwait', 'CARC', 'DGAC Morocco', 'EASA', 'UK CAA', 'FAA', 'TCCA', 'CASA', 'DGCA India', 'CAAC', 'Other'];
const LIC_TYPES = ['ATPL', 'CPL', 'MPL', 'PPL', 'Other'];
const MED_CLASSES = [['CLASS_1', 'Class 1'], ['CLASS_2', 'Class 2'], ['CLASS_3', 'Other']];
const ELP_LEVELS = ['Level 4', 'Level 5', 'Level 6'];
const ROLES = [['', '—'], ['FIRST_OFFICER', 'First Officer'], ['CAPTAIN', 'Captain']];
const EDU = [['', '—'], ['high_school', 'High school'], ['technical', 'Technical'], ['bachelor', "Bachelor's degree"], ['masters', "Master's degree"], ['doctorate', 'Doctorate']];
const COUNTRIES = ['Afghanistan', 'Albania', 'Algeria', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahrain', 'Bangladesh', 'Belarus', 'Belgium', 'Benin', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Cambodia', 'Cameroon', 'Canada', 'Chad', 'Chile', 'China', 'Colombia', 'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czechia', 'Denmark', 'Djibouti', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Estonia', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Guatemala', 'Guinea', 'Guyana', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Libya', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Mauritania', 'Mauritius', 'Mexico', 'Moldova', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saudi Arabia', 'Senegal', 'Serbia', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'];

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
// yyyy-mm-dd (from <input type=date>) → full ISO for the API; '' → null. The add
// endpoints hand dates straight to Prisma, which needs a full ISO datetime.
const toISO = (d) => (d ? new Date(`${d}T00:00:00.000Z`).toISOString() : null);
// Title-case a place / aircraft for display; keep short all-caps codes + digits.
function properCase(s) {
  return String(s || '').split(/\s+/).map((w) => w.split('-').map((p) => {
    if (!p) return p;
    if (/\d/.test(p)) return p.toUpperCase();
    if (p === p.toUpperCase() && p.length <= 4) return p;
    return p[0].toUpperCase() + p.slice(1).toLowerCase();
  }).join(' ')).join(' ').trim();
}
const canonCountry = (v) => { const m = COUNTRIES.find((c) => c.toLowerCase() === String(v || '').trim().toLowerCase()); return m || (v || ''); };
// The pilot's nationalities, falling back to the legacy single `nationality`
// column for accounts saved before the multi-select shipped.
export const pilotNationalities = (p) => {
  const list = Array.isArray(p?.nationalities) && p.nationalities.length ? p.nationalities : (p?.nationality ? [p.nationality] : []);
  return list.map(canonCountry).filter(Boolean);
};

// ── Field primitives ─────────────────────────────────────────────────────────
function Field({ label, error, hint, children }) {
  return (
    <label className="fld">
      <span className="fld-l">{label}</span>
      {children}
      {hint && !error && <em className="fld-hint">{hint}</em>}
      {error && <em className="fld-err">{error}</em>}
    </label>
  );
}
// Authority picker: approved list + Other free text. Stored unknown/ICAO/blank
// reads as the "Select authority…" prompt (never invented).
function AuthoritySelect({ value, onChange }) {
  const norm = String(value || '').trim();
  const known = AUTHORITIES.includes(norm);
  const prompt = norm === '' || norm.toLowerCase() === 'unknown' || norm.toLowerCase() === 'icao';
  const isOther = !prompt && !known;
  const sel = prompt ? '' : (known ? norm : 'Other');
  return (
    <>
      <select value={sel} onChange={(e) => onChange(e.target.value === 'Other' ? '' : e.target.value)}>
        <option value="">Select authority…</option>
        {AUTHORITIES.map((a) => <option key={a} value={a}>{a === 'CARC' ? 'CARC (Jordan)' : a}</option>)}
      </select>
      {(sel === 'Other') && <input type="text" placeholder="Authority name" value={isOther ? norm : ''} onChange={(e) => onChange(e.target.value)} style={{ marginTop: 6 }} />}
    </>
  );
}
// Generic searchable combobox over a flat string list (country / nationality).
function SearchCombo({ value, onChange, options, placeholder, autoFocus = false }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const box = useRef(null);
  const q = String(value || '').trim().toLowerCase();
  const matches = q ? options.filter((o) => o.toLowerCase().includes(q)).slice(0, 60) : options.slice(0, 60);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (!box.current?.contains(e.target)) { setOpen(false); setHi(-1); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const pick = (o) => { onChange(o); setOpen(false); setHi(-1); };
  return (
    <div className="scombo" ref={box}>
      <input
        value={value || ''} placeholder={placeholder} autoComplete="off" autoFocus={autoFocus}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); setHi(-1); return; }
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && open && hi >= 0) { e.preventDefault(); pick(matches[hi]); }
        }}
      />
      {open && matches.length > 0 && (
        <div className="scombo-list">
          {matches.map((o, i) => (
            <div key={o} className={`scombo-opt${i === hi ? ' hi' : ''}`} onMouseDown={() => pick(o)} onMouseEnter={() => setHi(i)}>{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// Multi-select country list (nationalities — dual citizens keep both). Chips
// with a remove ×, plus an "Add nationality" link that opens the same
// searchable combo. Matching only: never shown publicly, never sent to an
// employer unless the pilot applies.
function MultiCountry({ values, onChange, addLabel = 'Add nationality' }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const left = useMemo(() => COUNTRIES.filter((c) => !values.some((v) => v.toLowerCase() === c.toLowerCase())), [values]);
  const add = (v) => {
    const c = canonCountry(v);
    if (!c || values.some((x) => x.toLowerCase() === c.toLowerCase())) return;
    onChange([...values, c]);
    setDraft(''); setAdding(false);
  };
  return (
    <div className="mcountry">
      {values.length > 0 && (
        <div className="mc-chips">
          {values.map((v) => (
            <span className="mc-chip" key={v}>
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      {adding ? (
        <SearchCombo
          autoFocus value={draft} options={left} placeholder="Search countries…"
          onChange={(v) => { if (left.some((c) => c.toLowerCase() === String(v).toLowerCase())) add(v); else setDraft(v); }}
        />
      ) : (
        <button type="button" className="mc-add" onClick={() => { setDraft(''); setAdding(true); }}>+ {addLabel}</button>
      )}
    </div>
  );
}
// ── Sheet shell: sticky footer (Cancel outline + Save primary, 44px), Escape /
// outside close with a discard prompt only when edited, bottom-left Remove with a
// confirm step (grey text, red only on the final button). ─────────────────────
function Sheet({ title, dirty, saving, error, onClose, onSave, onRemove, removeLabel, children }) {
  const [confirming, setConfirming] = useState(false);
  const close = () => { if (saving) return; if (dirty && !window.confirm('Discard changes?')) return; onClose(); };
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [dirty, saving]);
  return (
    <div className="prof-rd-backdrop" onClick={close}>
      <div className="prof-rd-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="grip" />
        <div className="sheet-head"><h3>{title}</h3><button className="sheet-x" onClick={close} aria-label="Close"><X size={18} /></button></div>
        <div className="sheet-body">{children}</div>
        {error && <div className="sheet-err" role="alert">{error}</div>}
        <div className="sheet-foot">
          <div className="foot-l">
            {onRemove && (confirming
              ? <span className="row-del-confirm">Remove this?{' '}<button type="button" className="rd-yes" onClick={onRemove}>Yes, remove</button>{' '}<button type="button" className="rd-no" onClick={() => setConfirming(false)}>Keep</button></span>
              : <button type="button" className="row-del" onClick={() => setConfirming(true)}>{removeLabel || 'Remove'}</button>)}
          </div>
          <div className="foot-r">
            <button type="button" className="btn ghost" onClick={close}>Cancel</button>
            <button type="button" className="btn primary" onClick={onSave} disabled={saving || !dirty}>{saving ? <><Loader2 size={15} className="spin" /> Saving…</> : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Per-item edit sheet ──────────────────────────────────────────────────────
export default function ProfileEditSheet({ edit, profile, onClose, onSaved }) {
  const { kind, id } = edit;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [errs, setErrs] = useState({});
  const initial = useRef(null);

  const licences = (profile.certificates || []).filter((c) => c.type !== 'ELP');
  const cert = id ? (profile.certificates || []).find((c) => c.id === id) : null;
  const rating = id ? (profile.ratings || []).find((r) => r.id === id) : null;
  const med = id ? (profile.medicals || []).find((m) => m.id === id) : null;
  const trn = id ? (profile.trainingRecords || []).find((t) => t.id === id) : null;
  const elpRec = kind === 'elp' ? (id ? (profile.certificates || []).find((c) => c.id === id) : (profile.certificates || []).find((c) => c.type === 'ELP')) : null;
  const rtwRec = id ? (profile.rightToWork || []).find((w) => w.id === id) : null;

  const [form, setForm] = useState(() => {
    let f;
    if (kind === 'personal') {
      f = { firstName: profile.firstName || '', lastName: profile.lastName || '', role: profile.role || '', city: profile.city || '', country: canonCountry(profile.country), nationalities: pilotNationalities(profile), phone: profile.phone || '', education: profile.education || '' };
    } else if (kind === 'prefs') {
      const p = profile.preferences || {};
      f = { preferredCountries: (p.preferredCountries || []).join(', '), preferredAircraft: (p.preferredAircraft || []).join(', '), preferredContractTypes: (p.preferredContractTypes || []).join(', '), willingToRelocate: !!profile.willingToRelocate };
    } else if (kind === 'licence') {
      const std = LIC_TYPES.includes(cert?.type);
      f = { type: cert ? (std ? cert.type : 'Other') : '', typeOther: cert && !std ? cert.type : '', issuingAuthority: cert?.issuingAuthority || '', certificateNumber: cert?.certificateNumber || '', issueDate: iso(cert?.issueDate), expiryDate: iso(cert?.expiryDate) };
    } else if (kind === 'rating') {
      const disp = properCase(rating?.aircraftType || '');
      f = { aircraft: disp, licenceId: rating?.licenceId || '', lineCheckDate: iso(rating?.lineCheckDate) };
    } else if (kind === 'medical') {
      f = { medicalClass: med?.medicalClass || 'CLASS_1', issuingAuthority: med?.issuingAuthority || '', issueDate: iso(med?.issueDate), expiryDate: iso(med?.expiryDate) };
    } else if (kind === 'training') {
      f = { type: trn?.type || '', provider: trn?.provider || '', completedAt: iso(trn?.completedAt), expiresAt: iso(trn?.expiresAt) };
    } else if (kind === 'elp') {
      f = { level: elpRec?.englishLevel || 'Level 4', issuingAuthority: elpRec?.issuingAuthority || '', expiryDate: iso(elpRec?.expiryDate) };
    } else if (kind === 'rtw') {
      f = { country: canonCountry(rtwRec?.country), documentType: rtwRec?.documentType || '', documentNumber: rtwRec?.documentNumber || '', expiresAt: iso(rtwRec?.expiresAt) };
    } else if (kind === 'passport') {
      f = { passportNumber: profile.passportNumber || '', passportExpiry: iso(profile.passportExpiry) };
    }
    initial.current = JSON.stringify(f);
    return f;
  });

  const dirty = useMemo(() => JSON.stringify(form) !== initial.current, [form]);
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const removable = ['licence', 'rating', 'medical', 'training', 'rtw'].includes(kind) && !!id
    || (kind === 'elp' && !!elpRec);

  const TITLES = {
    personal: 'Personal details', prefs: 'Job preferences',
    licence: id ? 'Edit licence' : 'Add licence', rating: id ? 'Edit rating' : 'Add rating',
    medical: id ? 'Edit medical' : 'Add medical', training: id ? 'Edit training' : 'Add training',
    elp: 'English proficiency', rtw: rtwRec ? 'Edit right to work' : 'Add right to work', passport: 'Passport',
  };

  async function remove() {
    setError(null); setSaving(true);
    try {
      if (kind === 'licence') await profileApi.deleteCertificate(id);
      else if (kind === 'rating') await profileApi.deleteRating(id);
      else if (kind === 'medical') await profileApi.deleteMedical(id);
      else if (kind === 'training') await profileApi.deleteTraining(id);
      else if (kind === 'rtw') await profileApi.deleteRTW(id);
      else if (kind === 'elp') await profileApi.deleteELP(elpRec.id);
      onSaved('Removed');
    } catch (err) { setError(err?.response?.data?.error || 'Couldn’t remove — try again.'); setSaving(false); }
  }

  async function save() {
    setError(null);
    const e = {};
    if (kind === 'personal' && !form.firstName.trim()) e.firstName = 'First name is required';
    if (kind === 'licence') { if (!form.type) e.type = 'Pick a licence type'; if (form.type === 'Other' && !form.typeOther.trim()) e.typeOther = 'Enter the licence name'; }
    if (kind === 'rating' && !form.aircraft.trim()) e.aircraft = 'Pick an aircraft type';
    if (kind === 'medical' && !form.expiryDate) e.expiryDate = 'Expiry date is required';
    if (kind === 'training') { if (!form.type.trim()) e.type = 'Course name is required'; if (!form.completedAt) e.completedAt = 'Completion date is required'; }
    if (kind === 'rtw' && !form.country.trim()) e.country = 'Country is required';
    setErrs(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      if (kind === 'personal') {
        // Only send changed fields, so untouched values keep their stored casing.
        const orig = JSON.parse(initial.current);
        const body = {};
        for (const k of ['firstName', 'lastName', 'role', 'city', 'country', 'phone', 'education']) {
          if (form[k] === orig[k]) continue;
          const v = String(form[k]).trim();
          body[k] = v === '' ? null : v; // required names can't blank out (validated above)
        }
        // Nationalities are a list (dual citizens); the legacy single column is
        // kept in sync with the first one so the CV and older reads still work.
        if (JSON.stringify(form.nationalities) !== JSON.stringify(orig.nationalities)) {
          body.nationalities = form.nationalities;
          body.nationality = form.nationalities[0] || null;
        }
        if (Object.keys(body).length) await profileApi.update(body);
      } else if (kind === 'prefs') {
        const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
        await profileApi.update({ willingToRelocate: form.willingToRelocate });
        await profileApi.updatePreferences({ preferredCountries: list(form.preferredCountries), preferredAircraft: list(form.preferredAircraft), preferredContractTypes: list(form.preferredContractTypes) });
      } else if (kind === 'licence') {
        const type = form.type === 'Other' ? form.typeOther.trim() : form.type;
        const body = { issuingAuthority: form.issuingAuthority || 'unknown', certificateNumber: form.certificateNumber || null, issueDate: toISO(form.issueDate), expiryDate: toISO(form.expiryDate) };
        if (id) await profileApi.updateCertificate(id, body); else await profileApi.addCertificate({ type, ...body });
      } else if (kind === 'rating') {
        const orig = JSON.parse(initial.current);
        const body = { licenceId: form.licenceId || null, lineCheckDate: toISO(form.lineCheckDate) };
        // keep the stored code when the aircraft field wasn't changed
        if (!id || form.aircraft !== orig.aircraft) body.aircraftType = form.aircraft.trim();
        if (id) await profileApi.updateRating(id, body); else await profileApi.addRating({ category: 'Type', ...body, aircraftType: form.aircraft.trim() });
      } else if (kind === 'medical') {
        const body = { medicalClass: form.medicalClass, issuingAuthority: form.issuingAuthority || 'unknown', issueDate: toISO(form.issueDate), expiryDate: toISO(form.expiryDate) };
        if (id) await profileApi.updateMedical(id, body); else await profileApi.addMedical(body);
      } else if (kind === 'training') {
        const body = { type: form.type.trim(), provider: form.provider || null, completedAt: toISO(form.completedAt), expiresAt: toISO(form.expiresAt) };
        if (id) await profileApi.updateTraining(id, body); else await profileApi.addTraining(body);
      } else if (kind === 'elp') {
        const body = { level: form.level, issuingAuthority: form.issuingAuthority || 'unknown', expiryDate: toISO(form.expiryDate), noExpiry: !form.expiryDate };
        if (elpRec) await profileApi.updateELP(elpRec.id, body); else await profileApi.addELP(body);
      } else if (kind === 'rtw') {
        if (id) await profileApi.updateRTW(id, { country: form.country.trim(), documentType: form.documentType || 'Work visa', documentNumber: form.documentNumber || null, expiresAt: toISO(form.expiresAt) });
        else await profileApi.addRTW({ country: form.country.trim(), documentType: form.documentType || 'Work visa', documentNumber: form.documentNumber || null, expiryDate: toISO(form.expiresAt), noExpiry: !form.expiresAt });
      } else if (kind === 'passport') {
        await profileApi.update({ passportNumber: form.passportNumber.trim() || null, passportExpiry: toISO(form.passportExpiry) });
      }
      onSaved('Saved');
    } catch (err) {
      setError(err?.response?.data?.error || 'Couldn’t save — your changes are kept. Try again.');
      setSaving(false);
    }
  }

  const licenceOptions = licences.map((l) => ({ id: l.id, label: `${l.type}${l.issuingAuthority && !['unknown', 'icao'].includes(String(l.issuingAuthority).toLowerCase()) ? ` · ${l.issuingAuthority}` : ''}` }));

  return (
    <Sheet title={TITLES[kind] || 'Edit'} dirty={dirty} saving={saving} error={error} onClose={onClose} onSave={save} onRemove={removable ? remove : null} removeLabel={`Remove ${kind === 'rtw' ? 'right to work' : kind}`}>
      {kind === 'personal' && (
        <div className="fgrid">
          <Field label="First name" error={errs.firstName}><input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
          <Field label="Last name"><input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
          <Field label="Role (headline)"><select value={form.role} onChange={(e) => set('role', e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="City"><input value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="Country"><SearchCombo value={form.country} onChange={(v) => set('country', v)} options={COUNTRIES} placeholder="Search countries…" /></Field>
          <Field label="Nationality" hint="Used only to check job eligibility — not shown on your profile, and only sent to an airline if you apply. Add more than one if you hold dual citizenship.">
            <MultiCountry values={form.nationalities} onChange={(v) => set('nationalities', v)} />
          </Field>
          <Field label="Phone (private)"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Education"><select value={form.education} onChange={(e) => set('education', e.target.value)}>{EDU.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <p className="fnote">Email is shown to airlines you apply to — change it in account settings.</p>
        </div>
      )}

      {kind === 'licence' && (
        <div className="fgrid">
          <Field label="Licence type" error={errs.type}><select value={form.type} onChange={(e) => set('type', e.target.value)}><option value="">Select…</option>{LIC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
          {form.type === 'Other' && <Field label="Licence name" error={errs.typeOther}><input value={form.typeOther} onChange={(e) => set('typeOther', e.target.value)} /></Field>}
          <Field label="Authority"><AuthoritySelect value={form.issuingAuthority} onChange={(v) => set('issuingAuthority', v)} /></Field>
          <Field label="Number"><input value={form.certificateNumber} onChange={(e) => set('certificateNumber', e.target.value)} /></Field>
          <Field label="Issue date"><input type="date" value={form.issueDate} onChange={(e) => set('issueDate', e.target.value)} /></Field>
          <Field label="Expiry date"><input type="date" value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} /></Field>
        </div>
      )}

      {kind === 'rating' && (
        <div className="fgrid">
          <Field label="Aircraft" error={errs.aircraft}><AircraftCombobox value={form.aircraft} onChange={(v) => set('aircraft', v)} /></Field>
          <Field label="Under licence"><select value={form.licenceId} onChange={(e) => set('licenceId', e.target.value)}><option value="">Not linked</option>{licenceOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>
          <Field label="Line check date"><input type="date" value={form.lineCheckDate} onChange={(e) => set('lineCheckDate', e.target.value)} /></Field>
        </div>
      )}

      {kind === 'medical' && (
        <div className="fgrid">
          <Field label="Class"><select value={form.medicalClass} onChange={(e) => set('medicalClass', e.target.value)}>{MED_CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Authority"><AuthoritySelect value={form.issuingAuthority} onChange={(v) => set('issuingAuthority', v)} /></Field>
          <Field label="Issue date"><input type="date" value={form.issueDate} onChange={(e) => set('issueDate', e.target.value)} /></Field>
          <Field label="Expiry date" error={errs.expiryDate}><input type="date" value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} /></Field>
        </div>
      )}

      {kind === 'training' && (
        <div className="fgrid">
          <Field label="Course" error={errs.type}><input value={form.type} onChange={(e) => set('type', e.target.value)} placeholder="e.g. CRM, DGR, First Aid" /></Field>
          <Field label="Provider"><input value={form.provider} onChange={(e) => set('provider', e.target.value)} /></Field>
          <Field label="Completed" error={errs.completedAt}><input type="date" value={form.completedAt} onChange={(e) => set('completedAt', e.target.value)} /></Field>
          <Field label="Expiry" hint="Leave blank to use the default validity"><input type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} /></Field>
        </div>
      )}

      {kind === 'elp' && (
        <div className="fgrid">
          <Field label="Level"><select value={form.level} onChange={(e) => set('level', e.target.value)}>{ELP_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}</select></Field>
          <Field label="Authority"><AuthoritySelect value={form.issuingAuthority} onChange={(v) => set('issuingAuthority', v)} /></Field>
          <Field label="Expiry" hint="Blank = no expiry (e.g. Level 6)"><input type="date" value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} /></Field>
        </div>
      )}

      {kind === 'rtw' && (
        <div className="fgrid">
          <Field label="Country" error={errs.country}><SearchCombo value={form.country} onChange={(v) => set('country', v)} options={COUNTRIES} placeholder="Search countries…" /></Field>
          <Field label="Document"><input value={form.documentType} onChange={(e) => set('documentType', e.target.value)} placeholder="e.g. Residence permit" /></Field>
          <Field label="Number"><input value={form.documentNumber} onChange={(e) => set('documentNumber', e.target.value)} /></Field>
          <Field label="Expiry" hint="Blank = no expiry"><input type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} /></Field>
        </div>
      )}

      {kind === 'passport' && (
        <div className="fgrid">
          <Field label="Passport number"><input value={form.passportNumber} onChange={(e) => set('passportNumber', e.target.value)} /></Field>
          <Field label="Expiry date"><input type="date" value={form.passportExpiry} onChange={(e) => set('passportExpiry', e.target.value)} /></Field>
        </div>
      )}

      {kind === 'prefs' && (
        <div className="fgrid">
          <Field label="Preferred regions / countries (comma-separated)"><input value={form.preferredCountries} onChange={(e) => set('preferredCountries', e.target.value)} placeholder="Middle East, Europe" /></Field>
          <Field label="Preferred aircraft (comma-separated)"><input value={form.preferredAircraft} onChange={(e) => set('preferredAircraft', e.target.value)} placeholder="A320 family, B737" /></Field>
          <Field label="Contract types (comma-separated)"><input value={form.preferredContractTypes} onChange={(e) => set('preferredContractTypes', e.target.value)} placeholder="Permanent, Contract" /></Field>
          <label className="fld-check"><input type="checkbox" checked={form.willingToRelocate} onChange={(e) => set('willingToRelocate', e.target.checked)} /> Willing to relocate</label>
        </div>
      )}
    </Sheet>
  );
}
