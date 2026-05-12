import React, { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { jobApi } from '../services/api';
import { setJobs } from '../store';

const AUTHORITIES = [
  { value: '', label: 'All Authorities' },
  { value: 'FAA',    label: '🇺🇸 FAA — USA' },
  { value: 'EASA',   label: '🇪🇺 EASA — Europe' },
  { value: 'GCAA',   label: '🇦🇪 GCAA — UAE' },
  { value: 'CAAC',   label: '🇨🇳 CAAC — China' },
  { value: 'DGCA',   label: '🇮🇳 DGCA — India' },
  { value: 'CASA',   label: '🇦🇺 CASA — Australia' },
  { value: 'CAA_UK', label: '🇬🇧 CAA — UK' },
  { value: 'TCCA',   label: '🇨🇦 TCCA — Canada' },
];

function matchLabel(score) {
  if (!score) return null;
  if (score >= 90) return { text: 'Excellent Match', bg: '#0D2B1A', color: '#2ECC71', border: '#1A4A2A' };
  if (score >= 75) return { text: 'Great Match',     bg: '#0A2540', color: '#00B4D8', border: '#1A3A5A' };
  if (score >= 60) return { text: 'Good Match',      bg: '#2B1F0A', color: '#F39C12', border: '#4A3A1A' };
  return null;
}

const css = {
  page: {},
  topBar: { display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' },
  search: {
    flex: 1, minWidth: 260, background: '#1B2B4B', border: '1px solid #243050',
    borderRadius: 10, padding: '12px 16px', color: '#fff', fontSize: 14, outline: 'none',
  },
  select: {
    background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10,
    padding: '12px 14px', color: '#fff', fontSize: 14, outline: 'none', cursor: 'pointer',
  },
  refreshBtn: {
    background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10,
    padding: '12px 18px', color: '#7A8CA0', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  count: { color: '#4A6080', fontSize: 13, alignSelf: 'center', whiteSpace: 'nowrap' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 },
  card: {
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 16,
    padding: 24, display: 'flex', flexDirection: 'column', gap: 12,
    transition: 'border-color 0.2s, transform 0.15s', cursor: 'pointer',
  },
  cardHover: { borderColor: '#00B4D8', transform: 'translateY(-2px)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.4 },
  airline: { fontSize: 14, color: '#00B4D8', fontWeight: 600 },
  authorityBadge: {
    background: '#0A2040', border: '1px solid #1E3050', borderRadius: 6,
    padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#00B4D8', whiteSpace: 'nowrap',
  },
  metaRow: { display: 'flex', gap: 20, flexWrap: 'wrap' },
  meta: { fontSize: 12, color: '#7A8CA0', display: 'flex', alignItems: 'center', gap: 5 },
  reqs: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  req: {
    background: '#1B2B4B', borderRadius: 6, padding: '4px 10px',
    fontSize: 11, color: '#7A8CA0', fontWeight: 500,
  },
  matchBadge: (m) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: m.bg, border: `1px solid ${m.border}`, borderRadius: 8,
    padding: '6px 12px', fontSize: 12, fontWeight: 700, color: m.color,
  }),
  viewBtn: {
    marginTop: 'auto', background: 'transparent', border: '1px solid #243050',
    borderRadius: 8, padding: '10px 0', color: '#7A8CA0', fontSize: 13,
    fontWeight: 600, cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
  },
  empty: { textAlign: 'center', padding: '80px 0', color: '#4A6080' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#7A8CA0', marginBottom: 8 },
  emptyText: { fontSize: 14, lineHeight: 1.6 },
  loading: { textAlign: 'center', padding: '80px 0', color: '#00B4D8', fontSize: 15 },
  modal: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 24,
  },
  modalCard: {
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 20,
    padding: 36, maxWidth: 640, width: '100%', maxHeight: '85vh',
    overflowY: 'auto', position: 'relative',
  },
};

function JobModal({ job, onClose }) {
  if (!job) return null;
  return (
    <div style={css.modal} onClick={onClose}>
      <div style={css.modalCard} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: '#7A8CA0', fontSize: 22, cursor: 'pointer' }}>✕</button>
        <div style={{ fontSize: 11, color: '#00B4D8', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>JOB DETAILS</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{job.title}</div>
        <div style={{ fontSize: 15, color: '#00B4D8', fontWeight: 600, marginBottom: 20 }}>{job.company}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          {[
            ['📍 Location', job.location],
            ['🏛 Authority', job.reqAuthorities?.join(', ') || 'Any'],
            ['📋 Certificates', job.reqCertificates?.join(', ') || 'Not specified'],
            ['⏱ Min Total Hours', job.reqMinTotalHours ? `${job.reqMinTotalHours.toLocaleString()} hrs` : '—'],
            ['🎯 Min PIC Hours', job.reqMinPicHours ? `${job.reqMinPicHours.toLocaleString()} hrs` : '—'],
            ['✈ Aircraft Types', job.reqAircraftTypes?.join(', ') || 'Not specified'],
            ['🔧 Multi-Engine Hrs', job.reqMinMultiEngineHours ? `${job.reqMinMultiEngineHours.toLocaleString()} hrs` : '—'],
            ['💊 Medical Class', job.reqMedicalClass?.replace('CLASS_', 'Class ') || '—'],
          ].map(([label, val]) => (
            <div key={label} style={{ background: '#1B2B4B', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#4A6080', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 13, color: '#7A8CA0', lineHeight: 1.7, marginBottom: 24 }}>
          {job.description}
        </div>

        <a
          href={job.applyUrl} target="_blank" rel="noreferrer"
          style={{
            display: 'block', textAlign: 'center',
            background: 'linear-gradient(135deg, #00B4D8, #0077A8)',
            color: '#fff', padding: '14px', borderRadius: 10,
            fontWeight: 700, fontSize: 16, textDecoration: 'none',
          }}
        >
          Apply Now →
        </a>
      </div>
    </div>
  );
}

export default function Jobs() {
  const dispatch = useDispatch();
  const { list: jobs, total } = useSelector((s) => s.jobs);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [authority, setAuthority] = useState('');
  const [selected, setSelected] = useState(null);
  const [hoverId, setHoverId] = useState(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (authority) params.authority = authority;
      const { data } = await jobApi.list(params);
      dispatch(setJobs({ jobs: data.jobs, total: data.total }));
    } finally {
      setLoading(false);
    }
  }, [authority]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const filtered = jobs.filter(
    (j) =>
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.company.toLowerCase().includes(search.toLowerCase()) ||
      j.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={css.page}>
      <div style={css.topBar}>
        <input
          style={css.search} placeholder="🔍  Search by airline, aircraft, or country..."
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <select style={css.select} value={authority} onChange={(e) => setAuthority(e.target.value)}>
          {AUTHORITIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <button style={css.refreshBtn} onClick={fetchJobs}>↻ Refresh</button>
        <span style={css.count}>{filtered.length} of {total} jobs</span>
      </div>

      {loading ? (
        <div style={css.loading}>⏳ Loading jobs from around the world...</div>
      ) : filtered.length === 0 ? (
        <div style={css.empty}>
          <div style={css.emptyIcon}>🔍</div>
          <div style={css.emptyTitle}>No jobs found</div>
          <div style={css.emptyText}>Try adjusting your search or authority filter.<br />New jobs are scraped every 6 hours.</div>
        </div>
      ) : (
        <div style={css.grid}>
          {filtered.map((job) => {
            const match = matchLabel(job.matchScore);
            const isHover = hoverId === job.id;
            return (
              <div
                key={job.id}
                style={{ ...css.card, ...(isHover ? css.cardHover : {}) }}
                onMouseEnter={() => setHoverId(job.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={() => setSelected(job)}
              >
                <div style={css.cardTop}>
                  <div style={css.title}>{job.title}</div>
                  {job.reqAuthorities?.[0] && (
                    <div style={css.authorityBadge}>{job.reqAuthorities[0]}</div>
                  )}
                </div>

                <div style={css.airline}>{job.company}</div>

                <div style={css.metaRow}>
                  <span style={css.meta}>📍 {job.location}</span>
                  {job.reqMinTotalHours && (
                    <span style={css.meta}>⏱ {job.reqMinTotalHours.toLocaleString()} hrs min</span>
                  )}
                  {job.reqCertificates?.[0] && (
                    <span style={css.meta}>📋 {job.reqCertificates[0]}</span>
                  )}
                </div>

                {job.reqAircraftTypes?.length > 0 && (
                  <div style={css.reqs}>
                    {job.reqAircraftTypes.slice(0, 3).map((a) => (
                      <span key={a} style={css.req}>{a}</span>
                    ))}
                  </div>
                )}

                {match && <div style={css.matchBadge(match)}>✓ {match.text}</div>}

                <button
                  style={{
                    ...css.viewBtn,
                    ...(isHover ? { borderColor: '#00B4D8', color: '#00B4D8' } : {}),
                  }}
                >
                  View Details →
                </button>
              </div>
            );
          })}
        </div>
      )}

      <JobModal job={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
