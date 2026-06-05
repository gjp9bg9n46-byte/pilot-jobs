import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { authApi } from '../../services/api';
import { setAuth } from '../../store';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';

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
  page: { minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24 },
  card: { background: '#0D1E35', borderRadius: 20, width: '100%', maxWidth: 520, border: '1px solid #1E3050', margin: '24px 0' },
  logo: { fontSize: 28, fontWeight: 800, color: '#00B4D8', marginBottom: 6 },
  subtitle: { color: '#7A8CA0', fontSize: 14, marginBottom: 24, lineHeight: 1.5 },
  toggle: { display: 'flex', background: '#0A1729', border: '1px solid #243050', borderRadius: 12, padding: 4, marginBottom: 24 },
  seg: (on) => ({ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 700, border: 'none', background: on ? '#1B2B4B' : 'transparent', color: on ? '#00B4D8' : '#7A8CA0' }),
  grid: { display: 'grid', gap: 16 },
  full: { gridColumn: '1 / -1' },
  label: { display: 'block', color: '#C0CDE0', fontSize: 13, fontWeight: 600, marginBottom: 8 },
  input: { width: '100%', background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10, padding: '13px 14px', color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box' },
  textarea: { width: '100%', background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10, padding: '13px 14px', color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box', minHeight: 84, resize: 'vertical', fontFamily: 'inherit' },
  field: { marginBottom: 16 },
  hint: { color: '#6B7A90', fontSize: 12, marginTop: 6 },
  fieldErr: { color: '#FF6B6B', fontSize: 12, marginTop: 6 },
  btn: { width: '100%', background: 'linear-gradient(135deg, #00B4D8, #0077A8)', border: 'none', borderRadius: 10, padding: '15px', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8 },
  error: { background: '#2D1A1A', border: '1px solid #5C2626', borderRadius: 8, padding: '12px 14px', color: '#FF6B6B', fontSize: 13, marginBottom: 20 },
  footer: { textAlign: 'center', marginTop: 24, color: '#7A8CA0', fontSize: 14 },
  link: { color: '#00B4D8', fontWeight: 600, textDecoration: 'none' },
  required: { color: '#00B4D8', marginLeft: 2 },
};

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

  const Err = ({ name }) => fieldErrors[name] ? <div style={css.fieldErr}>{fieldErrors[name]}</div> : null;

  return (
    <div style={css.page}>
      <div style={{ ...css.card, padding: isMobile ? '32px 20px' : '40px 40px' }}>
        <div style={css.logo}>✈ CockpitHire</div>
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
                <div key={name} style={{ ...(isMobile || full || !half ? css.full : {}), ...css.field }}>
                  <label style={css.label}>{label}{required && <span style={css.required}> *</span>}{hint && <span style={{ color: '#4A6080', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>{hint}</span>}</label>
                  <input style={css.input} type={type} value={form[name]} onChange={set(name)} placeholder={label.replace(' (optional)', '')} />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div style={css.field}><label style={css.label}>Company Name *</label><input style={css.input} value={form.companyName} onChange={set('companyName')} placeholder="e.g. Skyline Charter" /><Err name="companyName" /></div>
              <div style={css.field}><label style={css.label}>Company Type *</label><select style={css.input} value={form.companyType} onChange={set('companyType')}><option value="">Select a type…</option>{COMPANY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><Err name="companyType" /></div>
              <div style={{ ...css.grid, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                <div style={css.field}><label style={css.label}>Country *</label><input style={css.input} value={form.country} onChange={set('country')} placeholder="e.g. Portugal" /><Err name="country" /></div>
                <div style={css.field}><label style={css.label}>Headquarters City</label><input style={css.input} value={form.headquartersCity} onChange={set('headquartersCity')} placeholder="e.g. Lisbon" /></div>
              </div>
              <div style={css.field}><label style={css.label}>Website</label><input style={css.input} value={form.website} onChange={set('website')} placeholder="https://example.com" /><Err name="website" /></div>
              <div style={css.field}><label style={css.label}>Description</label><textarea style={css.textarea} value={form.description} onChange={set('description')} maxLength={DESC_MAX} placeholder="Tell pilots about your operation (optional)." /><div style={css.hint}>{form.description.length}/{DESC_MAX}</div><Err name="description" /></div>
              <div style={css.field}><label style={css.label}>Contact Name *</label><input style={css.input} value={form.contactName} onChange={set('contactName')} placeholder="Your full name" /><Err name="contactName" /></div>
              <div style={css.field}><label style={css.label}>Contact Email *</label><input style={css.input} type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="you@company.com" /><Err name="contactEmail" /></div>
              <div style={css.field}><label style={css.label}>Contact Phone</label><input style={css.input} value={form.contactPhone} onChange={set('contactPhone')} placeholder="+1 555 0100" /></div>
              <div style={{ ...css.grid, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                <div style={css.field}><label style={css.label}>Password *</label><input style={css.input} type="password" value={form.password} onChange={set('password')} placeholder="••••••••" /><Err name="password" /></div>
                <div style={css.field}><label style={css.label}>Confirm Password *</label><input style={css.input} type="password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="••••••••" /><Err name="confirmPassword" /></div>
              </div>
            </>
          )}

          <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Creating account…' : (mode === 'employer' ? 'Create Employer Account →' : 'Create Account →')}
          </button>
        </form>

        <div style={css.footer}>
          Already have an account?{' '}
          <Link to={mode === 'employer' ? '/login?as=employer' : '/login'} style={css.link}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
