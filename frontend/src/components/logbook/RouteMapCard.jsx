import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography, Line, Marker, ZoomableGroup } from 'react-simple-maps';
import { ChevronRight, X } from 'lucide-react';
import { useAirports } from '../../lib/useAirports';

// ── Where you flew ───────────────────────────────────────────────────────────
// The web half of the app's logbook map card, drawn the same way: small navy
// dots, thin routes, a route flown often drawn stronger than a one-off
// positioning sector. Click it and the same map fills the window, where it
// zooms with the wheel, pans with a drag, and names an airport when a pin is
// clicked.
//
// Two scopes, the same setting the app uses and the same stored preference:
//   all   — every route ever flown. A pilot's map is their career.
//   view  — only the sectors the list is showing right now.
//
// react-simple-maps is already in the project (it draws the profile's flight
// map) and brings its own zoom and pan, so nothing new is added here.

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const NAVY = '#003F88';

// A phone is a phone whether the app or the browser is drawing it: at 390px
// this card says "Tap to explore", the same as the app, and "scroll to zoom"
// becomes "pinch to zoom".
const isTouch = () => typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(hover: none)').matches;

/** The airports and legs to draw, for the chosen scope. */
function useFlown(sectors, { byCode, routes }, scope) {
  // All-time only when a caller ASKS for it. Defaulting to it turned a
  // single sector's map into the whole career on the app's flight page.
  const allTime = scope === 'all' && routes.length > 0;
  return useMemo(() => {
    const at = (code) => (code ? byCode.get(String(code).toUpperCase()) : undefined);
    const seen = new Map();
    const legs = [];
    const pairs = allTime
      ? routes.map((r) => [r.from, r.to, r.count])
      : (sectors || []).map((s) => [s.from, s.to, 1]);
    let skipped = 0;
    for (const [from, to, count] of pairs) {
      const A = at(from); const B = at(to);
      for (const [code, ap] of [[from, A], [to, B]]) {
        if (!code) continue;
        if (!ap) { skipped += 1; continue; }
        const cur = seen.get(ap.code) || { a: ap, count: 0 };
        cur.count += count;
        seen.set(ap.code, cur);
      }
      if (A && B && A.code !== B.code) legs.push({ a: A, b: B, count });
    }
    return { points: [...seen.values()], legs, skipped, allTime };
  }, [sectors, byCode, routes, allTime]);
}

/** Centre and zoom that put every airport on screen. */
function fitFor(points) {
  if (!points.length) return { center: [12, 20], zoom: 1 };
  const lons = points.map((p) => p.a.lon);
  const lats = points.map((p) => p.a.lat);
  const minLon = Math.min(...lons); const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
  const center = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
  // The world is 360° across at zoom 1; leave a quarter of the span as margin.
  const span = Math.max(maxLon - minLon, (maxLat - minLat) * 1.6, 4) * 1.25;
  return { center, zoom: Math.max(1, Math.min(12, 360 / span)) };
}

function Plot({
  points, legs, height, width, interactive, zoom, center, onMove, picked, onPick, pinLabels = false,
}) {
  // ComposableMap's viewBox is 800 wide however wide the card is, so anything
  // drawn at a pixel size shrinks by cardWidth/800 on screen — the code chips
  // came out at two fifths of their size in a 358px card. `k` undoes that, so
  // a chip is the same size here as the one the app draws.
  const k = (800 / (width || 800)) / zoom;
  // Filling the window, the thumbnail's near-white coastlines disappear. The
  // explored view gets a little more contrast so the land reads as land.
  const land = interactive
    ? { fill: '#E3EBF5', stroke: '#C4D2E4' }
    : { fill: '#E8EEF6', stroke: '#D5DEE9' };
  // On a career map a once-flown route is deliberately faint against the
  // regular ones. On ONE sector there is nothing to be faint against, and
  // the line is the point.
  const strokeFor = (c) => (pinLabels ? 'rgba(0,63,136,0.6)'
    : c > 1 ? 'rgba(0,63,136,0.55)' : 'rgba(0,63,136,0.22)');
  const body = (
    <>
      <Geographies geography={GEO_URL}>
        {({ geographies }) => geographies.map((geo) => (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            fill={land.fill}
            stroke={land.stroke}
            strokeWidth={(interactive ? 0.7 : 0.5) / zoom}
            style={{ default: { outline: 'none' }, hover: { outline: 'none' }, pressed: { outline: 'none' } }}
          />
        ))}
      </Geographies>
      {legs.map((l) => (
        <Line
          key={`${l.a.code}-${l.b.code}`}
          from={[l.a.lon, l.a.lat]}
          to={[l.b.lon, l.b.lat]}
          stroke={strokeFor(l.count)}
          strokeWidth={pinLabels ? 1.6 * k : (l.count > 1 ? 1.4 : 0.9) / zoom}
          strokeLinecap="round"
        />
      ))}
      {points.map((p) => {
        const on = picked === p.a.code;
        return (
          <Marker
            key={p.a.code}
            coordinates={[p.a.lon, p.a.lat]}
            onClick={interactive ? () => onPick(on ? null : p.a.code) : undefined}
            style={interactive ? { default: { cursor: 'pointer' } } : undefined}
          >
            {/* A click target a mouse can actually hit, over a dot that stays
                small however far out the map is. */}
            {interactive && <circle r={10 / zoom} fill="transparent" />}
            <circle
              r={pinLabels ? 4 * k : (on ? 4.5 : 2.8) / zoom}
              fill={NAVY}
              stroke="#fff"
              strokeWidth={(on ? 1.6 : 0.9) / zoom}
            >
              <title>{`${p.a.code} · ${p.a.city || p.a.name || ''} · ${p.count} flight${p.count === 1 ? '' : 's'}`}</title>
            </circle>
            {/* The code beside its dot, as a chip — the same thing the app
                draws. Only ever for one sector: on a career's worth of
                airports the labels would cover the map. */}
            {pinLabels && (
              <g transform={`translate(${9 * k} ${-1 * k})`}>
                <rect
                  x={0} y={-9 * k} rx={5 * k}
                  width={34 * k} height={18 * k}
                  fill="#fff" stroke="var(--border)" strokeWidth={1 * k}
                />
                <text
                  x={17 * k} y={4 * k} textAnchor="middle"
                  style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontWeight: 600, fontSize: 11 * k, fill: 'var(--text-primary)',
                  }}
                >
                  {p.a.code}
                </text>
              </g>
            )}
          </Marker>
        );
      })}
    </>
  );
  return (
    <ComposableMap
      projection="geoMercator"
      style={{ width: '100%', height, display: 'block' }}
      projectionConfig={{ scale: 120 }}
    >
      {interactive ? (
        <ZoomableGroup zoom={zoom} center={center} minZoom={1} maxZoom={30} onMoveEnd={onMove}>
          {body}
        </ZoomableGroup>
      ) : (
        <ZoomableGroup zoom={zoom} center={center} filterZoomEvent={() => false}>
          {body}
        </ZoomableGroup>
      )}
    </ComposableMap>
  );
}

