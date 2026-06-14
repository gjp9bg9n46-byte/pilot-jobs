import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  BarChart2, FileText, Shield, Plane, MessageSquare,
  RefreshCw, Globe, User, Trash2,
} from 'lucide-react';
import { profileApi } from '../services/api';
import AircraftCombobox from '../components/AircraftCombobox';
import { LightPage, Card, Input, Button, Badge, Modal } from '../components/primitives';

const LICENCE_TYPES = [
  { value: 'ATPL', label: 'ATPL — Airline Transport Pilot' },
  { value: 'CPL',  label: 'CPL — Commercial Pilot' },
  { value: 'MPL',  label: 'MPL — Multi-crew Pilot' },
  { value: 'PPL',  label: 'PPL — Private Pilot' },
  { value: 'IR',   label: 'IR — Instrument Rating' },
  { value: 'ME',   label: 'ME — Multi-Engine Rating' },
  { value: 'SE',   label: 'SE — Single-Engine Rating' },
];

// Display-only aliases for legacy or alternate type codes not in the add-form dropdown.
// DB rows are not migrated — only the label shown in the list changes.
const LICENCE_DISPLAY_ALIASES = {
  ATP: 'ATPL — Airline Transport Pilot',
};

const AUTHORITIES = [
  { value: 'EASA',  label: 'EASA — Europe' },
  { value: 'FAA',   label: 'FAA — United States' },
  { value: 'CAA',   label: 'UK CAA — United Kingdom' },
  { value: 'TCCA',  label: 'Transport Canada — TCCA' },
  { value: 'CASA',  label: 'CASA — Australia' },
  { value: 'JCAB',  label: 'JCAB — Japan' },
  { value: 'GCAA',  label: 'GCAA — UAE' },
  { value: 'ANAC',  label: 'ANAC — Brazil' },
  { value: 'DGCA',  label: 'DGCA — India' },
  { value: 'CAAC',  label: 'CAAC — China' },
  { value: 'CAA_NZ', label: 'CAA — New Zealand' },
  { value: 'CAAS',  label: 'CAAS — Singapore' },
  { value: 'DGAC',  label: 'DGAC — Mexico' },
  { value: 'FATA',  label: 'Rosaviatsiya — Russia/CIS' },
  { value: 'ICAO',  label: 'ICAO — International (not a regulatory authority)' },
  { value: 'Other', label: 'Other' },
];

const MEDICAL_CLASSES = [
  { value: 'CLASS_1', label: 'Class 1 — Airline pilots' },
  { value: 'CLASS_2', label: 'Class 2 — Commercial pilots' },
  { value: 'CLASS_3', label: 'Class 3 — Private pilots' },
];

const RECURRENT_TYPES = [
  { value: 'CRM',       label: 'CRM' },
  { value: 'DGR',       label: 'DGR' },
  { value: 'AVSEC',     label: 'AVSEC' },
  { value: 'SMS',       label: 'SMS' },
  { value: 'First Aid', label: 'First Aid' },
  { value: 'RVSM',      label: 'RVSM' },
  { value: 'EFB',       label: 'EFB' },
  { value: 'Custom',    label: 'Custom' },
];

const RTW_DOC_TYPES = [
  { value: 'Passport',          label: 'Passport' },
  { value: 'Work Visa',         label: 'Work Visa' },
  { value: 'Residence Permit',  label: 'Residence Permit' },
  { value: 'Citizen',           label: 'Citizen' },
  { value: 'Right of Abode',    label: 'Right of Abode' },
];

const ENGLISH_LEVELS = [
  { value: 'Level 4', label: 'Level 4' },
  { value: 'Level 5', label: 'Level 5' },
  { value: 'Level 6', label: 'Level 6' },
];

// Semantic status colors remapped to light-AA shades (meaning preserved):
//   dark #2ECC71 → #166534 (ok/valid), #F0A500 / #F39C12 → #92400E (warn),
//   #FF4757 → #991B1B (expired/danger). Matches the Badge primitive palette.
const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };

