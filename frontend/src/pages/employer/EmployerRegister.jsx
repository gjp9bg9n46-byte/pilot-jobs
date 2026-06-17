import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useBodyBackground } from '../../hooks/useBodyBackground';
import { Card, Input } from '../../components/primitives';

const COMPANY_TYPES = [['AIRLINE', 'Airline'], ['CHARTER', 'Charter'], ['CARGO', 'Cargo'], ['EMS', 'EMS / Air Ambulance'], ['FLIGHT_SCHOOL', 'Flight School'], ['CORPORATE', 'Corporate / Business Aviation'], ['RECRUITER', 'Recruiter / Agency'], ['OTHER', 'Other']];
const DEST_FOR = { PENDING: '/employer/pending-approval', APPROVED: '/employer/dashboard', REJECTED: '/employer/rejected', SUSPENDED: '/employer/suspended' };
const DESC_MAX = 5000;
const EMP_INIT = { companyName: '', companyType: '', country: '', headquartersCity: '', website: '', description: '', contactName: '', contactEmail: '', contactPhone: '', password: '', confirmPassword: '' };

const css = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, fontFamily: 'var(--font-body)' },
  logo: { fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.2px', marginBottom: 6 },
  subtitle: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24, lineHeight: 1.5 },
  grid: { display: 'grid', gap: 16 },
  hint: { color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 },
  btn: { width: '100%', background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '15px', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 500, cursor: 'pointer', marginTop: 20 },
  error: { background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '12px 14px', color: '#991B1B', fontSize: 13, marginBottom: 20 },
  footer: { textAlign: 'center', marginTop: 24, color: 'var(--text-secondary)', fontSize: 14 },
  pilotFooter: { textAlign: 'center', marginTop: 14, color: 'var(--text-secondary)', fontSize: 13 },
  link: { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' },
  reqMark: { color: 'var(--accent)', marginLeft: 2 },
};

export default function EmployerRegister() {
  const { register, isAuthenticated, status, loading: authLoading } = useEmployerAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  useBodyBackground('#F3F4F6');

  const [form, setForm] = useState(EMP_INIT);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already-authenticated employer → forward away from the registration form.
  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(DEST_FOR[status] || '/employer/pending-approval', { replace: true });
  }, [authLoading, isAuthenticated, status, navigate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.companyName.trim()) e.companyName = 'Company name is required';
    if (!form.companyType) e.companyType = 'Select a company type';
    if (!form.country.trim()) e.country = 'Country is required';
    if (form.website.trim()) { try { new URL(form.website.trim()); } catch { e.website = 'Enter a valid URL (including https://)'; } }
    if (form.description.length > DESC_MAX) e.description = `Description must be ${DESC_MAX} characters or fewer`;
    if (!form.contactName.trim()) e.contactName = 'Contact name is required';
    if (!form.contactEmail.trim()) e.contactEmail = 'Contact email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) e.contactEmail = 'Enter a valid email address';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters';
    if (form.confirmPassword !== form.password) e.confirmPassword = "Passwords don't match";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const payload = { companyName: form.companyName.trim(), companyType: form.companyType, country: form.country.trim(), contactName: form.contactName.trim(), contactEmail: form.contactEmail.trim(), password: form.password };
      if (form.headquartersCity.trim()) payload.headquartersCity = form.headquartersCity.trim();
      if (form.website.trim()) payload.website = form.website.trim();
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.contactPhone.trim()) payload.contactPhone = form.contactPhone.trim();
      await register(payload);
      navigate('/employer/pending-approval');
    } catch (err) {
      if (!err.response) { setError("Couldn't reach the server — check your connection and try again."); return; }
      const s = err.response?.status;
      if (s === 409) setError('An employer account already exists for this email. Try logging in.');
      else if (s === 400 && Array.isArray(err.response?.data?.errors)) {
        const se = {}; for (const x of err.response.data.errors) if (x.path) se[x.path] = x.msg || 'Invalid value';
        setFieldErrors(se); setError('Please correct the highlighted fields.');
      } else setError(err.response?.data?.error || 'Could not create your account. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="app-b2b" style={css.page}>
      <Card style={{ maxWidth: 480, width: '100%', margin: '24px 0', padding: isMobile ? '32px 20px' : '40px 36px', borderRadius: 12 }}>
        <div style={css.logo}>Employer registration</div>
        <div style={css.subtitle}>For airlines and recruiters — post pilot jobs directly to our pilot-facing Jobs page.</div>

        {error && <div style={css.error} role="alert">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input label={<>Company Name<span style={css.reqMark}>*</span></>} autoComplete="organization" aria-label="Company Name" autoFocus value={form.companyName} onChange={set('companyName')} placeholder="e.g. Skyline Charter" error={fieldErrors.companyName} />
            <Input as="select" label={<>Company Type<span style={css.reqMark}>*</span></>} aria-label="Company Type" value={form.companyType} onChange={set('companyType')} error={fieldErrors.companyType}>
              <option value="">Select a type…</option>
              {COMPANY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Input>
            <div style={{ ...css.grid, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <Input label={<>Country<span style={css.reqMark}>*</span></>} autoComplete="country-name" aria-label="Country" value={form.country} onChange={set('country')} placeholder="e.g. Portugal" error={fieldErrors.country} />
              <Input label="Headquarters City" autoComplete="address-level2" aria-label="Headquarters City" value={form.headquartersCity} onChange={set('headquartersCity')} placeholder="e.g. Lisbon" />
            </div>
            <Input label="Website" autoComplete="url" aria-label="Website" value={form.website} onChange={set('website')} placeholder="https://example.com" error={fieldErrors.website} />
            <div>
              <Input as="textarea" rows={3} label="Description" aria-label="Description" value={form.description} onChange={set('description')} maxLength={DESC_MAX} placeholder="Tell pilots about your operation (optional)." error={fieldErrors.description} />
              <div style={css.hint}>{form.description.length}/{DESC_MAX}</div>
            </div>
            <Input label={<>Contact Name<span style={css.reqMark}>*</span></>} autoComplete="name" aria-label="Contact Name" value={form.contactName} onChange={set('contactName')} placeholder="Your full name" error={fieldErrors.contactName} />
            <Input label={<>Contact Email<span style={css.reqMark}>*</span></>} type="email" autoComplete="email" aria-label="Contact Email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="you@company.com" error={fieldErrors.contactEmail} />
            <Input label="Contact Phone" autoComplete="tel" aria-label="Contact Phone" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+1 555 0100" />
            <div style={{ ...css.grid, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <Input label={<>Password<span style={css.reqMark}>*</span></>} type="password" autoComplete="new-password" aria-label="Password" value={form.password} onChange={set('password')} placeholder="••••••••" error={fieldErrors.password} />
              <Input label={<>Confirm Password<span style={css.reqMark}>*</span></>} type="password" autoComplete="new-password" aria-label="Confirm Password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="••••••••" error={fieldErrors.confirmPassword} />
            </div>
          </div>

          <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Creating account…' : 'Create Employer Account →'}
          </button>
        </form>

        <div style={css.footer}>
          Already have an account?{' '}
          <Link to="/employer/login" style={css.link}>Sign in →</Link>
        </div>
        <div style={css.pilotFooter}>
          Are you a pilot?{' '}
          <Link to="/register" style={css.link}>Register here →</Link>
        </div>
      </Card>
    </div>
  );
}
