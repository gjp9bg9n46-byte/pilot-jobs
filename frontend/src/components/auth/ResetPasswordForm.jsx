import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../services/api';
import { Input } from '../primitives';

// Shared by pilot (/reset-password) and employer (/employer/reset-password).
// Identity comes from the wrapping page's className; this uses CSS variables only.
const css = {
  h1: { fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.2px', marginBottom: 6 },
  subtitle: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 28, lineHeight: 1.5 },
  btn: { width: '100%', background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '14px', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 500, cursor: 'pointer', marginTop: 20 },
  error: { background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '12px 14px', color: '#991B1B', fontSize: 13, marginBottom: 20 },
  success: { background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 8, padding: '16px 18px', color: '#166534', fontSize: 14, lineHeight: 1.6 },
  footer: { textAlign: 'center', marginTop: 28, color: 'var(--text-secondary)', fontSize: 14 },
  link: { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' },
};

export default function ResetPasswordForm({ loginPath = '/login', forgotPath = '/forgot-password' }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // No token in the URL → dead-end with a way back.
  if (!token) {
    return (
      <>
        <div style={css.h1}>Reset password</div>
        <div style={css.error} role="alert">Invalid reset link. Request a new one.</div>
        <div style={css.footer}>
          <Link to={forgotPath} style={css.link}>Request a new reset link →</Link>
        </div>
      </>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate(loginPath), 2000);
    } catch (err) {
      if (!err.response) setError("Couldn't reach the server — check your connection and try again.");
      else setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <>
        <div style={css.h1}>Password updated</div>
        <div style={css.success} role="status">
          Password updated. Redirecting to sign-in…
        </div>
        <div style={css.footer}>
          <Link to={loginPath} style={css.link}>Go to sign in now →</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={css.h1}>Reset password</div>
      <div style={css.subtitle}>Choose a new password for your account. At least 8 characters.</div>

      {error && <div style={css.error} role="alert">{error}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            aria-label="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoFocus
            required
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            aria-label="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>

      <div style={css.footer}>
        <Link to={loginPath} style={css.link}>← Back to sign in</Link>
      </div>
    </>
  );
}
