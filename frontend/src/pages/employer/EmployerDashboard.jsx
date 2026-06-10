import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { employerApi } from '../../services/employerApi';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Badge, Button, Modal } from '../../components/primitives';
import { useBodyBackground } from '../../hooks/useBodyBackground';

const TYPE_LABEL = { AIRLINE: 'Airline', CHARTER: 'Charter', CARGO: 'Cargo', EMS: 'EMS / Air Ambulance', FLIGHT_SCHOOL: 'Flight School', CORPORATE: 'Corporate', RECRUITER: 'Recruiter / Agency', OTHER: 'Other' };
const ROLE_LABEL = { CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', INSTRUCTOR: 'Instructor', FLIGHT_ENGINEER: 'Flight Engineer' };
// Job status → semantic Badge variant
const JOB_STATUS_VARIANT = { ACTIVE: 'success', EXPIRED: 'neutral', FILLED: 'warning', PENDING_REVIEW: 'info' };
// Employer account status → semantic Badge variant
const ACCT_STATUS_VARIANT = { APPROVED: 'success', PENDING: 'info', REJECTED: 'error', SUSPENDED: 'error' };

const css = {
  page: { minHeight: '100vh', background: 'var(--bg)', paddingBottom: 64, fontFamily: 'var(--font-body)' },
  header: { background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '16px 0' },
  headerIn: { maxWidth: 1000, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  brand: { fontSize: 19, fontWeight: 700, color: 'var(--accent)' },
  co: { color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 },
  hRight: { display: 'flex', alignItems: 'center', gap: 16 },
  navlink: { color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'var(--font-body)' },
  wrap: { maxWidth: 1000, margin: '0 auto', padding: '24px 20px' },
  toast: { background: '#DCFCE7', border: '1px solid #BBF7D0', color: '#166534', borderRadius: 6, padding: '12px 16px', marginBottom: 20, fontWeight: 600, fontSize: 14 },
  banner: { background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 6, padding: '14px 16px', marginBottom: 20, fontSize: 14 },
  profileCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 22, marginBottom: 26 },
  pcTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  pcName: { fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 },
  pcMeta: { color: 'var(--text-secondary)', fontSize: 14 },
  pcGrid: { display: 'flex', flexWrap: 'wrap', gap: '8px 28px', marginTop: 14 },
  pcItem: { fontSize: 13 }, pcK: { color: 'var(--text-secondary)' }, pcV: { color: 'var(--text-primary)', fontWeight: 600 },
  editBtn: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '9px 14px', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', fontFamily: 'var(--font-body)' },
  jobsHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  jobsTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  postBtn: { background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '11px 18px', color: '#fff', fontSize: 15, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', fontFamily: 'var(--font-body)' },
  postBtnOff: { opacity: 0.4, pointerEvents: 'none' },
  jobCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 12 },
  jcTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' },
  jcTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' },
  jcMeta: { color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' },
  actions: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  act: { border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 6, padding: '7px 13px', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', fontFamily: 'var(--font-body)' },
  empty: { background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 8, padding: '36px 20px', textAlign: 'center', color: 'var(--text-secondary)' },
};

export default function EmployerDashboard() {
  const { employer, status, logout } = useEmployerAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [jobs, setJobs] = useState(null);
  const [toast, setToast] = useState(location.state?.toast || '');
  const [confirmDel, setConfirmDel] = useState(null);
  const [busy, setBusy] = useState(false);
  useBodyBackground('#F3F4F6');

  const approved = status === 'APPROVED';

  useEffect(() => {
    if (status && status === 'PENDING') navigate('/employer/pending-approval', { replace: true });
  }, [status, navigate]);

  // Clear the router toast state so a refresh doesn't re-show it.
  useEffect(() => {
    if (location.state?.toast) { window.history.replaceState({}, ''); const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t); }
  }, [location.state]);

  const load = useCallback(() => { employerApi.listJobs().then(({ data }) => setJobs(data)).catch(() => setJobs([])); }, []);
  useEffect(() => { load(); }, [load]);

  const handleLogout = () => { logout(); navigate('/employer/login'); };
  const handleRepost = async (id) => { setBusy(true); try { await employerApi.repostJob(id); load(); } finally { setBusy(false); } };
  const handleDelete = async () => { setBusy(true); try { await employerApi.deleteJob(confirmDel.id); setConfirmDel(null); load(); } finally { setBusy(false); } };

  if (!employer) return null;

  const JobRow = ({ j }) => (
    <div style={css.jobCard}>
      <div style={css.jcTop}>
        <div>
          <div style={css.jcTitle}>{j.title}</div>
          <div style={css.jcMeta}>
            {j.role && <span>{ROLE_LABEL[j.role] || j.role}</span>}
            <span>📍 {j.location || '—'}</span>
            <span>{new Date(j.postedAt).toLocaleDateString()}</span>
          </div>
        </div>
        <Badge variant={JOB_STATUS_VARIANT[j.status] || 'neutral'}>{j.status}</Badge>
      </div>
      {approved && (
        <div style={css.actions}>
          <Link to={`/employer/jobs/${j.id}/edit`} style={css.act}>Edit</Link>
          {j.status === 'EXPIRED' && <Button variant="secondary" style={{ padding: '7px 13px', fontSize: 13 }} disabled={busy} onClick={() => handleRepost(j.id)}>Repost</Button>}
          {j.status === 'ACTIVE' && <Button variant="danger" style={{ padding: '7px 13px', fontSize: 13 }} disabled={busy} onClick={() => setConfirmDel(j)}>Delete</Button>}
        </div>
      )}
    </div>
  );

  return (
    <div className="app-b2b" style={css.page}>
      <div style={css.header}>
        <div style={css.headerIn}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={css.brand}>✈ CockpitHire</span>
            <span style={css.co}>{employer.companyName}</span>
            <Badge variant={ACCT_STATUS_VARIANT[status] || 'neutral'}>{status}</Badge>
          </div>
          <div style={css.hRight}>
            <Link to="/employer/profile" style={css.navlink}>Edit Profile</Link>
            <button style={css.navlink} onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </div>

      <div style={css.wrap}>
        {toast && <div style={css.toast}>{toast}</div>}
        {status === 'SUSPENDED' && <div style={css.banner}>Your account is suspended. Existing listings stay live, but you cannot post or edit jobs. Contact support@cockpithire.com.</div>}
        {status === 'REJECTED' && <div style={css.banner}>Your account application was not approved. You cannot post jobs. Contact support@cockpithire.com.</div>}

        <div style={css.profileCard}>
          <div style={css.pcTop}>
            <div>
              <div style={css.pcName}>{employer.companyName}</div>
              <div style={css.pcMeta}>{TYPE_LABEL[employer.companyType] || employer.companyType} · {employer.country}{employer.headquartersCity ? ` · ${employer.headquartersCity}` : ''}</div>
            </div>
            <Link to="/employer/profile" style={css.editBtn}>Edit profile</Link>
          </div>
          <div style={css.pcGrid}>
            {employer.website && <div style={css.pcItem}><span style={css.pcK}>Website: </span><a href={employer.website} target="_blank" rel="noreferrer" style={{ ...css.pcV, color: 'var(--accent)' }}>{employer.website}</a></div>}
            <div style={css.pcItem}><span style={css.pcK}>Verified contributors: </span><span style={css.pcV}>0</span></div>
          </div>
        </div>

        <div style={css.jobsHead}>
          <div style={css.jobsTitle}>Your Jobs{jobs ? ` (${jobs.length})` : ''}</div>
          <Link to="/employer/jobs/new" style={{ ...css.postBtn, ...(approved ? {} : css.postBtnOff) }}>+ Post New Job</Link>
        </div>

        {jobs === null ? <div style={{ color: 'var(--text-secondary)' }}>Loading jobs…</div>
          : jobs.length === 0 ? (
            <div style={css.empty}>
              You haven't posted any jobs yet.{approved && <> <Link to="/employer/jobs/new" style={{ color: 'var(--accent)', fontWeight: 600 }}>Post your first job →</Link></>}
            </div>
          ) : jobs.map((j) => <JobRow key={j.id} j={j} />)}
      </div>

      <Modal isOpen={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete this job?">
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 0 }}>
          “{confirmDel?.title}” will be set to EXPIRED and removed from the public Jobs page. You can repost it later.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="ghost" onClick={() => setConfirmDel(null)}>Cancel</Button>
          <Button variant="danger" disabled={busy} onClick={handleDelete}>{busy ? 'Deleting…' : 'Delete'}</Button>
        </div>
      </Modal>
    </div>
  );
}
