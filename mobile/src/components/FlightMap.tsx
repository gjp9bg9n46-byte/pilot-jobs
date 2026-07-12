// Flight map — mobile port of the web Profile map. World geometry (public
// world-atlas topojson) is fetched once at runtime and cached at module level;
// d3-geo does the projection math and react-native-svg renders it. Pins mark
// every airport recorded in the logbook (dot size = flight count, top 3 amber),
// with the per-airport report list below. Unresolvable codes are listed greyed.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
// @ts-ignore — pure-JS lib, no bundled types needed
import { geoNaturalEarth1, geoPath } from 'd3-geo';
// @ts-ignore — pure-JS lib, no bundled types needed
import { feature } from 'topojson-client';
import api from '../lib/api';
import { fontFamilies } from '../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../theme/ThemeContext';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const W = 340;
const H = 172;

type Airport = {
  code: string; city?: string | null; name?: string | null; country?: string | null;
  lat: number; lon: number; count: number; firstDate?: string; lastDate?: string;
};
type Unresolved = { code: string; count: number; firstDate?: string; lastDate?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let geoCache: any = null;

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : '—';

export default function FlightMap() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const [data, setData] = useState<{ airports: Airport[]; unresolved: Unresolved[] } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [world, setWorld] = useState<any>(geoCache);

  useEffect(() => {
    let alive = true;
    api.get('/profile/airports').then(({ data: d }) => { if (alive) setData(d); }).catch(() => {});
    if (!geoCache) {
      fetch(GEO_URL)
        .then((r) => r.json())
        .then((topo) => { geoCache = feature(topo, topo.objects.countries); if (alive) setWorld(geoCache); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, []);

  if (!data || (data.airports.length === 0 && (data.unresolved?.length ?? 0) === 0)) return null;

  const projection = geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' });
  const path = geoPath(projection);
  const airports = data.airports;
  const maxCount = airports.reduce((m, a) => Math.max(m, a.count), 1);
  const top = new Set(airports.slice(0, 3).map((a) => a.code));
  const countries = new Set(airports.map((a) => a.country).filter(Boolean)).size;

  return (
    <View>
      <Text style={styles.summary}>
        {airports.length} airport{airports.length === 1 ? '' : 's'}{countries > 0 ? ` across ${countries} countr${countries === 1 ? 'y' : 'ies'}` : ''}
      </Text>
      <View style={styles.mapBox}>
        <Svg width="100%" height={undefined} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ aspectRatio: W / H }}>
          {world
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? (world.features as any[]).map((f, i) => (
                <Path key={i} d={path(f) ?? ''} fill={pilot.surface} stroke={pilot.line} strokeWidth={0.4} />
              ))
            : null}
          {airports.map((a) => {
            const p = projection([a.lon, a.lat]);
            if (!p) return null;
            const r = 2.5 + (a.count / maxCount) * 4;
            return (
              <Circle key={a.code} cx={p[0]} cy={p[1]} r={r}
                fill={top.has(a.code) ? pilot.amber : pilot.navy}
                stroke="#FFFFFF" strokeWidth={0.8} opacity={0.9} />
            );
          })}
        </Svg>
      </View>
      <View style={styles.legendRow}>
        <View style={[styles.legendDot, { backgroundColor: pilot.amber }]} /><Text style={styles.legendText}>Most visited</Text>
        <View style={[styles.legendDot, { backgroundColor: pilot.navy, marginLeft: 14 }]} /><Text style={styles.legendText}>Visited</Text>
        <Text style={[styles.legendText, { marginLeft: 'auto' }]}>Dot size = flights</Text>
      </View>

      {/* Airport report — every code recorded in the logbook */}
      {airports.map((a) => (
        <View key={a.code} style={styles.repRow}>
          <Text style={styles.repCode}>{a.code}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.repCity} numberOfLines={1}>{a.city || a.name || '—'}{a.country ? `, ${a.country}` : ''}</Text>
            <Text style={styles.repDates}>{fmt(a.firstDate)} – {fmt(a.lastDate)}</Text>
          </View>
          <Text style={styles.repCount}>{a.count}×</Text>
        </View>
      ))}
      {(data.unresolved ?? []).map((u) => (
        <View key={u.code} style={styles.repRow}>
          <Text style={[styles.repCode, { color: pilot.muted }]}>{u.code}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.repCity, { color: pilot.muted, fontStyle: 'italic' }]}>Unknown airport code</Text>
            <Text style={styles.repDates}>{fmt(u.firstDate)} – {fmt(u.lastDate)}</Text>
          </View>
          <Text style={styles.repCount}>{u.count}×</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  summary: { fontSize: 12, fontFamily: fontFamilies.bodyMedium, color: pilot.muted, marginBottom: 10 },
  mapBox: { borderWidth: 1, borderColor: pilot.line, borderRadius: 10, overflow: 'hidden', backgroundColor: pilot.cream },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 14 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  legendText: { fontSize: 11, fontFamily: fontFamilies.bodyMedium, color: pilot.muted },
  repRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: pilot.line },
  repCode: { fontFamily: fontFamilies.mono, fontSize: 13, fontWeight: '800', color: pilot.navy, width: 52 },
  repCity: { fontSize: 13, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  repDates: { fontSize: 11, fontFamily: fontFamilies.body, color: pilot.muted, marginTop: 1 },
  repCount: { fontFamily: fontFamilies.mono, fontSize: 12, color: pilot.muted },
});
