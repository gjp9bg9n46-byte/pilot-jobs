import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../services/api';
import { Input } from '../primitives';

// Shared by the pilot (/forgot-password) and employer (/employer/forgot-password)
// pages. Identity (editorial-light vs .app-b2b) comes from the wrapping page's
// className — this component only uses CSS variables.
const css = {
  h1: { fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.2px', marginBottom: 6 },
  subtitle: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 28, lineHeight: 1.5 },
  btn: { width: '100%', background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '14px', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 500, cursor: 'pointer', marginTop: 20 },
  error: { background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '12px 14px', color: '#991B1B', fontSize: 13, marginBottom: 20 },
  success: { background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 8, padding: '16px 18px', color: '#166534', fontSize: 14, lineHeight: 1.6 },
  footer: { textAlign: 'center', marginTop: 28, color: 'var(--text-secondary)', fontSize: 14 },
  link: { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' },
};

export default function ForgotPasswordForm({ loginPath = '/login' }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Please enter your email address.');
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      if (err.response?.status === 429) setError('Too many reset requests. Please wait an hour before trying again.');
      else if (!err.response) setError("Couldn't reach the server — check your connection and try again.");
      else setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <>
        <div style={css.h1}>Check your email</div>
        <div style={css.success} role="status">
          If an account exists for <strong>{email.trim()}</strong>, we've sent a reset link.
          It expires in 1 hour. Don't forget to check your spam folder.
        </div>
        <div style={css.footer}>
          <Link to={loginPath} style={css.link}>← Back to sign in</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={css.h1}>Forgot password?</div>
      <div style={css.subtitle}>Enter your account email and we'll send you a link to reset your password.</div>

      {error && <div style={css.error} role="alert">{error}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          autoFocus
          required
        />
        <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <div style={css.footer}>
        <Link to={loginPath} style={css.link}>← Back to sign in</Link>
      </div>
    </>
  );
}
