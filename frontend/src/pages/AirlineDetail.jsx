import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { airlineApi } from '../services/api';

const EMPTY = (
  <span style={{ color: '#4A6080', fontStyle: 'italic', fontSize: 13 }}>
    Not yet contributed — be the first to share.
  </span>
);

function hiringBadge(status) {
  const map = {
    ACTIVELY_HIRING: { label: 'Actively Hiring', color: '#2ECC71', bg: 'rgba(46,204,113,0.12)' },
    OCCASIONAL:      { label: 'Occasional',       color: '#F39C12', bg: 'rgba(243,156,18,0.12)' },
    PAUSED:          { label: 'Paused',            color: '#E74C3C', bg: 'rgba(231,76,60,0.12)'  },
    UNKNOWN:         { label: 'Unknown',           color: '#7A8CA0', bg: 'rgba(122,140,160,0.12)' },
  };
  return map[status] || map.UNKNOWN;
}

function hiringFreqLabel(v) {
  return { CONTINUOUS: 'Continuous', PERIODIC: 'Periodic', RARE: 'Rare', UNKNOWN: null }[v] || null;
}

function contractLabel(v) {
  return {
    PERMANENT: 'Permanent', FIXED_TERM: 'Fixed Term',
    AGENCY: 'Agency', PAY_TO_FLY: 'Pay-to-Fly', MIXED: 'Mixed',
  }[v] || v;
}

function relativeDate(d) {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30)  return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

