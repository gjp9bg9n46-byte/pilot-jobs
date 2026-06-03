import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';

const css = {
  page: { minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { background: '#0D1E35', borderRadius: 20, padding: '48px 40px', width: '100%', maxWidth: 440, border: '1px solid #1E3050' },
  logo: { fontSize: 28, fontWeight: 800, color: '#00B4D8', marginBottom: 6 },
  subtitle: { color: '#7A8CA0', fontSize: 14, marginBottom: 40 },
  label: { display: 'block', color: '#C0CDE0', fontSize: 13, fontWeight: 600, marginBottom: 8 },
  input: { width: '100%', background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10, padding: '13px 14px', color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box' },
  field: { marginBottom: 20 },
  btn: { width: '100%', background: 'linear-gradient(135deg, #00B4D8, #0077A8)', border: 'none', borderRadius: 10, padding: '15px', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8, transition: 'opacity 0.15s' },
  error: { background: '#2D1A1A', border: '1px solid #5C2626', borderRadius: 8, padding: '12px 14px', color: '#FF6B6B', fontSize: 13, marginBottom: 20 },
  footer: { textAlign: 'center', marginTop: 28, color: '#7A8CA0', fontSize: 14 },
  pilotFooter: { textAlign: 'center', marginTop: 14, color: '#5E6B80', fontSize: 13 },
  link: { color: '#00B4D8', fontWeight: 600, textDecoration: 'none' },
};

const DEST_FOR = {
  PENDING: '/employer/pending-approval',
  APPROVED: '/employer/dashboard',
  REJECTED: '/employer/rejected',
  SUSPENDED: '/employer/suspended',
};

export default function EmployerLogin() {
  const { login } = useEmployerAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) return setError('Please enter your email and password.');
    setLoading(true);
    try {
      const employer = await login(email, password);
      navigate(DEST_FOR[employer.status] || '/employer/pending-approval');
    } catch (err) {
      // Backend returns a generic 401 for both wrong password and unknown email.
      setError(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={css.page}>
      <div style={{ ...css.card, padding: isMobile ? '32px 20px' : '48px 40px' }}>
        <div style={css.logo}>✈ CockpitHire for Employers</div>
        <div style={css.subtitle}>Log in to manage your job postings.</div>

        {error && <div style={css.error}>{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div style={css.field}>
            <label style={css.label}>Email address</label>
            <input style={css.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
          </div>
          <div style={css.field}>
            <label style={css.label}>Password</label>
            <input style={css.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>

        <div style={css.footer}>
          Don't have an employer account?{' '}
          <Link to="/employer/register" style={css.link}>Sign up</Link>
        </div>
        <div style={css.pilotFooter}>
          Are you a pilot?{' '}
          <Link to="/login" style={css.link}>Pilot login →</Link>
        </div>
      </div>
    </div>
  );
}
