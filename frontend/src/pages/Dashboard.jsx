import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { dashboardApi, jobApi } from '../services/api';
import { LightPage } from '../components/primitives';
import { statusMeta } from '../lib/jobMatch';
import { roleLabel } from '../lib/jobDisplay';
import { companyName, locationName } from '../lib/displayNames';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtD = (iso) => { if (!iso) return null; const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

const C = {
  line: '#E3E8EF', ink: '#0F1B2D', sub: '#4A5668', faint: '#8592A3', navy: '#003F88',
  green: '#15803D', greenbg: '#ECF7EF', amber: '#B45309', amberbg: '#FEF6E7', red: '#B42318', redbg: '#FDEEEC',
};
const serif = 'Fraunces, Georgia, serif';

const ago = (d) => {
  if (!d) return null;
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  if (days <= 0) return 'today'; if (days === 1) return '1 day ago'; return `${days} days ago`;
};
const weekday = (d) => (d ? new Date(d).toLocaleDateString('en-US', { weekday: 'long' }) : null);
const STATUS_DOT = { OPENED: '#8592A3', APPLIED: C.navy, INTERVIEW: C.green, OFFER: C.green, NOT_SELECTED: C.red, CLOSED: '#CBD3DD' };
const STATUS_LABEL = { OPENED: 'Opened', APPLIED: 'Applied', INTERVIEW: 'Interview', OFFER: 'Offer', NOT_SELECTED: 'Not selected', CLOSED: 'Closed' };

function Card({ title, action, children }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, marginBottom: 22 }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 0' }}>
          <h2 style={{ fontFamily: serif, fontWeight: 600, fontSize: 19, margin: 0 }}>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function Pct({ match }) {
  const m = statusMeta(match);
  if (!m || match.pct == null) {
    return <span style={{ fontSize: 12.5, color: C.faint }}>{match?.status === 'NO_REQUIREMENTS' ? 'No requirements stated' : 'Not stated'}</span>;
  }
  return (
    <span style={{ display: 'inline-block', textAlign: 'right' }}>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, fontFamily: serif, fontWeight: 600, fontSize: 22, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: m.color }}>
        {match.pct}%<small style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, fontWeight: 600, color: C.faint }}>match</small>
      </span>
      {match.stated > 0 && <small style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500, color: C.faint, marginTop: 2 }}>{match.met} of {match.stated} met</small>}
    </span>
  );
}

