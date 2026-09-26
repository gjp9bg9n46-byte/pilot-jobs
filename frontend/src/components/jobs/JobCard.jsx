import React from 'react';
import AirlineLogo from '../AirlineLogo';
import { postedAgo, formatSalary } from '../../lib/jobMatch';
import { displayTitle, countryFlag, jobChips, checklist, sourceInfo } from '../../lib/jobDisplay';

// One job card in the redesigned list (mockup .jc). Renders from a job that carries
// the shared `match` payload. Logos use AirlineLogo (real logos, hideIfMissing).
export default function JobCard({ job, selected, onClick }) {
  const chips = jobChips(job);
  const checks = checklist(job.match, 4);
  const src = sourceInfo(job);
  const sal = formatSalary(job, true);
  const flag = countryFlag(job.country);
  const loc = job.location || job.country || '';
  // Evergreen/ongoing rows keep an honest "Ongoing · link checked {date}" label
  // (their posted date is stale but the vacancy is live — the liveness checker
  // confirms it). Fresh rows show "posted X ago".
  const checked = job.lastSeenAt ? new Date(job.lastSeenAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
  const timeLine = job.evergreen
    ? `Ongoing${checked ? ` · link checked ${checked}` : ''}`
    : (job.postedAt ? postedAgo(job.postedAt) : '');

  return (
    <button type="button" className={`jc${selected ? ' sel' : ''}`} onClick={onClick} aria-pressed={selected}>
      <div className="top">
        <div className="tt">
          <div className="title">{displayTitle(job.title)}</div>
          <div className="meta">
            <b>{job.company}</b>
            {flag ? <> · <span aria-hidden="true">{flag}</span> {loc}</> : (loc ? ` · ${loc}` : '')}
            {timeLine ? ` · ${timeLine}` : ''}
          </div>
        </div>
        <div className="logo-slot"><AirlineLogo name={job.company} size={42} hideIfMissing /></div>
      </div>

      {chips.length > 0 && (
        <div className="chips">
          {chips.map((c, i) => <span key={i} className={`chip${c.visa ? ' visa' : ''}`}>{c.text}</span>)}
        </div>
      )}

      {checks.length > 0 && (
        <div className="check">
          {checks.map((c, i) => (
            <span key={i} className={c.status === 'met' ? 'ok' : c.status === 'unmet' ? 'no' : 'unk'}>
              {c.status === 'met' ? '✓' : c.status === 'unmet' ? '✗' : '?'} {c.text}
            </span>
          ))}
        </div>
      )}

      <div className="src">
        <span className={src.direct ? 'direct' : 'via'}>{src.direct ? '✓ ' : ''}{src.label}</span>
        <span className="sal">{sal || 'Salary not stated'}</span>
      </div>
    </button>
  );
}
