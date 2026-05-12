import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { profileApi } from '../services/api';

const LICENCE_TYPES = [
  { value: 'ATP',  label: 'ATPL — Airline Transport Pilot' },
  { value: 'CPL',  label: 'CPL — Commercial Pilot' },
  { value: 'MPL',  label: 'MPL — Multi-crew Pilot' },
  { value: 'PPL',  label: 'PPL — Private Pilot' },
  { value: 'IR',   label: 'IR — Instrument Rating' },
  { value: 'ME',   label: 'ME — Multi-Engine Rating' },
];

const AUTHORITIES = [
  { value: 'FAA',    flag: '🇺🇸', label: 'FAA — United States' },
  { value: 'EASA',   flag: '🇪🇺', label: 'EASA — Europe' },
  { value: 'GCAA',   flag: '🇦🇪', label: 'GCAA — UAE' },
  { value: 'CAAC',   flag: '🇨🇳', label: 'CAAC — China' },
  { value: 'DGCA',   flag: '🇮🇳', label: 'DGCA — India' },
  { value: 'CASA',   flag: '🇦🇺', label: 'CASA — Australia' },
  { value: 'CAA_UK', flag: '🇬🇧', label: 'CAA — United Kingdom' },
  { value: 'TCCA',   flag: '🇨🇦', label: 'TCCA — Canada' },
  { value: 'ANAC',   flag: '🇧🇷', label: 'ANAC — Brazil' },
  { value: 'JCAB',   flag: '🇯🇵', label: 'JCAB — Japan' },
];

const MEDICAL_CLASSES = [
  { value: 'CLASS_1', label: 'Class 1 — Airline pilots' },
  { value: 'CLASS_2', label: 'Class 2 — Commercial pilots' },
  { value: 'CLASS_3', label: 'Class 3 — Private pilots' },
];

const css = {
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' },
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
  deleteBtn: { background: 'none', border: 'none', color: '#FF4757', cursor: 'pointer', fontSize: 15, padding: 4 },
  addBtn: {
    background: 'transparent', border: '1px dashed #243050', borderRadius: 8,
    padding: '10px 0', width: '100%', color: '#00B4D8', fontWeight: 600,
    fontSize: 13, cursor: 'pointer', marginTop: 14, transition: 'border-color 0.15s',
  },
  emptyNote: { color: '#4A6080', fontSize: 13, fontStyle: 'italic', marginBottom: 6 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#7A8CA0', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    width: '100%', background: '#1B2B4B', border: '1px solid #243050',
    borderRadius: 8, padding: '11px 12px', color: '#fff', fontSize: 14, outline: 'none',
  },
  select: {
    width: '100%', background: '#1B2B4B', border: '1px solid #243050',
    borderRadius: 8, padding: '11px 12px', color: '#fff', fontSize: 14, outline: 'none', cursor: 'pointer',
  },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 },
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

function SelectOptions({ options }) {
  return options.map((o) => <option key={o.value} value={o.value}>{o.flag ? `${o.flag} ${o.label}` : o.label}</option>);
}

