import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card } from '../../components/primitives';
import { useBodyBackground } from '../../hooks/useBodyBackground';
import { useIsMobile } from '../../hooks/useIsMobile';
import { authApi } from '../../services/api';
import { setPilot } from '../../store';
import VerifyEmailContent from '../../components/auth/VerifyEmailContent';

const logo = { fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--accent)', letterSpacing: '-0.2px', marginBottom: 20 };
const page = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 };

export default function VerifyEmail() {
  const isMobile = useIsMobile();
  const dispatch = useDispatch();
  const loggedIn = useSelector((s) => !!s.auth.token);
  useBodyBackground('#F8F6F1');

  // Refresh the pilot so the "verify your email" banner clears in-session.
  const onVerified = () => { if (loggedIn) authApi.me().then(({ data }) => dispatch(setPilot(data))).catch(() => {}); };

  return (
    <div className="app-light" style={page}>
      <Card style={{ maxWidth: 400, width: '100%', padding: isMobile ? '32px 20px' : '40px 36px', borderRadius: 12 }}>
        <div style={logo}>CockpitHire</div>
        <VerifyEmailContent verifyFn={authApi.verifyEmail} onVerified={onVerified} loggedIn={loggedIn} settingsPath="/settings" loginPath="/login" />
      </Card>
    </div>
  );
}
