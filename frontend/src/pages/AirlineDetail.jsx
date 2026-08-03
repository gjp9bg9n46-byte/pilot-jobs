import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { airlineApi, adminApi } from '../services/api';
import AirlineLogo from '../components/AirlineLogo';
import { LightPage, Badge, Button } from '../components/primitives';
import { resolveFieldDate, formatFieldDate, hashStage } from '../lib/fieldDates';

const EMPTY = (
  <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: 13 }}>
    Not yet contributed — be the first to share.
  </span>
);

// Recruitment status → semantic Badge variant (page-local; also in Airlines.jsx).
function hiringMeta(status) {
  const map = {
    ACTIVELY_HIRING: { label: 'Actively Hiring', variant: 'success' },
    OCCASIONAL:      { label: 'Occasional',      variant: 'warning' },
    PAUSED:          { label: 'Paused',          variant: 'error'   },
    UNKNOWN:         { label: 'Unknown',         variant: 'neutral' },
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
    color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', marginBottom: 24, background: 'none', border: 'none', padding: 0,
    fontFamily: 'var(--font-body)',
  },
  hero: {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
    padding: '24px 28px', marginBottom: 20,
  },
  heroTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  heroName: { fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' },
  heroCodes: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  // IATA accent / ICAO neutral — codes are data, rendered in JetBrains Mono
  codeChip: (accent) => ({
    fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
    color: accent ? 'var(--accent)' : 'var(--text-secondary)',
    background: accent ? 'rgba(0,63,136,0.08)' : 'var(--bg)',
    border: `1px solid ${accent ? 'rgba(0,63,136,0.2)' : 'var(--border)'}`,
    borderRadius: 6, padding: '2px 8px',
  }),
  heroMeta: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 12, display: 'flex', gap: 14, flexWrap: 'wrap' },
  section: {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
    padding: '20px 24px', marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16,
  },
  row: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-start' },
  label: { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, width: 160, flexShrink: 0, paddingTop: 1 },
  value: { fontSize: 14, color: 'var(--text-primary)', flex: 1, minWidth: 0 },
  dateBox: {
    fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg)',
    border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap',
    flexShrink: 0, width: 82, textAlign: 'center', lineHeight: '16px', fontFamily: 'var(--font-body)',
    alignSelf: 'flex-start',
  },
  dateBoxEmpty: { fontStyle: 'italic', opacity: 0.65 },
  legend: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, marginTop: -4, lineHeight: 1.5 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tag: {
    fontSize: 12, color: 'var(--accent)', background: 'rgba(0,63,136,0.08)',
    border: '1px solid rgba(0,63,136,0.2)', borderRadius: 6, padding: '2px 8px',
  },
  jobsLink: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    color: 'var(--accent)', fontSize: 14, fontWeight: 600,
    background: 'rgba(0,63,136,0.06)', border: '1px solid rgba(0,63,136,0.2)',
    borderRadius: 8, padding: '8px 16px', cursor: 'pointer', textDecoration: 'none',
    marginTop: 4, fontFamily: 'var(--font-body)',
  },
  footer: {
    fontSize: 12, color: 'var(--text-secondary)', marginTop: 20,
    borderTop: '1px solid var(--border)', paddingTop: 16,
    display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
  },
};

// Small per-field date box on the far right, so dates scan as a column down the
// page. NULL renders a visible "—" (never blank/hidden). For admins it's a
// button that re-affirms the field's date without changing its value.
function DateBox({ date, field, canReaffirm, onReaffirm }) {
  const text = formatFieldDate(date);
  const base = { ...S.dateBox, ...(date ? {} : S.dateBoxEmpty) };
  if (canReaffirm && field) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onReaffirm(field); }}
        style={{ ...base, cursor: 'pointer' }}
        title={(date ? `Recorded ${text}` : 'No date recorded') + ' — click to mark re-checked now'}
      >
        {text}
      </button>
    );
  }
  return <span style={base} title={date ? `Recorded ${text}` : 'No date recorded'}>{text}</span>;
}

