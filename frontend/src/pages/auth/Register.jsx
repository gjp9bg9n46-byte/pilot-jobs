import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { authApi } from '../../services/api';
import { setAuth } from '../../store';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Card, Input } from '../../components/primitives';

const DEST_FOR = { PENDING: '/employer/pending-approval', APPROVED: '/employer/dashboard', REJECTED: '/employer/rejected', SUSPENDED: '/employer/suspended' };

const PILOT_FIELDS = [
  { name: 'firstName', label: 'First Name', required: true, half: true },
  { name: 'lastName', label: 'Last Name', half: true },
  { name: 'email', label: 'Email Address', type: 'email', required: true, full: true },
  { name: 'password', label: 'Password', type: 'password', required: true, hint: 'Min. 8 characters', full: true },
  { name: 'country', label: 'Country', half: true },
  { name: 'city', label: 'City', half: true },
  { name: 'phone', label: 'Phone (optional)', type: 'tel', half: true },
];
const PILOT_INIT = { firstName: '', lastName: '', email: '', password: '', country: '', city: '', phone: '' };

const COMPANY_TYPES = [['AIRLINE', 'Airline'], ['CHARTER', 'Charter'], ['CARGO', 'Cargo'], ['EMS', 'EMS / Air Ambulance'], ['FLIGHT_SCHOOL', 'Flight School'], ['CORPORATE', 'Corporate / Business Aviation'], ['RECRUITER', 'Recruiter / Agency'], ['OTHER', 'Other']];
const EMP_INIT = { companyName: '', companyType: '', country: '', headquartersCity: '', website: '', description: '', contactName: '', contactEmail: '', contactPhone: '', password: '', confirmPassword: '' };
const DESC_MAX = 5000;

const css = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24 },
  logo: { fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  subtitle: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24, lineHeight: 1.5 },
  toggle: { display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, marginBottom: 24 },
  seg: (on) => ({ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600, border: 'none', background: on ? 'rgba(0,63,136,0.08)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-secondary)', transition: 'background 0.15s, color 0.15s' }),
  grid: { display: 'grid', gap: 16 },
  full: { gridColumn: '1 / -1' },
  hint: { color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 },
  btn: { width: '100%', background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '15px', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 500, cursor: 'pointer', marginTop: 20 },
  error: { background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '12px 14px', color: '#991B1B', fontSize: 13, marginBottom: 20 },
  footer: { textAlign: 'center', marginTop: 24, color: 'var(--text-secondary)', fontSize: 14 },
  link: { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' },
  reqMark: { color: 'var(--accent)', marginLeft: 2 },
};

const PlaneMark = () => (
  <svg width="22" height="22" viewBox="0 0 18 18" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--accent)' }}>
    <path d="M16 9H3.5M10 4L16 9l-6 5M7 6L2 9l5 3" />
  </svg>
);

