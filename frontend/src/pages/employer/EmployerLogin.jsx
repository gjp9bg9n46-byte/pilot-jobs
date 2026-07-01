import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useBodyBackground } from '../../hooks/useBodyBackground';
import { Card, Input } from '../../components/primitives';

// Status → destination after a successful employer login.
const DEST_FOR = { PENDING: '/employer/pending-approval', APPROVED: '/employer/dashboard', REJECTED: '/employer/rejected', SUSPENDED: '/employer/suspended' };

const css = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'var(--font-body)' },
  // app-b2b collapses --font-display to Inter, so the header renders cool-operator sans.
  logo: { fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.2px', marginBottom: 6 },
  subtitle: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 28 },
  btn: { width: '100%', background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '14px', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 500, cursor: 'pointer', marginTop: 20 },
  error: { background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '12px 14px', color: '#991B1B', fontSize: 13, marginBottom: 20 },
  footer: { textAlign: 'center', marginTop: 28, color: 'var(--text-secondary)', fontSize: 14 },
  pilotFooter: { textAlign: 'center', marginTop: 14, color: 'var(--text-secondary)', fontSize: 13 },
  link: { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' },
};

export default function EmployerLogin() {
  const { login, isAuthenticated, status, loading: authLoading } = useEmployerAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  useBodyBackground('#F3F4F6');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Already-authenticated employer → forward away from the login form.
  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(DEST_FOR[status] || '/employer/pending-approval', { replace: true });
  }, [authLoading, isAuthenticated, status, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) return setError('Please enter your email and password.');
    setLoading(true);
    try {
      const employer = await login(email, password);
      navigate(DEST_FOR[employer.status] || '/employer/pending-approval');
    } catch (err) {
      if (!err.response) setError("Couldn't reach the server — check your connection and try again.");
      else setError(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-b2b" style={css.page}>
      <Card style={{ maxWidth: 400, width: '100%', padding: isMobile ? '32px 20px' : '40px 36px', borderRadius: 12 }}>
        <div style={css.logo}>Employer sign in</div>
        <div style={css.subtitle}>For airlines and recruiters posting positions.</div>

        {error && <div style={css.error} role="alert">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Input label="Email address" type="email" autoComplete="username" aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
            <Input label="Password" type="password" autoComplete="current-password" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <Link to="/employer/forgot-password" style={{ ...css.link, fontSize: 13, fontWeight: 500 }}>Forgot password?</Link>
          </div>
          <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>

        <div style={css.footer}>
          Don't have an employer account?{' '}
          <Link to="/employer/register" style={css.link}>Register →</Link>
        </div>
        <div style={css.pilotFooter}>
          Are you a pilot?{' '}
          <Link to="/login" style={css.link}>Sign in here →</Link>
        </div>
      </Card>
    </div>
  );
}
