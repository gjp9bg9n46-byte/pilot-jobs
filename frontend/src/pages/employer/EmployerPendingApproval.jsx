import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';

const COMPANY_TYPE_LABEL = {
  AIRLINE: 'Airline', CHARTER: 'Charter', CARGO: 'Cargo', EMS: 'EMS / Air Ambulance',
  FLIGHT_SCHOOL: 'Flight School', CORPORATE: 'Corporate / Business Aviation',
  RECRUITER: 'Recruiter / Agency', OTHER: 'Other',
};

const css = {
  page: { minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24 },
  card: { background: '#0D1E35', borderRadius: 20, padding: '48px 40px', width: '100%', maxWidth: 560, border: '1px solid #1E3050', margin: '24px 0' },
  badge: { display: 'inline-block', background: '#2A2410', border: '1px solid #5C5026', color: '#E0C24A', fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999, marginBottom: 18, letterSpacing: 0.4 },
  headline: { fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 14 },
  body: { color: '#A8B6CC', fontSize: 15, lineHeight: 1.6, marginBottom: 28 },
  summary: { background: '#0A1729', border: '1px solid #1E3050', borderRadius: 12, padding: '18px 20px', marginBottom: 28 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: '1px solid #16263F', fontSize: 14 },
  rowLast: { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', fontSize: 14 },
  k: { color: '#7A8CA0' }, v: { color: '#E6EDF5', fontWeight: 600, textAlign: 'right' },
  logout: { background: 'transparent', border: '1px solid #2A3A55', borderRadius: 10, padding: '13px 18px', color: '#C0CDE0', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%' },
  contact: { textAlign: 'center', marginTop: 18, color: '#5E6B80', fontSize: 13 },
  link: { color: '#00B4D8', fontWeight: 600, textDecoration: 'none' },
};

export default function EmployerPendingApproval() {
  const { employer, logout } = useEmployerAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const handleLogout = () => { logout(); navigate('/employer/login'); };

  if (!employer) return null; // RequireEmployerAuth handles the redirect

  const Row = ({ k, v, last }) => (
    <div style={last ? css.rowLast : css.row}><span style={css.k}>{k}</span><span style={css.v}>{v || '—'}</span></div>
  );

  return (
    <div style={css.page}>
      <div style={{ ...css.card, padding: isMobile ? '32px 20px' : '48px 40px' }}>
        <div style={css.badge}>UNDER REVIEW</div>
        <div style={css.headline}>Your account is under review.</div>
        <div style={css.body}>
          Thanks for registering, {employer.contactName}. Our team reviews new employer applications,
          usually within 48 hours. You'll receive an email at <strong style={{ color: '#C0CDE0' }}>{employer.contactEmail}</strong> once
          your account is approved. Once approved, you'll be able to post jobs that appear on our pilot-facing Jobs page.
        </div>

        <div style={css.summary}>
          <Row k="Company" v={employer.companyName} />
          <Row k="Type" v={COMPANY_TYPE_LABEL[employer.companyType] || employer.companyType} />
          <Row k="Country" v={employer.country} />
          <Row k="Contact Name" v={employer.contactName} />
          <Row k="Contact Email" v={employer.contactEmail} last />
        </div>

        <button style={css.logout} onClick={handleLogout}>Log out</button>

        <div style={css.contact}>
          Have questions? Contact us at{' '}
          <a href="mailto:support@cockpithire.com" style={css.link}>support@cockpithire.com</a>
        </div>
      </div>
    </div>
  );
}
