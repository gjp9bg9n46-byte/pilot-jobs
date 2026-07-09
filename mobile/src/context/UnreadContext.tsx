// Shared unread-alerts count for the header bell + drawer "Alerts" badge + the
// Alerts screen's Matches tab badge. Kept in one place so "Mark all read" on the
// Alerts screen can drop every badge to 0 optimistically and then re-sync.
//
// Source: GET /jobs/alerts/unread-count → `unread` counts ONLY unread alerts
// for jobs the pilot fully qualifies for (every specified requirement met,
// strict server-side check). Jobs with no specified requirements don't count
// toward the badge — they live in the Alerts "No requirements" chip.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';

type UnreadValue = { unread: number; setUnread: (n: number) => void; refresh: () => Promise<void> };

const UnreadContext = createContext<UnreadValue>({ unread: 0, setUnread: () => {}, refresh: async () => {} });

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { accountType, token } = useAuth();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    // Only fetch for a fully-hydrated pilot. A transient null accountType during
    // auth hydration must NOT zero the badge (that caused a stuck-at-0 race).
    if (accountType !== 'pilot') return;
    try {
      const { data } = await api.get('/jobs/alerts/unread-count');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = data;
      setUnread(typeof d?.unread === 'number' ? d.unread : 0);
    } catch {
      /* best-effort — leave the last known count */
    }
  }, [accountType]);

  // Re-run once token AND accountType have both hydrated to a pilot session.
  useEffect(() => { if (token && accountType === 'pilot') refresh(); }, [token, accountType, refresh]);

  return <UnreadContext.Provider value={{ unread, setUnread, refresh }}>{children}</UnreadContext.Provider>;
}

export const useUnread = () => useContext(UnreadContext);
