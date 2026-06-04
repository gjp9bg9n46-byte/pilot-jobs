import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { employerApi } from '../../services/employerApi';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';

const TYPE_LABEL = { AIRLINE: 'Airline', CHARTER: 'Charter', CARGO: 'Cargo', EMS: 'EMS / Air Ambulance', FLIGHT_SCHOOL: 'Flight School', CORPORATE: 'Corporate', RECRUITER: 'Recruiter / Agency', OTHER: 'Other' };
const ROLE_LABEL = { CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', INSTRUCTOR: 'Instructor', FLIGHT_ENGINEER: 'Flight Engineer' };
const STATUS_COLOR = { ACTIVE: ['#34D399', 'rgba(52,211,153,0.12)'], EXPIRED: ['#7A8CA0', 'rgba(122,140,160,0.12)'], FILLED: ['#F59E0B', 'rgba(245,158,11,0.12)'], PENDING_REVIEW: ['#60A5FA', 'rgba(96,165,250,0.12)'] };

const css = {
  page: { minHeight: '100vh', background: '#0A1628', paddingBottom: 64 },
  header: { background: '#0D1E35', borderBottom: '1px solid #1E3050', padding: '16px 0' },
  headerIn: { maxWidth: 1000, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  brand: { fontSize: 20, fontWeight: 800, color: '#00B4D8' },
  co: { color: '#C0CDE0', fontSize: 15, fontWeight: 600 },
  badge: (c) => ({ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, letterSpacing: 0.4, color: c[0], background: c[1], border: `1px solid ${c[0]}55` }),
  hRight: { display: 'flex', alignItems: 'center', gap: 16 },
  navlink: { color: '#7A8CA0', fontSize: 14, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', background: 'none', border: 'none' },
  wrap: { maxWidth: 1000, margin: '0 auto', padding: '24px 20px' },
  toast: { background: 'rgba(52,211,153,0.12)', border: '1px solid #34D39955', color: '#34D399', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontWeight: 600, fontSize: 14 },
  banner: { background: '#2A2410', border: '1px solid #5C5026', color: '#E0C24A', borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: 14 },
  profileCard: { background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 16, padding: 22, marginBottom: 26 },
  pcTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  pcName: { fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 4 },
  pcMeta: { color: '#7A8CA0', fontSize: 14 },
  pcGrid: { display: 'flex', flexWrap: 'wrap', gap: '8px 28px', marginTop: 14 },
  pcItem: { fontSize: 13 }, pcK: { color: '#6B7A90' }, pcV: { color: '#C0CDE0', fontWeight: 600 },
  editBtn: { background: 'transparent', border: '1px solid #2A3A55', borderRadius: 9, padding: '9px 14px', color: '#C0CDE0', fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' },
  jobsHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  jobsTitle: { fontSize: 18, fontWeight: 800, color: '#fff' },
  postBtn: { background: 'linear-gradient(135deg, #00B4D8, #0077A8)', border: 'none', borderRadius: 10, padding: '11px 18px', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' },
  postBtnOff: { opacity: 0.4, pointerEvents: 'none' },
  jobCard: { background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 12, padding: 16, marginBottom: 12 },
  jcTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' },
  jcTitle: { fontSize: 16, fontWeight: 700, color: '#fff' },
  jcMeta: { color: '#7A8CA0', fontSize: 13, marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' },
  actions: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  act: { border: '1px solid #2A3A55', background: '#16263F', borderRadius: 8, padding: '7px 13px', color: '#C0CDE0', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' },
  actDanger: { border: '1px solid #5C2626', background: '#2D1A1A', color: '#FF8A8A' },
  empty: { background: '#0D1E35', border: '1px dashed #243050', borderRadius: 12, padding: '36px 20px', textAlign: 'center', color: '#7A8CA0' },
  modalBg: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  modal: { background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 14, padding: 24, maxWidth: 400, width: '100%' },
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

  const JobRow = ({ j }) => {
    const sc = STATUS_COLOR[j.status] || STATUS_COLOR.EXPIRED;
    return (
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
          <span style={css.badge(sc)}>{j.status}</span>
        </div>
        {approved && (
          <div style={css.actions}>
            <Link to={`/employer/jobs/${j.id}/edit`} style={css.act}>Edit</Link>
            {j.status === 'EXPIRED' && <button style={css.act} disabled={busy} onClick={() => handleRepost(j.id)}>Repost</button>}
            {j.status === 'ACTIVE' && <button style={{ ...css.act, ...css.actDanger }} disabled={busy} onClick={() => setConfirmDel(j)}>Delete</button>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={css.page}>
      <div style={css.header}>
        <div style={css.headerIn}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={css.brand}>✈ CockpitHire</span>
            <span style={css.co}>{employer.companyName}</span>
            <span style={css.badge(approved ? STATUS_COLOR.ACTIVE : STATUS_COLOR.FILLED)}>{status}</span>
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
            {employer.website && <div style={css.pcItem}><span style={css.pcK}>Website: </span><a href={employer.website} target="_blank" rel="noreferrer" style={{ ...css.pcV, color: '#00B4D8' }}>{employer.website}</a></div>}
            <div style={css.pcItem}><span style={css.pcK}>Verified contributors: </span><span style={css.pcV}>0</span></div>
          </div>
        </div>

        <div style={css.jobsHead}>
          <div style={css.jobsTitle}>Your Jobs{jobs ? ` (${jobs.length})` : ''}</div>
          <Link to="/employer/jobs/new" style={{ ...css.postBtn, ...(approved ? {} : css.postBtnOff) }}>+ Post New Job</Link>
        </div>

        {jobs === null ? <div style={{ color: '#7A8CA0' }}>Loading jobs…</div>
          : jobs.length === 0 ? (
            <div style={css.empty}>
              You haven't posted any jobs yet.{approved && <> <Link to="/employer/jobs/new" style={{ color: '#00B4D8', fontWeight: 600 }}>Post your first job →</Link></>}
            </div>
          ) : jobs.map((j) => <JobRow key={j.id} j={j} />)}
      </div>

      {confirmDel && (
        <div style={css.modalBg} onClick={() => setConfirmDel(null)}>
          <div style={css.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Delete this job?</div>
            <div style={{ color: '#A8B6CC', fontSize: 14, marginBottom: 20 }}>"{confirmDel.title}" will be set to EXPIRED and removed from the public Jobs page. You can repost it later.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={css.act} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button style={{ ...css.act, ...css.actDanger }} disabled={busy} onClick={handleDelete}>{busy ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
