import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';

// Minimal placeholder for REJECTED / SUSPENDED employers (full pages are out of
// scope for step e). Shows the status + reason and a logout button.
const COPY = {
  rejected: { badge: 'APPLICATION DECLINED', headline: 'Your application was not approved.',
    body: 'After review, we were unable to approve your employer account at this time.' },
  suspended: { badge: 'ACCOUNT SUSPENDED', headline: 'Your account is suspended.',
    body: 'Your employer account has been suspended. Existing job listings may remain live, but you cannot post new jobs.' },
};

const css = {
  page: { minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { background: '#0D1E35', borderRadius: 20, padding: '48px 40px', width: '100%', maxWidth: 520, border: '1px solid #1E3050' },
  badge: { display: 'inline-block', background: '#2D1A1A', border: '1px solid #5C2626', color: '#FF8A8A', fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999, marginBottom: 18, letterSpacing: 0.4 },
  headline: { fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 14 },
  body: { color: '#A8B6CC', fontSize: 15, lineHeight: 1.6, marginBottom: 18 },
  reason: { background: '#0A1729', border: '1px solid #1E3050', borderRadius: 10, padding: '14px 16px', color: '#C0CDE0', fontSize: 14, marginBottom: 24 },
  logout: { background: 'transparent', border: '1px solid #2A3A55', borderRadius: 10, padding: '13px 18px', color: '#C0CDE0', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%' },
};

export default function EmployerStatusNotice({ kind }) {
  const { employer, logout } = useEmployerAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const copy = COPY[kind] || COPY.rejected;

  const handleLogout = () => { logout(); navigate('/employer/login'); };
  if (!employer) return null;

  return (
    <div style={css.page}>
      <div style={{ ...css.card, padding: isMobile ? '32px 20px' : '48px 40px' }}>
        <div style={css.badge}>{copy.badge}</div>
        <div style={css.headline}>{copy.headline}</div>
        <div style={css.body}>{copy.body}</div>
        {employer.rejectionReason && (
          <div style={css.reason}><strong style={{ color: '#7A8CA0' }}>Reason:</strong> {employer.rejectionReason}</div>
        )}
        <button style={css.logout} onClick={handleLogout}>Log out</button>
      </div>
    </div>
  );
}
