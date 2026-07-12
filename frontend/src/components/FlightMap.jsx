import React, { useEffect, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { MapPin } from 'lucide-react';
import { profileApi } from '../services/api';
import Card from './primitives/Card';

// World topology fetched by the browser at render time (110m simplified, ~100KB).
const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const css = {
  cardHeader: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  cardTitle: { fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' },
  cardSubtitle: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 },
  th: { textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 10px', borderBottom: '1px solid var(--border)' },
  td: { fontSize: 13, color: 'var(--text-primary)', padding: '9px 10px', borderBottom: '1px solid var(--border)' },
  mono: { fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' },
};

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : '—');

export default function FlightMap() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    profileApi.getAirports()
      .then(({ data: d }) => setData(d))
      .catch(() => setError(true));
  }, []);

  if (error || (data && data.airports.length === 0 && data.unresolved.length === 0)) return null;

  const airports = data?.airports ?? [];
  const maxCount = airports.reduce((m, a) => Math.max(m, a.count), 1);
  const topCodes = new Set(airports.slice(0, 3).map((a) => a.code));

  return (
    <Card style={{ padding: 28, marginBottom: 24 }}>
      <div style={css.cardHeader}>
        <MapPin size={22} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={css.cardTitle}>Your flight map</div>
          <div style={css.cardSubtitle}>
            Every airport recorded in your logbook — {airports.length} airport{airports.length === 1 ? '' : 's'}
            {airports.length > 0 && ` across ${new Set(airports.map((a) => a.country)).size} countries`}
          </div>
        </div>
      </div>

      {!data ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading your map…</div>
      ) : (
        <>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#EAF0F7' }}>
            <ComposableMap projection="geoNaturalEarth1" style={{ width: '100%', height: 'auto', display: 'block' }}>
              <Geographies geography={GEO_URL}>
                {({ geographies }) => geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="#FBF7F0"
                    stroke="#C9D4E4"
                    strokeWidth={0.5}
                    style={{ default: { outline: 'none' }, hover: { outline: 'none', fill: '#F3ECE0' }, pressed: { outline: 'none' } }}
                  />
                ))}
              </Geographies>
              {airports.map((a) => {
                const r = 3 + (a.count / maxCount) * 5;
                const hot = topCodes.has(a.code);
                return (
                  <Marker key={a.code} coordinates={[a.lon, a.lat]}>
                    <circle r={r} fill={hot ? '#F0A84B' : 'var(--accent)'} fillOpacity={0.85} stroke="#fff" strokeWidth={1}>
                      <title>{`${a.code} · ${a.city || a.name || ''} · ${a.count} flight${a.count === 1 ? '' : 's'}`}</title>
                    </circle>
                  </Marker>
                );
              })}
            </ComposableMap>
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: '#F0A84B', marginRight: 6 }} />Most visited</span>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', marginRight: 6 }} />Visited</span>
            <span style={{ marginLeft: 'auto' }}>Dot size = number of flights</span>
          </div>

          {/* Airport report — every code recorded in the logbook */}
          <div style={{ marginTop: 24, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={css.th}>Code</th>
                  <th style={css.th}>City</th>
                  <th style={css.th}>Country</th>
                  <th style={{ ...css.th, textAlign: 'right' }}>Flights</th>
                  <th style={css.th}>First</th>
                  <th style={css.th}>Last</th>
                </tr>
              </thead>
              <tbody>
                {airports.map((a) => (
                  <tr key={a.code}>
                    <td style={{ ...css.td, ...css.mono, fontWeight: 700, color: 'var(--accent)' }}>{a.code}</td>
                    <td style={css.td}>{a.city || a.name || '—'}</td>
                    <td style={css.td}>{a.country || '—'}</td>
                    <td style={{ ...css.td, ...css.mono, textAlign: 'right' }}>{a.count}</td>
                    <td style={css.td}>{fmtDate(a.firstDate)}</td>
                    <td style={css.td}>{fmtDate(a.lastDate)}</td>
                  </tr>
                ))}
                {(data.unresolved ?? []).map((u) => (
                  <tr key={u.code}>
                    <td style={{ ...css.td, ...css.mono, color: 'var(--text-secondary)' }}>{u.code}</td>
                    <td style={{ ...css.td, color: 'var(--text-secondary)', fontStyle: 'italic' }} colSpan={2}>Unknown airport code</td>
                    <td style={{ ...css.td, ...css.mono, textAlign: 'right' }}>{u.count}</td>
                    <td style={css.td}>{fmtDate(u.firstDate)}</td>
                    <td style={css.td}>{fmtDate(u.lastDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
