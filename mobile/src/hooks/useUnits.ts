import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import type { AltitudeUnit, DistanceUnit, WindSpeedUnit } from '../types/settings';

export function useUnits() {
  const ui = useSelector((s: RootState) => (s as any).ui);

  const altUnit:   AltitudeUnit  = ui?.altitudeUnit  ?? 'ft';
  const distUnit:  DistanceUnit  = ui?.distanceUnit  ?? 'nm';
  const windUnit:  WindSpeedUnit = ui?.windSpeedUnit  ?? 'kt';

  const formatAlt = (ft: number) => {
    if (altUnit === 'm') return `${Math.round(ft * 0.3048)} m`;
    return `${Math.round(ft).toLocaleString()} ft`;
  };

  const formatDist = (nm: number) => {
    if (distUnit === 'km') return `${(nm * 1.852).toFixed(0)} km`;
    if (distUnit === 'mi') return `${(nm * 1.15078).toFixed(0)} mi`;
    return `${nm.toFixed(0)} nm`;
  };

  const formatWind = (kt: number) => {
    if (windUnit === 'm/s') return `${(kt * 0.514444).toFixed(1)} m/s`;
    if (windUnit === 'km/h') return `${(kt * 1.852).toFixed(0)} km/h`;
    return `${kt} kt`;
  };

  return { altUnit, distUnit, windUnit, formatAlt, formatDist, formatWind };
}
