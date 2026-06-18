import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { employerApi } from '../../services/employerApi';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useBodyBackground } from '../../hooks/useBodyBackground';
import { Badge, Button } from '../../components/primitives';
import MatchScore from '../../components/MatchScore';

const STATUS = {
  APPLIED:     { label: 'Applied',     variant: 'neutral' },
  REVIEWED:    { label: 'Reviewed',    variant: 'info' },
  SHORTLISTED: { label: 'Shortlisted', variant: 'info' },
  HIRED:       { label: 'Hired',       variant: 'success' },
};
const STATUS_ORDER = ['APPLIED', 'REVIEWED', 'SHORTLISTED', 'HIRED'];
const ROLE_LABEL = { CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', INSTRUCTOR: 'Instructor', FLIGHT_ENGINEER: 'Flight Engineer' };
const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };

function appliedAgo(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const m = Math.floor(days / 30);
  return m === 1 ? '1 month ago' : `${m} months ago`;
}

const css = {
  page: { minHeight: '100vh', background: 'var(--bg)', padding: '24px 0 64px', fontFamily: 'var(--font-body)' },
  wrap: { maxWidth: 880, margin: '0 auto', padding: '0 20px' },
  back: { color: 'var(--text-secondary)', fontSize: 14, textDecoration: 'none', cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'var(--font-body)', marginBottom: 16, display: 'inline-block' },
  h1: { fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 },
  sub: { fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 },
  pills: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 },
  pill: (on) => ({ cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 20, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'rgba(0,63,136,0.08)' : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 7 }),
  pillCount: (on) => ({ background: on ? 'var(--accent)' : 'var(--border)', color: on ? '#fff' : 'var(--text-secondary)', borderRadius: 10, fontSize: 11, fontWeight: 800, padding: '0 6px', lineHeight: '16px' }),
  card: { display: 'flex', alignItems: 'center', gap: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 12, cursor: 'pointer' },
  name: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' },
  meta: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' },
  empty: { background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' },
  scrim: { position: 'fixed', inset: 0, background: 'rgba(15,20,25,0.4)', zIndex: 60 },
  drawer: (mobile) => ({ position: 'fixed', top: 0, right: 0, bottom: 0, width: mobile ? '100%' : 'min(560px, 92vw)', background: 'var(--surface)', zIndex: 61, boxShadow: '-4px 0 24px rgba(15,20,25,0.15)', overflowY: 'auto', padding: mobile ? '20px' : '28px 32px' }),
  drawerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 },
  closeBtn: { background: 'none', border: 'none', fontSize: 24, lineHeight: 1, color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 },
  sectionLabel: { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '22px 0 10px' },
  snapGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' },
  snapItem: { fontSize: 13 }, snapK: { color: 'var(--text-secondary)' }, snapV: { color: 'var(--text-primary)', fontWeight: 600 },
  bucketRow: { fontSize: 13, lineHeight: 1.5, marginBottom: 4, display: 'flex', gap: 7 },
  statusSelect: { fontFamily: 'var(--font-body)', fontSize: 14, padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', width: '100%' },
  confirm: { fontSize: 13, color: SEM.green, marginTop: 8, fontWeight: 600 },
  errorMsg: { fontSize: 13, color: SEM.red, marginTop: 8 },
};

function Bucket({ items, color, glyph }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      {items.map((t, i) => (
        <div key={i} style={css.bucketRow}><span style={{ color, fontWeight: 700, flexShrink: 0 }}>{glyph}</span><span style={{ color: 'var(--text-primary)' }}>{t}</span></div>
      ))}
    </div>
  );
}

function Drawer({ app, jobApplyUrl, isMobile, onClose, onStatusChange }) {
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const bd = app.matchBreakdown || {};

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleStatus = async (e) => {
    const next = e.target.value;
    setErr(''); setConfirm('');
    try {
      await onStatusChange(app.applicationId, next); // optimistic handled by parent
      setConfirm(`✓ Marked as ${STATUS[next].label}`);
      setTimeout(() => setConfirm(''), 2000);
    } catch {
      setErr('Could not update status. Please try again.');
    }
  };

  const snap = app.snapshot || {};
  return (
    <>
      <div style={css.scrim} onClick={onClose} />
      <div style={css.drawer(isMobile)} role="dialog" aria-label={`Applicant ${app.pilotName}`}>
        <div style={css.drawerTop}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{app.pilotName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Applied {appliedAgo(app.appliedAt)}</div>
          </div>
          <button style={css.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          {app.matchScore != null
            ? <MatchScore score={app.matchScore} size="lg" />
            : <div><div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: 'var(--text-secondary)' }}>—</div><div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Below requirements</div></div>}
          <Badge variant={(STATUS[app.status] || STATUS.APPLIED).variant}>{(STATUS[app.status] || STATUS.APPLIED).label}</Badge>
        </div>

        <div style={css.sectionLabel}>Match breakdown</div>
        {(bd.matched?.length || bd.marginal?.length || bd.missing?.length) ? (
          <div>
            <Bucket items={bd.matched} color={SEM.green} glyph="✓" />
            <Bucket items={bd.marginal} color={SEM.amber} glyph="~" />
            <Bucket items={bd.missing} color={SEM.red} glyph="✗" />
          </div>
        ) : <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No requirement breakdown captured.</div>}

        <div style={css.sectionLabel}>Pilot snapshot</div>
        <div style={css.snapGrid}>
          <div style={css.snapItem}><span style={css.snapK}>Role: </span><span style={css.snapV}>{ROLE_LABEL[snap.role] || snap.role || '—'}</span></div>
          <div style={css.snapItem}><span style={css.snapK}>Total hours: </span><span style={css.snapV}>{(snap.totalHours ?? 0).toLocaleString()}</span></div>
          <div style={css.snapItem}><span style={css.snapK}>PIC hours: </span><span style={css.snapV}>{(snap.picHours ?? 0).toLocaleString()}</span></div>
          <div style={css.snapItem}><span style={css.snapK}>Licences: </span><span style={css.snapV}>{snap.licences?.length ? snap.licences.join(', ') : '—'}</span></div>
          <div style={css.snapItem}><span style={css.snapK}>Type ratings: </span><span style={css.snapV}>{snap.ratings?.length ? snap.ratings.join(', ') : '—'}</span></div>
          <div style={css.snapItem}><span style={css.snapK}>Medical: </span><span style={css.snapV}>{snap.medicalClass ? snap.medicalClass.replace('CLASS_', 'Class ') : '—'}</span></div>
          <div style={css.snapItem}><span style={css.snapK}>ELP: </span><span style={css.snapV}>{snap.elpLevel || '—'}</span></div>
          <div style={css.snapItem}><span style={css.snapK}>Right to work: </span><span style={css.snapV}>{snap.rightToWork?.length ? snap.rightToWork.join(', ') : '—'}</span></div>
        </div>

        <div style={css.sectionLabel}>Status</div>
        <select style={css.statusSelect} value={app.status} onChange={handleStatus} aria-label="Application status">
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
        {confirm && <div style={css.confirm}>{confirm}</div>}
        {err && <div style={css.errorMsg}>{err}</div>}

        {jobApplyUrl && (
          <div style={{ marginTop: 22 }}>
            <a href={jobApplyUrl} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              Open in external ATS →
            </a>
          </div>
        )}
      </div>
    </>
  );
}