// Returns the most-used issuing authority from the pilot's existing certificates,
// falling back to FAA when the profile has none yet.
function defaultAuthority(profile) {
  const certs = profile?.certificates || [];
  if (!certs.length) return 'FAA';
  const freq = {};
  certs.forEach((c) => { freq[c.issuingAuthority] = (freq[c.issuingAuthority] || 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'FAA';
}

const css = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24, alignItems: 'start' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  cardTitle: { fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)' },
  cardSubtitle: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' },
  itemTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  itemSub: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 },
  emptyNote: { color: 'var(--text-secondary)', fontSize: 13, fontStyle: 'italic', marginBottom: 6 },
  formRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 14 },
  addPanel: { marginTop: 14, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 },
  fieldErr: { color: SEM.red, fontSize: 12, marginTop: 6 },
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ dateStr }) {
  const days = daysUntil(dateStr);
  if (days === null) return null;
  if (days < 0) return <span style={{ color: SEM.red, fontSize: 12, fontWeight: 600 }}> · Expired</span>;
  if (days < 30) return <span style={{ color: SEM.red, fontSize: 12, fontWeight: 600 }}> · Expires in {days}d</span>;
  if (days < 90) return <span style={{ color: SEM.amber, fontSize: 12, fontWeight: 600 }}> · Expires in {days}d</span>;
  return null;
}

function SelectOptions({ options }) {
  return options.map((o) => (
    <option key={o.value} value={o.value}>{o.label}</option>
  ));
}

function useSave() {
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const [savedAt, setSavedAt] = useState(null);

  const run = async (fn) => {
    if (status === 'saving') return;
    setStatus('saving');
    try {
      await fn();
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setSavedAt(time);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
    }
  };

  return { saving: status === 'saving', savedAt: status === 'saved' ? savedAt : null, error: status === 'error', run };
}

function SaveStatus({ saving, savedAt, error }) {
  if (saving) return <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Saving…</span>;
  if (savedAt) return <span style={{ color: SEM.green, fontSize: 13, fontWeight: 600 }}>✓ Saved {savedAt}</span>;
  if (error) return <span style={{ color: SEM.red, fontSize: 13, fontWeight: 600 }}>⚠ Save failed — try again</span>;
  return null;
}

// Dashed "add row" affordance (kept distinct from <Button> per design decision).
function AddButton({ children, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ width: '100%', marginTop: 14, padding: '10px 0', borderRadius: 8, border: `1px dashed ${h ? 'var(--accent)' : 'var(--border)'}`, background: 'rgba(0,63,136,0.04)', color: 'var(--accent)', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'border-color 0.15s ease' }}
    >
      {children}
    </button>
  );
}

const formActions = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' };

