import React from 'react';
import { Card } from '../../components/primitives';
import { useBodyBackground } from '../../hooks/useBodyBackground';
import { useIsMobile } from '../../hooks/useIsMobile';
import { employerApi } from '../../services/employerApi';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import VerifyEmailContent from '../../components/auth/VerifyEmailContent';

const logo = { fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.1px', marginBottom: 20 };
const page = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'var(--font-body)' };

export default function EmployerVerifyEmail() {
  const isMobile = useIsMobile();
  const { isAuthenticated, refresh } = useEmployerAuth();
  useBodyBackground('#F3F4F6');

  return (
    <div className="app-b2b" style={page}>
      <Card style={{ maxWidth: 400, width: '100%', padding: isMobile ? '32px 20px' : '40px 36px', borderRadius: 12 }}>
        <div style={logo}>CockpitHire for employers</div>
        <VerifyEmailContent
          verifyFn={employerApi.verifyEmail}
          onVerified={() => { if (isAuthenticated) refresh(); }}
          loggedIn={isAuthenticated}
          settingsPath="/employer/profile"
          loginPath="/employer/login"
          settingsLabel="Back to your profile"
        />
      </Card>
    </div>
  );
}
