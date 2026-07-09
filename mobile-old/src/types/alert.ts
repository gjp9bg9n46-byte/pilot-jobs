import type { Job, FilterState } from './job';

export type AlertFrequency = 'INSTANT' | 'DAILY' | 'WEEKLY';

export const FREQUENCY_LABELS: Record<AlertFrequency, string> = {
  INSTANT: 'Instant push',
  DAILY: 'Daily digest',
  WEEKLY: 'Weekly digest',
};

export type MatchBreakdown = {
  matched: string[];
  missing: string[];
  marginal: string[];
};

export type JobAlert = {
  id: string;
  pilotId: string;
  jobId: string;
  matchScore: number;
  breakdown: MatchBreakdown | null;
  notifiedAt: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  job: Job;
};

export type SavedSearch = {
  id: string;
  pilotId: string;
  name: string;
  filters: FilterState;
  frequency: AlertFrequency;
  paused: boolean;
  newMatchCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AlertFilter = 'all' | 'unread' | 'saved' | 'dismissed';
export type AlertSort = 'newest' | 'score' | 'deadline';

export const ALERT_FILTER_LABELS: Record<AlertFilter, string> = {
  all: 'All',
  unread: 'Unread',
  saved: 'Saved',
  dismissed: 'Dismissed',
};

export const ALERT_SORT_LABELS: Record<AlertSort, string> = {
  newest: 'Newest',
  score: 'Highest match',
  deadline: 'Closest deadline',
};

export type AlertSection = {
  title: string;
  data: JobAlert[];
  unreadCount: number;
};

export function groupAlertsByDate(alerts: JobAlert[]): AlertSection[] {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - 7 * 86400000);

  const buckets: Record<string, JobAlert[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: [],
  };

  for (const a of alerts) {
    const d = new Date(a.createdAt);
    if (d >= startOfToday) buckets['Today'].push(a);
    else if (d >= startOfYesterday) buckets['Yesterday'].push(a);
    else if (d >= startOfWeek) buckets['This Week'].push(a);
    else buckets['Earlier'].push(a);
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([title, items]) => ({
      title,
      data: items,
      unreadCount: items.filter((a) => !a.readAt).length,
    }));
}