export default function Register() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const mode = params.get('as') === 'employer' ? 'employer' : 'pilot';

  const pilotToken = useSelector((s) => s.auth.token);
  const { register: employerRegister, isAuthenticated: empAuthed, status: empStatus, loading: empLoading } = useEmployerAuth();

  const [form, setForm] = useState(mode === 'employer' ? EMP_INIT : PILOT_INIT);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Standalone light page: paint body warm; restore to dark default on unmount
  // (see primitives/README.md → body-bg pattern).
  useEffect(() => {
    document.body.style.background = '#F8F6F1';
    return () => { document.body.style.background = '#0A1628'; };
  }, []);

  useEffect(() => {
    if (pilotToken) { navigate('/jobs', { replace: true }); return; }
    if (!empLoading && empAuthed) navigate(DEST_FOR[empStatus] || '/employer/pending-approval', { replace: true });
  }, [pilotToken, empLoading, empAuthed, empStatus, navigate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Switching modes clears the form (different field sets / intent).
  const switchMode = (m) => {
    if (m === mode) return;
    setForm(m === 'employer' ? EMP_INIT : PILOT_INIT);
    setFieldErrors({}); setError('');
    setParams(m === 'employer' ? { as: 'employer' } : {}, { replace: true });
  };

  const submitPilot = async () => {
    if (!form.firstName || !form.email || !form.password) { setError('Please fill in all required fields.'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const { data } = await authApi.register(form);
      dispatch(setAuth({ token: data.token, pilot: data.pilot }));
      navigate('/profile');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create account. Try again.');
    } finally { setLoading(false); }
  };

  const validateEmployer = () => {
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

  const submitEmployer = async () => {
    const errs = validateEmployer();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const payload = { companyName: form.companyName.trim(), companyType: form.companyType, country: form.country.trim(), contactName: form.contactName.trim(), contactEmail: form.contactEmail.trim(), password: form.password };
      if (form.headquartersCity.trim()) payload.headquartersCity = form.headquartersCity.trim();
      if (form.website.trim()) payload.website = form.website.trim();
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.contactPhone.trim()) payload.contactPhone = form.contactPhone.trim();
      await employerRegister(payload);
      navigate('/employer/pending-approval');
    } catch (err) {
      const status = err.response?.status;
      if (status === 409) setError('An employer account already exists for this email. Try logging in.');
      else if (status === 400 && Array.isArray(err.response?.data?.errors)) {
        const se = {}; for (const x of err.response.data.errors) if (x.path) se[x.path] = x.msg || 'Invalid value';
        setFieldErrors(se); setError('Please correct the highlighted fields.');
      } else setError(err.response?.data?.error || 'Could not create your account. Please try again.');
    } finally { setLoading(false); }
  };

  const handleSubmit = (e) => { e.preventDefault(); setError(''); mode === 'employer' ? submitEmployer() : submitPilot(); };

  return (
    <div className="app-light" style={css.page}>
      <Card style={{ maxWidth: 480, width: '100%', margin: '24px 0', padding: isMobile ? '32px 20px' : '40px 36px', borderRadius: 12 }}>
        <div style={css.logo}><PlaneMark /> CockpitHire</div>
        <div style={css.subtitle}>{mode === 'employer' ? 'Post pilot jobs directly to our pilot-facing Jobs page.' : "Create your free account — you'll add your pilot details after sign-up."}</div>

        <div style={css.toggle}>
          <button type="button" style={css.seg(mode === 'pilot')} onClick={() => switchMode('pilot')}>Pilot</button>
          <button type="button" style={css.seg(mode === 'employer')} onClick={() => switchMode('employer')}>Employer</button>
        </div>

        {error && <div style={css.error}>{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          {mode === 'pilot' ? (
            <div style={{ ...css.grid, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              {PILOT_FIELDS.map(({ name, label, type = 'text', required, half, full, hint }) => (
                <div key={name} style={(isMobile || full || !half) ? css.full : undefined}>
                  <Input
                    type={type}
                    value={form[name]}
                    onChange={set(name)}
                    placeholder={label.replace(' (optional)', '')}
                    label={<>{label}{required && <span style={css.reqMark}>*</span>}{hint && <span style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>{hint}</span>}</>}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input label={<>Company Name<span style={css.reqMark}>*</span></>} value={form.companyName} onChange={set('companyName')} placeholder="e.g. Skyline Charter" error={fieldErrors.companyName} />
              <Input as="select" label={<>Company Type<span style={css.reqMark}>*</span></>} value={form.companyType} onChange={set('companyType')} error={fieldErrors.companyType}>
                <option value="">Select a type…</option>
                {COMPANY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Input>
              <div style={{ ...css.grid, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                <Input label={<>Country<span style={css.reqMark}>*</span></>} value={form.country} onChange={set('country')} placeholder="e.g. Portugal" error={fieldErrors.country} />
                <Input label="Headquarters City" value={form.headquartersCity} onChange={set('headquartersCity')} placeholder="e.g. Lisbon" />
              </div>
              <Input label="Website" value={form.website} onChange={set('website')} placeholder="https://example.com" error={fieldErrors.website} />
              <div>
                <Input as="textarea" rows={3} label="Description" value={form.description} onChange={set('description')} maxLength={DESC_MAX} placeholder="Tell pilots about your operation (optional)." error={fieldErrors.description} />
                <div style={css.hint}>{form.description.length}/{DESC_MAX}</div>
              </div>
              <Input label={<>Contact Name<span style={css.reqMark}>*</span></>} value={form.contactName} onChange={set('contactName')} placeholder="Your full name" error={fieldErrors.contactName} />
              <Input label={<>Contact Email<span style={css.reqMark}>*</span></>} type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="you@company.com" error={fieldErrors.contactEmail} />
              <Input label="Contact Phone" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+1 555 0100" />
              <div style={{ ...css.grid, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                <Input label={<>Password<span style={css.reqMark}>*</span></>} type="password" value={form.password} onChange={set('password')} placeholder="••••••••" error={fieldErrors.password} />
                <Input label={<>Confirm Password<span style={css.reqMark}>*</span></>} type="password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="••••••••" error={fieldErrors.confirmPassword} />
              </div>
            </div>
          )}

          <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Creating account…' : (mode === 'employer' ? 'Create Employer Account →' : 'Create Account →')}
          </button>
        </form>

        <div style={css.footer}>
          Already have an account?{' '}
          <Link to={mode === 'employer' ? '/login?as=employer' : '/login'} style={css.link}>Sign in</Link>
        </div>
      </Card>
    </div>
  );
}
