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
  { value: 'ICAO',   label: '🌍 ICAO — International' },
];

const ROLES = [
  { value: '', label: 'Any Role' },
  { value: 'captain', label: 'Captain' },
  { value: 'first_officer', label: 'First Officer' },
  { value: 'flight_engineer', label: 'Flight Engineer' },
];

const CONTRACT_TYPES = [
  { value: '', label: 'Any Contract' },
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'acmi', label: 'ACMI' },
];

const POSTED_WITHIN = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Last 24h' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'relevant', label: 'Most Relevant' },
  { value: 'deadline', label: 'Deadline' },
];

function matchLabel(score) {
  if (!score) return null;
  if (score >= 90) return { text: 'Excellent Match', bg: '#0D2B1A', color: '#2ECC71', border: '#1A4A2A' };
  if (score >= 75) return { text: 'Great Match',     bg: '#0A2540', color: '#00B4D8', border: '#1A3A5A' };
  if (score >= 60) return { text: 'Good Match',      bg: '#2B1F0A', color: '#F39C12', border: '#4A3A1A' };
  return null;
}

function postedAgo(postedAt) {
  if (!postedAt) return null;
  const diff = Date.now() - new Date(postedAt).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Posted today';
  if (days === 1) return 'Posted 1 day ago';
  return `Posted ${days} days ago`;
}