function JobRow({ item, onView }) {
  const j = item.job; const m = j.match; const meta = statusMeta(m);
  const pill = m && (m.status === 'QUALIFY' ? { t: 'You qualify', bg: C.greenbg, c: C.green }
    : (m.status === 'SHORT' || m.status === 'CHECK') ? { t: m.status === 'SHORT' ? '1 short' : 'Check', bg: C.amberbg, c: C.amber } : null);
  const sub = [companyName(j.company), locationName(j.location || j.country), ago(j.postedAt) && `${ago(j.postedAt)}`, j.sourceType && j.sourceType !== 'aggregator' ? 'Direct apply' : null].filter(Boolean).join(' · ');
  return (
    <div className="dash-job" style={{ borderTop: `1px solid ${C.line}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>
          {item.isNew && <i style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: C.navy, marginRight: 7, verticalAlign: 'middle' }} />}
          {j.title}
        </div>
        <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>{sub}</div>
        {(pill || meta?.shortfall) && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, marginTop: 4, flexWrap: 'wrap' }}>
            {pill && <span style={{ borderRadius: 20, padding: '2px 10px', fontWeight: 600, fontSize: 12, background: pill.bg, color: pill.c }}>{pill.t}</span>}
            {meta?.shortfall && <span style={{ color: C.sub }}>{meta.shortfall}</span>}
            {m?.category?.advisory && <span style={{ color: C.faint }}>· {m.category.advisory}</span>}
          </div>
        )}
      </div>
      {/* % and View on ONE line, right side (#3) */}
      <div className="dash-jobside" style={{ display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}>
        <Pct match={m} />
        <button onClick={() => onView(j.id)} style={{ height: 34, padding: '0 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, border: `1px solid ${m?.status === 'QUALIFY' ? C.navy : C.line}`, background: m?.status === 'QUALIFY' ? C.navy : '#fff', color: m?.status === 'QUALIFY' ? '#fff' : C.ink, cursor: 'pointer' }}>View</button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('allNew');
  const [dismissed, setDismissed] = useState({}); // appId → hide "Did you apply?" prompt

  const load = useCallback(async () => {
    try { const res = await dashboardApi.get(); setData(res.data); } catch (e) { setErr(e?.response?.data?.error || 'Could not load your dashboard.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (id, status) => {
    try { await jobApi.setApplicationStatus(id, status); setData((d) => ({ ...d, applications: d.applications.map((a) => (a.id === id ? { ...a, status } : a)) })); }
    catch { /* no-op */ }
  };

  const nj = data?.newJobs;
  // New items first (stable — keeps the server's match%/recency order within each group).
  const list = useMemo(() => (nj ? [...(nj[tab] || nj.allNew || [])].sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0)) : []), [nj, tab]);

  if (err) return <LightPage><div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 32px', color: C.sub }}>{err}</div></LightPage>;
  if (!data) return <LightPage><div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 32px', color: C.sub }}>Loading your dashboard…</div></LightPage>;

  const newCount = nj.newSinceLastVisit;
  const lastDay = weekday(nj.lastVisit);
  const prof = data.profile; const al = data.alertSettings;

  return (
    <LightPage>
      <div className="dash-wrap" style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 32px 80px', boxSizing: 'border-box' }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontFamily: serif, fontWeight: 600, fontSize: 30, margin: 0 }}>Dashboard</h1>
          <p style={{ margin: '4px 0 0', color: C.sub, fontSize: 14 }}>
            {newCount > 0 ? `${newCount} new job${newCount === 1 ? '' : 's'}${lastDay ? ` since your last visit on ${lastDay}` : ' for you'}.` : 'No new jobs since your last visit.'}
          </p>
        </div>

        {data.blockers?.count > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
            {data.blockers.items.map((i) => {
              const expired = i.days != null && i.days < 0;
              const col = expired ? { bg: C.redbg, bd: '#F4CFCB', fg: C.red } : { bg: C.amberbg, bd: '#F5E0B8', fg: C.amber };
              return (
                <div key={i.type} style={{ display: 'flex', alignItems: 'center', gap: 10, background: col.bg, border: `1px solid ${col.bd}`, borderRadius: 10, padding: '10px 14px', fontSize: 13.5 }}>
                  <AlertTriangle size={16} color={col.fg} />
                  <span style={{ color: C.ink }}><b style={{ fontWeight: 600, color: col.fg }}>{i.label} {expired ? 'expired' : 'expires'} {fmtD(i.date)}</b></span>
                  <a onClick={() => navigate('/profile')} style={{ marginLeft: 'auto', color: C.navy, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Update</a>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 24, alignItems: 'start' }} className="dash-grid">
          <div>
            <Card title="Your matches" action={<a onClick={() => navigate('/jobs')} style={{ fontSize: 13, fontWeight: 600, color: C.navy, cursor: 'pointer' }}>All matching jobs</a>}>
              <div style={{ display: 'flex', gap: 6, padding: '14px 18px 6px', overflowX: 'auto' }}>
                {[['allNew', 'All', nj.counts.all], ['qualify', 'You qualify', nj.counts.qualify], ['oneShort', '1 short', nj.counts.oneShort]].map(([k, lbl, n]) => (
                  <button key={k} onClick={() => setTab(k)} style={{ whiteSpace: 'nowrap', border: `1px solid ${tab === k ? C.ink : C.line}`, background: tab === k ? C.ink : '#fff', color: tab === k ? '#fff' : C.sub, borderRadius: 20, padding: '6px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {lbl}<span style={{ fontWeight: 500, opacity: 0.75, marginLeft: 4 }}>{n}</span>
                  </button>
                ))}
                <span className="dash-seg-note" style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12.5, color: C.faint, fontWeight: 500, whiteSpace: 'nowrap' }}>Sorted by match %, then newest</span>
              </div>
              {list.length === 0 ? <div style={{ padding: '18px', color: C.sub, fontSize: 14 }}>No jobs in this group yet.</div>
                : list.map((item) => <JobRow key={item.id} item={{ job: item, isNew: item.isNew }} onView={(id) => navigate(`/jobs/${id}`)} />)}
              <div style={{ padding: '10px 18px 14px', borderTop: `1px solid ${C.line}`, fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
                Match % = stated requirements you meet ÷ stated requirements. Requirements the airline didn't state are shown, not counted. Same number as on the Jobs page.
              </div>
            </Card>

            <Card title="Your applications" action={<a onClick={() => navigate('/jobs?view=applications')} style={{ fontSize: 13, fontWeight: 600, color: C.navy, cursor: 'pointer' }}>Show all {data.applications.length}</a>}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <tbody>
                  {data.applications.slice(0, 6).map((a) => (
                    <tr key={a.id}>
                      <td style={{ padding: '10px 18px', borderTop: `1px solid ${C.line}` }}>
                        <div style={{ fontWeight: 600 }}>{a.job?.title || '—'}</div>
                        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>
                          {companyName(a.job?.company)}{a.statusUpdatedAt || a.appliedAt ? ` · opened ${ago(a.appliedAt)}` : ''}{a.job && a.job.status !== 'ACTIVE' && !a.replacement ? ' · job closed' : ''}{a.replacement ? ' · still live' : ''}
                        </div>
                      </td>
                      <td style={{ padding: '10px 18px', borderTop: `1px solid ${C.line}`, textAlign: 'right' }}>
                        {a.status === 'OPENED' && !dismissed[a.id] ? (
                          <span style={{ fontSize: 12.5, color: C.sub, whiteSpace: 'nowrap' }}>Did you apply?
                            <a onClick={() => setStatus(a.id, 'APPLIED')} style={{ color: C.navy, fontWeight: 600, marginLeft: 8, cursor: 'pointer' }}>Yes</a>
                            <a onClick={() => setDismissed((d) => ({ ...d, [a.id]: true }))} style={{ color: C.navy, fontWeight: 600, marginLeft: 8, cursor: 'pointer' }}>No</a>
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, borderRadius: 20, padding: '4px 10px', border: `1px solid ${C.line}`, color: a.status === 'CLOSED' ? C.faint : C.ink }}>
                            <i style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[a.status] || C.faint }} />{STATUS_LABEL[a.status] || a.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ textAlign: 'center', padding: 12, borderTop: `1px solid ${C.line}`, fontSize: 12.5, color: C.faint }}>Statuses: Opened · Applied · Interview · Offer · Not selected · Closed</div>
            </Card>
          </div>

          <div>
            <Card title="Your profile" action={<a onClick={() => navigate('/profile')} style={{ fontSize: 13, fontWeight: 600, color: C.navy, cursor: 'pointer' }}>Open</a>}>
              <div style={{ padding: '12px 18px 16px', fontSize: 13.5 }}>
                <div style={rowCss}><span style={{ color: C.sub }}>Total time</span><span style={{ fontWeight: 600 }}>{(prof.totalHours || 0).toLocaleString()} h</span></div>
                <div style={rowCss}><span style={{ color: C.sub }}>Flights logged</span><span style={{ fontWeight: 600 }}>{prof.flights || 0}</span></div>
                {prof.medicalDaysLeft != null && <div style={rowCss}><span style={{ color: C.sub }}>Medical</span><span style={{ fontWeight: 600, color: prof.medicalDaysLeft < 60 ? C.amber : C.ink }}>{prof.medicalDaysLeft} days left</span></div>}
                {prof.strength && (
                  <>
                    <div style={{ marginTop: 12, fontSize: 13, color: C.sub }}>Profile strength <b style={{ color: C.ink, float: 'right' }}>{prof.strength.pct}%</b></div>
                    <div style={{ height: 6, background: '#E3E8EF', borderRadius: 4, margin: '8px 0' }}><i style={{ display: 'block', height: 6, background: C.navy, borderRadius: 4, width: `${prof.strength.pct}%` }} /></div>
                  </>
                )}
                {prof.nudge?.fields?.length > 0 && <div style={{ fontSize: 13, color: C.sub }}>Add <b style={{ color: C.ink }}>{prof.nudge.fields[0].field}</b> to check {prof.nudge.fields[0].jobs} more jobs.</div>}
              </div>
            </Card>

            <Card title="Alerts">
              <div style={{ padding: '12px 18px 16px', fontSize: 13.5 }}>
                <Toggle label="Push when I qualify for a new job" sub="Phone app" on={al ? al.matchesPush : true} />
                <Toggle label="Also when I'm one requirement short" on={al ? al.alertsPush : true} />
                <Toggle label="Weekly email summary" sub={al && al.emailVerified ? null : 'Verify your email to turn on'} on={al ? al.matchesEmail && al.emailVerified : false} />
              </div>
            </Card>

            <Card title="Saved searches" action={<a onClick={() => navigate('/jobs')} style={{ fontSize: 13, fontWeight: 600, color: C.navy, cursor: 'pointer' }}>New</a>}>
              <div style={{ padding: '12px 18px 16px', fontSize: 13.5, color: C.sub }}>
                {data.savedSearches.some((s) => !s.suggestion) ? data.savedSearches.filter((s) => !s.suggestion).map((s) => (
                  <div key={s.id} style={rowCss}><span>{s.name}</span></div>
                )) : (
                  <>None yet. Save a search to get alerts beyond your profile matches.
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {data.savedSearches.filter((s) => s.suggestion).map((s, i) => (
                        <span key={i} onClick={() => navigate('/jobs')} style={{ border: '1px dashed #BCC6D3', borderRadius: 16, padding: '4px 10px', fontSize: 12.5, color: C.sub, cursor: 'pointer' }}>+ {s.name}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
      <style>{`
        .dash-job{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:0 16px;padding:10px 18px}
        .dash-job>div{min-width:0}
        @media (max-width:820px){
          .dash-wrap{padding-left:16px !important;padding-right:16px !important}
          .dash-grid{grid-template-columns:minmax(0,1fr) !important}
          .dash-job{grid-template-columns:minmax(0,1fr)}
          .dash-jobside{text-align:left !important;display:flex;align-items:center;justify-content:space-between}
          .dash-jobside br{display:none}
          .dash-jobside button{margin-top:0 !important}
          .dash-seg-note{display:none}
        }
      `}</style>
    </LightPage>
  );
}

const rowCss = { display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.line}` };

function Toggle({ label, sub, on }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${C.line}` }}>
      <span>{label}{sub && <small style={{ display: 'block', color: C.faint, fontSize: 12 }}>{sub}</small>}</span>
      <span style={{ width: 34, height: 20, borderRadius: 12, background: on ? C.navy : '#CBD3DD', position: 'relative', flex: 'none' }}>
        <span style={{ position: 'absolute', width: 16, height: 16, borderRadius: '50%', background: '#fff', top: 2, [on ? 'right' : 'left']: 2 }} />
      </span>
    </div>
  );
}
