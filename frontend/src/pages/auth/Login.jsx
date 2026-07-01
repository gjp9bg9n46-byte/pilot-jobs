import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { authApi } from '../../services/api';
import { setAuth } from '../../store';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Card, Input } from '../../components/primitives';

const css = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  subtitle: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 28 },
  btn: { width: '100%', background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '14px', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 500, cursor: 'pointer', marginTop: 20 },
  error: { background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '12px 14px', color: '#991B1B', fontSize: 13, marginBottom: 20 },
  footer: { textAlign: 'center', marginTop: 28, color: 'var(--text-secondary)', fontSize: 14 },
  link: { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' },
};

const PlaneMark = () => (
  <svg width="22" height="22" viewBox="0 0 18 18" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--accent)' }}>
    <path d="M16 9H3.5M10 4L16 9l-6 5M7 6L2 9l5 3" />
  </svg>
);

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [params] = useSearchParams();

  const pilotToken = useSelector((s) => s.auth.token);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Back-compat: the old unified page used ?as=employer. Forward those bookmarks
  // to the dedicated employer login (replace so Back skips the redirect).
  useEffect(() => {
    if (params.get('as') === 'employer') navigate('/employer/login', { replace: true });
  }, [params, navigate]);

  // Standalone light page: paint the body warm so overscroll matches; restore to
  // the dark app default on unmount (see primitives/README.md → body-bg pattern).
  useEffect(() => {
    document.body.style.background = '#F8F6F1';
    return () => { document.body.style.background = '#0A1628'; };
  }, []);

  // Auto-forward an already-authenticated pilot away from the auth page.
  useEffect(() => {
    if (pilotToken) navigate('/jobs', { replace: true });
  }, [pilotToken, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) return setError('Please enter your email and password.');
    setLoading(true);
    try {
      const { data } = await authApi.login(email, password);
      dispatch(setAuth({ token: data.token, pilot: data.pilot }));
      navigate('/jobs');
    } catch (err) {
      if (!err.response) setError("Couldn't reach the server — check your connection and try again.");
      else setError(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-light" style={css.page}>
      <Card style={{ maxWidth: 400, width: '100%', padding: isMobile ? '32px 20px' : '40px 36px', borderRadius: 12 }}>
        <div style={css.logo}><PlaneMark /> CockpitHire</div>
        <div style={css.subtitle}>Aviation careers worldwide, matched to your licence.</div>

        {error && <div style={css.error} role="alert">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Input label="Email address" type="email" autoComplete="username" aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" autoFocus />
            <Input label="Password" type="password" autoComplete="current-password" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <Link to="/forgot-password" style={{ ...css.link, fontSize: 13, fontWeight: 500 }}>Forgot password?</Link>
          </div>
          <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>

        <div style={css.footer}>
          Don't have an account?{' '}
          <Link to="/register" style={css.link}>Sign up</Link>
        </div>
      </Card>
    </div>
  );
}
