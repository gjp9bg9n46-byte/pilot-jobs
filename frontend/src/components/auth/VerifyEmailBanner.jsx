import React, { useState } from 'react';

// Dismissible "verify your email" strip. Shown on authenticated pages when the
// user's emailVerified is explicitly false. Resend is inline. Dismiss persists
// per-browser in localStorage (versioned key so we can force a re-show later).
const KEY = 'verifyBannerDismissed_v1';

export default function VerifyEmailBanner({ verified, resendFn }) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(KEY) === '1');
  const [status, setStatus] = useState(null); // { ok, text }
  const [sending, setSending] = useState(false);

  if (verified !== false || dismissed) return null; // only when explicitly unverified

  const resend = async () => {
    setSending(true); setStatus(null);
    try {
      const { data } = await resendFn();
      setStatus({ ok: true, text: data?.message || 'Verification link sent — check your email.' });
    } catch (err) {
      if (err.response?.status === 429) setStatus({ ok: false, text: 'Too many requests. Please wait an hour and try again.' });
      else setStatus({ ok: false, text: err.response?.data?.error || 'Could not send. Please try again later.' });
    } finally {
      setSending(false);
    }
  };

  const dismiss = () => { localStorage.setItem(KEY, '1'); setDismissed(true); };

  return (
    <div style={{
      background: '#FEF3C7', borderBottom: '1px solid #FDE68A', color: '#92400E',
      padding: '10px 20px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <span>⚠️ Verify your email to receive job alerts and updates.</span>
      {status
        ? <span style={{ color: status.ok ? '#166534' : '#991B1B', fontWeight: 600 }}>{status.text}</span>
        : (
          <button
            onClick={resend}
            disabled={sending}
            style={{ background: 'none', border: 'none', color: '#92400E', fontWeight: 700, textDecoration: 'underline', cursor: sending ? 'default' : 'pointer', fontSize: 13, padding: 0 }}
          >
            {sending ? 'Sending…' : 'Resend verification link →'}
          </button>
        )}
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        title="Dismiss"
        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#92400E', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
      >
        ×
      </button>
    </div>
  );
}
