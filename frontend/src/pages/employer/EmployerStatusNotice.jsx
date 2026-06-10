import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Badge, Button } from '../../components/primitives';
import { useBodyBackground } from '../../hooks/useBodyBackground';

// Minimal placeholder for REJECTED / SUSPENDED employers (full pages are out of
// scope for step e). Shows the status + reason and a logout button.
const COPY = {
  rejected: { badge: 'APPLICATION DECLINED', headline: 'Your application was not approved.',
    body: 'After review, we were unable to approve your employer account at this time.' },
  suspended: { badge: 'ACCOUNT SUSPENDED', headline: 'Your account is suspended.',
    body: 'Your employer account has been suspended. Existing job listings may remain live, but you cannot post new jobs.' },
};

const css = {
  page: { minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'var(--font-body)' },
  card: { background: 'var(--surface)', borderRadius: 12, padding: '48px 40px', width: '100%', maxWidth: 520, border: '1px solid var(--border)' },
  headline: { fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, marginTop: 18 },
  body: { color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6, marginBottom: 18 },
  reason: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', color: 'var(--text-primary)', fontSize: 14, marginBottom: 24 },
};

export default function EmployerStatusNotice({ kind }) {
  const { employer, logout } = useEmployerAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const copy = COPY[kind] || COPY.rejected;
  useBodyBackground('#F3F4F6');

  const handleLogout = () => { logout(); navigate('/employer/login'); };
  if (!employer) return null;

  return (
    <div className="app-b2b" style={css.page}>
      <div style={{ ...css.card, padding: isMobile ? '32px 20px' : '48px 40px' }}>
        <Badge variant="error">{copy.badge}</Badge>
        <div style={css.headline}>{copy.headline}</div>
        <div style={css.body}>{copy.body}</div>
        {employer.rejectionReason && (
          <div style={css.reason}><strong style={{ color: 'var(--text-secondary)' }}>Reason:</strong> {employer.rejectionReason}</div>
        )}
        <Button variant="secondary" onClick={handleLogout} style={{ width: '100%' }}>Log out</Button>
      </div>
    </div>
  );
}