export default function EmployerApplicants() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  useBodyBackground('#F3F4F6');

  const [data, setData] = useState(null);   // { job, applicants }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError('');
    employerApi.getApplicants(id)
      .then(({ data }) => setData(data))
      .catch((err) => {
        if (err.response?.status === 403) setError('You do not have access to this job.');
        else setError(err.response?.data?.error || 'Could not load applicants.');
      })
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Ranked by match desc; null scores sorted to the end (Postgres puts NULLS FIRST on DESC).
  const ranked = useMemo(
    () => [...(data?.applicants || [])].sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1)),
    [data],
  );
  const counts = useMemo(() => {
    const c = { ALL: ranked.length };
    STATUS_ORDER.forEach((s) => { c[s] = ranked.filter((a) => a.status === s).length; });
    return c;
  }, [ranked]);
  const visible = filter === 'ALL' ? ranked : ranked.filter((a) => a.status === filter);
  const openApp = ranked.find((a) => a.applicationId === openId) || null;

  // Optimistic status update + revert on failure.
  const handleStatusChange = async (applicationId, next) => {
    const prev = data;
    setData((d) => ({ ...d, applicants: d.applicants.map((a) => a.applicationId === applicationId ? { ...a, status: next } : a) }));
    try {
      await employerApi.updateApplicationStatus(applicationId, next);
    } catch (e) {
      setData(prev); // revert
      throw e;
    }
  };

  return (
    <div className="app-b2b" style={css.page}>
      <div style={css.wrap}>
        <button style={css.back} onClick={() => navigate('/employer/dashboard')}>← Back to dashboard</button>
        <div style={css.h1}>Applicants{data?.job ? ` for ${data.job.title}` : ''}</div>
        <div style={css.sub}>{loading ? 'Loading…' : error ? '' : `${ranked.length} applicant${ranked.length === 1 ? '' : 's'} · ranked by match`}</div>

        {loading ? null : error ? (
          <div style={css.empty}>{error}</div>
        ) : ranked.length === 0 ? (
          <div style={css.empty}>No applicants yet — share the job link to attract candidates.</div>
        ) : (
          <>
            <div style={css.pills}>
              {['ALL', ...STATUS_ORDER].map((s) => {
                const on = filter === s;
                return (
                  <button key={s} style={css.pill(on)} onClick={() => setFilter(s)}>
                    {s === 'ALL' ? 'All' : STATUS[s].label}
                    <span style={css.pillCount(on)}>{counts[s] ?? 0}</span>
                  </button>
                );
              })}
            </div>

            {visible.length === 0 ? (
              <div style={css.empty}>No applicants in this status.</div>
            ) : visible.map((a) => {
              const snap = a.snapshot || {};
              const st = STATUS[a.status] || STATUS.APPLIED;
              return (
                <div key={a.applicationId} style={css.card} onClick={() => setOpenId(a.applicationId)}>
                  <div style={{ minWidth: 72, flexShrink: 0 }}>
                    {a.matchScore != null
                      ? <MatchScore score={a.matchScore} size="sm" />
                      : <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>—</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={css.name}>{a.pilotName}</div>
                    <div style={css.meta}>
                      <span>{ROLE_LABEL[snap.role] || snap.role || '—'}</span>
                      <span>{(snap.totalHours ?? 0).toLocaleString()} hrs</span>
                      {snap.licences?.[0] && <span>{snap.licences.join(', ')}</span>}
                      {snap.ratings?.[0] && <span>{snap.ratings.slice(0, 3).join(', ')}</span>}
                      {snap.elpLevel && <span>ELP {snap.elpLevel}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <Badge variant={st.variant}>{st.label}</Badge>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{appliedAgo(a.appliedAt)}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {openApp && (
        <Drawer
          app={openApp}
          jobApplyUrl={data?.job?.applyUrl}
          isMobile={isMobile}
          onClose={() => setOpenId(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