function LicencesCard({ profile, setProfile }) {
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('ATP');
  const [authority, setAuthority] = useState('FAA');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    setSaving(true);
    try {
      const { data } = await profileApi.addCertificate({ type, issuingAuthority: authority });
      setProfile((p) => ({ ...p, certificates: [...(p.certificates || []), data] }));
      setShowForm(false);
    } finally { setSaving(false); }
  };

  return (
    <div style={css.card}>
      <div style={css.cardHeader}>
        <span style={css.cardIcon}>📋</span>
        <div>
          <div style={css.cardTitle}>My Pilot Licences</div>
          <div style={css.cardSubtitle}>Add every licence you hold</div>
        </div>
      </div>

      {(!profile?.certificates?.length) && <div style={css.emptyNote}>No licences added yet.</div>}

      {profile?.certificates?.map((cert) => {
        const lic = LICENCE_TYPES.find((l) => l.value === cert.type);
        const auth = AUTHORITIES.find((a) => a.value === cert.issuingAuthority);
        return (
          <div key={cert.id} style={css.item}>
            <div>
              <div style={css.itemTitle}>{lic?.label || cert.type}</div>
              <div style={css.itemSub}>{auth?.flag} {auth?.label || cert.issuingAuthority}</div>
            </div>
            <button style={css.deleteBtn} onClick={async () => {
              if (!window.confirm('Remove this licence?')) return;
              await profileApi.deleteCertificate(cert.id);
              setProfile((p) => ({ ...p, certificates: p.certificates.filter((c) => c.id !== cert.id) }));
            }}>🗑</button>
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
                <select style={css.select} value={type} onChange={(e) => setType(e.target.value)}>
                  <SelectOptions options={LICENCE_TYPES} />
                </select>
              </div>
              <div>
                <label style={css.label}>Issuing authority</label>
                <select style={css.select} value={authority} onChange={(e) => setAuthority(e.target.value)}>
                  <SelectOptions options={AUTHORITIES} />
                </select>
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
  const [form, setForm] = useState({ medicalClass: 'CLASS_1', issuingAuthority: 'FAA', issueDate: '', expiryDate: '' });
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
        <span style={css.cardIcon}>💊</span>
        <div>
          <div style={css.cardTitle}>Medical Certificate</div>
          <div style={css.cardSubtitle}>Required by most airlines</div>
        </div>
      </div>

      {(!profile?.medicals?.length) && <div style={css.emptyNote}>No medical certificate added.</div>}

      {profile?.medicals?.map((med) => {
        const mc = MEDICAL_CLASSES.find((m) => m.value === med.medicalClass);
        const auth = AUTHORITIES.find((a) => a.value === med.issuingAuthority);
        const expiry = new Date(med.expiryDate);
        const expired = expiry < new Date();
        return (
          <div key={med.id} style={css.item}>
            <div>
              <div style={css.itemTitle}>{mc?.label || med.medicalClass}</div>
              <div style={css.itemSub}>
                {auth?.flag} {auth?.label}  ·{' '}
                <span style={{ color: expired ? '#FF4757' : '#2ECC71' }}>
                  {expired ? '⚠ Expired' : 'Valid until'} {expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
            <button style={css.deleteBtn} onClick={async () => {
              if (!window.confirm('Remove this medical?')) return;
              await profileApi.deleteMedical(med.id);
              setProfile((p) => ({ ...p, medicals: p.medicals.filter((m) => m.id !== med.id) }));
            }}>🗑</button>
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
                <label style={css.label}>Issued by</label>
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
  const [authority, setAuthority] = useState('FAA');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!aircraftType.trim()) return alert('Please enter an aircraft type.');
    setSaving(true);
    try {
      const { data } = await profileApi.addRating({ aircraftType: aircraftType.toUpperCase(), issuingAuthority: authority, category: 'Multi-Engine' });
      setProfile((p) => ({ ...p, ratings: [...(p.ratings || []), data] }));
      setShowForm(false);
      setAircraftType('');
    } finally { setSaving(false); }
  };

  return (
    <div style={css.card}>
      <div style={css.cardHeader}>
        <span style={css.cardIcon}>✈</span>
        <div>
          <div style={css.cardTitle}>Aircraft Type Ratings</div>
          <div style={css.cardSubtitle}>Aircraft you are rated to fly</div>
        </div>
      </div>

      {(!profile?.ratings?.length) && <div style={css.emptyNote}>No type ratings added.</div>}

      {profile?.ratings?.map((r) => {
        const auth = AUTHORITIES.find((a) => a.value === r.issuingAuthority);
        return (
          <div key={r.id} style={css.item}>
            <div>
              <div style={css.itemTitle}>{r.aircraftType}</div>
              <div style={css.itemSub}>{auth?.flag} {auth?.label || r.issuingAuthority}</div>
            </div>
            <button style={css.deleteBtn} onClick={async () => {
              if (!window.confirm('Remove this type rating?')) return;
              await profileApi.deleteRating(r.id);
              setProfile((p) => ({ ...p, ratings: p.ratings.filter((rt) => rt.id !== r.id) }));
            }}>🗑</button>
          </div>
        );
      })}

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
                <label style={css.label}>Issued by</label>
                <select style={css.select} value={authority} onChange={(e) => setAuthority(e.target.value)}>
                  <SelectOptions options={AUTHORITIES} />
                </select>
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

export default function Profile() {
  const pilot = useSelector((s) => s.auth.pilot);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [personalForm, setPersonalForm] = useState(null);

  useEffect(() => {
    profileApi.get().then(({ data }) => {
      setProfile(data);
      setPersonalForm({ firstName: data.firstName, lastName: data.lastName, phone: data.phone || '', country: data.country || '', city: data.city || '', willingToRelocate: data.willingToRelocate, hoursOnType: data.hoursOnType ?? 0, isExaminer: data.isExaminer ?? false, isInstructor: data.isInstructor ?? false });
      setLoading(false);
    });
  }, []);

  const savePersonal = async () => {
    if (personalForm.hoursOnType === '' || Number(personalForm.hoursOnType) < 0) return;
    await profileApi.update({ ...personalForm, hoursOnType: Number(personalForm.hoursOnType) });
    setProfile((p) => ({ ...p, ...personalForm }));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) return <div style={{ color: '#7A8CA0', textAlign: 'center', padding: 80 }}>Loading your profile...</div>;

  return (
    <div>
      {/* Personal info */}
      <div style={css.cardFull}>
        <div style={css.cardHeader}>
          <span style={css.cardIcon}>👤</span>
          <div>
            <div style={css.cardTitle}>Personal Information</div>
            <div style={css.cardSubtitle}>Basic details on your account</div>
          </div>
        </div>

        {personalForm && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
              {[
                { k: 'firstName', label: 'First Name' },
                { k: 'lastName', label: 'Last Name' },
                { k: 'phone', label: 'Phone' },
                { k: 'country', label: 'Country' },
                { k: 'city', label: 'City' },
              ].map(({ k, label }) => (
                <div key={k}>
                  <label style={css.label}>{label}</label>
                  <input
                    style={css.input} value={personalForm[k] || ''}
                    onChange={(e) => setPersonalForm((f) => ({ ...f, [k]: e.target.value }))}
                    placeholder={label}
                  />
                </div>
              ))}
              <div>
                <label style={css.label}>Hours on Type <span style={{ color: '#00B4D8' }}>*</span></label>
                <input
                  style={{
                    ...css.input,
                    borderColor: (personalForm.hoursOnType === '' || Number(personalForm.hoursOnType) < 0)
                      ? '#5C2626'
                      : '#243050',
                  }}
                  type="number"
                  min="0"
                  step="0.1"
                  value={personalForm.hoursOnType}
                  onChange={(e) => setPersonalForm((f) => ({ ...f, hoursOnType: e.target.value }))}
                  placeholder="0.0"
                />
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

      {/* Three cards in a grid */}
      <div style={css.grid}>
        <LicencesCard profile={profile} setProfile={setProfile} />
        <MedicalCard profile={profile} setProfile={setProfile} />
      </div>

      <div style={{ marginTop: 24 }}>
        <TypeRatingsCard profile={profile} setProfile={setProfile} />
      </div>
    </div>
  );
}