function FlightTotalsCard({ totals }) {
  const stats = [
    { key: 'totalHours',    label: 'Total Hours' },
    { key: 'picHours',      label: 'PIC Hours' },
    { key: 'sicHours',      label: 'SIC Hours' },
    { key: 'multiEngine',   label: 'Multi-Engine' },
    { key: 'turbine',       label: 'Turbine' },
    { key: 'night',         label: 'Night' },
    { key: 'instrument',    label: 'Instrument' },
  ];

  const allZero = !totals || stats.every((s) => !totals[s.key] || totals[s.key] === 0);

  return (
    <Card style={{ padding: 28, marginBottom: 24 }}>
      <div style={css.cardHeader}>
        <BarChart2 size={22} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={css.cardTitle}>Flight Experience Totals</div>
          <div style={css.cardSubtitle}>Aggregated from your logbook</div>
        </div>
      </div>
      {allZero ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, fontStyle: 'italic' }}>
          Log flights in your logbook to see your totals here.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 12 }}>
          {stats.map(({ key, label }) => (
            <div key={key} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', lineHeight: 1.1 }}>
                {totals?.[key] ?? 0}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 5 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LicencesCard({ profile, setProfile, confirmDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: 'ATPL',
    authority: 'EASA',
    authorityOther: '',
    certificateNumber: '',
    issueDate: '',
    expiryDate: '',
  });
  const { saving, savedAt, error, run } = useSave();

  const handleAdd = () => run(async () => {
    const payload = {
      type: form.type,
      issuingAuthority: form.authority === 'Other' ? (form.authorityOther.trim() || 'Other') : form.authority,
      ...(form.certificateNumber && { certificateNumber: form.certificateNumber }),
      ...(form.issueDate && { issueDate: new Date(form.issueDate).toISOString() }),
      ...(form.expiryDate && { expiryDate: new Date(form.expiryDate).toISOString() }),
    };
    const { data } = await profileApi.addCertificate(payload);
    setProfile((p) => ({ ...p, certificates: [...(p.certificates || []), data] }));
    setShowForm(false);
    setForm({ type: 'ATPL', authority: 'EASA', authorityOther: '', certificateNumber: '', issueDate: '', expiryDate: '' });
  });

  return (
    <Card style={{ padding: 28 }}>
      <div style={css.cardHeader}>
        <FileText size={22} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={css.cardTitle}>My Pilot Licences</div>
          <div style={css.cardSubtitle}>Add every licence you hold</div>
        </div>
      </div>

      {(!profile?.certificates?.filter((c) => c.type !== 'ELP').length) && <div style={css.emptyNote}>No licences added yet.</div>}

      {profile?.certificates?.filter((c) => c.type !== 'ELP').map((cert) => {
        const lic = LICENCE_TYPES.find((l) => l.value === cert.type);
        const auth = AUTHORITIES.find((a) => a.value === cert.issuingAuthority);
        const days = daysUntil(cert.expiryDate);
        const expiryColor = days !== null && days < 90 ? (days < 0 ? SEM.red : days < 30 ? SEM.red : SEM.amber) : null;
        return (
          <div key={cert.id} style={css.item}>
            <div>
              <div style={css.itemTitle}>{lic?.label || LICENCE_DISPLAY_ALIASES[cert.type] || cert.type}</div>
              <div style={css.itemSub}>
                {auth?.label || cert.issuingAuthority}
                {cert.certificateNumber && <span> · #{cert.certificateNumber}</span>}
                {cert.expiryDate && (
                  <span style={{ color: expiryColor || 'var(--text-secondary)' }}>
                    {' · Exp '}{new Date(cert.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {expiryColor && <ExpiryBadge dateStr={cert.expiryDate} />}
                  </span>
                )}
              </div>
            </div>
            <Button variant="ghost" style={{ padding: 6, color: SEM.red }} onClick={() => confirmDelete('licence', async () => {
              await profileApi.deleteCertificate(cert.id);
              setProfile((p) => ({ ...p, certificates: p.certificates.filter((c) => c.id !== cert.id) }));
            })}><Trash2 size={15} /></Button>
          </div>
        );
      })}

      {!showForm
        ? (
          <>
            <AddButton onClick={() => setShowForm(true)}>+ Add a licence</AddButton>
            <SaveStatus saving={saving} savedAt={savedAt} error={error} />
          </>
        )
        : (
          <div style={css.addPanel}>
            <div style={css.formRow}>
              <Input as="select" label="Licence type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <SelectOptions options={LICENCE_TYPES} />
              </Input>
              <div>
                <Input as="select" label="Issuing authority" value={form.authority} onChange={(e) => setForm((f) => ({ ...f, authority: e.target.value, authorityOther: '' }))}>
                  <SelectOptions options={AUTHORITIES} />
                </Input>
                {form.authority === 'Other' && (
                  <div style={{ marginTop: 8 }}>
                    <Input value={form.authorityOther} onChange={(e) => setForm((f) => ({ ...f, authorityOther: e.target.value }))} placeholder="Enter authority name" />
                  </div>
                )}
              </div>
              <Input label="Certificate Number" value={form.certificateNumber} onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))} placeholder="Optional" />
              <Input label="Issue Date" type="date" value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} />
              <Input label="Expiry Date" type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
            </div>
            <div style={formActions}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
              <SaveStatus saving={saving} savedAt={savedAt} error={error} />
            </div>
          </div>
        )}
    </Card>
  );
}

function MedicalCard({ profile, setProfile, confirmDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => ({
    medicalClass: 'CLASS_1',
    issuingAuthority: defaultAuthority(profile),
    issueDate: '',
    expiryDate: '',
  }));
  const [dateErr, setDateErr] = useState({});
  const { saving, savedAt, error, run } = useSave();

  const handleAdd = () => {
    if (!form.issueDate || !form.expiryDate) {
      setDateErr({ issueDate: !form.issueDate ? 'Required' : undefined, expiryDate: !form.expiryDate ? 'Required' : undefined });
      return;
    }
    setDateErr({});
    run(async () => {
      const { data } = await profileApi.addMedical({
        ...form,
        issueDate: new Date(form.issueDate).toISOString(),
        expiryDate: new Date(form.expiryDate).toISOString(),
      });
      setProfile((p) => ({ ...p, medicals: [...(p.medicals || []), data] }));
      setShowForm(false);
    });
  };

  return (
    <Card style={{ padding: 28 }}>
      <div style={css.cardHeader}>
        <Shield size={22} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={css.cardTitle}>Medical Certificate</div>
          <div style={css.cardSubtitle}>Required by most airlines</div>
        </div>
      </div>

      {(!profile?.medicals?.length) && <div style={css.emptyNote}>No medical certificate added.</div>}

      {profile?.medicals?.map((med) => {
        const mc = MEDICAL_CLASSES.find((m) => m.value === med.medicalClass);
        const expiry = new Date(med.expiryDate);
        const expired = expiry < new Date();
        // Same expiry band as Licences: amber <90d, red <30d (ExpiryBadge owns the countdown text).
        const days = daysUntil(med.expiryDate);
        const expiryColor = days !== null && days < 90 ? (days < 30 ? SEM.red : SEM.amber) : null;
        return (
          <div key={med.id} style={css.item}>
            <div>
              <div style={css.itemTitle}>{mc?.label || med.medicalClass}</div>
              <div style={css.itemSub}>
                <span style={{ color: expired ? SEM.red : (expiryColor || SEM.green) }}>
                  {expired ? '⚠ Expired' : 'Valid until'} {expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {!expired && <ExpiryBadge dateStr={med.expiryDate} />}
                </span>
              </div>
            </div>
            <Button variant="ghost" style={{ padding: 6, color: SEM.red }} onClick={() => confirmDelete('medical', async () => {
              await profileApi.deleteMedical(med.id);
              setProfile((p) => ({ ...p, medicals: p.medicals.filter((m) => m.id !== med.id) }));
            })}><Trash2 size={15} /></Button>
          </div>
        );
      })}

      {!showForm
        ? (
          <>
            <AddButton onClick={() => setShowForm(true)}>+ Add medical certificate</AddButton>
            <SaveStatus saving={saving} savedAt={savedAt} error={error} />
          </>
        )
        : (
          <div style={css.addPanel}>
            <div style={css.formRow}>
              <Input as="select" label="Medical class" value={form.medicalClass} onChange={(e) => setForm((f) => ({ ...f, medicalClass: e.target.value }))}>
                <SelectOptions options={MEDICAL_CLASSES} />
              </Input>
              <Input as="select" label="Issuing authority" value={form.issuingAuthority} onChange={(e) => setForm((f) => ({ ...f, issuingAuthority: e.target.value }))}>
                <SelectOptions options={AUTHORITIES} />
              </Input>
              <Input label="Issue date" type="date" value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} error={dateErr.issueDate} />
              <Input label="Expiry date" type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} error={dateErr.expiryDate} />
            </div>
            <div style={formActions}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
              <SaveStatus saving={saving} savedAt={savedAt} error={error} />
            </div>
          </div>
        )}
    </Card>
  );
}

