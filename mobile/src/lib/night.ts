// Night-time auto-compute — ported line-for-line from computeNightHours in
// frontend/src/pages/Logbook.jsx. Samples the great-circle-interpolated position
// every minute along the flight and counts minutes where the sun is below the
// civil-twilight threshold (6° below horizon, per EASA Part-FCL / ICAO Annex 2).
import SunCalc from 'suncalc';
import airportsData from '../data/airports.json';
import { timeToMinutes } from './logbook';

const AIRPORTS = airportsData as Record<string, { lat: number; lon: number }>;
const CIVIL_TWILIGHT_RAD = (-6 * Math.PI) / 180;

export function computeNightHours(
  dateStr: string,
  takeoffHHMM: string,
  landingHHMM: string,
  depICAO: string,
  arrICAO: string,
): number | null {
  const dep = AIRPORTS[(depICAO || '').toUpperCase()];
  const arr = AIRPORTS[(arrICAO || '').toUpperCase()];
  const toffMin = timeToMinutes(takeoffHHMM);
  const landMin = timeToMinutes(landingHHMM);
  if (!dep || !arr || toffMin === null || landMin === null) return null;

  const base = new Date(dateStr + 'T00:00:00Z').getTime();
  const toffMs = base + toffMin * 60000;
  let landMs = base + landMin * 60000;
  if (landMs <= toffMs) landMs += 86400000; // midnight crossing

  const durationMs = landMs - toffMs;
  if (durationMs === 0) return 0;

  let nightCount = 0;
  let total = 0;
  for (let t = toffMs; t <= landMs; t += 60000) {
    const frac = (t - toffMs) / durationMs;
    const lat = dep.lat + frac * (arr.lat - dep.lat);
    const lon = dep.lon + frac * (arr.lon - dep.lon);
    if (SunCalc.getPosition(new Date(t), lat, lon).altitude < CIVIL_TWILIGHT_RAD) nightCount++;
    total++;
  }
  return parseFloat(((nightCount / total) * (durationMs / 3600000)).toFixed(2));
}

// True when both airports are known + both times present (auto-compute possible).
export function nightComputable(dateStr: string, takeoff: string, landing: string, dep: string, arr: string): boolean {
  return !!(dateStr && takeoff && landing && dep && arr && AIRPORTS[(dep || '').toUpperCase()] && AIRPORTS[(arr || '').toUpperCase()]);
}
