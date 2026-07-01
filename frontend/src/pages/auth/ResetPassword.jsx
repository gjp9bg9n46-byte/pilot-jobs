import React from 'react';
import { Card } from '../../components/primitives';
import { useBodyBackground } from '../../hooks/useBodyBackground';
import { useIsMobile } from '../../hooks/useIsMobile';
import ResetPasswordForm from '../../components/auth/ResetPasswordForm';

const logo = { fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--accent)', letterSpacing: '-0.2px', marginBottom: 20 };
const page = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 };

export default function ResetPassword() {
  const isMobile = useIsMobile();
  useBodyBackground('#F8F6F1');
  return (
    <div className="app-light" style={page}>
      <Card style={{ maxWidth: 400, width: '100%', padding: isMobile ? '32px 20px' : '40px 36px', borderRadius: 12 }}>
        <div style={logo}>CockpitHire</div>
        <ResetPasswordForm loginPath="/login" forgotPath="/forgot-password" />
      </Card>
    </div>
  );
}
