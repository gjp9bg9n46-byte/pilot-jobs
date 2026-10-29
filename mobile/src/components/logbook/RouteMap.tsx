// ── Route map ────────────────────────────────────────────────────────────────
// The airports a pilot has actually flown to, with a line along each sector
// flown. Used twice: a card on the Logbook for whatever period is on screen,
// and a small one on a flight's own page for that single sector.
//
// Coordinates come from the airports we already resolve (OurAirports plus our
// overrides, so ALY works). An airport we cannot place is SKIPPED — never
// drawn at 0,0, which would put a pin in the Atlantic off Ghana and make the
// map lie.
//
// The card is a thumbnail, not an instrument: small navy dots, the routes, and
// a tap that opens the real map full screen (app/(app)/logbook/map.tsx, Apple
// Maps). It used to carry its own pinch-and-pan, which fought the page scroll
// and could never show enough to be worth the fight.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G, Path } from 'react-native-svg';
// @ts-ignore — pure-JS lib, no bundled types
import { geoMercator, geoPath } from 'd3-geo';
// @ts-ignore — pure-JS lib, no bundled types
import { feature } from 'topojson-client';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { setPendingMap } from '../../lib/pendingMap';
import { fontFamilies, layout, spacing } from '../../theme/tokens';
import { ThemePalette, useThemedStyles } from '../../theme/ThemeContext';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let geoCache: any = null;

export type Sector = { from?: string | null; to?: string | null };
export type Route = { from: string; to: string; count: number };
type AirportsPayload = { airports: Airport[]; routes: Route[] };
type Airport = {
  code: string; name?: string | null; city?: string | null; lat: number; lon: number;
  // The server also sends the ICAO and IATA forms; a sector may name either.
  icao?: string | null; iata?: string | null;
};

/**
 * Every airport in this pilot's logbook, with coordinates.
 *
 * The query holds a plain ARRAY, never the Map. The cache is written to disk
 * with JSON.stringify, and a Map serialises to `{}` — so the first launch
 * worked and every launch after it rehydrated an object with no `.get`, and
 * the memo below died on `coords.get(...)` with "undefined is not a function".
 * That took the whole Logbook tab down in builds 6 and 7.
 *
 * `select` runs after rehydration and is not persisted, so the Map is built
 * fresh each time from data that survives a round trip through JSON.
 */
export function useAirportCoords() {
  const q = useQuery({
    queryKey: ['profile', 'airports'],
    // This is derived from the pilot's own logbook, so it changes the moment
    // they add a flight. A day was far too long: a shape change rode out a
    // whole day of staleness on every device before anything refetched.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AirportsPayload> => {
      const { data } = await api.get('/profile/airports');
      return { airports: data.airports || [], routes: data.routes || [] };
    },
    select: (payload: AirportsPayload) => {
      // An older cache can hold a shape this code cannot read. Saying so is
      // the point: returning an empty Map made the map claim "0 airports ·
      // 200 without coordinates", which is a lie about the pilot's flying.
      // `null` means "nothing usable yet" and the card simply waits.
      if (!payload || !Array.isArray(payload.airports)) return null;
      const map = new Map<string, Airport>();
      const list = payload.airports;
      for (const a of list) {
        if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;   // never 0,0
        for (const k of [a.code, a.icao, a.iata]) {
          if (k) map.set(String(k).toUpperCase(), a);
        }
      }
      return { byCode: map, routes: Array.isArray(payload.routes) ? payload.routes : [] };
    },
  });

  // A cached entry this code cannot read is not "no data yet", it is data
  // that will never become readable — and because the persister rehydrates
  // it with a fresh timestamp, nothing would refetch it until staleTime ran
  // out. Ask once, immediately, which turns any future shape change into a
  // blink instead of a broken screen.
  const unreadable = q.data === null && q.isSuccess;
  const { refetch, isFetching } = q;
  useEffect(() => {
    if (unreadable && !isFetching) void refetch();
  }, [unreadable, isFetching, refetch]);

  return q;
}

