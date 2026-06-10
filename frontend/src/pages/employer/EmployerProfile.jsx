import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { employerApi } from '../../services/employerApi';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Input, Button, Badge } from '../../components/primitives';
import { useBodyBackground } from '../../hooks/useBodyBackground';

const COMPANY_TYPES = [['AIRLINE', 'Airline'], ['CHARTER', 'Charter'], ['CARGO', 'Cargo'], ['EMS', 'EMS / Air Ambulance'], ['FLIGHT_SCHOOL', 'Flight School'], ['CORPORATE', 'Corporate / Business Aviation'], ['RECRUITER', 'Recruiter / Agency'], ['OTHER', 'Other']];
const DESC_MAX = 5000;
const ACCT_STATUS_VARIANT = { APPROVED: 'success', PENDING: 'info', REJECTED: 'error', SUSPENDED: 'error' };

const css = {
  page: { minHeight: '100vh', background: 'var(--bg)', padding: '24px 0 64px', fontFamily: 'var(--font-body)' },
  wrap: { maxWidth: 640, margin: '0 auto', padding: '0 20px' },
  top: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  h1: { fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' },
  back: { color: 'var(--text-secondary)', fontSize: 14, textDecoration: 'none', cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'var(--font-body)' },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 },
  field: { marginBottom: 16 }, row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  hint: { color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 },
  label: { display: 'block', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, marginBottom: 6 },
  banner: { background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '12px 14px', color: '#991B1B', fontSize: 13, marginBottom: 18 },
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
  useBodyBackground('#F3F4F6');

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

  return (
    <div className="app-b2b" style={css.page}>
      <div style={css.wrap}>
        <div style={css.top}>
          <div style={css.h1}>Edit Profile</div>
          <button style={css.back} onClick={() => navigate('/employer/dashboard')}>← Back to dashboard</button>
        </div>

        <form onSubmit={handleSubmit} style={css.card} noValidate>
          {banner && <div style={css.banner}>{banner}</div>}

          <div style={css.field}><Input label="Company Name *" value={form.companyName} onChange={set('companyName')} error={errors.companyName} /></div>
          <div style={css.row2}>
            <div style={css.field}>
              <Input as="select" label="Company Type" value={form.companyType} onChange={set('companyType')}>{COMPANY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Input>
            </div>
            <div style={css.field}><Input label="Country *" value={form.country} onChange={set('country')} error={errors.country} /></div>
          </div>
          <div style={css.field}><Input label="Headquarters City" value={form.headquartersCity} onChange={set('headquartersCity')} /></div>
          <div style={css.field}><Input label="Website" value={form.website} onChange={set('website')} placeholder="https://example.com" error={errors.website} /></div>
          <div style={css.field}>
            <Input as="textarea" label="Description" value={form.description} onChange={set('description')} maxLength={DESC_MAX} error={errors.description} style={{ minHeight: 100 }} />
            <div style={css.hint}>{form.description.length}/{DESC_MAX}</div>
          </div>
          <div style={css.row2}>
            <div style={css.field}><Input label="IATA Code" value={form.iataCode} onChange={set('iataCode')} placeholder="optional" /></div>
            <div style={css.field}><Input label="ICAO Code" value={form.icaoCode} onChange={set('icaoCode')} placeholder="optional" /></div>
          </div>
          <div style={css.row2}>
            <div style={css.field}><Input label="Contact Name *" value={form.contactName} onChange={set('contactName')} error={errors.contactName} /></div>
            <div style={css.field}><Input label="Contact Phone" value={form.contactPhone} onChange={set('contactPhone')} /></div>
          </div>
          <div style={css.field}>
            <Input label="Logo URL" value={form.logoUrl} onChange={set('logoUrl')} placeholder="https://example.com/logo.png" error={errors.logoUrl} />
            <div style={css.hint}>Paste a hosted image URL (no file upload in v1).</div>
          </div>

          <div style={css.row2}>
            <div style={css.field}>
              <Input label="Contact Email (read-only)" value={employer.contactEmail} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              <div style={css.hint}>Changing email is a separate flow (out of scope).</div>
            </div>
            <div style={css.field}>
              <label style={css.label}>Status</label>
              <div style={{ paddingTop: 6 }}><Badge variant={ACCT_STATUS_VARIANT[employer.status] || 'neutral'}>{employer.status}</Badge></div>
            </div>
          </div>

          <Button type="submit" disabled={loading} style={{ width: '100%', marginTop: 8, padding: '14px', fontSize: 16 }}>{loading ? 'Saving…' : 'Save Profile'}</Button>
        </form>
      </div>
    </div>
  );
}