function Field({ label, children, date, field, canReaffirm, onReaffirm }) {
  return (
    <div style={S.row}>
      <div style={S.label}>{label}</div>
      <div style={S.value}>{children ?? EMPTY}</div>
      <DateBox date={date} field={field} canReaffirm={canReaffirm} onReaffirm={onReaffirm} />
    </div>
  );
}

// ── Structured fleet (fleetDetail) ───────────────────────────────────────────
const FS = {
  wrap: { marginBottom: 12 },
  head: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  label: { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 },
  sub: { fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', opacity: 0.8 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'right', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 0 8px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  thType: { textAlign: 'left', paddingLeft: 0 },
  td: { textAlign: 'right', fontSize: 13, color: 'var(--text-primary)', padding: '8px 0 8px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' },
  tdType: { textAlign: 'left', fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'var(--font-body)', paddingLeft: 0 },
  dash: { color: 'var(--text-secondary)' },
  card: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 },
  cardType: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 },
  cardLine: { fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' },
};

function useNarrow(bp = 640) {
  const [n, setN] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false);
  useEffect(() => {
    const h = () => setN(window.innerWidth < bp);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [bp]);
  return n;
}

// null → em-dash; 0 → "0"; positive → number
const numCell = (v) => (v == null ? <span style={FS.dash}>—</span> : v);

