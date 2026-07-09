// Airline factfile formatting — mirrored from frontend/src/pages/Airlines.jsx +
// AirlineDetail.jsx.
import { semantic } from '../theme/tokens';

export const REGIONS = ['Europe', 'Americas', 'Asia-Pacific', 'Middle East', 'Africa'];
export const HIRING_STATUSES: [string, string][] = [
  ['', 'All Statuses'], ['ACTIVELY_HIRING', 'Actively Hiring'], ['OCCASIONAL', 'Occasional'], ['PAUSED', 'Paused'], ['UNKNOWN', 'Unknown'],
];
export const SORT_OPTIONS: [string, string][] = [
  ['name', 'Name (A–Z)'], ['lastUpdated', 'Recently Updated'], ['hiringStatus', 'Hiring Status'],
];

export function hiringMeta(status: string): { label: string; fg: string; bg: string } {
  const map: Record<string, { label: string; fg: string; bg: string }> = {
    ACTIVELY_HIRING: { label: 'Actively Hiring', fg: semantic.success, bg: semantic.successBg },
    OCCASIONAL: { label: 'Occasional', fg: semantic.warning, bg: semantic.warningBg },
    PAUSED: { label: 'Paused', fg: semantic.error, bg: semantic.errorBg },
    UNKNOWN: { label: 'Unknown', fg: '#5A5F66', bg: '#F1F1F1' },
  };
  return map[status] || map.UNKNOWN;
}

export function hiringFreqLabel(v: string): string | null {
  return ({ CONTINUOUS: 'Continuous', PERIODIC: 'Periodic', RARE: 'Rare', UNKNOWN: null } as Record<string, string | null>)[v] || null;
}

export function contractLabel(v: string): string {
  return ({ PERMANENT: 'Permanent', FIXED_TERM: 'Fixed Term', AGENCY: 'Agency', PAY_TO_FLY: 'Pay-to-Fly', MIXED: 'Mixed' } as Record<string, string>)[v] || v;
}

export function relativeDate(d: string | Date): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

export const EMPTY_FIELD = 'Not yet contributed — be the first to share.';
