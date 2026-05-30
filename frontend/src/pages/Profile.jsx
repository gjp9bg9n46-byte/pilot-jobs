import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  BarChart2, FileText, Shield, Plane, MessageSquare,
  RefreshCw, Globe, User, Trash2,
} from 'lucide-react';
import { profileApi } from '../services/api';

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
  { value: 'FAA',  label: 'FAA — United States' },
  { value: 'EASA', label: 'EASA — Europe' },
  { value: 'CAA',  label: 'UK CAA — United Kingdom' },
  { value: 'TCCA', label: 'Transport Canada — TCCA' },
  { value: 'CAAC', label: 'CAAC — China' },
  { value: 'ICAO', label: 'ICAO — International' },
  { value: 'FATA', label: 'Rosaviatsiya — Russia/CIS' },
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
  card: { background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 16, padding: 28, marginBottom: 0 },
  cardFull: { background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 16, padding: 28, marginBottom: 24 },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  cardIcon: { fontSize: 22 },
  cardTitle: { fontSize: 17, fontWeight: 700, color: '#fff' },
  cardSubtitle: { fontSize: 12, color: '#4A6080', marginTop: 2 },
  item: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 0', borderBottom: '1px solid #1B2B4B',
  },
  itemTitle: { fontSize: 14, fontWeight: 600, color: '#fff' },
  itemSub: { fontSize: 12, color: '#7A8CA0', marginTop: 3 },
  deleteBtn: { background: 'none', border: 'none', color: '#FF4757', cursor: 'pointer', padding: 4, display: 'inline-flex', alignItems: 'center' },
  addBtn: {
    background: 'transparent', border: '1px dashed #243050', borderRadius: 8,
    padding: '10px 0', width: '100%', color: '#00B4D8', fontWeight: 600,
    fontSize: 13, cursor: 'pointer', marginTop: 14, transition: 'border-color 0.15s',
  },
  emptyNote: { color: '#4A6080', fontSize: 13, fontStyle: 'italic', marginBottom: 6 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#7A8CA0', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    width: '100%', background: '#1B2B4B', border: '1px solid #243050',
    borderRadius: 8, padding: '11px 12px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  },
  select: {
    width: '100%', background: '#1B2B4B', border: '1px solid #243050',
    borderRadius: 8, padding: '11px 12px', color: '#fff', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
  },
  formRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 14 },
  saveBtn: {
    background: 'linear-gradient(135deg, #00B4D8, #0077A8)', border: 'none',
    borderRadius: 8, padding: '11px 22px', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
  cancelBtn: {
    background: '#1B2B4B', border: '1px solid #243050', borderRadius: 8,
    padding: '11px 18px', color: '#7A8CA0', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginRight: 10,
  },
  successNote: {
    background: '#0D2B1A', border: '1px solid #1A4A2A', borderRadius: 8,
    padding: '10px 14px', color: '#2ECC71', fontSize: 13, marginTop: 12,
  },
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ dateStr }) {
  const days = daysUntil(dateStr);
  if (days === null) return null;
  if (days < 0) return <span style={{ color: '#FF4757', fontSize: 12, fontWeight: 600 }}> · Expired</span>;
  if (days < 30) return <span style={{ color: '#FF4757', fontSize: 12, fontWeight: 600 }}> · Expires in {days}d</span>;
  if (days < 90) return <span style={{ color: '#F0A500', fontSize: 12, fontWeight: 600 }}> · Expires in {days}d</span>;
  return null;
}