export type MapScope = 'all' | 'view';

export default function RouteMap({
  sectors, height = 190, label, explorable = true, scope, onScopeChange,
}: {
  sectors: Sector[]; height?: number; label?: string; explorable?: boolean;
  /** 'all' draws every route ever flown; 'view' follows the page on screen. */
  scope?: MapScope;
  onScopeChange?: (s: MapScope) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { data: air } = useAirportCoords();
  const coords = air?.byCode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [world, setWorld] = useState<any>(geoCache);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (geoCache) return;
    let alive = true;
    fetch(GEO_URL).then((r) => r.json()).then((topo) => {
      geoCache = feature(topo, topo.objects.countries);
      if (alive) setWorld(geoCache);
    }).catch(() => { /* the routes still draw without coastlines */ });
    return () => { alive = false; };
  }, []);

  // All time, or the page on screen. All-time comes from the server as a list
  // of routes with how often each was flown; "this view" is the sectors the
  // list is currently showing, which is all the card ever drew before.
  const loaded = !!air?.byCode;
  const allTime = scope !== 'view' && !!air?.routes?.length;
  const { points, legs, skipped } = useMemo(() => {
    // `select` above always hands over a Map. This guard is for the one case
    // it cannot cover: a build whose cache was written before that change.
    const at = (code?: string | null) =>
      (code && coords instanceof Map ? coords.get(String(code).toUpperCase()) : undefined);
    const seen = new Map<string, { a: Airport; count: number }>();
    const ls: { a: Airport; b: Airport }[] = [];
    let miss = 0;
    const pairs: [string | null | undefined, string | null | undefined][] = allTime
      ? (air?.routes || []).map((r) => [r.from, r.to])
      : (sectors || []).map((s) => [s.from, s.to]);
    for (const [from, to] of pairs) {
      const A = at(from);
      const B = at(to);
      for (const [code, ap] of [[from, A], [to, B]] as [string, Airport | undefined][]) {
        if (!code) continue;
        if (!ap) { miss += 1; continue; }
        const key = ap.code;
        const cur = seen.get(key) || { a: ap, count: 0 };
        cur.count += 1;
        seen.set(key, cur);
      }
      if (A && B) ls.push({ a: A, b: B });
    }
    return { points: [...seen.values()], legs: ls, skipped: miss };
  }, [sectors, coords, air, allTime]);

  const projected = useMemo(() => {
    if (!width || !points.length) return null;
    const pad = 18;
    const mp = { type: 'MultiPoint', coordinates: points.map((p) => [p.a.lon, p.a.lat]) };
    const proj = geoMercator();
    // fitExtent on a single point zooms to infinity; give one sector some room.
    proj.fitExtent([[pad, pad], [width - pad, height - pad]], points.length > 1 ? mp : {
      type: 'MultiPoint',
      coordinates: [[points[0].a.lon - 8, points[0].a.lat - 6], [points[0].a.lon + 8, points[0].a.lat + 6]],
    });
    const path = geoPath(proj);
    return {
      land: world ? path(world) : null,
      pins: points.map((p) => ({ ...p, xy: proj([p.a.lon, p.a.lat]) as [number, number] })),
      lines: legs.map((l) => {
        const a = proj([l.a.lon, l.a.lat]) as [number, number];
        const b = proj([l.b.lon, l.b.lat]) as [number, number];
        return { a, b };
      }),
    };
  }, [width, height, points, legs, world]);

  const open = () => {
    if (!explorable || !points.length) return;
    setPendingMap(sectors || [], label || 'Where you flew', allTime ? 'all' : 'view');
    router.push('/logbook/map');
  };

  // The header is NOT inside the pressable: a button inside a button is
  // invalid on web and swallows the inner tap. Only the map and its footer
  // open the full screen; the scope toggle sits beside them.
  const head = (
    <View style={styles.head}>
      {label ? <Text style={styles.label}>{label}</Text> : <View />}
      {onScopeChange && air?.routes?.length ? (
        <View style={styles.scope}>
          {(['all', 'view'] as MapScope[]).map((sc) => {
            const on = (scope ?? 'all') === sc;
            return (
              <Pressable
                key={sc}
                onPress={() => onScopeChange(sc)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.scopeBtn, on && styles.scopeBtnOn]}
              >
                <Text style={[styles.scopeText, on && styles.scopeTextOn]}>
                  {sc === 'all' ? 'All time' : 'This view'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  const plot = (
    <>
      <View style={[styles.frame, { height }]} pointerEvents="none">
        {width > 0 && projected ? (
          <Svg width={width} height={height}>
            {projected.land ? <Path d={projected.land} fill="#E8EEF6" stroke="#D5DEE9" strokeWidth={0.5} /> : null}
            <G>
              {projected.lines.map((l, i) => (
                <Path key={`l${i}`} d={`M${l.a[0]},${l.a[1]} L${l.b[0]},${l.b[1]}`} stroke="#003F88" strokeWidth={1} strokeOpacity={0.4} fill="none" />
              ))}
              {/* Small filled dots. The hollow rings this used to draw grew
                  with the flight count and swallowed the map at a glance. */}
              {projected.pins.map((p) => (
                <Circle key={p.a.code} cx={p.xy[0]} cy={p.xy[1]} r={2.6} fill="#003F88" />
              ))}
            </G>
          </Svg>
        ) : null}
      </View>

      <View style={styles.foot}>
        <Text style={styles.hint}>
          {!loaded
            ? 'Loading your airports…'
            : points.length === 0 && skipped > 0
              // Every code missed, which means the lookup is empty, not that
              // the pilot flew to two hundred unplaceable airports.
              ? 'Airports could not be loaded'
              : `${points.length} airport${points.length === 1 ? '' : 's'}`
                + (allTime ? ' · all time' : ' · this view')
                + (skipped > 0 ? ` · ${skipped} without coordinates not shown` : '')}
        </Text>
        {explorable && points.length ? (
          <View style={styles.explore}>
            <Text style={styles.exploreText}>Tap to explore</Text>
            <Ionicons name="chevron-forward" size={13} color="#003F88" />
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <View
      style={styles.card}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width - layout.cardPad * 2))}
    >
      {head}
      {explorable && points.length ? (
        <Pressable
          onPress={open}
          style={({ pressed }) => (pressed ? styles.cardPressed : undefined)}
          accessibilityRole="button"
          accessibilityLabel={`${label || 'Where you flew'}, ${points.length} airports. Opens the full map.`}
        >
          {plot}
        </Pressable>
      ) : plot}
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  card: {
    backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line,
    borderRadius: 14, padding: layout.cardPad, marginBottom: layout.cardGap,
  },
  label: {
    fontSize: 11, fontFamily: fontFamilies.bodySemiBold, color: pilot.faint,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  cardPressed: { opacity: 0.85 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: layout.rowGap },
  scope: { flexDirection: 'row', backgroundColor: pilot.cream, borderRadius: 8, padding: 2, borderWidth: 1, borderColor: pilot.line },
  scopeBtn: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  scopeBtnOn: { backgroundColor: pilot.navy },
  scopeText: { fontSize: 11.5, fontFamily: fontFamilies.bodyMedium, color: pilot.muted },
  scopeTextOn: { color: '#fff', fontFamily: fontFamilies.bodySemiBold },
  frame: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#F4F7FB' },
  foot: { marginTop: layout.rowGap, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hint: { flex: 1, fontSize: 12, color: pilot.faint, fontFamily: fontFamilies.body },
  explore: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  exploreText: { fontSize: 12.5, color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },
});
