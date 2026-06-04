import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { employerApi } from '../../services/employerApi';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';

const COMPANY_TYPES = [['AIRLINE', 'Airline'], ['CHARTER', 'Charter'], ['CARGO', 'Cargo'], ['EMS', 'EMS / Air Ambulance'], ['FLIGHT_SCHOOL', 'Flight School'], ['CORPORATE', 'Corporate / Business Aviation'], ['RECRUITER', 'Recruiter / Agency'], ['OTHER', 'Other']];
const DESC_MAX = 5000;

const css = {
  page: { minHeight: '100vh', background: '#0A1628', padding: '24px 0 64px' },
  wrap: { maxWidth: 640, margin: '0 auto', padding: '0 20px' },
  top: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  h1: { fontSize: 24, fontWeight: 800, color: '#fff' },
  back: { color: '#7A8CA0', fontSize: 14, textDecoration: 'none', cursor: 'pointer', background: 'none', border: 'none' },
  card: { background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 16, padding: 24 },
  label: { display: 'block', color: '#C0CDE0', fontSize: 13, fontWeight: 600, marginBottom: 7 },
  input: { width: '100%', background: '#1B2B4B', border: '1px solid #243050', borderRadius: 9, padding: '11px 13px', color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box' },
  inputRO: { opacity: 0.6, cursor: 'not-allowed' },
  textarea: { width: '100%', background: '#1B2B4B', border: '1px solid #243050', borderRadius: 9, padding: '11px 13px', color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box', minHeight: 100, resize: 'vertical', fontFamily: 'inherit' },
  field: { marginBottom: 16 }, row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  hint: { color: '#6B7A90', fontSize: 12, marginTop: 5 }, err: { color: '#FF6B6B', fontSize: 12, marginTop: 5 },
  badge: { display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, color: '#34D399', background: 'rgba(52,211,153,0.12)', border: '1px solid #34D39955' },
  btn: { background: 'linear-gradient(135deg, #00B4D8, #0077A8)', border: 'none', borderRadius: 10, padding: '14px', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', width: '100%', marginTop: 8 },
  banner: { background: '#2D1A1A', border: '1px solid #5C2626', borderRadius: 8, padding: '12px 14px', color: '#FF6B6B', fontSize: 13, marginBottom: 18 },
};

export default function EmployerProfile() {
  const { employer, refresh } = useEmployerAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [form, setForm] = useState(() => ({
    companyName: employer?.companyName || '', companyType: employer?.companyType || 'OTHER',
    country: employer?.country || '', headquartersCity: employer?.headquartersCity || '',
    website: employer?.website || '', description: employer?.description || '',
    iataCode: employer?.iataCode || '', icaoCode: employer?.icaoCode || '',
    contactName: employer?.contactName || '', contactPhone: employer?.contactPhone || '',
    logoUrl: employer?.logoUrl || '',
  }));
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);

  if (!employer) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.companyName.trim()) e.companyName = 'Company name is required';
    if (!form.country.trim()) e.country = 'Country is required';
    if (!form.contactName.trim()) e.contactName = 'Contact name is required';
    if (form.description.length > DESC_MAX) e.description = `Max ${DESC_MAX} characters`;
    for (const [k, lbl] of [['website', 'Website'], ['logoUrl', 'Logo URL']]) {
      if (form[k].trim()) { try { new URL(form[k].trim()); } catch { e[k] = `${lbl} must be a valid URL`; } }
    }
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBanner('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const payload = {
        companyName: form.companyName.trim(), companyType: form.companyType, country: form.country.trim(),
        headquartersCity: form.headquartersCity.trim() || null, website: form.website.trim() || null,
        description: form.description.trim() || null, iataCode: form.iataCode.trim() || null,
        icaoCode: form.icaoCode.trim() || null, contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim() || null, logoUrl: form.logoUrl.trim() || null,
      };
      await employerApi.updateMe(payload);
      await refresh();
      navigate('/employer/dashboard', { state: { toast: 'Profile updated!' } });
    } catch (err) {
      if (err.response?.status === 400 && Array.isArray(err.response?.data?.errors)) {
        const se = {}; for (const x of err.response.data.errors) if (x.path) se[x.path] = x.msg; setErrors(se);
      }
      setBanner(err.response?.data?.error || 'Could not save your profile. Please try again.');
    } finally { setLoading(false); }
  };

  const Err = ({ k }) => errors[k] ? <div style={css.err}>{errors[k]}</div> : null;

  return (
    <div style={css.page}>
      <div style={css.wrap}>
        <div style={css.top}>
          <div style={css.h1}>Edit Profile</div>
          <button style={css.back} onClick={() => navigate('/employer/dashboard')}>← Back to dashboard</button>
        </div>

        <form onSubmit={handleSubmit} style={css.card} noValidate>
          {banner && <div style={css.banner}>{banner}</div>}

          <div style={css.field}><label style={css.label}>Company Name *</label><input style={css.input} value={form.companyName} onChange={set('companyName')} /><Err k="companyName" /></div>
          <div style={css.row2}>
            <div style={css.field}><label style={css.label}>Company Type</label><select style={css.input} value={form.companyType} onChange={set('companyType')}>{COMPANY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div style={css.field}><label style={css.label}>Country *</label><input style={css.input} value={form.country} onChange={set('country')} /><Err k="country" /></div>
          </div>
          <div style={css.field}><label style={css.label}>Headquarters City</label><input style={css.input} value={form.headquartersCity} onChange={set('headquartersCity')} /></div>
          <div style={css.field}><label style={css.label}>Website</label><input style={css.input} value={form.website} onChange={set('website')} placeholder="https://example.com" /><Err k="website" /></div>
          <div style={css.field}><label style={css.label}>Description</label><textarea style={css.textarea} value={form.description} onChange={set('description')} maxLength={DESC_MAX} /><div style={css.hint}>{form.description.length}/{DESC_MAX}</div><Err k="description" /></div>
          <div style={css.row2}>
            <div style={css.field}><label style={css.label}>IATA Code</label><input style={css.input} value={form.iataCode} onChange={set('iataCode')} placeholder="optional" /></div>
            <div style={css.field}><label style={css.label}>ICAO Code</label><input style={css.input} value={form.icaoCode} onChange={set('icaoCode')} placeholder="optional" /></div>
          </div>
          <div style={css.row2}>
            <div style={css.field}><label style={css.label}>Contact Name *</label><input style={css.input} value={form.contactName} onChange={set('contactName')} /><Err k="contactName" /></div>
            <div style={css.field}><label style={css.label}>Contact Phone</label><input style={css.input} value={form.contactPhone} onChange={set('contactPhone')} /></div>
          </div>
          <div style={css.field}>
            <label style={css.label}>Logo URL</label>
            <input style={css.input} value={form.logoUrl} onChange={set('logoUrl')} placeholder="https://example.com/logo.png" />
            <div style={css.hint}>Paste a hosted image URL (no file upload in v1).</div>
            <Err k="logoUrl" />
          </div>

          <div style={css.row2}>
            <div style={css.field}><label style={css.label}>Contact Email (read-only)</label><input style={{ ...css.input, ...css.inputRO }} value={employer.contactEmail} disabled /><div style={css.hint}>Changing email is a separate flow (out of scope).</div></div>
            <div style={css.field}><label style={css.label}>Status</label><div style={{ paddingTop: 6 }}><span style={css.badge}>{employer.status}</span></div></div>
          </div>

          <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>{loading ? 'Saving…' : 'Save Profile'}</button>
        </form>
      </div>
    </div>
  );
}