function TypeRatingsCard({ profile, setProfile, confirmDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [aircraftType, setAircraftType] = useState('');
  const [hoursOnType, setHoursOnType] = useState('');
  const [typeErr, setTypeErr] = useState(false);
  const { saving, savedAt, error, run } = useSave();

  const handleAdd = () => {
    if (!aircraftType.trim()) { setTypeErr(true); return; }
    setTypeErr(false);
    run(async () => {
      const { data } = await profileApi.addRating({
        aircraftType: aircraftType.toUpperCase(),
        category: 'Multi-Engine',
        hoursOnType: parseFloat(hoursOnType) || 0,
      });
      setProfile((p) => ({ ...p, ratings: [...(p.ratings || []), data] }));
      setShowForm(false);
      setAircraftType('');
      setHoursOnType('');
    });
  };

  return (
    <Card style={{ padding: 28 }}>
      <div style={css.cardHeader}>
        <Plane size={22} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={css.cardTitle}>Aircraft Type Ratings</div>
          <div style={css.cardSubtitle}>Aircraft you are rated to fly</div>
        </div>
      </div>

      {(!profile?.ratings?.length) && <div style={css.emptyNote}>No type ratings added.</div>}

      {profile?.ratings?.map((r) => (
        <div key={r.id} style={css.item}>
          <div>
            <div style={css.itemTitle}>
              {r.aircraftType}
              {r.issuingAuthority && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}> — {r.issuingAuthority}</span>}
            </div>
            {(r.capacity || r.hoursOnType > 0) && (
              <div style={css.itemSub}>
                {r.capacity && <span>{r.capacity}</span>}
                {r.capacity && r.hoursOnType > 0 && <span> · </span>}
                {r.hoursOnType > 0 && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{r.hoursOnType.toLocaleString()} hrs on type</span>}
              </div>
            )}
          </div>
          <Button variant="ghost" style={{ padding: 6, color: SEM.red }} onClick={() => confirmDelete('type rating', async () => {
            await profileApi.deleteRating(r.id);
            setProfile((p) => ({ ...p, ratings: p.ratings.filter((rt) => rt.id !== r.id) }));
          })}><Trash2 size={15} /></Button>
        </div>
      ))}

      {!showForm
        ? (
          <>
            <AddButton onClick={() => setShowForm(true)}>+ Add type rating</AddButton>
            <SaveStatus saving={saving} savedAt={savedAt} error={error} />
          </>
        )
        : (
          <div style={css.addPanel}>
            <div style={css.formRow}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Aircraft type</label>
                <AircraftCombobox value={aircraftType} onChange={(v) => { setAircraftType(v); if (typeErr) setTypeErr(false); }} inputStyle={typeErr ? { borderColor: SEM.red } : undefined} />
                {typeErr && <div style={css.fieldErr}>Required</div>}
              </div>
              <Input label="Hours on Type" type="number" min="0" step="0.1" value={hoursOnType} onChange={(e) => setHoursOnType(e.target.value)} placeholder="0.0" />
            </div>
            <div style={formActions}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
              <SaveStatus saving={saving} savedAt={savedAt} error={error} />
            </div>
          </div>
        )}
    </Card>
  );
}

