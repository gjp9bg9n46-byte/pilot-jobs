import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';

const COMPANY_TYPES = [
  ['AIRLINE', 'Airline'],
  ['CHARTER', 'Charter'],
  ['CARGO', 'Cargo'],
  ['EMS', 'EMS / Air Ambulance'],
  ['FLIGHT_SCHOOL', 'Flight School'],
  ['CORPORATE', 'Corporate / Business Aviation'],
  ['RECRUITER', 'Recruiter / Agency'],
  ['OTHER', 'Other'],
];

const css = {
  page: { minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24 },
  card: { background: '#0D1E35', borderRadius: 20, padding: '48px 40px', width: '100%', maxWidth: 520, border: '1px solid #1E3050', margin: '24px 0' },
  logo: { fontSize: 28, fontWeight: 800, color: '#00B4D8', marginBottom: 6 },
  subtitle: { color: '#7A8CA0', fontSize: 14, marginBottom: 32 },
  label: { display: 'block', color: '#C0CDE0', fontSize: 13, fontWeight: 600, marginBottom: 8 },
  input: { width: '100%', background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10, padding: '13px 14px', color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box' },
  textarea: { width: '100%', background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10, padding: '13px 14px', color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box', minHeight: 90, resize: 'vertical', fontFamily: 'inherit' },
  field: { marginBottom: 18 },
  hint: { color: '#6B7A90', fontSize: 12, marginTop: 6 },
  fieldError: { color: '#FF6B6B', fontSize: 12, marginTop: 6 },
  btn: { width: '100%', background: 'linear-gradient(135deg, #00B4D8, #0077A8)', border: 'none', borderRadius: 10, padding: '15px', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8, transition: 'opacity 0.15s' },
  error: { background: '#2D1A1A', border: '1px solid #5C2626', borderRadius: 8, padding: '12px 14px', color: '#FF6B6B', fontSize: 13, marginBottom: 20 },
  footer: { textAlign: 'center', marginTop: 24, color: '#7A8CA0', fontSize: 14 },
  pilotFooter: { textAlign: 'center', marginTop: 14, color: '#5E6B80', fontSize: 13 },
  link: { color: '#00B4D8', fontWeight: 600, textDecoration: 'none' },
};

const DESC_MAX = 5000;

export default function EmployerRegister() {
  const { register } = useEmployerAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [form, setForm] = useState({
    companyName: '', companyType: '', country: '', headquartersCity: '',
    website: '', description: '', contactName: '', contactEmail: '',
    contactPhone: '', password: '', confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (!form.companyName.trim()) errs.companyName = 'Company name is required';
    if (!form.companyType) errs.companyType = 'Select a company type';
    if (!form.country.trim()) errs.country = 'Country is required';
    if (form.website.trim()) {
      try { new URL(form.website.trim()); } catch { errs.website = 'Enter a valid URL (including https://)'; }
    }
    if (form.description.length > DESC_MAX) errs.description = `Description must be ${DESC_MAX} characters or fewer`;
    if (!form.contactName.trim()) errs.contactName = 'Contact name is required';
    if (!form.contactEmail.trim()) errs.contactEmail = 'Contact email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) errs.contactEmail = 'Enter a valid email address';
    if (!form.password) errs.password = 'Password is required';
    else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (form.confirmPassword !== form.password) errs.confirmPassword = "Passwords don't match";
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const payload = {
        companyName: form.companyName.trim(),
        companyType: form.companyType,
        country: form.country.trim(),
        contactName: form.contactName.trim(),
        contactEmail: form.contactEmail.trim(),
        password: form.password,
      };
      if (form.headquartersCity.trim()) payload.headquartersCity = form.headquartersCity.trim();
      if (form.website.trim()) payload.website = form.website.trim();
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.contactPhone.trim()) payload.contactPhone = form.contactPhone.trim();

      await register(payload);
      navigate('/employer/pending-approval');
    } catch (err) {
      const status = err.response?.status;
      if (status === 409) {
        setError('An employer account already exists for this email. Try logging in.');
      } else if (status === 400 && Array.isArray(err.response?.data?.errors)) {
        const serverErrs = {};
        for (const e2 of err.response.data.errors) {
          if (e2.path) serverErrs[e2.path] = e2.msg || 'Invalid value';
        }
        setFieldErrors(serverErrs);
        setError('Please correct the highlighted fields.');
      } else {
        setError(err.response?.data?.error || 'Could not create your account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const pwHint = form.password
    ? (form.password.length < 8 ? 'Too short — at least 8 characters'
      : form.password.length < 12 ? 'OK — longer is stronger' : 'Strong')
    : 'At least 8 characters';

  const Err = ({ name }) => fieldErrors[name] ? <div style={css.fieldError}>{fieldErrors[name]}</div> : null;

  return (
    <div style={css.page}>
      <div style={{ ...css.card, padding: isMobile ? '32px 20px' : '48px 40px' }}>
        <div style={css.logo}>✈ CockpitHire for Employers</div>
        <div style={css.subtitle}>Post pilot jobs directly to our pilot-facing Jobs page.</div>

        {error && <div style={css.error}>{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div style={css.field}>
            <label style={css.label}>Company Name *</label>
            <input style={css.input} value={form.companyName} onChange={set('companyName')} placeholder="e.g. Skyline Charter" autoFocus />
            <Err name="companyName" />
          </div>

          <div style={css.field}>
            <label style={css.label}>Company Type *</label>
            <select style={css.input} value={form.companyType} onChange={set('companyType')}>
              <option value="">Select a type…</option>
              {COMPANY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <Err name="companyType" />
          </div>

          <div style={css.field}>
            <label style={css.label}>Country *</label>
            <input style={css.input} value={form.country} onChange={set('country')} placeholder="e.g. Portugal" />
            <Err name="country" />
          </div>

          <div style={css.field}>
            <label style={css.label}>Headquarters City</label>
            <input style={css.input} value={form.headquartersCity} onChange={set('headquartersCity')} placeholder="e.g. Lisbon" />
          </div>

          <div style={css.field}>
            <label style={css.label}>Website</label>
            <input style={css.input} value={form.website} onChange={set('website')} placeholder="https://example.com" />
            <Err name="website" />
          </div>

          <div style={css.field}>
            <label style={css.label}>Description</label>
            <textarea style={css.textarea} value={form.description} onChange={set('description')} placeholder="Tell pilots about your operation (optional)." maxLength={DESC_MAX} />
            <div style={css.hint}>{form.description.length}/{DESC_MAX}</div>
            <Err name="description" />
          </div>

          <div style={css.field}>
            <label style={css.label}>Contact Name *</label>
            <input style={css.input} value={form.contactName} onChange={set('contactName')} placeholder="Your full name" />
            <Err name="contactName" />
          </div>

          <div style={css.field}>
            <label style={css.label}>Contact Email *</label>
            <input style={css.input} type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="you@company.com" />
            <Err name="contactEmail" />
          </div>

          <div style={css.field}>
            <label style={css.label}>Contact Phone</label>
            <input style={css.input} value={form.contactPhone} onChange={set('contactPhone')} placeholder="+1 555 0100" />
          </div>

          <div style={css.field}>
            <label style={css.label}>Password *</label>
            <input style={css.input} type="password" value={form.password} onChange={set('password')} placeholder="••••••••" />
            <div style={css.hint}>{pwHint}</div>
            <Err name="password" />
          </div>

          <div style={css.field}>
            <label style={css.label}>Confirm Password *</label>
            <input style={css.input} type="password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="••••••••" />
            <Err name="confirmPassword" />
          </div>

          <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Creating account…' : 'Create Employer Account →'}
          </button>
        </form>

        <div style={css.footer}>
          Already have an employer account?{' '}
          <Link to="/employer/login" style={css.link}>Log in</Link>
        </div>
        <div style={css.pilotFooter}>
          Are you a pilot looking for jobs?{' '}
          <Link to="/register" style={css.link}>Sign up as a pilot →</Link>
        </div>
      </div>
    </div>
  );
}
