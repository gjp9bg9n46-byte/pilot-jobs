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
// Gestures: pinch to zoom, TWO fingers to pan. One finger is left to the page,
// so the map never traps a scroll. Both worklets are pure arithmetic and the
// only hop to JS is through runOnJS — the rule from the SIGABRT fix.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
// @ts-ignore — pure-JS lib, no bundled types
import { geoMercator, geoPath } from 'd3-geo';
// @ts-ignore — pure-JS lib, no bundled types
import { feature } from 'topojson-client';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { TIMING_BASE } from '../../theme/motion';
import { fontFamilies, layout, spacing } from '../../theme/tokens';
import { ThemePalette, useThemedStyles } from '../../theme/ThemeContext';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let geoCache: any = null;

export type Sector = { from?: string | null; to?: string | null };
type Airport = { code: string; name?: string | null; city?: string | null; lat: number; lon: number };

/** Every airport in this pilot's logbook, with coordinates. Cached. */
export function useAirportCoords() {
  return useQuery({
    queryKey: ['profile', 'airports'],
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await api.get('/profile/airports');
      const map = new Map<string, Airport>();
      for (const a of data.airports || []) {
        if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;   // never 0,0
        for (const k of [a.code, a.icao, a.iata]) if (k) map.set(String(k).toUpperCase(), a);
      }
      return map;
    },
  });
}

export default function RouteMap({
  sectors, height = 190, label,
}: { sectors: Sector[]; height?: number; label?: string }) {
  const styles = useThemedStyles(createStyles);
  const { data: coords } = useAirportCoords();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [world, setWorld] = useState<any>(geoCache);
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (geoCache) return;
    let alive = true;
    fetch(GEO_URL).then((r) => r.json()).then((topo) => {
      geoCache = feature(topo, topo.objects.countries);
      if (alive) setWorld(geoCache);
    }).catch(() => { /* the routes still draw without coastlines */ });
    return () => { alive = false; };
  }, []);

  // Which airports are on screen, how many flights touched each, and the legs.
  const { points, legs, skipped } = useMemo(() => {
    const seen = new Map<string, { a: Airport; count: number }>();
    const ls: { a: Airport; b: Airport }[] = [];
    let miss = 0;
    for (const s of sectors || []) {
      const A = s.from && coords?.get(String(s.from).toUpperCase());
      const B = s.to && coords?.get(String(s.to).toUpperCase());
      for (const [code, ap] of [[s.from, A], [s.to, B]] as [string, Airport | undefined][]) {
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
  }, [sectors, coords]);

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

  // Pinch to zoom; two fingers to pan. One finger belongs to the page.
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = Math.min(6, Math.max(1, saved.value * e.scale)); })
    .onEnd(() => { saved.value = scale.value; });
  const pan = Gesture.Pan()
    .minPointers(2)
    .onUpdate((e) => { tx.value = sx.value + e.translationX; ty.value = sy.value + e.translationY; })
    .onEnd(() => { sx.value = tx.value; sy.value = ty.value; });
  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    scale.value = withTiming(1, TIMING_BASE); saved.value = 1;
    tx.value = withTiming(0, TIMING_BASE); ty.value = withTiming(0, TIMING_BASE);
    sx.value = 0; sy.value = 0;
    runOnJS(setPicked)(null);
  });
  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);
  const mapStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const chosen = picked ? points.find((p) => p.a.code === picked) : null;

  return (
    <View style={styles.card} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.frame, { height }]}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[{ width: '100%', height }, mapStyle]}>
            {width > 0 && projected ? (
              <Svg width={width} height={height}>
                {projected.land ? <Path d={projected.land} fill="#E8EEF6" stroke="#D5DEE9" strokeWidth={0.5} /> : null}
                <G>
                  {projected.lines.map((l, i) => (
                    <Path key={`l${i}`} d={`M${l.a[0]},${l.a[1]} L${l.b[0]},${l.b[1]}`} stroke="#003F88" strokeWidth={1.2} strokeOpacity={0.55} fill="none" />
                  ))}
                  {projected.pins.map((p) => (
                    <Circle
                      key={p.a.code}
                      cx={p.xy[0]} cy={p.xy[1]}
                      r={Math.min(7, 3 + Math.log2(p.count + 1))}
                      fill={picked === p.a.code ? '#003F88' : '#fff'}
                      stroke="#003F88" strokeWidth={1.6}
                    />
                  ))}
                </G>
              </Svg>
            ) : null}
            {/* Tap targets sit over the pins, not on them: an SVG circle is a
                few pixels across, and a finger is not. */}
            {projected ? projected.pins.map((p) => (
              <Pressable
                key={`t${p.a.code}`}
                accessibilityRole="button"
                accessibilityLabel={`${p.a.code}, ${p.count} flights`}
                onPress={() => setPicked(picked === p.a.code ? null : p.a.code)}
                style={{ position: 'absolute', left: p.xy[0] - 22, top: p.xy[1] - 22, width: 44, height: 44 }}
              />
            )) : null}
          </Animated.View>
        </GestureDetector>
      </View>

      {chosen ? (
        <Pressable style={styles.pick} onPress={() => setPicked(null)}>
          <Text style={styles.pickCode}>{chosen.a.code}</Text>
          <Text style={styles.pickName} numberOfLines={1}>
            {chosen.a.city || chosen.a.name || ''} · {chosen.count} {chosen.count === 1 ? 'flight' : 'flights'}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.hint}>
          {points.length} airport{points.length === 1 ? '' : 's'} · tap a pin
          {skipped > 0 ? ` · ${skipped} without coordinates not shown` : ''}
        </Text>
      )}
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
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: layout.rowGap,
  },
  frame: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#F4F7FB' },
  hint: { marginTop: layout.rowGap, fontSize: 12, color: pilot.faint, fontFamily: fontFamilies.body },
  pick: { marginTop: layout.rowGap, flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  pickCode: { fontFamily: fontFamilies.mono, fontSize: 14, color: pilot.ink },
  pickName: { flex: 1, fontSize: 12.5, color: pilot.muted, fontFamily: fontFamilies.body },
});