function SelectOptions({ options }) {
  return options.map((o) => (
    <option key={o.value} value={o.value}>{o.label}</option>
  ));
}

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
    <div style={css.cardFull}>
      <div style={css.cardHeader}>
        <BarChart2 size={22} color="#00B4D8" />
        <div>
          <div style={css.cardTitle}>Flight Experience Totals</div>
          <div style={css.cardSubtitle}>Aggregated from your logbook</div>
        </div>
      </div>
      {allZero ? (
        <div style={{ color: '#7A8CA0', fontSize: 13, fontStyle: 'italic' }}>
          Log flights in your logbook to see your totals here.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 12 }}>
          {stats.map(({ key, label }) => (
            <div
              key={key}
              style={{
                background: '#0A1628', border: '1px solid #1E3050', borderRadius: 10,
                padding: '14px 10px', textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, color: '#00B4D8', lineHeight: 1.1 }}>
                {totals?.[key] ?? 0}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#7A8CA0', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 5 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LicencesCard({ profile, setProfile }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: 'ATPL',
    authority: 'FAA',
    certificateNumber: '',
    issueDate: '',
    expiryDate: '',
    englishProficiency: '',
  });
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        issuingAuthority: form.authority,
        ...(form.certificateNumber && { certificateNumber: form.certificateNumber }),
        ...(form.issueDate && { issueDate: new Date(form.issueDate).toISOString() }),
        ...(form.expiryDate && { expiryDate: new Date(form.expiryDate).toISOString() }),
        ...(form.englishProficiency && { englishLevel: form.englishProficiency }),
      };
      const { data } = await profileApi.addCertificate(payload);
      setProfile((p) => ({ ...p, certificates: [...(p.certificates || []), data] }));
      setShowForm(false);
      setForm({ type: 'ATPL', authority: 'FAA', certificateNumber: '', issueDate: '', expiryDate: '', englishProficiency: '' });
    } finally { setSaving(false); }
  };

  return (
    <div style={css.card}>
      <div style={css.cardHeader}>
        <FileText size={22} color="#00B4D8" />
        <div>
          <div style={css.cardTitle}>My Pilot Licences</div>
          <div style={css.cardSubtitle}>Add every licence you hold</div>
        </div>
      </div>

      {(!profile?.certificates?.length) && <div style={css.emptyNote}>No licences added yet.</div>}

      {profile?.certificates?.map((cert) => {
        const lic = LICENCE_TYPES.find((l) => l.value === cert.type);
        const auth = AUTHORITIES.find((a) => a.value === cert.issuingAuthority);
        const days = daysUntil(cert.expiryDate);
        const expiryColor = days !== null && days < 90 ? (days < 0 ? '#FF4757' : days < 30 ? '#FF4757' : '#F0A500') : null;
        return (
          <div key={cert.id} style={css.item}>
            <div>
              <div style={css.itemTitle}>{lic?.label || LICENCE_DISPLAY_ALIASES[cert.type] || cert.type}</div>
              <div style={css.itemSub}>
                {auth?.label || cert.issuingAuthority}
                {cert.certificateNumber && <span> · #{cert.certificateNumber}</span>}
                {cert.englishLevel && <span> · ELP {cert.englishLevel}</span>}
                {cert.expiryDate && (
                  <span style={{ color: expiryColor || '#7A8CA0' }}>
                    {' · Exp '}{new Date(cert.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {expiryColor && <ExpiryBadge dateStr={cert.expiryDate} />}
                  </span>
                )}
              </div>
            </div>
            <button style={css.deleteBtn} onClick={async () => {
              if (!window.confirm('Remove this licence?')) return;
              await profileApi.deleteCertificate(cert.id);
              setProfile((p) => ({ ...p, certificates: p.certificates.filter((c) => c.id !== cert.id) }));
            }}><Trash2 size={15} /></button>
          </div>
        );
      })}

      {!showForm
        ? <button style={css.addBtn} onClick={() => setShowForm(true)}>+ Add a licence</button>
        : (
          <div style={{ marginTop: 14, background: '#0A2040', borderRadius: 10, padding: 16 }}>
            <div style={css.formRow}>
              <div>
                <label style={css.label}>Licence type</label>
                <select style={css.select} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  <SelectOptions options={LICENCE_TYPES} />
                </select>
              </div>
              <div>
                <label style={css.label}>Issuing authority</label>
                <select style={css.select} value={form.authority} onChange={(e) => setForm((f) => ({ ...f, authority: e.target.value }))}>
                  <SelectOptions options={AUTHORITIES} />
                </select>
              </div>
              <div>
                <label style={css.label}>Certificate Number</label>
                <input style={css.input} value={form.certificateNumber} onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))} placeholder="Optional" />
              </div>
              <div>
                <label style={css.label}>English Proficiency Level</label>
                <select style={css.select} value={form.englishProficiency} onChange={(e) => setForm((f) => ({ ...f, englishProficiency: e.target.value }))}>
                  <option value="">— Not specified —</option>
                  <SelectOptions options={ENGLISH_LEVELS} />
                </select>
              </div>
              <div>
                <label style={css.label}>Issue Date</label>
                <input style={css.input} type="date" value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} />
              </div>
              <div>
                <label style={css.label}>Expiry Date</label>
                <input style={css.input} type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex' }}>
              <button style={css.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button style={{ ...css.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={handleAdd} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

function MedicalCard({ profile, setProfile }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => ({
    medicalClass: 'CLASS_1',
    issuingAuthority: defaultAuthority(profile),
    issueDate: '',
    expiryDate: '',
  }));
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!form.issueDate || !form.expiryDate) return alert('Please enter both dates.');
    setSaving(true);
    try {
      const { data } = await profileApi.addMedical({
        ...form,
        issueDate: new Date(form.issueDate).toISOString(),
        expiryDate: new Date(form.expiryDate).toISOString(),
      });
      setProfile((p) => ({ ...p, medicals: [...(p.medicals || []), data] }));
      setShowForm(false);
    } finally { setSaving(false); }
  };

  return (
    <div style={css.card}>
      <div style={css.cardHeader}>
        <Shield size={22} color="#00B4D8" />
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
        return (
          <div key={med.id} style={css.item}>
            <div>
              <div style={css.itemTitle}>{mc?.label || med.medicalClass}</div>
              <div style={css.itemSub}>
                <span style={{ color: expired ? '#FF4757' : '#2ECC71' }}>
                  {expired ? '⚠ Expired' : 'Valid until'} {expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
            <button style={css.deleteBtn} onClick={async () => {
              if (!window.confirm('Remove this medical?')) return;
              await profileApi.deleteMedical(med.id);
              setProfile((p) => ({ ...p, medicals: p.medicals.filter((m) => m.id !== med.id) }));
            }}><Trash2 size={15} /></button>
          </div>
        );
      })}

      {!showForm
        ? <button style={css.addBtn} onClick={() => setShowForm(true)}>+ Add medical certificate</button>
        : (
          <div style={{ marginTop: 14, background: '#0A2040', borderRadius: 10, padding: 16 }}>
            <div style={css.formRow}>
              <div>
                <label style={css.label}>Medical class</label>
                <select style={css.select} value={form.medicalClass} onChange={(e) => setForm((f) => ({ ...f, medicalClass: e.target.value }))}>
                  <SelectOptions options={MEDICAL_CLASSES} />
                </select>
              </div>
              <div>
                <label style={css.label}>Issuing authority</label>
                <select style={css.select} value={form.issuingAuthority} onChange={(e) => setForm((f) => ({ ...f, issuingAuthority: e.target.value }))}>
                  <SelectOptions options={AUTHORITIES} />
                </select>
              </div>
              <div>
                <label style={css.label}>Issue date</label>
                <input style={css.input} type="date" value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} />
              </div>
              <div>
                <label style={css.label}>Expiry date</label>
                <input style={css.input} type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex' }}>
              <button style={css.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button style={{ ...css.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={handleAdd} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

function TypeRatingsCard({ profile, setProfile }) {
  const [showForm, setShowForm] = useState(false);
  const [aircraftType, setAircraftType] = useState('');
  const [hoursOnType, setHoursOnType] = useState('');
  const [authority, setAuthority] = useState(() => defaultAuthority(profile));
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!aircraftType.trim()) return alert('Please enter an aircraft type.');
    setSaving(true);
    try {
      const { data } = await profileApi.addRating({
        aircraftType: aircraftType.toUpperCase(),
        category: 'Multi-Engine',
        hoursOnType: parseFloat(hoursOnType) || 0,
        issuingAuthority: authority,
      });
      setProfile((p) => ({ ...p, ratings: [...(p.ratings || []), data] }));
      setShowForm(false);
      setAircraftType('');
      setHoursOnType('');
    } finally { setSaving(false); }
  };

  return (
    <div style={css.card}>
      <div style={css.cardHeader}>
        <Plane size={22} color="#00B4D8" />
        <div>
          <div style={css.cardTitle}>Aircraft Type Ratings</div>
          <div style={css.cardSubtitle}>Aircraft you are rated to fly</div>
        </div>
      </div>

      {(!profile?.ratings?.length) && <div style={css.emptyNote}>No type ratings added.</div>}

      {profile?.ratings?.map((r) => (
          <div key={r.id} style={css.item}>
            <div>
              <div style={css.itemTitle}>{r.aircraftType}</div>
              {r.hoursOnType > 0 && (
                <div style={css.itemSub}>
                  <span style={{ color: '#00B4D8', fontWeight: 600 }}>{r.hoursOnType.toLocaleString()} hrs on type</span>
                </div>
              )}
            </div>
            <button style={css.deleteBtn} onClick={async () => {
              if (!window.confirm('Remove this type rating?')) return;
              await profileApi.deleteRating(r.id);
              setProfile((p) => ({ ...p, ratings: p.ratings.filter((rt) => rt.id !== r.id) }));
            }}><Trash2 size={15} /></button>
          </div>
        )
      )}

      {!showForm
        ? <button style={css.addBtn} onClick={() => setShowForm(true)}>+ Add type rating</button>
        : (
          <div style={{ marginTop: 14, background: '#0A2040', borderRadius: 10, padding: 16 }}>
            <div style={css.formRow}>
              <div>
                <label style={css.label}>Aircraft type</label>
                <input style={css.input} value={aircraftType} onChange={(e) => setAircraftType(e.target.value)} placeholder="e.g. B737, A320, ATR72" />
              </div>
              <div>
                <label style={css.label}>Issuing authority</label>
                <select style={css.select} value={authority} onChange={(e) => setAuthority(e.target.value)}>
                  <SelectOptions options={AUTHORITIES} />
                </select>
              </div>
              <div>
                <label style={css.label}>Hours on Type</label>
                <input style={css.input} type="number" min="0" step="0.1" value={hoursOnType} onChange={(e) => setHoursOnType(e.target.value)} placeholder="0.0" />
              </div>
            </div>
            <div style={{ display: 'flex' }}>
              <button style={css.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button style={{ ...css.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={handleAdd} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

function EnglishProficiencyCard() {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ level: 'Level 4', endorsementNumber: '', issueDate: '', expiryDate: '', noExpiry: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    profileApi.getELP?.().then(({ data }) => setItems(data)).catch(() => {});
  }, []);

  const handleAdd = async () => {
    setSaving(true);
    try {
      const payload = { ...form, ...(form.noExpiry ? { expiryDate: null } : {}) };
      const { data } = await profileApi.addELP(payload);
      setItems((prev) => [...prev, data]);
      setShowForm(false);
      setForm({ level: 'Level 4', endorsementNumber: '', issueDate: '', expiryDate: '', noExpiry: false });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this English proficiency record?')) return;
    await profileApi.deleteELP(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const levelColors = { 'Level 4': '#F39C12', 'Level 5': '#00B4D8', 'Level 6': '#2ECC71' };

  return (
    <div style={{ ...css.cardFull, marginTop: 24 }}>
      <div style={css.cardHeader}>
        <MessageSquare size={22} color="#00B4D8" />
        <div>
          <div style={css.cardTitle}>English Language Proficiency</div>
          <div style={css.cardSubtitle}>ICAO ELP — required for all international operations</div>
        </div>
      </div>

      {items.length === 0 && !showForm && (
        <div style={css.emptyNote}>No ELP record added. ICAO Level 4 minimum is required by most airlines.</div>
      )}

      {items.map((item) => {
        const color = levelColors[item.level] || '#7A8CA0';
        return (
          <div key={item.id} style={css.item}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  background: `${color}20`, border: `1px solid ${color}40`,
                  color, borderRadius: 6, padding: '3px 10px',
                  fontSize: 13, fontWeight: 800,
                }}>
                  ICAO {item.level}
                </span>
                {item.level === 'Level 6' && (
                  <span style={{ color: '#2ECC71', fontSize: 12, fontWeight: 700 }}>Expert — No expiry</span>
                )}
              </div>
              <div style={{ ...css.itemSub, marginTop: 6 }}>
                {item.endorsementNumber && `#${item.endorsementNumber}`}
                {item.issueDate && ` · Issued ${new Date(item.issueDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`}
                {item.expiryDate && <ExpiryBadge dateStr={item.expiryDate} />}
                {item.noExpiry && item.level !== 'Level 6' && <span style={{ color: '#2ECC71', fontSize: 12, fontWeight: 600 }}> · No expiry</span>}
              </div>
            </div>
            <button style={css.deleteBtn} onClick={() => handleDelete(item.id)}><Trash2 size={15} /></button>
          </div>
        );
      })}

      {!showForm ? (
        <button style={css.addBtn} onClick={() => setShowForm(true)}>+ Add ELP record</button>
      ) : (
        <div style={{ marginTop: 14, background: '#0A2040', borderRadius: 10, padding: 16 }}>
          <div style={css.formRow}>
            <div>
              <label style={css.label}>Proficiency Level</label>
              <select style={css.select} value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}>
                <option value="Level 4">ICAO Level 4 — Operational</option>
                <option value="Level 5">ICAO Level 5 — Extended</option>
                <option value="Level 6">ICAO Level 6 — Expert (no expiry)</option>
              </select>
            </div>
            <div>
              <label style={css.label}>Endorsement / Certificate #</label>
              <input style={css.input} value={form.endorsementNumber} onChange={(e) => setForm((f) => ({ ...f, endorsementNumber: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <label style={css.label}>Issue Date</label>
              <input style={css.input} type="date" value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} />
            </div>
            {form.level !== 'Level 6' && (
              <>
                <div>
                  <label style={css.label}>Expiry Date</label>
                  <input style={{ ...css.input, opacity: form.noExpiry ? 0.4 : 1 }} type="date" value={form.expiryDate} disabled={form.noExpiry} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 24 }}>
                  <input type="checkbox" id="elpNoExpiry" checked={form.noExpiry} onChange={(e) => setForm((f) => ({ ...f, noExpiry: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <label htmlFor="elpNoExpiry" style={{ color: '#C0CDE0', fontSize: 13, cursor: 'pointer' }}>No expiry</label>
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', marginTop: 4 }}>
            <button style={css.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
            <button style={{ ...css.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={handleAdd} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RecurrentTrainingCard() {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    trainingType: 'CRM',
    provider: '',
    completionDate: '',
    expiryDate: '',
    remarks: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    profileApi.getRecurrent().then(({ data }) => setItems(data || [])).catch(() => setItems([]));
  }, []);

  const handleAdd = async () => {
    if (!form.completionDate) return alert('Please enter a completion date.');
    setSaving(true);
    try {
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
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this training record?')) return;
    await profileApi.deleteRecurrent(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div style={{ ...css.cardFull, marginBottom: 24 }}>
      <div style={css.cardHeader}>
        <RefreshCw size={22} color="#00B4D8" />
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
        const expiryWarningColor = days !== null && days < 0
          ? '#FF4757'
          : days !== null && days < 30
            ? '#FF4757'
            : days !== null && days < 90
              ? '#F0A500'
              : null;

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
                  <span style={{ color: expiryWarningColor || '#7A8CA0' }}>
                    {' · Exp '}{new Date(item.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
                {item.remarks && <span> · {item.remarks}</span>}
              </div>
            </div>
            <button style={css.deleteBtn} onClick={() => handleDelete(item.id)}><Trash2 size={15} /></button>
          </div>
        );
      })}

      {!showForm
        ? <button style={css.addBtn} onClick={() => setShowForm(true)}>+ Add recurrent training</button>
        : (
          <div style={{ marginTop: 14, background: '#0A2040', borderRadius: 10, padding: 16 }}>
            <div style={css.formRow}>
              <div>
                <label style={css.label}>Training Type</label>
                <select style={css.select} value={form.trainingType} onChange={(e) => setForm((f) => ({ ...f, trainingType: e.target.value }))}>
                  <SelectOptions options={RECURRENT_TYPES} />
                </select>
              </div>
              <div>
                <label style={css.label}>Provider</label>
                <input style={css.input} value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} placeholder="Training organisation" />
              </div>
              <div>
                <label style={css.label}>Completion Date</label>
                <input style={css.input} type="date" value={form.completionDate} onChange={(e) => setForm((f) => ({ ...f, completionDate: e.target.value }))} />
              </div>
              <div>
                <label style={css.label}>Expiry Date (optional)</label>
                <input style={css.input} type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={css.label}>Remarks</label>
              <input style={css.input} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} placeholder="Optional notes" />
            </div>
            <div style={{ display: 'flex' }}>
              <button style={css.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button style={{ ...css.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={handleAdd} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

function RightToWorkCard() {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    country: '',
    documentType: 'Passport',
    documentNumber: '',
    expiryDate: '',
    noExpiry: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    profileApi.getRTW().then(({ data }) => setItems(data || [])).catch(() => setItems([]));
  }, []);

  const handleAdd = async () => {
    if (!form.country.trim()) return alert('Please enter a country.');
    setSaving(true);
    try {
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
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this right-to-work document?')) return;
    await profileApi.deleteRTW(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div style={css.cardFull}>
      <div style={css.cardHeader}>
        <Globe size={22} color="#00B4D8" />
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
        const expiryWarningColor = days !== null && days < 0
          ? '#FF4757'
          : days !== null && days < 30
            ? '#FF4757'
            : days !== null && days < 90
              ? '#F0A500'
              : null;

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
                  ? <span style={{ color: '#2ECC71' }}> · No expiry</span>
                  : item.expiryDate && (
                    <span style={{ color: expiryWarningColor || '#7A8CA0' }}>
                      {' · Exp '}{new Date(item.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
              </div>
            </div>
            <button style={css.deleteBtn} onClick={() => handleDelete(item.id)}><Trash2 size={15} /></button>
          </div>
        );
      })}

      {!showForm
        ? <button style={css.addBtn} onClick={() => setShowForm(true)}>+ Add document</button>
        : (
          <div style={{ marginTop: 14, background: '#0A2040', borderRadius: 10, padding: 16 }}>
            <div style={css.formRow}>
              <div>
                <label style={css.label}>Country</label>
                <input style={css.input} value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder="e.g. United Arab Emirates" />
              </div>
              <div>
                <label style={css.label}>Document Type</label>
                <select style={css.select} value={form.documentType} onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value }))}>
                  <SelectOptions options={RTW_DOC_TYPES} />
                </select>
              </div>
              <div>
                <label style={css.label}>Document Number (optional)</label>
                <input style={css.input} value={form.documentNumber} onChange={(e) => setForm((f) => ({ ...f, documentNumber: e.target.value }))} placeholder="Optional" />
              </div>
              <div>
                <label style={css.label}>Expiry Date (optional)</label>
                <input
                  style={{ ...css.input, opacity: form.noExpiry ? 0.4 : 1 }}
                  type="date"
                  value={form.expiryDate}
                  disabled={form.noExpiry}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <input
                type="checkbox"
                id="noExpiry"
                checked={form.noExpiry}
                onChange={(e) => setForm((f) => ({ ...f, noExpiry: e.target.checked, expiryDate: e.target.checked ? '' : f.expiryDate }))}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="noExpiry" style={{ color: '#C0CDE0', fontSize: 13, cursor: 'pointer' }}>No expiry</label>
            </div>
            <div style={{ display: 'flex' }}>
              <button style={css.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button style={{ ...css.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={handleAdd} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

export default function Profile() {
  const pilot = useSelector((s) => s.auth.pilot);
  const [profile, setProfile] = useState(null);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [personalForm, setPersonalForm] = useState(null);

  useEffect(() => {
    Promise.all([
      profileApi.get(),
      profileApi.getTotals().catch(() => ({ data: null })),
    ]).then(([{ data: profileData }, { data: totalsData }]) => {
      setProfile(profileData);
      setTotals(totalsData);
      setPersonalForm({
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        phone: profileData.phone || '',
        country: profileData.country || '',
        city: profileData.city || '',
        education: profileData.education || '',
        willingToRelocate: profileData.willingToRelocate,
        isExaminer: profileData.isExaminer ?? false,
        isInstructor: profileData.isInstructor ?? false,
      });
      setLoading(false);
    });
  }, []);

  const savePersonal = async () => {
    await profileApi.update(personalForm);
    setProfile((p) => ({ ...p, ...personalForm }));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) return <div style={{ color: '#7A8CA0', textAlign: 'center', padding: 80 }}>Loading your profile...</div>;

  return (
    <div>
      {/* Flight Experience Totals */}
      <FlightTotalsCard totals={totals} />

      {/* Personal info */}
      <div style={css.cardFull}>
        <div style={css.cardHeader}>
          <User size={22} color="#00B4D8" />
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
                <div key={k}>
                  <label style={css.label}>{label}</label>
                  <input
                    style={css.input}
                    value={personalForm[k] || ''}
                    onChange={(e) => setPersonalForm((f) => ({ ...f, [k]: e.target.value }))}
                    placeholder={label}
                  />
                </div>
              ))}
              <div>
                <label style={css.label}>Education</label>
                <select
                  style={{ ...css.input, cursor: 'pointer' }}
                  value={personalForm.education || ''}
                  onChange={(e) => setPersonalForm((f) => ({ ...f, education: e.target.value || null }))}
                >
                  <option value="">Not specified</option>
                  <option value="high_school">High School / GED</option>
                  <option value="technical">Technical / Vocational</option>
                  <option value="bachelor">Bachelor's Degree</option>
                  <option value="masters">Master's Degree</option>
                  <option value="doctorate">Doctorate</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 24 }}>
                <input
                  type="checkbox" id="relocate"
                  checked={personalForm.willingToRelocate}
                  onChange={(e) => setPersonalForm((f) => ({ ...f, willingToRelocate: e.target.checked }))}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <label htmlFor="relocate" style={{ color: '#C0CDE0', fontSize: 14, cursor: 'pointer' }}>
                  Willing to relocate
                </label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 24 }}>
                <input
                  type="checkbox" id="isInstructor"
                  checked={personalForm.isInstructor}
                  onChange={(e) => setPersonalForm((f) => ({ ...f, isInstructor: e.target.checked }))}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <label htmlFor="isInstructor" style={{ color: '#C0CDE0', fontSize: 14, cursor: 'pointer' }}>
                  Flight instructor
                </label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 24 }}>
                <input
                  type="checkbox" id="isExaminer"
                  checked={personalForm.isExaminer}
                  onChange={(e) => setPersonalForm((f) => ({ ...f, isExaminer: e.target.checked }))}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <label htmlFor="isExaminer" style={{ color: '#C0CDE0', fontSize: 14, cursor: 'pointer' }}>
                  Examiner
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button style={css.saveBtn} onClick={savePersonal}>Save Changes</button>
              {saved && <span style={{ color: '#2ECC71', fontSize: 13, fontWeight: 600 }}>✓ Saved!</span>}
            </div>
          </>
        )}
      </div>

      {/* Licences and Medical in a two-column grid */}
      <div style={css.grid}>
        <LicencesCard profile={profile} setProfile={setProfile} />
        <MedicalCard profile={profile} setProfile={setProfile} />
      </div>

      {/* Type Ratings */}
      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <TypeRatingsCard profile={profile} setProfile={setProfile} />
      </div>

      {/* English Language Proficiency */}
      <EnglishProficiencyCard />

      {/* Recurrent Training */}
      <RecurrentTrainingCard />

      {/* Right to Work */}
      <RightToWorkCard />
    </div>
  );
}
