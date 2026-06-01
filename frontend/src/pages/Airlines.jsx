import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { airlineApi } from '../services/api';

const REGIONS = ['Europe', 'Americas', 'Asia-Pacific', 'Middle East', 'Africa'];
const HIRING_STATUSES = [
  { value: 'ACTIVELY_HIRING', label: 'Actively Hiring' },
  { value: 'OCCASIONAL',      label: 'Occasional'       },
  { value: 'PAUSED',          label: 'Paused'            },
  { value: 'UNKNOWN',         label: 'Unknown'           },
];
const SORT_OPTIONS = [
  { value: 'name',        label: 'Name (A–Z)'     },
  { value: 'lastUpdated', label: 'Recently Updated' },
  { value: 'hiringStatus', label: 'Hiring Status'  },
];

function hiringBadge(status) {
  const map = {
    ACTIVELY_HIRING: { label: 'Actively Hiring', color: '#2ECC71', bg: 'rgba(46,204,113,0.12)' },
    OCCASIONAL:      { label: 'Occasional',       color: '#F39C12', bg: 'rgba(243,156,18,0.12)' },
    PAUSED:          { label: 'Paused',            color: '#E74C3C', bg: 'rgba(231,76,60,0.12)'  },
    UNKNOWN:         { label: 'Unknown',           color: '#7A8CA0', bg: 'rgba(122,140,160,0.12)' },
  };
  return map[status] || map.UNKNOWN;
}

const S = {
  page: { padding: '0 0 40px' },
  controls: {
    display: 'flex', flexWrap: 'wrap', gap: 10,
    marginBottom: 24, alignItems: 'center',
  },
  search: {
    flex: '1 1 200px', minWidth: 0,
    padding: '10px 14px', borderRadius: 10,
    background: '#0D1E35', border: '1px solid #1E3050',
    color: '#fff', fontSize: 14, outline: 'none',
  },
  select: {
    padding: '10px 12px', borderRadius: 10,
    background: '#0D1E35', border: '1px solid #1E3050',
    color: '#7A8CA0', fontSize: 13, cursor: 'pointer', outline: 'none',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 14,
  },
  card: {
    background: '#0D1E35', border: '1px solid #1E3050',
    borderRadius: 14, padding: '18px 20px',
    cursor: 'pointer', transition: 'border-color 0.15s',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  cardHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  airlineName: { fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.3 },
  iata: {
    fontSize: 11, fontWeight: 800, color: '#00B4D8',
    background: 'rgba(0,180,216,0.1)', border: '1px solid rgba(0,180,216,0.2)',
    borderRadius: 6, padding: '2px 7px', flexShrink: 0,
  },
  meta: { fontSize: 12, color: '#7A8CA0', display: 'flex', gap: 10, flexWrap: 'wrap' },
  badge: (color, bg) => ({
    fontSize: 11, fontWeight: 700, color, background: bg,
    border: `1px solid ${color}40`, borderRadius: 6, padding: '2px 8px',
    display: 'inline-block',
  }),
  pager: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 24, gap: 12, flexWrap: 'wrap',
  },
  pagerBtn: (disabled) => ({
    padding: '8px 18px', borderRadius: 8,
    background: disabled ? '#0D1E35' : '#1B2B4B',
    border: '1px solid #1E3050',
    color: disabled ? '#2A3C55' : '#7A8CA0',
    fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
  }),
  empty: { textAlign: 'center', color: '#4A6080', padding: '60px 20px', fontSize: 14 },
};

export default function Airlines() {
  const navigate = useNavigate();
  const [q, setQ]                     = useState('');
  const [region, setRegion]           = useState('');
  const [hiringStatus, setHiringStatus] = useState('');
  const [sort, setSort]               = useState('name');
  const [page, setPage]               = useState(1);
  const [data, setData]               = useState({ items: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading]         = useState(true);

  const fetchAirlines = useCallback(async () => {
    setLoading(true);
    try {
      const params = { sort, page, limit: 24 };
      if (q)            params.q            = q;
      if (region)       params.region       = region;
      if (hiringStatus) params.hiringStatus = hiringStatus;
      const { data: res } = await airlineApi.list(params);
      setData(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [q, region, hiringStatus, sort, page]);

  useEffect(() => { fetchAirlines(); }, [fetchAirlines]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [q, region, hiringStatus, sort]);

  return (
    <div style={S.page}>
      <div style={S.controls}>
        <input
          style={S.search}
          placeholder="Search airlines…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select style={S.select} value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">All Regions</option>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select style={S.select} value={hiringStatus} onChange={(e) => setHiringStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {HIRING_STATUSES.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
        </select>
        <select style={S.select} value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {!loading && data.total > 0 && (
        <div style={{ fontSize: 12, color: '#4A6080', marginBottom: 14 }}>
          {data.total} airline{data.total !== 1 ? 's' : ''}
        </div>
      )}

      {loading ? (
        <div style={S.empty}>Loading…</div>
      ) : data.items.length === 0 ? (
        <div style={S.empty}>No airlines found.</div>
      ) : (
        <div style={S.grid}>
          {data.items.map((airline) => {
            const badge = hiringBadge(airline.hiringStatus);
            return (
              <div
                key={airline.id}
                style={S.card}
                onClick={() => navigate(`/airlines/${airline.id}`)}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#2A3C55'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#1E3050'}
              >
                <div style={S.cardHeader}>
                  <div style={S.airlineName}>{airline.name}</div>
                  {airline.iataCode && <div style={S.iata}>{airline.iataCode}</div>}
                </div>
                <div style={S.meta}>
                  <span>{airline.country}</span>
                  <span>·</span>
                  <span>{airline.region}</span>
                  {airline.fleet?.length > 0 && (
                    <><span>·</span><span>{airline.fleet.length} type{airline.fleet.length !== 1 ? 's' : ''}</span></>
                  )}
                </div>
                <div>
                  <span style={S.badge(badge.color, badge.bg)}>{badge.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.totalPages > 1 && (
        <div style={S.pager}>
          <button
            style={S.pagerBtn(page <= 1)}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Previous
          </button>
          <span style={{ fontSize: 13, color: '#4A6080' }}>
            Page {data.page} of {data.totalPages}
          </span>
          <button
            style={S.pagerBtn(page >= data.totalPages)}
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
