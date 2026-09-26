import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, HelpCircle, AlertTriangle, ExternalLink, Heart, Share2, Flag, ChevronDown, ChevronUp, ArrowLeft, ArrowRight } from 'lucide-react';
import AirlineLogo from '../AirlineLogo';
import { jobApi } from '../../services/api';
import { postedAgo, formatSalary } from '../../lib/jobMatch';
import { displayTitle, countryFlag, jobChips, sourceInfo, slugFor } from '../../lib/jobDisplay';

// Where an unknown ("?") requirement's Add link takes the pilot.
const ADD_LINK = {
  authority: '/profile', licence: '/profile', medical: '/profile', typeRating: '/profile',
  english: '/profile', workAuth: '/profile', education: '/profile',
  totalHours: '/logbook', picHours: '/logbook', multiHours: '/logbook',
  turbineHours: '/logbook', instrumentHours: '/logbook', ccHours: '/logbook',
};
const GROUP_LABEL = { must: 'Must-haves', hours: 'Hours', ratings: 'Ratings & medical' };
const GROUP_ORDER = ['must', 'hours', 'ratings'];
const ago = (d) => {
  if (!d) return null;
  const days = Math.round((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return 'today'; if (days === 1) return 'yesterday'; if (days < 30) return `${days} days ago`;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const dateStr = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

export default function JobDetailPanel({ jobId, mobile = false, onBack, seo = false }) {
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDesc, setShowDesc] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (!jobId) return undefined;
    let active = true;
    setLoading(true); setShowDesc(false);
    jobApi.get(jobId).then(({ data }) => { if (active) { setJob(data); setSaved(!!data.isSaved); } })
      .catch(() => { if (active) setJob(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jobId]);

  const grouped = useMemo(() => {
    const reqs = job?.match?.requirements || [];
    return GROUP_ORDER.map((g) => ({ g, label: GROUP_LABEL[g], rows: reqs.filter((r) => r.group === g) })).filter((x) => x.rows.length);
  }, [job]);

  // SEO for the job page (restores the per-job title/description/canonical the old
  // JobDetail set, and ADDS JobPosting JSON-LD structured data for Google). Only when
  // `seo` — i.e. this panel is the URL-identified job, not the split's auto-default.
  useJobSeo(seo ? job : null);

  if (!jobId) return <div className="detail" style={{ padding: 40, color: 'var(--text-secondary)' }}>Select a job to see the details.</div>;
  if (loading) return <div className="detail" style={{ padding: 40, color: 'var(--accent)' }}>Loading…</div>;
  if (!job) return <div className="detail" style={{ padding: 40, color: 'var(--text-secondary)' }}>Job not found.</div>;

  const m = job.match;
  const flag = countryFlag(job.country);
  const chips = jobChips(job);
  const src = sourceInfo(job);
  const sal = formatSalary(job, false);
  const known = m ? m.counts.met + m.counts.unmet : 0;

  // Verdict
  let verdict = null;
  if (m) {
    if (m.blocker) {
      const b = m.requirements.find((r) => r.key === m.blocker);
      verdict = { cls: 'block', text: <><b>Blocker: {b?.label}.</b> This is a must-have and your profile doesn't meet it.</> };
    } else if (m.counts.unmet > 0) {
      verdict = { cls: 'warn', text: <><b>{m.counts.met} of {known} known requirements met.</b> {m.counts.unmet} still short{m.counts.unknown ? `, ${m.counts.unknown} not on your profile yet` : ''}.</> };
    } else {
      const knownPhrase = known === 1 ? 'the known requirement' : known === 2 ? 'both known requirements' : `all ${known} known requirements`;
      verdict = { cls: 'ok', text: <><b>You meet {knownPhrase}.</b>{m.counts.unknown ? ` ${m.counts.unknown} item${m.counts.unknown > 1 ? 's aren\'t' : " isn't"} on your profile yet — add ${m.counts.unknown > 1 ? 'them' : 'it'} to confirm your match.` : ''}</> };
    }
  }

  const doSave = async () => {
    try { if (saved) { await jobApi.unsaveJob(job.id); setSaved(false); } else { await jobApi.saveJob(job.id); setSaved(true); } } catch { /* ignore */ }
  };
  const doApply = () => {
    // Open the apply link SYNCHRONOUSLY inside the click's user-gesture tick.
    // Awaiting the tracking POST first (as before) moves window.open into a later
    // microtask, which Safari — and often Chrome — block as a non-user popup, so
    // the tab silently never opened. The apply endpoint only records the click and
    // returns the same job.applyUrl we already hold, so we open it now and fire the
    // tracking call in the background (best-effort; logged-out 401s are ignored).
    if (job.applyUrl) window.open(job.applyUrl, '_blank', 'noopener');
    jobApi.apply(job.id).catch(() => { /* tracking only; ignore */ });
  };
  const doShare = async () => {
    const url = `${window.location.origin}/jobs/${slugFor(job)}`;
    try { if (navigator.share) await navigator.share({ title: job.title, url }); else await navigator.clipboard.writeText(url); } catch { /* ignore */ }
  };

  // At-a-glance facts — only fields that exist.
  const facts = [
    job.contractType && ['Contract', job.contractType],
    job.airlineFleet && ['Fleet', job.airlineFleet.slice(0, 3).join(' · ')],
    job.expiresAt && ['Closes', dateStr(job.expiresAt)],
  ].filter(Boolean);

  const applyCard = (
    <div className="apply">
      <div className="sal">{sal || 'Salary not stated'}</div>
      <div className="per">{sal ? 'as stated by airline' : ''}</div>
      <button className="abtn" onClick={doApply}>{src.direct ? `Apply on ${job.company} careers` : `Apply via ${src.label.replace('via ', '')}`} <ExternalLink size={14} style={{ verticalAlign: -2 }} /></button>
      <div className="how">{src.direct ? <><b><Check size={12} style={{ verticalAlign: -1 }} /> Direct application.</b> You'll go to {job.company}'s own careers site. CockpitHire isn't a middleman.</> : <>You'll continue on {src.label.replace('via ', '')}, which lists this role.</>}</div>
      <div className="arow"><button onClick={doSave}><Heart size={14} fill={saved ? 'currentColor' : 'none'} style={{ verticalAlign: -2 }} /> {saved ? 'Saved' : 'Save'}</button><button onClick={doShare}><Share2 size={14} style={{ verticalAlign: -2 }} /> Share</button></div>
      <div className="facts2">
        {job.postedAt && <span>Posted <b>{postedAgo(job.postedAt)}</b></span>}
        {job.lastSeenAt && <span>Link checked <b>{ago(job.lastSeenAt)}</b></span>}
        {job.expiresAt && <span>Closes <b>{dateStr(job.expiresAt)}</b></span>}
      </div>
      <button className="report" onClick={() => setReporting(true)}><Flag size={12} style={{ verticalAlign: -1 }} /> Report incorrect info</button>
    </div>
  );

  return (
    <div className="detail">
      {mobile && <button className="rd-back" onClick={onBack}><ArrowLeft size={15} style={{ verticalAlign: -2 }} /> Back to jobs</button>}
      <div className="dtop">
        <div className="jc-logo" style={{ width: 56, height: 56, flexShrink: 0 }}><AirlineLogo name={job.company} size={56} hideIfMissing /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{displayTitle(job.title)}</h2>
          <div className="dmeta"><b>{job.company}</b>{flag ? <> · <span aria-hidden="true">{flag}</span> {job.location || job.country}</> : (job.location ? ` · ${job.location}` : '')}{job.postedAt ? ` · Posted ${postedAgo(job.postedAt)}` : ''}</div>
          {chips.length > 0 && <div className="chips" style={{ marginTop: 10 }}>{chips.map((c, i) => <span key={i} className={`chip${c.visa ? ' visa' : ''}`}>{c.text}</span>)}</div>}
        </div>
      </div>

      <div className="dgrid">
        <div>
          {verdict && <div className={`verdict ${verdict.cls}`}><span className="ic">{verdict.cls === 'ok' ? <Check size={13} /> : verdict.cls === 'warn' ? <AlertTriangle size={13} /> : <X size={13} />}</span><div>{verdict.text}</div></div>}

          {grouped.length > 0 && (
            <table className="mt">
              <tbody>
                <tr><th></th><th>Requirement</th><th>Needed</th><th style={{ textAlign: 'right' }}>You</th></tr>
                {grouped.map((grp) => (
                  <React.Fragment key={grp.g}>
                    <tr className="grp"><td colSpan={4}>{grp.label}</td></tr>
                    {grp.rows.map((r) => (
                      <tr key={r.key}>
                        <td className={`st ${r.status === 'met' ? 'ok' : r.status === 'unmet' ? 'no' : 'unk'}`}>{r.status === 'met' ? <Check size={14} /> : r.status === 'unmet' ? <X size={14} /> : <HelpCircle size={14} />}</td>
                        <td>{r.label}</td>
                        <td className="need">{r.reqText}</td>
                        <td className={`you ${r.status === 'met' ? 'ok' : r.status === 'unmet' ? 'no' : 'unk'}`}>
                          {r.status === 'unknown'
                            ? <>Not on profile <a href={ADD_LINK[r.key] || '/profile'} onClick={(e) => { e.preventDefault(); navigate(ADD_LINK[r.key] || '/profile'); }}>Add</a></>
                            : (r.pilotText || '—')}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}

          {facts.length > 0 && (
            <div className="sec">
              <div className="label">At a glance</div>
              <div className="facts">{facts.map(([k, v]) => <div className="fact" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}</div>
            </div>
          )}

          {job.description && (
            <div className="sec">
              <div className="label">About the job</div>
              <div className="desc" style={showDesc ? undefined : { maxHeight: 84, overflow: 'hidden' }}>{job.description}</div>
              {job.description.length > 240 && <button className="more" onClick={() => setShowDesc((v) => !v)}>{showDesc ? <>Show less <ChevronUp size={13} style={{ verticalAlign: -2 }} /></> : <>Show full description <ChevronDown size={13} style={{ verticalAlign: -2 }} /></>}</button>}
            </div>
          )}

          {job.airlineId && (
            <div className="sec">
              <div className="label">About the airline</div>
              <div className="airline">
                <div style={{ width: 38, height: 38 }}><AirlineLogo name={job.company} size={38} hideIfMissing /></div>
                <div><div className="n">{job.company}</div>{job.airlineFleet && <div className="s">Fleet: {job.airlineFleet.slice(0, 4).join(' · ')}</div>}</div>
                <a href={`/airlines/${job.airlineId}`} onClick={(e) => { e.preventDefault(); navigate(`/airlines/${job.airlineId}`); }}>Airline profile <ArrowRight size={12} style={{ verticalAlign: -1 }} /></a>
              </div>
            </div>
          )}

          {job.similarJobs?.length > 0 && (
            <div className="sec">
              <div className="label">Similar jobs you qualify for</div>
              <div className="sim">
                {job.similarJobs.slice(0, 4).map((s) => (
                  <button key={s.id} onClick={() => navigate(`/jobs/${slugFor(s)}`)}><b>{displayTitle(s.title)}</b><span>{s.company}{s.location ? ` · ${s.location}` : ''}</span></button>
                ))}
              </div>
            </div>
          )}
        </div>

        {!mobile && <div>{applyCard}</div>}
      </div>

      {mobile && (
        <div className="abar">
          <div className="l"><b>{sal || 'Salary not stated'}</b>{src.direct ? 'Apply directly' : src.label}</div>
          <button className="abtn" onClick={doApply}>Apply <ExternalLink size={14} style={{ verticalAlign: -2 }} /></button>
        </div>
      )}

      {reporting && <ReportModal job={job} onClose={() => setReporting(false)} />}
    </div>
  );
}

// Per-job SEO: document.title + description/OG/canonical meta + JobPosting JSON-LD
// structured data (for Google Jobs). All injected client-side and cleaned up on
// change/unmount — react-helmet isn't a dependency.
const EMPLOYMENT_TYPE = { full_time: 'FULL_TIME', part_time: 'PART_TIME', contract: 'CONTRACTOR', acmi: 'CONTRACTOR', temporary: 'TEMPORARY', internship: 'INTERN' };
function useJobSeo(job) {
  useEffect(() => {
    if (!job) return undefined;
    const created = [];
    const prevTitle = document.title;
    const title = `${displayTitle(job.title)}${job.company ? ` — ${job.company}` : ''} | CockpitHire`;
    document.title = title;
    const descText = String(job.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    const setTag = (sel, attrs) => {
      let el = document.head.querySelector(sel);
      if (!el) { el = document.createElement(sel.startsWith('link') ? 'link' : 'meta'); document.head.appendChild(el); created.push(el); }
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    };
    if (descText) setTag('meta[name="description"]', { name: 'description', content: descText });
    setTag('meta[property="og:title"]', { property: 'og:title', content: title });
    if (descText) setTag('meta[property="og:description"]', { property: 'og:description', content: descText });
    setTag('link[rel="canonical"]', { rel: 'canonical', href: `${window.location.origin}/jobs/${slugFor(job)}` });

    // JobPosting JSON-LD.
    const ld = {
      '@context': 'https://schema.org/', '@type': 'JobPosting',
      title: displayTitle(job.title),
      description: descText || displayTitle(job.title),
      ...(job.postedAt ? { datePosted: new Date(job.postedAt).toISOString() } : {}),
      ...(job.expiresAt ? { validThrough: new Date(job.expiresAt).toISOString() } : {}),
      ...(EMPLOYMENT_TYPE[job.contractType] ? { employmentType: EMPLOYMENT_TYPE[job.contractType] } : {}),
      hiringOrganization: { '@type': 'Organization', name: job.company || 'Airline' },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', ...(job.location ? { addressLocality: job.location } : {}), ...(job.country ? { addressCountry: job.country } : {}) } },
      directApply: !!(job.sourceType && job.sourceType !== 'aggregator'),
      ...((job.salaryMin != null || job.salaryMax != null) ? {
        baseSalary: { '@type': 'MonetaryAmount', currency: job.salaryCurrency || 'USD', value: { '@type': 'QuantitativeValue', ...(job.salaryMin != null ? { minValue: job.salaryMin } : {}), ...(job.salaryMax != null ? { maxValue: job.salaryMax } : {}), unitText: (job.salaryPeriod || 'YEAR').toUpperCase() } },
      } : {}),
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-jobposting', '1');
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
    created.push(script);

    return () => { document.title = prevTitle; created.forEach((el) => el.remove()); };
  }, [job]);
}

function ReportModal({ job, onClose }) {
  const [field, setField] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const submit = async () => {
    if (!message.trim()) return;
    try { await jobApi.report(job.id, { field: field || undefined, message }); setDone(true); setTimeout(onClose, 1200); } catch { /* ignore */ }
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,25,.45)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 14, padding: 22, width: 'min(420px, 100%)' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 19, margin: '0 0 4px' }}>Report incorrect info</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px' }}>Tell us what's wrong on this posting and we'll review it.</p>
        {done ? <p style={{ color: 'var(--accent)', fontWeight: 600 }}>Thanks — reported.</p> : (
          <>
            <select value={field} onChange={(e) => setField(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 10, fontSize: 14 }}>
              <option value="">Which field? (optional)</option>
              <option value="requirements">Requirements / hours</option>
              <option value="salary">Salary</option>
              <option value="location">Location</option>
              <option value="expired">Job no longer open</option>
              <option value="applyUrl">Apply link broken</option>
              <option value="other">Something else</option>
            </select>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What's incorrect?" rows={3} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={submit} style={{ background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}>Send report</button>
              <button onClick={onClose} style={{ background: 'none', border: 0, color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