const css = {
  page: {},
  topBar: { display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' },
  search: {
    flex: 1, minWidth: 260, background: '#1B2B4B', border: '1px solid #243050',
    borderRadius: 10, padding: '12px 16px', color: '#fff', fontSize: 14, outline: 'none',
    fontFamily: 'Inter, sans-serif',
  },
  select: {
    background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10,
    padding: '12px 14px', color: '#fff', fontSize: 14, outline: 'none', cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  refreshBtn: {
    background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10,
    padding: '12px 18px', color: '#7A8CA0', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  filtersBtn: (active, count) => ({
    background: active ? '#0A2540' : '#1B2B4B',
    border: `1px solid ${active ? '#00B4D8' : '#243050'}`,
    borderRadius: 10,
    padding: '12px 18px', color: active ? '#00B4D8' : '#7A8CA0', fontSize: 14,
    fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
    fontFamily: 'Inter, sans-serif',
    position: 'relative',
  }),
  filtersBadge: {
    background: '#00B4D8', color: '#0A1628', borderRadius: '50%',
    width: 18, height: 18, display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 11, fontWeight: 800,
  },
  qualifiedBtn: (active) => ({
    background: active ? '#0D2B1A' : '#1B2B4B',
    border: `1px solid ${active ? '#2ECC71' : '#243050'}`,
    borderRadius: 20,
    padding: '10px 16px', color: active ? '#2ECC71' : '#7A8CA0', fontSize: 13,
    fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
    fontFamily: 'Inter, sans-serif',
  }),
  count: { color: '#4A6080', fontSize: 13, alignSelf: 'center', whiteSpace: 'nowrap' },
  filterPanel: {
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 14,
    padding: 24, marginTop: 16, marginBottom: 20,
  },
  filterGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16,
  },
  filterField: { display: 'flex', flexDirection: 'column', gap: 6 },
  filterLabel: { fontSize: 11, color: '#7A8CA0', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' },
  filterInput: {
    background: '#1B2B4B', border: '1px solid #243050', borderRadius: 8,
    padding: '10px 12px', color: '#fff', fontSize: 13, outline: 'none',
    fontFamily: 'Inter, sans-serif',
  },
  filterSelect: {
    background: '#1B2B4B', border: '1px solid #243050', borderRadius: 8,
    padding: '10px 12px', color: '#fff', fontSize: 13, outline: 'none', cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  filterActions: { display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' },
  clearBtn: {
    background: 'transparent', border: '1px solid #243050', borderRadius: 8,
    padding: '10px 18px', color: '#7A8CA0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  applyBtn: {
    background: 'linear-gradient(135deg, #00B4D8, #0077A8)', border: 'none', borderRadius: 8,
    padding: '10px 22px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  toolbar: { display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 },
  card: {
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 16,
    padding: 24, display: 'flex', flexDirection: 'column', gap: 12,
    transition: 'border-color 0.2s, transform 0.15s', cursor: 'pointer',
    position: 'relative',
  },
  cardHover: { borderColor: '#00B4D8', transform: 'translateY(-2px)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.4 },
  airline: { fontSize: 14, color: '#00B4D8', fontWeight: 600 },
  postedAgo: { fontSize: 12, color: '#7A8CA0', marginTop: 2 },
  authorityBadge: {
    background: '#0A2040', border: '1px solid #1E3050', borderRadius: 6,
    padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#00B4D8', whiteSpace: 'nowrap',
  },
  heartBtn: {
    position: 'absolute', top: 16, right: 16, background: 'none', border: 'none',
    cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1, zIndex: 1,
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
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [hoverId, setHoverId] = useState(null);

  // Filter panel state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [authority, setAuthority] = useState('');
  const [aircraftType, setAircraftType] = useState('');
  const [role, setRole] = useState('');
  const [contractType, setContractType] = useState('');
  const [postedWithin, setPostedWithin] = useState('');
  const [minSalary, setMinSalary] = useState('');

  // Pending (unapplied) filter state
  const [pendingAuthority, setPendingAuthority] = useState('');
  const [pendingAircraftType, setPendingAircraftType] = useState('');
  const [pendingRole, setPendingRole] = useState('');
  const [pendingContractType, setPendingContractType] = useState('');
  const [pendingPostedWithin, setPendingPostedWithin] = useState('');
  const [pendingMinSalary, setPendingMinSalary] = useState('');

  // Qualified only toggle
  const [qualifiedOnly, setQualifiedOnly] = useState(false);

  // Sort
  const [sort, setSort] = useState('newest');

  // Saved jobs local state: map of id -> bool
  const [savedMap, setSavedMap] = useState({});

  const activeFilterCount = [authority, aircraftType, role, contractType, postedWithin, minSalary].filter(Boolean).length;

  const openFilters = () => {
    setPendingAuthority(authority);
    setPendingAircraftType(aircraftType);
    setPendingRole(role);
    setPendingContractType(contractType);
    setPendingPostedWithin(postedWithin);
    setPendingMinSalary(minSalary);
    setFiltersOpen(true);
  };

  const closeFilters = () => setFiltersOpen(false);

  const applyFilters = () => {
    setAuthority(pendingAuthority);
    setAircraftType(pendingAircraftType);
    setRole(pendingRole);
    setContractType(pendingContractType);
    setPostedWithin(pendingPostedWithin);
    setMinSalary(pendingMinSalary);
    setFiltersOpen(false);
  };

  const clearAll = () => {
    setPendingAuthority('');
    setPendingAircraftType('');
    setPendingRole('');
    setPendingContractType('');
    setPendingPostedWithin('');
    setPendingMinSalary('');
  };

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: 100 };
      if (authority) params.authority = authority;
      if (aircraftType) params.aircraft = aircraftType;
      if (role) params.role = role;
      if (contractType) params.contractType = contractType;
      if (postedWithin) params.postedWithin = postedWithin;
      if (minSalary) params.salaryMin = minSalary;
      if (qualifiedOnly) params.qualifiedOnly = true;
      if (sort) params.sort = sort;
      const { data } = await jobApi.list(params);
      dispatch(setJobs({ jobs: data.jobs, total: data.total }));
      const initSaved = {};
      (data.jobs || []).forEach((j) => {
        if (j.isSaved !== undefined) initSaved[j.id] = j.isSaved;
      });
      setSavedMap((prev) => ({ ...initSaved, ...prev }));
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [authority, aircraftType, role, contractType, postedWithin, minSalary, qualifiedOnly, sort]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleSaveToggle = async (e, jobId) => {
    e.stopPropagation();
    const currentlySaved = savedMap[jobId] || false;
    setSavedMap((prev) => ({ ...prev, [jobId]: !currentlySaved }));
    try {
      if (currentlySaved) {
        await jobApi.unsaveJob(jobId);
      } else {
        await jobApi.saveJob(jobId);
      }
    } catch {
      // Revert on error
      setSavedMap((prev) => ({ ...prev, [jobId]: currentlySaved }));
    }
  };

  const filtered = jobs.filter(
    (j) =>
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.company.toLowerCase().includes(search.toLowerCase()) ||
      j.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={css.page}>
      {/* Top bar */}
      <div style={css.topBar}>
        <input
          style={css.search} placeholder="🔍  Search by airline, aircraft, or country..."
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <button
          style={css.filtersBtn(filtersOpen || activeFilterCount > 0, activeFilterCount)}
          onClick={filtersOpen ? closeFilters : openFilters}
        >
          ⚙ Filters
          {activeFilterCount > 0 && (
            <span style={css.filtersBadge}>{activeFilterCount}</span>
          )}
        </button>
        <button
          style={css.qualifiedBtn(qualifiedOnly)}
          onClick={() => setQualifiedOnly((v) => !v)}
        >
          {qualifiedOnly ? '✓ ' : ''}Qualified only
        </button>
        <select
          style={css.select}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button style={css.refreshBtn} onClick={fetchJobs}>↻ Refresh</button>
        <span style={css.count}>{filtered.length} of {total} jobs</span>
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <div style={css.filterPanel}>
          <div style={css.filterGrid}>
            <div style={css.filterField}>
              <label style={css.filterLabel}>Authority</label>
              <select
                style={css.filterSelect}
                value={pendingAuthority}
                onChange={(e) => setPendingAuthority(e.target.value)}
              >
                {AUTHORITIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div style={css.filterField}>
              <label style={css.filterLabel}>Aircraft Type</label>
              <input
                style={css.filterInput}
                placeholder="e.g. Boeing 737"
                value={pendingAircraftType}
                onChange={(e) => setPendingAircraftType(e.target.value)}
              />
            </div>
            <div style={css.filterField}>
              <label style={css.filterLabel}>Role</label>
              <select
                style={css.filterSelect}
                value={pendingRole}
                onChange={(e) => setPendingRole(e.target.value)}
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div style={css.filterField}>
              <label style={css.filterLabel}>Contract Type</label>
              <select
                style={css.filterSelect}
                value={pendingContractType}
                onChange={(e) => setPendingContractType(e.target.value)}
              >
                {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div style={css.filterField}>
              <label style={css.filterLabel}>Posted Within</label>
              <select
                style={css.filterSelect}
                value={pendingPostedWithin}
                onChange={(e) => setPendingPostedWithin(e.target.value)}
              >
                {POSTED_WITHIN.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div style={css.filterField}>
              <label style={css.filterLabel}>Min Salary</label>
              <input
                type="number"
                style={css.filterInput}
                placeholder="e.g. 80000"
                value={pendingMinSalary}
                onChange={(e) => setPendingMinSalary(e.target.value)}
              />
            </div>
          </div>
          <div style={css.filterActions}>
            <button style={css.clearBtn} onClick={clearAll}>Clear All</button>
            <button style={css.applyBtn} onClick={applyFilters}>Apply Filters</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={css.loading}>⏳ Loading jobs from around the world...</div>
      ) : error ? (
        <div style={css.empty}>
          <div style={css.emptyIcon}>⚠️</div>
          <div style={css.emptyTitle}>Could not load jobs</div>
          <div style={css.emptyText}>{error}</div>
          <button
            onClick={fetchJobs}
            style={{ marginTop: 20, background: '#00B4D8', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#0A1628', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={css.empty}>
          <div style={css.emptyIcon}>🔍</div>
          <div style={css.emptyTitle}>No jobs found</div>
          <div style={css.emptyText}>Try adjusting your search or filters.<br />New jobs are scraped every 6 hours.</div>
        </div>
      ) : (
        <div style={css.grid}>
          {filtered.map((job) => {
            const match = matchLabel(job.matchScore);
            const isHover = hoverId === job.id;
            const isSaved = savedMap[job.id] !== undefined ? savedMap[job.id] : (job.isSaved || false);
            const ago = postedAgo(job.postedAt);
            return (
              <div
                key={job.id}
                style={{ ...css.card, ...(isHover ? css.cardHover : {}) }}
                onMouseEnter={() => setHoverId(job.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={() => setSelected(job)}
              >
                {/* Heart save button */}
                <button
                  style={css.heartBtn}
                  onClick={(e) => handleSaveToggle(e, job.id)}
                  title={isSaved ? 'Unsave job' : 'Save job'}
                >
                  {isSaved ? '❤️' : '🤍'}
                </button>

                <div style={css.cardTop}>
                  <div style={css.title}>{job.title}</div>
                  {job.reqAuthorities?.[0] && (
                    <div style={{ ...css.authorityBadge, marginRight: 28 }}>{job.reqAuthorities[0]}</div>
                  )}
                </div>

                <div>
                  <div style={css.airline}>{job.company}</div>
                  {ago && <div style={css.postedAgo}>{ago}</div>}
                </div>

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
