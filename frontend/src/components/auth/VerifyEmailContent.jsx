import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

// Shared by pilot (/verify-email) and employer (/employer/verify-email). Reads
// ?token= and auto-verifies on mount. Identity comes from the wrapping page's
// className; this uses CSS variables only.
const css = {
  h1: { fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.2px', marginBottom: 8 },
  sub: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.5 },
  error: { background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '14px 16px', color: '#991B1B', fontSize: 14, lineHeight: 1.6 },
  success: { background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 8, padding: '16px 18px', color: '#166534', fontSize: 14, lineHeight: 1.6 },
  footer: { textAlign: 'center', marginTop: 24, color: 'var(--text-secondary)', fontSize: 14 },
  link: { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' },
};

export default function VerifyEmailContent({ verifyFn, onVerified, loggedIn, settingsPath, loginPath, settingsLabel = 'Back to CockpitHire' }) {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState('loading'); // loading | success | error
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setState('error'); setError('Invalid verification link'); return; }
    let cancelled = false;
    verifyFn(token)
      .then(() => { if (cancelled) return; setState('success'); try { onVerified && onVerified(); } catch { /* non-fatal */ } })
      .catch((err) => { if (cancelled) return; setState('error'); setError(err.response?.data?.error || 'Verification failed. Please try again.'); });
    return () => { cancelled = true; };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'loading') {
    return (
      <>
        <div style={css.h1}>Verifying your email…</div>
        <div style={css.sub}>One moment while we check your verification link.</div>
      </>
    );
  }

  if (state === 'success') {
    return (
      <>
        <div style={css.h1}>✓ Email verified</div>
        <div style={css.success} role="status">Your email is verified. You can close this tab.</div>
        <div style={css.footer}>
          <Link to={loggedIn ? settingsPath : loginPath} style={css.link}>{loggedIn ? `${settingsLabel} →` : 'Sign in →'}</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={css.h1}>Verification failed</div>
      <div style={css.error} role="alert">{error}</div>
      <div style={css.footer}>
        {loggedIn
          ? <Link to={settingsPath} style={css.link}>Request a new verification link →</Link>
          : <Link to={loginPath} style={css.link}>Sign in →</Link>}
      </div>
    </>
  );
}
