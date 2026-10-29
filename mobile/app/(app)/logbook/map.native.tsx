// ── Where you flew, full screen ─────────────────────────────────────────────
// Apple Maps on iOS, Google on Android — both through react-native-maps, which
// means pinch, pan and double-tap come from the platform rather than from
// gesture handlers of our own. No API key is needed on iOS.
//
// What is ours: which airports to draw, how to group them when the map is
// zoomed out, and the great-circle line between the two ends of each sector.
// An airport we cannot place is skipped rather than drawn at 0,0 — a pin in
// the Atlantic off Ghana is worse than no pin.
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, Region } from 'react-native-maps';
import { useAirportCoords, type Sector } from '../../../src/components/logbook/RouteMap';
import { getPendingMap } from '../../../src/lib/pendingMap';
import { fontFamilies, fontSizes, layout, spacing } from '../../../src/theme/tokens';
import { ThemePalette, useThemedStyles } from '../../../src/theme/ThemeContext';

const NAVY = '#003F88';
type Airport = { code: string; name?: string | null; city?: string | null; lat: number; lon: number };
type Leg = { a: Airport; b: Airport; count: number };

// ── Great circle ────────────────────────────────────────────────────────────
// The `geodesic` prop on Polyline is Google-only, so the curve is computed
// here and both platforms draw the same line. Spherical interpolation between
// the two ends; 48 points is smooth at any zoom a phone can show.
const RAD = Math.PI / 180;
function greatCircle(a: Airport, b: Airport, steps = 48) {
  const φ1 = a.lat * RAD; const λ1 = a.lon * RAD;
  const φ2 = b.lat * RAD; const λ2 = b.lon * RAD;
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
  ));
  if (!Number.isFinite(d) || d === 0) return [{ latitude: a.lat, longitude: a.lon }];
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push({
      latitude: Math.atan2(z, Math.sqrt(x * x + y * y)) / RAD,
      longitude: Math.atan2(y, x) / RAD,
    });
  }
  return out;
}

// ── Clustering ──────────────────────────────────────────────────────────────
// No library: a grid whose cell size follows the zoom. Zoomed out, airports in
// the same cell become one dot with a count; zoom in and the cell shrinks
// until each has its own. Deterministic, and it costs one pass over ~60 points.
type Cluster = { key: string; lat: number; lon: number; members: { a: Airport; count: number }[] };
function clusterise(points: { a: Airport; count: number }[], region: Region | null): Cluster[] {
  // Below this the map is close enough that every airport stands alone.
  const span = region ? Math.max(region.latitudeDelta, region.longitudeDelta) : 60;
  if (span < 1.5) {
    return points.map((p) => ({ key: p.a.code, lat: p.a.lat, lon: p.a.lon, members: [p] }));
  }
  const cell = span / 7;
  const cells = new Map<string, Cluster>();
  for (const p of points) {
    const key = `${Math.round(p.a.lat / cell)}:${Math.round(p.a.lon / cell)}`;
    const cur = cells.get(key);
    if (cur) cur.members.push(p);
    else cells.set(key, { key, lat: p.a.lat, lon: p.a.lon, members: [p] });
  }
  // A cluster sits at the mean of what it holds, not on its first member.
  return [...cells.values()].map((c) => ({
    ...c,
    lat: c.members.reduce((s, m) => s + m.a.lat, 0) / c.members.length,
    lon: c.members.reduce((s, m) => s + m.a.lon, 0) / c.members.length,
  }));
}

