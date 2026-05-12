import { store } from '../store';
import type { DateFormat } from '../types/settings';

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}yr ago`;
}

export function formatSalary(
  min?: number | null,
  max?: number | null,
  currency?: string | null,
  period?: string | null,
): string {
  if (!min && !max) return '';
  const cur = currency ?? 'USD';
  const per = period ?? 'year';
  const perLabel = per === 'year' ? '/yr' : per === 'month' ? '/mo' : `/${per}`;
  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 0)}k` : String(n);
  if (min && max) return `${cur} ${fmt(min)}–${fmt(max)}${perLabel}`;
  if (max) return `Up to ${cur} ${fmt(max)}${perLabel}`;
  return `From ${cur} ${fmt(min!)}${perLabel}`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';

  const fmt: DateFormat = (store.getState() as any).ui?.dateFormat ?? 'auto';

  if (fmt === 'auto') {
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  if (fmt === 'DD/MM/YYYY') return `${dd}/${m}/${y}`;
  if (fmt === 'MM/DD/YYYY') return `${m}/${dd}/${y}`;
  return `${y}-${m}-${dd}`;
}

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string; color: string; suggestion: string } {
  if (!pw) return { score: 0, label: '', color: '#243050', suggestion: '' };

  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;

  const levels: { label: string; color: string; suggestion: string }[] = [
    { label: 'Very weak',  color: '#FF4757', suggestion: 'Use at least 8 characters.' },
    { label: 'Weak',       color: '#FF6348', suggestion: 'Try adding uppercase letters.' },
    { label: 'Fair',       color: '#F5A524', suggestion: 'Add numbers and symbols.' },
    { label: 'Strong',     color: '#2ED573', suggestion: 'Great! Try making it even longer.' },
    { label: 'Very strong', color: '#00B4D8', suggestion: 'Excellent password.' },
  ];
  return { score: score as 0 | 1 | 2 | 3 | 4, ...levels[score] };
}