export default function RouteMapCard({
  sectors, scope = 'all', onScopeChange, label = 'Where you flew', note, pinLabels = false,
}) {
  const air = useAirports();
  const { points, legs, skipped, allTime } = useFlown(sectors, air, scope);
  const [open, setOpen] = useState(false);
  // The thumbnail's real width, so the SVG can use CSS pixels as its units.
  const frameRef = useRef(null);
  const [frameW, setFrameW] = useState(0);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const measure = () => setFrameW(Math.round(el.clientWidth));
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // Nothing to draw once the airports are in and none of them placed.
  if (air.byCode.size > 0 && !points.length) return null;

  return (
    <>
      <div className="lb-card lb-map">
        <div className="lb-map-head">
          <span className="lb-gl-t">{label}</span>
          {note && <span className="lb-map-note mono">{note}</span>}
          {onScopeChange && air.routes.length > 0 && (
            <div className="lb-seg lb-seg-sm">
              <button type="button" className={allTime ? 'on' : ''} aria-pressed={allTime} onClick={() => onScopeChange('all')}>All time</button>
              <button type="button" className={!allTime ? 'on' : ''} aria-pressed={!allTime} onClick={() => onScopeChange('view')}>This view</button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="lb-map-hit"
          onClick={() => setOpen(true)}
          aria-label={`Where you flew, ${points.length} airports. Opens the full map.`}
        >
          <div className="lb-map-frame" ref={frameRef}>
            <Plot
              {...fitFor(points)}
              points={points} legs={legs} height={170} width={frameW}
              interactive={false} picked={null} onPick={() => {}} pinLabels={pinLabels}
            />
          </div>
          <div className="lb-map-foot">
            <span className="s">
              {points.length} airport{points.length === 1 ? '' : 's'}
              {/* Only where the scope can be chosen; on one sector "this
                  view" answers a question nobody asked. */}
              {onScopeChange ? (allTime ? ' · all time' : ' · this view') : ''}
              {skipped > 0 ? ` · ${skipped} without coordinates not shown` : ''}
            </span>
            <span className="lb-map-cta">{isTouch() ? 'Tap' : 'Click'} to explore <ChevronRight size={13} /></span>
          </div>
        </button>
      </div>

      {open && (
        <FullMap
          points={points}
          legs={legs}
          title={allTime ? 'Everywhere you have flown' : label}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function FullMap({ points, legs, title, onClose }) {
  const fit = useMemo(() => fitFor(points), [points]);
  const [view, setView] = useState(fit);
  const [picked, setPicked] = useState(null);
  const chosen = picked ? points.find((p) => p.a.code === picked) : null;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="lb-map-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="lb-map-bar">
        <button type="button" className="lb-map-close" onClick={onClose} aria-label="Close the map"><X size={20} /></button>
        <span className="lb-map-title">{title}</span>
        <button type="button" className="lb-map-close" onClick={() => setView({ ...fit })} aria-label="Fit every airport">⤢</button>
      </div>
      <div className="lb-map-canvas">
        <Plot
          points={points}
          legs={legs}
          height="100%"
          interactive
          zoom={view.zoom}
          center={view.center}
          onMove={({ zoom, coordinates }) => setView({ zoom, center: coordinates })}
          picked={picked}
          onPick={setPicked}
        />
      </div>
      <div className="lb-map-card">
        {chosen ? (
          <>
            <div className="c">{chosen.a.code}</div>
            <div className="n">{chosen.a.name || chosen.a.city || ''}</div>
            <div className="m">{chosen.count} flight{chosen.count === 1 ? '' : 's'}</div>
          </>
        ) : (
          <div className="m">
            {points.length} airport{points.length === 1 ? '' : 's'} · {legs.length} route{legs.length === 1 ? '' : 's'}
            {isTouch() ? ' · pinch to zoom, drag to pan, tap a pin' : ' · scroll to zoom, drag to pan, click a pin'}
          </div>
        )}
      </div>
    </div>
  );
}