const S = {
  page: { maxWidth: 800, margin: '0 auto', paddingBottom: 60 },
  back: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    color: '#7A8CA0', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', marginBottom: 24, background: 'none', border: 'none', padding: 0,
  },
  hero: {
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 16,
    padding: '24px 28px', marginBottom: 20,
  },
  heroTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  heroName: { fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' },
  heroCodes: { display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  codeChip: (color) => ({
    fontSize: 11, fontWeight: 800, color,
    background: `${color}18`, border: `1px solid ${color}40`,
    borderRadius: 6, padding: '2px 8px',
  }),
  heroMeta: { fontSize: 13, color: '#7A8CA0', marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap' },
  badge: (color, bg) => ({
    fontSize: 12, fontWeight: 700, color, background: bg,
    border: `1px solid ${color}40`, borderRadius: 8, padding: '4px 12px',
    display: 'inline-block', flexShrink: 0,
  }),
  section: {
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 14,
    padding: '20px 24px', marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: 800, color: '#4A6080',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16,
  },
  row: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-start' },
  label: { fontSize: 12, color: '#4A6080', fontWeight: 600, width: 160, flexShrink: 0, paddingTop: 1 },
  value: { fontSize: 14, color: '#C8D8E8', flex: 1, minWidth: 0 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tag: {
    fontSize: 12, color: '#00B4D8', background: 'rgba(0,180,216,0.1)',
    border: '1px solid rgba(0,180,216,0.2)', borderRadius: 6, padding: '2px 8px',
  },
  jobsLink: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    color: '#00B4D8', fontSize: 14, fontWeight: 600,
    background: 'rgba(0,180,216,0.08)', border: '1px solid rgba(0,180,216,0.2)',
    borderRadius: 10, padding: '8px 16px', cursor: 'pointer', textDecoration: 'none',
    marginTop: 4,
  },
  editBtn: {
    padding: '9px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
    background: '#1B2B4B', border: '1px solid #2A3C55',
    color: '#4A6080', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: 6,
  },
  footer: {
    fontSize: 12, color: '#4A6080', marginTop: 20,
    borderTop: '1px solid #1E3050', paddingTop: 16,
    display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
  },
};

function Field({ label, children }) {
  return (
    <div style={S.row}>
      <div style={S.label}>{label}</div>
      <div style={S.value}>{children ?? EMPTY}</div>
    </div>
  );
}

export default function AirlineDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [airline, setAirline] = useState(null);
  const [jobCount, setJobCount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      airlineApi.get(id),
      airlineApi.getJobCount(id),
    ])
      .then(([{ data: a }, { data: j }]) => { setAirline(a); setJobCount(j.count); })
      .catch(() => navigate('/airlines', { replace: true }))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#7A8CA0' }}>Loading…</div>;
  if (!airline) return null;

  const badge = hiringBadge(airline.hiringStatus);
  const payRanges = airline.payRanges;

  return (
    <div style={S.page}>
      <button style={S.back} onClick={() => navigate('/airlines')}>
        ← Back to Airlines
      </button>

      {/* Hero */}
      <div style={S.hero}>
        <div style={S.heroTop}>
          <div>
            <div style={S.heroName}>{airline.name}</div>
            <div style={S.heroCodes}>
              {airline.iataCode && <span style={S.codeChip('#00B4D8')}>IATA: {airline.iataCode}</span>}
              {airline.icaoCode && <span style={S.codeChip('#7A8CA0')}>ICAO: {airline.icaoCode}</span>}
            </div>
            <div style={S.heroMeta}>
              <span>{airline.country}</span>
              <span>·</span>
              <span>{airline.region}</span>
              {airline.headquarters && <><span>·</span><span>{airline.headquarters}</span></>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
            <span style={S.badge(badge.color, badge.bg)}>{badge.label}</span>
            <button style={S.editBtn} disabled>
              <svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2l3 3-9 9H4v-3L13 2z"/>
              </svg>
              Suggest an edit
              <span style={{ fontSize: 10, color: '#2A3C55', marginLeft: 4 }}>(coming soon)</span>
            </button>
          </div>
        </div>
        {airline.description && (
          <div style={{ marginTop: 14, fontSize: 14, color: '#7A8CA0', lineHeight: 1.6 }}>
            {airline.description}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <a
            href={`/jobs?q=${encodeURIComponent(airline.name)}`}
            style={S.jobsLink}
            onClick={(e) => { e.preventDefault(); navigate(`/jobs?q=${encodeURIComponent(airline.name)}`); }}
          >
            Open jobs at {airline.name}
            {jobCount !== null && ` (${jobCount})`} →
          </a>
        </div>
      </div>

      {/* Operations */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Operations</div>
        <Field label="Fleet">
          {airline.fleet?.length > 0
            ? <div style={S.tags}>{airline.fleet.map((t) => <span key={t} style={S.tag}>{t}</span>)}</div>
            : null}
        </Field>
        <Field label="Bases">
          {airline.bases?.length > 0
            ? <div style={S.tags}>{airline.bases.map((b) => <span key={b} style={S.tag}>{b}</span>)}</div>
            : null}
        </Field>
        <Field label="Contract Type">
          {airline.contractType ? contractLabel(airline.contractType) : null}
        </Field>
        <Field label="Roster Pattern">
          {airline.rosterPattern || null}
        </Field>
        <Field label="Work Auth Required">
          {airline.workAuthRequired?.length > 0
            ? <div style={S.tags}>{airline.workAuthRequired.map((w) => <span key={w} style={S.tag}>{w}</span>)}</div>
            : null}
        </Field>
      </div>

      {/* Compensation */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Compensation</div>
        <Field label="Captain Pay">
          {payRanges?.captain
            ? `${payRanges.captain.min?.toLocaleString() ?? '?'} – ${payRanges.captain.max?.toLocaleString() ?? '?'} ${payRanges.captain.currency ?? ''} / ${payRanges.captain.period ?? 'year'}`
            : null}
        </Field>
        <Field label="First Officer Pay">
          {payRanges?.fo
            ? `${payRanges.fo.min?.toLocaleString() ?? '?'} – ${payRanges.fo.max?.toLocaleString() ?? '?'} ${payRanges.fo.currency ?? ''} / ${payRanges.fo.period ?? 'year'}`
            : null}
        </Field>
      </div>

      {/* Career */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Career</div>
        <Field label="Hiring Status">
          <span style={S.badge(badge.color, badge.bg)}>{badge.label}</span>
        </Field>
        <Field label="Hiring Frequency">
          {hiringFreqLabel(airline.hiringFrequency) || null}
        </Field>
        <Field label="Upgrade Timeline">
          {(airline.upgradeTimeMinYears != null || airline.upgradeTimeMaxYears != null)
            ? `${airline.upgradeTimeMinYears ?? '?'} – ${airline.upgradeTimeMaxYears ?? '?'} years`
            : null}
        </Field>
      </div>

      {/* Application Process */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Application Process</div>
        <Field label="Avg Response Time">
          {airline.avgResponseDays != null ? `~${airline.avgResponseDays} day${airline.avgResponseDays !== 1 ? 's' : ''}` : null}
        </Field>
        <Field label="Interview Stages">
          {airline.interviewStages?.length > 0
            ? airline.interviewStages.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ color: '#00B4D8', fontSize: 11, fontWeight: 800 }}>{i + 1}</span>
                  <span>{s}</span>
                </div>
              ))
            : null}
        </Field>
        <Field label="Sim Type">
          {airline.simType || null}
        </Field>
      </div>

      {/* Notes */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Notes</div>
        <div style={{ fontSize: 14, color: '#C8D8E8', lineHeight: 1.7 }}>
          {airline.notes || EMPTY}
        </div>
      </div>

      {/* Trust footer */}
      <div style={S.footer}>
        <span>
          Submitted by {airline.verifiedContributors} pilot{airline.verifiedContributors !== 1 ? 's' : ''}
        </span>
        <span>Last updated {relativeDate(airline.lastUpdatedAt)}</span>
      </div>
    </div>
  );
}
