import React from 'react';

// Visual mirror of the public Jobs.jsx card (kept self-contained — no pilot
// imports). Uses var() tokens so the JobForm can wrap it in an .app-light
// island and render it in the WARM pilot palette (WYSIWYG of pilot output),
// regardless of the surrounding cool .app-b2b employer scope.
const ROLE_LABEL = { CAPTAIN: 'CAPTAIN', FIRST_OFFICER: 'FIRST OFFICER', INSTRUCTOR: 'INSTRUCTOR', FLIGHT_ENGINEER: 'FLIGHT ENG' };

const css = {
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380, fontFamily: 'var(--font-body)' },
  top: { display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3 },
  roleBadge: { fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(0,63,136,0.08)', border: '1px solid rgba(0,63,136,0.25)', borderRadius: 5, padding: '2px 7px', letterSpacing: 0.3, whiteSpace: 'nowrap' },
  authBadge: { fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' },
  // Identical to css.employerBadge in Jobs.jsx so the preview matches the real card.
  employerBadge: { display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 8px', letterSpacing: 0.2, whiteSpace: 'nowrap' },
  airline: { fontSize: 14, color: 'var(--accent)', fontWeight: 600 },
  metaRow: { display: 'flex', flexWrap: 'wrap', gap: 12, color: 'var(--text-secondary)', fontSize: 12 },
  reqs: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  req: { fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 8px' },
  salary: { display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#92400E' },
  empty: { color: 'var(--text-secondary)', fontSize: 13, fontStyle: 'italic' },
};

function fmtSalary(j) {
  if (j.salaryMin == null && j.salaryMax == null) return null;
  const cur = j.salaryCurrency || '';
  const per = j.salaryPeriod ? `/${String(j.salaryPeriod).toLowerCase()}` : '';
  const n = (v) => Number(v).toLocaleString();
  if (j.salaryMin != null && j.salaryMax != null) return `${cur} ${n(j.salaryMin)}–${n(j.salaryMax)}${per}`;
  return `${cur} ${n(j.salaryMin ?? j.salaryMax)}${per}`;
}

export default function JobPreviewCard({ job, company }) {
  const salary = fmtSalary(job);
  return (
    <div style={css.card}>
      <span style={css.employerBadge}>Posted directly by employer</span>
      <div style={css.top}>
        <div style={css.title}>{job.title?.trim() || 'Job title'}</div>
        {job.role && <div style={css.roleBadge}>{ROLE_LABEL[job.role] || job.role}</div>}
        {job.reqAuthorities?.[0] && <div style={css.authBadge}>{job.reqAuthorities[0]}</div>}
      </div>
      <div>
        <div style={css.airline}>{company || 'Your company'}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Posted just now</div>
      </div>
      <div style={css.metaRow}>
        <span>📍 {job.location?.trim() || 'Location'}</span>
        {job.reqMinTotalHours ? <span>🕑 {Number(job.reqMinTotalHours).toLocaleString()} hrs min</span> : null}
        {job.reqCertificates?.[0] ? <span>📄 {job.reqCertificates[0]}</span> : null}
      </div>
      {job.reqAircraftTypes?.length > 0 && (
        <div style={css.reqs}>{job.reqAircraftTypes.slice(0, 3).map((a) => <span key={a} style={css.req}>{a}</span>)}</div>
      )}
      {salary && <div style={css.salary}>$ {salary}</div>}
      {!job.title?.trim() && !job.description?.trim() && (
        <div style={css.empty}>Start filling the form to see your job card preview.</div>
      )}
    </div>
  );
}