export default function FullScreenMap() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { data: air } = useAirportCoords();
  const coords = air?.byCode;
  const { sectors, label } = useMemo(() => getPendingMap(), []);
  const mapRef = useRef<MapView | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [picked, setPicked] = useState<Cluster | null>(null);

  // The full map opens on EVERYTHING the pilot has flown, not on the page of
  // the logbook that happened to be on screen — the card is the view of the
  // page, this is the view of the career. The server sends every route with
  // how often it was flown; the page's sectors are only a fallback for an
  // older backend that does not send them.
  const { points, legs } = useMemo(() => {
    const at = (code?: string | null) =>
      (code && coords instanceof Map ? coords.get(String(code).toUpperCase()) : undefined);
    const seen = new Map<string, { a: Airport; count: number }>();
    const legMap = new Map<string, Leg>();
    const add = (A?: Airport, B?: Airport, count = 1) => {
      for (const ap of [A, B]) {
        if (!ap) continue;
        const cur = seen.get(ap.code) || { a: ap, count: 0 };
        cur.count += count;
        seen.set(ap.code, cur);
      }
      if (A && B && A.code !== B.code) {
        // One route, whichever way round it was flown.
        const key = [A.code, B.code].sort().join('-');
        const cur = legMap.get(key);
        if (cur) cur.count += count;
        else legMap.set(key, { a: A, b: B, count });
      }
    };
    const routes = air?.routes || [];
    if (routes.length) for (const r of routes) add(at(r.from), at(r.to), r.count);
    else for (const s of (sectors || []) as Sector[]) add(at(s.from), at(s.to));
    return { points: [...seen.values()], legs: [...legMap.values()] };
  }, [sectors, coords, air]);

  const clusters = useMemo(() => clusterise(points, region), [points, region]);

  // Open on everything in view, which is the only sensible first frame.
  const fitAll = useCallback(() => {
    if (!mapRef.current || !points.length) return;
    mapRef.current.fitToCoordinates(
      points.map((p) => ({ latitude: p.a.lat, longitude: p.a.lon })),
      { edgePadding: { top: 120, right: 70, bottom: 150, left: 70 }, animated: false },
    );
  }, [points]);

  const chosen = picked && picked.members.length === 1 ? picked.members[0] : null;

  return (
    <View style={styles.fill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        onMapReady={fitAll}
        onRegionChangeComplete={setRegion}
        onPress={() => setPicked(null)}
        rotateEnabled={false}
        pitchEnabled={false}
        showsPointsOfInterests={false}
        showsTraffic={false}
        toolbarEnabled={false}
      >
        {legs.map((l) => (
          <Polyline
            key={`${l.a.code}-${l.b.code}`}
            coordinates={greatCircle(l.a, l.b)}
            // Flown once: thinner and lighter, so the routes a pilot actually
            // works stand out from the one-off positioning sector.
            strokeColor={l.count > 1 ? 'rgba(0,63,136,0.55)' : 'rgba(0,63,136,0.22)'}
            strokeWidth={l.count > 1 ? 1.8 : 1}
          />
        ))}
        {clusters.map((c) => {
          const flights = c.members.reduce((s, m) => s + m.count, 0);
          const many = c.members.length > 1;
          return (
            <Marker
              key={c.key}
              coordinate={{ latitude: c.lat, longitude: c.lon }}
              onPress={() => setPicked(c)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View
                style={many ? undefined : styles.pinHit}
                accessibilityLabel={many
                  ? `${c.members.length} airports, ${flights} flights`
                  : `${c.members[0].a.code}, ${flights} flights`}
              >
                {many
                  ? <View style={styles.cluster}><Text style={styles.clusterText}>{c.members.length}</Text></View>
                  : <View style={styles.pin} />}
              </View>
            </Marker>
          );
        })}
      </MapView>

      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <Pressable style={styles.close} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close the map">
          <Ionicons name="close" size={22} color={NAVY} />
        </Pressable>
        <View style={styles.titlePill}>
          <Text style={styles.title}>{air?.routes?.length ? 'Everywhere you have flown' : label}</Text>
        </View>
        <Pressable style={styles.close} onPress={fitAll} accessibilityRole="button" accessibilityLabel="Fit every airport">
          <Ionicons name="scan-outline" size={20} color={NAVY} />
        </Pressable>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.bottom} pointerEvents="box-none">
        <View style={styles.card}>
          {chosen ? (
            <>
              <Text style={styles.cardCode}>{chosen.a.code}</Text>
              <Text style={styles.cardName} numberOfLines={2}>
                {chosen.a.name || chosen.a.city || ''}
              </Text>
              <Text style={styles.cardMeta}>
                {chosen.count} {chosen.count === 1 ? 'flight' : 'flights'}
              </Text>
            </>
          ) : picked ? (
            <>
              <Text style={styles.cardCode}>{picked.members.length} airports</Text>
              <Text style={styles.cardName} numberOfLines={2}>
                {picked.members.map((m) => m.a.code).join(' · ')}
              </Text>
              <Text style={styles.cardMeta}>Zoom in to separate them</Text>
            </>
          ) : (
            <Text style={styles.cardMeta}>
              {points.length} airport{points.length === 1 ? '' : 's'} · {legs.length} route{legs.length === 1 ? '' : 's'} · tap a pin
            </Text>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  fill: { flex: 1, backgroundColor: pilot.cream },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: layout.screenX, gap: spacing.sm,
  },
  close: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: pilot.surface,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm,
    shadowColor: '#0F1B2D', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  titlePill: {
    marginTop: spacing.sm, paddingHorizontal: 14, height: 34, borderRadius: 17,
    backgroundColor: pilot.surface, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0F1B2D', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  title: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, color: pilot.ink },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: layout.screenX },
  card: {
    backgroundColor: pilot.surface, borderRadius: 14, padding: layout.cardPad, gap: 2,
    shadowColor: '#0F1B2D', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  cardCode: { fontFamily: fontFamilies.display, fontSize: fontSizes.xl, color: pilot.ink },
  cardName: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted },
  cardMeta: { fontFamily: fontFamilies.body, fontSize: fontSizes.sm, color: pilot.faint },
  // A finger is not 7 points across, so the dot sits inside a bigger target.
  pinHit: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  pin: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: NAVY,
    borderWidth: 1.5, borderColor: '#fff',
  },
  cluster: {
    minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 5,
    backgroundColor: NAVY, borderWidth: 1.5, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  clusterText: { color: '#fff', fontFamily: fontFamilies.bodySemiBold, fontSize: 11 },
});