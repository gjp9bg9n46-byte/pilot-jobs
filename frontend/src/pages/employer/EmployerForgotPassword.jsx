import React from 'react';
import { Card } from '../../components/primitives';
import { useBodyBackground } from '../../hooks/useBodyBackground';
import { useIsMobile } from '../../hooks/useIsMobile';
import ForgotPasswordForm from '../../components/auth/ForgotPasswordForm';

const logo = { fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.1px', marginBottom: 20 };
const page = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'var(--font-body)' };

export default function EmployerForgotPassword() {
  const isMobile = useIsMobile();
  useBodyBackground('#F3F4F6');
  return (
    <div className="app-b2b" style={page}>
      <Card style={{ maxWidth: 400, width: '100%', padding: isMobile ? '32px 20px' : '40px 36px', borderRadius: 12 }}>
        <div style={logo}>CockpitHire for employers</div>
        <ForgotPasswordForm loginPath="/employer/login" />
      </Card>
    </div>
  );
}
