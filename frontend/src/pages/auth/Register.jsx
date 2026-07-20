import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { authApi } from '../../services/api';
import { setAuth } from '../../store';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Card, Input } from '../../components/primitives';
import GoogleSignInButton from '../../components/GoogleSignInButton';

// Signup is deliberately minimal (owner directive): email + password only.
// Name, country, city, phone all live on the Profile page after sign-up.
const PILOT_FIELDS = [
  { name: 'email', label: 'Email Address', type: 'email', required: true, full: true, ac: 'email' },
  { name: 'password', label: 'Password', type: 'password', required: true, hint: 'Min. 8 characters', full: true, ac: 'new-password' },
];
const PILOT_INIT = { email: '', password: '' };

const css = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24 },
  logo: { fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  subtitle: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24, lineHeight: 1.5 },
  grid: { display: 'grid', gap: 16 },
  full: { gridColumn: '1 / -1' },
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
  const [params] = useSearchParams();

  const pilotToken = useSelector((s) => s.auth.token);

  const [form, setForm] = useState(PILOT_INIT);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Back-compat: forward old ?as=employer bookmarks to the dedicated employer
  // registration (replace so Back skips the redirect).
  useEffect(() => {
    if (params.get('as') === 'employer') navigate('/employer/register', { replace: true });
  }, [params, navigate]);

  // Standalone light page: paint body warm; restore to dark default on unmount
  // (see primitives/README.md → body-bg pattern).
  useEffect(() => {
    document.body.style.background = '#F8F6F1';
    return () => { document.body.style.background = '#0A1628'; };
  }, []);

  useEffect(() => {
    if (pilotToken) navigate('/profile', { replace: true });
  }, [pilotToken, navigate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email || !form.password) { setError('Please fill in all required fields.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError('Enter a valid email address.'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const { data } = await authApi.register(form);
      dispatch(setAuth({ token: data.token, pilot: data.pilot }));
      navigate('/profile');
    } catch (err) {
      if (!err.response) setError("Couldn't reach the server — check your connection and try again.");
      else if (Array.isArray(err.response.data?.errors) && err.response.data.errors.length) setError(err.response.data.errors[0].msg || 'Please check your details and try again.');
      else setError(err.response.data?.error || 'Could not create account. Try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="app-light" style={css.page}>
      <Card style={{ maxWidth: 480, width: '100%', margin: '24px 0', padding: isMobile ? '32px 20px' : '40px 36px', borderRadius: 12 }}>
        <div style={css.logo}><PlaneMark /> CockpitHire</div>
        <div style={css.subtitle}>Create your free account — you'll add your pilot details after sign-up.</div>

        {error && <div style={css.error} role="alert">{error}</div>}

        <GoogleSignInButton onError={setError} />

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ ...css.grid, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            {PILOT_FIELDS.map(({ name, label, type = 'text', required, half, full, hint, ac }, i) => (
              <div key={name} style={(isMobile || full || !half) ? css.full : undefined}>
                <Input
                  type={type}
                  autoComplete={ac}
                  aria-label={label.replace(' (optional)', '')}
                  autoFocus={i === 0}
                  value={form[name]}
                  onChange={set(name)}
                  placeholder={label.replace(' (optional)', '')}
                  label={<>{label}{required && <span style={css.reqMark}>*</span>}{hint && <span style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>{hint}</span>}</>}
                />
              </div>
            ))}
          </div>

          <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account →'}
          </button>
        </form>

        <div style={css.footer}>
          Already have an account?{' '}
          <Link to="/login" style={css.link}>Sign in</Link>
        </div>
      </Card>
    </div>
  );
}
