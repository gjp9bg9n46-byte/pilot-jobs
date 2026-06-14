import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { airlineApi } from '../services/api';
import { useIsMobile } from '../hooks/useIsMobile';
import AirlineLogo from '../components/AirlineLogo';
import { LightPage, Input, Button, Badge } from '../components/primitives';

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

// Recruitment status → semantic Badge variant (page-local; also in AirlineDetail.
// Dedupe to a shared helper at a 3rd consumer.)
function hiringMeta(status) {
  const map = {
    ACTIVELY_HIRING: { label: 'Actively Hiring', variant: 'success' },
    OCCASIONAL:      { label: 'Occasional',      variant: 'warning' },
    PAUSED:          { label: 'Paused',          variant: 'error'   },
    UNKNOWN:         { label: 'Unknown',         variant: 'neutral' },
  };
  return map[status] || map.UNKNOWN;
}

const S = {
  controls: {
    display: 'flex', flexWrap: 'wrap', gap: 10,
    marginBottom: 24, alignItems: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 14,
  },
  card: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '18px 20px',
    cursor: 'pointer', transition: 'border-color 0.15s',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  cardHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  airlineName: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 },
  iata: {
    fontSize: 11, fontWeight: 700, color: 'var(--accent)',
    fontFamily: 'var(--font-mono)',
    background: 'rgba(0,63,136,0.08)', border: '1px solid rgba(0,63,136,0.2)',
    borderRadius: 6, padding: '2px 7px', flexShrink: 0,
  },
  meta: { fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 10, flexWrap: 'wrap' },
  pager: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 24, gap: 12, flexWrap: 'wrap',
  },
  empty: { textAlign: 'center', color: 'var(--text-secondary)', padding: '60px 20px', fontSize: 14 },
};

export default function Airlines() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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
    <LightPage style={{ fontFamily: 'var(--font-body)' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 8 }}>Airlines</h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 28 }}>Who's hiring, what they fly, what they pay.</p>

      <div style={S.controls}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <Input placeholder="Search airlines…" aria-label="Search airlines" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ flex: '0 0 auto', minWidth: 150 }}>
          <Input as="select" aria-label="Filter by region" value={region} onChange={(e) => setRegion(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">All Regions</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Input>
        </div>
        <div style={{ flex: '0 0 auto', minWidth: 150 }}>
          <Input as="select" aria-label="Filter by hiring status" value={hiringStatus} onChange={(e) => setHiringStatus(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">All Statuses</option>
            {HIRING_STATUSES.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
          </Input>
        </div>
        <div style={{ flex: '0 0 auto', minWidth: 150 }}>
          <Input as="select" aria-label="Sort airlines" value={sort} onChange={(e) => setSort(e.target.value)} style={{ fontSize: 13 }}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Input>
        </div>
      </div>

      {!loading && data.total > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
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
            const badge = hiringMeta(airline.hiringStatus);
            return (
              <div
                key={airline.id}
                style={S.card}
                role="button"
                tabIndex={0}
                aria-label={`View ${airline.name} factfile`}
                onClick={() => navigate(`/airlines/${airline.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/airlines/${airline.id}`); }
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={S.cardHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <AirlineLogo logoUrl={airline.logoUrl} iataCode={airline.iataCode} name={airline.name} box={isMobile ? 36 : 44} font={isMobile ? 12 : 13} />
                    <div style={S.airlineName}>{airline.name}</div>
                  </div>
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
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.totalPages > 1 && (
        <div style={S.pager}>
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Previous
          </Button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Page {data.page} of {data.totalPages}
          </span>
          <Button variant="secondary" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </Button>
        </div>
      )}
    </LightPage>
  );
}
