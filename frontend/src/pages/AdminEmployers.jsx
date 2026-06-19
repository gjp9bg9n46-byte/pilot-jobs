import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../services/api';
import { useIsMobile } from '../hooks/useIsMobile';

const TABS = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];
const TYPE_LABEL = { AIRLINE: 'Airline', CHARTER: 'Charter', CARGO: 'Cargo', EMS: 'EMS / Air Ambulance', FLIGHT_SCHOOL: 'Flight School', CORPORATE: 'Corporate', RECRUITER: 'Recruiter / Agency', OTHER: 'Other' };
const STATUS_COLOR = { PENDING: ['#E0C24A', 'rgba(224,194,74,0.12)'], APPROVED: ['#34D399', 'rgba(52,211,153,0.12)'], REJECTED: ['#FF6B6B', 'rgba(255,107,107,0.12)'], SUSPENDED: ['#F59E0B', 'rgba(245,158,11,0.12)'] };
const REASON_MIN = 10, REASON_MAX = 500;

const css = {
  page: { padding: '24px 20px 64px', maxWidth: 960, margin: '0 auto' },
  h1: { fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 },
  sub: { color: '#7A8CA0', fontSize: 14, marginBottom: 20 },
  toast: (ok) => ({ borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontWeight: 600, fontSize: 14, color: ok ? '#34D399' : '#FF6B6B', background: ok ? 'rgba(52,211,153,0.12)' : 'rgba(255,107,107,0.12)', border: `1px solid ${ok ? '#34D39955' : '#FF6B6B55'}` }),
  tabBar: { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 16, WebkitOverflowScrolling: 'touch' },
  tab: (on) => ({ flexShrink: 0, cursor: 'pointer', padding: '9px 15px', borderRadius: 999, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', border: '1px solid ' + (on ? '#00B4D8' : '#243050'), background: on ? 'rgba(0,180,216,0.12)' : '#0D1E35', color: on ? '#00B4D8' : '#7A8CA0' }),
  count: (on) => ({ marginLeft: 7, fontSize: 12, fontWeight: 800, color: on ? '#00B4D8' : '#5E6B80' }),
  search: { width: '100%', background: '#0D1E35', border: '1px solid #243050', borderRadius: 10, padding: '11px 13px', color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box', marginBottom: 16 },
  row: { background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 12, padding: 16, marginBottom: 12 },
  rowTop: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', cursor: 'pointer', flexWrap: 'wrap' },
  name: { fontSize: 16, fontWeight: 700, color: '#fff' },
  meta: { color: '#7A8CA0', fontSize: 13, marginTop: 3 },
  badge: (c) => ({ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, color: c[0], background: c[1], border: `1px solid ${c[0]}55`, whiteSpace: 'nowrap' }),
  actions: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  btn: { border: '1px solid #2A3A55', background: '#16263F', borderRadius: 8, padding: '8px 14px', color: '#C0CDE0', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnGreen: { border: '1px solid #1E5C3E', background: 'rgba(52,211,153,0.12)', color: '#34D399' },
  btnRed: { border: '1px solid #5C2626', background: '#2D1A1A', color: '#FF8A8A' },
  detail: { marginTop: 14, paddingTop: 14, borderTop: '1px solid #1E3050', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' },
  dItem: { fontSize: 13 }, dK: { color: '#6B7A90' }, dV: { color: '#C0CDE0', fontWeight: 600 },
  reasonBox: { gridColumn: '1 / -1', background: '#1C1010', border: '1px solid #3D2020', borderRadius: 8, padding: '10px 12px', color: '#FF8A8A', fontSize: 13 },
  jobsLine: { gridColumn: '1 / -1', fontSize: 13, color: '#C0CDE0' },
  link: { color: '#00B4D8', fontWeight: 600, textDecoration: 'none' },
  empty: { background: '#0D1E35', border: '1px dashed #243050', borderRadius: 12, padding: '40px 20px', textAlign: 'center', color: '#7A8CA0' },
  modalBg: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 18 },
  modal: { background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 14, padding: 22, maxWidth: 440, width: '100%' },
  mTitle: { fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 12 },
  mNote: { color: '#A8B6CC', fontSize: 13, marginBottom: 14, lineHeight: 1.5 },
  textarea: { width: '100%', background: '#1B2B4B', border: '1px solid #243050', borderRadius: 9, padding: '11px 13px', color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box', minHeight: 90, resize: 'vertical', fontFamily: 'inherit' },
  mErr: { color: '#FF6B6B', fontSize: 12, marginTop: 6 },
  mRow: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 },
};

function fmtDate(d) { return d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; }

export default function AdminEmployers() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [employers, setEmployers] = useState(null);
  const [tab, setTab] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [modal, setModal] = useState(null); // { type:'approve'|'reject'|'suspend', emp }
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null); // { ok, msg }

  const load = useCallback(async () => {
    try { const { data } = await adminApi.listEmployers(); setEmployers(data); }
    catch (err) {
      if (err.response?.status === 404 || err.response?.status === 401) navigate('/jobs', { replace: true });
      else setEmployers([]);
    }
  }, [navigate]);
  useEffect(() => { load(); }, [load]);

  const showToast = (ok, msg) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 4000); };
  const counts = useMemo(() => {
    const c = { PENDING: 0, APPROVED: 0, REJECTED: 0, SUSPENDED: 0 };
    (employers || []).forEach((e) => { c[e.status] = (c[e.status] || 0) + 1; });
    return c;
  }, [employers]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employers || []).filter((e) => e.status === tab)
      .filter((e) => !q || e.companyName.toLowerCase().includes(q) || e.contactEmail.toLowerCase().includes(q));
  }, [employers, tab, search]);

  const patch = (id, changes) => setEmployers((prev) => prev.map((e) => e.id === id ? { ...e, ...changes } : e));

  const doAction = async (type, emp, reasonText) => {
    setBusy(true);
    const prevStatus = emp.status;
    const optimistic = { approve: { status: 'APPROVED', approvedAt: new Date().toISOString() }, reject: { status: 'REJECTED', rejectionReason: reasonText }, suspend: { status: 'SUSPENDED', rejectionReason: reasonText } }[type];
    patch(emp.id, optimistic); // optimistic move
    try {
      if (type === 'approve') await adminApi.approveEmployer(emp.id);
      if (type === 'reject') await adminApi.rejectEmployer(emp.id, reasonText);
      if (type === 'suspend') await adminApi.suspendEmployer(emp.id, reasonText);
      showToast(true, `${emp.companyName} ${type === 'approve' ? 'approved' : type === 'reject' ? 'rejected' : 'suspended'}.`);
      setModal(null); setReason(''); setTouched(false);
      load(); // re-sync from DB (authoritative timestamps/approver)
    } catch (err) {
      patch(emp.id, { status: prevStatus }); // revert
      showToast(false, err.response?.data?.error || 'Action failed. Please try again.');
    } finally { setBusy(false); }
  };

  const openModal = (type, emp) => { setModal({ type, emp }); setReason(''); setTouched(false); };
  const reasonValid = reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX;

  const Row = ({ e }) => {
    const sc = STATUS_COLOR[e.status];
    const open = expanded === e.id;
    return (
      <div style={css.row}>
        <div style={css.rowTop} onClick={() => setExpanded(open ? null : e.id)}>
          <div>
            <div style={css.name}>{e.companyName}</div>
            <div style={css.meta}>{TYPE_LABEL[e.companyType] || e.companyType} · {e.country}</div>
            <div style={css.meta}>{e.contactName} · {e.contactEmail}</div>
            <div style={css.meta}>Registered {fmtDate(e.createdAt)}</div>
          </div>
          <span style={css.badge(sc)}>{e.status}</span>
        </div>

        {open && (
          <div style={css.detail}>
            <div style={css.dItem}><span style={css.dK}>HQ City: </span><span style={css.dV}>{e.headquartersCity || '—'}</span></div>
            <div style={css.dItem}><span style={css.dK}>Website: </span>{e.website ? <a href={e.website} target="_blank" rel="noreferrer" style={css.link}>{e.website}</a> : <span style={css.dV}>—</span>}</div>
            <div style={css.dItem}><span style={css.dK}>IATA / ICAO: </span><span style={css.dV}>{e.iataCode || '—'} / {e.icaoCode || '—'}</span></div>
            <div style={css.dItem}><span style={css.dK}>Phone: </span><span style={css.dV}>{e.contactPhone || '—'}</span></div>
            <div style={css.dItem}><span style={css.dK}>Registered: </span><span style={css.dV}>{fmtDate(e.createdAt)}</span></div>
            <div style={css.dItem}><span style={css.dK}>Approved: </span><span style={css.dV}>{e.approvedAt ? `${fmtDate(e.approvedAt)} by ${e.approvedBy || '—'}` : '—'}</span></div>
            {e.description && <div style={{ ...css.dItem, gridColumn: '1 / -1' }}><span style={css.dK}>Description: </span><span style={css.dV}>{e.description}</span></div>}
            {(e.status === 'REJECTED' || e.status === 'SUSPENDED') && e.rejectionReason && (
              <div style={css.reasonBox}><strong>{e.status === 'REJECTED' ? 'Rejection' : 'Suspension'} reason:</strong> {e.rejectionReason}</div>
            )}
            <div style={css.jobsLine}>
              Posted jobs ({e._count?.postedJobs ?? 0})
              {(e._count?.postedJobs ?? 0) > 0 && <> · <a style={css.link} href={`/jobs?q=${encodeURIComponent(e.companyName)}`}>View on Jobs page →</a></>}
            </div>
          </div>
        )}

        <div style={css.actions}>
          {e.status === 'PENDING' && <>
            <button style={{ ...css.btn, ...css.btnGreen }} onClick={() => openModal('approve', e)}>Approve</button>
            <button style={{ ...css.btn, ...css.btnRed }} onClick={() => openModal('reject', e)}>Reject</button>
          </>}
          {e.status === 'APPROVED' && <>
            <button style={css.btn} onClick={() => setExpanded(open ? null : e.id)}>{open ? 'Hide details' : 'View details'}</button>
            <button style={{ ...css.btn, ...css.btnRed }} onClick={() => openModal('suspend', e)}>Suspend</button>
          </>}
          {e.status === 'REJECTED' && <>
            <button style={css.btn} onClick={() => setExpanded(open ? null : e.id)}>{open ? 'Hide details' : 'View details'}</button>
            <button style={{ ...css.btn, ...css.btnGreen }} onClick={() => openModal('approve', e)}>Re-approve</button>
          </>}
          {e.status === 'SUSPENDED' && <>
            <button style={css.btn} onClick={() => setExpanded(open ? null : e.id)}>{open ? 'Hide details' : 'View details'}</button>
            <button style={{ ...css.btn, ...css.btnGreen }} onClick={() => openModal('approve', e)}>Unsuspend</button>
          </>}
        </div>
      </div>
    );
  };

  return (
    <div style={css.page}>
      <div style={css.h1}>Employer Moderation</div>
      <div style={css.sub}>Review and manage employer accounts. Notifications are logged; email delivery is pending Resend integration.</div>

      {toast && <div style={css.toast(toast.ok)}>{toast.msg}</div>}

      <div style={{ ...css.tabBar, ...(isMobile ? { flexWrap: 'wrap', overflowX: 'visible', paddingBottom: 0 } : null) }}>
        {TABS.map((t) => (
          <div key={t} style={{ ...css.tab(tab === t), ...(isMobile ? { padding: '8px 12px' } : null) }} onClick={() => { setTab(t); setExpanded(null); }}>
            {t.charAt(0) + t.slice(1).toLowerCase()}<span style={css.count(tab === t)}>{counts[t]}</span>
          </div>
        ))}
      </div>

      <input style={css.search} placeholder="Search by company name or contact email…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {employers === null ? <div style={{ color: '#7A8CA0' }}>Loading…</div>
        : visible.length === 0 ? <div style={css.empty}>No {tab.toLowerCase()} employers{search ? ' match your search' : ''}.</div>
          : visible.map((e) => <Row key={e.id} e={e} />)}

      {modal && (
        <div style={css.modalBg} onClick={() => !busy && setModal(null)}>
          <div style={css.modal} onClick={(ev) => ev.stopPropagation()}>
            {modal.type === 'approve' && <>
              <div style={css.mTitle}>Approve {modal.emp.companyName}?</div>
              <div style={css.mNote}>This employer will be able to post jobs immediately. They'll receive an approval email.</div>
              <div style={css.mRow}>
                <button style={css.btn} disabled={busy} onClick={() => setModal(null)}>Cancel</button>
                <button style={{ ...css.btn, ...css.btnGreen }} disabled={busy} onClick={() => doAction('approve', modal.emp)}>{busy ? 'Approving…' : 'Confirm Approve'}</button>
              </div>
            </>}
            {(modal.type === 'reject' || modal.type === 'suspend') && <>
              <div style={css.mTitle}>{modal.type === 'reject' ? 'Reject' : 'Suspend'} {modal.emp.companyName}</div>
              {modal.type === 'suspend' && <div style={css.mNote}>Suspension blocks new job posting but does NOT remove existing jobs from the public Jobs page.</div>}
              <textarea style={css.textarea} placeholder={`Reason (${REASON_MIN}–${REASON_MAX} characters)…`} value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)} maxLength={REASON_MAX} />
              {touched && !reasonValid && <div style={css.mErr}>Reason must be {REASON_MIN}–{REASON_MAX} characters.</div>}
              <div style={css.mRow}>
                <button style={css.btn} disabled={busy} onClick={() => setModal(null)}>Cancel</button>
                <button style={{ ...css.btn, ...css.btnRed, opacity: reasonValid && !busy ? 1 : 0.5 }} disabled={!reasonValid || busy}
                  onClick={() => doAction(modal.type, modal.emp, reason.trim())}>
                  {busy ? 'Saving…' : (modal.type === 'reject' ? 'Confirm Reject' : 'Confirm Suspend')}
                </button>
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