function FleetBlock({ detail, fd, canReaffirm, onReaffirm }) {
  const narrow = useNarrow(640);
  const hasIS = detail.some((r) => r.inService != null);
  const hasOrd = detail.some((r) => r.ordered != null);
  const hasRet = detail.some((r) => r.retired != null);
  const box = (type) => (
    <DateBox date={resolveFieldDate(fd, 'fleet', type)} field={`fleet:${type}`} canReaffirm={canReaffirm} onReaffirm={onReaffirm} />
  );
  const header = (
    <div style={FS.head}>
      <span style={FS.label}>Fleet</span>
      <span style={FS.sub}>Recorded date shown per type</span>
    </div>
  );

  if (narrow) {
    return (
      <div style={FS.wrap}>
        {header}
        {detail.map((r, i) => {
          const segs = [];
          if (r.inService != null) segs.push(`${r.inService} in service`);
          if (r.ordered != null) segs.push(`${r.ordered} on order`);
          if (r.retired != null) segs.push(`${r.retired} retired`);
          return (
            <div key={r.type + i} style={{ ...FS.card, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={FS.cardType}>{r.type}</div>
                <div style={FS.cardLine}>{segs.join(' · ') || '—'}</div>
              </div>
              {box(r.type)}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={FS.wrap}>
      {header}
      <table style={FS.table}>
        <thead>
          <tr>
            <th style={{ ...FS.th, ...FS.thType }}>Aircraft</th>
            {hasIS && <th style={FS.th}>In Service</th>}
            {hasOrd && <th style={FS.th}>On Order</th>}
            {hasRet && <th style={FS.th}>Retired</th>}
            <th style={{ ...FS.th, textAlign: 'right' }}>Recorded</th>
          </tr>
        </thead>
        <tbody>
          {detail.map((r, i) => (
            <tr key={r.type + i}>
              <td style={{ ...FS.td, ...FS.tdType }}>{r.type}</td>
              {hasIS && <td style={FS.td}>{numCell(r.inService)}</td>}
              {hasOrd && <td style={FS.td}>{numCell(r.ordered)}</td>}
              {hasRet && <td style={FS.td}>{numCell(r.retired)}</td>}
              <td style={{ ...FS.td, textAlign: 'right' }}>{box(r.type)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AirlineDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const narrow = useNarrow();
  const isAuthed = useSelector((s) => !!s.auth.token);
  const isAdmin = useSelector((s) => !!s.auth.pilot?.isAdmin);
  const [airline, setAirline] = useState(null);
  const [jobCount, setJobCount] = useState(null);
  const [loading, setLoading] = useState(true);

  // Admin re-check: stamp a field/item's date to now without changing its value.
  const reaffirm = async (field) => {
    try {
      const { data } = await adminApi.reaffirm(id, field);
      setAirline((a) => ({ ...a, fieldDates: { ...(a.fieldDates || {}), [data.field]: data.recordedAt } }));
    } catch { /* non-fatal; leave date as-is */ }
  };

  useEffect(() => {
    Promise.all([
      airlineApi.get(id),
      airlineApi.getJobCount(id),
    ])
      .then(([{ data: a }, { data: j }]) => { setAirline(a); setJobCount(j.count); })
      .catch(() => navigate('/airlines', { replace: true }))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) return <LightPage style={{ fontFamily: 'var(--font-body)' }}><div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div></LightPage>;
  if (!airline) return null;

  const badge = hiringMeta(airline.hiringStatus);
  const payRanges = airline.payRanges;
  const fd = airline.fieldDates || {};
  const dateFor = (logical, item) => resolveFieldDate(fd, logical, item);
  // Common props so every Field gets a date box + (admin) re-check button.
  const dprops = (logical, item) => ({
    date: dateFor(logical, item),
    field: item != null ? `${logical}:${item}` : logical,
    canReaffirm: isAdmin,
    onReaffirm: reaffirm,
  });

  return (
    <LightPage style={{ fontFamily: 'var(--font-body)' }}>
      <div style={S.page}>
        <button style={S.back} onClick={() => navigate('/airlines')}>
          ← Back to Airlines
        </button>

        {/* Hero */}
        <div style={S.hero}>
          <div style={S.heroTop}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 0 }}>
              <AirlineLogo logoUrl={airline.logoUrl} iataCode={airline.iataCode} name={airline.name} box={narrow ? 60 : 80} maxW={narrow ? 110 : 160} font={narrow ? 15 : 17} />
              <div style={{ minWidth: 0 }}>
              <div style={S.heroName}>{airline.name}</div>
              <div style={S.heroCodes}>
                {airline.iataCode && <span style={S.codeChip(true)}>IATA: {airline.iataCode}</span>}
                {airline.icaoCode && <span style={S.codeChip(false)}>ICAO: {airline.icaoCode}</span>}
              </div>
              <div style={S.heroMeta}>
                <span>{airline.country}</span>
                <span>·</span>
                <span>{airline.region}</span>
              </div>
              {airline.domain && (
                <a
                  href={`https://${airline.domain.replace(/^https?:\/\//, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  {airline.domain.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
                </a>
              )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
              <Badge variant={badge.variant} style={{ fontSize: 12, padding: '4px 12px' }}>{badge.label}</Badge>
              {isAuthed ? (
                <Button variant="secondary" onClick={() => navigate(`/airlines/${airline.id}/contribute`)} style={{ padding: '9px 18px', fontSize: 13, gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2l3 3-9 9H4v-3L13 2z"/>
                  </svg>
                  Suggest an edit
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => navigate('/login')} style={{ padding: '7px 14px', fontSize: 12 }}>
                  Sign in to contribute
                </Button>
              )}
            </div>
          </div>
          {airline.description && (
            <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1 }}>
                {airline.description}
              </div>
              <DateBox {...dprops('description')} />
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

        {/* Legend — what the date column means. Keeps "—" honest without softening it. */}
        <div style={S.legend}>
          Dates show when each detail was last confirmed. “—” means the date is unknown.
        </div>

        {/* Operations */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Operations</div>
          <Field label="Headquarters" {...dprops('headquarters')}>
            {airline.headquarters || null}
          </Field>
          {airline.fleetDetail?.length > 0
            ? <FleetBlock detail={airline.fleetDetail} fd={fd} canReaffirm={isAdmin} onReaffirm={reaffirm} />
            : (
              <Field label="Fleet" {...dprops('fleet')}>
                {airline.fleet?.length > 0
                  ? <div style={S.tags}>{airline.fleet.map((t) => <span key={t} style={S.tag}>{t}</span>)}</div>
                  : null}
              </Field>
            )}
          <Field label="Bases" {...dprops('bases')}>
            {airline.bases?.length > 0
              ? <div style={S.tags}>{airline.bases.map((b) => <span key={b} style={S.tag}>{b}</span>)}</div>
              : null}
          </Field>
          <Field label="Contract Type" {...dprops('contractType')}>
            {airline.contractType ? contractLabel(airline.contractType) : null}
          </Field>
          <Field label="Roster Pattern" {...dprops('rosterPattern')}>
            {airline.rosterPattern || null}
          </Field>
          <Field label="Work Auth Required" {...dprops('workAuthRequired')}>
            {airline.workAuthRequired?.length > 0
              ? <div style={S.tags}>{airline.workAuthRequired.map((w) => <span key={w} style={S.tag}>{w}</span>)}</div>
              : null}
          </Field>
        </div>

        {/* Compensation */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Compensation</div>
          <Field label="Captain Pay" {...dprops('payRanges', 'captain')}>
            {payRanges?.captain
              ? `${payRanges.captain.min?.toLocaleString() ?? '?'} – ${payRanges.captain.max?.toLocaleString() ?? '?'} ${payRanges.captain.currency ?? ''} / ${payRanges.captain.period ?? 'year'}`
              : null}
          </Field>
          <Field label="First Officer Pay" {...dprops('payRanges', 'fo')}>
            {payRanges?.fo
              ? `${payRanges.fo.min?.toLocaleString() ?? '?'} – ${payRanges.fo.max?.toLocaleString() ?? '?'} ${payRanges.fo.currency ?? ''} / ${payRanges.fo.period ?? 'year'}`
              : null}
          </Field>
        </div>

        {/* Career */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Career</div>
          <Field label="Hiring Status" {...dprops('hiringStatus')}>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </Field>
          <Field label="Hiring Frequency" {...dprops('hiringFrequency')}>
            {hiringFreqLabel(airline.hiringFrequency) || null}
          </Field>
          <Field label="Upgrade Timeline" {...dprops('upgradeTime')}>
            {(airline.upgradeTimeMinYears != null || airline.upgradeTimeMaxYears != null)
              ? `${airline.upgradeTimeMinYears ?? '?'} – ${airline.upgradeTimeMaxYears ?? '?'} years`
              : null}
          </Field>
        </div>

        {/* Application Process */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Application Process</div>
          <Field label="Avg Response Time" {...dprops('avgResponseDays')}>
            {airline.avgResponseDays != null ? `~${airline.avgResponseDays} day${airline.avgResponseDays !== 1 ? 's' : ''}` : null}
          </Field>
          {/* Interview stages are per-item dated: each stage its own row + date box. */}
          {airline.interviewStages?.length > 0
            ? airline.interviewStages.map((s, i) => (
                <div key={i} style={S.row}>
                  <div style={S.label}>{i === 0 ? 'Interview Stages' : ''}</div>
                  <div style={S.value}>
                    <span style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 800, marginRight: 8 }}>{i + 1}</span>
                    {s}
                  </div>
                  <DateBox {...dprops('interviewStages', hashStage(s))} />
                </div>
              ))
            : <Field label="Interview Stages" {...dprops('interviewStages')}>{null}</Field>}
          <Field label="Sim Type" {...dprops('simType')}>
            {airline.simType || null}
          </Field>
        </div>

        {/* Notes */}
        <div style={S.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={S.sectionTitle}>Notes</div>
            <DateBox {...dprops('notes')} />
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7 }}>
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
    </LightPage>
  );
}
