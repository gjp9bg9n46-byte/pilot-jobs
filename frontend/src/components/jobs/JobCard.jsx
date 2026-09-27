import React from 'react';
import { Check, X, HelpCircle } from 'lucide-react';
import AirlineLogo from '../AirlineLogo';
import AdzunaAttribution from './AdzunaAttribution';
import { postedAgo, formatSalary } from '../../lib/jobMatch';
import { displayTitle, countryFlag, jobChips, checklist, sourceInfo } from '../../lib/jobDisplay';

// One job card in the redesigned list (mockup .jc). Renders from a job that carries
// the shared `match` payload. Logos use AirlineLogo (real logos, hideIfMissing).
export default function JobCard({ job, selected, onClick, compact = false, logoUrl = null }) {
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

  // Root is a role=button div (not a <button>) so the required Adzuna attribution
  // link can be nested legally (an <a> inside a <button> is invalid HTML).
  return (
    <div
      role="button"
      tabIndex={0}
      className={`jc${selected ? ' sel' : ''}`}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      aria-pressed={selected}
    >
      <div className="top">
        <div className="tt">
          <div className="title">{displayTitle(job.title)}</div>
          <div className="meta">
            <b>{job.company}</b>
            {flag ? <> · <span aria-hidden="true">{flag}</span> {loc}</> : (loc ? ` · ${loc}` : '')}
            {timeLine ? ` · ${timeLine}` : ''}
          </div>
        </div>
        <div className="logo-slot"><AirlineLogo logoUrl={logoUrl} name={job.company} box={42} maxW={42} hideIfMissing /></div>
      </div>

      {chips.length > 0 && (
        <div className="chips">
          {chips.map((c, i) => <span key={i} className={`chip${c.visa ? ' visa' : ''}`}>{c.text}</span>)}
        </div>
      )}

      {checks.length > 0 && (
        <div className="check">
          {checks.map((c, i) => (
            <span key={i} className={c.status === 'met' ? 'ok' : c.status === 'unmet' ? 'no' : 'unk'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              {c.status === 'met' ? <Check size={13} /> : c.status === 'unmet' ? <X size={13} /> : <HelpCircle size={13} />} {c.text}
            </span>
          ))}
        </div>
      )}

      <div className="src">
        {/* Direct jobs keep the green direct-apply line. Adzuna shows its required
            "Jobs by Adzuna" attribution. Other aggregators show no source line —
            the source now lives only on the Apply button in the detail pane. */}
        {src.direct
          ? <span className="direct"><Check size={12} style={{ verticalAlign: -1, marginRight: 2 }} />{compact ? 'Apply direct' : src.label}</span>
          : src.isAdzuna
            ? <AdzunaAttribution />
            : <span />}
        <span className="sal">{sal || 'Salary not stated'}</span>
      </div>
    </div>
  );
}
