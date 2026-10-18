import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import LightPage from '../components/primitives/LightPage';
import { HiringPill, LogoTile } from '../components/airlines/AirlineBits';
import { airlineApi } from '../services/api';
import { shortFleet } from '../lib/airlineFacts';
import '../components/airlines/airlines.css';

/**
 * Airlines — fact files, ordered the way a pilot reads them: who is hiring,
 * then how much is open, with how many of those jobs they personally qualify
 * for (the same matcher the Jobs page uses).
 */

const REGIONS = ['All', 'Middle East', 'Europe', 'Asia-Pacific', 'Americas', 'Africa'];

export default function Airlines() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [search, setSearch] = useState(params.get('q') || '');
  const [region, setRegion] = useState(params.get('region') || 'All');
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await airlineApi.list({
        sort: 'openJobs',
        limit: 50,
        ...(search ? { q: search } : {}),
        ...(region !== 'All' ? { region } : {}),
      });
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [search, region]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const next = {};
    if (search) next.q = search;
    if (region !== 'All') next.region = region;
    setParams(next, { replace: true });
  }, [search, region, setParams]);

  const hiringCount = useMemo(
    () => data.items.filter((a) => a.hiringStatus === 'ACTIVELY_HIRING').length,
    [data.items],
  );

  return (
    <LightPage className="af">
      <div className="af-head">
        <h1>Airlines</h1>
        <p className="sub">Fact files, checked against your licence</p>
      </div>

      <div className="af-search">
        <Search size={16} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Airline, country or aircraft type"
          aria-label="Search airlines"
        />
      </div>

      <div className="af-chips">
        {REGIONS.map((r) => (
          <button key={r} type="button" className={`af-chip${region === r ? ' on' : ''}`} onClick={() => setRegion(r)}>
            {r}
          </button>
        ))}
      </div>

      <div className="af-meta">
        <span><b>Hiring now</b> first</span>
        <span>{loading ? 'Loading…' : `${data.total} airline${data.total === 1 ? '' : 's'}${hiringCount ? ` · ${hiringCount} hiring` : ''}`}</span>
      </div>

      {data.items.map((a) => <AirlineCard key={a.id} airline={a} onOpen={() => navigate(`/airlines/${a.id}`)} />)}

      {!loading && !data.items.length && (
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 0', fontSize: 14 }}>
          No airlines match that search.
        </p>
      )}
    </LightPage>
  );
}

function AirlineCard({ airline, onOpen }) {
  const fleet = shortFleet(airline.fleet);
  const jobs = airline.jobs || { open: 0, qualify: 0, matchable: false };
  return (
    <button type="button" className="af-card" onClick={onOpen}>
      <LogoTile logoUrl={airline.logoUrl} iataCode={airline.iataCode} name={airline.name} />
      <span style={{ minWidth: 0 }}>
        <span className="n" style={{ display: 'block' }}>{airline.name}</span>
        <span className="c" style={{ display: 'block' }}>
          {[airline.country, fleet].filter(Boolean).join(' · ')}
        </span>
        <span className="j">
          <HiringPill status={airline.hiringStatus} />
          {jobs.open === 0
            ? 'no open jobs'
            : (
              <span>
                {jobs.open} open · {jobs.qualify > 0
                  ? <b>you qualify for {jobs.qualify}</b>
                  : jobs.matchable ? '0 for you yet' : 'add your licence to check'}
              </span>
            )}
        </span>
      </span>
      <ChevronRight size={18} className="af-chev" />
    </button>
  );
}
