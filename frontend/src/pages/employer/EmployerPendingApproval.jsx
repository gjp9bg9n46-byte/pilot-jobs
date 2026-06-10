import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Badge, Button } from '../../components/primitives';
import { useBodyBackground } from '../../hooks/useBodyBackground';

const COMPANY_TYPE_LABEL = {
  AIRLINE: 'Airline', CHARTER: 'Charter', CARGO: 'Cargo', EMS: 'EMS / Air Ambulance',
  FLIGHT_SCHOOL: 'Flight School', CORPORATE: 'Corporate / Business Aviation',
  RECRUITER: 'Recruiter / Agency', OTHER: 'Other',
};

const css = {
  page: { minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, fontFamily: 'var(--font-body)' },
  card: { background: 'var(--surface)', borderRadius: 12, padding: '48px 40px', width: '100%', maxWidth: 560, border: '1px solid var(--border)', margin: '24px 0' },
  headline: { fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, marginTop: 18 },
  body: { color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6, marginBottom: 28 },
  summary: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '18px 20px', marginBottom: 28 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 },
  rowLast: { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', fontSize: 14 },
  k: { color: 'var(--text-secondary)' }, v: { color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' },
  contact: { textAlign: 'center', marginTop: 18, color: 'var(--text-secondary)', fontSize: 13 },
  link: { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' },
};

export default function EmployerPendingApproval() {
  const { employer, logout } = useEmployerAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  useBodyBackground('#F3F4F6');

  const handleLogout = () => { logout(); navigate('/employer/login'); };

  if (!employer) return null; // RequireEmployerAuth handles the redirect

  const Row = ({ k, v, last }) => (
    <div style={last ? css.rowLast : css.row}><span style={css.k}>{k}</span><span style={css.v}>{v || '—'}</span></div>
  );

  return (
    <div className="app-b2b" style={css.page}>
      <div style={{ ...css.card, padding: isMobile ? '32px 20px' : '48px 40px' }}>
        <Badge variant="warning">UNDER REVIEW</Badge>
        <div style={css.headline}>Your account is under review.</div>
        <div style={css.body}>
          Thanks for registering, {employer.contactName}. Our team reviews new employer applications,
          usually within 48 hours. You'll receive an email at <strong style={{ color: 'var(--text-primary)' }}>{employer.contactEmail}</strong> once
          your account is approved. Once approved, you'll be able to post jobs that appear on our pilot-facing Jobs page.
        </div>

        <div style={css.summary}>
          <Row k="Company" v={employer.companyName} />
          <Row k="Type" v={COMPANY_TYPE_LABEL[employer.companyType] || employer.companyType} />
          <Row k="Country" v={employer.country} />
          <Row k="Contact Name" v={employer.contactName} />
          <Row k="Contact Email" v={employer.contactEmail} last />
        </div>

        <Button variant="secondary" onClick={handleLogout} style={{ width: '100%' }}>Log out</Button>

        <div style={css.contact}>
          Have questions? Contact us at{' '}
          <a href="mailto:support@cockpithire.com" style={css.link}>support@cockpithire.com</a>
        </div>
      </div>
    </div>
  );
}