function EnglishProficiencyCard({ confirmDelete }) {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ level: 'Level 4', endorsementNumber: '', issueDate: '', expiryDate: '', noExpiry: false });
  const { saving, savedAt, error, run } = useSave();

  useEffect(() => {
    profileApi.getELP?.().then(({ data }) => setItems(data)).catch(() => {});
  }, []);

  const handleAdd = () => run(async () => {
    const payload = { ...form, ...(form.noExpiry ? { expiryDate: null } : {}) };
    const { data } = await profileApi.addELP(payload);
    setItems((prev) => [...prev, data]);
    setShowForm(false);
    setForm({ level: 'Level 4', endorsementNumber: '', issueDate: '', expiryDate: '', noExpiry: false });
  });

  const elpVariant = (level) => (level === 'Level 4' ? 'warning' : level === 'Level 5' ? 'info' : 'success');

  return (
    <Card style={{ padding: 28, marginTop: 24 }}>
      <div style={css.cardHeader}>
        <MessageSquare size={22} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={css.cardTitle}>English Language Proficiency</div>
          <div style={css.cardSubtitle}>ICAO ELP — required for all international operations</div>
        </div>
      </div>

      {items.length === 0 && !showForm && (
        <div style={css.emptyNote}>No ELP record added. ICAO Level 4 minimum is required by most airlines.</div>
      )}

      {items.map((item) => (
        <div key={item.id} style={css.item}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Badge variant={elpVariant(item.level)}>ICAO {item.level}</Badge>
              {item.level === 'Level 6' && (
                <span style={{ color: SEM.green, fontSize: 12, fontWeight: 700 }}>Expert — No expiry</span>
              )}
            </div>
            <div style={{ ...css.itemSub, marginTop: 6 }}>
              {item.endorsementNumber && `#${item.endorsementNumber}`}
              {item.issueDate && ` · Issued ${new Date(item.issueDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`}
              {item.expiryDate && <ExpiryBadge dateStr={item.expiryDate} />}
              {item.noExpiry && item.level !== 'Level 6' && <span style={{ color: SEM.green, fontSize: 12, fontWeight: 600 }}> · No expiry</span>}
            </div>
          </div>
          <Button variant="ghost" style={{ padding: 6, color: SEM.red }} onClick={() => confirmDelete('ELP record', async () => {
            await profileApi.deleteELP(item.id);
            setItems((prev) => prev.filter((i) => i.id !== item.id));
          })}><Trash2 size={15} /></Button>
        </div>
      ))}

      {!showForm ? (
        <>
          <AddButton onClick={() => setShowForm(true)}>+ Add ELP record</AddButton>
          <SaveStatus saving={saving} savedAt={savedAt} error={error} />
        </>
      ) : (
        <div style={css.addPanel}>
          <div style={css.formRow}>
            <Input as="select" label="Proficiency Level" value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}>
              <option value="Level 4">ICAO Level 4 — Operational</option>
              <option value="Level 5">ICAO Level 5 — Extended</option>
              <option value="Level 6">ICAO Level 6 — Expert (no expiry)</option>
            </Input>
            <Input label="Endorsement / Certificate #" value={form.endorsementNumber} onChange={(e) => setForm((f) => ({ ...f, endorsementNumber: e.target.value }))} placeholder="Optional" />
            <Input label="Issue Date" type="date" value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} />
            {form.level !== 'Level 6' && (
              <>
                <Input label="Expiry Date" type="date" value={form.expiryDate} disabled={form.noExpiry} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} style={{ opacity: form.noExpiry ? 0.4 : 1 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 24 }}>
                  <input type="checkbox" id="elpNoExpiry" checked={form.noExpiry} onChange={(e) => setForm((f) => ({ ...f, noExpiry: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                  <label htmlFor="elpNoExpiry" style={{ color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>No expiry</label>
                </div>
              </>
            )}
          </div>
          <div style={{ ...formActions, marginTop: 4 }}>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            <SaveStatus saving={saving} savedAt={savedAt} error={error} />
          </div>
        </div>
      )}
    </Card>
  );
}

function RecurrentTrainingCard({ confirmDelete }) {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    trainingType: 'CRM',
    provider: '',
    completionDate: '',
    expiryDate: '',
    remarks: '',
  });
  const [dateErr, setDateErr] = useState(false);
  const { saving, savedAt, error, run } = useSave();

  useEffect(() => {
    profileApi.getRecurrent().then(({ data }) => setItems(data || [])).catch(() => setItems([]));
  }, []);

  const handleAdd = () => {
    if (!form.completionDate) { setDateErr(true); return; }
    setDateErr(false);
    run(async () => {
      const payload = {
        trainingType: form.trainingType,
        provider: form.provider,
        completionDate: new Date(form.completionDate).toISOString(),
        ...(form.expiryDate && { expiryDate: new Date(form.expiryDate).toISOString() }),
        ...(form.remarks && { remarks: form.remarks }),
      };
      const { data } = await profileApi.addRecurrent(payload);
      setItems((prev) => [...prev, data]);
      setShowForm(false);
      setForm({ trainingType: 'CRM', provider: '', completionDate: '', expiryDate: '', remarks: '' });
    });
  };

  return (
    <Card style={{ padding: 28, marginBottom: 24 }}>
      <div style={css.cardHeader}>
        <RefreshCw size={22} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={css.cardTitle}>Recurrent Training</div>
          <div style={css.cardSubtitle}>Track your mandatory recurrent training</div>
        </div>
      </div>

      {!items.length && !showForm && (
        <div style={css.emptyNote}>No recurrent training records.</div>
      )}

      {items.map((item) => {
        const days = daysUntil(item.expiryDate);
        const expiryWarningColor = days !== null && days < 0 ? SEM.red : days !== null && days < 30 ? SEM.red : days !== null && days < 90 ? SEM.amber : null;
        return (
          <div key={item.id} style={css.item}>
            <div>
              <div style={css.itemTitle}>
                {item.trainingType}
                {expiryWarningColor && (
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: expiryWarningColor }}>
                    {days < 0 ? '⚠ Expired' : `⚠ Expires in ${days}d`}
                  </span>
                )}
              </div>
              <div style={css.itemSub}>
                {item.provider && <span>{item.provider} · </span>}
                Completed: {new Date(item.completionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {item.expiryDate && (
                  <span style={{ color: expiryWarningColor || 'var(--text-secondary)' }}>
                    {' · Exp '}{new Date(item.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
                {item.remarks && <span> · {item.remarks}</span>}
              </div>
            </div>
            <Button variant="ghost" style={{ padding: 6, color: SEM.red }} onClick={() => confirmDelete('recurrent training record', async () => {
              await profileApi.deleteRecurrent(item.id);
              setItems((prev) => prev.filter((i) => i.id !== item.id));
            })}><Trash2 size={15} /></Button>
          </div>
        );
      })}

      {!showForm
        ? (
          <>
            <AddButton onClick={() => setShowForm(true)}>+ Add recurrent training</AddButton>
            <SaveStatus saving={saving} savedAt={savedAt} error={error} />
          </>
        )
        : (
          <div style={css.addPanel}>
            <div style={css.formRow}>
              <Input as="select" label="Training Type" value={form.trainingType} onChange={(e) => setForm((f) => ({ ...f, trainingType: e.target.value }))}>
                <SelectOptions options={RECURRENT_TYPES} />
              </Input>
              <Input label="Provider" value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} placeholder="Training organisation" />
              <Input label="Completion Date" type="date" value={form.completionDate} onChange={(e) => setForm((f) => ({ ...f, completionDate: e.target.value }))} error={dateErr ? 'Required' : undefined} />
              <Input label="Expiry Date (optional)" type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <Input label="Remarks" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} placeholder="Optional notes" />
            </div>
            <div style={formActions}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
              <SaveStatus saving={saving} savedAt={savedAt} error={error} />
            </div>
          </div>
        )}
    </Card>
  );
}

function RightToWorkCard({ confirmDelete }) {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    country: '',
    documentType: 'Passport',
    documentNumber: '',
    expiryDate: '',
    noExpiry: false,
  });
  const [countryErr, setCountryErr] = useState(false);
  const { saving, savedAt, error, run } = useSave();

  useEffect(() => {
    profileApi.getRTW().then(({ data }) => setItems(data || [])).catch(() => setItems([]));
  }, []);

  const handleAdd = () => {
    if (!form.country.trim()) { setCountryErr(true); return; }
    setCountryErr(false);
    run(async () => {
      const payload = {
        country: form.country,
        documentType: form.documentType,
        ...(form.documentNumber && { documentNumber: form.documentNumber }),
        noExpiry: form.noExpiry,
        ...(!form.noExpiry && form.expiryDate && { expiryDate: new Date(form.expiryDate).toISOString() }),
      };
      const { data } = await profileApi.addRTW(payload);
      setItems((prev) => [...prev, data]);
      setShowForm(false);
      setForm({ country: '', documentType: 'Passport', documentNumber: '', expiryDate: '', noExpiry: false });
    });
  };

  return (
    <Card style={{ padding: 28, marginBottom: 24 }}>
      <div style={css.cardHeader}>
        <Globe size={22} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={css.cardTitle}>Right to Work</div>
          <div style={css.cardSubtitle}>Countries where you have the right to work</div>
        </div>
      </div>

      {!items.length && !showForm && (
        <div style={css.emptyNote}>No right-to-work documents added.</div>
      )}

      {items.map((item) => {
        const days = item.noExpiry ? null : daysUntil(item.expiryDate);
        const expiryWarningColor = days !== null && days < 0 ? SEM.red : days !== null && days < 30 ? SEM.red : days !== null && days < 90 ? SEM.amber : null;
        return (
          <div key={item.id} style={css.item}>
            <div>
              <div style={css.itemTitle}>
                {item.country}
                {expiryWarningColor && (
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: expiryWarningColor }}>
                    {days < 0 ? '⚠ Expired' : `⚠ Expires in ${days}d`}
                  </span>
                )}
              </div>
              <div style={css.itemSub}>
                {item.documentType}
                {item.documentNumber && <span> · #{item.documentNumber}</span>}
                {item.noExpiry
                  ? <span style={{ color: SEM.green }}> · No expiry</span>
                  : item.expiryDate && (
                    <span style={{ color: expiryWarningColor || 'var(--text-secondary)' }}>
                      {' · Exp '}{new Date(item.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
              </div>
            </div>
            <Button variant="ghost" style={{ padding: 6, color: SEM.red }} onClick={() => confirmDelete('right-to-work entry', async () => {
              await profileApi.deleteRTW(item.id);
              setItems((prev) => prev.filter((i) => i.id !== item.id));
            })}><Trash2 size={15} /></Button>
          </div>
        );
      })}

      {!showForm
        ? (
          <>
            <AddButton onClick={() => setShowForm(true)}>+ Add document</AddButton>
            <SaveStatus saving={saving} savedAt={savedAt} error={error} />
          </>
        )
        : (
          <div style={css.addPanel}>
            <div style={css.formRow}>
              <Input label="Country" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder="e.g. United Arab Emirates" error={countryErr ? 'Required' : undefined} />
              <Input as="select" label="Document Type" value={form.documentType} onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value }))}>
                <SelectOptions options={RTW_DOC_TYPES} />
              </Input>
              <Input label="Document Number (optional)" value={form.documentNumber} onChange={(e) => setForm((f) => ({ ...f, documentNumber: e.target.value }))} placeholder="Optional" />
              <Input label="Expiry Date (optional)" type="date" value={form.expiryDate} disabled={form.noExpiry} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} style={{ opacity: form.noExpiry ? 0.4 : 1 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <input type="checkbox" id="noExpiry" checked={form.noExpiry} onChange={(e) => setForm((f) => ({ ...f, noExpiry: e.target.checked, expiryDate: e.target.checked ? '' : f.expiryDate }))} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
              <label htmlFor="noExpiry" style={{ color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>No expiry</label>
            </div>
            <div style={formActions}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
              <SaveStatus saving={saving} savedAt={savedAt} error={error} />
            </div>
          </div>
        )}
    </Card>
  );
}

export default function Profile() {
  const pilot = useSelector((s) => s.auth.pilot);
  const [profile, setProfile] = useState(null);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [personalForm, setPersonalForm] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // { label, fn }
  const { saving: personalSaving, savedAt: personalSavedAt, error: personalError, run: personalRun } = useSave();

  const confirmDelete = (label, fn) => setPendingDelete({ label, fn });

  useEffect(() => {
    Promise.all([
      profileApi.get(),
      profileApi.getTotals().catch(() => ({ data: null })),
    ]).then(([{ data: profileData }, { data: totalsData }]) => {
      setProfile(profileData);
      setTotals(totalsData);
      const initial = {
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        phone: profileData.phone || '',
        country: profileData.country || '',
        city: profileData.city || '',
        education: profileData.education || null,
        role: profileData.role || '',
        passportNumber: profileData.passportNumber || '',
        passportExpiry: profileData.passportExpiry
          ? new Date(profileData.passportExpiry).toISOString().split('T')[0]
          : '',
      };
      setPersonalForm(initial);
      setSavedSnapshot(initial);
      setLoading(false);
    });
  }, []);

  const isDirty = savedSnapshot && personalForm
    && JSON.stringify(personalForm) !== JSON.stringify(savedSnapshot);

  const savePersonal = () => personalRun(async () => {
    await profileApi.update(personalForm);
    setProfile((p) => ({ ...p, ...personalForm }));
    setSavedSnapshot({ ...personalForm });
  });

  if (loading) return <LightPage><div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 80 }}>Loading your profile...</div></LightPage>;

  return (
    <LightPage style={{ fontFamily: 'var(--font-body)' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 8 }}>Profile</h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 28 }}>Your career record — keep it current.</p>

      {/* Flight Experience Totals */}
      <FlightTotalsCard totals={totals} />

      {/* Personal info */}
      <Card style={{ padding: 28, marginBottom: 24 }}>
        <div style={css.cardHeader}>
          <User size={22} style={{ color: 'var(--accent)' }} />
          <div>
            <div style={css.cardTitle}>Personal Information</div>
            <div style={css.cardSubtitle}>Basic details on your account</div>
          </div>
        </div>

        {personalForm && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
              {[
                { k: 'firstName', label: 'First Name' },
                { k: 'lastName',  label: 'Last Name' },
                { k: 'phone',     label: 'Phone' },
                { k: 'country',   label: 'Country' },
                { k: 'city',      label: 'City' },
              ].map(({ k, label }) => (
                <Input key={k} label={label} value={personalForm[k] || ''} onChange={(e) => setPersonalForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={label} />
              ))}
              <Input as="select" label="Education" value={personalForm.education || ''} onChange={(e) => setPersonalForm((f) => ({ ...f, education: e.target.value || null }))}>
                <option value="">Not specified</option>
                <option value="high_school">High School / GED</option>
                <option value="technical">Technical / Vocational</option>
                <option value="bachelor">Bachelor's Degree</option>
                <option value="masters">Master's Degree</option>
                <option value="doctorate">Doctorate</option>
              </Input>
              <Input as="select" label="Role" value={personalForm.role || ''} onChange={(e) => setPersonalForm((f) => ({ ...f, role: e.target.value || '' }))}>
                <option value="">Not specified</option>
                <option value="FIRST_OFFICER">First Officer</option>
                <option value="CAPTAIN">Captain</option>
              </Input>
            </div>

            {/* Passport */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 }}>
                Passport
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
                <Input label="Passport Number" value={personalForm.passportNumber || ''} onChange={(e) => setPersonalForm((f) => ({ ...f, passportNumber: e.target.value }))} placeholder="e.g. A12345678" />
                <div>
                  <Input label="Passport Expiry" type="date" value={personalForm.passportExpiry || ''} onChange={(e) => setPersonalForm((f) => ({ ...f, passportExpiry: e.target.value }))} />
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Used for expiry alerts</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <Button onClick={savePersonal} disabled={personalSaving}>
                {personalSaving ? 'Saving...' : 'Save Changes'}
              </Button>
              {isDirty && !personalSaving && (
                <span style={{ color: SEM.amber, fontSize: 13, fontWeight: 600 }}>● Unsaved changes</span>
              )}
              <SaveStatus saving={personalSaving} savedAt={personalSavedAt} error={personalError} />
            </div>
          </>
        )}
      </Card>

      {/* Licences and Medical in a two-column grid */}
      <div style={css.grid}>
        <LicencesCard profile={profile} setProfile={setProfile} confirmDelete={confirmDelete} />
        <MedicalCard profile={profile} setProfile={setProfile} confirmDelete={confirmDelete} />
      </div>

      {/* Type Ratings */}
      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <TypeRatingsCard profile={profile} setProfile={setProfile} confirmDelete={confirmDelete} />
      </div>

      {/* English Language Proficiency */}
      <EnglishProficiencyCard confirmDelete={confirmDelete} />

      {/* Recurrent Training */}
      <RecurrentTrainingCard confirmDelete={confirmDelete} />

      {/* Right to Work */}
      <RightToWorkCard confirmDelete={confirmDelete} />

      {/* Single page-level delete confirmation (replaces 6 window.confirm) */}
      <Modal isOpen={!!pendingDelete} onClose={() => setPendingDelete(null)} title={pendingDelete ? `Delete ${pendingDelete.label}?` : ''}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 0 }}>
          This permanently removes the record and can't be undone.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <Button variant="danger" onClick={() => { const fn = pendingDelete.fn; setPendingDelete(null); fn(); }}>Delete</Button>
          <Button variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
        </div>
      </Modal>
    </LightPage>
  );
}
