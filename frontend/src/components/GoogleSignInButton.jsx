import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { setAuth } from '../store';

// "Continue with Google" via Google Identity Services. Renders Google's
// official button (required by their brand rules), gets an ID token back, and
// exchanges it at our backend for a normal CockpitHire session. Renders
// nothing when VITE_GOOGLE_CLIENT_ID isn't configured, so the auth pages
// degrade gracefully in dev environments without the key.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GSI_SRC = 'https://accounts.google.com/gsi/client';

export default function GoogleSignInButton({ onError }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const slot = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    const init = () => {
      if (!window.google?.accounts?.id || !slot.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async ({ credential }) => {
          try {
            const { data } = await authApi.googleAuth(credential);
            dispatch(setAuth({ token: data.token, pilot: data.pilot }));
            navigate('/profile');
          } catch (err) {
            onError?.(err.response?.data?.error || 'Google sign-in failed. Try again.');
          }
        },
      });
      window.google.accounts.id.renderButton(slot.current, {
        theme: 'outline', size: 'large', width: 320, text: 'continue_with', shape: 'rectangular',
      });
      setReady(true);
    };
    if (window.google?.accounts?.id) { init(); return; }
    let script = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', init);
    return () => script.removeEventListener('load', init);
  }, [dispatch, navigate, onError]);

  if (!CLIENT_ID) return null;
  return (
    <>
      <div ref={slot} style={{ display: 'flex', justifyContent: 'center', minHeight: ready ? undefined : 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        or
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
    </>
  );
}
